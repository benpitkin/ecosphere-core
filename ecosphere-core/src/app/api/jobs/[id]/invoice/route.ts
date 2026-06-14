import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sellPrice } from "@/lib/pricing";
import {
  getStatus, findOrCreateContact, defaultSalesAccountCode,
  createDraftInvoice, getInvoiceByReference, jobInvoiceReference,
} from "@/lib/xero";

// Raise a DRAFT invoice in Xero from a won job's accepted quote (push-only:
// Xero owns the invoice; Core triggers it). Schema-free — the invoice is tagged
// with a Reference derived from the deal id, which we also use to avoid creating
// a duplicate and to read status back. Staff-only (under /api/jobs/*, gated).
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const admin = createAdminClient();
  const status = await getStatus(admin);
  if (!status.connected) return NextResponse.json({ error: "Xero isn't connected — connect it in Settings first." }, { status: 400 });

  const { data: deal } = await admin.from("deals").select("id, customer_name, email").eq("id", params.id).maybeSingle();
  if (!deal) return NextResponse.json({ error: "Job not found." }, { status: 404 });

  const reference = jobInvoiceReference(deal.id);

  try {
    // Don't create a second invoice for the same job.
    const existing = await getInvoiceByReference(admin, reference);
    if (existing) return NextResponse.json({ ok: true, invoice: existing, existed: true });

    // Invoice from the latest proposal's lines (customer sell prices).
    const { data: prop } = await admin
      .from("proposals").select("id").eq("deal_id", deal.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (!prop) return NextResponse.json({ error: "No proposal to invoice from." }, { status: 400 });

    const { data: lines } = await admin
      .from("proposal_lines").select("description, qty, unit_cost, markup_pct").eq("proposal_id", prop.id).order("sort");
    const lineItems = ((lines ?? []) as any[])
      .filter((l) => l.description && Number(l.qty) > 0)
      .map((l) => ({
        description: String(l.description),
        qty: Number(l.qty),
        unitAmount: sellPrice(Number(l.unit_cost || 0), Number(l.markup_pct || 0)),
      }));
    if (lineItems.length === 0) return NextResponse.json({ error: "The proposal has no line items to invoice." }, { status: 400 });

    const contactId = await findOrCreateContact(admin, { name: deal.customer_name || "Customer", email: deal.email });
    const accountCode = await defaultSalesAccountCode(admin);
    const invoice = await createDraftInvoice(admin, { contactId, reference, lineItems, accountCode });
    return NextResponse.json({ ok: true, invoice });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Failed to raise the invoice." }, { status: 502 });
  }
}
