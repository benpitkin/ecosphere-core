import type { SupabaseClient } from "@supabase/supabase-js";
import type { Deal, Pipeline, Stage, Tag } from "./types";

// Shared select that pulls a deal plus its tags (via the deal_tags join table).
export const DEAL_WITH_TAGS_SELECT =
  "*, deal_tags ( tags ( id, name, category, color ) )";

// Normalise the nested join result into Deal.tags: Tag[].
export function mapDeal(row: any): Deal {
  const tags: Tag[] = (row.deal_tags ?? []).map((dt: any) => dt.tags).filter(Boolean);
  const { deal_tags, ...rest } = row;
  return { ...(rest as Deal), tags };
}

export async function fetchDeals(supabase: SupabaseClient): Promise<Deal[]> {
  const { data, error } = await supabase
    .from("deals")
    .select(DEAL_WITH_TAGS_SELECT)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map(mapDeal);
}

export interface BoardData {
  pipelines: Pipeline[];
  stages: Stage[];
  deals: Deal[];
}

// Everything the Kanban board needs: saved views, their stages, and all deals.
export async function fetchBoardData(supabase: SupabaseClient): Promise<BoardData> {
  const [pl, st, dl] = await Promise.all([
    supabase.from("pipelines").select("*").order("sort"),
    supabase.from("pipeline_stages").select("*").order("sort"),
    supabase.from("deals").select(DEAL_WITH_TAGS_SELECT).order("created_at", { ascending: true }),
  ]);
  if (pl.error) throw pl.error;
  if (st.error) throw st.error;
  if (dl.error) throw dl.error;
  return {
    pipelines: (pl.data ?? []) as Pipeline[],
    stages: (st.data ?? []) as Stage[],
    deals: (dl.data ?? []).map(mapDeal),
  };
}
