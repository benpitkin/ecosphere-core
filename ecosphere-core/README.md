# EcoSphere Core

Pipeline + operations hub for **EcoSphere Energy Ltd** — MCS-accredited renewable installer (ASHP, Solar PV, batteries, heating upgrades), Devon.

This is the **central data hub** of the EcoSphere software sphere. It owns customer + deal data; **Dispatch** (field/installation layer) and **Pulse** (business-intelligence / financial layer) read from the same Supabase database. Money, stages, dates and sources are typed columns and enums — never free text — so those layers can query it reliably. See [`docs/SCHEMA.md`](docs/SCHEMA.md).

> This is original, owned-by-you code. It takes design inspiration from the hub layout EcoSphere uses, but shares no code with any third-party system. Your data source of truth can remain **GoHighLevel** — a built-in sync pulls contacts and opportunities into this CRM (see [`docs/GOHIGHLEVEL.md`](docs/GOHIGHLEVEL.md)).

**Stack:** Next.js 14 (App Router, TypeScript) · Supabase (Postgres + Auth) · Tailwind CSS · `@hello-pangea/dnd` · deploys to Vercel.

---

## Features

- **Hub layout** — left sidebar grouped into Workflow / Intelligence / Setup, teal branding, mobile drawer.
- **Dashboard** — KPI tiles (active jobs, pipeline value, won this month, contacts), BUS-voucher cash-flow, connected-integrations row, "needs your attention" (stale deals) and recent deals. All live from Supabase.
- **Pipeline (Kanban)** — multiple **saved board views** (Sales & Jobs, Follow-ups, New Sales, Servicing/Aftercare), each with its own granular, drag-and-drop stages. Cards show customer, value, product and days-in-stage; aged cards (>14 days) are flagged; dropping into a Lost stage captures a reason.
- **Deal detail** — contact, address, product, gross / BUS-grant / net value, lead source, property type, multi-category **tags**, timestamped **activity log**, granular **stage** control, **stage history**, and **BUS voucher** tracking.
- **Contacts** — list of all contacts (GoHighLevel-syncable) with a one-click "Sync from GoHighLevel" button.
- **Jobs** — won deals (sold / scheduled / installed).
- **GoHighLevel sync** — `POST /api/sync/ghl` pulls contacts + opportunities into Supabase (code-complete; add your API key).
- **Mobile-responsive** and **auth-gated** (Supabase email/password).

---

## Data model — built for the sphere

The pipeline is two-layered so it serves both the board UI and the BI layer:

- **Granular stages** (`pipeline_stages`) drive the Kanban — e.g. 14 columns on "Sales & Jobs".
- Each granular stage maps to a canonical **bucket** (`deals.stage`: new_enquiry → contacted → survey_booked → quoted → won → lost), kept in sync automatically by a DB trigger. Pulse reads clean macro-stages; the board shows full detail.

Full reference + integration notes: [`docs/SCHEMA.md`](docs/SCHEMA.md).

---

## Setup (≈10 minutes)

### 1. Create a Supabase project
[supabase.com](https://supabase.com) → **New project**. Note the URL + keys (Settings → API).

### 2. Run the database SQL (in order), in the Supabase SQL Editor
1. `supabase/migrations/0001_init.sql`
2. `supabase/migrations/0002_rls.sql`
3. `supabase/migrations/0003_hub.sql`
4. `supabase/seed.sql` (7 demo deals, 4 pipelines, contacts, a sample BUS voucher)

### 3. Configure environment
Copy `.env.example` → `.env.local` and fill in `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`. (GoHighLevel vars optional — see below.)

### 4. Run locally
```bash
npm install
npm run dev
```
Open http://localhost:3000 → sign up / sign in. (Turn off email confirmations in Supabase → Authentication → Providers → Email for the smoothest setup.)

### 5. Deploy to Vercel
Push to a Git repo, import in Vercel, add the same env vars, deploy. Add your Vercel domain to Supabase → Authentication → URL Configuration.

### 6. (Optional) Connect GoHighLevel
Add `GHL_API_KEY` + `GHL_LOCATION_ID` to your env, then click **Sync from GoHighLevel** on the Contacts page. See [`docs/GOHIGHLEVEL.md`](docs/GOHIGHLEVEL.md).

---

## Project structure

```
supabase/
  migrations/0001_init.sql   base schema, enums, triggers, BI views
  migrations/0002_rls.sql    row-level security + grants
  migrations/0003_hub.sql    pipelines, stages, contacts, BUS vouchers, dashboard views
  seed.sql                   demo data
src/
  app/
    (app)/                   authenticated hub (sidebar layout)
      dashboard/  pipeline/  jobs/  contacts/  deals/[id]/
    api/sync/ghl/            GoHighLevel sync endpoint
    login/  auth/            auth screens + routes
  components/                Sidebar, Board, DealCard, DealDetail, NewDealModal, SyncGhlButton
  lib/
    supabase/                browser + server + middleware clients
    ghl.ts                   GoHighLevel API client (server-only)
    types.ts  constants.ts  dealsQuery.ts
docs/SCHEMA.md               data model + Pulse/Dispatch integration notes
docs/GOHIGHLEVEL.md          GHL sync setup
```

## Notes
- Brand teal **`#1B7A6E`** with grey accents throughout.
- `value_net` is a generated column (`gross − grant`) so it can't drift.
- The board persists stage moves immediately; bucket transitions are logged to `stage_history`.

---

## Proposal Engine (v3 — a Hub module)

The Hub now includes the Proposal Engine: turn a survey/design into a costed, MCS-ready proposal + itemised kit list + supplier & subcontractor purchase orders. It lives on the **same Supabase database** (no separate app).

**Extra setup SQL (run after 0003 + seed):**
4. `supabase/migrations/0004_proposal_engine.sql` — catalogue, margin rules, kit templates, mapping rules, proposals, lines, POs
5. `supabase/seed_proposal.sql` — starter catalogue, ASHP base kit, per-radiator bundle, mapping rules

**New pages:** `/catalogue` (products + margin rules), `/proposals` (list), `/proposals/[id]` (builder).

**How it works**
- **Pricing:** store cost only; `unit_sell` is a generated column = `round(cost × (1 + markup_pct/100), 2)`. Margin comes from per-category rules with a global default; per-line override allowed. Prices are **snapshotted** onto proposal/PO lines.
- **Resolve engine** (`POST /api/proposals/resolve`): takes a design payload → applies mapping rules → **direct match** (heat pump by kW, cylinder by litres), **schedule expansion** (each replaced emitter row → 1 radiator + a per-radiator bundle), **base kit** (ASHP consumables). Unmatched items become a line flagged `needs SKU` (never blocks). Every line tagged `design | rule | base_kit | manual`.
- **POs** (`POST /api/proposals/generate-pos`): groups lines into one supplier PO per supplier plus a subcontractor PO for labour lines.
- **Try it:** Proposals → New proposal → the sample 12 kW ASHP design resolves to a full costed kit.

> PDF extraction (e.g. Spruce output) is the eventual primary input; the v1 engine takes the design as structured JSON, so the mapping logic can be proven against known jobs first.

---

## What's wired across the hub (v3.1)

- **Dashboard** shows a Proposals panel (open count + sell value + recent).
- **Deal detail** lists that deal's proposals and has a one-click **New proposal** (creates a draft linked to the deal).
- **Customer-facing proposal** at `/print/proposal/[id]` — branded, sell-price-only, BUS deduction, print/save-as-PDF (linked from the proposal builder's "Customer view").
- **Deployment runbook:** see `docs/DEPLOY.md` (GitHub → Supabase → Vercel, ~15 min) — includes a what-to-test checklist.

Build status: full `next build` passes clean (16 routes, type-checked) on `next@14.2.35`.
