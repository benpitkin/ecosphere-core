"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

type Msg = { role: "user" | "assistant" | "error"; content: string };

// Turn markdown links [text](url) and bare URLs into clickable anchors,
// preserving the rest of the text (rendered in a whitespace-pre-wrap container).
function renderContent(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const re = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s)]+)/g;
  let last = 0, i = 0, m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    const label = m[1] ?? m[3];
    const url = m[2] ?? m[3];
    nodes.push(
      <a key={i++} href={url} target="_blank" rel="noreferrer" className="text-teal-700 underline break-all">{label}</a>
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

const EXAMPLES = [
  "Find the datasheet for a Daikin EDLA08EV3",
  "What's the SCOP of the Vaillant aroTHERM plus 7kW?",
  "Find a product image for SKU 223799",
];

export default function Assistant() {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  // When on a part page (/catalogue/<uuid>), hand the part to the assistant so
  // "this part" resolves without the user naming it.
  const partId = pathname?.match(/\/catalogue\/([0-9a-f-]{36})/i)?.[1];

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [msgs, busy, open]);

  async function send(text: string) {
    const q = text.trim();
    if (!q || busy) return;
    const next: Msg[] = [...msgs, { role: "user", content: q }];
    setMsgs(next);
    setInput("");
    setBusy(true);
    try {
      const res = await fetch("/api/assistant/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: next.filter((m) => m.role !== "error").map((m) => ({ role: m.role, content: m.content })),
          context: partId ? { partId } : undefined,
        }),
      });
      const j = await res.json();
      if (j.error) setMsgs((m) => [...m, { role: "error", content: j.error }]);
      else setMsgs((m) => [...m, { role: "assistant", content: j.text }]);
    } catch (e: any) {
      setMsgs((m) => [...m, { role: "error", content: e?.message ?? "Request failed" }]);
    }
    setBusy(false);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Open assistant"
        className="fixed bottom-5 right-5 z-40 grid h-12 w-12 place-items-center rounded-full text-white shadow-lg transition hover:opacity-90"
        style={{ backgroundColor: "#1B7A6E" }}
      >
        {open ? "✕" : "✨"}
      </button>

      {open && (
        <div className="fixed bottom-20 right-5 z-40 flex h-[72vh] w-[min(92vw,400px)] flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl">
          <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-gray-900">Core Assistant</p>
              <p className="text-[11px] text-gray-400">Searches the web · reads your catalogue</p>
            </div>
            {msgs.length > 0 && (
              <button onClick={() => setMsgs([])} className="text-[11px] text-gray-400 hover:text-gray-600">Clear</button>
            )}
          </div>

          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
            {msgs.length === 0 && (
              <div className="space-y-3 pt-2 text-sm text-gray-500">
                <p>Ask me to find a datasheet, image, or spec for a part — I&apos;ll search the web and your catalogue.</p>
                <div className="space-y-1.5">
                  {EXAMPLES.map((e) => (
                    <button key={e} onClick={() => send(e)}
                      className="block w-full rounded-lg border border-gray-200 px-3 py-2 text-left text-xs text-gray-600 hover:border-teal-300 hover:bg-teal-50/40">
                      {e}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {msgs.map((m, i) => (
              <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
                <div
                  className={
                    m.role === "user"
                      ? "max-w-[85%] rounded-2xl rounded-br-sm bg-teal-600 px-3 py-2 text-sm text-white"
                      : m.role === "error"
                      ? "max-w-[85%] rounded-2xl rounded-bl-sm border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
                      : "max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-bl-sm bg-gray-100 px-3 py-2 text-sm text-gray-800"
                  }
                >
                  {m.role === "assistant" ? renderContent(m.content) : m.content}
                </div>
              </div>
            ))}
            {busy && (
              <div className="flex justify-start">
                <div className="rounded-2xl rounded-bl-sm bg-gray-100 px-3 py-2 text-sm text-gray-400">Thinking…</div>
              </div>
            )}
          </div>

          <div className="border-t border-gray-100 p-2">
            <div className="flex items-end gap-2">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); } }}
                rows={1}
                placeholder="Ask the assistant…"
                className="max-h-28 flex-1 resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-teal-600 focus:outline-none focus:ring-1 focus:ring-teal-600"
              />
              <button
                type="button"
                onClick={() => send(input)}
                disabled={busy || !input.trim()}
                className="rounded-lg bg-teal-600 px-3 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-40"
              >
                Send
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
