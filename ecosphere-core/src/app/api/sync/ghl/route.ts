import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ghlConfigured } from "@/lib/ghl";
import { runGhlSync } from "@/lib/ghlSync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!ghlConfigured()) {
    return NextResponse.json({ error: "GoHighLevel not configured. Set GHL_API_KEY and GHL_LOCATION_ID." }, { status: 400 });
  }
  try {
    const r = await runGhlSync(supabase);
    return NextResponse.json(r);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Sync failed" }, { status: 500 });
  }
}
