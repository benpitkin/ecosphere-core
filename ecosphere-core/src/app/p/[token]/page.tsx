import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createAdminClient } from "@/lib/supabase/admin";
import { mcsFromPayload } from "@/lib/proposalMcs";
import ProposalDocument, { type DocLineRow } from "@/components/ProposalDocument";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false, follow: false } };

// Public, view-only, watermarked customer proposal reached by share token.
// No login. The room-by-room heat-loss detail is gated behind a postcode check.
export default async function CustomerProposal({ params }: { params: { token: string } }) {
  const supabase = createAdminClient();
  const { data: proposal, error } = await supabase
    .from("proposals")
    .select("*, deals(customer_name, address, postcode, email)")
    .eq("share_token", params.token)
    .single();
  if (error || !proposal) notFound();

  const { data: lines } = await supabase
    .from("proposal_lines").select("*, products(attrs)").eq("proposal_id", (proposal as any).id).order("sort");

  let payload: any = null;
  if ((proposal as any).design_input_id) {
    const { data: di } = await supabase.from("design_inputs").select("payload").eq("id", (proposal as any).design_input_id).single();
    payload = di?.payload ?? null;
  }

  return (
    <ProposalDocument
      proposal={proposal}
      lines={(lines ?? []) as DocLineRow[]}
      mcs={mcsFromPayload(payload)}
      customer={true}
      shareToken={params.token}
    />
  );
}
