import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { gbp } from "@/lib/constants";
import type { ProposalLine, ProductCategory } from "@/lib/proposal";
import { PRODUCT_CATEGORY_LABELS } from "@/lib/proposal";
import PrintButton from "@/components/PrintButton";

export const dynamic = "force-dynamic";

// Customer-facing, print-friendly proposal. Shows sell prices only (no cost/margin).
export default async function PrintProposal({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: proposal, error } = await supabase
    .from("proposals").select("*, deals(customer_name, address, postcode, email)").eq("id", params.id).single();
  if (error || !proposal) notFound();

  const { data: lines } = await supabase.from("proposal_lines").select("*").eq("proposal_id", params.id).order("sort");
  const ls = (lines ?? []) as ProposalLine[];
  const sell = (l: ProposalLine) => Math.round(l.unit_cost * (1 + l.markup_pct / 100) * 100) / 100;
  const total = ls.reduce((s, l) => s + l.qty * sell(l), 0);
  const customerPays = total - Number(proposal.bus_grant);
  const today = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  const cust = (proposal as any).deals;

  return (
    <div className="mx-auto max-w-3xl bg-white p-8 text-gray-800">
      <style>{`@media print { .no-print { display: none !important; } body { background: #fff; } } @page { margin: 18mm; }`}</style>

      <div className="no-print mb-4 flex justify-end"><PrintButton /></div>

      <div className="flex items-start justify-between border-b border-gray-200 pb-5">
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-lg text-lg font-bold text-white" style={{ backgroundColor: "#1B7A6E" }}>E</span>
          <div>
            <p className="text-lg font-semibold text-gray-900">Ecosphere Energy Ltd</p>
            <p className="text-xs text-gray-500">MCS-accredited renewable installer · Devon</p>
          </div>
        </div>
        <div className="text-right text-xs text-gray-500">
          <p className="text-sm font-semibold text-gray-900">{proposal.title}</p>
          <p>{today}</p>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-4 text-sm">
        <div>
          <p className="text-xs uppercase tracking-wide text-gray-400">Prepared for</p>
          <p className="font-medium text-gray-900">{cust?.customer_name ?? "Customer"}</p>
          {cust?.address && <p className="text-gray-600">{cust.address}{cust.postcode ? `, ${cust.postcode}` : ""}</p>}
          {cust?.email && <p className="text-gray-600">{cust.email}</p>}
        </div>
        <div className="text-right">
          <p className="text-xs uppercase tracking-wide text-gray-400">Your investment</p>
          <p className="text-2xl font-semibold" style={{ color: "#1B7A6E" }}>{gbp(customerPays)}</p>
          <p className="text-xs text-gray-500">after {gbp(Number(proposal.bus_grant))} Boiler Upgrade Scheme grant</p>
        </div>
      </div>

      <h2 className="mt-7 text-sm font-semibold text-gray-800">What's included</h2>
      <table className="mt-2 w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 text-left text-xs text-gray-500">
            <th className="py-2 font-medium">Item</th>
            <th className="py-2 text-right font-medium">Qty</th>
            <th className="py-2 text-right font-medium">Price</th>
          </tr>
        </thead>
        <tbody>
          {ls.map((l) => (
            <tr key={l.id} className="border-b border-gray-100">
              <td className="py-2">
                {l.description}
                {l.category && <span className="ml-2 text-[11px] text-gray-400">{PRODUCT_CATEGORY_LABELS[l.category as ProductCategory] ?? ""}</span>}
              </td>
              <td className="py-2 text-right text-gray-600">{Number(l.qty)}</td>
              <td className="py-2 text-right text-gray-900">{gbp(l.qty * sell(l))}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-4 ml-auto w-64 space-y-1 text-sm">
        <div className="flex justify-between"><span className="text-gray-500">System total</span><span className="text-gray-900">{gbp(total)}</span></div>
        <div className="flex justify-between"><span className="text-gray-500">Boiler Upgrade Scheme grant</span><span className="text-gray-900">−{gbp(Number(proposal.bus_grant))}</span></div>
        <div className="flex justify-between border-t border-gray-200 pt-1 text-base font-semibold"><span>You pay</span><span style={{ color: "#1B7A6E" }}>{gbp(customerPays)}</span></div>
      </div>

      <div className="mt-8 border-t border-gray-200 pt-4 text-xs text-gray-500">
        <p>Prices include applicable VAT. The Boiler Upgrade Scheme grant is applied as a deduction; Ecosphere Energy administers the voucher on your behalf. This proposal is valid for 30 days. Installation carried out to MCS standards with full handover documentation.</p>
      </div>
    </div>
  );
}
