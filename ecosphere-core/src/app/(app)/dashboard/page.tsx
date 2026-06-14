import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import TasksPanel from "@/components/TasksPanel";
import { STAGE_LABELS, STAGE_COLORS, LEAD_SOURCE_LABELS, gbp, gbpK, initials } from "@/lib/constants";
import type { PipelineStage, LeadSource } from "@/lib/types";

const STAGE_ORDER: PipelineStage[] = ["new_enquiry", "contacted", "survey_booked", "quoted", "won", "lost"];

export const dynamic = "force-dynamic";

const BUS_STATUS_LABELS: Record<string, string> = {
  applied: "Applied", issued: "Issued", redeemed: "Redeemed", paid: "Paid", expired: "Expired", rejected: "Rejected",
};

export default async function DashboardPage() {
  const supabase = createClient();

  const [{ data: kpis }, { data: cashflow }, { data: attention }, { data: recent }, { data: byStage }, { data: bySource }, { data: metrics }] = await Promise.all([
    supabase.from("v_dashboard_kpis").select("*").single(),
    supabase.from("v_bus_cashflow").select("*"),
    supabase.from("v_needs_attention").select("*").limit(6),
    supabase.from("deals").select("id, customer_name, postcode, stage, value_net, created_at").order("created_at", { ascending: false }).limit(6),
    supabase.from("v_pipeline_by_stage").select("stage, deal_count, total_net_value"),
    supabase.from("v_deals_by_source").select("lead_source, deal_count, total_net_value"),
    supabase.from("v_deal_metrics").select("win_rate, won_deals, lost_deals, avg_deal_size").single(),
  ]);

  const { data: proposalRows } = await supabase.from("proposals").select("id, title, status, deal_id, created_at, deals(customer_name)").order("created_at", { ascending: false }).limit(5);
  const { data: propTotals } = await supabase.from("v_proposal_totals").select("proposal_id, total_sell, status");
  const openProps = (propTotals ?? []).filter((t: any) => !["accepted","rejected","expired"].includes(t.status));
  const openPropValue = openProps.reduce((s: number, t: any) => s + Number(t.total_sell), 0);
  const recentProps = (proposalRows ?? []) as any[];

  // Average deal size is only meaningful over deals that actually carry a value:
  // ~64% of GHL-imported opportunities have £0, which would drag a naive average
  // far below a typical real deal.
  const { data: dealVals } = await supabase.from("deals").select("value_net");
  const valuedAmounts = (dealVals ?? []).map((d: any) => Number(d.value_net) || 0).filter((v) => v > 0);
  const valuedCount = valuedAmounts.length;
  const avgValued = valuedCount ? Math.round(valuedAmounts.reduce((a, b) => a + b, 0) / valuedCount) : 0;

  // Jobs in delivery (Core's job board, summarised) — delivery stage derived from
  // the Dispatch status we store; a won deal with no install activity = to schedule.
  const { data: wonRows } = await supabase.from("deals").select("ghl_opportunity_id, job_status").eq("stage", "won");
  const wonList = (wonRows ?? []) as any[];
  const wonOppIds = wonList.map((w) => w.ghl_opportunity_id).filter(Boolean);
  const djStatus = new Map<string, string>();
  if (wonOppIds.length) {
    const { data: djs } = await supabase.from("dispatch_jobs").select("ghl_opportunity_id, status").in("ghl_opportunity_id", wonOppIds);
    for (const dj of (djs ?? []) as any[]) djStatus.set(dj.ghl_opportunity_id, dj.status);
  }
  const jobCounts = { to_schedule: 0, scheduled: 0, completed: 0 };
  for (const w of wonList) {
    const ds = w.ghl_opportunity_id ? djStatus.get(w.ghl_opportunity_id) : null;
    if (ds === "completed" || w.job_status === "completed") jobCounts.completed++;
    else if (ds === "scheduled" || w.job_status === "install_scheduled") jobCounts.scheduled++;
    else jobCounts.to_schedule++;
  }
  // Today's installs — scheduling lives in Dispatch; Core reflects the date read-only.
  const todayIso = new Date().toISOString().slice(0, 10);
  const { data: todayRows } = await supabase
    .from("dispatch_jobs").select("deal_id, installer").eq("install_date", todayIso);
  const todayDealIds = ((todayRows ?? []) as any[]).map((r) => r.deal_id).filter(Boolean);
  const todayNames = new Map<string, string>();
  if (todayDealIds.length) {
    const { data: tnd } = await supabase.from("deals").select("id, customer_name").in("id", todayDealIds);
    for (const dd of (tnd ?? []) as any[]) todayNames.set(dd.id, dd.customer_name);
  }
  const todayInstalls = ((todayRows ?? []) as any[]).map((r) => ({
    customer: (r.deal_id && todayNames.get(r.deal_id)) || "Install",
    installer: r.installer ?? null,
  }));

  // Office tasks (graceful if the table isn't migrated yet → empty list).
  const { data: taskRows } = await supabase.from("tasks").select("id, title, done").order("done").order("created_at");

  const k = kpis ?? { active_jobs: 0, won_jobs_this_month: 0, won_value_this_month: 0, open_pipeline_value: 0, open_opportunities: 0, contacts_count: 0 };
  const cf = (cashflow ?? []) as { status: string; voucher_count: number; total_amount: number }[];
  const att = (attention ?? []) as { id: string; customer_name: string; stage_label: string | null; value_net: number; postcode: string | null; days_in_stage: number }[];
  const rec = (recent ?? []) as { id: string; customer_name: string; postcode: string | null; stage: PipelineStage; value_net: number }[];

  const busTotal = cf.reduce((s, r) => s + Number(r.total_amount), 0);

  // Pipeline funnel by canonical bucket (ordered).
  const stageRows = (byStage ?? []) as { stage: PipelineStage; deal_count: number; total_net_value: number }[];
  const funnel = STAGE_ORDER.map((s) => {
    const r = stageRows.find((x) => x.stage === s);
    return { stage: s, count: Number(r?.deal_count ?? 0), value: Number(r?.total_net_value ?? 0) };
  });
  const funnelMax = Math.max(1, ...funnel.map((f) => f.value));
  const wonValue = funnel.find((f) => f.stage === "won")?.value ?? 0;

  // Unified lifecycle strip (Payaca-style: Lead -> Complete) — sales stages + job delivery.
  const fcount = (s: PipelineStage) => funnel.find((f) => f.stage === s)?.count ?? 0;
  const lifecycle = [
    { label: "Lead", count: fcount("new_enquiry") + fcount("contacted"), color: "#64748B" },
    { label: "Survey", count: fcount("survey_booked"), color: "#7C3AED" },
    { label: "Quote", count: fcount("quoted"), color: "#B45309" },
    { label: "Install", count: jobCounts.to_schedule + jobCounts.scheduled, color: "#F5B83D" },
    { label: "Complete", count: jobCounts.completed, color: "#1B7A6E" },
  ];

  // Lead-source breakdown (descending by value).
  const sourceRows = ((bySource ?? []) as { lead_source: LeadSource; deal_count: number; total_net_value: number }[])
    .map((r) => ({ source: r.lead_source, count: Number(r.deal_count), value: Number(r.total_net_value) }))
    .sort((a, b) => b.value - a.value);
  const sourceMax = Math.max(1, ...sourceRows.map((s) => s.value));

  const m = metrics ?? { win_rate: 0, won_deals: 0, lost_deals: 0, avg_deal_size: 0 };
  const winRatePct = Math.round(Number(m.win_rate) * 100);

  // Tiles reflect what the data can actually support: every GHL deal was imported
  // on one date, so "this month" breakdowns aren't real yet, and no deal has a job
  // status, so "active jobs" can't be derived. These show honest, all-time figures.
  const tiles = [
    { label: "Open pipeline", value: gbpK(Number(k.open_pipeline_value)), sub: `${k.open_opportunities} open deals`, accent: "#7C3AED" },
    { label: "Won (to date)", value: gbpK(wonValue), sub: `${m.won_deals} deals won`, accent: "#1B7A6E" },
    { label: "Avg deal size", value: gbp(avgValued), sub: `across ${valuedCount} deals with a value`, accent: "#64748B" },
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

      {/* Pipeline lifecycle (Lead -> Complete) + Today's installs — Payaca-style */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <section className="rounded-xl border border-gray-200 bg-white p-4 lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-800">Pipeline</h2>
            <Link href="/pipeline" className="text-xs font-medium text-teal-700 hover:underline">View &rarr;</Link>
          </div>
          <div className="grid grid-cols-5 gap-2">
            {lifecycle.map((s, i) => (
              <Link key={s.label} href={i >= 3 ? "/jobs" : "/pipeline"}
                className="rounded-lg border border-gray-100 p-3 text-center transition hover:bg-gray-50">
                <span className="mx-auto mb-1.5 block h-1 w-8 rounded" style={{ backgroundColor: s.color }} />
                <p className="text-2xl font-semibold text-gray-900">{s.count}</p>
                <p className="text-[11px] text-gray-500">{s.label}</p>
              </Link>
            ))}
          </div>
        </section>

        <div className="space-y-4">
          <section className="rounded-xl border border-gray-200 bg-white p-4">
            <h2 className="mb-2 text-sm font-semibold text-gray-800">Today &middot; installs</h2>
            {todayInstalls.length === 0 ? (
              <p className="py-4 text-sm text-gray-400">No installs scheduled today.</p>
            ) : (
              <ul className="space-y-2">
                {todayInstalls.map((t, i) => (
                  <li key={i} className="flex items-center justify-between gap-2 border-l-2 pl-2 text-sm" style={{ borderColor: "#1B7A6E" }}>
                    <span className="font-medium text-gray-800">{t.customer}</span>
                    {t.installer && <span className="text-[11px] text-gray-400">{t.installer}</span>}
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-2 text-[11px] text-gray-400">Scheduled in Dispatch &middot; reflected here.</p>
          </section>
          <TasksPanel initial={(taskRows ?? []) as any[]} />
        </div>
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

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-gray-200 bg-white p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-800">Pipeline by stage</h2>
            <span className="rounded-full bg-teal-50 px-2 py-0.5 text-[11px] font-semibold text-teal-700">{winRatePct}% win rate</span>
          </div>
          <div className="space-y-2">
            {funnel.map((f) => (
              <div key={f.stage}>
                <div className="mb-0.5 flex items-center justify-between text-xs">
                  <span className="text-gray-600">{STAGE_LABELS[f.stage]} <span className="text-gray-400">&middot; {f.count}</span></span>
                  <span className="font-medium text-gray-700">{gbp(f.value)}</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
                  <div className="h-full rounded-full" style={{ width: `${Math.max(2, (f.value / funnelMax) * 100)}%`, backgroundColor: STAGE_COLORS[f.stage] }} />
                </div>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[11px] text-gray-400">{m.won_deals} won &middot; {m.lost_deals} lost &middot; avg {gbp(avgValued)} across {valuedCount} valued deals</p>
        </section>

        <section className="rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="mb-3 text-sm font-semibold text-gray-800">By lead source</h2>
          {sourceRows.length === 0 ? (
            <p className="text-sm text-gray-400">No deals yet.</p>
          ) : (
            <div className="space-y-2">
              {sourceRows.map((s) => (
                <div key={s.source}>
                  <div className="mb-0.5 flex items-center justify-between text-xs">
                    <span className="text-gray-600">{LEAD_SOURCE_LABELS[s.source] ?? s.source} <span className="text-gray-400">&middot; {s.count}</span></span>
                    <span className="font-medium text-gray-700">{gbp(s.value)}</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
                    <div className="h-full rounded-full" style={{ width: `${Math.max(2, (s.value / sourceMax) * 100)}%`, backgroundColor: "#1B7A6E" }} />
                  </div>
                </div>
              ))}
            </div>
          )}
          <p className="mt-3 text-[11px] text-gray-400">Pipeline value attributed to each lead source.</p>
        </section>
      </div>

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
          <Link href="/proposals" className="text-xs font-medium text-teal-700 hover:underline">View all &rarr;</Link>
        </div>
        <p className="mb-3 text-sm text-gray-500">{openProps.length} open &middot; {gbp(openPropValue)} (sell)</p>
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
            <Link href="/pipeline" className="text-xs font-medium text-teal-700 hover:underline">View all &rarr;</Link>
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
            <p className="py-3 text-sm text-gray-400">Nothing flagged as stale (needs stage-change dates from GHL to track this fully).</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {att.map((d) => (
                <li key={d.id}>
                  <Link href={`/deals/${d.id}`} className="flex items-center justify-between gap-3 py-2.5 hover:opacity-80">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-gray-800">{d.customer_name}</p>
                      <p className="truncate text-[11px] text-amber-700">{d.stage_label ?? "—"} &middot; {d.days_in_stage}d stale</p>
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
