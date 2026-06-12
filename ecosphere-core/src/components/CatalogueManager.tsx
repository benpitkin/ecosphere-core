"use client";

import { useMemo, useState } from "react";
import type { Product, Supplier, MarginRule, ProductCategory, KitTemplate, KitTemplateItem } from "@/lib/proposal";
import { PRODUCT_CATEGORY_LABELS, PRODUCT_CATEGORY_OPTIONS } from "@/lib/proposal";
import { gbp } from "@/lib/constants";
import { createClient } from "@/lib/supabase/client";
import { detectManufacturer } from "@/lib/manufacturers";

type Tab = "products" | "kits" | "suppliers" | "margins";

// Categories that represent a selectable "unit" a per-unit kit can hang off.
const UNIT_CATEGORIES = new Set<ProductCategory>(["heat_pump", "cylinder", "solar_panel", "inverter", "battery"]);

export default function CatalogueManager({
  initialProducts, suppliers: initialSuppliers, initialMargins, initialKits, initialKitItems,
}: {
  initialProducts: Product[];
  suppliers: Supplier[];
  initialMargins: MarginRule[];
  initialKits: KitTemplate[];
  initialKitItems: KitTemplateItem[];
}) {
  const supabase = createClient();
  const [products, setProducts] = useState<Product[]>(initialProducts);
  const [suppliers, setSuppliers] = useState<Supplier[]>(initialSuppliers);
  const [margins, setMargins] = useState<MarginRule[]>(initialMargins);
  const [kits, setKits] = useState<KitTemplate[]>(initialKits);
  const [kitItems, setKitItems] = useState<KitTemplateItem[]>(initialKitItems);
  const [tab, setTab] = useState<Tab>("products");
  const [msg, setMsg] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("");
  const [mfrFilter, setMfrFilter] = useState<string>("");
  const [uploadingId, setUploadingId] = useState<string | null>(null);

  const supplierName = (id: string | null) => suppliers.find((s) => s.id === id)?.name ?? "—";
  const markupFor = (cat: ProductCategory) =>
    Number((margins.find((m) => m.category === cat) ?? margins.find((m) => m.category === null))?.markup_pct ?? 0);
  const sellOf = (p: Product) => p.cost_price * (1 + markupFor(p.category) / 100);

  const manufacturers = useMemo(
    () => Array.from(new Set(products.map((p) => p.manufacturer).filter(Boolean) as string[])).sort(),
    [products]
  );
  const shown = useMemo(
    () => products.filter((p) => (!filter || p.category === filter) && (!mfrFilter || p.manufacturer === mfrFilter)),
    [products, filter, mfrFilter]
  );

  const [np, setNp] = useState({ name: "", manufacturer: "", sku: "", category: "consumable" as ProductCategory, supplier_id: "", unit: "each", cost_price: "", vat_rate: "20" });
  const setF = (k: keyof typeof np) => (e: React.ChangeEvent<any>) => setNp((f) => ({ ...f, [k]: e.target.value }));
  // Auto-suggest manufacturer from the name, but only while the user hasn't
  // overridden it (their typed value is kept the moment it differs).
  const [autoMfr, setAutoMfr] = useState("");
  function onNameChange(e: React.ChangeEvent<HTMLInputElement>) {
    const name = e.target.value;
    const suggested = detectManufacturer(name) ?? "";
    setNp((f) => {
      const userOverrode = f.manufacturer !== "" && f.manufacturer !== autoMfr;
      return { ...f, name, manufacturer: userOverrode ? f.manufacturer : suggested };
    });
    setAutoMfr(suggested);
  }
  const [ns, setNs] = useState({ name: "", contact: "", email: "" });
  const setS = (k: keyof typeof ns) => (e: React.ChangeEvent<any>) => setNs((f) => ({ ...f, [k]: e.target.value }));
  const [newKitName, setNewKitName] = useState("");

  async function addProduct(e: React.FormEvent) {
    e.preventDefault();
    if (!np.name.trim()) { setMsg("Name required."); return; }
    const { data, error } = await supabase.from("products").insert({
      name: np.name.trim(), manufacturer: np.manufacturer.trim() || null, sku: np.sku || null,
      category: np.category, supplier_id: np.supplier_id || null,
      unit: np.unit, cost_price: Number(np.cost_price || 0), vat_rate: Number(np.vat_rate || 0),
    }).select("*").single();
    if (error) { setMsg(error.message); return; }
    setProducts((p) => [...p, data as Product]);
    setNp({ name: "", manufacturer: np.manufacturer, sku: "", category: np.category, supplier_id: "", unit: "each", cost_price: "", vat_rate: "20" });
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

  // ---- Kits ------------------------------------------------------------------
  async function addKit(e: React.FormEvent) {
    e.preventDefault();
    const name = newKitName.trim();
    if (!name) { setMsg("Kit name required."); return; }
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
    const key = `${slug || "kit"}_${Date.now().toString(36)}`;
    const { data, error } = await supabase.from("kit_templates").insert({ key, name }).select("*").single();
    if (error) { setMsg(error.message); return; }
    setKits((k) => [...k, data as KitTemplate]);
    setNewKitName(""); setMsg("Kit created.");
  }

  async function deleteKit(id: string) {
    const usedBy = products.filter((p) => p.kit_template_id === id).length;
    if (!confirm(usedBy ? `Delete this kit? ${usedBy} unit(s) reference it and will be left with no kit.` : "Delete this kit and its items?")) return;
    const { error } = await supabase.from("kit_templates").delete().eq("id", id);
    if (error) { setMsg(error.message); return; }
    setKits((k) => k.filter((x) => x.id !== id));
    setKitItems((items) => items.filter((it) => it.template_id !== id));
    setProducts((ps) => ps.map((p) => (p.kit_template_id === id ? { ...p, kit_template_id: null } : p)));
    setMsg("Kit deleted.");
  }

  async function addKitItem(template_id: string, product_id: string, qty: number) {
    if (!product_id) return;
    const { data, error } = await supabase.from("kit_template_items")
      .insert({ template_id, product_id, qty }).select("*, products(*)").single();
    if (error) { setMsg(error.message); return; }
    setKitItems((items) => [...items, data as KitTemplateItem]);
  }
  async function removeKitItem(itemId: number) {
    const { error } = await supabase.from("kit_template_items").delete().eq("id", itemId);
    if (error) { setMsg(error.message); return; }
    setKitItems((items) => items.filter((it) => it.id !== itemId));
  }

  const field = "rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm focus:border-teal-600 focus:outline-none focus:ring-1 focus:ring-teal-600";

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Catalogue</h1>
        <p className="text-sm text-gray-500">{products.length} products · {kits.length} kits · {suppliers.length} suppliers · cost-only pricing, sell from margin</p>
      </div>

      <datalist id="mfr-list">{manufacturers.map((m) => <option key={m} value={m} />)}</datalist>

      <div className="flex gap-1.5">
        {(["products", "kits", "suppliers", "margins"] as Tab[]).map((t) => (
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
            <input className={`${field} flex-1`} placeholder="Product name" value={np.name} onChange={onNameChange} />
            <input className={`${field} w-32`} placeholder="Manufacturer (auto)" list="mfr-list" value={np.manufacturer} onChange={setF("manufacturer")} />
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

          <div className="flex flex-wrap items-center gap-2">
            <label className="text-xs text-gray-500">Filter:</label>
            <select className={field} value={filter} onChange={(e) => setFilter(e.target.value)}>
              <option value="">All categories</option>
              {PRODUCT_CATEGORY_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <select className={field} value={mfrFilter} onChange={(e) => setMfrFilter(e.target.value)}>
              <option value="">All manufacturers</option>
              {manufacturers.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>

          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs text-gray-500">
                <tr>
                  <th className="px-3 py-2 font-medium">Product</th>
                  <th className="px-3 py-2 font-medium">Manufacturer</th>
                  <th className="px-3 py-2 font-medium">Category</th>
                  <th className="px-3 py-2 font-medium">Kit</th>
                  <th className="px-3 py-2 text-right font-medium">Cost £</th>
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
                      <div className="text-[11px] text-gray-400">{p.sku ?? "no SKU"} · {p.unit} · {supplierName(p.supplier_id)}</div>
                    </td>
                    <td className="px-3 py-2">
                      <input defaultValue={p.manufacturer ?? ""} list="mfr-list" placeholder="—"
                        className="w-28 rounded border border-gray-200 px-2 py-1 text-sm focus:border-teal-600 focus:outline-none"
                        onBlur={(e) => { const v = e.target.value.trim(); if (v !== (p.manufacturer ?? "")) updateProduct(p.id, { manufacturer: v || null }); }} />
                    </td>
                    <td className="px-3 py-2 text-gray-600">{PRODUCT_CATEGORY_LABELS[p.category]}</td>
                    <td className="px-3 py-2">
                      {UNIT_CATEGORIES.has(p.category) ? (
                        <select value={p.kit_template_id ?? ""} onChange={(e) => updateProduct(p.id, { kit_template_id: e.target.value || null })}
                          className="w-32 rounded border border-gray-200 px-2 py-1 text-xs focus:border-teal-600 focus:outline-none">
                          <option value="">— no kit —</option>
                          {kits.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
                        </select>
                      ) : <span className="text-[11px] text-gray-300">—</span>}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <input type="number" step="0.01" defaultValue={p.cost_price} className="w-24 rounded border border-gray-300 px-2 py-1 text-right focus:border-teal-600 focus:outline-none"
                        onBlur={(e) => updateProduct(p.id, { cost_price: Number(e.target.value || 0) })} />
                      <div className="text-[10px] text-gray-400">{markupFor(p.category)}% markup</div>
                    </td>
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

      {tab === "kits" && (
        <>
          <form onSubmit={addKit} className="flex flex-wrap items-end gap-2 rounded-xl border border-gray-200 bg-white p-3">
            <input className={`${field} flex-1`} placeholder="New kit name (e.g. Vaillant aroTHERM controls kit)" value={newKitName} onChange={(e) => setNewKitName(e.target.value)} />
            <button className="rounded-lg px-3 py-1.5 text-sm font-semibold text-white" style={{ backgroundColor: "#1B7A6E" }}>Create kit</button>
          </form>
          <p className="text-xs text-gray-500">A kit is a set of parts always fitted together. Attach a kit to a unit in the Products tab; its parts are added automatically (on top of the base kit) when that unit is selected.</p>

          {kits.length === 0 && <p className="rounded-xl border border-dashed border-gray-200 bg-white p-6 text-center text-sm text-gray-400">No kits yet. Create one above.</p>}

          <div className="space-y-3">
            {kits.map((k) => {
              const items = kitItems.filter((it) => it.template_id === k.id);
              const usedBy = products.filter((p) => p.kit_template_id === k.id);
              return (
                <div key={k.id} className="rounded-xl border border-gray-200 bg-white p-4">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <div>
                      <h3 className="text-sm font-semibold text-gray-800">{k.name}</h3>
                      <p className="text-[11px] text-gray-400">{items.length} part(s) · used by {usedBy.length} unit(s)</p>
                    </div>
                    <button onClick={() => deleteKit(k.id)} className="rounded px-2 py-1 text-gray-300 hover:bg-red-50 hover:text-red-600" aria-label="Delete kit" title="Delete kit">🗑</button>
                  </div>
                  <ul className="space-y-1">
                    {items.length === 0 && <li className="text-xs text-gray-400">No parts yet.</li>}
                    {items.map((it) => (
                      <li key={it.id} className="flex items-center justify-between gap-2 rounded bg-gray-50 px-2.5 py-1.5 text-sm">
                        <span className="text-gray-700">{it.products?.name ?? "(part)"}</span>
                        <span className="flex items-center gap-2">
                          <span className="text-xs text-gray-500">×{it.qty}</span>
                          <button onClick={() => removeKitItem(it.id)} className="text-gray-300 hover:text-red-600" aria-label="Remove part" title="Remove part">×</button>
                        </span>
                      </li>
                    ))}
                  </ul>
                  <KitItemAdder products={products} onAdd={(pid, qty) => addKitItem(k.id, pid, qty)} field={field} />
                </div>
              );
            })}
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
                {suppliers.length === 0 && <tr><td colSpan={5} className="px-3 py-6 text-center text-gray-400">No suppliers.</td></tr>}
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

function KitItemAdder({ products, onAdd, field }: { products: Product[]; onAdd: (productId: string, qty: number) => void; field: string }) {
  const [pid, setPid] = useState("");
  const [qty, setQty] = useState("1");
  const sorted = useMemo(() => [...products].sort((a, b) => a.name.localeCompare(b.name)), [products]);
  return (
    <div className="mt-2 flex items-end gap-2 border-t border-gray-100 pt-2">
      <select className={`${field} flex-1`} value={pid} onChange={(e) => setPid(e.target.value)}>
        <option value="">— add a part —</option>
        {sorted.map((p) => <option key={p.id} value={p.id}>{p.manufacturer ? `${p.manufacturer} · ` : ""}{p.name}</option>)}
      </select>
      <input type="number" step="0.5" min="0" className={`${field} w-20`} value={qty} onChange={(e) => setQty(e.target.value)} />
      <button onClick={() => { if (pid) { onAdd(pid, Number(qty || 1)); setPid(""); setQty("1"); } }} disabled={!pid}
        className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">Add part</button>
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
