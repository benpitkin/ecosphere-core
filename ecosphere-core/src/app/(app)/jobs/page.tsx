import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { gbp, PRODUCT_LABELS } from "@/lib/constants";
import type { ProductType } from "@/lib/types";

export const dynamic = "force-dynamic";

// "Jobs" = deals that have reached the Won bucket (sold / scheduled / installed).
export default async function JobsPage() {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("deals")
    .select("id, customer_name, postcode, value_net, value_gross, product_interest, pipeline_stage_id, stage_changed_at, pipeline_stages(label)")
    .eq("stage", "won")
    .order("stage_changed_at", { ascending: false });

  const jobs = (data ?? []) as any[];
  const totalValue = jobs.reduce((s, j) => s + Number(j.value_net), 0);

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Jobs</h1>
        <p className="text-sm text-gray-500">{jobs.length} won jobs · {gbp(totalValue)} net</p>
      </div>

      {error && <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error.message}</div>}

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs text-gray-500">
            <tr>
              <th className="px-4 py-2.5 font-medium">Customer</th>
              <th className="px-4 py-2.5 font-medium">Product</th>
              <th className="px-4 py-2.5 font-medium">Stage</th>
              <th className="px-4 py-2.5 font-medium">Postcode</th>
              <th className="px-4 py-2.5 text-right font-medium">Net value</th>
            </tr>
          </thead>
          <tbody>
            {jobs.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-6 text-center text-gray-400">No won jobs yet.</td></tr>
            )}
            {jobs.map((j) => (
              <tr key={j.id} className="border-t border-gray-100 hover:bg-gray-50">
                <td className="px-4 py-2.5">
                  <Link href={`/deals/${j.id}`} className="font-medium text-teal-700 hover:underline">{j.customer_name}</Link>
                </td>
                <td className="px-4 py-2.5 text-gray-600">{PRODUCT_LABELS[j.product_interest as ProductType]}</td>
                <td className="px-4 py-2.5 text-gray-600">{j.pipeline_stages?.label ?? "Won"}</td>
                <td className="px-4 py-2.5 text-gray-600">{j.postcode ?? "—"}</td>
                <td className="px-4 py-2.5 text-right text-gray-800">{gbp(Number(j.value_net))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
