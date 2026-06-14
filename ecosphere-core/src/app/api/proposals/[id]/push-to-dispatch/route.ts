import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { pushJobSummary, type KitItem } from "@/lib/dispatch";

// SENDER for the Core -> Dispatch integration (§1). Builds the agreed kit from
// a proposal's line items and pushes it to Dispatch, keyed by the deal's GHL
// opportunity id. Records the outcome on dispatch_jobs (pushed_at / push_error)
// so the retry cron can re-attempt failures. Staff-authenticated (under
// /api/proposals/*, which the middleware gates behind login).
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(_request: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const admin = createAdminClient();
  const { data: proposal } = await admin.from("proposals").select("id, deal_id").eq("id", params.id).maybeSingle();
  if (!proposal) return NextResponse.json({ error: "Proposal not found" }, { status: 404 });
  if (!proposal.deal_id) return NextResponse.json({ error: "This proposal isn't linked to a deal." }, { status: 400 });

  const { data: deal } = await admin.from("deals").select("id, ghl_opportunity_id").eq("id", proposal.deal_id).maybeSingle();
  if (!deal?.ghl_opportunity_id) {
    return NextResponse.json({ error: "This deal has no GHL opportunity id, so it can't be synced to Dispatch." }, { status: 400 });
  }

  const { data: lines } = await admin
    .from("proposal_lines").select("description, qty, category").eq("proposal_id", params.id).order("sort");

  // The agreed kit: materials/equipment only (skip labour), duplicates merged by name.
  const map = new Map<string, number>();
  for (const l of (lines ?? []) as any[]) {
    if (l.category === "labour") continue;
    const name = String(l.description ?? "").trim();
    if (!name) continue;
    map.set(name, (map.get(name) ?? 0) + Number(l.qty || 0));
  }
  const kit_summary: KitItem[] = Array.from(map, ([name, qty]) => ({ name, qty }));
  if (kit_summary.length === 0) return NextResponse.json({ error: "No kit lines to send." }, { status: 400 });

  const result = await pushJobSummary({ ghl_opportunity_id: deal.ghl_opportunity_id, kit_summary, core_project_id: deal.id });

  const now = new Date().toISOString();
  // Upsert only the push-related columns — leaves any archived completion data intact.
  await admin.from("dispatch_jobs").upsert({
    ghl_opportunity_id: deal.ghl_opportunity_id,
    deal_id: deal.id,
    kit_summary,
    pushed_at: result.ok ? now : null,
    push_error: result.ok ? null : result.error,
    updated_at: now,
  }, { onConflict: "ghl_opportunity_id" });

  if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 502 });
  return NextResponse.json({ ok: true, sent: kit_summary.length });
}
