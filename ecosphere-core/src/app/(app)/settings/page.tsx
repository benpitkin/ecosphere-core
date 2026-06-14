import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ProductCategory } from "@/lib/proposal";
import { mergeAssumptions } from "@/lib/standingAssumptions";
import { getStatus as getXeroStatus, xeroConfigured } from "@/lib/xero";
import ProposalSettingsEditor from "@/components/ProposalSettingsEditor";

export const dynamic = "force-dynamic";

type MarginRow = { id: string; category: ProductCategory | null; markup_pct: number };

export default async function SettingsPage({ searchParams }: { searchParams: { xero?: string; reason?: string } }) {
  const supabase = createClient();

  const [margins, products, suppliers, contacts, proposals, pipelines, settings] = await Promise.all([
    supabase.from("margin_rules").select("id, category, markup_pct"),
    supabase.from("products").select("id", { count: "exact", head: true }),
    supabase.from("suppliers").select("id", { count: "exact", head: true }),
    supabase.from("contacts").select("id", { count: "exact", head: true }),
    supabase.from("proposals").select("id", { count: "exact", head: true }),
    supabase.from("pipelines").select("id", { count: "exact", head: true }),
    supabase.from("app_settings").select("value").eq("key", "proposal_assumptions").maybeSingle(),
  ]);

  const rules = ((margins.data ?? []) as MarginRow[]).slice().sort((a, b) => {
    if (a.category === null) return -1;
    if (b.category === null) return 1;
    return a.category.localeCompare(b.category);
  });
  const assumptions = mergeAssumptions((settings.data as any)?.value);

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const supabaseHost = supabaseUrl ? supabaseUrl.replace(/^https?:\/\//, "") : "Not configured";
  const ghlConfigured = Boolean(process.env.GHL_API_KEY && process.env.GHL_LOCATION_ID);

  const xero = await getXeroStatus(createAdminClient());
  const xeroReady = xeroConfigured();

  const integrations = [
    { name: "Supabase (database + auth)", status: supabaseHost, ok: Boolean(supabaseUrl) },
    { name: "GoHighLevel", status: ghlConfigured ? "API key configured" : "Add GHL_API_KEY + GHL_LOCATION_ID to enable sync", ok: ghlConfigured },
    { name: "Reonic / design import", status: "Planned", ok: false },
    { name: "Xero", status: xero.connected ? `Connected: ${xero.tenantName}` : xeroReady ? "Configured — not connected" : "Add XERO_CLIENT_ID/SECRET", ok: xero.connected },
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
        <p className="text-sm text-gray-500">Company details, pricing defaults and integration status for EcoSphere Core.</p>
      </div>

      <section className={card}>
        <h2 className="text-sm font-semibold text-gray-800">Company</h2>
        <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          <div className="flex justify-between sm:block"><dt className="text-gray-500">Trading name</dt><dd className="font-medium text-gray-900">EcoSphere Energy Ltd</dd></div>
          <div className="flex justify-between sm:block"><dt className="text-gray-500">Sector</dt><dd className="font-medium text-gray-900">MCS-accredited renewable installer</dd></div>
          <div className="flex justify-between sm:block"><dt className="text-gray-500">Region</dt><dd className="font-medium text-gray-900">Devon, UK</dd></div>
          <div className="flex justify-between sm:block"><dt className="text-gray-500">Products</dt><dd className="font-medium text-gray-900">ASHP · Solar PV · Battery · Heating</dd></div>
        </dl>
        <p className="mt-3 text-[11px] text-gray-400">These details appear on customer-facing proposals. Editable company records are on the roadmap.</p>
      </section>

      <ProposalSettingsEditor initialAssumptions={assumptions} initialMargins={rules} />

      <p className="text-xs text-gray-400">
        Per-part costs and SKUs are managed in the <Link href="/catalogue" className="font-medium text-teal-700 hover:underline">Catalogue</Link>.
      </p>

      <section className={card}>
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-gray-800">Xero (invoicing)</h2>
            <p className="mt-1 text-sm text-gray-500">
              {xero.connected ? `Connected to ${xero.tenantName}. Jobs can raise invoices into Xero.` : "Connect your Xero organisation so won jobs can raise invoices."}
            </p>
          </div>
          {xeroReady ? (
            <a href="/api/xero/connect" className="shrink-0 rounded-lg px-3 py-2 text-sm font-semibold text-white" style={{ backgroundColor: "#1B7A6E" }}>
              {xero.connected ? "Reconnect" : "Connect Xero"}
            </a>
          ) : (
            <span className="shrink-0 rounded-lg bg-gray-100 px-3 py-2 text-xs text-gray-400">Set XERO_CLIENT_ID/SECRET</span>
          )}
        </div>
        {searchParams.xero === "connected" && <p className="mt-2 rounded-md bg-teal-50 px-3 py-2 text-xs text-teal-700">Xero connected successfully.</p>}
        {searchParams.xero === "error" && <p className="mt-2 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">Xero connection failed{searchParams.reason ? ` (${searchParams.reason})` : ""}. Try again.</p>}
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

      <p className="text-center text-[11px] text-gray-400">Labour, design defaults and margins are editable above. Company record and integration keys are on the roadmap.</p>
    </div>
  );
}
