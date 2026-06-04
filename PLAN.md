# Ecosphere Core — deployment runbook

From zero to a live hub in ~15 minutes. You need: a GitHub account, a Supabase account (free tier is fine), and a Vercel account.

## 1. Put the code in GitHub
1. Create a new **private** repo: `benpitkin/ecosphere-core`.
2. Unzip `ecosphere-core.zip`, then from the `ecosphere-core/` folder:
   ```bash
   git init && git add . && git commit -m "Ecosphere Core: initial"
   git branch -M main
   git remote add origin https://github.com/benpitkin/ecosphere-core.git
   git push -u origin main
   ```

## 2. Create the Supabase project
1. supabase.com → **New project**. Pick a UK/EU region (data residency — you'll hold customer PII). Save the database password.
2. **Settings → API**: copy the **Project URL** and the **anon public** key.
3. **SQL Editor → New query** and run these *in order* (paste each file, Run, then the next):
   1. `supabase/migrations/0001_init.sql`
   2. `supabase/migrations/0002_rls.sql`
   3. `supabase/migrations/0003_hub.sql`
   4. `supabase/migrations/0004_proposal_engine.sql`
   5. `supabase/seed.sql`
   6. `supabase/seed_proposal.sql`
4. **Authentication → Providers → Email**: for the smoothest first run, turn **off** "Confirm email" (you can re-enable later).

> Shared-database note: Ecosphere Core, Pulse and Dispatch are designed to share **one** Supabase database. If Pulse/Dispatch already have their own Supabase projects, decide whether to point them at this one (recommended) or keep separate and reconcile later. The Core app only needs the URL + anon key above.

## 3. Deploy on Vercel
1. vercel.com → **Add New → Project** → import `benpitkin/ecosphere-core`.
2. Framework preset: **Next.js** (auto-detected). Build command `next build`, output default.
3. **Environment Variables** (Production + Preview):
   - `NEXT_PUBLIC_SUPABASE_URL` = your Project URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = your anon public key
4. **Deploy.**
5. In Supabase → **Authentication → URL Configuration**, add your Vercel domain (e.g. `https://ecosphere-core.vercel.app`) to the redirect/allow list.

## 4. First sign-in
Open the Vercel URL → you'll land on `/login` → **Sign up** with your email → you're in. The seed data means Pipeline, Dashboard, Contacts, Jobs, Catalogue and Proposals are all populated immediately.

## 5. (Optional) GoHighLevel sync
Add `GHL_API_KEY` + `GHL_LOCATION_ID` env vars (server-only), redeploy, then **Contacts → Sync from GoHighLevel**. See `docs/GOHIGHLEVEL.md`.

---

## What to test once it's live
- **Auth:** sign up, sign out, sign back in; unauthenticated access redirects to `/login`.
- **Pipeline:** switch board views; drag a card between stages (persists); drop into a Lost stage → reason prompt; aged cards flagged.
- **Deal detail:** edit fields; add an activity; add/remove tags; change stage (history logs); add a BUS voucher.
- **Catalogue:** add a product; edit a margin rule; confirm sell price = cost × (1 + markup).
- **Proposals:** New proposal → keep the sample design → Resolve. Confirm: heat pump matched by kW, cylinder matched, two replaced radiators + per-radiator bundles, ASHP base kit added, any unmatched line flagged "needs SKU". Edit a qty/markup; set the BUS grant; **Generate POs** → one supplier PO per supplier + a subcontractor PO for labour.
- **Dashboard:** KPI tiles, BUS cash-flow, needs-attention, recent deals/proposals all read live.

## Rollback / migrations discipline
- Migrations are numbered and additive. To reset demo data, re-run `seed.sql` + `seed_proposal.sql` (they truncate CRM/catalogue data first; they never touch auth users).
- Never repurpose a column — add a new one and a new migration. Pulse reads through the `v_` views, which are the stable contract.

## Known notes
- `next` is pinned to a patched 14.2.x (security advisory on 14.2.15 addressed).
- Middleware emits an Edge-runtime warning from `@supabase/ssr`; it's a warning only and does not affect the build or runtime.
- PDF extraction for proposals isn't in v1 — the engine takes the design as structured JSON. Wiring real Spruce-PDF parsing is the next milestone and needs a sample PDF.
