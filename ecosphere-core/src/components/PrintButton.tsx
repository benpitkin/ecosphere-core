"use client";
export default function PrintButton() {
  return (
    <button onClick={() => window.print()} className="rounded-lg px-4 py-2 text-sm font-semibold text-white" style={{ backgroundColor: "#1B7A6E" }}>
      Print / save as PDF
    </button>
  );
}
