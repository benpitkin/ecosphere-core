import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Product, Supplier, MarginRule } from "@/lib/proposal";
import PartDetail from "@/components/PartDetail";

export const dynamic = "force-dynamic";

export default async function PartPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const [{ data: product }, { data: suppliers }, { data: margins }, { data: lines }] = await Promise.all([
    supabase.from("products").select("*").eq("id", params.id).maybeSingle(),
    supabase.from("suppliers").select("*").order("name"),
    supabase.from("margin_rules").select("*"),
    supabase.from("proposal_lines").select("qty, proposals(id, title)").eq("product_id", params.id),
  ]);
  if (!product) notFound();

  const usedIn = (lines ?? [])
    .filter((l: any) => l.proposals)
    .map((l: any) => ({ proposal_id: l.proposals.id, title: l.proposals.title, qty: Number(l.qty) }));

  return (
    <PartDetail
      initialProduct={product as Product}
      suppliers={(suppliers ?? []) as Supplier[]}
      margins={(margins ?? []) as MarginRule[]}
      usedIn={usedIn}
    />
  );
}
