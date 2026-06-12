"use client";

import { useEffect, useState } from "react";
import type { CustomerContent } from "@/lib/proposalCustomer";

const TEAL = "#1B7A6E";
const field = "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-teal-600 focus:outline-none";
const label = "mb-1 block text-xs font-semibold text-gray-600";

// Per-proposal editor for the customer-facing document. Loads the current
// (resolved) content, lets you edit every section + upload the MCS heat-loss PDF,
// and saves overrides. The print + gated customer views render what you save here.
export default function CustomerDocEditor({ proposalId, printHref }: { proposalId: string; printHref: string }) {
  const [open, setOpen] = useState(false);
  const [c, setC] = useState<CustomerContent | null>(null);
  const [hasReport, setHasReport] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!open || c) return;
    fetch(`/api/proposals/${proposalId}/content`).then((r) => r.json()).then((d) => {
      if (d.content) setC(d.content);
      setHasReport(!!d.hasReport);
    }).catch(() => setMsg("Couldn't load content"));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetch content once when the editor opens; guarded by `c`
  }, [open]);

  function set<K extends keyof CustomerContent>(k: K, v: CustomerContent[K]) { setC((p) => p ? { ...p, [k]: v } : p); }
  function setPerf(k: string, v: string) {
    setC((p) => p ? { ...p, performance: { ...p.performance, [k]: v === "" ? null : Number(v) } } : p);
  }
  function setShow(k: string, v: boolean) { setC((p) => p ? { ...p, show: { ...p.show, [k]: v } } : p); }

  async function save() {
    if (!c) return;
    setSaving(true); setMsg(null);
    const res = await fetch(`/api/proposals/${proposalId}/content`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content: c }),
    });
    setSaving(false);
    setMsg(res.ok ? "Saved" : "Save failed");
    setTimeout(() => setMsg(null), 2500);
  }

  async function uploadReport(file: File) {
    setUploading(true); setMsg(null);
    const fd = new FormData(); fd.append("file", file);
    const res = await fetch(`/api/proposals/${proposalId}/heatloss-report`, { method: "POST", body: fd });
    setUploading(false);
    if (res.ok) { setHasReport(true); setMsg("Report attached"); } else { setMsg("Upload failed"); }
    setTimeout(() => setMsg(null), 2500);
  }
  async function removeReport() {
    await fetch(`/api/proposals/${proposalId}/heatloss-report`, { method: "DELETE" });
    setHasReport(false); setMsg("Report removed"); setTimeout(() => setMsg(null), 2500);
  }

  const perfFields: { k: string; label: string }[] = [
    { k: "runningCostOld", label: "Current running cost £/yr" },
    { k: "runningCostNew", label: "Heat pump running cost £/yr" },
    { k: "co2Old", label: "Current CO₂ t/yr" },
    { k: "co2New", label: "Heat pump CO₂ t/yr" },
    { k: "annualDemandKwh", label: "Annual heat demand kWh" },
    { k: "scop", label: "SCOP" },
  ];

  return (
    <div className="mt-6 rounded-xl border border-gray-200 bg-white">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between px-4 py-3 text-left">
        <span className="text-sm font-semibold text-gray-900">Customer document — edit content</span>
        <span className="flex items-center gap-3 text-xs">
          <a href={printHref} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="font-medium" style={{ color: TEAL }}>Open customer view ↗</a>
          <span className="text-gray-400">{open ? "▲" : "▼"}</span>
        </span>
      </button>

      {open && (
        <div className="space-y-5 border-t border-gray-100 p-4">
          {!c ? (
            <p className="text-sm text-gray-500">Loading…</p>
          ) : (
            <>
              {/* Section toggles */}
              <div className="flex flex-wrap gap-3 rounded-lg bg-gray-50 p-3 text-xs">
                <span className="font-semibold text-gray-600">Show sections:</span>
                {(["heatLoss", "performance", "scope", "compliance", "report"] as const).map((k) => (
                  <label key={k} className="flex items-center gap-1 text-gray-700">
                    <input type="checkbox" checked={(c.show as any)[k]} onChange={(e) => setShow(k, e.target.checked)} className="h-3.5 w-3.5 accent-teal-700" />
                    {k === "heatLoss" ? "Heat loss" : k === "report" ? "MCS report" : k.charAt(0).toUpperCase() + k.slice(1)}
                  </label>
                ))}
              </div>

              <div>
                <label className={label}>Opening statement</label>
                <textarea value={c.intro} onChange={(e) => set("intro", e.target.value)} rows={4} className={field} />
              </div>

              <div>
                <label className={label}>Heat loss / system design narrative</label>
                <textarea value={c.heatLossNarrative} onChange={(e) => set("heatLossNarrative", e.target.value)} rows={4} className={field} />
              </div>

              {/* Explanation of works */}
              <div>
                <label className={label}>Section title (explanation of works)</label>
                <input value={c.scopeTitle} onChange={(e) => set("scopeTitle", e.target.value)} className={`${field} mb-2`} />
                {c.scopeItems.map((s, i) => (
                  <div key={i} className="mb-1 flex gap-2">
                    <input value={s} onChange={(e) => set("scopeItems", c.scopeItems.map((x, j) => j === i ? e.target.value : x))} className={field} />
                    <button onClick={() => set("scopeItems", c.scopeItems.filter((_, j) => j !== i))} className="px-2 text-gray-400 hover:text-red-600">✕</button>
                  </div>
                ))}
                <button onClick={() => set("scopeItems", [...c.scopeItems, ""])} className="mt-1 text-xs font-medium" style={{ color: TEAL }}>+ Add line</button>
              </div>

              {/* Performance */}
              <div>
                <label className={label}>Performance figures (leave blank to hide)</label>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {perfFields.map((f) => (
                    <div key={f.k}>
                      <span className="text-[10px] text-gray-500">{f.label}</span>
                      <input type="number" step="any" value={(c.performance as any)[f.k] ?? ""} onChange={(e) => setPerf(f.k, e.target.value)} className={field} />
                    </div>
                  ))}
                </div>
                <textarea value={c.performanceNote} onChange={(e) => set("performanceNote", e.target.value)} rows={2} className={`${field} mt-2`} placeholder="Performance note" />
              </div>

              {/* Compliance */}
              <div>
                <label className={label}>Compliance &amp; protection</label>
                {c.compliance.map((b, i) => (
                  <div key={i} className="mb-2 rounded-lg border border-gray-200 p-2">
                    <div className="flex gap-2">
                      <input value={b.heading} onChange={(e) => set("compliance", c.compliance.map((x, j) => j === i ? { ...x, heading: e.target.value } : x))} className={`${field} font-semibold`} placeholder="Heading" />
                      <button onClick={() => set("compliance", c.compliance.filter((_, j) => j !== i))} className="px-2 text-gray-400 hover:text-red-600">✕</button>
                    </div>
                    <textarea value={b.body} onChange={(e) => set("compliance", c.compliance.map((x, j) => j === i ? { ...x, body: e.target.value } : x))} rows={2} className={`${field} mt-1`} placeholder="Body" />
                  </div>
                ))}
                <button onClick={() => set("compliance", [...c.compliance, { heading: "", body: "" }])} className="text-xs font-medium" style={{ color: TEAL }}>+ Add block</button>
              </div>

              <div>
                <label className={label}>Next steps</label>
                <textarea value={c.nextSteps} onChange={(e) => set("nextSteps", e.target.value)} rows={3} className={field} />
              </div>

              {/* MCS report attachment */}
              <div className="rounded-lg bg-gray-50 p-3">
                <label className={label}>Full MCS heat loss report (PDF)</label>
                <p className="mb-2 text-[11px] text-gray-500">Attached to the customer proposal as a gated, view-only download (unlocked by their postcode).</p>
                <div className="flex flex-wrap items-center gap-3 text-xs">
                  <label className="cursor-pointer rounded border border-teal-600 px-2 py-1" style={{ color: TEAL }}>
                    {uploading ? "Uploading…" : hasReport ? "Replace PDF" : "Upload PDF"}
                    <input type="file" accept="application/pdf" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadReport(f); }} />
                  </label>
                  {hasReport && <span className="text-green-700">✓ Report attached</span>}
                  {hasReport && <button onClick={removeReport} className="text-gray-400 hover:text-red-600">Remove</button>}
                </div>
              </div>

              <div className="flex items-center gap-3 border-t border-gray-100 pt-3">
                <button onClick={save} disabled={saving} className="rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-60" style={{ backgroundColor: TEAL }}>
                  {saving ? "Saving…" : "Save customer document"}
                </button>
                {msg && <span className="text-xs text-gray-600">{msg}</span>}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
