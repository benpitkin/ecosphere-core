"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

type Item = { href: string; label: string; soon?: boolean };
type Group = { heading: string; items: Item[] };

const GROUPS: Group[] = [
  {
    heading: "Workflow",
    items: [
      { href: "/dashboard", label: "Dashboard" },
      { href: "/search", label: "Search" },
      { href: "/pipeline", label: "Pipeline" },
      { href: "/jobs", label: "Jobs" },
      { href: "/contacts", label: "Contacts" },
      { href: "/calendar", label: "Calendar", soon: true },
      { href: "/map", label: "Map", soon: true },
    ],
  },
  {
    heading: "Sales",
    items: [
      { href: "/proposals", label: "Proposals" },
      { href: "/catalogue", label: "Catalogue" },
    ],
  },
  {
    heading: "Intelligence",
    items: [
      { href: "/chat", label: "AI Chat", soon: true },
      { href: "/activity", label: "Activity" },
    ],
  },
  {
    heading: "Setup",
    items: [
      { href: "/integrations", label: "Integrations", soon: true },
      { href: "/settings", label: "Settings" },
    ],
  },
];

export default function Sidebar({ email }: { email: string | null }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const link = (it: Item) => {
    const active = pathname === it.href || pathname.startsWith(it.href + "/");
    if (it.soon) {
      return (
        <div key={it.href} className="flex cursor-default items-center justify-between rounded-md px-3 py-2 text-sm text-gray-400" title="Coming soon">
          {it.label}
          <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-400">soon</span>
        </div>
      );
    }
    return (
      <Link key={it.href} href={it.href} onClick={() => setOpen(false)}
        className={`block rounded-md px-3 py-2 text-sm font-medium transition ${active ? "bg-teal-50" : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"}`}
        style={active ? { color: "#155F56" } : undefined}>
        {it.label}
      </Link>
    );
  };

  const nav = (
    <nav className="flex h-full flex-col">
      <div className="flex items-center gap-2 px-5 py-4">
        <span className="grid h-8 w-8 place-items-center rounded-lg text-base font-bold text-white" style={{ backgroundColor: "#1B7A6E" }}>E</span>
        <div className="leading-tight">
          <p className="text-sm font-semibold text-gray-900">EcoSphere Core</p>
          <p className="text-[11px] text-gray-500">EcoSphere Energy Ltd</p>
        </div>
      </div>
      <div className="flex-1 space-y-5 overflow-y-auto px-3 py-2">
        {GROUPS.map((g) => (
          <div key={g.heading}>
            <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400">{g.heading}</p>
            <div className="space-y-0.5">{g.items.map(link)}</div>
          </div>
        ))}
      </div>
      <div className="border-t border-gray-100 px-4 py-3">
        <div className="mb-2 flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-full bg-gray-100 text-xs font-semibold text-gray-600">{(email?.[0] ?? "U").toUpperCase()}</span>
          <div className="min-w-0 leading-tight">
            <p className="truncate text-xs font-medium text-gray-800">{email ?? "Signed in"}</p>
            <p className="text-[11px] text-gray-400">Owner</p>
          </div>
        </div>
        <form action="/auth/signout" method="post">
          <button className="w-full rounded-md border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50">Sign out</button>
        </form>
      </div>
    </nav>
  );

  return (
    <>
      <div className="flex items-center justify-between border-b border-gray-200 bg-white px-4 py-3 lg:hidden">
        <div className="flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-lg text-sm font-bold text-white" style={{ backgroundColor: "#1B7A6E" }}>E</span>
          <span className="text-sm font-semibold text-gray-900">EcoSphere Core</span>
        </div>
        <button onClick={() => setOpen((o) => !o)} className="rounded-md p-2 hover:bg-gray-100" aria-label="Menu">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
        </button>
      </div>
      <aside className="hidden w-60 shrink-0 border-r border-gray-200 bg-white lg:block">{nav}</aside>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/30" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-0 h-full w-64 bg-white shadow-xl">{nav}</div>
        </div>
      )}
    </>
  );
}
