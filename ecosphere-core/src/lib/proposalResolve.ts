// =============================================================================
// Shared proposal line-generation. Turns a design payload (heat-loss OR solar)
// into costed, source-tagged proposal lines. Used by /api/proposals/resolve
// (single design) and /api/proposals/build (merge several into one proposal).
// =============================================================================
import type { ProductCategory, LineSource } from "@/lib/proposal";
import { DEFAULT_ASSUMPTIONS, sizeHeatPump, type StandingAssumptions } from "@/lib/standingAssumptions";

export interface DraftLineCore {
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
}

export interface ResolveContext {
  products: any[];
  rules: any[];
  margins: any[];
  tplItems: any[];
  assumptions?: StandingAssumptions;
}

export interface Signals {
  radiatorCount: number;
  hasHeatPump: boolean;
  hasCylinder: boolean;
  hasSolar: boolean;
  panelCount: number;
  hasBattery: boolean;
  hasInverter: boolean;
}

const STOP = new Set([
  "VAILLANT","DAIKIN","GRANT","MITSUBISHI","SAMSUNG","PANASONIC","LG","NIBE","WORCESTER","BOSCH",
  "GIVENERGY","SOLAREDGE","SOLIS","FRONIUS","SUNSYNK","TESLA","LONGI","FASTENSOL","FOX",
  "HEAT","PUMP","HEATPUMP","KW","WITH","AND","THE","UNIT","SOURCE","AIR","ASHP","CYLINDER","LITRE",
  "LITRES","HOT","WATER","NEW","FOR","SYSTEM","HP","PANEL","PANELS","SOLAR","BATTERY","INVERTER",
]);
function tokens(label?: string | null): string[] {
  if (!label) return [];
  return Array.from(new Set(String(label).toUpperCase().split(/[^A-Z0-9]+/).filter((t) => t.length >= 3 && !STOP.has(t))));
}
const norm = (s: any) => String(s ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");

export function linesFromPayload(payload: any, ctx: ResolveContext): { lines: DraftLineCore[]; signals: Signals } {
  const prods = ctx.products ?? [];
  const markupFor = (cat: ProductCategory | null) => {
    const mm = (ctx.margins ?? []).find((r: any) => r.category === cat);
    const g = (ctx.margins ?? []).find((r: any) => r.category === null);
    return Number((mm ?? g)?.markup_pct ?? 0);
  };
  const itemsForTemplate = (templateId: string) => (ctx.tplItems ?? []).filter((i: any) => i.template_id === templateId);

  const lines: DraftLineCore[] = [];
  const push = (l: DraftLineCore) => lines.push(l);
  const lineFromProduct = (p: any, qty: number, src: LineSource, needs = false) =>
    push({
      product_id: p.id, description: p.name, category: p.category, qty,
      unit: p.unit, unit_cost: Number(p.cost_price), markup_pct: markupFor(p.category),
      vat_rate: Number(p.vat_rate), source: src, needs_sku: needs,
    });
  const placeholder = (cat: ProductCategory, description: string, qty: number, src: LineSource = "design") =>
    push({ product_id: null, description, category: cat, qty, unit: "each", unit_cost: 0, markup_pct: markupFor(cat), vat_rate: 20, source: src, needs_sku: true });

  const matchByModel = (cat: ProductCategory, model: any) => {
    if (!model) return null;
    const t = norm(model);
    if (t.length < 4) return null;
    return prods.find((p: any) => p.category === cat && norm(p.attrs?.mfr_code) === t) ?? null;
  };
  const bestByTokens = (cands: any[], label?: string | null, preferOutdoor = false) => {
    const toks = tokens(label);
    const scored = cands.map((p: any) => {
      const nameToks = new Set(tokens(p.name));
      let s = 0;
      for (const t of toks) if (nameToks.has(t)) s += 2;
      if (preferOutdoor && p.attrs?.kind === "outdoor") s += 1;
      return { p, s, cost: Number(p.cost_price) };
    }).sort((a, b) => b.s - a.s || a.cost - b.cost);
    return scored[0]?.p ?? null;
  };
  // Like bestByTokens but only returns a hit if the spec actually overlaps the
  // product name (score > 0). Used for solar, where the catalogue isn't kW/litre
  // constrained, so a zero-overlap "best" would be a misleading pick.
  const bestByTokensStrict = (cands: any[], label?: string | null) => {
    const toks = tokens(label);
    if (!toks.length) return null;
    const scored = cands.map((p: any) => {
      const nameToks = new Set(tokens(p.name));
      let sc = 0; for (const t of toks) if (nameToks.has(t)) sc += 2;
      return { p, sc, cost: Number(p.cost_price) };
    }).filter((x) => x.sc > 0).sort((a, b) => b.sc - a.sc || a.cost - b.cost);
    return scored[0]?.p ?? null;
  };

  const signals: Signals = { radiatorCount: 0, hasHeatPump: false, hasCylinder: false, hasSolar: false, panelCount: 0, hasBattery: false, hasInverter: false };

  // ---------- SOLAR (OpenSolar) ----------------------------------------
  if (payload.solar || payload.source === "opensolar") {
    signals.hasSolar = true;
    const tryMatch = (cat: ProductCategory, model: any, label?: string) => {
      const exact = matchByModel(cat, model);
      if (exact) return { p: exact, exact: true };
      const cands = prods.filter((p: any) => p.category === cat);
      const best = bestByTokensStrict(cands, [label, model].filter(Boolean).join(" "));
      return best ? { p: best, exact: false } : null;
    };

    if (payload.panels) {
      const pa = payload.panels;
      signals.panelCount = Number(pa.count ?? 0);
      const desc = ["Solar panel", pa.make, pa.model, pa.watts ? `${pa.watts}W` : ""].filter(Boolean).join(" ").trim();
      const r = tryMatch("solar_panel", pa.model, pa.make);
      if (r) lineFromProduct(r.p, Number(pa.count ?? 1), "design", !r.exact);
      else placeholder("solar_panel", `${desc} — needs SKU`, Number(pa.count ?? 1));
    }
    if (payload.inverter) {
      signals.hasInverter = true;
      const iv = payload.inverter;
      const desc = ["Inverter", iv.label, iv.model, iv.kw ? `${iv.kw}kW` : ""].filter(Boolean).join(" ").trim();
      const r = tryMatch("inverter", iv.model, iv.label);
      if (r) lineFromProduct(r.p, Number(iv.count ?? 1), "design", !r.exact);
      else placeholder("inverter", `${desc} — needs SKU`, Number(iv.count ?? 1));
    }
    if (payload.battery) {
      signals.hasBattery = true;
      const ba = payload.battery;
      const desc = ["Battery", ba.label, ba.model, ba.usable_kwh ? `${ba.usable_kwh}kWh usable` : ""].filter(Boolean).join(" ").trim();
      const r = tryMatch("battery", ba.model, ba.label);
      if (r) lineFromProduct(r.p, Number(ba.count ?? 1), "design", !r.exact);
      else placeholder("battery", `${desc} — needs SKU`, Number(ba.count ?? 1));
    }
    for (const c of payload.components ?? []) {
      const d = [c.description, c.code ? `(${c.code})` : ""].filter(Boolean).join(" ").trim() || c.code || "Component";
      placeholder("mounting", `${d} — needs SKU`, Number(c.qty ?? 1));
    }
    return { lines, signals };
  }

  // ---------- HEAT LOSS (Spruce) — mapping-rule driven ------------------
  const pickHeatPump = (item: any): { product: any; exact: boolean } | null => {
    const exact = matchByModel("heat_pump", item.model_number);
    if (exact) return { product: exact, exact: true };
    const kw = item.kw != null ? Number(item.kw) : null;
    const notIndoor = (p: any) => p.attrs?.kind !== "indoor" && p.attrs?.kind !== "package";
    let cands = prods.filter((p: any) => p.category === "heat_pump" && (kw == null || Number(p.attrs?.kw) === kw) && notIndoor(p));
    if (cands.length === 0 && kw != null) cands = prods.filter((p: any) => p.category === "heat_pump" && Number(p.attrs?.kw) === kw);
    if (cands.length) return { product: bestByTokens(cands, item.label, true), exact: false };
    if (payload.heat_loss?.total_kw) {
      const u = sizeHeatPump(Number(payload.heat_loss.total_kw), prods as any, ctx.assumptions ?? DEFAULT_ASSUMPTIONS);
      if (u) return { product: u, exact: false };
    }
    return null;
  };
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

  for (const rule of ctx.rules ?? []) {
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
        if (cat === "heat_pump") signals.hasHeatPump = true; else signals.hasCylinder = true;
        const r = cat === "heat_pump" ? pickHeatPump(item) : pickCylinder(item);
        if (r && r.product) lineFromProduct(r.product, qty, "design", !r.exact);
        else placeholder(cat, item.label || item.model_number || `${cat} (needs SKU)`, qty);
      } else {
        const cands = prods.filter((p: any) => p.category === cat);
        const m = cands.length === 1 ? cands[0] : bestByTokens(cands, item.label || item.model);
        if (m) lineFromProduct(m, qty, "design", cands.length !== 1);
        else placeholder(cat, item.label || `${cat} (needs SKU)`, qty);
      }
    }
    if (rule.type === "schedule" && rule.trigger_key && Array.isArray(payload[rule.trigger_key])) {
      for (const row of payload[rule.trigger_key]) {
        const status = String(row.status ?? row.change ?? "").toLowerCase();
        if (!["new", "additional", "replacement", "replaced"].includes(status)) continue;
        signals.radiatorCount += 1;
        const desc = ["Radiator", row.type, row.size_mm, row.room ? `(${row.room})` : ""].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
        placeholder("radiator", `${desc} — needs SKU`, Number(rule.qty_per));
        if (rule.bundle_template_id) {
          for (const it of itemsForTemplate(rule.bundle_template_id)) {
            if (it.products) lineFromProduct(it.products, Number(it.qty), "rule");
          }
        }
      }
    }
  }

  return { lines, signals };
}

export function mergeSignals(list: Signals[]): Signals {
  return list.reduce((a, s) => ({
    radiatorCount: a.radiatorCount + s.radiatorCount,
    hasHeatPump: a.hasHeatPump || s.hasHeatPump,
    hasCylinder: a.hasCylinder || s.hasCylinder,
    hasSolar: a.hasSolar || s.hasSolar,
    panelCount: a.panelCount + s.panelCount,
    hasBattery: a.hasBattery || s.hasBattery,
    hasInverter: a.hasInverter || s.hasInverter,
  }), { radiatorCount: 0, hasHeatPump: false, hasCylinder: false, hasSolar: false, panelCount: 0, hasBattery: false, hasInverter: false });
}
