import { createClient } from "@/lib/supabase/server";
import type { Product, Supplier, MarginRule } from "@/lib/proposal";
import CatalogueManager from "@/components/CatalogueManager";

export const dynamic = "force-dynamic";

export default async function CataloguePage() {
  const supabase = createClient();
  const [{ data: products }, { data: suppliers }, { data: margins }] = await Promise.all([
    supabase.from("products").select("*").order("category").order("name"),
    supabase.from("suppliers").select("*").order("name"),
    supabase.from("margin_rules").select("*").order("category", { nullsFirst: true }),
  ]);

  return (
    <CatalogueManager
      initialProducts={(products ?? []) as Product[]}
      suppliers={(suppliers ?? []) as Supplier[]}
      initialMargins={(margins ?? []) as MarginRule[]}
    />
  );
}
