"use client";

import { useMemo, useState } from "react";
import type { Product, Supplier, MarginRule, ProductCategory } from "@/lib/proposal";
import { PRODUCT_CATEGORY_LABELS, PRODUCT_CATEGORY_OPTIONS } from "@/lib/proposal";
import { gbp } from "@/lib/constants";
import { createClient } from "@/lib/supabase/client";

type Tab = "products" | "suppliers" | "margins";

export default function CatalogueManager({
  initialProducts, suppliers: initialSuppliers, initialMargins,
}: {
  initialProducts: Product[];
  suppliers: Supplier[];
  initialMargins: MarginRule[];
}) {
  const supabase = createClient();
  const [products, setProducts] = useState<Product[]>(initialProducts);
  const [suppliers, setSuppliers] = useState<Supplier[]>(initialSuppliers);
  const [margins, setMargins] = useState<MarginRule[]>(initialMargins);
  const [tab, setTab] = useState<Tab>("products");
  const [msg, setMsg] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("");
  const [uploadingId, setUploadingId] = useState<string | null>(null);

  const supplierName = (id: string | null) => suppliers.find((s) => s.id === id)?.name ?? "—";
  const markupFor = (cat: ProductCategory) =>
    Number((margins.find((m) => m.category === cat) ?? margins.find((m) => m.category === null))?.markup_pct ?? 0);
  const sellOf = (p: Product) => p.cost_price * (1 + markupFor(p.category) / 100);

  const shown = useMemo(() => products.filter((p) => !filter || p.category === filter), [products, filter]);

  const [np, setNp] = useState({ name: "", sku: "", category: "consumable" as ProductCategory, supplier_id: "", unit: "each", cost_price: "", vat_rate: "20" });
  const setF = (k: keyof typeof np) => (e: React.ChangeEvent<any>) => setNp((f) => ({ ...f, [k]: e.target.value }));
  const [ns, setNs] = useState({ name: "", contact: "", email: "" });
  const setS = (k: keyof typeof ns) => (e: React.ChangeEvent<any>) => setNs((f) => ({ ...f, [k]: e.target.value }));

  async function addProduct(e: React.FormEvent) {
    e.preventDefault();
    if (!np.name.trim()) { setMsg("Name required."); return; }
    const { data, error } = await supabase.from("products").insert({
      name: np.name.trim(), sku: np.sku || null, category: np.category, supplier_id: np.supplier_id || null,
      unit: np.unit, cost_price: Number(np.cost_price || 0), vat_rate: Number(np.vat_rate || 0),
    }).select("*").single();
    if (error) { setMsg(error.message); return; }
    setProducts((p) => [...p, data as Product]);
    setNp({ name: "", sku: "", category: np.category, supplier_id: "", unit: "each", cost_price: "", vat_rate: "20" });
    setMsg("Product added.");
  }

  async function updateProduct(id: string, patch: Partial<Product>) {
    setProducts((ps) => ps.map((p) => (p.id === id ? { ...p, ...patch } : p)));
    const { error } = await supabase.from("products").update(patch).eq("id", id);
    if (error) setMsg(error.message);
  }

  async function uploadImage(p: Product, file: File) {
    setUploadingId(p.id); setMsg(null);
    if (!file.type.startsWith("image/")) { setUploadingId(null); setMsg("Please choose an image file."); return; }
    const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
    const path = `${p.id}.${ext}`;
    const { error: upErr } = await supabase.storage.from("part-images").upload(path, file, { upsert: true, cacheControl: "3600" });
    if (upErr) { setUploadingId(null); setMsg(`Upload failed: ${upErr.message}`); return; }
    const { data } = supabase.storage.from("part-images").getPublicUrl(path);
    const url = `${data.publicUrl}?v=${Date.now()}`;
    await updateProduct(p.id, { attrs: { ...(((p.attrs as any)) ?? {}), image_url: url } } as any);
    setUploadingId(null); setMsg("Photo uploaded.");
  }

  async function addSupplier(e: React.FormEvent) {
    e.preventDefault();
    if (!ns.name.trim()) { setMsg("Supplier name required."); return; }
    const { data, error } = await supabase.from("suppliers").insert({
      name: ns.name.trim(), contact: ns.contact || null, email: ns.email || null,
    }).select("*").single();
    if (error) { setMsg(error.message); return; }
    setSuppliers((s) => [...s, data as Supplier]);
    setNs({ name: "", contact: "", email: "" });
    setMsg("Supplier added.");
  }

  async function deleteSupplier(id: string) {
    const used = products.filter((p) => p.supplier_id === id).length;
    if (!confirm(used ? `Remove this supplier? Its ${used} product(s) will be kept but left unassigned.` : "Remove this supplier?")) return;
    const { error } = await supabase.from("suppliers").delete().eq("id", id);
    if (error) { setMsg(error.message); return; }
    setSuppliers((s) => s.filter((x) => x.id !== id));
    setProducts((ps) => ps.map((p) => (p.supplier_id === id ? { ...p, supplier_id: null } : p)));
    setMsg("Supplier removed.");
  }

  async function saveMargin(cat: ProductCategory | null, pct: number) {
    const existing = margins.find((m) => m.category === cat);
    if (existing) {
      const { error } = await supabase.from("margin_rules").update({ markup_pct: pct }).eq("id", existing.id);
      if (error) { setMsg(error.message); return; }
      setMargins((ms) => ms.map((m) => (m.id === existing.id ? { ...m, markup_pct: pct } : m)));
    } else {
      const { data, error } = await supabase.from("margin_rules").insert({ category: cat, markup_pct: pct }).select("*").single();
      if (error) { setMsg(error.message); return; }
      setMargins((ms) => [...ms, data as MarginRule]);
    }
  }

  const field = "rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm focus:border-teal-600 focus:outline-none focus:ring-1 focus:ring-teal-600";

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Catalogue</h1>
        <p className="text-sm text-gray-500">{products.length} products · {suppliers.length} suppliers · cost-only pricing, sell from margin · add a photo URL to show real parts on proposals</p>
      </div>

      <div className="flex gap-1.5">
        {(["products", "suppliers", "margins"] as Tab[]).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium capitalize ${tab === t ? "text-white" : "border border-gray-200 bg-white text-gray-600 hover:bg-gray-50"}`}
            style={tab === t ? { backgroundColor: "#1B7A6E" } : undefined}>
            {t === "margins" ? "Margin rules" : t}
          </button>
        ))}
      </div>

      {msg && <div className="rounded-md bg-teal-50 px-3 py-2 text-sm text-teal-800">{msg}</div>}

      {tab === "products" && (
        <>
          <form onSubmit={addProduct} className="flex flex-wrap items-end gap-2 rounded-xl border border-gray-200 bg-white p-3">
            <input className={`${field} flex-1`} placeholder="Product name" value={np.name} onChange={setF("name")} />
            <input className={`${field} w-28`} placeholder="SKU" value={np.sku} onChange={setF("sku")} />
            <select className={field} value={np.category} onChange={setF("category")}>
              {PRODUCT_CATEGORY_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <select className={field} value={np.supplier_id} onChange={setF("supplier_id")}>
              <option value="">— supplier —</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <input className={`${field} w-20`} placeholder="Unit" value={np.unit} onChange={setF("unit")} />
            <input type="number" step="0.01" className={`${field} w-28`} placeholder="Cost £" value={np.cost_price} onChange={setF("cost_price")} />
            <button className="rounded-lg px-3 py-1.5 text-sm font-semibold text-white" style={{ backgroundColor: "#1B7A6E" }}>Add</button>
          </form>

          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-500">Filter:</label>
            <select className={field} value={filter} onChange={(e) => setFilter(e.target.value)}>
              <option value="">All categories</option>
              {PRODUCT_CATEGORY_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>

          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs text-gray-500">
                <tr>
                  <th className="px-3 py-2 font-medium">Product</th>
                  <th className="px-3 py-2 font-medium">Category</th>
                  <th className="px-3 py-2 font-medium">Supplier</th>
                  <th className="px-3 py-2 text-right font-medium">Cost £</th>
                  <th className="px-3 py-2 text-right font-medium">Margin</th>
                  <th className="px-3 py-2 text-right font-medium">Sell</th>
                  <th className="px-3 py-2 font-medium">Image</th>
                  <th className="px-3 py-2 text-right font-medium">Active</th>
                </tr>
              </thead>
              <tbody>
                {shown.length === 0 && <tr><td colSpan={8} className="px-3 py-6 text-center text-gray-400">No products.</td></tr>}
                {shown.map((p) => (
                  <tr key={p.id} className={`border-t border-gray-100 ${!p.active ? "opacity-50" : ""}`}>
                    <td className="px-3 py-2">
                      <div className="font-medium text-gray-800">{p.name}</div>
                      <div className="text-[11px] text-gray-400">{p.sku ?? "no SKU"} · {p.unit}</div>
                    </td>
                    <td className="px-3 py-2 text-gray-600">{PRODUCT_CATEGORY_LABELS[p.category]}</td>
                    <td className="px-3 py-2 text-gray-600">{supplierName(p.supplier_id)}</td>
                    <td className="px-3 py-2 text-right">
                      <input type="number" step="0.01" defaultValue={p.cost_price} className="w-24 rounded border border-gray-300 px-2 py-1 text-right focus:border-teal-600 focus:outline-none"
                        onBlur={(e) => updateProduct(p.id, { cost_price: Number(e.target.value || 0) })} />
                    </td>
                    <td className="px-3 py-2 text-right text-gray-500">{markupFor(p.category)}%</td>
                    <td className="px-3 py-2 text-right font-semibold text-gray-900">{gbp(sellOf(p))}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        {(p.attrs as any)?.image_url ? (
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img src={(p.attrs as any).image_url} alt={p.name} className="h-9 w-12 rounded border border-gray-200 object-contain" style={{ backgroundColor: "#F0F7F5" }} />
                        ) : (
                          <span className="grid h-9 w-12 place-items-center rounded border border-dashed border-gray-300 text-[9px] text-gray-400">none</span>
                        )}
                        <label className="cursor-pointer rounded border border-gray-300 px-2 py-1 text-[11px] font-medium text-gray-600 hover:bg-gray-50">
                          {uploadingId === p.id ? "Uploading…" : "Upload"}
                          <input type="file" accept="image/*" hidden
                            onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadImage(p, f); e.currentTarget.value = ""; }} />
                        </label>
                      </div>
                      <input defaultValue={(p.attrs as any)?.image_url ?? ""} placeholder="or paste a URL"
                        className="mt-1 w-44 rounded border border-gray-300 px-2 py-1 text-[11px] focus:border-teal-600 focus:outline-none"
                        onBlur={(e) => updateProduct(p.id, { attrs: { ...((p.attrs as any) ?? {}), image_url: e.target.value.trim() || undefined } } as any)} />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <input type="checkbox" checked={p.active} onChange={(e) => updateProduct(p.id, { active: e.target.checked })} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === "suppliers" && (
        <>
          <form onSubmit={addSupplier} className="flex flex-wrap items-end gap-2 rounded-xl border border-gray-200 bg-white p-3">
            <input className={`${field} flex-1`} placeholder="Supplier name" value={ns.name} onChange={setS("name")} />
            <input className={`${field} w-40`} placeholder="Contact" value={ns.contact} onChange={setS("contact")} />
            <input className={`${field} w-56`} placeholder="Email" value={ns.email} onChange={setS("email")} />
            <button className="rounded-lg px-3 py-1.5 text-sm font-semibold text-white" style={{ backgroundColor: "#1B7A6E" }}>Add supplier</button>
          </form>
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs text-gray-500"><tr><th className="px-3 py-2 font-medium">Supplier</th><th className="px-3 py-2 font-medium">Contact</th><th className="px-3 py-2 font-medium">Email</th><th className="px-3 py-2 text-right font-medium">Products</th><th className="px-3 py-2"></th></tr></thead>
              <tbody>
                {suppliers.length === 0 && <tr><td colSpan={4} className="px-3 py-6 text-center text-gray-400">No suppliers.</td></tr>}
                {suppliers.map((s) => (
                  <tr key={s.id} className="border-t border-gray-100">
                    <td className="px-3 py-2 font-medium text-gray-800">{s.name}</td>
                    <td className="px-3 py-2 text-gray-600">{s.contact ?? "—"}</td>
                    <td className="px-3 py-2 text-gray-600">{s.email ?? "—"}</td>
                    <td className="px-3 py-2 text-right text-gray-500">{products.filter((p) => p.supplier_id === s.id).length}</td>
                    <td className="px-3 py-2 text-right"><button onClick={() => deleteSupplier(s.id)} title="Remove supplier" aria-label="Remove supplier" className="rounded px-2 py-1 text-gray-300 hover:bg-red-50 hover:text-red-600">🗑</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === "margins" && (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs text-gray-500"><tr><th className="px-3 py-2 font-medium">Category</th><th className="px-3 py-2 text-right font-medium">Markup %</th></tr></thead>
            <tbody>
              <MarginRow label="Global default" value={Number((margins.find((m) => m.category === null))?.markup_pct ?? 0)} onSave={(v) => saveMargin(null, v)} />
              {PRODUCT_CATEGORY_OPTIONS.map(([cat, label]) => (
                <MarginRow key={cat} label={label} value={Number((margins.find((m) => m.category === cat))?.markup_pct ?? markupFor(cat))} onSave={(v) => saveMargin(cat, v)} />
              ))}
            </tbody>
          </table>
          <p className="px-3 py-2 text-[11px] text-gray-400">Sell price = cost × (1 + markup ÷ 100). Per-line overrides happen on a proposal.</p>
        </div>
      )}
    </div>
  );
}

function MarginRow({ label, value, onSave }: { label: string; value: number; onSave: (v: number) => void }) {
  const [v, setV] = useState(String(value));
  return (
    <tr className="border-t border-gray-100">
      <td className="px-3 py-2 text-gray-700">{label}</td>
      <td className="px-3 py-2 text-right">
        <input type="number" step="0.5" value={v} onChange={(e) => setV(e.target.value)} onBlur={() => onSave(Number(v || 0))}
          className="w-24 rounded-lg border border-gray-300 px-2 py-1 text-right text-sm focus:border-teal-600 focus:outline-none" />
      </td>
    </tr>
  );
}
