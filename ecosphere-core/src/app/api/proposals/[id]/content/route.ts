import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { groupForCategory } from "@/lib/proposalContent";
import { mcsFromPayload } from "@/lib/proposalMcs";
import { resolveCustomerContent, type ContentCtx } from "@/lib/proposalCustomer";

export const dynamic = "force-dynamic";

async function ctxFor(supabase: any, id: string) {
  const { data: proposal } = await supabase
    .from("proposals").select("*, deals(customer_name, address, postcode, email)").eq("id", id).single();
  if (!proposal) return null;
  const { data: lines } = await supabase.from("proposal_lines").select("category").eq("proposal_id", id);
  const keys = new Set((lines ?? []).map((l: any) => groupForCategory(l.category)));
  const hasASHP = keys.has("heat_pump") || keys.has("cylinder") || keys.has("radiators");
  const hasSolar = keys.has("solar") || keys.has("inverter") || keys.has("battery");
  let payload: any = null;
  if (proposal.design_input_id) {
    const { data: di } = await supabase.from("design_inputs").select("payload").eq("id", proposal.design_input_id).single();
    payload = di?.payload ?? null;
  }
  const cust = proposal.deals;
  const ctx: ContentCtx = {
    firstName: cust?.customer_name?.split(" ")[0] ?? "there",
    customerName: cust?.customer_name ?? "Customer",
    address: cust?.address ?? null,
    hasASHP, hasSolar, mcs: mcsFromPayload(payload),
  };
  return { proposal, ctx };
}

// GET — the fully resolved (defaults + overrides) content, so the editor loads
// the current effective text to tweak.
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const r = await ctxFor(supabase, params.id);
  if (!r) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({
    content: resolveCustomerContent(r.proposal.customer_content, r.ctx),
    hasReport: !!r.proposal.heatloss_report_path,
  });
}

// POST — save overrides.
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  if (!body || typeof body.content !== "object") return NextResponse.json({ error: "content required" }, { status: 400 });
  const { error } = await createAdminClient().from("proposals").update({ customer_content: body.content }).eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
