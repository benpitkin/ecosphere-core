// =============================================================================
// Solar (PV) design parser — OpenSolar "Proposal for Customer" PDFs.
// Pure text -> structured solar design payload, mirroring the heat-loss parser.
// The "Your Solution" section is a clean bill of materials (panels, inverter,
// battery, mounting, meter, optimisers) with `N x CODE` per item.
// =============================================================================

export interface SolarPayload {
  source: "opensolar";
  property: { customer_name?: string | null; address?: string | null; postcode?: string | null; quote_no?: string | null };
  system: Record<string, number | null>;
  panels: Record<string, any> | null;
  inverter: Record<string, any> | null;
  battery: Record<string, any> | null;
  components: { qty: number | null; code: string; description: string | null }[];
  solar: true;
  _warnings: string[];
}

export function parseSolar(raw: string): SolarPayload {
  const text = (raw || "").replace(/\r/g, "");
  const flat = text.replace(/[ \t]+/g, " ");
  const lines = text.split("\n");
  const warnings: string[] = [];
  const num = (s: any): number | null => (s == null ? null : Number(String(s).replace(/,/g, "")));
  const f = (re: RegExp) => flat.match(re);
  let m: RegExpMatchArray | null;

  // ---- System headline figures ----------------------------------------
  const system: Record<string, number | null> = {};
  if ((m = f(/([\d.]+)\s*kW\s+£([\d,]+)\s+£([\d,]+)\s+£([\d,]+)/))) {
    system.size_kwp = num(m[1]); system.annual_savings = num(m[2]);
    system.total_price = num(m[3]); system.net_price = num(m[4]);
  }
  if ((m = f(/Installed capacity of PV system[^\d]*([\d.]+)/i))) system.size_kwp = num(m[1]);
  if ((m = f(/Estimated annual output[^\d]*?([\d,]+)\s*kWh/i))) system.annual_generation_kwh = num(m[1]);
  if (system.annual_generation_kwh == null && (m = f(/([\d,]+)\s*kWh per year/i))) system.annual_generation_kwh = num(m[1]);
  if ((m = f(/Self-sufficiency \(PV Only\)\s+([\d.]+)/i))) system.self_sufficiency_pv = num(m[1]);
  if ((m = f(/Self-sufficiency \(with[^%]*?([\d.]+)\s*%/i))) system.self_sufficiency_eess = num(m[1]);
  if (system.size_kwp == null) warnings.push("system size not found");

  // ---- Panels ----------------------------------------------------------
  const panels: Record<string, any> = {};
  if ((m = f(/(\d+)\s*x\s*(\d+)\s*Watt Panels?\s*\(([^)]+)\)/i))) {
    panels.count = num(m[1]); panels.watts = num(m[2]); panels.model = m[3].trim();
  }
  if ((m = f(/([\d.]+)\s*kW Total Module Power/i))) panels.total_kw = num(m[1]);
  if ((m = f(/([\d,]+)\s*kWh per year/i))) panels.annual_kwh = num(m[1]);
  {
    const i = lines.findIndex((l) => /\bSolar Panels\b/i.test(l));
    if (i >= 0) for (let k = i + 1; k < Math.min(i + 3, lines.length); k++) { const t = lines[k].trim(); if (t) { panels.make = t.split(/\s{2,}/)[0].trim(); break; } }
  }

  // ---- Inverter --------------------------------------------------------
  const inverter: Record<string, any> = {};
  if ((m = f(/([\d.]+)\s*kW of Inverter Power/i))) inverter.kw = num(m[1]);
  if ((m = f(/(\d+)\s*x\s*(Giv-HY[\w.\-]+)/i))) { inverter.count = num(m[1]); inverter.model = m[2].trim(); }
  {
    const i = lines.findIndex((l) => /kW of Inverter Power/i.test(l));
    if (i > 0) { const prev = lines[i - 1].trim(); if (prev) inverter.label = prev.split(/\s{2,}/).pop()!.trim(); }
  }
  if (!inverter.label && (m = f(/((?:GivEnergy|SolarEdge|Solis|Fronius|Sunsynk|Tesla)[^\n]{0,40}?(?:Hybrid|Inverter|Gen)[^\n]{0,20})/i))) inverter.label = m[1].trim();

  // ---- Battery ---------------------------------------------------------
  const battery: Record<string, any> = {};
  if ((m = f(/([\d.]+)\s*kWh of Usable Capacity/i))) battery.usable_kwh = num(m[1]);
  if ((m = f(/(\d+)\s*x\s*(Giv-Bat[\w.\-]+)/i))) { battery.count = num(m[1]); battery.model = m[2].trim(); }
  if ((m = f(/((?:GivEnergy|Tesla|Pylon|Fox|Puredrive)[^\n]{0,30}?(?:kWh|Li-Ion|Battery)[^\n]{0,20})/i))) battery.label = m[1].trim();

  // ---- Components (bill of materials), handling the two-column layout --
  const makeWords = new Set([panels.make, "LONGI", "GIVENERGY", "FASTENSOL", "SOLAREDGE"].filter(Boolean).map((s: any) => String(s).toUpperCase()));
  const known = new Set([panels.model, inverter.model, battery.model].filter(Boolean).map((s) => String(s).toUpperCase()));
  const components: { qty: number | null; code: string; description: string | null }[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < lines.length; i++) {
    const re = /(\d+)\s*x\s*([A-Za-z0-9][A-Za-z0-9.\-\/]{2,})/g; let cm: RegExpExecArray | null;
    while ((cm = re.exec(lines[i])) !== null) {
      const code = cm[2].trim();
      const up = code.toUpperCase();
      if (known.has(up) || makeWords.has(up) || /^\d+$/.test(code)) continue;
      if (seen.has(up)) continue;
      seen.add(up);
      let desc: string | null = null;
      for (let k = i - 1; k >= Math.max(0, i - 3); k--) { const t = lines[k].trim(); if (t && !/\d+\s*x\s/i.test(t) && !/^None$/i.test(t)) { desc = t.split(/\s{2,}/)[0].trim(); break; } }
      components.push({ qty: num(cm[1]), code, description: desc });
    }
  }

  // ---- Property --------------------------------------------------------
  const property: Record<string, any> = {};
  if ((m = f(/\b([A-Z]{1,2}\d{1,2}[A-Z]?\s*\d[A-Z]{2})\b/))) property.postcode = m[1].trim();
  if ((m = f(/Quote #:\s*(\d+)/i))) property.quote_no = m[1];
  { const i = lines.findIndex((l) => /^\s*For:/i.test(l)); if (i >= 0) { const seg = (lines[i].split(/For:/i)[1] || "").trim().split(/\s{2,}/)[0]; if (seg) property.address = seg.trim(); } }

  return {
    source: "opensolar", property, system,
    panels: Object.keys(panels).length ? panels : null,
    inverter: Object.keys(inverter).length ? inverter : null,
    battery: Object.keys(battery).length ? battery : null,
    components, solar: true, _warnings: warnings,
  };
}
