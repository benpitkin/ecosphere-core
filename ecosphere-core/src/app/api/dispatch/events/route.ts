import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchJobRecord } from "@/lib/dispatch";

// RECEIVER for the Dispatch -> Core integration (both lifecycle events).
// Dispatch POSTs here with `Authorization: Bearer <CORE_API_KEY>`.
//
//   job_confirmed  -> mark the Core deal "install scheduled" (+ date/installer)
//   job_completed  -> GET the job record from Dispatch, ARCHIVE commissioning +
//                     download the (24h-expiring) photos into our own bucket as
//                     Core's permanent system-of-record copy, mark complete.
//
// On a transient record-fetch failure we return 502 so Dispatch retries (the
// photos expire in 24h, so we must not silently drop the record). A 404 (no
// such job) is treated as done. This route is in the /api/dispatch/* public
// allow-list (middleware) and authenticates by bearer token.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function archivePhotos(admin: ReturnType<typeof createAdminClient>, oppId: string, urls: string[]): Promise<string[]> {
  const paths: string[] = [];
  for (let i = 0; i < urls.length; i++) {
    try {
      const r = await fetch(urls[i]);
      if (!r.ok) continue;
      const buf = Buffer.from(await r.arrayBuffer());
      const ct = r.headers.get("content-type") || "image/jpeg";
      const ext = ct.includes("png") ? "png" : ct.includes("webp") ? "webp" : ct.includes("pdf") ? "pdf" : "jpg";
      const path = `${oppId}/${i}.${ext}`;
      const { error } = await admin.storage.from("job-photos").upload(path, buf, { upsert: true, contentType: ct });
      if (!error) paths.push(path);
    } catch { /* skip a bad photo; keep the rest */ }
  }
  return paths;
}

export async function POST(request: Request) {
  const token = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!process.env.CORE_API_KEY || token !== process.env.CORE_API_KEY) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  let body: any;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const event = body?.event;
  const oppId = body?.ghl_opportunity_id;
  if (!oppId) return NextResponse.json({ error: "ghl_opportunity_id is required" }, { status: 400 });

  const admin = createAdminClient();
  const now = new Date().toISOString();
  const { data: deal } = await admin.from("deals").select("id").eq("ghl_opportunity_id", oppId).maybeSingle();
  const dealId = deal?.id ?? null;

  if (event === "job_confirmed") {
    await admin.from("dispatch_jobs").upsert({
      ghl_opportunity_id: oppId, deal_id: dealId,
      dispatch_job_id: body.dispatch_job_id ?? null,
      install_date: body.install_date ?? null,
      installer: body.installer ?? null,
      status: "scheduled", confirmed_at: now, updated_at: now,
    }, { onConflict: "ghl_opportunity_id" });
    if (dealId) await admin.from("deals").update({ job_status: "install_scheduled", job_status_at: now }).eq("id", dealId);
    return NextResponse.json({ ok: true });
  }

  if (event === "job_completed") {
    const rec = await fetchJobRecord(body.record_url || oppId);
    // 404 = nothing to archive; anything else non-ok = transient -> ask Dispatch to retry.
    if (!rec.ok && rec.status !== 404) {
      return NextResponse.json({ ok: false, error: rec.error }, { status: 502 });
    }
    const patch: any = {
      ghl_opportunity_id: oppId, deal_id: dealId,
      dispatch_job_id: body.dispatch_job_id ?? null,
      status: "completed", completed_at: now, updated_at: now,
      record_url: body.record_url ?? null,
    };
    if (rec.ok) {
      const r = rec.record;
      patch.raw_record = r;
      patch.commissioning = r.commissioning ?? null;
      if (r.job) {
        patch.install_date = r.job.install_date ?? null;
        patch.installer = r.job.installer ?? null;
        patch.dispatch_job_id = r.job.dispatch_job_id ?? patch.dispatch_job_id;
      }
      patch.site_photos = await archivePhotos(admin, oppId, Array.isArray(r.photos) ? r.photos : []);
      patch.archived_at = now;
    } else {
      patch.push_error = "Dispatch returned 404 for the job record (nothing to archive).";
    }
    await admin.from("dispatch_jobs").upsert(patch, { onConflict: "ghl_opportunity_id" });
    if (dealId) await admin.from("deals").update({ job_status: "completed", job_status_at: now }).eq("id", dealId);
    return NextResponse.json({ ok: true, archived: rec.ok, photos: patch.site_photos?.length ?? 0 });
  }

  return NextResponse.json({ ok: true, ignored: event ?? null });
}

// Allow a quick reachability check.
export async function GET(request: Request) {
  const token = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!process.env.CORE_API_KEY || token !== process.env.CORE_API_KEY) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }
  return NextResponse.json({ ok: true, ready: true });
}
