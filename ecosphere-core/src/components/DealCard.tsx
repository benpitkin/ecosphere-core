"use client";

import Link from "next/link";
import { Draggable } from "@hello-pangea/dnd";
import type { Deal } from "@/lib/types";
import { gbp, daysSince, initials, PRODUCT_LABELS, AGED_THRESHOLD_DAYS, STAGE_COLORS } from "@/lib/constants";

export default function DealCard({ deal, index, accent }: { deal: Deal; index: number; accent?: string }) {
  const age = daysSince(deal.pipeline_stage_changed_at ?? deal.stage_changed_at);
  const isOpen = deal.stage !== "won" && deal.stage !== "lost";
  const aged = isOpen && age > AGED_THRESHOLD_DAYS;
  const color = accent ?? STAGE_COLORS[deal.stage];

  return (
    <Draggable draggableId={deal.id} index={index}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          className={`group mb-2 rounded-lg border bg-white p-3 shadow-sm transition ${
            snapshot.isDragging ? "shadow-lg ring-2 ring-teal-600/40" : "hover:shadow-md"
          } ${aged ? "border-amber-300" : "border-gray-200"}`}
          style={{ borderLeft: `3px solid ${color}`, ...provided.draggableProps.style }}
        >
          <Link href={`/deals/${deal.id}`} className="block">
            <div className="flex items-start gap-2">
              <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-gray-100 text-[10px] font-semibold text-gray-600">
                {initials(deal.customer_name)}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <p className="truncate text-sm font-semibold text-gray-900 group-hover:text-teal-700">{deal.customer_name}</p>
                  <span className="shrink-0 text-sm font-semibold text-gray-900">{deal.value_gross > 0 ? gbp(deal.value_gross) : "—"}</span>
                </div>
                <p className="truncate text-[11px] text-gray-400">{deal.postcode ?? "No postcode"}</p>
              </div>
            </div>

            <div className="mt-2 flex items-center justify-between">
              <span className="rounded-full bg-teal-50 px-2 py-0.5 text-[10px] font-medium text-teal-800">{PRODUCT_LABELS[deal.product_interest]}</span>
              <span className={`text-[11px] ${aged ? "font-semibold text-amber-700" : "text-gray-400"}`} title="Days in current stage">
                {aged && "⚠ "}{age}d
              </span>
            </div>

            {deal.stage === "lost" && deal.lost_reason && (
              <p className="mt-1.5 truncate text-[11px] italic text-red-600" title={deal.lost_reason}>Lost: {deal.lost_reason}</p>
            )}
          </Link>
        </div>
      )}
    </Draggable>
  );
}
