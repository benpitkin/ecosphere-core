import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { findCityAssets } from "@/lib/cityPlumbing";

// Core AI assistant — Stage 1 (read + web + part-finder).
//
// A slide-out chat that can search the web (Anthropic's built-in web_search /
// web_fetch server tools — no separate search API), read the live catalogue,
// and look a part up on City Plumbing for its datasheet/image. It does NOT write
// to the database yet; edit/attach/draft actions land in Stage 2 behind an
// explicit confirm. Authenticated as the logged-in user; the model + heavy work
// run server-side via the Anthropic API (key: ANTHROPIC_API_KEY).
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SYSTEM = `You are the EcoSphere Core assistant, embedded in the internal sales/CRM and proposal tool used by the staff of EcoSphere Energy — a UK MCS-certified installer of air-source heat pumps, solar PV, and batteries.

Your job is to help staff with the parts catalogue and answer questions: find manufacturer datasheets, specs and product images for parts; explain product details; and look things up in their catalogue and on the web.

Tools:
- web_search / web_fetch: search the internet and read pages. Use these to find a manufacturer's official datasheet PDF, technical specs, or a product image for a specific make/model. Prefer the manufacturer's own site or a reputable UK merchant. Always give the exact URL you found.
- search_catalogue: find parts in their own catalogue by name or SKU.
- get_part: read full details of one catalogue part (by id or SKU), including whether it already has an image/datasheet attached.
- find_part_assets: look a catalogue part up on City Plumbing (their main supplier) by its SKU and return the official image + datasheet URLs. Try this FIRST for a catalogue part that has a SKU — it is exact and fast. Fall back to web_search for parts that aren't City Plumbing lines.

Guidance:
- When a question depends on a real datasheet, current spec, or a specific model, search rather than answering from memory.
- Be concrete and concise. When you find a datasheet or image, give the direct URL and say how confident you are it's the exact model.
- You can read the catalogue but you cannot change it yet — if asked to attach a file, edit a part, or build a proposal, explain that and point the user to the part page (Catalogue → open the part → Datasheet box) where they can attach what you found. Action-taking is coming soon.
- You are talking to trusted internal staff, not customers.`;

const tools: any[] = [
  { type: "web_search_20260209", name: "web_search" },
  { type: "web_fetch_20260209", name: "web_fetch" },
  {
    name: "search_catalogue",
    description: "Search the EcoSphere parts catalogue by name or SKU. Returns matching active products.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Text to match against part name or SKU" },
        category: { type: "string", description: "Optional category filter (e.g. heat_pump, cylinder, radiator, valve, consumable, electrical)" },
        limit: { type: "integer", description: "Max rows (default 10, max 25)" },
      },
      required: ["query"],
    },
  },
  {
    name: "get_part",
    description: "Get full details of one catalogue part, by product id or SKU, including whether it already has an image/datasheet.",
    input_schema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Product UUID" },
        sku: { type: "string", description: "Product SKU" },
      },
    },
  },
  {
    name: "find_part_assets",
    description: "Look a catalogue part up on City Plumbing by its SKU and return the official product image + datasheet URLs with a title-match confidence score. Pass the product id (preferred) or a SKU + name.",
    input_schema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Product UUID (preferred)" },
        sku: { type: "string", description: "SKU, if no id" },
        name: { type: "string", description: "Part name, used for match scoring when only a SKU is given" },
      },
    },
  },
];

async function runTool(name: string, input: any, admin: ReturnType<typeof createAdminClient>): Promise<string> {
  try {
    if (name === "search_catalogue") {
      const q = String(input?.query ?? "").trim();
      const limit = Math.min(25, Math.max(1, Number(input?.limit) || 10));
      let query = admin
        .from("products")
        .select("id, name, sku, manufacturer, category, cost_price, attrs")
        .eq("active", true)
        .or(`name.ilike.%${q}%,sku.ilike.%${q}%`)
        .limit(limit);
      if (input?.category) query = query.eq("category", input.category);
      const { data, error } = await query;
      if (error) return `Error: ${error.message}`;
      const rows = (data ?? []).map((p: any) => ({
        id: p.id, name: p.name, sku: p.sku, manufacturer: p.manufacturer, category: p.category,
        cost_price: p.cost_price,
        has_image: Boolean(p.attrs?.image_url), has_datasheet: Boolean(p.attrs?.datasheet_url),
      }));
      return JSON.stringify({ count: rows.length, results: rows });
    }

    if (name === "get_part") {
      let query = admin.from("products").select("id, name, sku, manufacturer, category, unit, cost_price, vat_rate, active, attrs");
      query = input?.id ? query.eq("id", input.id) : query.eq("sku", String(input?.sku ?? ""));
      const { data: p } = await query.maybeSingle();
      if (!p) return "No matching part found.";
      const attrs = (p.attrs ?? {}) as any;
      return JSON.stringify({
        id: p.id, name: p.name, sku: p.sku, manufacturer: p.manufacturer, category: p.category,
        unit: p.unit, cost_price: p.cost_price, vat_rate: p.vat_rate, active: p.active,
        model_code: attrs.mfr_code ?? null,
        image_url: attrs.image_url ?? null, datasheet_url: attrs.datasheet_url ?? null,
      });
    }

    if (name === "find_part_assets") {
      let sku = input?.sku as string | undefined;
      let pname = input?.name as string | undefined;
      let manufacturer: string | null | undefined;
      if (input?.id) {
        const { data: p } = await admin.from("products").select("name, sku, manufacturer").eq("id", input.id).maybeSingle();
        if (!p) return "No matching part found.";
        sku = p.sku ?? sku; pname = p.name ?? pname; manufacturer = p.manufacturer;
      }
      const result = await findCityAssets({ sku, name: pname ?? "", manufacturer });
      return JSON.stringify(result);
    }

    return `Unknown tool: ${name}`;
  } catch (e: any) {
    return `Tool error: ${e?.message ?? "failed"}`;
  }
}

export async function POST(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "Assistant not configured: ANTHROPIC_API_KEY is not set." }, { status: 503 });
  }

  let body: any;
  try { body = await request.json(); } catch { body = {}; }
  const history = Array.isArray(body?.messages) ? body.messages : [];
  // Accept a plain {role, content: string}[] history from the client.
  const messages: any[] = history
    .filter((m: any) => (m?.role === "user" || m?.role === "assistant") && typeof m?.content === "string")
    .map((m: any) => ({ role: m.role, content: m.content }));
  if (messages.length === 0 || messages[messages.length - 1].role !== "user") {
    return NextResponse.json({ error: "Last message must be from the user." }, { status: 400 });
  }

  const client = new Anthropic();
  const admin = createAdminClient();

  try {
    for (let round = 0; round < 6; round++) {
      const resp = await client.messages.create({
        model: "claude-opus-4-8",
        max_tokens: 8000,
        thinking: { type: "adaptive" },
        system: SYSTEM,
        tools,
        messages,
      });

      if (resp.stop_reason === "tool_use") {
        const toolUses = resp.content.filter((b: any) => b.type === "tool_use");
        messages.push({ role: "assistant", content: resp.content });
        const results = [];
        for (const tu of toolUses as any[]) {
          const out = await runTool(tu.name, tu.input, admin);
          results.push({ type: "tool_result", tool_use_id: tu.id, content: out });
        }
        messages.push({ role: "user", content: results });
        continue;
      }
      if (resp.stop_reason === "pause_turn") {
        // Server-side tool (web search) hit its loop limit — re-send to resume.
        messages.push({ role: "assistant", content: resp.content });
        continue;
      }

      const text = resp.content.filter((b: any) => b.type === "text").map((b: any) => b.text).join("\n").trim();
      return NextResponse.json({ text: text || "(no response)" });
    }
    return NextResponse.json({ text: "I wasn't able to finish that — try narrowing the request." });
  } catch (e: any) {
    const msg = e?.message ?? "Assistant request failed";
    const status = e?.status && Number.isInteger(e.status) ? e.status : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
