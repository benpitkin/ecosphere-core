import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ghlConfigured } from "@/lib/ghl";
import { runGhlSync } from "@/lib/ghlSync";

// Scheduled GoHighLevel -> hub sync (see vercel.json `crons`). Runs without a
// logged-in user, so it authenticates via CRON_SECRET and uses the service-role
// client. Vercel automatically sends `Authorization: Bearer <CRON_SECRET>` on
// cron invocations when the CRON_SECRET env var is set.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  // If no secret is configured, refuse rather than run the job unauthenticated.
  if (!secret) return false;
  const header = req.headers.get("authorization");
  return header === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!ghlConfigured()) {
    return NextResponse.json(
      { error: "GoHighLevel not configured. Set GHL_API_KEY and GHL_LOCATION_ID." },
      { status: 400 }
    );
  }
  try {
    const supabase = createAdminClient();
    const r = await runGhlSync(supabase);
    return NextResponse.json({ ...r, via: "cron" });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Sync failed" }, { status: 500 });
  }
}
