// Editable, per-proposal customer-facing content. Pure (no server deps) so both
// the server renderer (ProposalDocument) and the client editor (CustomerDocEditor)
// import it. Every section has a default derived from the data; the editor stores
// overrides in proposals.customer_content, which are merged over the defaults here.
import { COMPANY, SCOPE_ASHP, SCOPE_SOLAR, COMPLIANCE_BLOCKS } from "@/lib/proposalContent";
import type { McsSummary } from "@/lib/proposalMcs";

export interface PerfFigures {
  runningCostOld: number | null; // £/yr with current heating
  runningCostNew: number | null; // £/yr with the heat pump
  co2Old: number | null;         // tonnes/yr now
  co2New: number | null;         // tonnes/yr after
  annualDemandKwh: number | null;
  scop: number | null;
}

export interface ComplianceBlock { heading: string; body: string }

export interface CustomerContent {
  intro: string;
  heatLossNarrative: string;
  scopeTitle: string;
  scopeItems: string[];
  performance: PerfFigures;
  performanceNote: string;
  compliance: ComplianceBlock[];
  nextSteps: string;
  show: { performance: boolean; heatLoss: boolean; scope: boolean; compliance: boolean; report: boolean };
}

export interface ContentCtx {
  firstName: string;
  customerName: string;
  address: string | null;
  hasASHP: boolean;
  hasSolar: boolean;
  mcs: McsSummary;
}

export function defaultCustomerContent(ctx: ContentCtx): CustomerContent {
  const { firstName, address, hasASHP, hasSolar, mcs } = ctx;
  const where = address ? ` at ${address}` : "";
  const techWord = hasASHP && hasSolar ? "renewable energy system"
    : hasASHP ? "heat pump system" : hasSolar ? "solar & battery system" : "renewable energy system";

  const intro =
    `Thank you for considering ${COMPANY.name}. We are pleased to present this proposal for the installation of a ${techWord}${where}. ` +
    (hasASHP
      ? `Following our site survey we've carried out a detailed room-by-room heat loss calculation for your home and designed the system to match every room, so it runs quietly and efficiently. `
      : `Following our site survey we've designed a system tailored to your property and the way you use energy. `) +
    `We're confident this installation will improve your comfort while lowering your running costs and carbon footprint. We look forward to helping you make the switch.`;

  const heatLossNarrative =
    "This section summarises our detailed heat loss calculation for your property. The overall heat loss determines how large your heat pump needs to be, and the room-by-room breakdown lets us size each emitter (radiator or underfloor) correctly so every room stays warm on the coldest days. " +
    "Heat pumps run most efficiently at low flow temperatures, so we use the survey to confirm which (if any) emitters need upgrading. All calculations are carried out in compliance with BS EN 12831 (UK National Annex) and the MCS standards.";

  const scopeItems = [...(hasASHP ? SCOPE_ASHP : []), ...(hasSolar ? SCOPE_SOLAR : [])];

  // Pre-fill what we can from the parsed report; absolute old/new costs are left
  // blank for you to enter (we only reliably parse the *saving* range).
  const performance: PerfFigures = {
    runningCostOld: null,
    runningCostNew: null,
    co2Old: null,
    co2New: mcs.co2Low != null && mcs.co2High != null ? null : null,
    annualDemandKwh: null,
    scop: mcs.scop ?? null,
  };

  const performanceNote =
    (mcs.savingLow != null
      ? `Estimated running-cost saving of around £${Math.round(mcs.savingLow)}–£${Math.round(mcs.savingHigh ?? mcs.savingLow)} per year. `
      : "") +
    (mcs.co2Low != null
      ? `Estimated carbon saving of around ${mcs.co2Low}–${mcs.co2High ?? mcs.co2Low} tonnes CO₂ per year. `
      : "") +
    "Figures are estimates based on your heat loss survey and typical usage; actual savings depend on your tariff and how the system is run.";

  return {
    intro,
    heatLossNarrative,
    scopeTitle: "What we'll do",
    scopeItems,
    performance,
    performanceNote,
    compliance: COMPLIANCE_BLOCKS.map((b) => ({ ...b })),
    nextSteps:
      "To proceed, accept this proposal or sign and return it. We'll then issue your deposit invoice and book your technical survey and installation. After commissioning you'll receive your MCS certificate and full handover pack.",
    show: { performance: hasASHP || hasSolar, heatLoss: mcs.hasHeatLoss, scope: scopeItems.length > 0, compliance: true, report: true },
  };
}

// Merge stored overrides (partial) over the computed defaults.
export function resolveCustomerContent(stored: any, ctx: ContentCtx): CustomerContent {
  const base = defaultCustomerContent(ctx);
  if (!stored || typeof stored !== "object") return base;
  const s = stored as Partial<CustomerContent>;
  return {
    intro: typeof s.intro === "string" && s.intro.trim() ? s.intro : base.intro,
    heatLossNarrative: typeof s.heatLossNarrative === "string" && s.heatLossNarrative.trim() ? s.heatLossNarrative : base.heatLossNarrative,
    scopeTitle: typeof s.scopeTitle === "string" && s.scopeTitle.trim() ? s.scopeTitle : base.scopeTitle,
    scopeItems: Array.isArray(s.scopeItems) ? s.scopeItems.filter((x) => typeof x === "string" && x.trim()) : base.scopeItems,
    performance: { ...base.performance, ...(s.performance && typeof s.performance === "object" ? s.performance : {}) },
    performanceNote: typeof s.performanceNote === "string" ? s.performanceNote : base.performanceNote,
    compliance: Array.isArray(s.compliance) && s.compliance.length
      ? s.compliance.filter((b: any) => b && (b.heading || b.body))
      : base.compliance,
    nextSteps: typeof s.nextSteps === "string" && s.nextSteps.trim() ? s.nextSteps : base.nextSteps,
    show: { ...base.show, ...(s.show && typeof s.show === "object" ? s.show : {}) },
  };
}
