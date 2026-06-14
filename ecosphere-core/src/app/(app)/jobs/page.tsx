import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { gbp, PRODUCT_LABELS } from "@/lib/constants";
import type { ProductType } from "@/lib/types";

export const dynamic = "force-dynamic";

// Jobs = deals in the Won bucket, shown as a delivery board (Core's side of the
// GHL->Core handoff). The delivery stage is derived from what Dispatch tells us
// (dispatch_jobs.status / deals.job_status); a won deal with no install activity
// yet sits in "To schedule". No schema of its own — reads existing data.
type Stage = "to_schedule" | "scheduled" | "completed";

const COLUMNS: { key: Stage; label: string; dot: string; tint: string }[] = [
  { key: "to_schedule", label: "To schedule", dot: "#64748B", tint: "#F1F5F9" },
  { key: "scheduled", label: "Scheduled", dot: "#F5B83D", tint: "#FEF6E7" },
  { key: "completed", label: "Completed", dot: "#1B7A6E", tint: "#EAF4F1" },
];

function deliveryStage(jobStatus: string | null, dispatchStatus: string | null): Stage {
  if (dispatchStatus === "completed" || jobStatus === "completed") return "completed";
  if (dispatchStatus === "scheduled" || jobStatus === "install_scheduled") return "scheduled";
  return "to_schedule";
}

function fmtDate(d: string | null): string | null {
  if (!d) return null;
  const t = new Date(d);
  return Number.isNaN(t.getTime()) ? null : t.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export default async function JobsPage() {
  const supabase = createClient();

  const { data: dealsData, error } = await supabase
    .from("deals")
    .select("id, customer_name, postcode, value_net, product_interest, ghl_opportunity_id, job_status, job_status_at")
    .eq("stage", "won")
    .order("stage_changed_at", { ascending: false });
  const deals = (dealsData ?? []) as any[];

  // Pull the Dispatch-side install status for these won deals (matched by opp id).
  const oppIds = deals.map((d) => d.ghl_opportunity_id).filter(Boolean);
  const djByOpp = new Map<string, any>();
  if (oppIds.length) {
    const { data: djs } = await supabase
      .from("dispatch_jobs")
      .select("ghl_opportunity_id, status, install_date, installer")
      .in("ghl_opportunity_id", oppIds);
    for (const dj of (djs ?? []) as any[]) djByOpp.set(dj.ghl_opportunity_id, dj);
  }

  const jobs = deals.map((d) => {
    const dj = d.ghl_opportunity_id ? djByOpp.get(d.ghl_opportunity_id) : null;
    return {
      ...d,
      stage: deliveryStage(d.job_status ?? null, dj?.status ?? null),
      install_date: fmtDate(dj?.install_date ?? null),
      installer: dj?.installer ?? null,
    };
  });

  const byStage = (s: Stage) => jobs.filter((j) => j.stage === s);
  const totalValue = jobs.reduce((sum, j) => sum + Number(j.value_net || 0), 0);

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Jobs</h1>
          <p className="text-sm text-gray-500">{jobs.length} won {jobs.length === 1 ? "job" : "jobs"} · {gbp(totalValue)} net</p>
        </div>
        <Link href="/pipeline" className="text-xs font-medium text-teal-700 hover:underline">Pipeline →</Link>
      </div>

      {error && <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error.message}</div>}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {COLUMNS.map((col) => {
          const items = byStage(col.key);
          return (
            <section key={col.key} className="rounded-xl border border-gray-200 bg-gray-50/60 p-3">
              <div className="mb-2 flex items-center justify-between px-1">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: col.dot }} />
                  <span className="text-sm font-semibold text-gray-800">{col.label}</span>
                </div>
                <span className="rounded-full bg-white px-2 py-0.5 text-xs font-medium text-gray-500">{items.length}</span>
              </div>
              <div className="space-y-2">
                {items.length === 0 && <p className="px-1 py-4 text-center text-xs text-gray-400">Nothing here.</p>}
                {items.map((j) => (
                  <Link key={j.id} href={`/jobs/${j.id}`}
                    className="block rounded-lg border border-gray-200 bg-white p-3 transition hover:border-teal-300 hover:shadow-sm">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-semibold text-gray-900">{j.customer_name}</p>
                      <span className="shrink-0 text-xs font-medium text-gray-700">{gbp(Number(j.value_net || 0))}</span>
                    </div>
                    <p className="mt-0.5 text-xs text-gray-500">
                      {PRODUCT_LABELS[j.product_interest as ProductType] ?? j.product_interest ?? "—"}
                      {j.postcode ? ` · ${j.postcode}` : ""}
                    </p>
                    {(j.install_date || j.installer) && (
                      <p className="mt-1.5 rounded-md px-2 py-1 text-[11px] text-gray-600" style={{ backgroundColor: col.tint }}>
                        {j.install_date ? `Install ${j.install_date}` : "Install date TBC"}
                        {j.installer ? ` · ${j.installer}` : ""}
                      </p>
                    )}
                  </Link>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
