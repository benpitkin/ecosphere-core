import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// POST (multipart, field "file") — store the original MCS heat-loss PDF in the
// private bucket and record its path on the proposal. DELETE — remove it.
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const form = await request.formData().catch(() => null);
  const file = form?.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file" }, { status: 400 });
  if (file.type && file.type !== "application/pdf") return NextResponse.json({ error: "PDF only" }, { status: 400 });

  const admin = createAdminClient();
  const path = `${params.id}/heat-loss-report.pdf`;
  const buf = await file.arrayBuffer();
  const { error: upErr } = await admin.storage.from("heatloss-reports").upload(path, buf, {
    contentType: "application/pdf", upsert: true,
  });
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  const { error } = await admin.from("proposals").update({ heatloss_report_path: path }).eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, path });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const admin = createAdminClient();
  await admin.storage.from("heatloss-reports").remove([`${params.id}/heat-loss-report.pdf`]);
  await admin.from("proposals").update({ heatloss_report_path: null }).eq("id", params.id);
  return NextResponse.json({ ok: true });
}
