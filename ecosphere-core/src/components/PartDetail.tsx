"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Product, Supplier, MarginRule, ProductCategory } from "@/lib/proposal";
import { PRODUCT_CATEGORY_OPTIONS } from "@/lib/proposal";
import { gbp } from "@/lib/constants";
import { sellPrice } from "@/lib/pricing";
import { detectManufacturer } from "@/lib/manufacturers";
import { createClient } from "@/lib/supabase/client";

type UsedIn = { proposal_id: string; title: string; qty: number };

export default function PartDetail({
  initialProduct, suppliers, margins, usedIn,
}: {
  initialProduct: Product;
  suppliers: Supplier[];
  margins: MarginRule[];
  usedIn: UsedIn[];
}) {
  const supabase = createClient();
  const router = useRouter();
  const [p, setP] = useState<Product>(initialProduct);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const markup = Number((margins.find((m) => m.category === p.category) ?? margins.find((m) => m.category === null))?.markup_pct ?? 0);
  const attrs = (p.attrs ?? {}) as any;

  async function save(patch: Partial<Product>) {
    setP((prev) => ({ ...prev, ...patch }));
    const { error } = await supabase.from("products").update(patch).eq("id", p.id);
    if (error) setMsg(error.message); else setMsg("Saved.");
  }
  const setAttr = (k: string, v: any) => save({ attrs: { ...attrs, [k]: v || undefined } } as any);

  async function upload(kind: "image" | "datasheet", file: File) {
    setBusy(kind); setMsg(null);
    const ext = (file.name.split(".").pop() || (kind === "image" ? "jpg" : "pdf")).toLowerCase();
    const path = `${p.id}${kind === "datasheet" ? "-datasheet" : ""}.${ext}`;
    const { error } = await supabase.storage.from("part-images").upload(path, file, { upsert: true, cacheControl: "3600" });
    if (error) { setBusy(null); setMsg(`Upload failed: ${error.message}`); return; }
    const { data } = supabase.storage.from("part-images").getPublicUrl(path);
    const url = `${data.publicUrl}?v=${Date.now()}`;
    await save({ attrs: { ...attrs, [kind === "image" ? "image_url" : "datasheet_url"]: url } } as any);
    setBusy(null);
  }

  const field = "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-teal-600 focus:outline-none focus:ring-1 focus:ring-teal-600";
  const label = "mb-1 block text-xs font-medium text-gray-500";

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div className="flex items-center justify-between">
        <Link href="/catalogue" className="text-sm text-teal-700 hover:underline">← Catalogue</Link>
        {msg && <span className="text-xs text-gray-400">{msg}</span>}
      </div>

      <input defaultValue={p.name} className="w-full rounded-lg border border-transparent px-1 text-2xl font-semibold text-gray-900 hover:border-gray-200 focus:border-teal-600 focus:outline-none"
        onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== p.name) save({ name: v }); else if (!v) e.target.value = p.name; }} />

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        {/* Left: image + datasheet */}
        <div className="space-y-4">
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <div className="grid h-48 place-items-center rounded-lg" style={{ backgroundColor: "#F0F7F5" }}>
              {attrs.image_url
                /* eslint-disable-next-line @next/next/no-img-element */
                ? <img src={attrs.image_url} alt={p.name} className="max-h-44 max-w-full object-contain" />
                : <span className="text-sm text-gray-400">No image yet</span>}
            </div>
            <div className="mt-3 flex items-center gap-2">
              <label className="cursor-pointer rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50">
                {busy === "image" ? "Uploading…" : "Upload image"}
                <input type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) upload("image", f); e.currentTarget.value = ""; }} />
              </label>
              <input defaultValue={attrs.image_url ?? ""} placeholder="or paste image URL" className="flex-1 rounded border border-gray-200 px-2 py-1 text-[11px] focus:border-teal-600 focus:outline-none"
                onBlur={(e) => setAttr("image_url", e.target.value.trim())} />
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <h2 className="text-sm font-semibold text-gray-800">Datasheet</h2>
            {attrs.datasheet_url
              ? <a href={attrs.datasheet_url} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block text-sm text-teal-700 hover:underline">View datasheet (PDF) →</a>
              : <p className="mt-1 text-sm text-gray-400">None attached.</p>}
            <div className="mt-2 flex items-center gap-2">
              <label className="cursor-pointer rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50">
                {busy === "datasheet" ? "Uploading…" : "Upload datasheet"}
                <input type="file" accept="application/pdf" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) upload("datasheet", f); e.currentTarget.value = ""; }} />
              </label>
              <input defaultValue={attrs.datasheet_url ?? ""} placeholder="or paste datasheet URL" className="flex-1 rounded border border-gray-200 px-2 py-1 text-[11px] focus:border-teal-600 focus:outline-none"
                onBlur={(e) => setAttr("datasheet_url", e.target.value.trim())} />
            </div>
          </div>
        </div>

        {/* Right: fields */}
        <div className="space-y-3 rounded-xl border border-gray-200 bg-white p-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label}>Manufacturer</label>
              <input defaultValue={p.manufacturer ?? ""} className={field}
                onBlur={(e) => { const v = e.target.value.trim() || (detectManufacturer(p.name) ?? ""); if (v !== (p.manufacturer ?? "")) save({ manufacturer: v || null }); }} />
            </div>
            <div>
              <label className={label}>Category</label>
              <select className={field} value={p.category} onChange={(e) => save({ category: e.target.value as ProductCategory })}>
                {PRODUCT_CATEGORY_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div>
              <label className={label}>SKU</label>
              <input defaultValue={p.sku ?? ""} className={field} onBlur={(e) => { const v = e.target.value.trim(); if ((v || null) !== (p.sku ?? null)) save({ sku: v || null } as any); }} />
            </div>
            <div>
              <label className={label}>Unit</label>
              <input defaultValue={p.unit} className={field} onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== p.unit) save({ unit: v }); }} />
            </div>
            <div>
              <label className={label}>Cost £ (ex VAT)</label>
              <input type="number" step="0.01" defaultValue={p.cost_price} className={field} onBlur={(e) => save({ cost_price: Number(e.target.value || 0) })} />
            </div>
            <div>
              <label className={label}>Sell (at {markup}% markup)</label>
              <div className="rounded-lg bg-gray-50 px-3 py-2 text-sm font-semibold text-gray-900">{gbp(sellPrice(p.cost_price, markup))}</div>
            </div>
            <div>
              <label className={label}>Model code (attrs.mfr_code)</label>
              <input defaultValue={attrs.mfr_code ?? ""} className={field} onBlur={(e) => setAttr("mfr_code", e.target.value.trim())} />
            </div>
            <div>
              <label className={label}>VAT %</label>
              <input type="number" step="1" defaultValue={p.vat_rate} className={field} onBlur={(e) => save({ vat_rate: Number(e.target.value || 0) })} />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={p.active} onChange={(e) => save({ active: e.target.checked })} /> Active (available to proposals)
          </label>
        </div>
      </div>

      {/* Used in proposals */}
      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-gray-800">Used in {usedIn.length} proposal{usedIn.length === 1 ? "" : "s"}</h2>
        {usedIn.length === 0
          ? <p className="mt-1 text-sm text-gray-400">Not on any proposal yet.</p>
          : <ul className="mt-2 space-y-1 text-sm">
              {usedIn.slice(0, 30).map((u) => (
                <li key={u.proposal_id}>
                  <Link href={`/proposals/${u.proposal_id}`} className="text-teal-700 hover:underline">{u.title}</Link>
                  <span className="text-gray-400"> · qty {u.qty}</span>
                </li>
              ))}
            </ul>}
      </div>
    </div>
  );
}
