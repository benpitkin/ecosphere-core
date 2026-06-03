"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const LINKS = [
  { href: "/pipeline", label: "Pipeline" },
  { href: "/dashboard", label: "Dashboard" },
];

export default function NavBar({ email }: { email: string | null }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const linkClass = (href: string) => {
    const active = pathname === href || pathname.startsWith(href + "/");
    return `block rounded-md px-3 py-2 text-sm font-medium transition ${
      active ? "bg-white/20 text-white" : "text-teal-50 hover:bg-white/10 hover:text-white"
    }`;
  };

  return (
    <header className="bg-teal-600 text-white shadow-sm" style={{ backgroundColor: "#1B7A6E" }}>
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          <Link href="/pipeline" className="flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-full bg-white/15 text-base font-bold">E</span>
            <span className="text-lg font-semibold tracking-tight">EcoSphere CRM</span>
          </Link>
          <nav className="ml-6 hidden gap-1 sm:flex">
            {LINKS.map((l) => (
              <Link key={l.href} href={l.href} className={linkClass(l.href)}>
                {l.label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="hidden items-center gap-3 sm:flex">
          {email && <span className="text-xs text-teal-50/80">{email}</span>}
          <form action="/auth/signout" method="post">
            <button className="rounded-md border border-white/30 px-3 py-1.5 text-sm font-medium hover:bg-white/10">
              Sign out
            </button>
          </form>
        </div>

        {/* Mobile menu button */}
        <button
          className="sm:hidden rounded-md p-2 hover:bg-white/10"
          onClick={() => setOpen((o) => !o)}
          aria-label="Toggle menu"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
      </div>

      {open && (
        <nav className="space-y-1 px-4 pb-3 sm:hidden">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} className={linkClass(l.href)} onClick={() => setOpen(false)}>
              {l.label}
            </Link>
          ))}
          <form action="/auth/signout" method="post" className="pt-2">
            <button className="w-full rounded-md border border-white/30 px-3 py-2 text-left text-sm font-medium hover:bg-white/10">
              Sign out{email ? ` (${email})` : ""}
            </button>
          </form>
        </nav>
      )}
    </header>
  );
}
