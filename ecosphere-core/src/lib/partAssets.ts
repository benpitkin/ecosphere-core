import type { createAdminClient } from "@/lib/supabase/admin";

// Attach an image and/or datasheet to a part: download the source file and
// re-host it in our own part-images bucket (so the part page never depends on a
// supplier CDN staying reachable or allowing hotlinks), then write the public
// URL into the product's attrs. If a download is blocked we fall back to storing
// the source URL so the link still works. Shared by /api/parts/attach-assets and
// the AI assistant's attach tool.

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

type Admin = ReturnType<typeof createAdminClient>;

async function rehost(admin: Admin, sourceUrl: string, path: string, fallbackType: string): Promise<string> {
  try {
    const res = await fetch(sourceUrl, { headers: { "User-Agent": UA, Referer: "https://www.cityplumbing.co.uk/" } });
    if (!res.ok) throw new Error(`fetch ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    const contentType = res.headers.get("content-type") || fallbackType;
    const { error } = await admin.storage.from("part-images").upload(path, buf, { upsert: true, cacheControl: "3600", contentType });
    if (error) throw new Error(error.message);
    const { data } = admin.storage.from("part-images").getPublicUrl(path);
    return `${data.publicUrl}?v=${buf.length}`;
  } catch {
    return sourceUrl; // download/upload blocked — keep the source URL so it still links
  }
}

export type AttachResult =
  | { ok: true; image_url: string | null; datasheet_url: string | null }
  | { ok: false; error: string };

export async function attachPartAssets(
  admin: Admin,
  id: string,
  assets: { imageUrl?: string | null; datasheetUrl?: string | null }
): Promise<AttachResult> {
  if (!id || (!assets.imageUrl && !assets.datasheetUrl)) {
    return { ok: false, error: "id and at least one asset URL are required" };
  }
  const { data: product } = await admin.from("products").select("id, attrs").eq("id", id).maybeSingle();
  if (!product) return { ok: false, error: "Product not found" };

  const attrs = { ...((product.attrs as any) ?? {}) };
  if (assets.imageUrl) {
    const ext = (assets.imageUrl.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
    attrs.image_url = await rehost(admin, assets.imageUrl, `${id}.${ext}`, "image/jpeg");
  }
  if (assets.datasheetUrl) {
    attrs.datasheet_url = await rehost(admin, assets.datasheetUrl, `${id}-datasheet.pdf`, "application/pdf");
  }

  const { error } = await admin.from("products").update({ attrs }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  return { ok: true, image_url: attrs.image_url ?? null, datasheet_url: attrs.datasheet_url ?? null };
}
