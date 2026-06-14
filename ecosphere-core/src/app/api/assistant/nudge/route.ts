import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// A single real, actionable nudge for the assistant pill — surfaces the most
// useful thing to do right now from live data (jobs to hand off, open tasks).
// Staff-only; cheap.
export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const admin = createAdminClient();

  // Won jobs not yet handed to Dispatch (no dispatch_jobs row / not scheduled).
  let toSchedule = 0;
  try {
    const { data: won } = await admin.from("deals").select("ghl_opportunity_id, job_status").eq("stage", "won");
    const wonList = (won ?? []) as any[];
    const oppIds = wonList.map((w) => w.ghl_opportunity_id).filter(Boolean);
    const djStatus = new Map<string, string>();
    if (oppIds.length) {
      const { data: djs } = await admin.from("dispatch_jobs").select("ghl_opportunity_id, status").in("ghl_opportunity_id", oppIds);
      for (const dj of (djs ?? []) as any[]) djStatus.set(dj.ghl_opportunity_id, dj.status);
    }
    for (const w of wonList) {
      const ds = w.ghl_opportunity_id ? djStatus.get(w.ghl_opportunity_id) : null;
      if (!(ds === "completed" || w.job_status === "completed" || ds === "scheduled" || w.job_status === "install_scheduled")) toSchedule++;
    }
  } catch { /* ignore */ }

  let openTasks = 0;
  try {
    const { count } = await admin.from("tasks").select("id", { count: "exact", head: true }).eq("done", false);
    openTasks = count ?? 0;
  } catch { /* table may not exist */ }

  let nudge: string;
  let prompt: string;
  if (toSchedule > 0) {
    nudge = `${toSchedule} won job${toSchedule === 1 ? "" : "s"} to hand to Dispatch`;
    prompt = "Which won jobs still need handing over to Dispatch?";
  } else if (openTasks > 0) {
    nudge = `${openTasks} open task${openTasks === 1 ? "" : "s"} on the board`;
    prompt = "What's on my task list?";
  } else {
    nudge = "Ask me to find a datasheet or look something up";
    prompt = "";
  }
  return NextResponse.json({ nudge, prompt });
}
