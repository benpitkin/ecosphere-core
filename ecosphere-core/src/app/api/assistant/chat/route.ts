import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { findCityAssets } from "@/lib/cityPlumbing";
import { attachPartAssets } from "@/lib/partAssets";

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
- You can take actions. attach_part_assets attaches an image and/or datasheet to a part — use it whenever the user asks you to attach/upload/add a datasheet or image. It is safe and reversible, so just do it and then confirm what you attached. The URL can be one you found via find_part_assets or via web_search (a manufacturer datasheet PDF, etc.).
- update_part edits a part's fields. Changing price (cost_price), category, SKU, or active status is a meaningful change: do NOT call update_part for those until you have said exactly what you will change and the user has confirmed. Smaller fixes (a clearly-wrong name or model code) can be done more readily, but still say what you changed.
- To attach assets to MANY parts at once (e.g. "every part missing a datasheet"), do NOT loop here — tell the user to use the "Fill all missing" button on the Catalogue page, which is built for that and shows progress. You handle one part or a small handful.
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
  {
    name: "attach_part_assets",
    description: "Attach an image and/or datasheet to a catalogue part. Downloads the file from the given URL(s) and stores it on the part. Use when the user asks you to attach/upload/add a datasheet or image to a part.",
    input_schema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Product UUID to attach to (required)" },
        imageUrl: { type: "string", description: "URL of a product image to attach" },
        datasheetUrl: { type: "string", description: "URL of a datasheet PDF to attach" },
      },
      required: ["id"],
    },
  },
  {
    name: "update_part",
    description: "Edit fields on a catalogue part. For price/category/SKU/active changes, only call this AFTER the user has confirmed the specific change.",
    input_schema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Product UUID (required)" },
        name: { type: "string" },
        manufacturer: { type: "string" },
        category: { type: "string", description: "e.g. heat_pump, cylinder, radiator, valve, fitting, pipe, electrical, consumable, control, battery, labour, other" },
        sku: { type: "string" },
        unit: { type: "string" },
        cost_price: { type: "number" },
        vat_rate: { type: "number" },
        active: { type: "boolean" },
        model_code: { type: "string", description: "Manufacturer model/part code (stored in attrs.mfr_code)" },
      },
      required: ["id"],
    },
  },
];

async function runTool(name: string, input: any, admin: ReturnType<typeof createAdminClient>): Promise<string> {
  try {
    if (name === "search_catalogue") {
      const q = String(input?.query ?? "").trim().replace(/[,()*]/g, " ").trim();
      if (!q) return JSON.stringify({ count: 0, results: [] });
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

    if (name === "attach_part_assets") {
      const result = await attachPartAssets(admin, String(input?.id ?? ""), {
        imageUrl: input?.imageUrl, datasheetUrl: input?.datasheetUrl,
      });
      return JSON.stringify(result);
    }

    if (name === "update_part") {
      const id = String(input?.id ?? "");
      if (!id) return "id is required";
      const patch: any = {};
      for (const f of ["name", "manufacturer", "category", "sku", "unit"] as const) {
        if (typeof input?.[f] === "string") patch[f] = input[f].trim() || null;
      }
      if (typeof input?.cost_price === "number") patch.cost_price = input.cost_price;
      if (typeof input?.vat_rate === "number") patch.vat_rate = input.vat_rate;
      if (typeof input?.active === "boolean") patch.active = input.active;
      if (typeof input?.model_code === "string") {
        const { data: cur } = await admin.from("products").select("attrs").eq("id", id).maybeSingle();
        patch.attrs = { ...((cur?.attrs as any) ?? {}), mfr_code: input.model_code.trim() || undefined };
      }
      if (Object.keys(patch).length === 0) return "No recognised fields to update.";
      const { error } = await admin.from("products").update(patch).eq("id", id);
      if (error) return `Error: ${error.message}`;
      return JSON.stringify({ ok: true, updated: Object.keys(patch) });
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

  // If the user is on a part page, tell the assistant which part — so "this
  // part" / "this one" resolves without them naming it.
  let system = SYSTEM;
  const ctxId = body?.context?.partId;
  if (typeof ctxId === "string" && ctxId) {
    const { data: cp } = await admin.from("products").select("id, name, sku, manufacturer").eq("id", ctxId).maybeSingle();
    if (cp) {
      system += `\n\nCURRENT CONTEXT: The user is viewing the part "${cp.name}"${cp.manufacturer ? ` (${cp.manufacturer})` : ""}${cp.sku ? `, SKU ${cp.sku}` : ""}, product id ${cp.id}. If they say "this part" or "this one", they mean this part — use this id for find_part_assets / attach_part_assets / get_part.`;
    }
  }

  // Leave headroom under the 60s function cap so we return a useful message
  // rather than letting Vercel hard-kill the request mid-tool-loop.
  const deadline = Date.now() + 50_000;

  try {
    for (let round = 0; round < 8; round++) {
      if (Date.now() > deadline) {
        return NextResponse.json({
          text: "That one's taking longer than I'd like, so I stopped before timing out. Try again a bit more specifically — e.g. give the exact make and model, or the part's SKU.",
        });
      }
      const resp = await client.messages.create({
        model: "claude-opus-4-8",
        max_tokens: 8000,
        thinking: { type: "adaptive" },
        system,
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
    const status = e?.status && Number.isInteger(e.status) ? e.status : 500;
    const friendly =
      status === 401 ? "The AI key was rejected — check ANTHROPIC_API_KEY in the Core Vercel project."
      : status === 429 ? "The AI is rate-limited right now — give it a few seconds and try again."
      : status === 529 ? "The AI service is briefly overloaded — try again in a moment."
      : (e?.message ?? "Assistant request failed");
    return NextResponse.json({ error: friendly }, { status });
  }
}
