"use client";

import { useMemo, useState } from "react";
import type {
  Activity, ActivityType, BusStatus, BusVoucher, Deal, Stage, StageHistoryRow, Tag, TagCategory,
} from "@/lib/types";
import {
  STAGE_LABELS, STAGE_COLORS, PRODUCT_LABELS, LEAD_SOURCE_LABELS,
  PRODUCT_OPTIONS, LEAD_SOURCE_OPTIONS, PROPERTY_OPTIONS, gbp, daysSince,
} from "@/lib/constants";
import { createClient } from "@/lib/supabase/client";
import DealProposals from "./DealProposals";

const CATEGORY_LABELS: Record<TagCategory, string> = {
  lead_source: "Lead source", product_interest: "Product interest", pipeline_stage: "Pipeline",
  job_status: "Job status", customer_type: "Customer type", property_characteristic: "Property",
};
const ACTIVITY_TYPES: ActivityType[] = ["note", "call", "email", "sms", "meeting"];
const BUS_STATUSES: BusStatus[] = ["applied", "issued", "redeemed", "paid", "expired", "rejected"];

export default function DealDetail({
  initialDeal, initialActivities, history, allTags, stages, initialVouchers, dealProposals,
}: {
  initialDeal: Deal;
  initialActivities: Activity[];
  history: StageHistoryRow[];
  allTags: Tag[];
  stages: Stage[];
  initialVouchers: BusVoucher[];
  dealProposals: { id: string; title: string; status: any }[];
}) {
  const supabase = createClient();
  const [deal, setDeal] = useState<Deal>(initialDeal);
  const [tags, setTags] = useState<Tag[]>(initialDeal.tags ?? []);
  const [activities, setActivities] = useState<Activity[]>(initialActivities);
  const [hist, setHist] = useState<StageHistoryRow[]>(history);
  const [vouchers, setVouchers] = useState<BusVoucher[]>(initialVouchers);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const [form, setForm] = useState({ ...initialDeal });
  const set = (k: keyof Deal) => (e: React.ChangeEvent<any>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }) as Deal);

  const [actBody, setActBody] = useState("");
  const [actType, setActType] = useState<ActivityType>("note");
  const [stageReason, setStageReason] = useState("");

  const tagIds = useMemo(() => new Set(tags.map((t) => t.id)), [tags]);
  const availableTags = allTags.filter((t) => !tagIds.has(t.id));
  const orderedStages = useMemo(() => [...stages].sort((a, b) => a.sort - b.sort), [stages]);

  async function saveDeal() {
    setSaving(true); setMsg(null);
    const patch = {
      customer_name: form.customer_name, address: form.address || null, postcode: form.postcode || null,
      phone: form.phone || null, email: form.email || null, property_type: form.property_type,
      product_interest: form.product_interest, lead_source: form.lead_source,
      value_gross: Number(form.value_gross || 0), value_bus_grant: Number(form.value_bus_grant || 0),
    };
    const { data, error } = await supabase.from("deals").update(patch).eq("id", deal.id).select("*").single();
    setSaving(false);
    if (error) { setMsg(error.message); return; }
    setDeal((d) => ({ ...d, ...data }));
    setForm((f) => ({ ...f, ...data }));
    setEditing(false); setMsg("Saved.");
  }

  async function changeStage(stage: Stage) {
    if (stage.id === deal.pipeline_stage_id) return;
    if (stage.bucket === "lost" && !stageReason.trim()) { setMsg("Add a reason before marking the deal Lost."); return; }
    const lost_reason = stage.bucket === "lost" ? stageReason.trim() : null;
    const { data, error } = await supabase
      .from("deals").update({ pipeline_stage_id: stage.id, lost_reason }).eq("id", deal.id).select("*").single();
    if (error) { setMsg(error.message); return; }
    const prevBucket = deal.stage;
    setDeal((d) => ({ ...d, ...data }));
    setStageReason("");
    if (prevBucket !== stage.bucket) {
      setHist((h) => [
        { id: Date.now(), deal_id: deal.id, from_stage: prevBucket, to_stage: stage.bucket, changed_at: new Date().toISOString() },
        ...h,
      ]);
    }
  }

  async function addActivity() {
    if (!actBody.trim()) return;
    const { data, error } = await supabase.from("activities")
      .insert({ deal_id: deal.id, type: actType, body: actBody.trim() }).select("*").single();
    if (error) { setMsg(error.message); return; }
    setActivities((a) => [data as Activity, ...a]); setActBody("");
  }

  async function addTag(tag: Tag) {
    const { error } = await supabase.from("deal_tags").insert({ deal_id: deal.id, tag_id: tag.id });
    if (error) { setMsg(error.message); return; }
    setTags((t) => [...t, tag]);
  }
  async function removeTag(tag: Tag) {
    const { error } = await supabase.from("deal_tags").delete().eq("deal_id", deal.id).eq("tag_id", tag.id);
    if (error) { setMsg(error.message); return; }
    setTags((t) => t.filter((x) => x.id !== tag.id));
  }

  async function addVoucher() {
    const today = new Date().toISOString().slice(0, 10);
    const amount = Number(deal.value_bus_grant) > 0 ? Number(deal.value_bus_grant) : 7500;
    const { data, error } = await supabase.from("bus_vouchers")
      .insert({ deal_id: deal.id, amount, status: "applied", applied_at: today }).select("*").single();
    if (error) { setMsg(error.message); return; }
    setVouchers((v) => [data as BusVoucher, ...v]);
  }
  async function updateVoucherStatus(id: string, status: BusStatus) {
    const { data, error } = await supabase.from("bus_vouchers").update({ status }).eq("id", id).select("*").single();
    if (error) { setMsg(error.message); return; }
    setVouchers((v) => v.map((x) => (x.id === id ? (data as BusVoucher) : x)));
  }

  const field = "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-teal-600 focus:outline-none focus:ring-1 focus:ring-teal-600";
  const lbl = "mb-1 block text-xs font-medium text-gray-500";
  const age = daysSince(deal.pipeline_stage_changed_at ?? deal.stage_changed_at);
  const currentStage = orderedStages.find((s) => s.id === deal.pipeline_stage_id);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold text-gray-900">{deal.customer_name}</h1>
            <span className="rounded-full px-2.5 py-1 text-xs font-semibold text-white" style={{ backgroundColor: STAGE_COLORS[deal.stage] }}>
              {currentStage?.label ?? STAGE_LABELS[deal.stage]}
            </span>
          </div>
          <p className="mt-1 text-sm text-gray-500">{PRODUCT_LABELS[deal.product_interest]} &middot; {LEAD_SOURCE_LABELS[deal.lead_source]} &middot; {age}d in stage</p>
        </div>
        <button onClick={() => (editing ? saveDeal() : setEditing(true))} disabled={saving}
          className="rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-60" style={{ backgroundColor: "#1B7A6E" }}>
          {editing ? (saving ? "Saving…" : "Save changes") : "Edit deal"}
        </button>
      </div>

      {msg && <div className="mb-3 rounded-md bg-teal-50 px-3 py-2 text-sm text-teal-800">{msg}</div>}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <div className="grid grid-cols-3 gap-3">
            {[{ label: "Gross", value: deal.value_gross }, { label: "BUS grant", value: deal.value_bus_grant }, { label: "Net", value: deal.value_net }].map((c) => (
              <div key={c.label} className="rounded-xl border border-gray-200 bg-white p-4">
                <p className="text-xs text-gray-500">{c.label}</p>
                <p className="mt-1 text-lg font-semibold text-gray-900">{gbp(Number(c.value))}</p>
              </div>
            ))}
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-5">
            <h2 className="mb-3 text-sm font-semibold text-gray-800">Customer &amp; job</h2>
            {editing ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="sm:col-span-2"><label className={lbl}>Customer name</label><input className={field} value={form.customer_name} onChange={set("customer_name")} /></div>
                <div className="sm:col-span-2"><label className={lbl}>Address</label><input className={field} value={form.address ?? ""} onChange={set("address")} /></div>
                <div><label className={lbl}>Postcode</label><input className={field} value={form.postcode ?? ""} onChange={set("postcode")} /></div>
                <div><label className={lbl}>Phone</label><input className={field} value={form.phone ?? ""} onChange={set("phone")} /></div>
                <div className="sm:col-span-2"><label className={lbl}>Email</label><input className={field} value={form.email ?? ""} onChange={set("email")} /></div>
                <div><label className={lbl}>Product interest</label>
                  <select className={field} value={form.product_interest} onChange={set("product_interest")}>{PRODUCT_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
                <div><label className={lbl}>Lead source</label>
                  <select className={field} value={form.lead_source} onChange={set("lead_source")}>{LEAD_SOURCE_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
                <div><label className={lbl}>Property type</label>
                  <select className={field} value={form.property_type ?? "detached"} onChange={set("property_type")}>{PROPERTY_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
                <div />
                <div><label className={lbl}>Gross value (£)</label><input type="number" className={field} value={form.value_gross} onChange={set("value_gross")} /></div>
                <div><label className={lbl}>BUS grant (£)</label><input type="number" className={field} value={form.value_bus_grant} onChange={set("value_bus_grant")} /></div>
              </div>
            ) : (
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                <Info label="Address" value={[deal.address, deal.postcode].filter(Boolean).join(", ") || "—"} />
                <Info label="Phone" value={deal.phone || "—"} />
                <Info label="Email" value={deal.email || "—"} />
                <Info label="Property type" value={deal.property_type ? deal.property_type.replace("_", "-") : "—"} />
                <Info label="Product" value={PRODUCT_LABELS[deal.product_interest]} />
                <Info label="Lead source" value={LEAD_SOURCE_LABELS[deal.lead_source]} />
              </dl>
            )}
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-5">
            <h2 className="mb-3 text-sm font-semibold text-gray-800">Tags</h2>
            <div className="flex flex-wrap gap-1.5">
              {tags.length === 0 && <span className="text-sm text-gray-400">No tags yet.</span>}
              {tags.map((t) => (
                <span key={t.id} className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium text-white" style={{ backgroundColor: t.color }}>
                  {t.name}<button onClick={() => removeTag(t)} className="ml-0.5 text-white/80 hover:text-white" aria-label={`Remove ${t.name}`}>×</button>
                </span>
              ))}
            </div>
            {availableTags.length > 0 && (
              <div className="mt-3">
                <label className={lbl}>Add a tag</label>
                <select className={field} value="" onChange={(e) => { const tag = allTags.find((t) => t.id === e.target.value); if (tag) addTag(tag); }}>
                  <option value="" disabled>Choose a tag…</option>
                  {Object.entries(availableTags.reduce<Record<string, Tag[]>>((acc, t) => { (acc[t.category] ||= []).push(t); return acc; }, {})).map(([cat, list]) => (
                    <optgroup key={cat} label={CATEGORY_LABELS[cat as TagCategory]}>{list.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</optgroup>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-800">BUS vouchers</h2>
              <button onClick={addVoucher} className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50">+ Apply for BUS voucher</button>
            </div>
            {vouchers.length === 0 ? (
              <p className="text-sm text-gray-400">No vouchers tracked for this deal.</p>
            ) : (
              <ul className="space-y-2">
                {vouchers.map((v) => (
                  <li key={v.id} className="flex items-center justify-between gap-3 rounded-lg bg-gray-50 px-3 py-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-800">{gbp(Number(v.amount))}</p>
                      <p className="truncate text-[11px] text-gray-400">{v.voucher_ref ?? "No reference"}</p>
                    </div>
                    <select value={v.status} onChange={(e) => updateVoucherStatus(v.id, e.target.value as BusStatus)}
                      className="rounded-md border border-gray-300 px-2 py-1 text-xs focus:border-teal-600 focus:outline-none">
                      {BUS_STATUSES.map((s) => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}
                    </select>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-5">
            <h2 className="mb-3 text-sm font-semibold text-gray-800">Activity log</h2>
            <div className="mb-4 flex flex-col gap-2 sm:flex-row">
              <select className={`${field} sm:w-32`} value={actType} onChange={(e) => setActType(e.target.value as ActivityType)}>
                {ACTIVITY_TYPES.map((t) => <option key={t} value={t}>{t[0].toUpperCase() + t.slice(1)}</option>)}
              </select>
              <input className={field} placeholder="Add a note, call summary…" value={actBody} onChange={(e) => setActBody(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addActivity()} />
              <button onClick={addActivity} className="rounded-lg px-4 py-2 text-sm font-semibold text-white" style={{ backgroundColor: "#1B7A6E" }}>Add</button>
            </div>
            <ul className="space-y-3">
              {activities.length === 0 && <li className="text-sm text-gray-400">No activity yet.</li>}
              {activities.map((a) => (
                <li key={a.id} className="border-l-2 border-gray-200 pl-3">
                  <div className="flex items-center gap-2">
                    <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-500">{a.type}</span>
                    <span className="text-[11px] text-gray-400">{new Date(a.created_at).toLocaleString("en-GB")}</span>
                  </div>
                  <p className="mt-1 text-sm text-gray-700">{a.body}</p>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="space-y-4">
          <DealProposals dealId={deal.id} proposals={dealProposals} />
          <div className="rounded-xl border border-gray-200 bg-white p-5">
            <h2 className="mb-3 text-sm font-semibold text-gray-800">Stage</h2>
            <div className="space-y-2">
              {orderedStages.length === 0 && <p className="text-sm text-gray-400">No stages on this pipeline.</p>}
              {orderedStages.map((s) => (
                <button key={s.id} onClick={() => changeStage(s)}
                  className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-sm transition ${deal.pipeline_stage_id === s.id ? "border-transparent text-white" : "border-gray-200 text-gray-700 hover:bg-gray-50"}`}
                  style={deal.pipeline_stage_id === s.id ? { backgroundColor: s.color } : undefined}>
                  <span className="truncate">{s.label}</span>
                  {deal.pipeline_stage_id === s.id && <span className="text-xs">current</span>}
                </button>
              ))}
            </div>
            {deal.stage !== "lost" && (
              <div className="mt-3">
                <label className={lbl}>Reason (required to move to a Lost stage)</label>
                <input className={field} value={stageReason} onChange={(e) => setStageReason(e.target.value)} placeholder="e.g. price" />
              </div>
            )}
            {deal.stage === "lost" && deal.lost_reason && (
              <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">Lost reason: {deal.lost_reason}</p>
            )}
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-5">
            <h2 className="mb-3 text-sm font-semibold text-gray-800">Stage history</h2>
            <ul className="space-y-3">
              {hist.length === 0 && <li className="text-sm text-gray-400">No history.</li>}
              {hist.map((h) => (
                <li key={h.id} className="flex items-start gap-2 text-sm">
                  <span className="mt-1 h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: STAGE_COLORS[h.to_stage] }} />
                  <div>
                    <p className="text-gray-700">{h.from_stage ? `${STAGE_LABELS[h.from_stage]} → ` : ""}<span className="font-medium">{STAGE_LABELS[h.to_stage]}</span></p>
                    <p className="text-[11px] text-gray-400">{new Date(h.changed_at).toLocaleString("en-GB")}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-gray-500">{label}</dt>
      <dd className="text-gray-800">{value}</dd>
    </div>
  );
}
