"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function DeleteProposalButton({ id, title }: { id: string; title: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function del() {
    if (!confirm(`Delete "${title}"? This permanently removes the proposal, its lines and any purchase orders.`)) return;
    setBusy(true);
    const res = await fetch(`/api/proposals/${id}`, { method: "DELETE" });
    if (res.ok) { router.refresh(); }
    else { const d = await res.json().catch(() => ({})); alert(d.error ?? "Delete failed"); setBusy(false); }
  }

  return (
    <button onClick={del} disabled={busy} title="Delete proposal" aria-label="Delete proposal"
      className="rounded px-2 py-1 text-gray-300 hover:bg-red-50 hover:text-red-600 disabled:opacity-50">
      {busy ? "…" : "🗑"}
    </button>
  );
}
