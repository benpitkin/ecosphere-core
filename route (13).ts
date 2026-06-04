import { createClient } from "@/lib/supabase/server";
import { initials } from "@/lib/constants";
import type { Contact } from "@/lib/types";
import SyncGhlButton from "@/components/SyncGhlButton";

export const dynamic = "force-dynamic";

export default async function ContactsPage() {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("contacts")
    .select("*")
    .order("full_name", { ascending: true });

  const contacts = (data ?? []) as Contact[];

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Contacts</h1>
          <p className="text-sm text-gray-500">{contacts.length} contacts</p>
        </div>
        <SyncGhlButton />
      </div>

      {error && <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error.message}</div>}

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs text-gray-500">
            <tr>
              <th className="px-4 py-2.5 font-medium">Name</th>
              <th className="px-4 py-2.5 font-medium">Email</th>
              <th className="px-4 py-2.5 font-medium">Phone</th>
              <th className="px-4 py-2.5 font-medium">Postcode</th>
              <th className="px-4 py-2.5 font-medium">Source</th>
            </tr>
          </thead>
          <tbody>
            {contacts.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-6 text-center text-gray-400">No contacts yet. Connect GoHighLevel to sync them in.</td></tr>
            )}
            {contacts.map((c) => (
              <tr key={c.id} className="border-t border-gray-100 hover:bg-gray-50">
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <span className="grid h-7 w-7 place-items-center rounded-full bg-gray-100 text-[10px] font-semibold text-gray-600">{initials(c.full_name)}</span>
                    <span className="font-medium text-gray-800">{c.full_name}</span>
                  </div>
                </td>
                <td className="px-4 py-2.5 text-gray-600">{c.email ?? "—"}</td>
                <td className="px-4 py-2.5 text-gray-600">{c.phone ?? "—"}</td>
                <td className="px-4 py-2.5 text-gray-600">{c.postcode ?? "—"}</td>
                <td className="px-4 py-2.5">
                  {c.source ? <span className="rounded-full bg-teal-50 px-2 py-0.5 text-[11px] font-medium text-teal-800">{c.source}</span> : <span className="text-gray-400">—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
