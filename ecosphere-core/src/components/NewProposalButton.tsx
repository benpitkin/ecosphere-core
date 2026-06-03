"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const SAMPLE = {
  heat_pump: { kw: 12, make: "Vaillant", model: "aroTHERM plus 12kW" },
  cylinder: { litres: 210 },
  emitter_schedule: [
    { change: "replaced", type: "T22", width_mm: 1000, height_mm: 600 },
    { change: "replaced", type: "T22", width_mm: 1200, height_mm: 700 },
    { change: "retained", type: "K1", width_mm: 600 },
  ],
  ashp: true,
};

export default function NewProposalButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [json, setJson] = useState(JSON.stringify(SAMPLE, null, 2));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function resolve() {
    setErr(null);
    let payload: any;
    try { payload = JSON.parse(json); } catch { setErr("Design JSON is not valid."); return; }
    setBusy(true);
    try {
      const res = await fetch("/api/proposals/resolve", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: "manual", payload }),
      });
      const data = await res.json();
      if (!res.ok) { setErr(data.error ?? "Resolve failed"); setBusy(false); return; }
      router.push(`/proposals/${data.proposal_id}`);
    } catch (e: any) {
      setErr(e?.message ?? "Resolve failed"); setBusy(false);
    }
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className="rounded-lg px-4 py-2 text-sm font-semibold text-white" style={{ backgroundColor: "#1B7A6E" }}>
        + New proposal
      </button>
      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/40 p-4">
          <div className="my-8 w-full max-w-lg rounded-xl bg-white p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-gray-900">Resolve a design to a kit</h2>
            <p className="mb-3 text-sm text-gray-500">
              Paste a design payload (the sample is a 12kW ASHP with two replaced radiators). The engine matches products, expands the radiator schedule, and adds the ASHP base kit.
            </p>
            {err && <p className="mb-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}
            <textarea value={json} onChange={(e) => setJson(e.target.value)} rows={14}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-xs focus:border-teal-600 focus:outline-none focus:ring-1 focus:ring-teal-600" />
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setOpen(false)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">Cancel</button>
              <button onClick={resolve} disabled={busy} className="rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-60" style={{ backgroundColor: "#1B7A6E" }}>
                {busy ? "Resolving…" : "Resolve → proposal"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
