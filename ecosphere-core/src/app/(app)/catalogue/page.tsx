import { createClient } from "@/lib/supabase/server";
import type { Product, Supplier, MarginRule, KitTemplate, KitTemplateItem } from "@/lib/proposal";
import CatalogueManager from "@/components/CatalogueManager";
import BulkAssetFiller from "@/components/BulkAssetFiller";

export const dynamic = "force-dynamic";

export default async function CataloguePage() {
  const supabase = createClient();
  const [{ data: products }, { data: suppliers }, { data: margins }, { data: kits }, { data: kitItems }] = await Promise.all([
    supabase.from("products").select("*").order("category").order("name"),
    supabase.from("suppliers").select("*").order("name"),
    supabase.from("margin_rules").select("*").order("category", { nullsFirst: true }),
    supabase.from("kit_templates").select("*").order("name"),
    supabase.from("kit_template_items").select("*, products(*)"),
  ]);

  return (
    <>
      <BulkAssetFiller products={(products ?? []) as Product[]} />
      <CatalogueManager
        initialProducts={(products ?? []) as Product[]}
        suppliers={(suppliers ?? []) as Supplier[]}
        initialMargins={(margins ?? []) as MarginRule[]}
        initialKits={(kits ?? []) as KitTemplate[]}
        initialKitItems={(kitItems ?? []) as KitTemplateItem[]}
      />
    </>
  );
}
