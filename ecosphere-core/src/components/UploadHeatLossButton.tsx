"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

// pdf.js is loaded from CDN at runtime (no build dependency).
const PDFJS = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
const PDFJS_WORKER = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

declare global { interface Window { pdfjsLib?: any } }

function loadScript(src: string) {
  return new Promise<void>((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const s = document.createElement("script");
    s.src = src; s.onload = () => resolve(); s.onerror = () => reject(new Error("Failed to load " + src));
    document.head.appendChild(s);
  });
}

// Extract text while reconstructing line + column layout from glyph positions,
// so the output resembles `pdftotext -layout` (which the parser is tuned on).
async function extractPdfText(file: File): Promise<string> {
  await loadScript(PDFJS);
  const pdfjs = window.pdfjsLib;
  pdfjs.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
  const buf = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: buf }).promise;
  const out: string[] = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    // Group items into lines by y, then order by x with gap-aware spacing.
    const rows = new Map<number, { x: number; w: number; s: string }[]>();
    for (const it of content.items as any[]) {
      const tr = it.transform; const y = Math.round(tr[5]); const x = tr[4];
      const key = Math.round(y / 2) * 2;
      if (!rows.has(key)) rows.set(key, []);
      rows.get(key)!.push({ x, w: it.width ?? 0, s: it.str });
    }
    const ys = [...rows.keys()].sort((a, b) => b - a); // top to bottom
    for (const y of ys) {
      const items = rows.get(y)!.sort((a, b) => a.x - b.x);
      let line = ""; let prevEnd: number | null = null;
      for (const it of items) {
        if (prevEnd != null) {
          const gap = it.x - prevEnd;
          line += gap > 12 ? "   " : gap > 2 ? " " : "";
        }
        line += it.s;
        prevEnd = it.x + it.w;
      }
      out.push(line);
    }
    out.push("");
  }
  return out.join("\n");
}

export default function UploadHeatLossButton({ dealId }: { dealId?: string | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<any>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setErr(null); setResult(null); setBusy("Reading the report…");
    try {
      const text = await extractPdfText(file);
      setBusy("Extracting the system design…");
      const res = await fetch("/api/design/ingest", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, filename: file.name, deal_id: dealId ?? null }),
      });
      const data = await res.json();
      if (!res.ok) { setErr(data.error ?? "Could not read the report"); setBusy(null); return; }
      setResult(data); setBusy(null);
    } catch (e: any) {
      setErr(e?.message ?? "Could not read the PDF"); setBusy(null);
    }
  }

  async function build() {
    if (!result?.design_input_id) return;
    setBusy("Building the proposal…"); setErr(null);
    try {
      const res = await fetch("/api/proposals/resolve", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ design_input_id: result.design_input_id, deal_id: dealId ?? null }),
      });
      const data = await res.json();
      if (!res.ok) { setErr(data.error ?? "Build failed"); setBusy(null); return; }
      router.push(`/proposals/${data.proposal_id}`);
    } catch (e: any) {
      setErr(e?.message ?? "Build failed"); setBusy(null);
    }
  }

  const p = result?.payload;
  const row = (label: string, value: any) => (
    <div className="flex justify-between gap-3 border-b border-gray-100 py-1.5 text-sm">
      <span className="text-gray-500">{label}</span>
      <span className="text-right font-medium text-gray-900">{value ?? <span className="text-amber-600">not found</span>}</span>
    </div>
  );

  return (
    <>
      <button onClick={() => setOpen(true)} className="rounded-lg border border-teal-700 px-4 py-2 text-sm font-semibold text-teal-700 hover:bg-teal-50">
        Upload heat loss report
      </button>
      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/40 p-4">
          <div className="my-8 w-full max-w-xl rounded-xl bg-white p-6 shadow-xl">
            <div className="mb-3 flex items-start justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Build from a heat loss report</h2>
                <p className="text-sm text-gray-500">Upload the Spruce PDF. We extract the designed system for you to check, then build a draft proposal.</p>
              </div>
              <button onClick={() => { setOpen(false); setResult(null); setErr(null); }} className="text-gray-400 hover:text-gray-700">✕</button>
            </div>

            {err && <p className="mb-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}

            {!result && (
              <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-300 px-6 py-10 text-center hover:border-teal-500">
                <span className="text-sm font-medium text-gray-700">{busy ?? "Choose a heat loss PDF"}</span>
                <span className="mt-1 text-xs text-gray-400">Spruce “Heat Loss Report & System Design”</span>
                <input type="file" accept="application/pdf" className="hidden" onChange={onFile} disabled={!!busy} />
              </label>
            )}

            {p && (
              <div className="space-y-3">
                <div className="rounded-lg bg-gray-50 p-3">
                  <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">Extracted system design</div>
                  {row("Property", p.property?.address ?? p.property?.customer_name ?? "—")}
                  {row("Total heat loss", p.heat_loss?.total_kw ? `${p.heat_loss.total_kw} kW` : null)}
                  {row("Floor area", p.heat_loss?.floor_area_m2 ? `${p.heat_loss.floor_area_m2} m²` : null)}
                  {row("Flow temp", p.conditions?.design_flow_temp_c ? `${p.conditions.design_flow_temp_c} °C` : null)}
                  {row("Heat pump", p.heat_pump?.label ?? p.heat_pump?.model_number)}
                  {row("Cylinder", p.cylinder?.label ?? (p.cylinder?.litres ? `${p.cylinder.litres} L` : null))}
                  {row("Radiators to fit", `${p.emitter_schedule?.length ?? 0}`)}
                </div>
                {result.warnings?.length > 0 && (
                  <div className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700">
                    {result.warnings.map((w: string, i: number) => <div key={i}>⚠ {w}</div>)}
                  </div>
                )}
                <p className="text-xs text-gray-400">You'll be able to adjust every line, choose exact SKUs and tweak labour on the next screen before anything is sent.</p>
                <div className="flex justify-end gap-2">
                  <button onClick={() => { setResult(null); setErr(null); }} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">Choose another</button>
                  <button onClick={build} disabled={!!busy} className="rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-60" style={{ backgroundColor: "#1B7A6E" }}>
                    {busy ?? "Build draft proposal →"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
