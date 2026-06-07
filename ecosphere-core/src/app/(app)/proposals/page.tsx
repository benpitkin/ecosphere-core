import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { gbp } from "@/lib/constants";
import { PROPOSAL_STATUS_LABELS, PROPOSAL_STATUS_COLORS } from "@/lib/proposal";
import type { ProposalStatus } from "@/lib/proposal";
import NewProposalButton from "@/components/NewProposalButton";
import UploadHeatLossButton from "@/components/UploadHeatLossButton";
import DeleteProposalButton from "@/components/DeleteProposalButton";

export const dynamic = "force-dynamic";

export default async function ProposalsPage() {
  const supabase = createClient();
  const [{ data: proposals }, { data: totals }] = await Promise.all([
    supabase.from("proposals").select("id, title, status, deal_id, bus_grant, created_at, deals(customer_name)").order("created_at", { ascending: false }),
    supabase.from("v_proposal_totals").select("*"),
  ]);

  const totalsById = new Map((totals ?? []).map((t: any) => [t.proposal_id, t]));
  const rows = (proposals ?? []) as any[];

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Proposals</h1>
          <p className="text-sm text-gray-500">{rows.length} proposals · design → costed kit → proposal</p>
        </div>
        <div className="flex items-center gap-2">
          <UploadHeatLossButton />
          <NewProposalButton />
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs text-gray-500">
            <tr>
              <th className="px-3 py-2 font-medium">Proposal</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 text-right font-medium">Sell</th>
              <th className="px-3 py-2 text-right font-medium">BUS</th>
              <th className="px-3 py-2 text-right font-medium">Customer pays</th>
              <th className="px-3 py-2 text-right font-medium">Margin</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={7} className="px-3 py-6 text-center text-gray-400">No proposals yet. Resolve a design to create one.</td></tr>}
            {rows.map((p) => {
              const t = totalsById.get(p.id);
              return (
                <tr key={p.id} className="border-t border-gray-100 hover:bg-gray-50">
                  <td className="px-3 py-2">
                    <Link href={`/proposals/${p.id}`} className="font-medium text-teal-700 hover:underline">{p.title}</Link>
                    <div className="text-[11px] text-gray-400">{p.deals?.customer_name ?? "Unlinked"}</div>
                  </td>
                  <td className="px-3 py-2">
                    <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold text-white" style={{ backgroundColor: PROPOSAL_STATUS_COLORS[p.status as ProposalStatus] }}>
                      {PROPOSAL_STATUS_LABELS[p.status as ProposalStatus]}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right text-gray-800">{gbp(Number(t?.total_sell ?? 0))}</td>
                  <td className="px-3 py-2 text-right text-gray-500">{gbp(Number(p.bus_grant ?? 0))}</td>
                  <td className="px-3 py-2 text-right font-semibold text-gray-900">{gbp(Number(t?.customer_pays ?? 0))}</td>
                  <td className="px-3 py-2 text-right text-gray-600">{Math.round(Number(t?.margin_pct ?? 0) * 100)}%</td>
                  <td className="px-3 py-2 text-right"><DeleteProposalButton id={p.id} title={p.title} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
