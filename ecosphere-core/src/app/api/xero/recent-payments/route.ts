import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStatus, xeroApi } from "@/lib/xero";

// Recent payments received, read live from Xero (Core->Xero outbound, so it
// works behind Standard Protection). Powers the dashboard "Recent payments"
// panel. Staff-only.
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const admin = createAdminClient();
  const status = await getStatus(admin);
  if (!status.connected) return NextResponse.json({ connected: false, payments: [] });

  try {
    const res = await xeroApi(admin, `/Payments?order=Date%20DESC`);
    if (!res.ok) return NextResponse.json({ connected: true, payments: [], error: `Xero returned ${res.status}` });
    const j = await res.json();
    const payments = ((j.Payments ?? []) as any[]).slice(0, 5).map((p) => ({
      amount: Number(p.Amount ?? 0),
      date: p.Date ?? null,
      invoice: p.Invoice?.InvoiceNumber ?? null,
    }));
    return NextResponse.json({ connected: true, payments });
  } catch (e: any) {
    return NextResponse.json({ connected: true, payments: [], error: e?.message ?? "Failed" });
  }
}
