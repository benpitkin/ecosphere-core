import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { estimateLabour, DEFAULT_ASSUMPTIONS } from "@/lib/standingAssumptions";
import { linesFromPayload, mergeSignals, type ResolveContext, type DraftLineCore, type Signals } from "@/lib/proposalResolve";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// POST /api/proposals/build
// Body: { deal_id?, title?, bus_grant?, design_input_ids: string[] }
// Merges several design inputs (e.g. ASHP heat-loss + solar) into ONE proposal.
export async function POST(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const { deal_id = null, title, bus_grant, design_input_ids = [], payloads = [] } = body;
  if ((!Array.isArray(design_input_ids) || design_input_ids.length === 0) && (!Array.isArray(payloads) || payloads.length === 0)) {
    return NextResponse.json({ error: "design_input_ids or payloads required" }, { status: 400 });
  }

  try {
    let inputs: any[] = [];
    if (design_input_ids.length) {
      const { data, error: diErr } = await supabase.from("design_inputs").select("*").in("id", design_input_ids);
      if (diErr) throw new Error(diErr.message);
      inputs = data ?? [];
    }
    const allPayloads = [...inputs.map((d: any) => d.payload), ...(Array.isArray(payloads) ? payloads : [])];
    if (allPayloads.length === 0) throw new Error("no design data to build from");

    const [{ data: products }, { data: rules }, { data: margins }, { data: tplItems }] = await Promise.all([
      supabase.from("products").select("*").eq("active", true),
      supabase.from("mapping_rules").select("*").eq("active", true),
      supabase.from("margin_rules").select("*"),
      supabase.from("kit_template_items").select("*, products(*)"),
    ]);
    const ctx: ResolveContext = { products: products ?? [], rules: rules ?? [], margins: margins ?? [], tplItems: tplItems ?? [] };
    const markupFor = (cat: any) => {
      const mm = (margins ?? []).find((r: any) => r.category === cat);
      const g = (margins ?? []).find((r: any) => r.category === null);
      return Number((mm ?? g)?.markup_pct ?? 0);
    };

    const allLines: DraftLineCore[] = [];
    const sigList: Signals[] = [];
    for (const pl of allPayloads) {
      const { lines, signals } = linesFromPayload(pl, ctx);
      allLines.push(...lines);
      sigList.push(signals);
    }
    const signals = mergeSignals(sigList);

    const labour = estimateLabour(signals, DEFAULT_ASSUMPTIONS);
    if (labour.days > 0) {
      const detail = labour.breakdown.map((b) => `${b.label}: ${b.days}d`).join(", ");
      allLines.push({
        product_id: null,
        description: `Installation labour (subcontract) — ${labour.days} days [${detail}]`,
        category: "labour", qty: labour.days, unit: "day", unit_cost: labour.day_rate,
        markup_pct: markupFor("labour"), vat_rate: 20, source: "rule", needs_sku: false,
      });
    }

    const parts = [signals.hasHeatPump && "Heat pump", signals.hasSolar && "Solar", signals.hasBattery && !signals.hasSolar && "Battery"].filter(Boolean);
    const ttl = title || (parts.length ? `${parts.join(" + ")} proposal` : "Proposal");
    const grant = bus_grant != null ? Number(bus_grant) : (signals.hasHeatPump ? 7500 : 0);

    const { data: proposal, error: pErr } = await supabase.from("proposals")
      .insert({ deal_id, design_input_id: inputs[0]?.id ?? null, title: ttl, status: "draft", bus_grant: grant }).select("*").single();
    if (pErr) throw new Error(`proposal: ${pErr.message}`);

    if (allLines.length) {
      const rows = allLines.map((l, i) => ({ ...l, proposal_id: proposal.id, sort: i }));
      const { error: lErr } = await supabase.from("proposal_lines").insert(rows);
      if (lErr) throw new Error(`proposal_lines: ${lErr.message}`);
    }

    return NextResponse.json({
      ok: true, proposal_id: proposal.id, lines: allLines.length,
      needs_sku: allLines.filter((l) => l.needs_sku).length, labour_days: labour.days,
      technologies: parts,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Build failed" }, { status: 500 });
  }
}
