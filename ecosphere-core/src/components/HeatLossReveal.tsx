"use client";

import { useState } from "react";

type Emitter = { room: string | null; status: string; type: string | null; size: string | null };

// Customer-side gate: the room-by-room emitter design (the part a rival installer
// would want to copy) stays server-side until the customer proves the proposal is
// theirs by entering their postcode. View-only — no download, no raw file.
export default function HeatLossReveal({ token, count }: { token: string; count: number }) {
  const [postcode, setPostcode] = useState("");
  const [emitters, setEmitters] = useState<Emitter[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function reveal() {
    if (!postcode.trim()) { setErr("Please enter your postcode."); return; }
    setBusy(true); setErr(null);
    try {
      const res = await fetch(`/api/proposal/${token}/heatloss`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postcode: postcode.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { setErr(data.error ?? "Couldn't verify that postcode."); setBusy(false); return; }
      setEmitters(data.emitters ?? []);
    } catch {
      setErr("Something went wrong. Please try again.");
    }
    setBusy(false);
  }

  if (emitters) {
    return (
      <div onContextMenu={(e) => e.preventDefault()} className="select-none">
        <p className="mb-1 text-xs font-semibold text-gray-700">Room-by-room emitter design ({emitters.length})</p>
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-gray-200 text-left text-gray-500">
              <th className="py-1 font-medium">Room</th>
              <th className="py-1 font-medium">Action</th>
              <th className="py-1 font-medium">Emitter</th>
              <th className="py-1 font-medium">Size</th>
            </tr>
          </thead>
          <tbody>
            {emitters.map((e, i) => (
              <tr key={i} className="border-b border-gray-100">
                <td className="py-1 text-gray-800">{e.room ?? "—"}</td>
                <td className="py-1 capitalize text-gray-600">{e.status}</td>
                <td className="py-1 text-gray-600">{e.type ?? "Radiator"}</td>
                <td className="py-1 text-gray-600">{e.size ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-[10px] text-gray-400">This room-by-room design was prepared specifically for your property by EcoSphere Energy and is provided for your records. Please do not redistribute.</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-4">
      <p className="text-sm font-semibold text-gray-800">Full room-by-room heat loss &amp; emitter design</p>
      <p className="mt-1 text-xs text-gray-500">
        Your detailed MCS heating design{count > 0 ? ` (${count} rooms)` : ""} is available to view here. To protect the work prepared for your home,
        enter your property postcode to unlock it.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          value={postcode}
          onChange={(e) => setPostcode(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") reveal(); }}
          placeholder="Your postcode"
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-teal-600 focus:outline-none"
        />
        <button onClick={reveal} disabled={busy} className="rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-60" style={{ backgroundColor: "#1B7A6E" }}>
          {busy ? "Checking…" : "View heating design"}
        </button>
      </div>
      {err && <p className="mt-2 text-xs text-red-600">{err}</p>}
    </div>
  );
}
