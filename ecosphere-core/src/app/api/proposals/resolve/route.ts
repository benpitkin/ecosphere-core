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

// POST /api/proposals/resolve
// Body: { deal_id?, design_input_id?, source?, payload?, title?, bus_grant? }
// Resolves a design payload (e.g. from a heat loss report) into a draft
// proposal with costed, source-tagged lines: heat pump, cylinder, radiators,
// base kit, per-radiator kits and a labour estimate.
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

    const norm = (s: any) => String(s ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    const matchByModel = (cat: ProductCategory, model: any) => {
      if (!model) return null;
      const t = norm(model);
      return prods.find((p: any) => p.category === cat && norm(p.attrs?.mfr_code) === t) ?? null;
    };
    const matchAll = (cat: ProductCategory, pred: (attrs: any) => boolean) =>
      prods.filter((p: any) => p.category === cat && pred(p.attrs ?? {}));

    // Track what we specified, to drive the labour estimate.
    let radiatorCount = 0, hasCylinder = false, hasHeatPump = false;

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
        const qty = Number(rule.qty_per);

        // (a) Exact model-number match (== catalogue mfr_code) — most reliable.
        let match: any = matchByModel(cat, item.model_number);

        // (b) Attribute match (kw for heat pumps, litres for cylinders).
        if (!match && cat === "heat_pump" && item.kw != null) {
          const c = matchAll(cat, (a) => Number(a.kw) === Number(item.kw) && a.kind === "outdoor");
          if (c.length === 1) match = c[0];
        }
        if (!match && cat === "cylinder" && item.litres != null) {
          const c = matchAll(cat, (a) => Number(a.litres) === Number(item.litres));
          if (c.length === 1) match = c[0];
        }

        // (c) Sizing fallback for heat pumps: smallest outdoor unit >= heat loss.
        if (!match && cat === "heat_pump" && payload.heat_loss?.total_kw) {
          match = sizeHeatPump(Number(payload.heat_loss.total_kw), prods as any, DEFAULT_ASSUMPTIONS);
        }

        if (cat === "heat_pump") hasHeatPump = true;
        if (cat === "cylinder") hasCylinder = true;

        if (match) {
          lineFromProduct(match, qty, "design");
        } else {
          push({
            product_id: null,
            description: item.label || item.model_number || `${cat} (needs SKU)`,
            category: cat, qty, unit: "each", unit_cost: 0,
            markup_pct: markupFor(cat), vat_rate: 20, source: "design", needs_sku: true,
          });
        }
      }

      if (rule.type === "schedule" && rule.trigger_key && Array.isArray(payload[rule.trigger_key])) {
        for (const row of payload[rule.trigger_key]) {
          const status = String(row.status ?? row.change ?? "").toLowerCase();
          // Order a radiator for new / additional / replacement rows. "keep" is skipped.
          if (!["new", "additional", "replacement", "replaced"].includes(status)) continue;
          radiatorCount += 1;

          const desc = ["Radiator", row.type, row.size_mm, row.room ? `(${row.room})` : ""]
            .filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
          // Catalogue has no radiator range yet → flag for the office to price.
          push({
            product_id: null,
            description: `${desc} — needs SKU`,
            category: "radiator", qty: Number(rule.qty_per), unit: "each", unit_cost: 0,
            markup_pct: markupFor("radiator"), vat_rate: 20, source: "design", needs_sku: true,
          });

          // Per-radiator install bundle (valves, tails, pipe, fittings).
          if (rule.bundle_template_id) {
            for (const it of itemsForTemplate(rule.bundle_template_id)) {
              if (it.products) lineFromProduct(it.products, Number(it.qty), "rule");
            }
          }
        }
      }
    }

    // 4) Labour estimate -> a single labour line (feeds the subcontractor PO).
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

    // 5) Create the proposal + insert lines.
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
      labour_days: labour.days,
      radiators: radiatorCount,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Resolve failed" }, { status: 500 });
  }
}
