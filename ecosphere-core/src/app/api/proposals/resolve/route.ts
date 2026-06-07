import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { ProductCategory, LineSource } from "@/lib/proposal";
import { DEFAULT_ASSUMPTIONS, sizeHeatPump, estimateLabour } from "@/lib/standingAssumptions";

export const dynamic = "force-dynamic";

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

// Words that don't help identify a specific model (brands + generic terms).
const STOP = new Set([
  "VAILLANT","DAIKIN","GRANT","MITSUBISHI","SAMSUNG","PANASONIC","LG","NIBE","WORCESTER","BOSCH",
  "HEAT","PUMP","HEATPUMP","KW","WITH","AND","THE","UNIT","SOURCE","AIR","ASHP","CYLINDER","LITRE",
  "LITRES","HOT","WATER","NEW","FOR","SYSTEM","HP",
]);
function tokens(label?: string | null): string[] {
  if (!label) return [];
  return Array.from(new Set(
    String(label).toUpperCase().split(/[^A-Z0-9]+/).filter((t) => t.length >= 3 && !STOP.has(t))
  ));
}
const norm = (s: any) => String(s ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");

// POST /api/proposals/resolve
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
      const { data, error } = await supabase.from("design_inputs")
        .insert({ deal_id, source, payload }).select("*").single();
      if (error) throw new Error(`design_input: ${error.message}`);
      design_input_id = data.id;
    }

    const [{ data: products }, { data: rules }, { data: margins }, { data: tplItems }] = await Promise.all([
      supabase.from("products").select("*").eq("active", true),
      supabase.from("mapping_rules").select("*").eq("active", true),
      supabase.from("margin_rules").select("*"),
      supabase.from("kit_template_items").select("*, products(*)"),
    ]);
    const prods = products ?? [];
    const markupFor = (cat: ProductCategory | null) => {
      const mm = (margins ?? []).find((r: any) => r.category === cat);
      const g = (margins ?? []).find((r: any) => r.category === null);
      return Number((mm ?? g)?.markup_pct ?? 0);
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

    const matchByModel = (cat: ProductCategory, model: any) => {
      if (!model) return null;
      const t = norm(model);
      if (t.length < 4) return null;
      return prods.find((p: any) => p.category === cat && norm(p.attrs?.mfr_code) === t) ?? null;
    };
    // Score catalogue rows against the report's label tokens; return best.
    const bestByTokens = (cands: any[], label?: string | null, preferOutdoor = false) => {
      const toks = tokens(label);
      const scored = cands.map((p: any) => {
        const name = String(p.name).toUpperCase();
        let s = 0;
        for (const t of toks) if (name.includes(t)) s += 2;
        if (preferOutdoor && p.attrs?.kind === "outdoor") s += 1;
        return { p, s, cost: Number(p.cost_price) };
      }).sort((a, b) => b.s - a.s || a.cost - b.cost);
      return scored[0]?.p ?? null;
    };

    // Heat pump: exact model -> kW + series match (auto-pick closest) -> size by load.
    const pickHeatPump = (item: any): { product: any; exact: boolean } | null => {
      const exact = matchByModel("heat_pump", item.model_number);
      if (exact) return { product: exact, exact: true };
      const kw = item.kw != null ? Number(item.kw) : null;
      const notIndoor = (p: any) => p.attrs?.kind !== "indoor" && p.attrs?.kind !== "package";
      let cands = prods.filter((p: any) => p.category === "heat_pump" && (kw == null || Number(p.attrs?.kw) === kw) && notIndoor(p));
      if (cands.length === 0 && kw != null) cands = prods.filter((p: any) => p.category === "heat_pump" && Number(p.attrs?.kw) === kw);
      if (cands.length) return { product: bestByTokens(cands, item.label, true), exact: false };
      if (payload.heat_loss?.total_kw) {
        const u = sizeHeatPump(Number(payload.heat_loss.total_kw), prods as any, DEFAULT_ASSUMPTIONS);
        if (u) return { product: u, exact: false };
      }
      return null;
    };
    // Cylinder: exact model -> litres match (cheapest/brand, skip buffers), flagged.
    const pickCylinder = (item: any): { product: any; exact: boolean } | null => {
      const exact = matchByModel("cylinder", item.model_number);
      if (exact) return { product: exact, exact: true };
      const litres = item.litres != null ? Number(item.litres) : null;
      if (litres != null) {
        const cands = prods.filter((p: any) => p.category === "cylinder" && Number(p.attrs?.litres) === litres && !/BUFFER/i.test(p.name));
        if (cands.length) return { product: bestByTokens(cands, item.label, false), exact: false };
      }
      return null;
    };

    let radiatorCount = 0, hasCylinder = false, hasHeatPump = false;

    for (const rule of rules ?? []) {
      if (rule.type === "base_kit" && rule.bundle_template_id) {
        for (const it of itemsForTemplate(rule.bundle_template_id)) {
          if (it.products) lineFromProduct(it.products, Number(it.qty), "base_kit");
        }
      }

      if (rule.type === "direct" && rule.trigger_key && payload[rule.trigger_key]) {
        const item = payload[rule.trigger_key];
        const cat = rule.target_category as ProductCategory;
        const qty = Number(rule.qty_per);

        if (cat === "heat_pump" || cat === "cylinder") {
          if (cat === "heat_pump") hasHeatPump = true; else hasCylinder = true;
          const r = cat === "heat_pump" ? pickHeatPump(item) : pickCylinder(item);
          if (r && r.product) {
            // Auto-picked closest (not an exact model match) is flagged for review.
            lineFromProduct(r.product, qty, "design", !r.exact);
          } else {
            push({
              product_id: null,
              description: item.label || item.model_number || `${cat} (needs SKU)`,
              category: cat, qty, unit: "each", unit_cost: 0,
              markup_pct: markupFor(cat), vat_rate: 20, source: "design", needs_sku: true,
            });
          }
        } else {
          const cands = prods.filter((p: any) => p.category === cat);
          const m = cands.length === 1 ? cands[0] : bestByTokens(cands, item.label || item.model);
          if (m) lineFromProduct(m, qty, "design", cands.length !== 1);
          else push({
            product_id: null, description: item.label || `${cat} (needs SKU)`,
            category: cat, qty, unit: "each", unit_cost: 0,
            markup_pct: markupFor(cat), vat_rate: 20, source: "design", needs_sku: true,
          });
        }
      }

      if (rule.type === "schedule" && rule.trigger_key && Array.isArray(payload[rule.trigger_key])) {
        for (const row of payload[rule.trigger_key]) {
          const status = String(row.status ?? row.change ?? "").toLowerCase();
          if (!["new", "additional", "replacement", "replaced"].includes(status)) continue;
          radiatorCount += 1;
          const desc = ["Radiator", row.type, row.size_mm, row.room ? `(${row.room})` : ""]
            .filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
          push({
            product_id: null, description: `${desc} — needs SKU`,
            category: "radiator", qty: Number(rule.qty_per), unit: "each", unit_cost: 0,
            markup_pct: markupFor("radiator"), vat_rate: 20, source: "design", needs_sku: true,
          });
          if (rule.bundle_template_id) {
            for (const it of itemsForTemplate(rule.bundle_template_id)) {
              if (it.products) lineFromProduct(it.products, Number(it.qty), "rule");
            }
          }
        }
      }
    }

    const labour = estimateLabour({ radiatorCount, hasCylinder, hasHeatPump }, DEFAULT_ASSUMPTIONS);
    if (labour.days > 0) {
      const detail = labour.breakdown.map((b) => `${b.label}: ${b.days}d`).join(", ");
      push({
        product_id: null,
        description: `Installation labour (subcontract) — ${labour.days} days [${detail}]`,
        category: "labour", qty: labour.days, unit: "day", unit_cost: labour.day_rate,
        markup_pct: markupFor("labour"), vat_rate: 20, source: "rule", needs_sku: false,
      });
    }

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
      ok: true, proposal_id: proposal.id, lines: lines.length,
      needs_sku: lines.filter((l) => l.needs_sku).length,
      labour_days: labour.days, radiators: radiatorCount,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Resolve failed" }, { status: 500 });
  }
}
