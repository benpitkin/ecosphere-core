// =============================================================================
// GoHighLevel (LeadConnector) API client — server-side only.
// =============================================================================
// Reads credentials from environment (never the browser):
//   GHL_API_KEY      — a Private Integration token or location API key
//   GHL_LOCATION_ID  — the GHL location (sub-account) id
//   GHL_API_BASE     — optional override (default services.leadconnectorhq.com)
//
// This is the read side of the sync: it pulls contacts and opportunities so the
// CRM can mirror them into Supabase. It does NOT write back to GHL.
// Docs: https://highlevel.stoplight.io/docs/integrations
// =============================================================================

const BASE = process.env.GHL_API_BASE || "https://services.leadconnectorhq.com";
const VERSION = "2021-07-28";

export function ghlConfigured() {
  return Boolean(process.env.GHL_API_KEY && process.env.GHL_LOCATION_ID);
}

function headers() {
  return {
    Authorization: `Bearer ${process.env.GHL_API_KEY}`,
    Version: VERSION,
    Accept: "application/json",
  };
}

export interface GhlContact {
  id: string;
  firstName?: string;
  lastName?: string;
  contactName?: string;
  email?: string;
  phone?: string;
  address1?: string;
  postalCode?: string;
  source?: string;
  tags?: string[];
}

export interface GhlOpportunity {
  id: string;
  name?: string;
  monetaryValue?: number;
  status?: string;
  pipelineId?: string;
  pipelineStageId?: string;
  contactId?: string;
  contact?: { id?: string };
}

// GHL is inconsistent about the location param name: most endpoints use
// `locationId`, but /opportunities/search expects `location_id`. The caller
// picks the right key via `locationKey`.
async function get(
  path: string,
  params: Record<string, string | number> = {},
  locationKey: string = "locationId",
) {
  const url = new URL(`${BASE}${path}`);
  url.searchParams.set(locationKey, process.env.GHL_LOCATION_ID as string);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  const res = await fetch(url.toString(), { headers: headers(), cache: "no-store" });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`GHL ${res.status} ${res.statusText} on ${path}: ${body.slice(0, 300)}`);
  }
  return res.json();
}

// Pull all contacts (paginated). Contacts endpoint uses `locationId`.
export async function fetchAllContacts(max = 5000): Promise<GhlContact[]> {
  const out: GhlContact[] = [];
  let page = 1;
  while (out.length < max) {
    const data = await get("/contacts/", { limit: 100, page });
    const batch: GhlContact[] = data.contacts ?? [];
    out.push(...batch);
    if (batch.length < 100) break;
    page += 1;
    if (page > 60) break; // hard safety cap
  }
  return out;
}

// Pull opportunities via search (paginated). Search endpoint uses `location_id`.
export async function fetchAllOpportunities(max = 5000): Promise<GhlOpportunity[]> {
  const out: GhlOpportunity[] = [];
  let page = 1;
  while (out.length < max) {
    const data = await get("/opportunities/search", { limit: 100, page }, "location_id");
    const batch: GhlOpportunity[] = data.opportunities ?? [];
    out.push(...batch);
    if (batch.length < 100) break;
    page += 1;
    if (page > 60) break;
  }
  return out;
}
