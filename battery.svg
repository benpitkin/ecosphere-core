# Data model & integration notes

This database is the **single source of truth** for the EcoSphere software sphere. The CRM writes to it; **Pulse** (BI / financial) and **Dispatch** (field/installation) read from it. Commercially-important facts are stored as **clean structured fields** so downstream tools never parse free text.

## Pipeline model (two layers)

- **`pipelines`** — saved board views (e.g. *Sales & Jobs*, *Follow-ups*, *New Sales*, *Servicing/Aftercare*).
- **`pipeline_stages`** — granular, ordered columns within a pipeline. Each has a `bucket` (the canonical `pipeline_stage` enum) it rolls up to.
- **`deals.pipeline_id` / `deals.pipeline_stage_id`** — where a deal sits on the board.
- **`deals.stage`** — the canonical macro-stage, **auto-derived** from the granular stage's `bucket` by the `deals_derive_stage` trigger. This is what BI should read.

So the board can have 14 stages while Pulse still sees a clean 6-bucket funnel. Add/rename granular stages freely without breaking BI.

## Core tables

### `deals`
| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `customer_name`, `address`, `postcode`, `phone`, `email` | text | contact (denormalised for convenience) |
| `contact_id` | uuid → contacts | linked contact record |
| `property_type` | enum | detached / semi_detached / terraced / bungalow / flat / commercial / other |
| `value_gross` | numeric(12,2) | total job value, GBP |
| `value_bus_grant` | numeric(12,2) | Boiler Upgrade Scheme grant |
| `value_net` | numeric(12,2) | **generated**: `value_gross - value_bus_grant` |
| `product_interest` | enum | ashp / solar_pv / battery / heating_upgrade / service |
| `lead_source` | enum | google_ads / facebook / referral / website / other |
| `stage` | enum | canonical bucket (auto-derived) |
| `pipeline_id`, `pipeline_stage_id` | uuid | board position |
| `stage_changed_at` | timestamptz | bumped when the bucket changes |
| `pipeline_stage_changed_at` | timestamptz | bumped on any granular move — drives stage-age / aged-deal logic |
| `lost_reason` | text | required when bucket = lost (DB constraint) |
| `ghl_opportunity_id` | text unique | GoHighLevel opportunity id (sync key) |
| `created_at`, `updated_at` | timestamptz | |

### `contacts`
GoHighLevel-syncable people. `ghl_id` is the unique sync key. Holds name, email, phone, address, postcode, source, tags.

### `pipelines`, `pipeline_stages`
The board structure (see above).

### `bus_vouchers`
Boiler Upgrade Scheme grant lifecycle per deal: `amount`, `status` (applied → issued → redeemed → paid / expired / rejected), and dated milestones.

### `stage_history`, `activities`, `tags` + `deal_tags`, `profiles`
Append-only macro-stage transitions; timestamped notes/calls/emails; multi-category tagging; auth-user profiles.

## Reporting views — read surface for Pulse

Run with `security_invoker = on` and granted to `authenticated`.

| View | Purpose |
|---|---|
| `v_deal_facts` | one flat row per deal (incl. `value_net`, `days_in_stage`) |
| `v_deal_metrics` | win rate, avg deal size, open/won values, counts |
| `v_dashboard_kpis` | active jobs, won-this-month, open pipeline value, contacts count |
| `v_pipeline_by_stage` | count + value per macro-bucket |
| `v_deals_by_source` | count + value per lead source |
| `v_bus_cashflow` | BUS voucher amount by status |
| `v_aged_deals`, `v_needs_attention` | open deals stuck > 14 days |

## Integration guidance

- **Pulse (BI):** connect with the service-role key server-side and read `v_deal_facts` + the aggregate views. `value_net` is grant-adjusted revenue. `stage_history` gives dated funnel transitions; `v_bus_cashflow` gives grant cash-flow.
- **Dispatch (field):** read/write `deals` (e.g. advance to an *Installed* stage) and append `activities`. Stage changes are auto-logged to `stage_history`.
- **GoHighLevel:** `contacts.ghl_id` and `deals.ghl_opportunity_id` make sync idempotent. See `docs/GOHIGHLEVEL.md`.
- **Stable contract:** treat the enums + `v_` views as the public API. Add columns rather than repurposing existing ones.

---

## Proposal Engine tables (migration 0004)

- **suppliers**, **products** (`cost_price` only; `category`, `attrs jsonb`, `unit`, `vat_rate`).
- **margin_rules** (`category` nullable = global default, `markup_pct`); `markup_for(category)` resolves the rate.
- **kit_templates** + **kit_template_items** — the consumables a design never lists (ASHP base kit; per-radiator-replaced bundle).
- **mapping_rules** (`type` = direct | schedule | base_kit; `trigger_key`, `target_category`, `match_attrs`, `bundle_template_id`).
- **design_inputs** (`deal_id`, `source`, `payload jsonb`) — reusable survey/design payloads (e.g. Spruce extraction).
- **proposals** + **proposal_lines** — `unit_sell` is a generated column; `unit_cost`/`markup_pct` snapshotted; `source` + `needs_sku` per line.
- **purchase_orders** (`type` = supplier | subcontractor) + **po_lines** (snapshotted cost).
- **v_proposal_totals** — cost / sell / customer_pays (sell − BUS) / gross_margin / margin_pct per proposal (Pulse-friendly).
