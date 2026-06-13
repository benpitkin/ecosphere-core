import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { findCityAssets } from "@/lib/cityPlumbing";

// Phase A part-asset finder (no AI / no API key). Looks a part up on City
// Plumbing by SKU and returns the official image + datasheet URLs with a
// title-match score, so the caller can confirm before attaching. Preview only —
// attaching is done by /api/parts/attach-assets. The lookup itself lives in
// @/lib/cityPlumbing so the AI assistant shares the exact same implementation.
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(request: Request) {
  // Authed as the logged-in user (middleware already gates /api/parts/*).
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  let body: any;
  try { body = await request.json(); } catch { body = {}; }
  const id = body?.id;
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const admin = createAdminClient();
  const { data: product } = await admin
    .from("products")
    .select("id, name, sku, manufacturer")
    .eq("id", id)
    .maybeSingle();
  if (!product) return NextResponse.json({ error: "Product not found" }, { status: 404 });

  const result = await findCityAssets({ sku: product.sku, name: product.name, manufacturer: product.manufacturer });
  return NextResponse.json(result);
}
