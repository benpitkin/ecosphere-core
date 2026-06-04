import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { STAGE_LABELS, STAGE_COLORS, PRODUCT_LABELS, gbp } from "@/lib/constants";
import { PROPOSAL_STATUS_LABELS, PROPOSAL_STATUS_COLORS } from "@/lib/proposal";
import type { PipelineStage, ProductType } from "@/lib/types";
import type { ProposalStatus } from "@/lib/proposal";

export const dynamic = "force-dynamic";

type DealHit = { id: string; customer_name: string; postcode: string | null; stage: PipelineStage; product_interest: ProductType; value_net: number };
type ContactHit = { id: string; full_name: string; email: string | null; phone: string | null; postcode: string | null };
type ProposalHit = { id: string; title: string; status: ProposalStatus; deals: { customer_name: string } | null };

export default async function SearchPage({ searchParams }: { searchParams: { q?: string } }) {
  const q = (searchParams.q ?? "").trim();
  const supabase = createClient();

  let deals: DealHit[] = [];
  let contacts: ContactHit[] = [];
  let proposals: ProposalHit[] = [];

  if (q.length >= 2) {
    const like = `%${q}%`;
    const [d, c, p] = await Promise.all([
      supabase.from("deals").select("id, customer_name, postcode, stage, product_interest, value_net")
        .or(`customer_name.ilike.${like},postcode.ilike.${like},email.ilike.${like},address.ilike.${like}`).limit(25),
      supabase.from("contacts").select("id, full_name, email, phone, postcode")
        .or(`full_name.ilike.${like},email.ilike.${like},phone.ilike.${like},postcode.ilike.${like}`).limit(25),
      supabase.from("proposals").select("id, title, status, deals(customer_name)")
        .ilike("title", like).limit(25),
    ]);
    deals = (d.data ?? []) as DealHit[];
    contacts = (c.data ?? []) as ContactHit[];
    proposals = (p.data ?? []) as unknown as ProposalHit[];
  }

  const total = deals.length + contacts.length + proposals.length;
  const field = "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-teal-600 focus:outline-none focus:ring-1 focus:ring-teal-600";

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-semibold text-gray-900">Search</h1>
      <p className="mb-4 text-sm text-gray-500">Find deals, contacts and proposals by name, postcode, email or phone.</p>

      <form action="/search" method="get" className="mb-6 flex gap-2">
        <input name="q" defaultValue={q} autoFocus placeholder="Search the hub…" className={field} />
        <button className="rounded-lg px-4 py-2 text-sm font-semibold text-white" style={{ backgroundColor: "#1B7A6E" }}>Search</button>
      </form>

      {q.length > 0 && q.length < 2 && <p className="text-sm text-gray-400">Type at least two characters.</p>}
      {q.length >= 2 && <p className="mb-3 text-xs text-gray-400">{total} result{total === 1 ? "" : "s"} for &ldquo;{q}&rdquo;</p>}

      {q.length >= 2 && (
        <div className="space-y-6">
          <section>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Deals ({deals.length})</h2>
            {deals.length === 0 ? <p className="text-sm text-gray-400">No matching deals.</p> : (
              <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white">
                {deals.map((d) => (
                  <li key={d.id}>
                    <Link href={`/deals/${d.id}`} className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-gray-50">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-gray-800">{d.customer_name}</p>
                        <p className="truncate text-[11px] text-gray-400">{PRODUCT_LABELS[d.product_interest]} &middot; {d.postcode ?? "—"}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className="text-sm font-semibold text-gray-700">{gbp(Number(d.value_net))}</span>
                        <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold text-white" style={{ backgroundColor: STAGE_COLORS[d.stage] }}>{STAGE_LABELS[d.stage]}</span>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Contacts ({contacts.length})</h2>
            {contacts.length === 0 ? <p className="text-sm text-gray-400">No matching contacts.</p> : (
              <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white">
                {contacts.map((c) => (
                  <li key={c.id} className="px-4 py-2.5">
                    <p className="text-sm font-medium text-gray-800">{c.full_name}</p>
                    <p className="text-[11px] text-gray-400">{[c.email, c.phone, c.postcode].filter(Boolean).join(" · ") || "—"}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Proposals ({proposals.length})</h2>
            {proposals.length === 0 ? <p className="text-sm text-gray-400">No matching proposals.</p> : (
              <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white">
                {proposals.map((p) => (
                  <li key={p.id}>
                    <Link href={`/proposals/${p.id}`} className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-gray-50">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-gray-800">{p.title}</p>
                        <p className="truncate text-[11px] text-gray-400">{p.deals?.customer_name ?? "Unlinked"}</p>
                      </div>
                      <span className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold text-white" style={{ backgroundColor: PROPOSAL_STATUS_COLORS[p.status] }}>{PROPOSAL_STATUS_LABELS[p.status]}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
