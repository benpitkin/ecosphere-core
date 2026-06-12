"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Tech = { key: string; label: string; grant: number; doc: "heatloss" | "solar" | null; docLabel?: string };
const TECHS: Tech[] = [
  { key: "ashp", label: "Air source heat pump", grant: 7500, doc: "heatloss", docLabel: "Heat loss report (Spruce PDF)" },
  { key: "solar_pv", label: "Solar PV", grant: 0, doc: "solar", docLabel: "Solar design (OpenSolar PDF)" },
  { key: "battery", label: "Battery storage", grant: 0, doc: null },
  { key: "heating_upgrade", label: "Heating upgrade", grant: 0, doc: null },
  { key: "service", label: "Service / other", grant: 0, doc: null },
];

const PDFJS = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
const PDFJS_WORKER = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
declare global { interface Window { pdfjsLib?: any } }
function loadScript(src: string) {
  return new Promise<void>((res, rej) => {
    if (document.querySelector(`script[src="${src}"]`)) return res();
    const s = document.createElement("script"); s.src = src; s.onload = () => res(); s.onerror = () => rej(new Error("load " + src)); document.head.appendChild(s);
  });
}
async function extractPdfText(file: File): Promise<string> {
  await loadScript(PDFJS);
  const pdfjs = window.pdfjsLib; pdfjs.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
  const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const out: string[] = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p); const content = await page.getTextContent();
    const rows = new Map<number, { x: number; w: number; s: string }[]>();
    for (const it of content.items as any[]) { const y = Math.round(it.transform[5] / 2) * 2; if (!rows.has(y)) rows.set(y, []); rows.get(y)!.push({ x: it.transform[4], w: it.width ?? 0, s: it.str }); }
    for (const y of [...rows.keys()].sort((a, b) => b - a)) {
      const items = rows.get(y)!.sort((a, b) => a.x - b.x); let line = ""; let prev: number | null = null;
      for (const it of items) { if (prev != null) { const gap = it.x - prev; line += gap > 12 ? "   " : gap > 2 ? " " : ""; } line += it.s; prev = it.x + it.w; }
      out.push(line);
    }
    out.push("");
  }
  return out.join("\n");
}

export default function NewProposalButton() {
  const router = useRouter();
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const [deals, setDeals] = useState<{ id: string; customer_name: string }[]>([]);
  const [who, setWho] = useState("");
  const [sel, setSel] = useState<Set<string>>(new Set(["ashp"]));
  const [files, setFiles] = useState<Record<string, File>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open || deals.length) return;
    supabase.from("deals").select("id, customer_name").order("customer_name").then(({ data }) => setDeals((data ?? []).filter((d: any) => d.customer_name) as any));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetch deals once when the dialog opens; guarded by deals.length, supabase client is stable
  }, [open]);

  function toggle(k: string) { setSel((s) => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n; }); }

  async function create() {
    if (!who.trim()) { setErr("Who's it for? Pick a deal or type a name."); return; }
    if (sel.size === 0) { setErr("Pick at least one technology."); return; }
    setErr(null);
    const chosen = TECHS.filter((t) => sel.has(t.key));
    const match = deals.find((d) => d.customer_name.toLowerCase() === who.trim().toLowerCase());
    const grant = sel.has("ashp") ? 7500 : 0;
    const title = `${who.trim()} — ${chosen.map((t) => t.label).join(" + ")}`;
    try {
      const design_input_ids: string[] = [];
      const inlinePayloads: any[] = [];
      for (const t of chosen) {
        const file = files[t.key];
        if (t.doc && file) {
          setBusy(`Reading the ${t.label} document…`);
          const text = await extractPdfText(file);
          const res = await fetch("/api/design/ingest", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text, filename: file.name, deal_id: match?.id ?? null, kind: t.doc }),
          });
          const data = await res.json();
          if (!res.ok) { setErr(`${t.label}: ${data.error ?? "couldn't read the document"}`); setBusy(null); return; }
          design_input_ids.push(data.design_input_id);
        } else if (t.key === "ashp") {
          inlinePayloads.push({ ashp: true });
        }
      }
      setBusy("Building the proposal…");
      let proposalId: string;
      if (design_input_ids.length || inlinePayloads.length) {
        const res = await fetch("/api/proposals/build", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ deal_id: match?.id ?? null, title, bus_grant: grant, design_input_ids, payloads: inlinePayloads }),
        });
        const data = await res.json();
        if (!res.ok) { setErr(data.error ?? "Build failed"); setBusy(null); return; }
        proposalId = data.proposal_id;
      } else {
        const res = await fetch("/api/proposals/resolve", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ deal_id: match?.id ?? null, source: "manual", payload: {}, title, bus_grant: grant }),
        });
        const data = await res.json();
        if (!res.ok) { setErr(data.error ?? "Create failed"); setBusy(null); return; }
        proposalId = data.proposal_id;
      }
      router.push(`/proposals/${proposalId}`);
    } catch (e: any) { setErr(e?.message ?? "Failed"); setBusy(null); }
  }

  const field = "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-teal-600 focus:outline-none";

  return (
    <>
      <button onClick={() => setOpen(true)} className="rounded-lg px-4 py-2 text-sm font-semibold text-white" style={{ backgroundColor: "#1B7A6E" }}>
        + New proposal
      </button>
      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/40 p-4">
          <div className="my-8 w-full max-w-lg rounded-xl bg-white p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-gray-900">New proposal</h2>
            <p className="mb-4 text-sm text-gray-500">Pick the technologies, drop in any design docs, and we&apos;ll build one combined draft.</p>
            {err && <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}

            <label className="mb-1 block text-xs font-medium text-gray-600">Who&apos;s it for?</label>
            <input list="deal-list" value={who} onChange={(e) => setWho(e.target.value)} placeholder="Pick a customer or type a name" className={field} />
            <datalist id="deal-list">{deals.map((d) => <option key={d.id} value={d.customer_name} />)}</datalist>

            <label className="mb-1 mt-4 block text-xs font-medium text-gray-600">Technologies</label>
            <div className="space-y-2">
              {TECHS.map((t) => (
                <div key={t.key} className="rounded-lg border border-gray-200 p-2">
                  <label className="flex items-center gap-2 text-sm font-medium text-gray-800">
                    <input type="checkbox" checked={sel.has(t.key)} onChange={() => toggle(t.key)} className="h-4 w-4 accent-teal-700" />
                    {t.label}{t.grant > 0 && <span className="rounded bg-green-100 px-1.5 text-[10px] font-semibold text-green-700">£{t.grant} grant</span>}
                  </label>
                  {sel.has(t.key) && t.doc && (
                    <div className="mt-2 pl-6">
                      <label className="flex cursor-pointer items-center gap-2 text-xs text-teal-700">
                        <span className="rounded border border-teal-600 px-2 py-1 hover:bg-teal-50">{files[t.key] ? "✓ " + files[t.key].name.slice(0, 30) : `Upload ${t.docLabel}`}</span>
                        <input type="file" accept="application/pdf" className="hidden" onChange={(e) => { const fl = e.target.files?.[0]; if (fl) setFiles((f) => ({ ...f, [t.key]: fl })); }} />
                      </label>
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => { setOpen(false); setErr(null); }} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">Cancel</button>
              <button onClick={create} disabled={!!busy} className="rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-60" style={{ backgroundColor: "#1B7A6E" }}>
                {busy ?? "Build draft proposal"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
