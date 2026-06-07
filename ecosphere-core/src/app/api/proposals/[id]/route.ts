import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// DELETE /api/proposals/:id — removes a proposal and its lines + purchase orders.
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const id = params.id;
  try {
    const { data: pos } = await supabase.from("purchase_orders").select("id").eq("proposal_id", id);
    const poIds = (pos ?? []).map((p: any) => p.id);
    if (poIds.length) await supabase.from("po_lines").delete().in("po_id", poIds);
    await supabase.from("purchase_orders").delete().eq("proposal_id", id);
    await supabase.from("proposal_lines").delete().eq("proposal_id", id);
    const { error } = await supabase.from("proposals").delete().eq("id", id);
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Delete failed" }, { status: 500 });
  }
}
