import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PRODUCT_CATEGORY_LABELS } from "@/lib/proposal";
import type { ProductCategory } from "@/lib/proposal";

export const dynamic = "force-dynamic";

type MarginRow = { id: string; category: ProductCategory | null; markup_pct: number };

export default async function SettingsPage() {
  const supabase = createClient();

  const [margins, products, suppliers, contacts, proposals, pipelines] = await Promise.all([
    supabase.from("margin_rules").select("id, category, markup_pct"),
    supabase.from("products").select("id", { count: "exact", head: true }),
    supabase.from("suppliers").select("id", { count: "exact", head: true }),
    supabase.from("contacts").select("id", { count: "exact", head: true }),
    supabase.from("proposals").select("id", { count: "exact", head: true }),
    supabase.from("pipelines").select("id", { count: "exact", head: true }),
  ]);

  const rules = ((margins.data ?? []) as MarginRow[]).slice().sort((a, b) => {
    if (a.category === null) return -1;
    if (b.category === null) return 1;
    return a.category.localeCompare(b.category);
  });
  const globalRule = rules.find((r) => r.category === null);

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const supabaseHost = supabaseUrl ? supabaseUrl.replace(/^https?:\/\//, "") : "Not configured";
  const ghlConfigured = Boolean(process.env.GHL_API_KEY && process.env.GHL_LOCATION_ID);

  const integrations = [
    { name: "Supabase (database + auth)", status: supabaseHost, ok: Boolean(supabaseUrl) },
    { name: "GoHighLevel", status: ghlConfigured ? "API key configured" : "Add GHL_API_KEY + GHL_LOCATION_ID to enable sync", ok: ghlConfigured },
    { name: "Reonic / design import", status: "Planned", ok: false },
    { name: "Xero (finance / Pulse)", status: "Planned", ok: false },
  ];

  const counts = [
    { label: "Pipelines", value: pipelines.count ?? 0, href: "/pipeline" },
    { label: "Contacts", value: contacts.count ?? 0, href: "/contacts" },
    { label: "Proposals", value: proposals.count ?? 0, href: "/proposals" },
    { label: "Catalogue products", value: products.count ?? 0, href: "/catalogue" },
    { label: "Suppliers", value: suppliers.count ?? 0, href: "/catalogue" },
  ];

  const card = "rounded-xl border border-gray-200 bg-white p-5";

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Settings</h1>
        <p className="text-sm text-gray-500">Company details, pricing defaults and integration status for Ecosphere Core.</p>
      </div>

      <section className={card}>
        <h2 className="text-sm font-semibold text-gray-800">Company</h2>
        <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          <div className="flex justify-between sm:block"><dt className="text-gray-500">Trading name</dt><dd className="font-medium text-gray-900">Ecosphere Energy Ltd</dd></div>
          <div className="flex justify-between sm:block"><dt className="text-gray-500">Sector</dt><dd className="font-medium text-gray-900">MCS-accredited renewable installer</dd></div>
          <div className="flex justify-between sm:block"><dt className="text-gray-500">Region</dt><dd className="font-medium text-gray-900">Devon, UK</dd></div>
          <div className="flex justify-between sm:block"><dt className="text-gray-500">Products</dt><dd className="font-medium text-gray-900">ASHP · Solar PV · Battery · Heating</dd></div>
        </dl>
        <p className="mt-3 text-[11px] text-gray-400">These details appear on customer-facing proposals. Editable company records are on the roadmap.</p>
      </section>

      <section className={card}>
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-800">Pricing &amp; margins</h2>
          <Link href="/catalogue" className="text-xs font-medium text-teal-700 hover:underline">Edit in Catalogue →</Link>
        </div>
        <p className="mt-1 text-sm text-gray-500">
          Sell prices are derived: <span className="font-mono text-xs">cost × (1 + markup%)</span>. Global default
          {globalRule ? <> is <span className="font-semibold text-gray-900">{globalRule.markup_pct}%</span></> : " not set"}; per-category rules override it.
        </p>
        <div className="mt-3 overflow-hidden rounded-lg border border-gray-100">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs text-gray-500">
              <tr><th className="px-3 py-2 font-medium">Category</th><th className="px-3 py-2 text-right font-medium">Markup</th></tr>
            </thead>
            <tbody>
              {rules.length === 0 && <tr><td colSpan={2} className="px-3 py-3 text-gray-400">No margin rules yet.</td></tr>}
              {rules.map((r) => (
                <tr key={r.id} className="border-t border-gray-100">
                  <td className="px-3 py-2 text-gray-800">{r.category === null ? "Global default" : (PRODUCT_CATEGORY_LABELS[r.category] ?? r.category)}</td>
                  <td className="px-3 py-2 text-right font-medium text-gray-900">{r.markup_pct}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className={card}>
        <h2 className="text-sm font-semibold text-gray-800">Integrations</h2>
        <div className="mt-3 space-y-2">
          {integrations.map((i) => (
            <div key={i.name} className="flex items-center gap-3 rounded-lg border border-gray-100 px-3 py-2">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: i.ok ? "#1B7A6E" : "#D1D5DB" }} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-800">{i.name}</p>
                <p className="truncate text-[11px] text-gray-400">{i.status}</p>
              </div>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${i.ok ? "bg-teal-50 text-teal-700" : "bg-gray-100 text-gray-400"}`}>
                {i.ok ? "Connected" : "Off"}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className={card}>
        <h2 className="text-sm font-semibold text-gray-800">Data summary</h2>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
          {counts.map((c) => (
            <Link key={c.label} href={c.href} className="rounded-lg bg-gray-50 p-3 transition hover:bg-gray-100">
              <p className="text-xl font-semibold text-gray-900">{c.value.toLocaleString("en-GB")}</p>
              <p className="text-[11px] text-gray-500">{c.label}</p>
            </Link>
          ))}
        </div>
      </section>

      <section className={card}>
        <h2 className="text-sm font-semibold text-gray-800">Pipeline buckets (BI canonical stages)</h2>
        <p className="mt-1 text-sm text-gray-500">Every board column rolls up to one of these macro-stages, which Pulse and Dispatch read.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {["New Enquiry", "Contacted", "Survey Booked", "Quoted", "Won", "Lost"].map((s) => (
            <span key={s} className="rounded-full border border-gray-200 px-3 py-1 text-xs text-gray-600">{s}</span>
          ))}
        </div>
      </section>

      <p className="text-center text-[11px] text-gray-400">Read-only for now — editable settings (company record, custom margins, integration keys) are on the roadmap.</p>
    </div>
  );
}
