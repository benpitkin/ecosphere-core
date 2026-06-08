// Normalises a stored design_input payload (Spruce heat-loss) into the MCS
// system-design fields the customer proposal needs. Pure + null-safe: any field
// that wasn't parsed stays null and simply isn't rendered. The emitter schedule
// is the room-by-room emitter design (the "full detail" gated in customer mode).

export interface McsEmitter {
  room: string | null;
  status: string;
  type: string | null;
  size: string | null;
}

export interface McsSummary {
  hasHeatLoss: boolean;
  // Heat loss
  totalKw: number | null;
  floorAreaM2: number | null;
  avgWm2: number | null;
  // Design conditions
  designOutdoorC: number | null;
  designFlowTempC: number | null;
  deltaTC: number | null;
  groundTempC: number | null;
  // Heat pump
  heatPumpLabel: string | null;
  heatPumpModel: string | null;
  capacityAtDesignKw: number | null;
  scop: number | null;
  coveragePct: number | null;
  refrigerant: string | null;
  mcsCert: string | null;
  // Hot water
  cylinderLitres: number | null;
  // Performance
  savingLow: number | null;
  savingHigh: number | null;
  co2Low: number | null;
  co2High: number | null;
  // Emitters (room-by-room emitter design)
  emitters: McsEmitter[];
  emitterSummary: Record<string, number>;
}

const n = (v: any): number | null =>
  v == null || v === "" || Number.isNaN(Number(v)) ? null : Number(v);

export function mcsFromPayload(payload: any): McsSummary {
  const empty: McsSummary = {
    hasHeatLoss: false,
    totalKw: null, floorAreaM2: null, avgWm2: null,
    designOutdoorC: null, designFlowTempC: null, deltaTC: null, groundTempC: null,
    heatPumpLabel: null, heatPumpModel: null, capacityAtDesignKw: null, scop: null,
    coveragePct: null, refrigerant: null, mcsCert: null,
    cylinderLitres: null,
    savingLow: null, savingHigh: null, co2Low: null, co2High: null,
    emitters: [], emitterSummary: {},
  };
  if (!payload || typeof payload !== "object") return empty;
  // Only heat-loss payloads carry MCS heating design.
  const isHeatLoss = payload.source === "spruce_heatloss" || payload.ashp === true || payload.heat_loss != null;
  if (!isHeatLoss) return empty;

  const hl = payload.heat_loss ?? {};
  const cond = payload.conditions ?? {};
  const hp = payload.heat_pump ?? {};
  const cyl = payload.cylinder ?? {};
  const perf = payload.performance ?? {};
  const emitters: McsEmitter[] = Array.isArray(payload.emitter_schedule)
    ? payload.emitter_schedule.map((e: any) => ({
        room: e?.room ?? null,
        status: String(e?.status ?? "new"),
        type: e?.type ?? null,
        size: e?.size_mm ?? null,
      }))
    : [];

  const out: McsSummary = {
    hasHeatLoss: true,
    totalKw: n(hl.total_kw),
    floorAreaM2: n(hl.floor_area_m2),
    avgWm2: n(hl.avg_w_m2),
    designOutdoorC: n(cond.design_outdoor_c),
    designFlowTempC: n(cond.design_flow_temp_c),
    deltaTC: n(cond.delta_t_c),
    groundTempC: n(cond.ground_temp_c),
    heatPumpLabel: hp.label ?? null,
    heatPumpModel: hp.model_number ?? null,
    capacityAtDesignKw: n(hp.capacity_at_design_kw),
    scop: n(hp.scop),
    coveragePct: n(hp.coverage_pct),
    refrigerant: hp.refrigerant ?? null,
    mcsCert: hp.mcs_cert ?? null,
    cylinderLitres: n(cyl.litres),
    savingLow: n(perf.saving_low),
    savingHigh: n(perf.saving_high),
    co2Low: n(perf.co2_low),
    co2High: n(perf.co2_high),
    emitters,
    emitterSummary: payload.emitter_summary && typeof payload.emitter_summary === "object" ? payload.emitter_summary : {},
  };
  // hasHeatLoss only meaningful if we actually have figures to show.
  out.hasHeatLoss = out.totalKw != null || out.scop != null || emitters.length > 0 || out.designFlowTempC != null;
  return out;
}

// Convenience: the headline figures for the "At a glance" / summary card.
export function mcsHeadline(m: McsSummary): { label: string; value: string }[] {
  const out: { label: string; value: string }[] = [];
  if (m.totalKw != null) out.push({ label: "Design heat loss", value: `${m.totalKw} kW` });
  if (m.designFlowTempC != null) out.push({ label: "Flow temperature", value: `${m.designFlowTempC}°C` });
  if (m.scop != null) out.push({ label: "Efficiency (SCOP)", value: `${m.scop}` });
  if (m.coveragePct != null) out.push({ label: "Demand met", value: `${m.coveragePct}%` });
  return out;
}
