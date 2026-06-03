"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function SyncGhlButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function sync() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/sync/ghl", { method: "POST" });
      const json = await res.json();
      if (!res.ok) {
        setMsg(json.error ?? "Sync failed");
      } else {
        setMsg(`Synced ${json.contacts_synced} contacts, ${json.opportunities_synced} opportunities.`);
        router.refresh();
      }
    } catch (e: any) {
      setMsg(e?.message ?? "Sync failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      {msg && <span className="text-xs text-gray-500">{msg}</span>}
      <button
        onClick={sync}
        disabled={busy}
        className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
      >
        {busy ? "Syncing…" : "Sync from GoHighLevel"}
      </button>
    </div>
  );
}
