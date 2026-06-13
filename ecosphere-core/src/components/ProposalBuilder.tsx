"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Proposal, ProposalLine, Product, Supplier, MarginRule, ProductCategory, ProposalStatus } from "@/lib/proposal";
import {
  PRODUCT_CATEGORY_LABELS, PRODUCT_CATEGORY_OPTIONS, LINE_SOURCE_LABELS, LINE_SOURCE_COLORS,
  PROPOSAL_STATUS_LABELS, PROPOSAL_STATUS_COLORS,
} from "@/lib/proposal";
import { gbp } from "@/lib/constants";
import { createClient } from "@/lib/supabase/client";
import { sellPrice as sell, markupForMargin, marginForMarkup } from "@/lib/pricing";

const STATUSES: ProposalStatus[] = ["draft", "ready", "sent", "accepted", "rejected", "expired"];

export default function ProposalBuilder({
  proposal, initialLines, products, suppliers, margins, pos,
}: {
  proposal: Proposal & { deals?: { customer_name?: string } };
  initialLines: ProposalLine[];
  products: Product[];
  suppliers: Supplier[];
  margins: MarginRule[];
  pos: any[];
}) {
  const router = useRouter();
  const supabase = createClient();
  const [lines, setLines] = useState<ProposalLine[]>(initialLines);
  const [busGrant, setBusGrant] = useState<number>(Number(proposal.bus_grant));
  const [status, setStatus] = useState<ProposalStatus>(proposal.status);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [addProductId, setAddProductId] = useState("");
  // Margin vs markup helpers now live in @/lib/pricing (imported above).
  const avgMarkup = initialLines.length ? Math.round(initialLines.reduce((a, l) => a + Number(l.markup_pct), 0) / initialLines.length) : 43;
  const [jobMargin, setJobMargin] = useState<number>(marginForMarkup(avgMarkup));
  const [rev, setRev] = useState(0);

  const supplierName = (id: string | null) => suppliers.find((s) => s.id === id)?.name ?? "Unassigned";
  const markupFor = (cat: ProductCategory | null) =>
    Number((margins.find((m) => m.category === cat) ?? margins.find((m) => m.category === null))?.markup_pct ?? 0);

  const totals = useMemo(() => {
    const cost = lines.reduce((s, l) => s + l.qty * l.unit_cost, 0);
    const sellTotal = lines.reduce((s, l) => s + l.qty * sell(l.unit_cost, l.markup_pct), 0);
    return { cost, sell: sellTotal, margin: sellTotal - cost, pays: sellTotal - busGrant };
  }, [lines, busGrant]);
  const needsSku = lines.filter((l) => l.needs_sku).length;

  async function updateLine(id: number, patch: Partial<ProposalLine>) {
    setLines((ls) => ls.map((l) => (l.id === id ? { ...l, ...patch } : l)));
    const { error } = await supabase.from("proposal_lines").update(patch).eq("id", id);
    if (error) setMsg(error.message);
  }
  async function deleteLine(id: number) {
    setLines((ls) => ls.filter((l) => l.id !== id));
    await supabase.from("proposal_lines").delete().eq("id", id);
  }
  async function addLine() {
    const p = products.find((x) => x.id === addProductId);
    if (!p) return;
    const row = {
      proposal_id: proposal.id, product_id: p.id, description: p.name, category: p.category,
      qty: 1, unit: p.unit, unit_cost: Number(p.cost_price), markup_pct: markupFor(p.category),
      vat_rate: Number(p.vat_rate), source: "manual" as const, needs_sku: false,
      sort: lines.length,
    };
    const { data, error } = await supabase.from("proposal_lines").insert(row).select("*").single();
    if (error) { setMsg(error.message); return; }
    setLines((ls) => [...ls, data as ProposalLine]);
    setAddProductId("");
  }
  async function addBlankLine() {
    const row = {
      proposal_id: proposal.id, product_id: null, description: "New line", category: "other" as const,
      qty: 1, unit: "each", unit_cost: 0, markup_pct: markupForMargin(jobMargin),
      vat_rate: 20, source: "manual" as const, needs_sku: false, sort: lines.length,
    };
    const { data, error } = await supabase.from("proposal_lines").insert(row).select("*").single();
    if (error) { setMsg(error.message); return; }
    setLines((ls) => [...ls, data as ProposalLine]);
  }

  function setJobMarginLive(marginPct: number) {
    const mk = markupForMargin(marginPct);
    setLines((ls) => ls.map((l) => ({ ...l, markup_pct: mk })));
    setRev((r) => r + 1);
  }
  async function persistJobMargin(marginPct: number) {
    const mk = markupForMargin(marginPct);
    const { error } = await supabase.from("proposal_lines").update({ markup_pct: mk }).eq("proposal_id", proposal.id);
    if (error) setMsg(error.message); else setMsg(`Job margin ${marginPct}% set — ${mk}% markup on every line.`);
  }

  async function saveGrant(v: number) {
    setBusGrant(v);
    await supabase.from("proposals").update({ bus_grant: v }).eq("id", proposal.id);
  }
  async function saveStatus(s: ProposalStatus) {
    setStatus(s);
    await supabase.from("proposals").update({ status: s }).eq("id", proposal.id);
  }
  async function updatePoStatus(id: string, status: string) {
    await supabase.from("purchase_orders").update({ status }).eq("id", id);
    router.refresh();
  }

  async function generatePOs() {
    setBusy(true); setMsg(null);
    const res = await fetch("/api/proposals/generate-pos", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ proposal_id: proposal.id }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) { setMsg(data.error ?? "PO generation failed"); return; }
    setMsg(`Generated ${data.purchase_orders} purchase order(s).`);
    router.refresh();
  }

  const numCell = "w-20 rounded border border-gray-300 px-2 py-1 text-right text-sm focus:border-teal-600 focus:outline-none";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">{proposal.title}</h1>
          <p className="mt-1 text-sm text-gray-500">
            {proposal.deals?.customer_name ?? "Unlinked"} · {lines.length} lines
            {needsSku > 0 && <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700">{needsSku} need SKU</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select value={status} onChange={(e) => saveStatus(e.target.value as ProposalStatus)}
            className="rounded-lg border border-gray-300 px-2 py-2 text-sm focus:border-teal-600 focus:outline-none"
            style={{ color: PROPOSAL_STATUS_COLORS[status] }}>
            {STATUSES.map((s) => <option key={s} value={s}>{PROPOSAL_STATUS_LABELS[s]}</option>)}
          </select>
          <a href={`/print/proposal/${proposal.id}`} target="_blank" rel="noreferrer" className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">Customer view</a>
          <button onClick={generatePOs} disabled={busy} className="rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-60" style={{ backgroundColor: "#1B7A6E" }}>
            {busy ? "Working…" : "Generate POs"}
          </button>
        </div>
      </div>

      {msg && <div className="rounded-md bg-teal-50 px-3 py-2 text-sm text-teal-800">{msg}</div>}

      {/* Totals */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {[
          { label: "Cost", value: gbp(totals.cost) },
          { label: "Sell (gross)", value: gbp(totals.sell) },
          { label: "Gross margin", value: gbp(totals.margin) },
          { label: "BUS grant", value: null },
          { label: "Customer pays", value: gbp(totals.pays) },
        ].map((c) => (
          <div key={c.label} className="rounded-xl border border-gray-200 bg-white p-3">
            <p className="text-[11px] uppercase tracking-wide text-gray-500">{c.label}</p>
            {c.value !== null ? (
              <p className="mt-1 text-lg font-semibold text-gray-900">{c.value}</p>
            ) : (
              <input type="number" step="100" value={busGrant} onChange={(e) => saveGrant(Number(e.target.value || 0))}
                className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-lg font-semibold text-gray-900 focus:border-teal-600 focus:outline-none" />
            )}
          </div>
        ))}
      </div>

      {/* Job margin slider — one markup across every line */}
      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-gray-700">Job margin — applies to every line</label>
          <span className="text-xl font-bold" style={{ color: "#1B7A6E" }}>{jobMargin}% <span className="text-xs font-medium text-gray-400">margin</span></span>
        </div>
        <input type="range" min={0} max={80} step={1} value={jobMargin}
          onChange={(e) => { const v = Number(e.target.value); setJobMargin(v); setJobMarginLive(v); }}
          onMouseUp={() => persistJobMargin(jobMargin)} onTouchEnd={() => persistJobMargin(jobMargin)}
          className="mt-3 w-full accent-teal-700" />
        <p className="mt-1 text-[11px] text-gray-400">Sets a <strong>{markupForMargin(jobMargin)}% markup</strong> on every line to achieve a {jobMargin}% margin. You can still fine-tune any individual line below.</p>
      </div>

      {/* Lines — every field is editable inline */}
      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs text-gray-500">
            <tr>
              <th className="px-3 py-2 font-medium">Item</th>
              <th className="px-3 py-2 font-medium">Source</th>
              <th className="px-3 py-2 text-right font-medium">Qty</th>
              <th className="px-3 py-2 text-right font-medium">Unit cost</th>
              <th className="px-3 py-2 text-right font-medium">Markup %</th>
              <th className="px-3 py-2 text-right font-medium">Unit sell</th>
              <th className="px-3 py-2 text-right font-medium">Line sell</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {lines.length === 0 && <tr><td colSpan={8} className="px-3 py-6 text-center text-gray-400">No lines.</td></tr>}
            {lines.map((l) => (
              <tr key={l.id} className={`border-t border-gray-100 ${l.needs_sku ? "bg-amber-50" : ""}`}>
                <td className="px-3 py-2">
                  <input type="text" defaultValue={l.description}
                    onBlur={(e) => updateLine(l.id, { description: e.target.value })}
                    className="w-full min-w-[15rem] rounded border border-transparent px-1.5 py-1 text-sm font-medium text-gray-800 hover:border-gray-300 focus:border-teal-600 focus:bg-white focus:outline-none" />
                  <div className="flex items-center gap-1">
                    <select defaultValue={l.category ?? "other"}
                      onChange={(e) => updateLine(l.id, { category: e.target.value as ProductCategory })}
                      className="rounded border border-transparent bg-transparent px-1 py-0.5 text-[11px] text-gray-400 hover:border-gray-300 focus:border-teal-600 focus:text-gray-700 focus:outline-none">
                      {PRODUCT_CATEGORY_OPTIONS.map(([v, lab]) => <option key={v} value={v}>{lab}</option>)}
                    </select>
                    {l.needs_sku && <span className="text-[11px] font-medium text-amber-600">· needs SKU</span>}
                  </div>
                </td>
                <td className="px-3 py-2">
                  <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold text-white" style={{ backgroundColor: LINE_SOURCE_COLORS[l.source] }}>{LINE_SOURCE_LABELS[l.source]}</span>
                </td>
                <td className="px-3 py-2 text-right">
                  <input type="number" step="0.5" defaultValue={l.qty} className={numCell}
                    onBlur={(e) => updateLine(l.id, { qty: Number(e.target.value || 0) })} />
                </td>
                <td className="px-3 py-2 text-right">
                  <input key={`uc-${l.id}-${rev}`} type="number" step="0.01" defaultValue={l.unit_cost} className={numCell}
                    onBlur={(e) => updateLine(l.id, { unit_cost: Number(e.target.value || 0) })} />
                </td>
                <td className="px-3 py-2 text-right">
                  <input key={`mk-${l.id}-${rev}`} type="number" step="1" defaultValue={l.markup_pct} className={numCell}
                    onBlur={(e) => updateLine(l.id, { markup_pct: Number(e.target.value || 0) })} />
                </td>
                <td className="px-3 py-2 text-right text-gray-600">{gbp(sell(l.unit_cost, l.markup_pct))}</td>
                <td className="px-3 py-2 text-right font-semibold text-gray-900">
                  {gbp(l.qty * sell(l.unit_cost, l.markup_pct))}
                  {l.unit_cost > 0 && (
                    <span className="ml-1 rounded bg-green-100 px-1 py-0.5 text-[10px] font-semibold text-green-700">+{gbp(l.qty * (sell(l.unit_cost, l.markup_pct) - l.unit_cost))}</span>
                  )}
                </td>
                <td className="px-3 py-2 text-right">
                  <button onClick={() => deleteLine(l.id)} className="text-gray-400 hover:text-red-600" aria-label="Delete line">×</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex flex-wrap items-center gap-2 border-t border-gray-100 p-3">
          <select value={addProductId} onChange={(e) => setAddProductId(e.target.value)}
            className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:border-teal-600 focus:outline-none">
            <option value="">+ add from catalogue…</option>
            {products.map((p) => <option key={p.id} value={p.id}>{p.name} ({gbp(p.cost_price)})</option>)}
          </select>
          <button onClick={addLine} disabled={!addProductId} className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">Add</button>
          <button onClick={addBlankLine} className="rounded-lg border border-dashed border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50">+ Blank line</button>
        </div>
      </div>

      {/* Purchase orders */}
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="mb-3 text-sm font-semibold text-gray-800">Purchase orders</h2>
        {(!pos || pos.length === 0) ? (
          <p className="text-sm text-gray-400">No POs yet. Click “Generate POs” to create supplier and subcontractor orders from the lines.</p>
        ) : (
          <div className="space-y-2">
            {pos.map((po) => {
              const cost = (po.po_lines ?? []).reduce((s: number, l: any) => s + Number(l.qty) * Number(l.unit_cost), 0);
              return (
                <div key={po.id} className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2">
                  <div>
                    <p className="text-sm font-medium text-gray-800">
                      {po.type === "subcontractor" ? "Subcontractor PO" : "Supplier PO"} · {supplierName(po.supplier_id)}
                    </p>
                    <p className="text-[11px] text-gray-400">{(po.po_lines ?? []).length} lines</p>
                    <select value={po.status} onChange={(e) => updatePoStatus(po.id, e.target.value)}
                      className="mt-1 rounded border border-gray-300 px-1.5 py-0.5 text-[11px] focus:border-teal-600 focus:outline-none">
                      {["draft","sent","confirmed","received","cancelled"].map((st) => <option key={st} value={st}>{st}</option>)}
                    </select>
                  </div>
                  <span className="text-sm font-semibold text-gray-900">{gbp(cost)}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
