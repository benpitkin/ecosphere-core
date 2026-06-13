// Shared City Plumbing product lookup, used by both the per-part "Find online"
// button (/api/parts/find-assets, the bulk filler) and the AI assistant.
//
// Every City Plumbing product page is reachable directly by SKU at
// https://www.cityplumbing.co.uk/p/<sku> and carries the official product image
// (..._IMG_00.jpeg) and technical datasheet (..._TECH_00.pdf) on
// dam.cityplumbing.co.uk. We fetch that page, extract the asset URLs, and score
// how well the page title matches the part name so the caller can judge whether
// it's the right product before attaching. No write — this is a preview.

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

// Tokenise to lowercase alphanumeric words, dropping noise/units.
const STOP = new Set(["the", "and", "for", "with", "mm", "white", "type", "x", "by", "kw", "btu"]);
function tokens(s: string): string[] {
  return (s.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter((t) => t.length >= 3 && !STOP.has(t));
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

export type CityCandidate = {
  found: boolean;
  reason?: string;
  productUrl?: string;
  title?: string;
  score?: number;
  imageUrl?: string | null;
  datasheetUrl?: string | null;
};

export async function findCityAssets(opts: {
  sku: string | null | undefined;
  name: string;
  manufacturer?: string | null;
}): Promise<CityCandidate> {
  if (!opts.sku) return { found: false, reason: "Part has no SKU to look up." };

  const sku = String(opts.sku).trim();
  const productUrl = `https://www.cityplumbing.co.uk/p/${encodeURIComponent(sku)}`;

  let html: string;
  try {
    const res = await fetch(productUrl, { headers: { "User-Agent": UA, Accept: "text/html" }, redirect: "follow" });
    if (!res.ok) return { found: false, reason: `Supplier page returned ${res.status}.`, productUrl };
    html = await res.text();
  } catch (e: any) {
    return { found: false, reason: e?.message ?? "Could not reach supplier.", productUrl };
  }

  // Next.js embeds asset URLs inside escaped-JSON blobs (\/\/dam...), so
  // normalise escaped slashes before matching.
  const flat = html.replace(/\\\//g, "/");

  const imageUrl = firstMatch(flat, /(?:https?:)?\/\/dam\.cityplumbing\.co\.uk\/[^\s"'\\)]+_IMG_00\.(?:jpe?g|png|webp)/i);
  const datasheetUrl = firstMatch(flat, /(?:https?:)?\/\/dam\.cityplumbing\.co\.uk\/[^\s"'\\)]+_TECH_00\.pdf/i);

  if (!imageUrl && !datasheetUrl) {
    return { found: false, reason: "No matching product found at that SKU.", productUrl };
  }

  const titleMatch =
    flat.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i) ||
    flat.match(/<title[^>]*>([^<]+)<\/title>/i);
  const title = (titleMatch?.[1] ?? "").replace(/\s*\|\s*City Plumbing.*$/i, "").trim();
  const score = matchScore(opts.name, opts.manufacturer ?? null, title);

  return {
    found: true,
    productUrl,
    title,
    score,
    imageUrl: imageUrl ? imageUrl.replace(/\?.*$/, "") : null,
    datasheetUrl,
  };
}
