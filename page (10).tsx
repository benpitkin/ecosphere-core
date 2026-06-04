import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { ActivityType } from "@/lib/types";

export const dynamic = "force-dynamic";

const TYPE_LABELS: Record<ActivityType, string> = {
  note: "Note", call: "Call", email: "Email", sms: "SMS", meeting: "Meeting", system: "System",
};
const TYPE_COLORS: Record<ActivityType, string> = {
  note: "#64748B", call: "#0E7490", email: "#7C3AED", sms: "#B45309", meeting: "#1B7A6E", system: "#94A3B8",
};

type Row = {
  id: number; deal_id: string; type: ActivityType; body: string; created_at: string;
  deals: { customer_name: string } | null;
};

function dayKey(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}
function timeOf(iso: string) {
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

export default async function ActivityPage() {
  const supabase = createClient();
  const { data } = await supabase
    .from("activities")
    .select("id, deal_id, type, body, created_at, deals(customer_name)")
    .order("created_at", { ascending: false })
    .limit(200);
  const rows = (data ?? []) as unknown as Row[];

  // Group by day, preserving descending order.
  const groups: { day: string; items: Row[] }[] = [];
  for (const r of rows) {
    const day = dayKey(r.created_at);
    const g = groups.find((x) => x.day === day);
    if (g) g.items.push(r);
    else groups.push({ day, items: [r] });
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-5">
        <h1 className="text-2xl font-semibold text-gray-900">Activity</h1>
        <p className="text-sm text-gray-500">Everything logged across your deals — notes, calls, emails and meetings.</p>
      </div>

      {groups.length === 0 && (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white p-10 text-center">
          <p className="text-sm text-gray-500">No activity logged yet.</p>
          <p className="mt-1 text-xs text-gray-400">Open a deal and add a note, call or email to start the timeline.</p>
        </div>
      )}

      <div className="space-y-6">
        {groups.map((g) => (
          <section key={g.day}>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">{g.day}</p>
            <ul className="space-y-2">
              {g.items.map((r) => (
                <li key={r.id} className="rounded-xl border border-gray-200 bg-white p-3">
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold text-white" style={{ backgroundColor: TYPE_COLORS[r.type] }}>
                      {TYPE_LABELS[r.type]}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="whitespace-pre-wrap break-words text-sm text-gray-800">{r.body}</p>
                      <div className="mt-1 flex items-center gap-2 text-[11px] text-gray-400">
                        <Link href={`/deals/${r.deal_id}`} className="font-medium text-teal-700 hover:underline">
                          {r.deals?.customer_name ?? "View deal"}
                        </Link>
                        <span>·</span>
                        <span>{timeOf(r.created_at)}</span>
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
