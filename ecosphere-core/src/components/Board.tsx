"use client";

import { useMemo, useState } from "react";
import { DragDropContext, Droppable, type DropResult } from "@hello-pangea/dnd";
import type { Deal, Pipeline, Stage } from "@/lib/types";
import { gbp } from "@/lib/constants";
import { createClient } from "@/lib/supabase/client";
import DealCard from "./DealCard";
import NewDealModal from "./NewDealModal";

export default function Board({
  pipelines, stages, initialDeals,
}: {
  pipelines: Pipeline[];
  stages: Stage[];
  initialDeals: Deal[];
}) {
  const [deals, setDeals] = useState<Deal[]>(initialDeals);
  const [activePipeline, setActivePipeline] = useState<string>(
    (pipelines.find((p) => p.is_default) ?? pipelines[0])?.id ?? ""
  );
  const [showNew, setShowNew] = useState(false);
  const [lostPrompt, setLostPrompt] = useState<{ deal: Deal; stage: Stage; reason: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const supabase = createClient();

  const pipelineStages = useMemo(
    () => stages.filter((s) => s.pipeline_id === activePipeline).sort((a, b) => a.sort - b.sort),
    [stages, activePipeline]
  );

  const dealsByStage = useMemo(() => {
    const map: Record<string, Deal[]> = {};
    for (const s of pipelineStages) map[s.id] = [];
    for (const d of deals) {
      if (d.pipeline_id === activePipeline && d.pipeline_stage_id && map[d.pipeline_stage_id]) {
        map[d.pipeline_stage_id].push(d);
      }
    }
    return map;
  }, [deals, pipelineStages, activePipeline]);

  const pipelineDeals = deals.filter((d) => d.pipeline_id === activePipeline);
  const totalValue = pipelineDeals.reduce((s, d) => s + Number(d.value_gross), 0);

  function applyMove(dealId: string, stage: Stage, reason: string | null) {
    setDeals((prev) =>
      prev.map((d) =>
        d.id === dealId
          ? {
              ...d,
              pipeline_stage_id: stage.id,
              stage: stage.bucket,
              lost_reason: stage.bucket === "lost" ? reason : null,
              pipeline_stage_changed_at: new Date().toISOString(),
              stage_changed_at: new Date().toISOString(),
            }
          : d
      )
    );
  }

  async function persistMove(deal: Deal, stage: Stage, reason: string | null) {
    const { error } = await supabase
      .from("deals")
      .update({ pipeline_stage_id: stage.id, lost_reason: stage.bucket === "lost" ? reason : null })
      .eq("id", deal.id);
    if (error) {
      setError(error.message);
      setDeals((prev) =>
        prev.map((d) =>
          d.id === deal.id
            ? { ...d, pipeline_stage_id: deal.pipeline_stage_id, stage: deal.stage, lost_reason: deal.lost_reason }
            : d
        )
      );
    }
  }

  function onDragEnd(result: DropResult) {
    setError(null);
    const { destination, source, draggableId } = result;
    if (!destination) return;
    if (destination.droppableId === source.droppableId) return;

    const stage = pipelineStages.find((s) => s.id === destination.droppableId);
    const deal = deals.find((d) => d.id === draggableId);
    if (!stage || !deal) return;

    if (stage.bucket === "lost") {
      setLostPrompt({ deal, stage, reason: "" });
      return;
    }
    applyMove(deal.id, stage, null);
    void persistMove(deal, stage, null);
  }

  function confirmLost() {
    if (!lostPrompt) return;
    const reason = lostPrompt.reason.trim();
    if (!reason) return;
    applyMove(lostPrompt.deal.id, lostPrompt.stage, reason);
    void persistMove(lostPrompt.deal, lostPrompt.stage, reason);
    setLostPrompt(null);
  }

  const firstStageId = pipelineStages[0]?.id ?? null;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Pipeline</h1>
          <p className="text-sm text-gray-500">
            {pipelineStages.length} stages &middot; {pipelineDeals.length} opportunities &middot; {gbp(totalValue)} &middot; drag a card to move it
          </p>
        </div>
        <button onClick={() => setShowNew(true)} disabled={!firstStageId}
          className="rounded-lg px-4 py-2 text-sm font-semibold text-white shadow-sm disabled:opacity-50" style={{ backgroundColor: "#1B7A6E" }}>
          + New deal
        </button>
      </div>

      <div className="mb-4 flex flex-wrap gap-1.5">
        {pipelines.map((p) => {
          const active = p.id === activePipeline;
          return (
            <button key={p.id} onClick={() => setActivePipeline(p.id)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${active ? "text-white" : "border border-gray-200 bg-white text-gray-600 hover:bg-gray-50"}`}
              style={active ? { backgroundColor: "#1B7A6E" } : undefined}>
              {p.name}
            </button>
          );
        })}
      </div>

      {error && <div className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      <DragDropContext onDragEnd={onDragEnd}>
        <div className="scroll-thin flex h-[calc(100vh-12rem)] gap-3 overflow-x-auto pb-3">
          {pipelineStages.map((stage) => {
            const items = dealsByStage[stage.id] ?? [];
            const colTotal = items.reduce((s, d) => s + Number(d.value_gross), 0);
            return (
              <div key={stage.id} className="flex w-72 min-h-0 shrink-0 flex-col">
                <div className="mb-2 flex items-center justify-between rounded-t-lg border-t-[3px] bg-white px-3 py-2 shadow-sm" style={{ borderTopColor: stage.color }}>
                  <span className="truncate text-sm font-semibold text-gray-800" title={stage.label}>{stage.label}</span>
                  <span className="ml-2 shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600">{items.length}</span>
                </div>
                <p className="mb-1 px-1 text-[11px] text-gray-400">{gbp(colTotal)}</p>
                <Droppable droppableId={stage.id}>
                  {(provided, snapshot) => (
                    <div ref={provided.innerRef} {...provided.droppableProps}
                      className={`min-h-[120px] flex-1 overflow-y-auto rounded-lg p-1.5 transition ${snapshot.isDraggingOver ? "bg-teal-50" : "bg-gray-100/60"}`}>
                      {items.map((deal, i) => <DealCard key={deal.id} deal={deal} index={i} accent={stage.color} />)}
                      {provided.placeholder}
                      {items.length === 0 && !snapshot.isDraggingOver && <p className="px-2 py-6 text-center text-xs text-gray-400">No opportunities</p>}
                    </div>
                  )}
                </Droppable>
              </div>
            );
          })}
          {pipelineStages.length === 0 && <p className="py-10 text-sm text-gray-400">This pipeline has no stages.</p>}
        </div>
      </DragDropContext>

      {showNew && firstStageId && (
        <NewDealModal pipelineId={activePipeline} stageId={firstStageId}
          onClose={() => setShowNew(false)}
          onCreated={(deal) => { setDeals((prev) => [...prev, deal]); setShowNew(false); }} />
      )}

      {lostPrompt && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl">
            <h2 className="text-base font-semibold text-gray-900">Mark deal as Lost</h2>
            <p className="mt-1 text-sm text-gray-500">{lostPrompt.deal.customer_name}</p>
            <label className="mt-3 block text-sm font-medium text-gray-700">Reason</label>
            <textarea autoFocus rows={3} value={lostPrompt.reason}
              onChange={(e) => setLostPrompt((p) => (p ? { ...p, reason: e.target.value } : p))}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-teal-600 focus:outline-none focus:ring-1 focus:ring-teal-600"
              placeholder="e.g. Went with a competitor on price" />
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setLostPrompt(null)} className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">Cancel</button>
              <button onClick={confirmLost} disabled={!lostPrompt.reason.trim()} className="rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">Mark Lost</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
