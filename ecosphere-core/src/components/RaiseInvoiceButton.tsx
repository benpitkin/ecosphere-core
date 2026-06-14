"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Triggers the Xero draft-invoice push for a job, then refreshes so the new
// invoice status shows.
export default function RaiseInvoiceButton({ jobId }: { jobId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function raise() {
    setBusy(true); setErr(null);
    try {
      const res = await fetch(`/api/jobs/${jobId}/invoice`, { method: "POST" });
      const j = await res.json();
      if (j.ok) router.refresh();
      else setErr(j.error ?? "Failed to raise invoice.");
    } catch (e: any) {
      setErr(e?.message ?? "Failed to raise invoice.");
    }
    setBusy(false);
  }

  return (
    <div>
      <button onClick={raise} disabled={busy}
        className="rounded-lg bg-teal-600 px-3 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50">
        {busy ? "Raising…" : "Raise invoice in Xero"}
      </button>
      {err && <p className="mt-1 text-xs text-red-600">{err}</p>}
    </div>
  );
}
