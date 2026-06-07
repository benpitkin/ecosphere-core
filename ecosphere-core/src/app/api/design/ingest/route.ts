import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { parseHeatLoss } from "@/lib/heatloss/parse";
import { parseSolar } from "@/lib/solar/parse";

export const dynamic = "force-dynamic";

// Decide which parser to use from the extracted text (or an explicit hint).
function detectKind(text: string, hint?: string): "solar" | "heatloss" {
  if (hint === "solar" || hint === "solar_pv") return "solar";
  if (hint === "heatloss" || hint === "ashp") return "heatloss";
  const s = text.slice(0, 8000);
  const solarScore = (s.match(/kWp|Inverter Power|Solar Energy System|Your Solution|self-?sufficiency|OpenSolar|PV system/gi) || []).length;
  const heatScore = (s.match(/Heat Loss Report|BS ?EN ?12831|Proposed emitter|design heat loss|flow temp|SCOP/gi) || []).length;
  return solarScore > heatScore ? "solar" : "heatloss";
}

// POST /api/design/ingest
// Body: { text, filename?, deal_id?, kind? }  (kind optional: "solar" | "heatloss")
export async function POST(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { text, filename = null, deal_id = null, kind } = await request.json().catch(() => ({}));
  if (!text || typeof text !== "string" || text.length < 50) {
    return NextResponse.json({ error: "No readable text in the document. Is it a scanned (image-only) PDF?" }, { status: 400 });
  }

  try {
    const k = detectKind(text, kind);
    const payload: any = k === "solar" ? parseSolar(text) : parseHeatLoss(text);
    payload._filename = filename;

    const { data, error } = await supabase.from("design_inputs")
      .insert({ deal_id, source: payload.source, payload }).select("id").single();
    if (error) throw new Error(error.message);

    return NextResponse.json({
      ok: true, design_input_id: data.id, kind: k, payload,
      warnings: payload._warnings ?? [],
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Ingest failed" }, { status: 500 });
  }
}
