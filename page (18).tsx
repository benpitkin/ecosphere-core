import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DEAL_WITH_TAGS_SELECT, mapDeal } from "@/lib/dealsQuery";
import type { Activity, BusVoucher, Stage, StageHistoryRow, Tag } from "@/lib/types";
import DealDetail from "@/components/DealDetail";

export const dynamic = "force-dynamic";

export default async function DealPage({ params }: { params: { id: string } }) {
  const supabase = createClient();

  const { data: dealRow, error } = await supabase
    .from("deals").select(DEAL_WITH_TAGS_SELECT).eq("id", params.id).single();
  if (error || !dealRow) notFound();
  const deal = mapDeal(dealRow);

  const [{ data: activities }, { data: history }, { data: allTags }, { data: stages }, { data: vouchers }, { data: dealProposals }] =
    await Promise.all([
      supabase.from("activities").select("*").eq("deal_id", params.id).order("created_at", { ascending: false }),
      supabase.from("stage_history").select("*").eq("deal_id", params.id).order("changed_at", { ascending: false }),
      supabase.from("tags").select("*").order("category"),
      deal.pipeline_id
        ? supabase.from("pipeline_stages").select("*").eq("pipeline_id", deal.pipeline_id).order("sort")
        : Promise.resolve({ data: [] as Stage[] }),
      supabase.from("bus_vouchers").select("*").eq("deal_id", params.id).order("created_at", { ascending: false }),
      supabase.from("proposals").select("id, title, status").eq("deal_id", params.id).order("created_at", { ascending: false }),
    ]);

  return (
    <div>
      <Link href="/pipeline" className="mb-4 inline-flex items-center gap-1 text-sm text-teal-700 hover:underline">
        &larr; Back to pipeline
      </Link>
      <DealDetail
        initialDeal={deal}
        initialActivities={(activities ?? []) as Activity[]}
        history={(history ?? []) as StageHistoryRow[]}
        allTags={(allTags ?? []) as Tag[]}
        stages={(stages ?? []) as Stage[]}
        initialVouchers={(vouchers ?? []) as BusVoucher[]}
        dealProposals={(dealProposals ?? []) as any[]}
      />
    </div>
  );
}
