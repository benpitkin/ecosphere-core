import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { ProductCategory, LineSource } from "@/lib/proposal";

export const dynamic = "force-dynamic";

// A draft proposal line before insert.
interface DraftLine {
  product_id: string | null;
  description: string;
  category: ProductCategory | null;
  qty: number;
  unit: string;
  unit_cost: number;
  markup_pct: number;
  vat_rate: number;
  source: LineSource;
  needs_sku: boolean;
  sort: number;
}

// POST /api/proposals/resolve
// Body: { deal_id?, design_input_id?, source?, payload?, title?, bus_grant? }
// Resolves a design payload into a draft proposal + costed lines (with source tags).
export async function POST(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  let { deal_id = null, design_input_id = null, source = "manual", payload = null, title, bus_grant } = body;

  try {
    // 1) Resolve the design payload (load existing design_input, or create one).
    if (design_input_id) {
      const { data, error } = await supabase.from("design_inputs").select("*").eq("id", design_input_id).single();
      if (error || !data) throw new Error("design_input not found");
      payload = data.payload; deal_id = data.deal_id ?? deal_id;
    } else {
      payload = payload ?? {};
      const { data, error } = await supabase.from("design_inputs")
        .insert({ deal_id, source, payload }).select("*").single();
      if (error) throw new Error(`design_input: ${error.message}`);
      design_input_id = data.id;
    }

    // 2) Load catalogue + rules.
    const [{ data: products }, { data: rules }, { data: margins }, { data: tplItems }] = await Promise.all([
      supabase.from("products").select("*").eq("active", true),
      supabase.from("mapping_rules").select("*").eq("active", true),
      supabase.from("margin_rules").select("*"),
      supabase.from("kit_template_items").select("*, products(*)"),
    ]);
    const prods = products ?? [];
    const markupFor = (cat: ProductCategory | null) => {
      const m = (margins ?? []).find((r: any) => r.category === cat);
      const g = (margins ?? []).find((r: any) => r.category === null);
      return Number((m ?? g)?.markup_pct ?? 0);
    };
    const itemsForTemplate = (templateId: string) =>
      (tplItems ?? []).filter((i: any) => i.template_id === templateId);

    const lines: DraftLine[] = [];
    let sort = 0;
    const push = (l: Omit<DraftLine, "sort">) => lines.push({ ...l, sort: sort++ });

    const lineFromProduct = (p: any, qty: number, src: LineSource, needs = false) =>
      push({
        product_id: p.id, description: p.name, category: p.category, qty,
        unit: p.unit, unit_cost: Number(p.cost_price), markup_pct: markupFor(p.category),
        vat_rate: Number(p.vat_rate), source: src, needs_sku: needs,
      });

    const matchOne = (cat: ProductCategory, pred: (attrs: any) => boolean) => {
      const candidates = prods.filter((p: any) => p.category === cat && pred(p.attrs ?? {}));
      return { match: candidates[0] ?? null, ambiguous: candidates.length > 1, none: candidates.length === 0 };
    };

    // 3) Apply mapping rules.
    for (const rule of rules ?? []) {
      if (rule.type === "base_kit" && rule.bundle_template_id) {
        for (const it of itemsForTemplate(rule.bundle_template_id)) {
          if (it.products) lineFromProduct(it.products, Number(it.qty), "base_kit");
        }
      }

      if (rule.type === "direct" && rule.trigger_key && payload[rule.trigger_key]) {
        const item = payload[rule.trigger_key];
        const cat = rule.target_category as ProductCategory;
        let res;
        if (cat === "heat_pump") res = matchOne(cat, (a) => item.kw != null && Number(a.kw) === Number(item.kw));
        else if (cat === "cylinder") res = matchOne(cat, (a) => item.litres != null && Number(a.litres) === Number(item.litres));
        else res = matchOne(cat, () => true);

        if (res.match && !res.ambiguous) {
          lineFromProduct(res.match, Number(rule.qty_per), "design");
        } else {
          // 0 or >1 matches: add a placeholder line flagged for the office.
          push({
            product_id: res.match?.id ?? null,
            description: item.label || item.model || `${cat} (needs SKU)`,
            category: cat, qty: Number(rule.qty_per), unit: "each",
            unit_cost: res.match ? Number(res.match.cost_price) : 0,
            markup_pct: markupFor(cat), vat_rate: 20, source: "design", needs_sku: true,
          });
        }
      }

      if (rule.type === "schedule" && rule.trigger_key && Array.isArray(payload[rule.trigger_key])) {
        for (const row of payload[rule.trigger_key]) {
          if ((row.change ?? "").toLowerCase() !== "replaced") continue;
          const res = matchOne("radiator", (a) =>
            (row.type == null || a.type === row.type) &&
            (row.width_mm == null || Number(a.width_mm) === Number(row.width_mm)));
          if (res.match && !res.ambiguous) {
            lineFromProduct(res.match, Number(rule.qty_per), "design");
          } else {
            push({
              product_id: res.match?.id ?? null,
              description: `Radiator ${row.type ?? ""} ${row.width_mm ?? ""} (needs SKU)`.trim(),
              category: "radiator", qty: Number(rule.qty_per), unit: "each",
              unit_cost: res.match ? Number(res.match.cost_price) : 0,
              markup_pct: markupFor("radiator"), vat_rate: 20, source: "design", needs_sku: true,
            });
          }
          // Per-radiator bundle.
          if (rule.bundle_template_id) {
            for (const it of itemsForTemplate(rule.bundle_template_id)) {
              if (it.products) lineFromProduct(it.products, Number(it.qty), "rule");
            }
          }
        }
      }
    }

    // 4) Create the proposal + insert lines.
    const hasHeatPump = Boolean(payload.heat_pump);
    const { data: proposal, error: pErr } = await supabase.from("proposals").insert({
      deal_id, design_input_id,
      title: title || (hasHeatPump ? "Heat pump proposal" : "Proposal"),
      status: "draft",
      bus_grant: bus_grant != null ? Number(bus_grant) : (hasHeatPump ? 7500 : 0),
    }).select("*").single();
    if (pErr) throw new Error(`proposal: ${pErr.message}`);

    if (lines.length) {
      const rows = lines.map((l) => ({ ...l, proposal_id: proposal.id }));
      const { error: lErr } = await supabase.from("proposal_lines").insert(rows);
      if (lErr) throw new Error(`proposal_lines: ${lErr.message}`);
    }

    return NextResponse.json({
      ok: true,
      proposal_id: proposal.id,
      lines: lines.length,
      needs_sku: lines.filter((l) => l.needs_sku).length,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Resolve failed" }, { status: 500 });
  }
}
