import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// POST /api/proposals/generate-pos  Body: { proposal_id }
// Rebuilds purchase orders for a proposal: one supplier PO per supplier (kit),
// plus one subcontractor PO for labour lines. Snapshots cost onto po_lines.
export async function POST(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { proposal_id } = await request.json().catch(() => ({}));
  if (!proposal_id) return NextResponse.json({ error: "proposal_id required" }, { status: 400 });

  try {
    const { data: lines, error } = await supabase
      .from("proposal_lines")
      .select("*, products(supplier_id, category)")
      .eq("proposal_id", proposal_id);
    if (error) throw new Error(error.message);

    // Clear existing POs (cascades to po_lines).
    await supabase.from("purchase_orders").delete().eq("proposal_id", proposal_id);

    // Group: subcontractor (labour) vs supplier (everything else), keyed by supplier_id.
    const groups = new Map<string, { type: "supplier" | "subcontractor"; supplier_id: string | null; lines: any[] }>();
    for (const l of lines ?? []) {
      const isLabour = (l.category ?? l.products?.category) === "labour";
      const supplierId = l.products?.supplier_id ?? null;
      const key = `${isLabour ? "sub" : "sup"}:${supplierId ?? "none"}`;
      if (!groups.has(key)) groups.set(key, { type: isLabour ? "subcontractor" : "supplier", supplier_id: supplierId, lines: [] });
      groups.get(key)!.lines.push(l);
    }

    let poCount = 0;
    for (const g of groups.values()) {
      const { data: po, error: poErr } = await supabase.from("purchase_orders")
        .insert({ proposal_id, supplier_id: g.supplier_id, type: g.type, status: "draft" })
        .select("id").single();
      if (poErr) throw new Error(`po: ${poErr.message}`);
      const poLines = g.lines.map((l) => ({
        po_id: po.id, product_id: l.product_id, description: l.description,
        qty: l.qty, unit_cost: l.unit_cost,
      }));
      if (poLines.length) {
        const { error: plErr } = await supabase.from("po_lines").insert(poLines);
        if (plErr) throw new Error(`po_lines: ${plErr.message}`);
      }
      poCount++;
    }

    return NextResponse.json({ ok: true, purchase_orders: poCount });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "PO generation failed" }, { status: 500 });
  }
}
