import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ghlConfigured } from "@/lib/ghl";
import { runGhlSync } from "@/lib/ghlSync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// POST /api/webhooks/ghl?key=SECRET
// Point a GoHighLevel workflow webhook here (e.g. on "Opportunity created").
// Verifies a shared secret, then runs the idempotent GHL -> hub sync using a
// service-role client (no user session). Safe to fire repeatedly.
function authorised(request: Request) {
  const url = new URL(request.url);
  const key = url.searchParams.get("key") || request.headers.get("x-webhook-secret");
  return Boolean(process.env.WEBHOOK_SECRET) && key === process.env.WEBHOOK_SECRET;
}

export async function POST(request: Request) {
  if (!authorised(request)) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  if (!ghlConfigured()) return NextResponse.json({ error: "GoHighLevel not configured" }, { status: 400 });
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY not set" }, { status: 500 });
  try {
    const admin = createAdminClient();
    const r = await runGhlSync(admin);
    return NextResponse.json(r);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Sync failed" }, { status: 500 });
  }
}

// GHL may send a GET to verify the endpoint.
export async function GET(request: Request) {
  if (!authorised(request)) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  return NextResponse.json({ ok: true, ready: true });
}
