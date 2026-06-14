import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { gbp, PRODUCT_LABELS } from "@/lib/constants";
import type { ProductType } from "@/lib/types";
import { getStatus as getXeroStatus, getInvoiceByReference, jobInvoiceReference, xeroInvoiceUrl } from "@/lib/xero";
import RaiseInvoiceButton from "@/components/RaiseInvoiceButton";

export const dynamic = "force-dynamic";

const TEAL = "#1B7A6E";

// Payaca-style job page: a won deal viewed as a job — customer & site, the
// install schedule (from Dispatch), the quote, and the documents + install
// record (datasheets, archived commissioning + photos). Read-only v1 over
// existing data; no schema of its own.
type Stage = "to_schedule" | "scheduled" | "completed";
const STAGE_META: Record<Stage, { label: string; bg: string; fg: string }> = {
  to_schedule: { label: "To schedule", bg: "#F1F5F9", fg: "#475569" },
  scheduled: { label: "Scheduled", bg: "#FEF6E7", fg: "#B45309" },
  completed: { label: "Completed", bg: "#EAF4F1", fg: "#155F56" },
};
function deliveryStage(jobStatus: string | null, dispatchStatus: string | null): Stage {
  if (dispatchStatus === "completed" || jobStatus === "completed") return "completed";
  if (dispatchStatus === "scheduled" || jobStatus === "install_scheduled") return "scheduled";
  return "to_schedule";
}
function fmtDate(d: string | null | undefined): string | null {
  if (!d) return null;
  const t = new Date(d);
  return Number.isNaN(t.getTime()) ? null : t.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function Card({ title, children, accent }: { title: string; children: React.ReactNode; accent?: boolean }) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4">
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide" style={{ color: accent ? "#B45309" : TEAL }}>{title}</h2>
      {children}
    </section>
  );
}
function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3 py-1 text-sm">
      <span className="text-gray-500">{label}</span>
      <span className="text-right font-medium text-gray-800">{value}</span>
    </div>
  );
}

export default async function JobPage({ params }: { params: { id: string } }) {
  const supabase = createClient();

  const { data: deal } = await supabase.from("deals").select("*").eq("id", params.id).maybeSingle();
  if (!deal) notFound();
  const d = deal as any;

  const [{ data: djRow }, { data: proposals }, { data: activities }] = await Promise.all([
    d.ghl_opportunity_id
      ? supabase.from("dispatch_jobs").select("*").eq("ghl_opportunity_id", d.ghl_opportunity_id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from("proposals").select("id, title, status, created_at").eq("deal_id", params.id).order("created_at", { ascending: false }),
    supabase.from("activities").select("id, type, body, created_at").eq("deal_id", params.id).order("created_at", { ascending: false }).limit(8),
  ]);
  const dj = djRow as any;
  const props = (proposals ?? []) as any[];

  // Datasheets from the parts on this deal's proposals (de-duped).
  const datasheets: { label: string; url: string }[] = [];
  if (props.length) {
    const { data: lines } = await supabase
      .from("proposal_lines")
      .select("description, products(attrs)")
      .in("proposal_id", props.map((p) => p.id));
    const seen = new Set<string>();
    for (const l of (lines ?? []) as any[]) {
      const url = l.products?.attrs?.datasheet_url as string | undefined;
      if (url && !seen.has(url)) { seen.add(url); datasheets.push({ label: l.description, url }); }
    }
  }

  // Signed URLs for the archived site photos (private bucket).
  const photoUrls: string[] = [];
  if (Array.isArray(dj?.site_photos) && dj.site_photos.length) {
    const admin = createAdminClient();
    for (const p of dj.site_photos as any[]) {
      if (typeof p !== "string") continue;
      if (p.startsWith("http")) { photoUrls.push(p); continue; }
      const { data } = await admin.storage.from("job-photos").createSignedUrl(p, 3600);
      if (data?.signedUrl) photoUrls.push(data.signedUrl);
    }
  }

  // Xero invoice (push-only): look it up by the job's stable reference.
  const xero = await getXeroStatus(createAdminClient());
  let invoice: Awaited<ReturnType<typeof getInvoiceByReference>> = null;
  if (xero.connected) {
    try { invoice = await getInvoiceByReference(createAdminClient(), jobInvoiceReference(d.id)); } catch { invoice = null; }
  }

  const stage = deliveryStage(d.job_status ?? null, dj?.status ?? null);
  const pill = STAGE_META[stage];
  const commissioningCount = Array.isArray(dj?.commissioning) ? dj.commissioning.length : (dj?.commissioning ? 1 : 0);
  const ref = `#${String(d.id).slice(0, 8).toUpperCase()}`;

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <Link href="/jobs" className="inline-flex items-center gap-1 text-sm text-teal-700 hover:underline">&larr; Jobs</Link>

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-gray-200 bg-white p-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold text-gray-900">{d.customer_name}</h1>
            <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ backgroundColor: pill.bg, color: pill.fg }}>{pill.label}</span>
          </div>
          <p className="mt-0.5 text-sm text-gray-500">
            {PRODUCT_LABELS[d.product_interest as ProductType] ?? d.product_interest ?? "Job"} · {ref}
            {d.postcode ? ` · ${d.postcode}` : ""}
          </p>
        </div>
        <Link href={`/deals/${d.id}`} className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50">Open sales deal →</Link>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* Customer & site */}
        <Card title="Customer & site">
          <div className="divide-y divide-gray-50">
            {d.address && <Row label="Address" value={d.address} />}
            {d.postcode && <Row label="Postcode" value={d.postcode} />}
            {d.property_type && <Row label="Property" value={String(d.property_type).replace(/_/g, " ")} />}
            {d.phone && <Row label="Phone" value={d.phone} />}
            {d.email && <Row label="Email" value={d.email} />}
          </div>
        </Card>

        {/* Schedule / install (from Dispatch) */}
        <Card title="Install schedule" accent={stage === "scheduled"}>
          {dj ? (
            <div className="divide-y divide-gray-50">
              <Row label="Status" value={pill.label} />
              <Row label="Install date" value={fmtDate(dj.install_date) ?? "TBC"} />
              <Row label="Installer" value={dj.installer ?? "—"} />
              {dj.dispatch_job_id && <Row label="Dispatch job" value={dj.dispatch_job_id} />}
              {dj.completed_at && <Row label="Completed" value={fmtDate(dj.completed_at)} />}
            </div>
          ) : (
            <p className="text-sm text-gray-400">Not yet handed to Dispatch. Send the kit from the proposal to create the job.</p>
          )}
        </Card>

        {/* Quote */}
        <Card title="Quote">
          <div className="divide-y divide-gray-50">
            <Row label="Contract value" value={gbp(Number(d.value_gross || 0))} />
            {Number(d.value_bus_grant) > 0 && <Row label="BUS grant" value={`−${gbp(Number(d.value_bus_grant))}`} />}
            <Row label="Net" value={gbp(Number(d.value_net || 0))} />
          </div>
          <div className="mt-2 space-y-1">
            {props.length === 0 && <p className="text-sm text-gray-400">No proposal linked.</p>}
            {props.map((p) => (
              <Link key={p.id} href={`/proposals/${p.id}`} className="flex items-center justify-between gap-2 text-sm text-teal-700 hover:underline">
                <span className="truncate">{p.title}</span>
                <span className="shrink-0 text-[11px] text-gray-400">{p.status}</span>
              </Link>
            ))}
          </div>
        </Card>

        {/* Invoice (Xero, push-only) */}
        <Card title="Invoice">
          {invoice ? (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
                  style={invoice.status === "PAID" ? { backgroundColor: "#EAF4F1", color: "#155F56" } : invoice.status === "DRAFT" ? { backgroundColor: "#F1F5F9", color: "#475569" } : { backgroundColor: "#FEF6E7", color: "#B45309" }}>
                  {invoice.status}
                </span>
                <span className="text-sm font-medium text-gray-800">{gbp(invoice.total)}</span>
              </div>
              {invoice.number && <p className="text-xs text-gray-500">{invoice.number}</p>}
              <a href={xeroInvoiceUrl(invoice.id)} target="_blank" rel="noreferrer" className="text-sm text-teal-700 hover:underline">View in Xero &rarr;</a>
            </div>
          ) : !xero.connected ? (
            <p className="text-sm text-gray-400">Connect Xero in <Link href="/settings" className="text-teal-700 hover:underline">Settings</Link> to raise invoices.</p>
          ) : (
            <div>
              <p className="mb-2 text-sm text-gray-500">No invoice yet — raise a draft in Xero from the accepted quote.</p>
              <RaiseInvoiceButton jobId={d.id} />
            </div>
          )}
        </Card>

        {/* Documents & install record */}
        <Card title="Documents & install record">
          <p className="text-xs font-medium text-gray-500">Datasheets</p>
          {datasheets.length === 0 ? (
            <p className="text-sm text-gray-400">None attached to the quoted parts.</p>
          ) : (
            <ul className="mb-2 space-y-0.5">
              {datasheets.slice(0, 12).map((ds, i) => (
                <li key={i}><a href={ds.url} target="_blank" rel="noreferrer" className="text-sm text-teal-700 hover:underline">{ds.label} (PDF)</a></li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-xs font-medium text-gray-500">Install record (from Dispatch)</p>
          {stage === "completed" ? (
            <div className="text-sm text-gray-700">
              <p>{commissioningCount} commissioning record{commissioningCount === 1 ? "" : "s"}{dj?.archived_at ? ` · archived ${fmtDate(dj.archived_at)}` : ""}.</p>
              {photoUrls.length > 0 && (
                <div className="mt-2 grid grid-cols-3 gap-2">
                  {photoUrls.slice(0, 9).map((u, i) => (
                    <a key={i} href={u} target="_blank" rel="noreferrer" className="block">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={u} alt={`Site photo ${i + 1}`} className="h-20 w-full rounded-md border border-gray-100 object-cover" />
                    </a>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-gray-400">Available once Dispatch marks the job complete.</p>
          )}
        </Card>
      </div>

      {/* Activity */}
      <Card title="Recent activity">
        {(activities ?? []).length === 0 ? (
          <p className="text-sm text-gray-400">No activity logged.</p>
        ) : (
          <ul className="space-y-2">
            {(activities as any[]).map((a) => (
              <li key={a.id} className="flex gap-3 text-sm">
                <span className="mt-0.5 shrink-0 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium uppercase text-gray-500">{a.type}</span>
                <span className="text-gray-700">{a.body}</span>
                <span className="ml-auto shrink-0 text-[11px] text-gray-400">{fmtDate(a.created_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
