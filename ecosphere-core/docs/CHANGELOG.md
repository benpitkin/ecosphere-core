# Changelog

## v3.6 — Part-picture library (upload photos, stored in Supabase)

A central image library for parts: upload a photo once per product and every quote that includes it shows that photo automatically.

### New
- **Catalogue → Products → Image** — an **Upload** button per part. The file is stored in a Supabase Storage bucket (`part-images`) and its URL saved to the product; a thumbnail shows in the row. Pasting a URL still works as a fallback, and parts with no photo fall back to the bundled EcoSphere illustration.
- **`supabase/migrations/0005_storage.sql`** — creates the public `part-images` bucket with authenticated upload/update/delete + public-read policies. **Run this once** in the Supabase SQL editor to enable uploads (idempotent).

### How it flows
- Upload in the Catalogue → saved to storage → `products.attrs.image_url` updated → the customer proposal reads each part's photo live, so updating a part's photo updates it everywhere. No per-quote work.

### Setup
- Run `0005_storage.sql` once. No other changes; existing data untouched.


## v3.5 — Part images on the proposal (Spruce-style component cards)

- Component cards now show a **picture of each part**: a per-product photo when set, otherwise a clean EcoSphere line-art illustration per category (heat pump, cylinder, radiator, solar panel, inverter, battery, materials, labour). Bundled in `public/proposal/` — works out of the box, no setup.
- **Catalogue → products** gains an **Image URL** field (stored in `attrs.image_url`) so you can paste a real manufacturer/part photo per product; it overrides the illustration on every proposal automatically. No DB change.
- Cards are laid out Spruce-style: thumbnail + name + spec chips.


## v3.4 — Lean compliant customer proposal (Phase 1 of the proposal blueprint)

Rebuilt the customer-facing proposal (`/print/proposal/[id]`) into the lean, visual, MCS/RECC-compliant structure from the proposal blueprint. Frontend-only; reads existing data; no DB or env changes.

### New
- **`src/lib/proposalContent.ts`** — single source of truth for the company block (white-label), scope-of-works (ASHP + solar), the fixed compliance/protection block, line→customer-group mapping, and at-a-glance helpers.
- **Lean proposal layout** — cover with auto proposal-type label (Heat pump / Solar & battery / Renewable energy), headline investment box, "At a glance" hero tiles, component cards with spec chips (kW / kWh / litres / SCOP / warranty), grouped itemised quote (the 30-line bill of materials collapses into one "Mounting, cabling & electrical" line for the customer), concise scope checklist, payment schedule + pay-in-full, a Compliance & protection block (MCS/RECC, deposit & workmanship insurance, 14-day cooling-off, "estimate may change after survey"), and an acceptance/next-steps panel with signature line.
- Sections **auto-hide by product mix** — solar-only hides the cylinder/radiators; heat-pump-only hides solar tiles.

### White-label
- Company name, address, phone, email, company no. and VAT no. now come from one constant — no more "ReformEnergy"/placeholder leakage.

### Not yet (Phase 2/3, data-dependent)
- Performance charts (solar generation / HP running cost), financial model, and the room-by-room heat-loss annex need design data + the Spruce import — these come next.

### Build
- Full `next build` passes clean — 19 routes, type-checked, on `next@14.2.35`.
