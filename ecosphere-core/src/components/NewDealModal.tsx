"use client";

import { useState } from "react";
import type { Deal, ProductType, LeadSource, PropertyType } from "@/lib/types";
import { PRODUCT_OPTIONS, LEAD_SOURCE_OPTIONS, PROPERTY_OPTIONS } from "@/lib/constants";
import { createClient } from "@/lib/supabase/client";
import { DEAL_WITH_TAGS_SELECT, mapDeal } from "@/lib/dealsQuery";

export default function NewDealModal({
  onClose, onCreated, pipelineId, stageId,
}: {
  onClose: () => void;
  onCreated: (deal: Deal) => void;
  pipelineId: string;
  stageId: string;
}) {
  const [form, setForm] = useState({
    customer_name: "", address: "", postcode: "", phone: "", email: "",
    property_type: "detached" as PropertyType,
    product_interest: "ashp" as ProductType,
    lead_source: "website" as LeadSource,
    value_gross: "", value_bus_grant: "",
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<any>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }) as typeof form);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!form.customer_name.trim()) { setErr("Customer name is required."); return; }
    setSaving(true);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("deals")
      .insert({
        customer_name: form.customer_name.trim(),
        address: form.address || null,
        postcode: form.postcode || null,
        phone: form.phone || null,
        email: form.email || null,
        property_type: form.property_type,
        product_interest: form.product_interest,
        lead_source: form.lead_source,
        value_gross: Number(form.value_gross || 0),
        value_bus_grant: Number(form.value_bus_grant || 0),
        pipeline_id: pipelineId,
        pipeline_stage_id: stageId,
      })
      .select(DEAL_WITH_TAGS_SELECT)
      .single();
    setSaving(false);
    if (error) { setErr(error.message); return; }
    onCreated(mapDeal(data));
  }

  const field = "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-teal-600 focus:outline-none focus:ring-1 focus:ring-teal-600";
  const label = "mb-1 block text-xs font-medium text-gray-600";

  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/40 p-4">
      <form onSubmit={save} className="my-8 w-full max-w-lg rounded-xl bg-white p-6 shadow-xl">
        <h2 className="text-lg font-semibold text-gray-900">New deal</h2>
        <p className="mb-4 text-sm text-gray-500">Added to the first stage of this pipeline.</p>
        {err && <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2"><label className={label}>Customer name *</label><input className={field} value={form.customer_name} onChange={set("customer_name")} /></div>
          <div className="sm:col-span-2"><label className={label}>Address</label><input className={field} value={form.address} onChange={set("address")} /></div>
          <div><label className={label}>Postcode</label><input className={field} value={form.postcode} onChange={set("postcode")} /></div>
          <div><label className={label}>Phone</label><input className={field} value={form.phone} onChange={set("phone")} /></div>
          <div className="sm:col-span-2"><label className={label}>Email</label><input type="email" className={field} value={form.email} onChange={set("email")} /></div>
          <div><label className={label}>Product interest</label>
            <select className={field} value={form.product_interest} onChange={set("product_interest")}>{PRODUCT_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
          <div><label className={label}>Lead source</label>
            <select className={field} value={form.lead_source} onChange={set("lead_source")}>{LEAD_SOURCE_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
          <div><label className={label}>Property type</label>
            <select className={field} value={form.property_type} onChange={set("property_type")}>{PROPERTY_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
          <div />
          <div><label className={label}>Job value (gross, £)</label><input type="number" min="0" step="1" className={field} value={form.value_gross} onChange={set("value_gross")} /></div>
          <div><label className={label}>BUS grant (£)</label><input type="number" min="0" step="1" className={field} value={form.value_bus_grant} onChange={set("value_bus_grant")} /></div>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">Cancel</button>
          <button type="submit" disabled={saving} className="rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-60" style={{ backgroundColor: "#1B7A6E" }}>{saving ? "Saving…" : "Create deal"}</button>
        </div>
      </form>
    </div>
  );
}
