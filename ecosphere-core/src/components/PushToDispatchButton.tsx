"use client";

import { useState } from "react";

// Manual "design agreed -> hand off to Dispatch" trigger. Posts the proposal's
// kit to the Core sender route, which pushes it to Dispatch (§1).
export default function PushToDispatchButton({ proposalId }: { proposalId: string }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [ok, setOk] = useState<boolean | null>(null);

  async function send() {
    setBusy(true); setMsg(null); setOk(null);
    try {
      const res = await fetch(`/api/proposals/${proposalId}/push-to-dispatch`, { method: "POST" });
      const j = await res.json();
      if (j.ok) { setOk(true); setMsg(`Sent ${j.sent} kit line${j.sent === 1 ? "" : "s"} to Dispatch.`); }
      else { setOk(false); setMsg(j.error ?? "Failed to send."); }
    } catch (e: any) { setOk(false); setMsg(e?.message ?? "Failed to send."); }
    setBusy(false);
  }

  return (
    <div className="mt-4 rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-gray-800">Hand off to Dispatch</p>
          <p className="text-xs text-gray-500">Send this proposal&apos;s agreed kit to the Dispatch install team (matched by GHL opportunity).</p>
        </div>
        <button onClick={send} disabled={busy}
          className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50">
          {busy ? "Sending…" : "Send kit to Dispatch"}
        </button>
      </div>
      {msg && <p className={ok ? "mt-2 text-xs text-teal-700" : "mt-2 text-xs text-red-600"}>{msg}</p>}
    </div>
  );
}
