"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Product } from "@/lib/proposal";
import { createClient } from "@/lib/supabase/client";

// "Fill all missing" — walks every active part with a SKU that hasn't been
// looked up on City Plumbing yet, one at a time, attaching the image + datasheet.
//
// Sequential + a delay between parts on purpose: City rate-limits bursts (HTTP
// 500). We only auto-attach when the SKU resolves to a product whose title
// actually overlaps the part name (score gate), so a stray SKU collision can't
// silently attach a wrong image — those are counted as "skipped".
//
// A part leaves the worklist once it has an image (City matched it) OR once it's
// been marked attrs.assets_checked after a definitive no-datasheet/no-match
// outcome — so re-runs don't keep re-fetching parts City has nothing for
// (e.g. non-City SKUs). Transient fetch errors are NOT marked, so they retry.
const SCORE_GATE = 0.4;
const THROTTLE_MS = 350;

export default function BulkAssetFiller({ products }: { products: Product[] }) {
  const router = useRouter();
  const supabase = createClient();
  const [running, setRunning] = useState(false);
  const [finished, setFinished] = useState(false);
  const [done, setDone] = useState(0);
  const [attached, setAttached] = useState(0);
  const [skipped, setSkipped] = useState(0);
  const [noMatch, setNoMatch] = useState(0);
  const stop = useRef(false);

  const worklist = products.filter((p) => {
    const a = (p.attrs as any) ?? {};
    return p.active && p.sku && p.sku.trim() && !a.image_url && !a.assets_checked;
  });
  const total = worklist.length;
  if (total === 0) return null;

  async function run() {
    setRunning(true); setFinished(false); stop.current = false;
    setDone(0); setAttached(0); setSkipped(0); setNoMatch(0);
    let a = 0, sk = 0, nm = 0;
    for (let i = 0; i < worklist.length; i++) {
      if (stop.current) break;
      const p = worklist[i];
      let markChecked = false;
      try {
        const fr = await fetch("/api/parts/find-assets", {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: p.id }),
        });
        const f = await fr.json();
        if (f.found && f.imageUrl && (f.score ?? 0) >= SCORE_GATE) {
          await fetch("/api/parts/attach-assets", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: p.id, imageUrl: f.imageUrl, datasheetUrl: f.datasheetUrl }),
          });
          setAttached(++a); // image_url now set → drops out of the worklist
        } else if (f.found && f.imageUrl) {
          setSkipped(++sk); markChecked = true;
        } else {
          setNoMatch(++nm); markChecked = true;
        }
      } catch {
        setNoMatch(++nm); // transient — leave unchecked so it retries next run
      }
      // Remember definitively-handled-but-not-attached parts so re-runs skip them.
      if (markChecked) {
        try {
          await supabase.from("products").update({ attrs: { ...((p.attrs as any) ?? {}), assets_checked: true } }).eq("id", p.id);
        } catch { /* non-fatal: worst case it's re-checked next run */ }
      }
      setDone(i + 1);
      await new Promise((r) => setTimeout(r, THROTTLE_MS));
    }
    setRunning(false); setFinished(true);
    router.refresh(); // reload so newly attached images show in the list
  }

  const pct = total ? Math.round((done / total) * 100) : 0;

  return (
    <div className="mb-4 rounded-xl border border-teal-200 bg-teal-50/40 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-gray-800">Auto-find images &amp; datasheets</p>
          <p className="text-xs text-gray-500">
            {total} part{total === 1 ? "" : "s"} haven&apos;t been looked up on City Plumbing yet — stores the image + datasheet for each one it finds, and remembers the rest so it won&apos;t re-check them. Keep this tab open while it runs.
          </p>
        </div>
        {running ? (
          <button onClick={() => { stop.current = true; }}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
            Stop
          </button>
        ) : (
          <button onClick={run}
            className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700">
            {finished ? "Run again" : `Find for ${total} parts`}
          </button>
        )}
      </div>
      {(running || finished) && (
        <div className="mt-3">
          <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200">
            <div className="h-full bg-teal-600 transition-all" style={{ width: `${pct}%` }} />
          </div>
          <p className="mt-2 text-xs text-gray-600">
            {done}/{total} checked · <span className="font-medium text-teal-700">{attached} attached</span> · {skipped} found but unsure (skipped) · {noMatch} no City match
            {finished && !running && " · finished"}
          </p>
        </div>
      )}
    </div>
  );
}
