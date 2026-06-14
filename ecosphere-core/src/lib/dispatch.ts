// Core <-> Dispatch integration client. Dispatch's half is already live; Core
// calls it and matches its contract. Join key is the GHL opportunity id.
//
// Secrets (Vercel env, Core project):
// - DISPATCH_CORE_SECRET: the shared secret Core sends to Dispatch in the
//   `x-core-secret` header (job-summary POST + job-record GET).
// - CORE_API_KEY: the bearer token Core's own receiver requires from Dispatch.

export const DISPATCH_BASE =
  process.env.DISPATCH_BASE_URL || "https://ecosphere-dispatch-niul.vercel.app";

export type KitItem = { name: string; qty: number };

// §1 — push the agreed kit summary to Dispatch. Best-effort: never throws.
export async function pushJobSummary(opts: {
  ghl_opportunity_id: string;
  kit_summary: KitItem[];
  core_project_id?: string;
}): Promise<{ ok: true } | { ok: false; status?: number; error: string }> {
  const secret = process.env.DISPATCH_CORE_SECRET;
  if (!secret) return { ok: false, error: "DISPATCH_CORE_SECRET is not set in Core." };
  if (!opts.ghl_opportunity_id) return { ok: false, error: "Missing ghl_opportunity_id." };
  try {
    const res = await fetch(`${DISPATCH_BASE}/api/core/job-summary`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-core-secret": secret },
      body: JSON.stringify({
        ghl_opportunity_id: opts.ghl_opportunity_id,
        kit_summary: opts.kit_summary,
        ...(opts.core_project_id ? { core_project_id: opts.core_project_id } : {}),
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { ok: false, status: res.status, error: `Dispatch returned ${res.status}${body ? `: ${body.slice(0, 200)}` : ""}` };
    }
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "Request to Dispatch failed." };
  }
}

// §3b — retrieve the completed job record from Dispatch. Pass the record_url
// from the job_completed event, or just the opportunity id.
export async function fetchJobRecord(
  oppIdOrUrl: string
): Promise<{ ok: true; record: any } | { ok: false; status?: number; error: string }> {
  const secret = process.env.DISPATCH_CORE_SECRET;
  if (!secret) return { ok: false, error: "DISPATCH_CORE_SECRET is not set in Core." };
  const url = oppIdOrUrl.startsWith("http")
    ? oppIdOrUrl
    : `${DISPATCH_BASE}/api/core/job-record/${encodeURIComponent(oppIdOrUrl)}`;
  try {
    const res = await fetch(url, { headers: { "x-core-secret": secret } });
    if (!res.ok) return { ok: false, status: res.status, error: `Dispatch record returned ${res.status}` };
    return { ok: true, record: await res.json() };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "Request to Dispatch failed." };
  }
}
