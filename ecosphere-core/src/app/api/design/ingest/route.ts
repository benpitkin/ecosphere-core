import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { parseHeatLoss } from "@/lib/heatloss/parse";

export const dynamic = "force-dynamic";

// POST /api/design/ingest
// Body: { text: string, filename?: string, deal_id?: string }
// The PDF text is extracted client-side (pdf.js) and posted here. We parse it
// into a structured design payload, store it as a design_input, and return the
// payload for the operator to verify before building a proposal.
export async function POST(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { text, filename = null, deal_id = null } = await request.json().catch(() => ({}));
  if (!text || typeof text !== "string" || text.length < 50) {
    return NextResponse.json({ error: "No readable text in the report. Is it a scanned (image-only) PDF?" }, { status: 400 });
  }

  try {
    const payload = parseHeatLoss(text);
    (payload as any)._filename = filename;

    const { data, error } = await supabase.from("design_inputs")
      .insert({ deal_id, source: "spruce_heatloss", payload }).select("id").single();
    if (error) throw new Error(error.message);

    return NextResponse.json({
      ok: true,
      design_input_id: data.id,
      payload,
      warnings: payload._warnings ?? [],
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Ingest failed" }, { status: 500 });
  }
}
