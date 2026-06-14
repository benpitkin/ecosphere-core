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
const SCOPES = "openid profile email accounting.transactions accounting.contacts offline_access";

export function xeroConfigured(): boolean {
  return Boolean(process.env.XERO_CLIENT_ID && process.env.XERO_CLIENT_SECRET);
}

function basicAuth(): string {
  return Buffer.from(`${process.env.XERO_CLIENT_ID}:${process.env.XERO_CLIENT_SECRET}`).toString("base64");
}

export function authorizeUrl(state: string, redirectUri: string): string {
  const p = new URLSearchParams({
    response_type: "code",
    client_id: process.env.XERO_CLIENT_ID ?? "",
    redirect_uri: redirectUri,
    scope: SCOPES,
    state,
  });
  return `${AUTHORIZE_URL}?${p.toString()}`;
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
