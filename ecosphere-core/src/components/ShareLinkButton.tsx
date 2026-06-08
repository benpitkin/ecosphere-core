"use client";

import { useState } from "react";

// Copies the gated customer proposal link to the clipboard. The link is the
// view-only, watermarked /p/[token] page — safe to send to a customer.
export default function ShareLinkButton({ token }: { token: string }) {
  const [done, setDone] = useState(false);
  async function copy() {
    const url = `${window.location.origin}/p/${token}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Fallback for older browsers / insecure contexts
      const t = document.createElement("textarea");
      t.value = url; document.body.appendChild(t); t.select(); document.execCommand("copy"); document.body.removeChild(t);
    }
    setDone(true);
    setTimeout(() => setDone(false), 2000);
  }
  return (
    <button onClick={copy} className="rounded-lg border px-3 py-2 text-sm font-medium" style={{ borderColor: "#1B7A6E", color: "#1B7A6E" }}>
      {done ? "✓ Customer link copied" : "Copy customer link"}
    </button>
  );
}
