"use client";

import { useEffect, useState } from "react";
import { gbp } from "@/lib/constants";

type Payment = { amount: number; date: string | null; invoice: string | null };

function fmt(d: string | null): string {
  if (!d) return "";
  // Xero JSON dates are ISO ("2026-06-14T00:00:00") or "/Date(1623456789000+0000)/".
  const m = /\/Date\((\d+)/.exec(d);
  const t = m ? new Date(Number(m[1])) : new Date(d);
  return Number.isNaN(t.getTime()) ? "" : t.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

// Loads recent Xero payments client-side so it never blocks the dashboard render.
export default function RecentPayments() {
  const [state, setState] = useState<{ loading: boolean; connected: boolean; payments: Payment[] }>({
    loading: true, connected: true, payments: [],
  });

  useEffect(() => {
    fetch("/api/xero/recent-payments")
      .then((r) => r.json())
      .then((j) => setState({ loading: false, connected: j.connected ?? false, payments: j.payments ?? [] }))
      .catch(() => setState({ loading: false, connected: false, payments: [] }));
  }, []);

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4">
      <h2 className="mb-2 text-sm font-semibold text-gray-800">Recent payments</h2>
      {state.loading ? (
        <p className="py-2 text-sm text-gray-400">Loading…</p>
      ) : !state.connected ? (
        <p className="py-2 text-sm text-gray-400">Connect Xero to see payments.</p>
      ) : state.payments.length === 0 ? (
        <p className="py-2 text-sm text-gray-400">No payments yet.</p>
      ) : (
        <ul className="space-y-1.5">
          {state.payments.map((p, i) => (
            <li key={i} className="flex items-center justify-between text-sm">
              <span className="text-gray-600">{p.invoice ?? "Payment"}{fmt(p.date) ? ` · ${fmt(p.date)}` : ""}</span>
              <span className="font-medium text-teal-700">{gbp(p.amount)}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-[11px] text-gray-400">From Xero.</p>
    </section>
  );
}
