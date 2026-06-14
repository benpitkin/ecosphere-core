import { createAdminClient } from "@/lib/supabase/admin";

// Xero (Accounting API) OAuth2 client. Core is the *bridge*: it connects to the
// Xero org, raises draft invoices from won jobs, and reads invoice status. All
// calls are Core->Xero outbound (or browser-driven OAuth), so it works behind
// Vercel's Standard Protection. Tokens live in the service-role-only
// xero_connections table.
//
// Env (Vercel): XERO_CLIENT_ID, XERO_CLIENT_SECRET.

const AUTHORIZE_URL = "https://login.xero.com/identity/connect/authorize";
const TOKEN_URL = "https://identity.xero.com/connect/token";
const CONNECTIONS_URL = "https://api.xero.com/connections";
export const XERO_API = "https://api.xero.com/api.xro/2.0";
// Only what Core uses: write invoices, read/write contacts, refresh tokens.
// Granular scopes (NOT the broad accounting.transactions): this Xero app was
// created after 2 Mar 2026, so the broad scope is invalid_scope — apps from then
// on must use granular scopes. accounting.invoices covers creating invoices.
const SCOPES = "accounting.invoices accounting.contacts offline_access";

export function xeroConfigured(): boolean {
  return Boolean(process.env.XERO_CLIENT_ID && process.env.XERO_CLIENT_SECRET);
}

// The OAuth callback URL, built from the public host the user actually hit
// (x-forwarded-host on Vercel — NOT request.url, which can resolve to an
// internal/deployment host). connect and callback both use this so the
// authorize redirect_uri and the token-exchange redirect_uri are identical and
// match the URI registered in the Xero app.
export function callbackRedirectUri(request: Request): string {
  const h = request.headers;
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? new URL(request.url).host;
  const proto = h.get("x-forwarded-proto") ?? "https";
  return `${proto}://${host}/api/xero/callback`;
}

function basicAuth(): string {
  return Buffer.from(`${process.env.XERO_CLIENT_ID}:${process.env.XERO_CLIENT_SECRET}`).toString("base64");
}

export function authorizeUrl(state: string, redirectUri: string): string {
  const p = new URLSearchParams({
    response_type: "code",
    client_id: process.env.XERO_CLIENT_ID ?? "",
    redirect_uri: redirectUri,
    state,
  });
  // Append scope separately so the spaces encode as %20 (URLSearchParams would
  // use "+", which Xero rejects with invalid_scope).
  return `${AUTHORIZE_URL}?${p.toString()}&scope=${encodeURIComponent(SCOPES)}`;
}

type TokenSet = { access_token: string; refresh_token: string; expires_in: number };

async function tokenRequest(body: Record<string, string>): Promise<TokenSet> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: `Basic ${basicAuth()}` },
    body: new URLSearchParams(body).toString(),
  });
  if (!res.ok) throw new Error(`Xero token request failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

export async function exchangeCode(code: string, redirectUri: string): Promise<TokenSet> {
  return tokenRequest({ grant_type: "authorization_code", code, redirect_uri: redirectUri });
}

export async function getConnections(accessToken: string): Promise<{ tenantId: string; tenantName: string }[]> {
  const res = await fetch(CONNECTIONS_URL, { headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" } });
  if (!res.ok) throw new Error(`Xero connections failed (${res.status})`);
  const rows = (await res.json()) as any[];
  return rows.map((r) => ({ tenantId: r.tenantId, tenantName: r.tenantName }));
}

type Admin = ReturnType<typeof createAdminClient>;

// Persist tokens + the chosen tenant as the single connection row.
export async function saveConnection(
  admin: Admin,
  t: TokenSet,
  tenant: { tenantId: string; tenantName: string }
): Promise<void> {
  await admin.from("xero_connections").upsert({
    id: 1,
    tenant_id: tenant.tenantId,
    tenant_name: tenant.tenantName,
    access_token: t.access_token,
    refresh_token: t.refresh_token,
    expires_at: new Date(Date.now() + (t.expires_in - 60) * 1000).toISOString(),
    connected_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }, { onConflict: "id" });
}

export type XeroStatus = { connected: boolean; tenantName?: string | null };
export async function getStatus(admin: Admin): Promise<XeroStatus> {
  const { data } = await admin.from("xero_connections").select("tenant_id, tenant_name").eq("id", 1).maybeSingle();
  return { connected: Boolean(data?.tenant_id), tenantName: data?.tenant_name ?? null };
}

// Returns a valid access token + tenant id, refreshing (and persisting) if the
// stored token has expired. Throws if Xero isn't connected.
export async function getValidToken(admin: Admin): Promise<{ accessToken: string; tenantId: string }> {
  const { data: conn } = await admin.from("xero_connections").select("*").eq("id", 1).maybeSingle();
  if (!conn?.refresh_token || !conn.tenant_id) throw new Error("Xero is not connected.");
  const expired = !conn.expires_at || new Date(conn.expires_at).getTime() <= Date.now();
  if (!expired) return { accessToken: conn.access_token, tenantId: conn.tenant_id };

  const t = await tokenRequest({ grant_type: "refresh_token", refresh_token: conn.refresh_token });
  await admin.from("xero_connections").update({
    access_token: t.access_token,
    refresh_token: t.refresh_token,
    expires_at: new Date(Date.now() + (t.expires_in - 60) * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  }).eq("id", 1);
  return { accessToken: t.access_token, tenantId: conn.tenant_id };
}

// Authenticated call to the Xero Accounting API (adds Bearer + tenant header).
export async function xeroApi(admin: Admin, path: string, init?: RequestInit): Promise<Response> {
  const { accessToken, tenantId } = await getValidToken(admin);
  return fetch(`${XERO_API}${path}`, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      Authorization: `Bearer ${accessToken}`,
      "Xero-tenant-id": tenantId,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
  });
}

const xeroWhere = (s: string) => encodeURIComponent(s);

// Find a Xero contact by exact name, else create it. Returns the ContactID.
export async function findOrCreateContact(admin: Admin, opts: { name: string; email?: string | null }): Promise<string> {
  const safeName = opts.name.replace(/"/g, "");
  const found = await xeroApi(admin, `/Contacts?where=${xeroWhere(`Name=="${safeName}"`)}`);
  if (found.ok) {
    const j = await found.json();
    if (j.Contacts?.length) return j.Contacts[0].ContactID;
  }
  const body = { Contacts: [{ Name: opts.name, ...(opts.email ? { EmailAddress: opts.email } : {}) }] };
  const res = await xeroApi(admin, `/Contacts`, { method: "POST", body: JSON.stringify(body) });
  const j = await res.json();
  if (!res.ok || !j.Contacts?.length) throw new Error(`Xero contact create failed: ${JSON.stringify(j).slice(0, 200)}`);
  return j.Contacts[0].ContactID;
}

// First revenue/sales account code, so draft invoice lines are complete enough
// to approve. Undefined if none found — the line is still created (office sets it).
export async function defaultSalesAccountCode(admin: Admin): Promise<string | undefined> {
  const res = await xeroApi(admin, `/Accounts?where=${xeroWhere(`Class=="REVENUE"`)}`);
  if (!res.ok) return undefined;
  const j = await res.json();
  const accts = (j.Accounts ?? []) as any[];
  return (accts.find((a) => a.Type === "SALES" && a.Code) ?? accts.find((a) => a.Code))?.Code;
}

export type InvoiceSummary = { id: string; number: string | null; status: string; total: number; ref: string | null };
function summarise(inv: any): InvoiceSummary {
  return { id: inv.InvoiceID, number: inv.InvoiceNumber ?? null, status: inv.Status, total: Number(inv.Total ?? 0), ref: inv.Reference ?? null };
}

// Look up an existing invoice by our Reference (so we never duplicate, and can
// reflect live status). Returns null if none.
export async function getInvoiceByReference(admin: Admin, reference: string): Promise<InvoiceSummary | null> {
  const res = await xeroApi(admin, `/Invoices?where=${xeroWhere(`Reference=="${reference.replace(/"/g, "")}"`)}`);
  if (!res.ok) return null;
  const j = await res.json();
  return j.Invoices?.length ? summarise(j.Invoices[0]) : null;
}

export type DraftLine = { description: string; qty: number; unitAmount: number };
export async function createDraftInvoice(
  admin: Admin,
  opts: { contactId: string; reference: string; lineItems: DraftLine[]; accountCode?: string }
): Promise<InvoiceSummary> {
  const inv = {
    Type: "ACCREC",
    Contact: { ContactID: opts.contactId },
    Status: "DRAFT",
    Reference: opts.reference,
    LineItems: opts.lineItems.map((li) => ({
      Description: li.description,
      Quantity: li.qty,
      UnitAmount: li.unitAmount,
      ...(opts.accountCode ? { AccountCode: opts.accountCode } : {}),
    })),
  };
  const res = await xeroApi(admin, `/Invoices`, { method: "POST", body: JSON.stringify({ Invoices: [inv] }) });
  const j = await res.json();
  if (!res.ok || !j.Invoices?.length) throw new Error(`Xero invoice create failed: ${JSON.stringify(j).slice(0, 300)}`);
  return summarise(j.Invoices[0]);
}

// Deep link to an invoice in Xero.
export function xeroInvoiceUrl(invoiceId: string): string {
  return `https://go.xero.com/app/invoicing/view/${invoiceId}`;
}

// Stable, human-readable invoice Reference tying a Xero invoice to a Core job.
// Used to both tag the invoice and look it up (so we never duplicate).
export function jobInvoiceReference(dealId: string): string {
  return `Core job ${dealId.slice(0, 8).toUpperCase()}`;
}
