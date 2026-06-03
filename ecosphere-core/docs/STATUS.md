# Ecosphere Core — build status

*Updated June 2026. Build: `next build` passes clean, 16 routes, type-checked, on next@14.2.35.*

## Done
- **CRM:** dashboard (KPIs, BUS cash-flow, attention, recent deals + proposals), multi-view pipeline (4 boards, granular stages → BI buckets), deal detail (contact, value, tags, activity log, stage history, BUS vouchers, linked proposals), contacts, jobs.
- **Proposal Engine (Hub module):** catalogue (products + suppliers + margin rules, editable cost/active), design→kit resolve engine (direct match, schedule expansion, base kit, needs-SKU flags), proposal builder (editable lines, per-line margin, totals, BUS, status), supplier + subcontractor PO generation with status, customer-facing printable proposal.
- **GoHighLevel sync** (code-complete, env-gated).
- **Schema:** migrations 0001–0004 + seed.sql + seed_proposal.sql; all validated against Postgres grammar. BI views for Pulse.
- **Docs:** README, PLAN, SCHEMA, COMPETITOR-ANALYSIS, GOHIGHLEVEL, DEPLOY.

## Blocked on input (can't progress without)
- **Spruce PDF extraction** — needs a real sample heat-loss PDF to map fields. The engine currently takes the design as structured JSON.
- **Live deployment** — needs a Supabase project + keys and the repo pushed (see DEPLOY.md). Sandbox can't host a reachable URL.
- **GoHighLevel sync test** — needs a GHL Private Integration token.
- **Shared-DB confirmation** — do Pulse/Dispatch already share one Supabase, or separate?

## Next milestones (once unblocked)
1. Deploy (DEPLOY.md) → click-test the what-to-test checklist.
2. Wire real GHL sync with a token.
3. Spruce PDF parser → feed design_inputs.payload from a real survey.
4. Pulse reads v_proposal_totals + v_deal_facts for financial roll-ups.
