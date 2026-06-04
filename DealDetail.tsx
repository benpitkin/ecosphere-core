import { createClient } from "@/lib/supabase/server";
import { fetchBoardData, type BoardData } from "@/lib/dealsQuery";
import Board from "@/components/Board";

export const dynamic = "force-dynamic";

export default async function PipelinePage() {
  const supabase = createClient();
  let data: BoardData = { pipelines: [], stages: [], deals: [] };
  let error: string | null = null;
  try {
    data = await fetchBoardData(supabase);
  } catch (e: any) {
    error = e?.message ?? "Failed to load the pipeline";
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        Couldn&rsquo;t load the pipeline: {error}. Check your Supabase env vars and that migrations 0001&ndash;0003 + seed have run.
      </div>
    );
  }

  return <Board pipelines={data.pipelines} stages={data.stages} initialDeals={data.deals} />;
}
