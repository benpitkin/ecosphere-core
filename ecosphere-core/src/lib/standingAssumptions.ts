// =============================================================================
// Standing assumptions — EcoSphere's confirmed technical defaults that turn a
// raw survey into a specified system. Per the Proposal Engine spec, these are
// encoded ONCE here so the day-to-day operator doesn't need Ben's knowledge.
//
// ⚠️ The numbers below marked TUNE are first-pass defaults, not yet confirmed
// by Ben. They are deliberately conservative and fully visible so they can be
// adjusted in one place (or, later, moved to a DB settings table the office
// can edit). Nothing here is presented to a customer without the human
// verification step.
// =============================================================================

export interface StandingAssumptions {
  design_flow_temp_c: number;
  sizing_margin_pct: number;        // require HP capacity >= heat loss * (1 + margin)
  cylinder_litres_by_bedrooms: Record<number, number>;
  labour: LabourModel;
}

export interface LabourModel {
  day_rate: number;                 // subcontractor engineer day rate (ex VAT)
  ashp_base_days: number;           // core ASHP install (siting, primary, hydraulics)
  commissioning_days: number;       // commissioning, electrical sign-off, handover
  days_per_radiator: number;        // per radiator changed/added
  cylinder_days: number;            // unvented cylinder install
  solar_base_days: number;          // core PV install (scaffold liaison, roof, DC, AC, commissioning)
  days_per_panel: number;           // per panel
  battery_days: number;             // battery/EESS install
}

export const DEFAULT_ASSUMPTIONS: StandingAssumptions = {
  design_flow_temp_c: 50,           // EcoSphere designs to 50°C flow (matches Spruce reports)
  sizing_margin_pct: 0,             // TUNE: report already sizes the HP; 0 = trust the design figure
  cylinder_litres_by_bedrooms: {    // TUNE: fallback only, used when the report has no cylinder
    1: 150, 2: 180, 3: 210, 4: 250, 5: 300, 6: 300,
  },
  labour: {
    day_rate: 350,                  // TUNE: confirm subcontractor day rate
    ashp_base_days: 3,              // TUNE
    commissioning_days: 1,          // TUNE
    days_per_radiator: 0.4,         // TUNE
    cylinder_days: 0.5,             // TUNE
    solar_base_days: 1.5,           // TUNE
    days_per_panel: 0.1,            // TUNE
    battery_days: 0.5,              // TUNE
  },
};

// Pick the smallest outdoor heat pump whose capacity meets the design load.
// Used only as a FALLBACK when the report doesn't name a specific model.
// `units` are catalogue products with attrs.kw and attrs.kind === "outdoor".
export function sizeHeatPump(
  totalHeatLossKw: number,
  units: { id: string; cost_price: number; attrs: any }[],
  a: StandingAssumptions = DEFAULT_ASSUMPTIONS,
) {
  const need = totalHeatLossKw * (1 + a.sizing_margin_pct / 100);
  const eligible = units
    .filter((u) => u.attrs?.kind === "outdoor" && Number(u.attrs?.kw) > 0 && Number(u.attrs.kw) >= need)
    .sort((x, y) => Number(x.attrs.kw) - Number(y.attrs.kw) || x.cost_price - y.cost_price);
  return eligible[0] ?? null;
}

// Labour estimate (in engineer-days) from the specified system.
export function estimateLabour(
  opts: {
    radiatorCount?: number; hasCylinder?: boolean; hasHeatPump?: boolean;
    hasSolar?: boolean; panelCount?: number; hasBattery?: boolean;
  },
  a: StandingAssumptions = DEFAULT_ASSUMPTIONS,
): { days: number; day_rate: number; breakdown: { label: string; days: number }[] } {
  const L = a.labour;
  const r = (n: number) => Math.round(n * 10) / 10;
  const breakdown: { label: string; days: number }[] = [];
  if (opts.hasHeatPump) {
    breakdown.push({ label: "ASHP install (base)", days: L.ashp_base_days });
    breakdown.push({ label: "Commissioning & electrical", days: L.commissioning_days });
  }
  if (opts.hasCylinder) breakdown.push({ label: "Cylinder install", days: L.cylinder_days });
  if ((opts.radiatorCount ?? 0) > 0)
    breakdown.push({ label: `Radiators (${opts.radiatorCount})`, days: r(opts.radiatorCount! * L.days_per_radiator) });
  if (opts.hasSolar) {
    breakdown.push({ label: "Solar install (base)", days: L.solar_base_days });
    if ((opts.panelCount ?? 0) > 0) breakdown.push({ label: `Panels (${opts.panelCount})`, days: r(opts.panelCount! * L.days_per_panel) });
  }
  if (opts.hasBattery) breakdown.push({ label: "Battery install", days: L.battery_days });
  const days = r(breakdown.reduce((s, b) => s + b.days, 0));
  return { days, day_rate: L.day_rate, breakdown };
}
