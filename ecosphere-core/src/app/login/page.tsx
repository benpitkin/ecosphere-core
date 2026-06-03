"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  // useSearchParams must sit inside a Suspense boundary for `next build`.
  return (
    <Suspense fallback={null}>
      <LoginInner />
    </Suspense>
  );
}

function LoginInner() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/pipeline";

  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setMsg(null);
    setLoading(true);
    const supabase = createClient();

    if (mode === "signin") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setErr(error.message);
      else router.replace(next);
    } else {
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) setErr(error.message);
      else setMsg("Account created. If email confirmation is on, check your inbox — otherwise sign in.");
    }
    setLoading(false);
  }

  return (
    <div className="grid min-h-screen place-items-center px-4" style={{ background: "#0F463F" }}>
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-xl">
        <div className="mb-6 flex items-center gap-3">
          <span
            className="grid h-11 w-11 place-items-center rounded-full text-lg font-bold text-white"
            style={{ backgroundColor: "#1B7A6E" }}
          >
            E
          </span>
          <div>
            <h1 className="text-lg font-semibold text-gray-900">EcoSphere Core</h1>
            <p className="text-xs text-gray-500">EcoSphere Energy Ltd</p>
          </div>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-teal-600 focus:outline-none focus:ring-1 focus:ring-teal-600"
              placeholder="you@ecosphereenergy.co.uk"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Password</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-teal-600 focus:outline-none focus:ring-1 focus:ring-teal-600"
              placeholder="••••••••"
            />
          </div>

          {err && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}
          {msg && <p className="rounded-md bg-teal-50 px-3 py-2 text-sm text-teal-800">{msg}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg py-2.5 text-sm font-semibold text-white transition disabled:opacity-60"
            style={{ backgroundColor: "#1B7A6E" }}
          >
            {loading ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
          </button>
        </form>

        <button
          onClick={() => {
            setMode((m) => (m === "signin" ? "signup" : "signin"));
            setErr(null);
            setMsg(null);
          }}
          className="mt-4 w-full text-center text-sm text-teal-700 hover:underline"
        >
          {mode === "signin" ? "Need an account? Sign up" : "Already have an account? Sign in"}
        </button>
      </div>
    </div>
  );
}
