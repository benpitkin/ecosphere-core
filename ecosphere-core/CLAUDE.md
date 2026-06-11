# CLAUDE.md — Ecosphere Core

Project context for Claude Code. For full detail see **HANDOVER.md**.

## What this is
Sales/CRM hub for **EcoSphere Energy** (UK MCS renewable installer: heat pumps, solar, batteries). Part of a 3‑app suite: **Core** (this repo), **Dispatch** (jobs), **Pulse** (assistant). Core syncs its pipeline from GoHighLevel and runs a **proposal engine** (heat‑loss / solar design → priced, MCS‑compliant customer proposal).

## Stack & commands
- Next.js **14.2.35** App Router · TypeScript · Tailwind (core utilities only) · Supabase · Vercel (auto‑deploy on push to `main`).
- The app lives in a **subfolder**: `ecosphere-core/` (paths are `ecosphere-core/src/...`).
- `npm run dev` · `npm run build` · `npm run lint`. Always `npm run build` before pushing.
- Env vars live in Vercel (see HANDOVER §4); never commit secrets. `.env.local` for local dev.

## Architecture essentials
- **Two separate Supabase projects** (they cannot share tables): Core `jfeuvyjszidmocnggyox`, Dispatch+Pulse `vmocndzlznzfvuedginn`. The cross‑app join key is **`ghl_opportunity_id`** (on `deals` and `jobs`).
- Proposal flow: design PDF → parser (`src/lib/heatloss/parse.ts`, `src/lib/solar/parse.ts`) → `design_inputs.payload` → `linesFromPayload` (`proposalResolve.ts`) → `proposal_lines` → `ProposalDocument.tsx`.
- Customer proposal: shared renderer `ProposalDocument.tsx` → internal `/print/proposal/[id]`, public gated `/p/[token]` (watermarked, postcode‑gated MCS detail). Editable content via `proposalCustomer.ts` + `CustomerDocEditor.tsx`.
- Core→Dispatch: deal `won` + has proposal → Core trigger `trg_notify_dispatch_on_won` (pg_net) → Dispatch edge function `ingest-deal` → draft job (LIVE).

## Conventions / gotchas (read before coding)
- **Margin ≠ markup.** `sell = round(cost*(1+markup/100),2)`; `markupForMargin(m)=m/(100-m)*100` (30% margin → ~42.9% markup).
- **Product matching = whole‑token set overlap, never substring** (avoids "2kWh" matching "12kWh").
- `src/lib/supabase/admin.ts` = service role, **server‑only**. Public routes (`/p/...`, `/api/proposal/...`) use it and are allow‑listed in `src/lib/supabase/middleware.ts`.
- Some recent DB changes were applied directly to the live DB (not in `supabase/migrations/`): `proposals.share_token | customer_content | heatloss_report_path`, ghl indexes, `pg_net`, the Dispatch trigger, the `heatloss-reports` bucket. **Back‑fill migrations.**
- The Dispatch trigger **swallows errors by design** (never blocks a deal write) — failures are silent; test by reading `jobs` back.
- Integration shared secret is currently **hardcoded** in the edge function + trigger → move to Vault.
- Windows clone has CRLF/LF noise; add `.gitattributes` (`* text=auto eol=lf`).

## Immediate state
- Commit **`4753835`** (proposal‑builder upgrade: editable customer content + Performance charts + gated MCS PDF) is present on remote `origin/main` (`git branch -r --contains 4753835` → `origin/main`; local HEAD = origin/main, 0 ahead/0 behind, checked 2026-06-11). Confirm the Vercel deploy is green in the dashboard.

## Backlog
GHL 5‑min auto‑sync · radiator & solar price lists (need files) · reverse Dispatch→Core sync · tune labour numbers · secret → Vault · back‑fill migrations.
