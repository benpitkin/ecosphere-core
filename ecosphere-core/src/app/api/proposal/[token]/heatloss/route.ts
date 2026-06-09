import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { mcsFromPayload } from "@/lib/proposalMcs";

export const dynamic = "force-dynamic";

const normPc = (s: any) => String(s ?? "").toUpperCase().replace(/\s+/g, "");

// POST /api/proposal/[token]/heatloss  { postcode }
// Public, no auth: returns the room-by-room emitter design ONLY when the supplied
// postcode matches the proposal's property. Keeps the detailed design off the
// public page until the customer proves it's theirs.
export async function POST(request: Request, { params }: { params: { token: string } }) {
  const supabase = createAdminClient();
  const body = await request.json().catch(() => ({}));
  const supplied = normPc(body?.postcode);
  if (!supplied) return NextResponse.json({ error: "Postcode required" }, { status: 400 });

  const { data: proposal, error } = await supabase
    .from("proposals")
    .select("id, design_input_id, heatloss_report_path, deals(postcode)")
    .eq("share_token", params.token)
    .single();
  if (error || !proposal) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const onFile = normPc((proposal as any).deals?.postcode);
  if (!onFile || onFile !== supplied) {
    return NextResponse.json({ error: "That postcode doesn't match this proposal." }, { status: 403 });
  }

  let payload: any = null;
  if ((proposal as any).design_input_id) {
    const { data: di } = await supabase.from("design_inputs").select("payload").eq("id", (proposal as any).design_input_id).single();
    payload = di?.payload ?? null;
  }
  const mcs = mcsFromPayload(payload);

  // Signed, time-limited link to the original MCS report (private bucket).
  let reportUrl: string | null = null;
  const path = (proposal as any).heatloss_report_path;
  if (path) {
    const { data: signed } = await supabase.storage.from("heatloss-reports").createSignedUrl(path, 3600);
    reportUrl = signed?.signedUrl ?? null;
  }
  return NextResponse.json({ emitters: mcs.emitters, count: mcs.emitters.length, reportUrl });
}
