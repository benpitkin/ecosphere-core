"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Tech = "ashp" | "solar_pv" | "battery" | "heating_upgrade" | "service";
const TECH: { key: Tech; label: string; grant: number }[] = [
  { key: "ashp", label: "Air source heat pump", grant: 7500 },
  { key: "solar_pv", label: "Solar PV", grant: 0 },
  { key: "battery", label: "Battery storage", grant: 0 },
  { key: "heating_upgrade", label: "Heating upgrade", grant: 0 },
  { key: "service", label: "Service / other", grant: 0 },
];

export default function NewProposalButton() {
  const router = useRouter();
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const [deals, setDeals] = useState<{ id: string; customer_name: string }[]>([]);
  const [who, setWho] = useState("");
  const [tech, setTech] = useState<Tech>("ashp");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open || deals.length) return;
    supabase.from("deals").select("id, customer_name").order("customer_name").then(({ data }) => {
      setDeals((data ?? []).filter((d: any) => d.customer_name) as any);
    });
  }, [open]);

  async function create() {
    if (!who.trim()) { setErr("Who's it for? Pick a deal or type a name."); return; }
    setErr(null); setBusy(true);
    const match = deals.find((d) => d.customer_name.toLowerCase() === who.trim().toLowerCase());
    const t = TECH.find((x) => x.key === tech)!;
    const payload = tech === "ashp" ? { ashp: true } : {};
    try {
      const res = await fetch("/api/proposals/resolve", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deal_id: match?.id ?? null, source: "manual", payload,
          title: `${who.trim()} — ${t.label}`, bus_grant: t.grant,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setErr(data.error ?? "Could not create"); setBusy(false); return; }
      router.push(`/proposals/${data.proposal_id}`);
    } catch (e: any) { setErr(e?.message ?? "Could not create"); setBusy(false); }
  }

  const field = "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-teal-600 focus:outline-none";

  return (
    <>
      <button onClick={() => setOpen(true)} className="rounded-lg px-4 py-2 text-sm font-semibold text-white" style={{ backgroundColor: "#1B7A6E" }}>
        + New proposal
      </button>
      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/40 p-4">
          <div className="my-8 w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-gray-900">New proposal</h2>
            <p className="mb-4 text-sm text-gray-500">A couple of quick details and we'll start a draft you can build out.</p>
            {err && <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}

            <label className="mb-1 block text-xs font-medium text-gray-600">Who's it for?</label>
            <input list="deal-list" value={who} onChange={(e) => setWho(e.target.value)} placeholder="Pick a customer or type a name" className={field} />
            <datalist id="deal-list">
              {deals.map((d) => <option key={d.id} value={d.customer_name} />)}
            </datalist>
            <p className="mb-3 mt-1 text-[11px] text-gray-400">{deals.length} customers from GoHighLevel — or type a new name.</p>

            <label className="mb-1 block text-xs font-medium text-gray-600">What technology?</label>
            <select value={tech} onChange={(e) => setTech(e.target.value as Tech)} className={field}>
              {TECH.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
            </select>

            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => { setOpen(false); setErr(null); }} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">Cancel</button>
              <button onClick={create} disabled={busy} className="rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-60" style={{ backgroundColor: "#1B7A6E" }}>
                {busy ? "Creating…" : "Create draft"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
