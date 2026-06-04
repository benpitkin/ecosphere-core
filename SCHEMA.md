# GoHighLevel sync

EcoSphere's data lives in GoHighLevel (GHL). This CRM can pull that data in so it
becomes the structured hub that Pulse and Dispatch read from. The sync is **one-way
(GHL → CRM)** and **idempotent** (safe to run repeatedly).

## What it does
`POST /api/sync/ghl` (also the **Sync from GoHighLevel** button on the Contacts page):
1. Pulls all **contacts** → upserts into `contacts` (keyed on `ghl_id`).
2. Pulls all **opportunities** → upserts into `deals` (keyed on `ghl_opportunity_id`),
   linking each to its contact and placing it on the default pipeline.

## Setup
1. In GHL, create a **Private Integration** token (Settings → Private Integrations)
   with read scopes for Contacts and Opportunities. Note your **Location ID**.
2. Add to your environment (`.env.local` and Vercel project settings):
   ```
   GHL_API_KEY=your-private-integration-token
   GHL_LOCATION_ID=your-location-id
   ```
   These are **server-only** — never exposed to the browser.
3. Restart / redeploy, then click **Sync from GoHighLevel** on the Contacts page.

## Mapping notes (tune to taste)
- GHL doesn't carry a product type, so synced deals default to `product_interest = service`
  and `lead_source = other` — edit in the CRM, or extend `src/app/api/sync/ghl/route.ts`
  to map from GHL custom fields / tags.
- Opportunity status maps to a stage on the default pipeline:
  `won → Won – Deposit Paid`, `lost`/`abandoned → Lost`, everything else → `New Enquiry`.
  Adjust `stageForStatus()` in the route to mirror your exact GHL pipeline stages.
- The client lives in `src/lib/ghl.ts`; the base URL and API version are set there.

## Going further
- **Scheduled sync:** call the endpoint from a Vercel Cron job for hands-off updates.
- **Two-way:** add write calls in `src/lib/ghl.ts` to push CRM changes back to GHL.
- **Webhooks:** point GHL workflow webhooks at a new route for near-real-time updates.
