import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { attachPartAssets } from "@/lib/partAssets";

// Commits the assets chosen from /api/parts/find-assets onto a part. The actual
// download + re-host + write lives in @/lib/partAssets so the AI assistant
// shares the exact same implementation.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  let body: any;
  try { body = await request.json(); } catch { body = {}; }
  const { id, imageUrl, datasheetUrl } = body ?? {};

  const result = await attachPartAssets(createAdminClient(), id, { imageUrl, datasheetUrl });
  if (!result.ok) {
    const status = result.error === "Product not found" ? 404 : 400;
    return NextResponse.json({ error: result.error }, { status });
  }
  return NextResponse.json(result);
}
