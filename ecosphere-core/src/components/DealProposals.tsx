"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { PROPOSAL_STATUS_LABELS, PROPOSAL_STATUS_COLORS } from "@/lib/proposal";
import type { ProposalStatus } from "@/lib/proposal";

export default function DealProposals({
  dealId, proposals,
}: {
  dealId: string;
  proposals: { id: string; title: string; status: ProposalStatus }[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function create() {
    setBusy(true); setErr(null);
    try {
      const res = await fetch("/api/proposals/resolve", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deal_id: dealId, source: "manual", payload: { ashp: true } }),
      });
      const data = await res.json();
      if (!res.ok) { setErr(data.error ?? "Failed"); setBusy(false); return; }
      router.push(`/proposals/${data.proposal_id}`);
    } catch (e: any) { setErr(e?.message ?? "Failed"); setBusy(false); }
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-800">Proposals</h2>
        <button onClick={create} disabled={busy} className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60">
          {busy ? "Creating…" : "+ New proposal"}
        </button>
      </div>
      {err && <p className="mb-2 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{err}</p>}
      {proposals.length === 0 ? (
        <p className="text-sm text-gray-400">No proposals for this deal yet.</p>
      ) : (
        <ul className="space-y-1.5">
          {proposals.map((p) => (
            <li key={p.id}>
              <Link href={`/proposals/${p.id}`} className="flex items-center justify-between gap-2 rounded-lg bg-gray-50 px-3 py-2 hover:bg-gray-100">
                <span className="truncate text-sm font-medium text-gray-800">{p.title}</span>
                <span className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold text-white" style={{ backgroundColor: PROPOSAL_STATUS_COLORS[p.status] }}>
                  {PROPOSAL_STATUS_LABELS[p.status]}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
