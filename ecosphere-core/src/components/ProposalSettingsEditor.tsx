"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { StandingAssumptions, LabourModel } from "@/lib/standingAssumptions";
import { PRODUCT_CATEGORY_LABELS, type ProductCategory } from "@/lib/proposal";

type MarginRow = { id: string | null; category: ProductCategory | null; markup_pct: number };

const LABOUR_FIELDS: { key: keyof LabourModel; label: string; step: string }[] = [
  { key: "day_rate", label: "Subcontractor day rate (£, ex VAT)", step: "1" },
  { key: "ashp_base_days", label: "ASHP base install (days)", step: "0.1" },
  { key: "commissioning_days", label: "Commissioning & electrical (days)", step: "0.1" },
  { key: "days_per_radiator", label: "Per radiator changed (days)", step: "0.1" },
  { key: "cylinder_days", label: "Cylinder install (days)", step: "0.1" },
  { key: "solar_base_days", label: "Solar base install (days)", step: "0.1" },
  { key: "days_per_panel", label: "Per panel (days)", step: "0.05" },
  { key: "battery_days", label: "Battery install (days)", step: "0.1" },
];

const DESIGN_FIELDS: { key: "design_flow_temp_c" | "sizing_margin_pct"; label: string; step: string }[] = [
  { key: "design_flow_temp_c", label: "Design flow temperature (°C)", step: "1" },
  { key: "sizing_margin_pct", label: "Heat-pump sizing margin (%)", step: "1" },
];

const num = (s: string) => {
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
};

export default function ProposalSettingsEditor({
  initialAssumptions,
  initialMargins,
}: {
  initialAssumptions: StandingAssumptions;
  initialMargins: MarginRow[];
}) {
  const supabase = createClient();
  const [labour, setLabour] = useState<Record<string, string>>(
    Object.fromEntries(LABOUR_FIELDS.map((f) => [f.key, String(initialAssumptions.labour[f.key])]))
  );
  const [design, setDesign] = useState<Record<string, string>>({
    design_flow_temp_c: String(initialAssumptions.design_flow_temp_c),
    sizing_margin_pct: String(initialAssumptions.sizing_margin_pct),
  });
  const [margins, setMargins] = useState<MarginRow[]>(initialMargins);
  const [newCat, setNewCat] = useState<string>("");
  const [newPct, setNewPct] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const usedCats = new Set(margins.map((m) => m.category));
  const availableCats = (Object.keys(PRODUCT_CATEGORY_LABELS) as ProductCategory[]).filter((c) => !usedCats.has(c));

  function addMargin() {
    if (!newCat || newPct === "") return;
    setMargins((m) => [...m, { id: null, category: newCat as ProductCategory, markup_pct: num(newPct) }]);
    setNewCat(""); setNewPct("");
  }

  async function save() {
    setSaving(true); setMsg(null);
    const assumptions: StandingAssumptions = {
      ...initialAssumptions,
      design_flow_temp_c: num(design.design_flow_temp_c),
      sizing_margin_pct: num(design.sizing_margin_pct),
      labour: LABOUR_FIELDS.reduce((acc, f) => ({ ...acc, [f.key]: num(labour[f.key]) }), {} as LabourModel),
    };
    const { error: sErr } = await supabase
      .from("app_settings")
      .upsert({ key: "proposal_assumptions", value: assumptions, updated_at: new Date().toISOString() }, { onConflict: "key" });
    if (sErr) { setMsg(sErr.message); setSaving(false); return; }

    for (const m of margins) {
      const pct = Number(m.markup_pct);
      if (m.id) {
        const { error } = await supabase.from("margin_rules").update({ markup_pct: pct }).eq("id", m.id);
        if (error) { setMsg(error.message); setSaving(false); return; }
      } else if (m.category) {
        const { data, error } = await supabase.from("margin_rules").insert({ category: m.category, markup_pct: pct }).select("id").single();
        if (error) { setMsg(error.message); setSaving(false); return; }
        m.id = data?.id ?? null;
      }
    }
    setSaving(false); setMsg("Saved.");
  }

  const field = "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-teal-600 focus:outline-none focus:ring-1 focus:ring-teal-600";
  const lbl = "mb-1 block text-xs font-medium text-gray-500";
  const card = "rounded-xl border border-gray-200 bg-white p-5";

  return (
    <div className="space-y-6">
      <section className={card}>
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-800">Labour defaults</h2>
          <button onClick={save} disabled={saving}
            className="rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-60" style={{ backgroundColor: "#1B7A6E" }}>
            {saving ? "Saving…" : "Save settings"}
          </button>
        </div>
        <p className="mt-1 text-sm text-gray-500">
          Drives the subcontract labour line on every new proposal: <span className="font-mono text-xs">days × day rate</span>.
        </p>
        {msg && <div className={`mt-3 rounded-md px-3 py-2 text-sm ${msg === "Saved." ? "bg-teal-50 text-teal-800" : "bg-red-50 text-red-700"}`}>{msg}</div>}
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {LABOUR_FIELDS.map((f) => (
            <div key={f.key}>
              <label className={lbl}>{f.label}</label>
              <input type="number" step={f.step} className={field} value={labour[f.key]}
                onChange={(e) => setLabour((l) => ({ ...l, [f.key]: e.target.value }))} />
            </div>
          ))}
        </div>
      </section>

      <section className={card}>
        <h2 className="text-sm font-semibold text-gray-800">Design defaults</h2>
        <p className="mt-1 text-sm text-gray-500">Used when a survey doesn&apos;t specify them.</p>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {DESIGN_FIELDS.map((f) => (
            <div key={f.key}>
              <label className={lbl}>{f.label}</label>
              <input type="number" step={f.step} className={field} value={design[f.key]}
                onChange={(e) => setDesign((d) => ({ ...d, [f.key]: e.target.value }))} />
            </div>
          ))}
        </div>
      </section>

      <section className={card}>
        <h2 className="text-sm font-semibold text-gray-800">Parts pricing — margins</h2>
        <p className="mt-1 text-sm text-gray-500">
          Sell prices derive as <span className="font-mono text-xs">cost × (1 + markup%)</span>. The global default applies where no per-category rule exists.
        </p>
        <div className="mt-3 space-y-2">
          {margins.map((m, i) => (
            <div key={m.id ?? `new-${i}`} className="flex items-center gap-3">
              <span className="flex-1 text-sm text-gray-800">{m.category === null ? "Global default" : (PRODUCT_CATEGORY_LABELS[m.category] ?? m.category)}</span>
              <div className="flex items-center gap-1">
                <input type="number" step="0.5" className={`${field} w-24 text-right`} value={String(m.markup_pct)}
                  onChange={(e) => setMargins((rows) => rows.map((r, j) => (j === i ? { ...r, markup_pct: num(e.target.value) } : r)))} />
                <span className="text-sm text-gray-500">%</span>
              </div>
            </div>
          ))}
        </div>
        {availableCats.length > 0 && (
          <div className="mt-3 flex items-end gap-2 border-t border-gray-100 pt-3">
            <div className="flex-1">
              <label className={lbl}>Add a category rule</label>
              <select className={field} value={newCat} onChange={(e) => setNewCat(e.target.value)}>
                <option value="">Choose a category…</option>
                {availableCats.map((c) => <option key={c} value={c}>{PRODUCT_CATEGORY_LABELS[c] ?? c}</option>)}
              </select>
            </div>
            <div className="w-28">
              <label className={lbl}>Markup %</label>
              <input type="number" step="0.5" className={field} value={newPct} onChange={(e) => setNewPct(e.target.value)} />
            </div>
            <button onClick={addMargin} disabled={!newCat || newPct === ""}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">Add</button>
          </div>
        )}
        <p className="mt-3 text-[11px] text-gray-400">Changes apply to newly built proposals; existing proposals keep their snapshotted prices.</p>
      </section>
    </div>
  );
}
