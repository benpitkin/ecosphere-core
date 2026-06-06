// =============================================================================
// Heat loss report parser — Spruce / EcoSphere "Heat Loss Report & System
// Design" PDFs. Pure text -> structured design payload. No I/O, so it runs the
// same in the browser, on the server, and in tests.
//
// The PDF text is extracted client-side (pdf.js) and posted to /api/design/
// ingest, which calls this. Proven against real reports (see test fixtures).
// Patterns are anchored on stable labels/units; when a field can't be found it
// is left null and noted in `_warnings` rather than guessed.
// =============================================================================

export interface HeatLossPayload {
  source: "spruce_heatloss";
  property: { customer_name?: string | null; address?: string | null; postcode?: string | null };
  conditions: {
    design_outdoor_c: number | null;
    design_flow_temp_c: number | null;
    delta_t_c: number | null;
    ground_temp_c: number | null;
  };
  heat_loss: { total_kw: number | null; floor_area_m2: number | null; avg_w_m2: number | null };
  heat_pump: Record<string, any> | null;
  cylinder: Record<string, any> | null;
  emitter_summary: Record<string, number>;
  emitter_schedule: EmitterRow[];
  performance: Record<string, number>;
  ashp: boolean;
  _warnings: string[];
}

export interface EmitterRow {
  room: string | null;
  status: "new" | "replacement";
  emitter: "radiator";
  type: string | null;
  size_mm: string | null;
}

export function parseHeatLoss(raw: string): HeatLossPayload {
  const text = (raw || "").replace(/\r/g, "");
  const flat = text.replace(/[ \t]+/g, " ");
  const lines = text.split("\n");
  const warnings: string[] = [];

  const num = (s: any): number | null => (s == null ? null : Number(String(s).replace(/,/g, "")));
  const find = (re: RegExp) => flat.match(re);
  let m: RegExpMatchArray | null;

  // ---- Summary scalars: "248 m² 11.33 kW 46 W/m²" ----------------------
  let floor_area_m2: number | null = null, total_heat_loss_kw: number | null = null, avg_w_m2: number | null = null;
  if ((m = find(/(\d+(?:\.\d+)?)\s*m²\s+(\d+(?:\.\d+)?)\s*kW\s+(\d+(?:\.\d+)?)\s*W\/m²/))) {
    floor_area_m2 = num(m[1]); total_heat_loss_kw = num(m[2]); avg_w_m2 = num(m[3]);
  }
  if (total_heat_loss_kw == null && (m = find(/Total heat loss\s+(\d+(?:\.\d+)?)\s*kW/i))) total_heat_loss_kw = num(m[1]);
  if (total_heat_loss_kw == null && (m = find(/design heat loss of\s+(\d+(?:\.\d+)?)\s*kW/i))) total_heat_loss_kw = num(m[1]);
  if (total_heat_loss_kw == null) warnings.push("total_heat_loss_kw not found");

  // ---- Conditions ------------------------------------------------------
  const design_outdoor_c = (m = find(/Design outdoor air temperature\s*(-?\d+(?:\.\d+)?)\s*°?C/i)) ? num(m[1]) : null;
  const ground_temp_c = (m = find(/Design ground temperature\s*(\d+(?:\.\d+)?)\s*°?C/i)) ? num(m[1]) : null;
  let design_flow_temp_c = (m = find(/Flow temperature\s*=?\s*(\d+(?:\.\d+)?)\s*°?C/i)) ? num(m[1]) : null;
  if (design_flow_temp_c == null && (m = find(/at\s*(\d+)\s*°C flow temp/i))) design_flow_temp_c = num(m[1]);
  const delta_t_c = (m = find(/delta T\)\s*=\s*(\d+(?:\.\d+)?)\s*°?C/i)) ? num(m[1]) : null;

  // ---- Heat pump -------------------------------------------------------
  const hp: Record<string, any> = {};
  {
    const hdr = lines.findIndex((l) => /Model number/i.test(l));
    if (hdr >= 0 && lines[hdr + 1]) {
      const toks = lines[hdr + 1].trim().split(/\s{2,}|\s+/).filter(Boolean);
      const cand = toks.reverse().find((t) => /^[A-Z][A-Z0-9\-\/.]{4,}$/.test(t));
      if (cand) hp.model_number = cand;
    }
  }
  if ((m = find(/Capacity at\s*\d+\s*°C[^\d]*(\d+(?:\.\d+)?)\s*kW/i))) hp.capacity_at_design_kw = num(m[1]);
  if ((m = find(/SCOP at\s*\d+\s*°C\s*(\d+(?:\.\d+)?)/i))) hp.scop = num(m[1]);
  if ((m = find(/MCS certificate number\s+([A-Z0-9\/ ]+?)\s+Refrigerant/i))) hp.mcs_cert = m[1].trim();
  if ((m = find(/Refrigerant\s+(R-?\d+)/i))) hp.refrigerant = m[1].trim();
  if ((m = find(/covers\s+(\d+)\s*% of the heating requirement/i))) hp.coverage_pct = num(m[1]);
  const hpNameIdx = lines.findIndex((l) => /suggest the following heat pump/i.test(l));
  if (hpNameIdx >= 0) {
    for (let i = hpNameIdx + 1; i < Math.min(hpNameIdx + 4, lines.length); i++) {
      const t = lines[i].trim();
      if (t) { hp.label = t; break; }
    }
  }
  if (!hp.label && (m = find(/Proposed system design\s+HEAT PUMP\s+(.+?)\s+Capacity/i))) hp.label = m[1].trim();
  if (hp.label && (m = (hp.label as string).match(/(\d+(?:\.\d+)?)\s*kW/i))) hp.kw = num(m[1]);

  // ---- Cylinder (anchored to summary CYLINDER block) -------------------
  const cyl: Record<string, any> = {};
  if ((m = find(/Capacity\s+(\d+)\s*litres/i))) cyl.litres = num(m[1]);
  {
    const ci = lines.findIndex((l) => /^\s*CYLINDER\b/i.test(l));
    if (ci >= 0) {
      for (let i = ci + 1; i < Math.min(ci + 5, lines.length); i++) {
        const t = lines[i].trim();
        const cm = t.match(/^Cylinder\s+([A-Z][A-Z0-9.\-\/]{3,})/i);
        if (cm) cyl.model_number = cm[1].trim();
        else if (!cyl.label && t && !/^Cylinder\b/i.test(t) && !/Capacity/i.test(t)) cyl.label = t.split(/\s{2,}/)[0].trim();
      }
    }
  }
  if (!cyl.litres && cyl.label && (m = (cyl.label as string).match(/(\d+)\s*L\b/i))) cyl.litres = num(m[1]);

  // ---- Emitter summary -------------------------------------------------
  const es: Record<string, number> = {};
  if ((m = find(/(\d+)\s+new radiators?/i))) es.new_radiators = num(m[1])!;
  if ((m = find(/(\d+)\s+replaced,\s*(\d+)\s+additional,\s*(\d+)\s+retained/i))) {
    es.replaced = num(m[1])!; es.additional = num(m[2])!; es.retained = num(m[3])!;
  }
  if ((m = find(/([\d.]+)m²\s+new underfloor/i))) es.new_ufh_m2 = num(m[1])!;
  if ((m = find(/([\d.]+)m²\s+retained/i))) es.retained_ufh_m2 = num(m[1])!;

  // ---- Performance -----------------------------------------------------
  const perf: Record<string, number> = {};
  if ((m = find(/(\d+(?:\.\d+)?)\s*to\s*(\d+(?:\.\d+)?)\s*tonnes/i))) { perf.co2_low = num(m[1])!; perf.co2_high = num(m[2])!; }
  if ((m = find(/£([\d,]+)\s*to\s*£([\d,]+)\s*per year/i))) { perf.saving_low = num(m[1])!; perf.saving_high = num(m[2])!; }

  // ---- Property / customer (best-effort; usually from CRM) -------------
  const property: Record<string, any> = {};
  if ((m = find(/\b([A-Z]{1,2}\d{1,2}[A-Z]?\s*\d[A-Z]{2})\b/))) property.postcode = m[1].replace(/\s+/, " ").trim();
  const prepIdx = lines.findIndex((l) => /Prepared for/i.test(l));
  if (prepIdx >= 0 && lines[prepIdx + 1]) property.customer_name = lines[prepIdx + 1].trim().split(/\s{2,}/)[0] || null;
  if (prepIdx >= 0 && lines[prepIdx + 2]) property.address = lines[prepIdx + 2].trim().split(/\s{2,}/)[0] || null;

  // ---- Emitter schedule (orderable radiators) --------------------------
  const startIdx = lines.findIndex((l) => /Proposed emitter changes/i.test(l));
  let endIdx = lines.length;
  if (startIdx >= 0) {
    const after = lines.slice(startIdx + 1);
    const rel = after.findIndex((l) => /Accepting undersized|^\s*Hot water\b/i.test(l));
    endIdx = rel < 0 ? lines.length : startIdx + 1 + rel;
  }
  const schedule: EmitterRow[] = [];
  if (startIdx >= 0) {
    const seg = lines.slice(startIdx, endIdx);
    let pendingType: string | null = null, lastRoom: string | null = null;
    for (let i = 0; i < seg.length; i++) {
      const l = seg[i];
      const tline = l.match(/((?:Type\s*\d+\s*\([^)]*\)[^\n]*)|Straight towel rail|Arbonia[^\n]*)/i);
      if (tline) pendingType = tline[1].replace(/\s+/g, " ").trim();
      const rowm = l.match(/^\s*(.*?)\s*\b(New|Replacement|Keep)\b\s+(Radiator|UFH)\b/i);
      if (rowm) {
        const room = rowm[1].trim() || lastRoom;
        if (rowm[1].trim()) lastRoom = rowm[1].trim();
        const status = rowm[2].toLowerCase();
        const emitter = rowm[3].toLowerCase();
        let size: string | null = null;
        for (let k = i; k < Math.min(i + 3, seg.length); k++) {
          const sm = seg[k].match(/(\d{2,4})\s*x\s*(\d{2,4})\s*mm/i);
          if (sm) { size = `${sm[1]} x ${sm[2]} mm`; break; }
        }
        if (emitter === "radiator" && (status === "new" || status === "replacement")) {
          schedule.push({ room, status: status as "new" | "replacement", emitter: "radiator", type: pendingType, size_mm: size });
        }
        pendingType = null;
      }
    }
  }
  if (schedule.length === 0 && es.new_radiators) {
    for (let i = 0; i < es.new_radiators; i++)
      schedule.push({ room: null, status: i < (es.replaced || 0) ? "replacement" : "new", emitter: "radiator", type: null, size_mm: null });
    warnings.push("emitter schedule synthesised from summary counts (detailed table not parsed)");
  }

  return {
    source: "spruce_heatloss",
    property,
    conditions: { design_outdoor_c, design_flow_temp_c, delta_t_c, ground_temp_c },
    heat_loss: { total_kw: total_heat_loss_kw, floor_area_m2, avg_w_m2 },
    heat_pump: Object.keys(hp).length ? hp : null,
    cylinder: Object.keys(cyl).length ? cyl : null,
    emitter_summary: es,
    emitter_schedule: schedule,
    performance: perf,
    ashp: true,
    _warnings: warnings,
  };
}
