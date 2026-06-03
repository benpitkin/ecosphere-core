import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { STAGE_LABELS, STAGE_COLORS, gbp, gbpK, initials } from "@/lib/constants";
import type { PipelineStage } from "@/lib/types";

export const dynamic = "force-dynamic";

const BUS_STATUS_LABELS: Record<string, string> = {
  applied: "Applied", issued: "Issued", redeemed: "Redeemed", paid: "Paid", expired: "Expired", rejected: "Rejected",
};

export default async function DashboardPage() {
  const supabase = createClient();

  const [{ data: kpis }, { data: cashflow }, { data: attention }, { data: recent }] = await Promise.all([
    supabase.from("v_dashboard_kpis").select("*").single(),
    supabase.from("v_bus_cashflow").select("*"),
    supabase.from("v_needs_attention").select("*").limit(6),
    supabase.from("deals").select("id, customer_name, postcode, stage, value_net, created_at").order("created_at", { ascending: false }).limit(6),
  ]);

  const { data: proposalRows } = await supabase.from("proposals").select("id, title, status, deal_id, created_at, deals(customer_name)").order("created_at", { ascending: false }).limit(5);
  const { data: propTotals } = await supabase.from("v_proposal_totals").select("proposal_id, total_sell, status");
  const openProps = (propTotals ?? []).filter((t: any) => !["accepted","rejected","expired"].includes(t.status));
  const openPropValue = openProps.reduce((s: number, t: any) => s + Number(t.total_sell), 0);
  const recentProps = (proposalRows ?? []) as any[];

  const k = kpis ?? { active_jobs: 0, won_jobs_this_month: 0, won_value_this_month: 0, open_pipeline_value: 0, open_opportunities: 0, contacts_count: 0 };
  const cf = (cashflow ?? []) as { status: string; voucher_count: number; total_amount: number }[];
  const att = (attention ?? []) as { id: string; customer_name: string; stage_label: string | null; value_net: number; postcode: string | null; days_in_stage: number }[];
  const rec = (recent ?? []) as { id: string; customer_name: string; postcode: string | null; stage: PipelineStage; value_net: number }[];

  const busTotal = cf.reduce((s, r) => s + Number(r.total_amount), 0);

  const tiles = [
    { label: "Active jobs", value: String(k.active_jobs), sub: `${k.won_jobs_this_month} installs this month`, accent: "#64748B" },
    { label: "Pipeline value", value: gbpK(Number(k.open_pipeline_value)), sub: `${k.open_opportunities} open opportunities`, accent: "#7C3AED" },
    { label: "Won this month", value: gbpK(Number(k.won_value_this_month)), sub: `${k.won_jobs_this_month} deals closed`, accent: "#1B7A6E" },
    { label: "Contacts", value: Number(k.contacts_count).toLocaleString("en-GB"), sub: "in your CRM", accent: "#B45309" },
  ];

  const integrations = [
    { name: "GoHighLevel", status: `${Number(k.contacts_count).toLocaleString("en-GB")} contacts`, ok: Number(k.contacts_count) > 0 },
    { name: "Reonic", status: "Not connected", ok: false },
    { name: "WordPress", status: "Not connected", ok: false },
    { name: "Xero", status: "Not connected", ok: false },
  ];

  const today = new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Dashboard</h1>
          <p className="text-sm text-gray-500">{today}</p>
        </div>
        <div className="flex gap-2">
          <Link href="/jobs" className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">All jobs</Link>
          <Link href="/pipeline" className="rounded-lg px-3 py-2 text-sm font-semibold text-white" style={{ backgroundColor: "#1B7A6E" }}>Pipeline</Link>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map((t) => (
          <div key={t.label} className="relative overflow-hidden rounded-xl border border-gray-200 bg-white p-4">
            <span className="absolute right-0 top-0 h-1 w-12 rounded-bl" style={{ backgroundColor: t.accent }} />
            <p className="text-xs uppercase tracking-wide text-gray-500">{t.label}</p>
            <p className="mt-1 text-3xl font-semibold text-gray-900">{t.value}</p>
            <p className="mt-1 text-xs text-gray-400">{t.sub}</p>
          </div>
        ))}
      </div>

      <section className="rounded-xl border border-gray-200 bg-white p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-800">BUS voucher cash flow</h2>
          <span className="text-sm font-semibold text-gray-900">{gbp(busTotal)} tracked</span>
        </div>
        {cf.length === 0 ? (
          <p className="text-sm text-gray-400">No BUS vouchers tracked yet. Open a deal and add a voucher to start tracking the grant lifecycle.</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {Object.keys(BUS_STATUS_LABELS).map((status) => {
              const row = cf.find((r) => r.status === status);
              return (
                <div key={status} className="rounded-lg bg-gray-50 p-3">
                  <p className="text-[11px] text-gray-500">{BUS_STATUS_LABELS[status]}</p>
                  <p className="mt-0.5 text-sm font-semibold text-gray-900">{gbp(Number(row?.total_amount ?? 0))}</p>
                  <p className="text-[11px] text-gray-400">{row?.voucher_count ?? 0} voucher(s)</p>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Connected integrations</p>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {integrations.map((i) => (
            <div key={i.name} className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white p-3">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: i.ok ? "#1B7A6E" : "#D1D5DB" }} />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-gray-800">{i.name}</p>
                <p className="truncate text-[11px] text-gray-400">{i.status}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-800">Proposals</h2>
          <Link href="/proposals" className="text-xs font-medium text-teal-700 hover:underline">View all →</Link>
        </div>
        <p className="mb-3 text-sm text-gray-500">{openProps.length} open · {gbp(openPropValue)} (sell)</p>
        <ul className="divide-y divide-gray-100">
          {recentProps.length === 0 && <li className="py-2 text-sm text-gray-400">No proposals yet.</li>}
          {recentProps.map((p) => (
            <li key={p.id}>
              <Link href={`/proposals/${p.id}`} className="flex items-center justify-between gap-3 py-2 hover:opacity-80">
                <span className="truncate text-sm font-medium text-gray-800">{p.title}</span>
                <span className="shrink-0 text-[11px] text-gray-400">{p.deals?.customer_name ?? "Unlinked"}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-gray-200 bg-white p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-800">Recent deals</h2>
            <Link href="/pipeline" className="text-xs font-medium text-teal-700 hover:underline">View all →</Link>
          </div>
          <ul className="divide-y divide-gray-100">
            {rec.length === 0 && <li className="py-3 text-sm text-gray-400">No deals yet.</li>}
            {rec.map((d) => (
              <li key={d.id}>
                <Link href={`/deals/${d.id}`} className="flex items-center gap-3 py-2.5 hover:opacity-80">
                  <span className="grid h-8 w-8 place-items-center rounded-full bg-gray-100 text-[11px] font-semibold text-gray-600">{initials(d.customer_name)}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-gray-800">{d.customer_name}</p>
                    <p className="truncate text-[11px] text-gray-400">{d.postcode ?? "—"}</p>
                  </div>
                  <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold text-white" style={{ backgroundColor: STAGE_COLORS[d.stage] }}>{STAGE_LABELS[d.stage]}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-xl border border-gray-200 bg-white p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-800">Needs your attention</h2>
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">{att.length}</span>
          </div>
          {att.length === 0 ? (
            <p className="py-3 text-sm text-gray-400">Inbox zero. Nothing stale.</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {att.map((d) => (
                <li key={d.id}>
                  <Link href={`/deals/${d.id}`} className="flex items-center justify-between gap-3 py-2.5 hover:opacity-80">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-gray-800">{d.customer_name}</p>
                      <p className="truncate text-[11px] text-amber-700">{d.stage_label ?? "—"} · {d.days_in_stage}d stale</p>
                    </div>
                    <span className="shrink-0 text-sm font-semibold text-gray-700">{gbp(Number(d.value_net))}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <p className="text-center text-[11px] text-gray-400">All KPIs pulled live from Supabase. Click any tile or row to drill in.</p>
    </div>
  );
}
