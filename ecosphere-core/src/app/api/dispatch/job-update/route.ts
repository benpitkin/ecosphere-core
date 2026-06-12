import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Reverse integration receiver: Dispatch -> Core.
// A trigger on the Dispatch `jobs` table POSTs here when a job's status changes
// to a terminal milestone (completed / ready_for_handover). We record that status on
// the matching Core deal (matched by ghl_opportunity_id) so the sales hub
// reflects install progress. Authenticated by a shared secret; uses the
// service-role client (no user session). Idempotent — safe to fire repeatedly.
//
// Body: { ghl_opportunity_id: string, status: string, job_id?: string }
export const dynamic = "force-dynamic";
export const maxDuration = 30;

function authorised(request: Request) {
  const url = new URL(request.url);
  const key = request.headers.get("x-dispatch-secret") || url.searchParams.get("key");
  return Boolean(process.env.DISPATCH_SHARED_SECRET) && key === process.env.DISPATCH_SHARED_SECRET;
}

export async function POST(request: Request) {
  if (!authorised(request)) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY not set" }, { status: 500 });
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const ghlOpportunityId = body?.ghl_opportunity_id;
  const status = body?.status;
  if (!ghlOpportunityId || typeof status !== "string") {
    return NextResponse.json(
      { error: "ghl_opportunity_id and status are required" },
      { status: 400 }
    );
  }

  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("deals")
      .update({ job_status: status, job_status_at: new Date().toISOString() })
      .eq("ghl_opportunity_id", ghlOpportunityId)
      .select("id");
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true, status, updated: data?.length ?? 0 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Update failed" }, { status: 500 });
  }
}

// Dispatch may send a GET to verify the endpoint is reachable.
export async function GET(request: Request) {
  if (!authorised(request)) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  return NextResponse.json({ ok: true, ready: true });
}
