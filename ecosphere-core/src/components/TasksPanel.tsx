"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Task = { id: string; title: string; done: boolean };

// Dashboard office tasks (chase invoices, DNO, certs…). Reads/writes the tasks
// table directly via the browser client (permissive RLS, single-tenant).
export default function TasksPanel({ initial }: { initial: Task[] }) {
  const supabase = createClient();
  const [tasks, setTasks] = useState<Task[]>(initial);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);

  async function add() {
    const title = input.trim();
    if (!title || busy) return;
    setBusy(true);
    const { data, error } = await supabase.from("tasks").insert({ title }).select("id, title, done").single();
    if (!error && data) { setTasks((t) => [...t, data as Task]); setInput(""); }
    setBusy(false);
  }

  async function toggle(task: Task) {
    const done = !task.done;
    setTasks((t) => t.map((x) => (x.id === task.id ? { ...x, done } : x)));
    await supabase.from("tasks").update({ done, done_at: done ? new Date().toISOString() : null }).eq("id", task.id);
  }

  const doneCount = tasks.filter((t) => t.done).length;

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-800">Tasks</h2>
        {doneCount > 0 && <span className="text-[11px] text-gray-400">{doneCount} done</span>}
      </div>
      <ul className="space-y-1.5">
        {tasks.length === 0 && <li className="py-1 text-sm text-gray-400">Nothing on the list.</li>}
        {tasks.map((t) => (
          <li key={t.id} className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={t.done} onChange={() => toggle(t)} className="h-4 w-4 rounded border-gray-300 text-teal-600 focus:ring-teal-600" />
            <span className={t.done ? "text-gray-400 line-through" : "text-gray-700"}>{t.title}</span>
          </li>
        ))}
      </ul>
      <div className="mt-2 flex gap-2">
        <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") add(); }}
          placeholder="Add a task…" className="flex-1 rounded border border-gray-200 px-2 py-1 text-sm focus:border-teal-600 focus:outline-none" />
        <button onClick={add} disabled={busy || !input.trim()} className="rounded bg-teal-600 px-3 py-1 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-40">Add</button>
      </div>
    </section>
  );
}
