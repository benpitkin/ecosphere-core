import { gbp } from "@/lib/constants";
import type { ProposalLine, ProductCategory } from "@/lib/proposal";
import {
  COMPANY,
  CUSTOMER_GROUP_LABELS, CUSTOMER_GROUP_ORDER, HEADLINE_GROUPS,
  groupForCategory, specChips, lineImage, GROUP_IMAGE, type CustomerGroupKey,
} from "@/lib/proposalContent";
import type { McsSummary } from "@/lib/proposalMcs";
import { resolveCustomerContent } from "@/lib/proposalCustomer";
import PrintButton from "@/components/PrintButton";
import ShareLinkButton from "@/components/ShareLinkButton";
import HeatLossReveal from "@/components/HeatLossReveal";

const TEAL = "#1B7A6E";

// Simple horizontal comparison bars (SVG, print-safe, no JS).
function CompareBars({ title, unit, items }: { title: string; unit: string; items: { label: string; value: number; color: string }[] }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  const rowH = 30, w = 460, labelW = 70, barW = w - labelW - 90;
  return (
    <div className="mt-3">
      <p className="mb-1 text-xs font-semibold text-gray-700">{title}</p>
      <svg viewBox={`0 0 ${w} ${items.length * rowH + 6}`} className="w-full" role="img">
        {items.map((it, i) => {
          const len = Math.max(2, (it.value / max) * barW);
          const y = i * rowH + 4;
          return (
            <g key={i}>
              <text x={0} y={y + 15} className="fill-gray-600" style={{ fontSize: 11 }}>{it.label}</text>
              <rect x={labelW} y={y} width={len} height={18} rx={3} fill={it.color} />
              <text x={labelW + len + 6} y={y + 14} className="fill-gray-800" style={{ fontSize: 11, fontWeight: 600 }}>{unit}{Math.round(it.value).toLocaleString()}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export type DocLineRow = ProposalLine & { products?: { attrs?: Record<string, any> | null } | null };

export default function ProposalDocument({
  proposal, lines, mcs, customer, shareToken, reportUrl,
}: {
  proposal: any;
  lines: DocLineRow[];
  mcs: McsSummary;
  customer: boolean;
  shareToken?: string | null;
  reportUrl?: string | null;
}) {
  const ls = lines;
  const sell = (l: DocLineRow) => Math.round(l.unit_cost * (1 + l.markup_pct / 100) * 100) / 100;
  const lineSell = (l: DocLineRow) => l.qty * sell(l);
  const subtotal = ls.reduce((s, l) => s + lineSell(l), 0);
  const vatTotal = Math.round(ls.reduce((s, l) => s + lineSell(l) * (Number(l.vat_rate) || 0) / 100, 0) * 100) / 100;
  const grant = Number(proposal.bus_grant) || 0;
  const totalIncVat = subtotal + vatTotal;
  const customerPays = totalIncVat - grant;

  const created = proposal.created_at ? new Date(proposal.created_at) : new Date();
  const issued = created.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  const validUntil = new Date(created.getTime() + 30 * 86400000).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  const cust = proposal.deals;
  const ref = `#${String(proposal.id).slice(0, 8).toUpperCase()}`;

  type Grp = { key: CustomerGroupKey; lines: DocLineRow[]; sell: number; qty: number };
  const groups = new Map<CustomerGroupKey, Grp>();
  for (const l of ls) {
    const key = groupForCategory(l.category as ProductCategory | null);
    if (!groups.has(key)) groups.set(key, { key, lines: [], sell: 0, qty: 0 });
    const g = groups.get(key)!;
    g.lines.push(l); g.sell += lineSell(l); g.qty += Number(l.qty);
  }
  const orderedGroups = CUSTOMER_GROUP_ORDER.filter((k) => groups.has(k)).map((k) => groups.get(k)!);
  const has = (k: CustomerGroupKey) => groups.has(k);
  const hasASHP = has("heat_pump") || has("cylinder") || has("radiators");
  const hasSolar = has("solar") || has("inverter") || has("battery");
  const typeLabel = hasASHP && hasSolar ? "Renewable energy proposal"
    : hasASHP ? "Heat pump proposal" : hasSolar ? "Solar & battery proposal" : "Renewable energy proposal";

  const attrOf = (k: CustomerGroupKey, key: string) => {
    const g = groups.get(k); if (!g) return null;
    for (const l of g.lines) { const v = l.products?.attrs?.[key]; if (v != null) return v; }
    return null;
  };
  const hero: { label: string; value: string }[] = [];
  if (has("heat_pump")) { const kw = attrOf("heat_pump", "kw") ?? mcs.capacityAtDesignKw; hero.push({ label: "Heat pump", value: kw ? `${kw} kW` : "Included" }); }
  if (has("solar")) { const kwp = attrOf("solar", "kwp"); const nn = groups.get("solar")!.qty; hero.push({ label: "Solar array", value: kwp ? `${kwp} kWp` : `${nn} panels` }); }
  if (has("battery")) { const kwh = attrOf("battery", "kwh"); hero.push({ label: "Battery storage", value: kwh ? `${kwh} kWh` : "Included" }); }
  if (has("cylinder")) { const lit = attrOf("cylinder", "litres") ?? mcs.cylinderLitres; hero.push({ label: "Hot water", value: lit ? `${lit} L cylinder` : "Cylinder" }); }
  if (has("radiators")) hero.push({ label: "Emitters", value: `${groups.get("radiators")!.qty} radiators` });

  const firstName = cust?.customer_name?.split(" ")[0] ?? "there";
  const content = resolveCustomerContent(proposal.customer_content, {
    firstName,
    customerName: cust?.customer_name ?? "Customer",
    address: cust?.address ?? null,
    hasASHP, hasSolar, mcs,
  });
  const reportPath = proposal.heatloss_report_path ?? null;

  const schedule = [
    { label: "Deposit", when: "On acceptance of this proposal", pct: "25%", amount: Math.round(customerPays * 0.25) },
    { label: "On commencement", when: "Day work begins on site", pct: "65%", amount: Math.round(customerPays * 0.65) },
    { label: "On completion", when: "Handover & commissioning", pct: "10%", amount: 0 },
  ];
  schedule[2].amount = customerPays - schedule[0].amount - schedule[1].amount;

  const watermarkText = `Prepared exclusively for ${cust?.customer_name ?? "the customer"}${cust?.postcode ? " · " + cust.postcode : ""} · ${COMPANY.name} · Not for redistribution`;

  // Figure tiles for the MCS system-design summary.
  const figs: { label: string; value: string }[] = [];
  if (mcs.totalKw != null) figs.push({ label: "Design heat loss", value: `${mcs.totalKw} kW` });
  if (mcs.floorAreaM2 != null) figs.push({ label: "Floor area", value: `${mcs.floorAreaM2} m²` });
  if (mcs.avgWm2 != null) figs.push({ label: "Heat demand", value: `${mcs.avgWm2} W/m²` });
  if (mcs.designOutdoorC != null) figs.push({ label: "Design outdoor temp", value: `${mcs.designOutdoorC}°C` });
  if (mcs.designFlowTempC != null) figs.push({ label: "Flow temperature", value: `${mcs.designFlowTempC}°C` });
  if (mcs.deltaTC != null) figs.push({ label: "System ΔT", value: `${mcs.deltaTC}°C` });
  if (mcs.scop != null) figs.push({ label: "Efficiency (SCOP)", value: `${mcs.scop}` });
  if (mcs.coveragePct != null) figs.push({ label: "Heat demand met", value: `${mcs.coveragePct}%` });

  // Technical datasheets: every line whose part has a stored datasheet, de-duped.
  const datasheets = (() => {
    const seen = new Set<string>();
    const out: { label: string; url: string }[] = [];
    for (const l of ls) {
      const url = l.products?.attrs?.datasheet_url as string | undefined;
      if (url && !seen.has(url)) { seen.add(url); out.push({ label: l.description, url }); }
    }
    return out;
  })();

  return (
    <div className="relative mx-auto max-w-3xl bg-white p-8 text-gray-800">
      <style>{`@media print { .no-print { display:none !important; } body { background:#fff; } section { break-inside: avoid; } } @page { margin: 16mm; }`}</style>

      {customer && (
        <div aria-hidden className="pointer-events-none absolute inset-0 z-0 overflow-hidden select-none">
          <div className="flex h-full w-full flex-wrap content-start gap-x-10 gap-y-16 p-6" style={{ transform: "rotate(-28deg) scale(1.4)", transformOrigin: "center" }}>
            {Array.from({ length: 60 }).map((_, i) => (
              <span key={i} className="whitespace-nowrap text-[10px] font-semibold uppercase tracking-wide" style={{ color: TEAL, opacity: 0.05 }}>{watermarkText}</span>
            ))}
          </div>
        </div>
      )}

      <div className="relative z-10">
        <div className="no-print mb-4 flex justify-end gap-2">
          {!customer && shareToken && <ShareLinkButton token={shareToken} />}
          <PrintButton />
        </div>

        {/* A. Cover & headline */}
        <header className="flex items-start justify-between border-b-2 pb-5" style={{ borderColor: TEAL }}>
          <div className="flex items-center gap-3">
            <span className="grid h-12 w-12 place-items-center rounded-xl text-xl font-bold text-white" style={{ backgroundColor: TEAL }}>E</span>
            <div>
              <p className="text-lg font-semibold text-gray-900">{COMPANY.name}</p>
              <p className="text-xs text-gray-500">{COMPANY.tagline}</p>
            </div>
          </div>
          <div className="text-right text-xs text-gray-500">
            <p className="text-sm font-semibold" style={{ color: TEAL }}>{typeLabel}</p>
            <p>{ref}</p>
            <p>Issued {issued}</p>
            <p>Valid until {validUntil}</p>
          </div>
        </header>

        <div className="mt-5 grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-gray-400">Prepared for</p>
            <p className="font-medium text-gray-900">{cust?.customer_name ?? "Customer"}</p>
            {cust?.address && <p className="text-sm text-gray-600">{cust.address}{cust.postcode ? `, ${cust.postcode}` : ""}</p>}
            {cust?.email && <p className="text-sm text-gray-600">{cust.email}</p>}
          </div>
          <div className="rounded-xl p-4 text-right" style={{ backgroundColor: "#F0F7F5" }}>
            <p className="text-xs uppercase tracking-wide text-gray-500">Your investment</p>
            <p className="text-3xl font-bold" style={{ color: TEAL }}>{gbp(customerPays)}</p>
            <p className="text-xs text-gray-500">after {gbp(grant)} Boiler Upgrade Scheme grant</p>
          </div>
        </div>

        <div className="mt-5 text-sm leading-relaxed text-gray-700">
          <p>Dear {firstName},</p>
          <p className="mt-2 whitespace-pre-line">{content.intro}</p>
        </div>

        {/* B. At a glance */}
        {hero.length > 0 && (
          <section className="mt-6">
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide" style={{ color: TEAL }}>At a glance</h2>
            <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.min(hero.length, 4)}, minmax(0,1fr))` }}>
              {hero.map((h) => (
                <div key={h.label} className="rounded-xl border border-gray-200 p-3 text-center">
                  <p className="text-lg font-bold text-gray-900">{h.value}</p>
                  <p className="text-[11px] text-gray-500">{h.label}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* C. Proposed system */}
        <section className="mt-6">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide" style={{ color: TEAL }}>Your proposed system</h2>
          <div className="space-y-2">
            {orderedGroups.filter((g) => HEADLINE_GROUPS.includes(g.key)).map((g) => (
              <div key={g.key} className="rounded-xl border border-gray-200 p-3">
                <div className="mb-2 flex items-baseline justify-between">
                  <p className="text-sm font-semibold text-gray-900">{CUSTOMER_GROUP_LABELS[g.key]}</p>
                  <p className="text-xs text-gray-400">{g.qty} {g.qty === 1 ? "unit" : "units"}</p>
                </div>
                <div className="space-y-2">
                  {g.lines.map((l) => {
                    const chips = specChips(l.products?.attrs);
                    return (
                      <div key={l.id} className="flex items-center gap-3">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={lineImage(l.products?.attrs, g.key)} alt={l.description} className="h-12 w-16 shrink-0 rounded-md border border-gray-100 object-contain p-1" style={{ backgroundColor: "#F0F7F5" }} />
                        <div className="min-w-0">
                          <p className="text-sm text-gray-800">{l.description}</p>
                          {chips.length > 0 && (
                            <div className="mt-0.5 flex flex-wrap gap-1">
                              {chips.map((c) => (
                                <span key={c} className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-600">{c}</span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
            {(has("materials") || has("labour")) && (
              <div className="flex items-center gap-3 rounded-xl border border-gray-200 p-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={GROUP_IMAGE[has("materials") ? "materials" : "labour"]} alt="Installation kit" className="h-12 w-16 shrink-0 rounded-md border border-gray-100 object-contain p-1" style={{ backgroundColor: "#F0F7F5" }} />
                <p className="text-sm text-gray-600">
                  {has("materials") && <span>Mounting, cabling, valves and electrical kit. </span>}
                  {has("labour") && <span>Full installation labour, commissioning and handover.</span>}
                </p>
              </div>
            )}
          </div>
        </section>

        {/* D. System design & heat loss (MCS) */}
        {mcs.hasHeatLoss && content.show.heatLoss && (
          <section className="mt-6">
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide" style={{ color: TEAL }}>System design &amp; heat loss</h2>
            <p className="mb-3 whitespace-pre-line text-sm leading-relaxed text-gray-700">{content.heatLossNarrative}</p>
            {figs.length > 0 && (
              <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(4, minmax(0,1fr))" }}>
                {figs.map((f) => (
                  <div key={f.label} className="rounded-lg border border-gray-200 p-2 text-center">
                    <p className="text-sm font-bold text-gray-900">{f.value}</p>
                    <p className="text-[10px] leading-tight text-gray-500">{f.label}</p>
                  </div>
                ))}
              </div>
            )}
            {/* Room-by-room emitter design: full in internal mode, gated in customer mode */}
            {customer ? (
              <div className="mt-4">
                <HeatLossReveal token={shareToken ?? ""} count={mcs.emitters.length} hasReport={!!reportPath} />
              </div>
            ) : (
              mcs.emitters.length > 0 && (
                <div className="mt-4">
                  <p className="mb-1 text-xs font-semibold text-gray-700">Room-by-room emitter design ({mcs.emitters.length})</p>
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-gray-200 text-left text-gray-500">
                        <th className="py-1 font-medium">Room</th>
                        <th className="py-1 font-medium">Action</th>
                        <th className="py-1 font-medium">Emitter</th>
                        <th className="py-1 font-medium">Size</th>
                      </tr>
                    </thead>
                    <tbody>
                      {mcs.emitters.map((e, i) => (
                        <tr key={i} className="border-b border-gray-100">
                          <td className="py-1 text-gray-800">{e.room ?? "—"}</td>
                          <td className="py-1 capitalize text-gray-600">{e.status}</td>
                          <td className="py-1 text-gray-600">{e.type ?? "Radiator"}</td>
                          <td className="py-1 text-gray-600">{e.size ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            )}
            {!customer && reportUrl && (
              <p className="mt-3 text-xs">
                <a href={reportUrl} target="_blank" rel="noreferrer" className="font-semibold" style={{ color: TEAL }}>View full MCS heat loss report (PDF) →</a>
              </p>
            )}
          </section>
        )}

        {/* E. Performance & savings */}
        {content.show.performance && (
          <section className="mt-6">
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide" style={{ color: TEAL }}>Performance &amp; savings</h2>
            {(() => {
              const p = content.performance;
              const tiles: { label: string; value: string }[] = [];
              if (p.scop != null) tiles.push({ label: "Efficiency (SCOP)", value: `${p.scop}` });
              if (p.runningCostNew != null) tiles.push({ label: "Heat pump running cost", value: `${gbp(p.runningCostNew)}/yr` });
              if (p.runningCostOld != null && p.runningCostNew != null) tiles.push({ label: "Annual saving", value: `${gbp(Math.max(0, p.runningCostOld - p.runningCostNew))}/yr` });
              if (p.annualDemandKwh != null) tiles.push({ label: "Annual heat demand", value: `${Math.round(p.annualDemandKwh).toLocaleString()} kWh` });
              return tiles.length > 0 ? (
                <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.min(tiles.length, 4)}, minmax(0,1fr))` }}>
                  {tiles.map((t) => (
                    <div key={t.label} className="rounded-lg border border-gray-200 p-2 text-center">
                      <p className="text-sm font-bold text-gray-900">{t.value}</p>
                      <p className="text-[10px] leading-tight text-gray-500">{t.label}</p>
                    </div>
                  ))}
                </div>
              ) : null;
            })()}
            {content.performance.runningCostOld != null && content.performance.runningCostNew != null && (
              <CompareBars title="Estimated annual running cost" unit="£" items={[
                { label: "Now", value: content.performance.runningCostOld, color: "#9CA3AF" },
                { label: "Heat pump", value: content.performance.runningCostNew, color: TEAL },
              ]} />
            )}
            {content.performance.co2Old != null && content.performance.co2New != null && (
              <CompareBars title="Estimated annual carbon (tonnes CO₂)" unit="" items={[
                { label: "Now", value: content.performance.co2Old, color: "#9CA3AF" },
                { label: "Heat pump", value: content.performance.co2New, color: TEAL },
              ]} />
            )}
            {content.performanceNote && <p className="mt-3 text-[11px] leading-snug text-gray-500">{content.performanceNote}</p>}
          </section>
        )}

        {/* H. Itemised quote */}
        <section className="mt-6">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide" style={{ color: TEAL }}>Your quote</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-xs text-gray-500">
                <th className="py-2 font-medium">Item</th>
                <th className="py-2 text-right font-medium">Price</th>
              </tr>
            </thead>
            <tbody>
              {orderedGroups.map((g) => (
                <tr key={g.key} className="border-b border-gray-100">
                  <td className="py-2 text-gray-800">{CUSTOMER_GROUP_LABELS[g.key]}</td>
                  <td className="py-2 text-right text-gray-900">{gbp(g.sell)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-3 ml-auto w-72 space-y-1 text-sm">
            <div className="flex justify-between"><span className="text-gray-500">Subtotal</span><span className="text-gray-900">{gbp(subtotal)}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">VAT ({vatTotal === 0 ? "0%" : "applied"})</span><span className="text-gray-900">{gbp(vatTotal)}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Boiler Upgrade Scheme grant</span><span className="text-gray-900">&minus;{gbp(grant)}</span></div>
            <div className="flex justify-between border-t-2 pt-1 text-base font-bold" style={{ borderColor: TEAL }}><span>You pay</span><span style={{ color: TEAL }}>{gbp(customerPays)}</span></div>
          </div>
        </section>

        {/* I. Scope of works / explanation of works */}
        {content.show.scope && content.scopeItems.length > 0 && (
          <section className="mt-6">
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide" style={{ color: TEAL }}>{content.scopeTitle}</h2>
            <ul className="grid grid-cols-1 gap-1 text-sm text-gray-700 sm:grid-cols-2">
              {content.scopeItems.map((s, i) => (
                <li key={i} className="flex gap-2"><span style={{ color: TEAL }}>✓</span><span>{s}</span></li>
              ))}
            </ul>
          </section>
        )}

        {/* J. Payment schedule */}
        <section className="mt-6">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide" style={{ color: TEAL }}>Payment schedule</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-xs text-gray-500">
                <th className="py-2 font-medium">Stage</th><th className="py-2 font-medium">When</th>
                <th className="py-2 text-right font-medium">%</th><th className="py-2 text-right font-medium">Amount</th>
              </tr>
            </thead>
            <tbody>
              {schedule.map((s) => (
                <tr key={s.label} className="border-b border-gray-100">
                  <td className="py-2 font-medium text-gray-800">{s.label}</td>
                  <td className="py-2 text-gray-500">{s.when}</td>
                  <td className="py-2 text-right text-gray-600">{s.pct}</td>
                  <td className="py-2 text-right text-gray-900">{gbp(s.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-[11px] text-gray-400">Prefer to pay in full? You can settle the {gbp(customerPays)} balance on commissioning by arrangement. Your BUS grant of {gbp(grant)} is redeemed by us directly with Ofgem and is already deducted.</p>
        </section>

        {/* K. Compliance */}
        {content.show.compliance && content.compliance.length > 0 && (
          <section className="mt-6">
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide" style={{ color: TEAL }}>Compliance &amp; your protection</h2>
            <div className="grid grid-cols-1 gap-x-5 gap-y-2 sm:grid-cols-2">
              {content.compliance.map((b, i) => (
                <div key={i}>
                  <p className="text-xs font-semibold text-gray-800">{b.heading}</p>
                  <p className="text-[11px] leading-snug text-gray-500">{b.body}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* L. Technical datasheets */}
        {datasheets.length > 0 && (
          <section className="mt-6">
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide" style={{ color: TEAL }}>Technical datasheets</h2>
            <p className="mb-2 text-[11px] text-gray-500">Manufacturer datasheets for the equipment specified in this proposal.</p>
            <ul className="space-y-1 text-sm">
              {datasheets.map((d, i) => (
                <li key={i} className="flex gap-2">
                  <span style={{ color: TEAL }}>•</span>
                  <a href={d.url} target="_blank" rel="noreferrer" className="font-medium hover:underline" style={{ color: TEAL }}>
                    {d.label} — datasheet (PDF) →
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* M. Next steps */}
        <section className="mt-6 rounded-xl border border-gray-200 p-4">
          <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide" style={{ color: TEAL }}>Next steps</h2>
          <p className="whitespace-pre-line text-sm text-gray-700">{content.nextSteps}</p>
          <div className="mt-3 flex flex-wrap items-end justify-between gap-3 text-xs text-gray-500">
            <div className="flex-1">
              <div className="mb-1 h-8 border-b border-gray-300" style={{ minWidth: 180 }} />
              <span>Customer signature &amp; date</span>
            </div>
            <div className="text-right">
              <p>{COMPANY.name} · {COMPANY.phone}</p>
              <p>{COMPANY.email} · {COMPANY.web}</p>
              <p>Co. {COMPANY.companyNo} · VAT {COMPANY.vatNo}</p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
