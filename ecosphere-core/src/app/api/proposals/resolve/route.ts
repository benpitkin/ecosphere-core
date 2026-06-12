import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { estimateLabour, mergeAssumptions } from "@/lib/standingAssumptions";
import { linesFromPayload, type ResolveContext } from "@/lib/proposalResolve";

export const dynamic = "force-dynamic";

async function loadContext(supabase: any): Promise<ResolveContext & { markupFor: (c: any) => number }> {
  const [{ data: products }, { data: rules }, { data: margins }, { data: tplItems }, { data: settingsRow }] = await Promise.all([
    supabase.from("products").select("*").eq("active", true),
    supabase.from("mapping_rules").select("*").eq("active", true),
    supabase.from("margin_rules").select("*"),
    supabase.from("kit_template_items").select("*, products(*)"),
    supabase.from("app_settings").select("value").eq("key", "proposal_assumptions").maybeSingle(),
  ]);
  const markupFor = (cat: any) => {
    const mm = (margins ?? []).find((r: any) => r.category === cat);
    const g = (margins ?? []).find((r: any) => r.category === null);
    return Number((mm ?? g)?.markup_pct ?? 0);
  };
  return { products: products ?? [], rules: rules ?? [], margins: margins ?? [], tplItems: tplItems ?? [], assumptions: mergeAssumptions((settingsRow as any)?.value), markupFor };
}

// POST /api/proposals/resolve  — single design payload -> one proposal.
export async function POST(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  let { deal_id = null, design_input_id = null, source = "manual", payload = null, title, bus_grant } = body;

  try {
    if (design_input_id) {
      const { data, error } = await supabase.from("design_inputs").select("*").eq("id", design_input_id).single();
      if (error || !data) throw new Error("design_input not found");
      payload = data.payload; deal_id = data.deal_id ?? deal_id;
    } else {
      payload = payload ?? {};
      const { data, error } = await supabase.from("design_inputs").insert({ deal_id, source, payload }).select("*").single();
      if (error) throw new Error(`design_input: ${error.message}`);
      design_input_id = data.id;
    }

    const ctx = await loadContext(supabase);
    const { lines, signals } = linesFromPayload(payload, ctx);

    const labour = estimateLabour(signals, ctx.assumptions);
    if (labour.days > 0) {
      const detail = labour.breakdown.map((b) => `${b.label}: ${b.days}d`).join(", ");
      lines.push({
        product_id: null,
        description: `Installation labour (subcontract) — ${labour.days} days [${detail}]`,
        category: "labour", qty: labour.days, unit: "day", unit_cost: labour.day_rate,
        markup_pct: ctx.markupFor("labour"), vat_rate: 20, source: "rule", needs_sku: false,
      });
    }

    const ttl = title || (signals.hasHeatPump ? "Heat pump proposal" : signals.hasSolar ? "Solar proposal" : "Proposal");
    const grant = bus_grant != null ? Number(bus_grant) : (signals.hasHeatPump ? 7500 : 0);
    const { data: proposal, error: pErr } = await supabase.from("proposals")
      .insert({ deal_id, design_input_id, title: ttl, status: "draft", bus_grant: grant }).select("*").single();
    if (pErr) throw new Error(`proposal: ${pErr.message}`);

    if (lines.length) {
      const rows = lines.map((l, i) => ({ ...l, proposal_id: proposal.id, sort: i }));
      const { error: lErr } = await supabase.from("proposal_lines").insert(rows);
      if (lErr) throw new Error(`proposal_lines: ${lErr.message}`);
    }

    return NextResponse.json({
      ok: true, proposal_id: proposal.id, lines: lines.length,
      needs_sku: lines.filter((l) => l.needs_sku).length, labour_days: labour.days,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Resolve failed" }, { status: 500 });
  }
}
