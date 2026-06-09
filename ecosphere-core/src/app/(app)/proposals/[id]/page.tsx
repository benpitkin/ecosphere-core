import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Proposal, ProposalLine, Product, Supplier, MarginRule } from "@/lib/proposal";
import ProposalBuilder from "@/components/ProposalBuilder";
import CustomerDocEditor from "@/components/CustomerDocEditor";

export const dynamic = "force-dynamic";

export default async function ProposalPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: proposal, error } = await supabase
    .from("proposals").select("*, deals(customer_name)").eq("id", params.id).single();
  if (error || !proposal) notFound();

  const [{ data: lines }, { data: products }, { data: suppliers }, { data: margins }, { data: pos }] = await Promise.all([
    supabase.from("proposal_lines").select("*").eq("proposal_id", params.id).order("sort"),
    supabase.from("products").select("*").eq("active", true).order("category").order("name"),
    supabase.from("suppliers").select("*").order("name"),
    supabase.from("margin_rules").select("*"),
    supabase.from("purchase_orders").select("*, po_lines(*)").eq("proposal_id", params.id),
  ]);

  return (
    <div>
      <Link href="/proposals" className="mb-4 inline-flex items-center gap-1 text-sm text-teal-700 hover:underline">&larr; Proposals</Link>
      <ProposalBuilder
        proposal={proposal as Proposal & { deals?: { customer_name?: string } }}
        initialLines={(lines ?? []) as ProposalLine[]}
        products={(products ?? []) as Product[]}
        suppliers={(suppliers ?? []) as Supplier[]}
        margins={(margins ?? []) as MarginRule[]}
        pos={(pos ?? []) as any[]}
      />
      <CustomerDocEditor proposalId={params.id} printHref={`/print/proposal/${params.id}`} />
    </div>
  );
}
