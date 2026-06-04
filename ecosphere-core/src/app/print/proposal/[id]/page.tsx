import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { gbp } from "@/lib/constants";
import type { ProposalLine, ProductCategory } from "@/lib/proposal";
import {
  COMPANY, SCOPE_ASHP, SCOPE_SOLAR, COMPLIANCE_BLOCKS,
  CUSTOMER_GROUP_LABELS, CUSTOMER_GROUP_ORDER, HEADLINE_GROUPS,
  groupForCategory, specChips, lineImage, GROUP_IMAGE, type CustomerGroupKey,
} from "@/lib/proposalContent";
import PrintButton from "@/components/PrintButton";

export const dynamic = "force-dynamic";

type LineRow = ProposalLine & { products?: { attrs?: Record<string, any> | null } | null };

const TEAL = "#1B7A6E";

export default async function PrintProposal({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: proposal, error } = await supabase
    .from("proposals").select("*, deals(customer_name, address, postcode, email)").eq("id", params.id).single();
  if (error || !proposal) notFound();

  const { data: lines } = await supabase
    .from("proposal_lines").select("*, products(attrs)").eq("proposal_id", params.id).order("sort");
  const ls = (lines ?? []) as LineRow[];

  const sell = (l: LineRow) => Math.round(l.unit_cost * (1 + l.markup_pct / 100) * 100) / 100;
  const lineSell = (l: LineRow) => l.qty * sell(l);
  const subtotal = ls.reduce((s, l) => s + lineSell(l), 0);
  const vatTotal = Math.round(ls.reduce((s, l) => s + lineSell(l) * (Number(l.vat_rate) || 0) / 100, 0) * 100) / 100;
  const grant = Number(proposal.bus_grant) || 0;
  const totalIncVat = subtotal + vatTotal;
  const customerPays = totalIncVat - grant;

  const created = proposal.created_at ? new Date(proposal.created_at) : new Date();
  const issued = created.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  const validUntil = new Date(created.getTime() + 30 * 86400000).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  const cust = (proposal as any).deals;
  const ref = `#${String(proposal.id).slice(0, 8).toUpperCase()}`;

  // ---- Group lines for the customer view ----
  type Grp = { key: CustomerGroupKey; lines: LineRow[]; sell: number; qty: number };
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

  // ---- At-a-glance hero stats ----
  const attrOf = (k: CustomerGroupKey, key: string) => {
    const g = groups.get(k); if (!g) return null;
    for (const l of g.lines) { const v = l.products?.attrs?.[key]; if (v != null) return v; }
    return null;
  };
  const hero: { label: string; value: string }[] = [];
  if (has("heat_pump")) { const kw = attrOf("heat_pump", "kw"); hero.push({ label: "Heat pump", value: kw ? `${kw} kW` : "Included" }); }
  if (has("solar")) { const kwp = attrOf("solar", "kwp"); const n = groups.get("solar")!.qty; hero.push({ label: "Solar array", value: kwp ? `${kwp} kWp` : `${n} panels` }); }
  if (has("battery")) { const kwh = attrOf("battery", "kwh"); hero.push({ label: "Battery storage", value: kwh ? `${kwh} kWh` : "Included" }); }
  if (has("cylinder")) { const lit = attrOf("cylinder", "litres"); hero.push({ label: "Hot water", value: lit ? `${lit} L cylinder` : "Cylinder" }); }
  if (has("radiators")) hero.push({ label: "Emitters", value: `${groups.get("radiators")!.qty} radiators` });

  const scope = [
    ...(hasASHP ? SCOPE_ASHP : []),
    ...(hasSolar ? SCOPE_SOLAR : []),
  ];

  const schedule = [
    { label: "Deposit", when: "On acceptance of this proposal", pct: "25%", amount: Math.round(customerPays * 0.25) },
    { label: "On commencement", when: "Day work begins on site", pct: "65%", amount: Math.round(customerPays * 0.65) },
    { label: "On completion", when: "Handover & commissioning", pct: "10%", amount: 0 },
  ];
  schedule[2].amount = customerPays - schedule[0].amount - schedule[1].amount;

  return (
    <div className="mx-auto max-w-3xl bg-white p-8 text-gray-800">
      <style>{`@media print { .no-print { display:none !important; } body { background:#fff; } section { break-inside: avoid; } } @page { margin: 16mm; }`}</style>
      <div className="no-print mb-4 flex justify-end"><PrintButton /></div>

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

      <p className="mt-5 text-sm leading-relaxed text-gray-700">
        Dear {cust?.customer_name?.split(" ")[0] ?? "there"}, thank you for considering {COMPANY.name}. Following our assessment
        we&apos;ve designed the system below to suit your property, priced transparently and to MCS standards. We look forward to
        helping you make the switch.
      </p>

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

      {/* C. Proposed system — component cards with part images (Spruce-style) */}
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

      {/* H. Itemised quote (grouped, lean) */}
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

      {/* I. Scope of works */}
      {scope.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide" style={{ color: TEAL }}>What we&apos;ll do</h2>
          <ul className="grid grid-cols-1 gap-1 text-sm text-gray-700 sm:grid-cols-2">
            {scope.map((s, i) => (
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

      {/* K. Compliance & protection */}
      <section className="mt-6">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide" style={{ color: TEAL }}>Compliance &amp; your protection</h2>
        <div className="grid grid-cols-1 gap-x-5 gap-y-2 sm:grid-cols-2">
          {COMPLIANCE_BLOCKS.map((b) => (
            <div key={b.heading}>
              <p className="text-xs font-semibold text-gray-800">{b.heading}</p>
              <p className="text-[11px] leading-snug text-gray-500">{b.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* M. Acceptance & next steps */}
      <section className="mt-6 rounded-xl border border-gray-200 p-4">
        <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide" style={{ color: TEAL }}>Next steps</h2>
        <p className="text-sm text-gray-700">To proceed, accept this proposal or sign and return it. We&apos;ll then issue your deposit invoice and book your technical survey and installation. After commissioning you&apos;ll receive your MCS certificate and full handover pack.</p>
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
  );
}
