import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Phase A part-asset finder (no AI / no API key).
//
// Our supplier invoices are City Plumbing, and every City Plumbing product page
// is reachable directly by SKU at https://www.cityplumbing.co.uk/p/<sku> and
// carries the official product image (..._IMG_00.jpeg) and technical datasheet
// (..._TECH_00.pdf) on dam.cityplumbing.co.uk. This route fetches that page,
// extracts the asset URLs, and scores how well the page title matches the part
// name so the caller can confirm it's the right product before attaching.
//
// It does NOT write anything — it's a preview. Attaching is done by
// /api/parts/attach-assets once the user (or the bulk filler) accepts.
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

// Tokenise to lowercase alphanumeric words, dropping noise/units.
const STOP = new Set([
  "the", "and", "for", "with", "mm", "white", "type", "x", "by", "kw", "btu",
]);
function tokens(s: string): string[] {
  return (s.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter(
    (t) => t.length >= 3 && !STOP.has(t)
  );
}

// Fraction of the part's significant tokens that appear in the page title.
function matchScore(partName: string, manufacturer: string | null, title: string): number {
  const want = tokens(`${manufacturer ?? ""} ${partName}`);
  if (want.length === 0) return 0;
  const have = new Set(tokens(title));
  const hits = want.filter((t) => have.has(t)).length;
  return Math.round((hits / want.length) * 100) / 100;
}

function firstMatch(html: string, re: RegExp): string | null {
  const m = html.match(re);
  if (!m) return null;
  let url = m[0];
  if (url.startsWith("//")) url = "https:" + url;
  return url;
}

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
  if (!product.sku) {
    return NextResponse.json({ found: false, reason: "Part has no SKU to look up." });
  }

  const sku = String(product.sku).trim();
  const productUrl = `https://www.cityplumbing.co.uk/p/${encodeURIComponent(sku)}`;

  let html: string;
  try {
    const res = await fetch(productUrl, {
      headers: { "User-Agent": UA, Accept: "text/html" },
      redirect: "follow",
    });
    if (!res.ok) {
      return NextResponse.json({ found: false, reason: `Supplier page returned ${res.status}.`, productUrl });
    }
    html = await res.text();
  } catch (e: any) {
    return NextResponse.json({ found: false, reason: e?.message ?? "Could not reach supplier.", productUrl });
  }

  // Next.js embeds asset URLs inside escaped-JSON blobs (\/\/dam...), so
  // normalise escaped slashes before matching.
  const flat = html.replace(/\\\//g, "/");

  const imageUrl = firstMatch(flat, /(?:https?:)?\/\/dam\.cityplumbing\.co\.uk\/[^\s"'\\)]+_IMG_00\.(?:jpe?g|png|webp)/i);
  const datasheetUrl = firstMatch(flat, /(?:https?:)?\/\/dam\.cityplumbing\.co\.uk\/[^\s"'\\)]+_TECH_00\.pdf/i);

  if (!imageUrl && !datasheetUrl) {
    return NextResponse.json({ found: false, reason: "No matching product found at that SKU.", productUrl });
  }

  const titleMatch =
    flat.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i) ||
    flat.match(/<title[^>]*>([^<]+)<\/title>/i);
  const title = (titleMatch?.[1] ?? "").replace(/\s*\|\s*City Plumbing.*$/i, "").trim();
  const score = matchScore(product.name, product.manufacturer ?? null, title);

  return NextResponse.json({
    found: true,
    productUrl,
    title,
    score,
    imageUrl: imageUrl ? imageUrl.replace(/\?.*$/, "") : null,
    datasheetUrl,
  });
}
