import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { pushJobSummary, type KitItem } from "@/lib/dispatch";

// Hourly retry of failed Core -> Dispatch kit pushes (see vercel.json crons).
// Re-sends any dispatch_jobs row that has a push_error and a stored kit_summary.
// Authenticates via CRON_SECRET (Vercel sends Authorization: Bearer <CRON_SECRET>).
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!process.env.DISPATCH_CORE_SECRET) {
    return NextResponse.json({ error: "DISPATCH_CORE_SECRET not set" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: rows } = await admin
    .from("dispatch_jobs")
    .select("ghl_opportunity_id, deal_id, kit_summary")
    .not("push_error", "is", null)
    .not("kit_summary", "is", null)
    .limit(50);

  let retried = 0, fixed = 0;
  for (const r of (rows ?? []) as any[]) {
    retried++;
    const result = await pushJobSummary({
      ghl_opportunity_id: r.ghl_opportunity_id,
      kit_summary: r.kit_summary as KitItem[],
      core_project_id: r.deal_id ?? undefined,
    });
    await admin.from("dispatch_jobs").update({
      pushed_at: result.ok ? new Date().toISOString() : null,
      push_error: result.ok ? null : result.error,
      updated_at: new Date().toISOString(),
    }).eq("ghl_opportunity_id", r.ghl_opportunity_id);
    if (result.ok) fixed++;
  }
  return NextResponse.json({ ok: true, retried, fixed });
}
