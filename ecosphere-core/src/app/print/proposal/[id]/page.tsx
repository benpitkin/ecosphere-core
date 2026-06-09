import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { mcsFromPayload } from "@/lib/proposalMcs";
import ProposalDocument, { type DocLineRow } from "@/components/ProposalDocument";

export const dynamic = "force-dynamic";

export default async function PrintProposal({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: proposal, error } = await supabase
    .from("proposals")
    .select("*, deals(customer_name, address, postcode, email)")
    .eq("id", params.id)
    .single();
  if (error || !proposal) notFound();

  const { data: lines } = await supabase
    .from("proposal_lines").select("*, products(attrs)").eq("proposal_id", params.id).order("sort");

  let payload: any = null;
  if ((proposal as any).design_input_id) {
    const { data: di } = await supabase.from("design_inputs").select("payload").eq("id", (proposal as any).design_input_id).single();
    payload = di?.payload ?? null;
  }

  let reportUrl: string | null = null;
  if ((proposal as any).heatloss_report_path) {
    const { data: signed } = await createAdminClient().storage
      .from("heatloss-reports").createSignedUrl((proposal as any).heatloss_report_path, 3600);
    reportUrl = signed?.signedUrl ?? null;
  }

  return (
    <ProposalDocument
      proposal={proposal}
      lines={(lines ?? []) as DocLineRow[]}
      mcs={mcsFromPayload(payload)}
      customer={false}
      shareToken={(proposal as any).share_token ?? null}
      reportUrl={reportUrl}
    />
  );
}
