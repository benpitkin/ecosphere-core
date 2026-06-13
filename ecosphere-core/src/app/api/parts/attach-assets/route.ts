import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Commits the assets chosen from /api/parts/find-assets onto a part.
//
// We DOWNLOAD the supplier's image/datasheet and re-host them in our own
// part-images bucket (same convention as manual uploads in PartDetail), so the
// part page never depends on City Plumbing's CDN staying reachable or allowing
// hotlinks. If a download is blocked we fall back to storing the source URL.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

async function rehost(
  admin: ReturnType<typeof createAdminClient>,
  sourceUrl: string,
  path: string,
  fallbackType: string
): Promise<string> {
  try {
    const res = await fetch(sourceUrl, {
      headers: { "User-Agent": UA, Referer: "https://www.cityplumbing.co.uk/" },
    });
    if (!res.ok) throw new Error(`fetch ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    const contentType = res.headers.get("content-type") || fallbackType;
    const { error } = await admin.storage
      .from("part-images")
      .upload(path, buf, { upsert: true, cacheControl: "3600", contentType });
    if (error) throw new Error(error.message);
    const { data } = admin.storage.from("part-images").getPublicUrl(path);
    return `${data.publicUrl}?v=${buf.length}`;
  } catch {
    // Download/upload blocked — fall back to the source URL so we still link it.
    return sourceUrl;
  }
}

export async function POST(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  let body: any;
  try { body = await request.json(); } catch { body = {}; }
  const { id, imageUrl, datasheetUrl } = body ?? {};
  if (!id || (!imageUrl && !datasheetUrl)) {
    return NextResponse.json({ error: "id and at least one asset URL are required" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: product } = await admin
    .from("products")
    .select("id, attrs")
    .eq("id", id)
    .maybeSingle();
  if (!product) return NextResponse.json({ error: "Product not found" }, { status: 404 });

  const attrs = { ...((product.attrs as any) ?? {}) };
  if (imageUrl) {
    const ext = (imageUrl.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
    attrs.image_url = await rehost(admin, imageUrl, `${id}.${ext}`, "image/jpeg");
  }
  if (datasheetUrl) {
    attrs.datasheet_url = await rehost(admin, datasheetUrl, `${id}-datasheet.pdf`, "application/pdf");
  }

  const { error } = await admin.from("products").update({ attrs }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, image_url: attrs.image_url ?? null, datasheet_url: attrs.datasheet_url ?? null });
}
