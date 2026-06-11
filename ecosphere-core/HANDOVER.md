# Ecosphere Core — Engineering Handover

**Owner:** Ben Pitkin · EcoSphere Energy Ltd (UK MCS‑accredited renewable installer — ASHP, solar PV, batteries)
**Purpose of this doc:** complete context to continue development in **Claude Code** (or any IDE) without losing anything. Last updated 9 June 2026.

> Read `CLAUDE.md` (repo root) first for the short version + conventions; this file is the deep reference.

---

## 1. The product

Three sibling apps that share data, built on the same stack ("Ecosphere OS"):

| App | What it is | Repo / DB |
|---|---|---|
| **Ecosphere Core** | Sales/CRM hub: pipeline (synced from GoHighLevel), contacts, deals, **proposal engine**, catalogue, purchase orders. | GitHub `benpitkin/ecosphere-core` · Supabase `jfeuvyjszidmocnggyox` |
| **Dispatch** | Field‑service / job management: jobs, subcontractors, site visits, commissioning, payments, MCS handover. | Supabase `vmocndzlznzfvuedginn` (separate repo, not in this clone) |
| **Pulse** | AI assistant over the operations data; shares Dispatch's database. | same Supabase project as Dispatch |

This repo is **Ecosphere Core** only. Dispatch/Pulse live elsewhere but are integrated at the database layer (see §8).

---

## 2. Tech stack

- **Next.js 14.2.35**, App Router, TypeScript, React server components.
- **Tailwind** (core utilities only).
- **Supabase**: Postgres + Auth + Storage. Two separate projects (see §5).
- **Vercel**: hosting, auto‑deploys on push to `main`.
- Scripts: `npm run dev | build | start | lint`.

### Repo layout quirk
The Next app lives in a **subfolder**: the git repo root contains `ecosphere-core/` and the app is at `ecosphere-core/src/...`. Vercel's project root is set to that subfolder. Paths in commits look like `ecosphere-core/src/components/...`.

---

## 3. How deploy works today (and why Claude Code helps)

- Push to `main` → Vercel builds & deploys automatically.
- **Current pain:** the working copy is a Windows clone driven by **GitHub Desktop**, and the desktop is automated indirectly. Two recurring problems: (a) Windows **CRLF/LF** line endings make `git status` show *hundreds* of "modified" files when only a handful really changed — GitHub Desktop filters this, but it's noisy; (b) a stale `.git/index.lock` occasionally blocks commits (delete `…/eco-deploy/.git/index.lock` to fix).
- **In Claude Code:** clone the repo, work directly, `git commit && git push` — no GitHub Desktop, no lock files, and you can run `next build` locally to verify before pushing. Add a `.gitattributes` with `* text=auto eol=lf` to kill the CRLF noise permanently.

### ⚠️ Outstanding deploy state (important)
There is a **local commit not yet pushed**: `4753835` ("`:)`") — the **proposal‑builder upgrade** (editable customer content, Performance charts, gated MCS PDF). GitHub `main` was last seen at `f76172f`. **First task in Claude Code: push `4753835`** (or re‑apply those changes — they're already in the working tree and type‑check clean) so the upgrade goes live, then confirm the Vercel build is green.

---

## 4. Environment variables (in Vercel — NOT in the repo)

```
NEXT_PUBLIC_SUPABASE_URL          # Core project URL
NEXT_PUBLIC_SUPABASE_ANON_KEY     # Core anon key
SUPABASE_SERVICE_ROLE_KEY         # Core service role (server-only: admin client, public routes)
WEBHOOK_SECRET                    # for GHL webhook auth (already set)
# GoHighLevel access token + Location ID (used by src/lib/ghl.ts / ghlSync.ts)
```
Get these from Vercel project settings. Never commit them. `src/lib/supabase/admin.ts` reads the service role key; it must only be imported server‑side.

---

## 5. Supabase — TWO projects

### Core — `jfeuvyjszidmocnggyox` (eu‑west‑1)
Sales/CRM. Key tables (`public`): `contacts`, `deals`, `deal_tags`, `tags`, `activities`, `stage_history`, `pipelines`, `pipeline_stages`, `proposals`, `proposal_lines`, `design_inputs`, `products`, `suppliers`, `mapping_rules`, `margin_rules`, `kit_templates`, `kit_template_items`, `purchase_orders`, `po_lines`, `bus_vouchers`, `profiles`.

Columns added recently:
- `proposals.share_token` (text, unique) — gated customer link `/p/<token>`.
- `proposals.customer_content` (jsonb) — editable per‑proposal customer document overrides.
- `proposals.heatloss_report_path` (text) — path in the `heatloss-reports` storage bucket.
- Index `deals_ghl_opportunity_id_idx`.
- Extension `pg_net` enabled (async HTTP for the Dispatch trigger).
- Private storage bucket **`heatloss-reports`** (MCS PDFs; served via signed URLs).

### Dispatch + Pulse — `vmocndzlznzfvuedginn` (eu‑west‑2)
Operations. Dispatch tables: `jobs` (very wide — carries customer, site, MCS heat‑loss/design, BUS, DNO, RAMS, commissioning), `subcontractors`, `job_offers`, `offer_responses`, `site_visits`, `commissioning_records`, `decommissioning_records`, `snag_returns`, `time_entries`, `materials`, `purchase_orders`, `payments`, `qualifications`, `users`. Pulse tables: `assistant_conversations`, `assistant_messages`, `pulse_assistant_messages`, `pulse_config`, `assistant_audit`, `assistant_triage_log`. Plus `xero_connection`.
- `jobs.ghl_opportunity_id` — the cross‑app join key (indexed).
- Edge function **`ingest-deal`** deployed here (see §8).
- Enums: `job_type` (ashp_install, service, heat_loss_survey, solar_pv, other), `job_status` (draft, offered, changes_proposed, accepted, confirmed, declined, expired, completed, ready_for_handover), `bus_status` (not_applicable, not_applied, submitted, approved, paid, rejected).

**The two databases cannot share tables.** The link between them is `ghl_opportunity_id` (both `deals` and `jobs` carry it; both originate from GoHighLevel). See `Pulse-Dispatch-Core integration plan.md` in the parent folder for the full architecture rationale.

---

## 6. The proposal engine (Core)

Flow: a **design document** (heat‑loss or solar PDF) is uploaded → parsed to a JSON **design payload** → mapped to priced **proposal lines** → rendered as a customer proposal.

- **Pricing model:** products store `cost_price` only; `sell = round(cost*(1+markup/100), 2)`. `margin_rules` hold per‑category markups. The job‑margin slider is a **true margin** control: `markupForMargin(m) = m/(100-m)*100` (30% margin → ~42.9% markup), `marginForMarkup(mk) = mk/(100+mk)*100`. Don't confuse margin and markup — this was a real bug we fixed.
- **Product matching** uses **whole‑token** set overlap (tokenize the product name into a Set, count exact token matches), NOT substring — otherwise "2kWh" wrongly matches "12kWh". See `proposalResolve.ts` (`bestByTokens` / `bestByTokensStrict`).
- **Mapping rules / kits:** `mapping_rules` (direct/schedule/base_kit), `kit_templates` + `kit_template_items`.
- **Labour:** `standingAssumptions.ts` estimates subcontract days/rate (ASHP base + per‑radiator; solar base + per‑panel + battery). Numbers are marked TUNE — confirm with Ben.
- **Multi‑technology:** `NewProposalButton.tsx` lets you select several techs (ASHP/solar/battery/…), upload a design doc per tech, and `POST /api/proposals/build` merges them into ONE proposal (`mergeSignals`, combined labour).

### Key engine files
- `src/lib/heatloss/parse.ts` — `parseHeatLoss(text)` → Spruce heat‑loss payload (`source:"spruce_heatloss"`).
- `src/lib/solar/parse.ts` — `parseSolar(text)` → OpenSolar payload (`source:"opensolar"`).
- `src/lib/proposalResolve.ts` — `linesFromPayload(payload, ctx)` (SOLAR + HEATLOSS branches), `mergeSignals`.
- `src/lib/proposalMcs.ts` — `mcsFromPayload(payload)` → normalised MCS summary (heat loss, conditions, HP, cylinder, emitter schedule, performance).
- `src/app/api/design/ingest/route.ts` — detects doc kind, parses, stores a `design_inputs` row.
- `src/app/api/proposals/build/route.ts` — multi‑doc → one proposal (sets `proposals.design_input_id = first input`).
- `src/app/api/proposals/resolve/route.ts` — single‑payload resolve.
- `src/components/ProposalBuilder.tsx` — internal editor: every line field editable (part, category, unit cost, qty, markup), job‑margin slider, generate POs, delete.

> Catalogue currently has **no solar products**, so solar lines come through as spec'd "needs SKU" placeholders until a solar price list is imported. Same for radiators.

---

## 7. The customer proposal document

Rendered by one shared server component **`src/components/ProposalDocument.tsx`**, used by:
- `src/app/print/proposal/[id]/page.tsx` — internal view (auth'd; full detail; has "Copy customer link" + a signed link to the MCS PDF).
- `src/app/p/[token]/page.tsx` — **public, view‑only, watermarked** customer page reached by `share_token`. No login (allow‑listed in `src/lib/supabase/middleware.ts`). `noindex`.

Sections: cover + investment, editable opening letter, At‑a‑glance, proposed system (component cards), **System design & heat loss** (MCS summary tiles + narrative), **Performance & savings** (editable figures + inline SVG comparison charts), itemised quote, **explanation of works** (editable list), payment schedule, **compliance & protection** (editable blocks), next steps + signature.

### Editable content
- `src/lib/proposalCustomer.ts` — `defaultCustomerContent(ctx)` + `resolveCustomerContent(stored, ctx)`. Defaults are derived from data; `proposals.customer_content` holds per‑proposal overrides merged on top.
- `src/components/CustomerDocEditor.tsx` — collapsible editor on `/proposals/[id]`: edit every section, toggle sections, set performance figures, **upload the MCS heat‑loss PDF**.
- `src/app/api/proposals/[id]/content/route.ts` — `GET` resolved content, `POST` save overrides (writes via admin client).
- `src/app/api/proposals/[id]/heatloss-report/route.ts` — `POST` (multipart) uploads the PDF to the private bucket + sets `heatloss_report_path`; `DELETE` removes it.

### Anti‑comparison‑quote gating
The customer must enter their **property postcode** to unlock the room‑by‑room emitter design AND the full MCS PDF — validated server‑side against `deals.postcode`:
- `src/components/HeatLossReveal.tsx` (client) → `src/app/api/proposal/[token]/heatloss/route.ts` (public, admin client). Returns emitters + a 1‑hour **signed URL** to the report. View‑only, watermarked, no forwardable file.

**Design decision (Ben's):** we attach the **original Spruce heat‑loss PDF** rather than re‑rendering all its tables — it's already the MCS‑compliant document, so this is accurate and low‑risk. The full Bramble Barn example PDF (in the parent uploads folder) shows the target structure: cover letter, heat‑loss tiles, proposed system, performance, itemised quote, then a Heat Loss Report (calc conditions w/ degree days + BS EN 12831 statement, heat‑loss‑by‑element, heat‑loss‑by‑room, per‑room breakdowns).

---

## 8. Core → Dispatch integration (LIVE)

When a Core **deal becomes `won` AND has a proposal with a design**, a **draft job** is upserted in Dispatch, keyed on `ghl_opportunity_id`. Idempotent (re‑runs update, never duplicate); never resets a job past draft; owner = Ben's Dispatch user `d70bcb2f-afbf-42c7-99c2-7a0c4d7e7b33`.

- **Receiver:** edge function **`ingest-deal`** on project `vmocndzlznzfvuedginn` (`verify_jwt=false`, custom shared‑secret auth). Maps the payload → `jobs` columns (heat loss, HP, cylinder, rads, emitter schedule, BUS). URL: `https://vmocndzlznzfvuedginn.supabase.co/functions/v1/ingest-deal`.
- **Sender:** Core trigger **`trg_notify_dispatch_on_won`** on `deals` → plpgsql function `notify_dispatch_on_won()` → `net.http_post` (pg_net, async). It's `SECURITY DEFINER` and wrapped in `EXCEPTION WHEN OTHERS THEN RETURN NEW`, so it can **never block a deal write**. Only fires on a genuine transition into `won` and only when a proposal+design exists; nothing fires retroactively.
- **Shared secret:** `ecs_disp_8f3b1d9c4e7a42f6b0a5c2e9d6178b34` — currently hardcoded in the edge function source + the trigger SQL. **Tech debt: move to Supabase Vault.** (Sent via `x-ingest-secret` header.)
- Tested end‑to‑end (synthetic deal → draft job with correct mapping, idempotency verified, test data cleaned up).

**Reverse direction (not built yet):** a trigger on Dispatch `jobs` (→ `completed`/`ready_for_handover`) calling back to Core to update the deal/proposal. Build it the same way (pg_net + a Core receiver route/edge function).

---

## 9. Key files map

```
src/lib/
  ghl.ts, ghlSync.ts          GoHighLevel API + pipeline/contact/deal sync
  dealsQuery.ts               board data
  proposal.ts, types.ts       domain types
  proposalContent.ts          COMPANY block, scope text, compliance blocks, line grouping, images
  proposalCustomer.ts         editable customer-content model + resolver  ← new
  proposalMcs.ts              MCS summary from design payload             ← new
  proposalResolve.ts          payload → priced lines
  standingAssumptions.ts      labour model
  heatloss/parse.ts           Spruce heat-loss parser
  solar/parse.ts              OpenSolar parser
  supabase/{server,client,admin,middleware}.ts
src/app/api/
  design/ingest               parse + store design input
  proposals/build|resolve     create proposal(s)
  proposals/[id]/content      editable customer content GET/POST        ← new
  proposals/[id]/heatloss-report  upload/delete MCS PDF                 ← new
  proposal/[token]/heatloss   gated room-by-room + signed report URL
  sync/ghl, webhooks/ghl      GHL sync (manual + webhook)
src/components/
  ProposalBuilder.tsx         internal line editor
  ProposalDocument.tsx        shared customer document renderer
  CustomerDocEditor.tsx       edit customer content + upload PDF         ← new
  HeatLossReveal.tsx          postcode-gated detail + report link
  ShareLinkButton.tsx, Board.tsx, SyncGhlButton.tsx, ...
supabase/migrations/0001..0005   (note: live DB has extra changes applied directly via MCP — see §5)
```

---

## 10. Gotchas & conventions (don't relearn the hard way)

1. **Two databases.** Core and Dispatch/Pulse are separate Supabase projects. Link = `ghl_opportunity_id`.
2. **Margin ≠ markup.** Use the formulas in §6.
3. **Whole‑token product matching**, never substring.
4. **`admin.ts` is server‑only** (service role). Public routes (`/p/...`, `/api/proposal/...`) use it because there's no logged‑in user; they're allow‑listed in middleware.
5. **CRLF/LF noise** — add `.gitattributes` (`* text=auto eol=lf`). Real change sets are small.
6. **DB migrations drift:** several recent schema changes (share_token, customer_content, heatloss_report_path, indexes, pg_net, the trigger, the bucket) were applied directly to the live DB via the Supabase MCP, not via the `supabase/migrations/*.sql` files. **Back‑fill these into migration files** so the schema is reproducible. SQL for each is in this handover / recoverable from the live DB.
7. **The Dispatch trigger swallows errors** by design — if jobs stop appearing, check the function logic (a silent failure won't surface). Test via a synthetic won deal and read `jobs` back.
8. **Don't auto‑write to Dispatch `jobs` carelessly** — `created_by` (a real user uuid), `client_name`, `postcode`, `job_type`, `estimated_days`, `day_rate` are NOT‑NULL without defaults; the rest default.

---

## 11. Backlog (not started)

- **Push commit `4753835`** (proposal‑builder upgrade) → confirm Vercel green. *(do first)*
- **GHL 5‑minute auto‑sync** — env vars set; wire a Vercel cron or a poll to `/api/sync/ghl`. (Ben deferred earlier; ready to build.)
- **Radiator price list** + **solar price list** import → so those lines match real SKUs instead of "needs SKU" placeholders. *(needs price files from Ben.)*
- **Reverse Dispatch→Core** sync (job completed → update deal/proposal).
- **Tune labour** day‑rate / days‑per‑unit in `standingAssumptions.ts` to Ben's real numbers.
- **Harden the integration secret** into Supabase Vault.
- **Back‑fill migrations** (§10.6).
- Add `.gitattributes` for line endings.

---

## 12. First steps in Claude Code

```bash
git clone https://github.com/benpitkin/ecosphere-core.git
cd ecosphere-core/ecosphere-core      # app is in this subfolder
npm install
# create .env.local with the Vercel env vars from §4
npm run dev
```
Then: push the pending commit, run `npm run build` to confirm, and pick a backlog item. Supabase changes can be made with the Supabase MCP or the dashboard against the two project IDs in §5.
