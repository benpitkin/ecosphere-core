# EcoSphere Sphere — Planning & Roadmap

*Status: draft for discussion. Living document — we refine it before we build.*

## 1. Vision

The CRM/Hub is the **centerpiece** of the EcoSphere software sphere: an **integration hub**
that pulls customer, job, financial and document information together from the other apps via
their APIs, holds the links between them, and over time coordinates actions across them.

> One place that knows everything about a customer and a job, by joining the apps that each
> own a piece of the picture — without trying to *be* those apps.

Working name for the hub: **EcoSphere Hub** / **Core** / keep "CRM". (Decision needed.)

## 2. The sphere — apps & ownership

Each app is master of its own domain. Apps couple by **REST API contracts + a shared anchor
key (`ghl_opportunity_id`)**, NOT by sharing databases. (This is the rule EcoSphere Design
already adopted with Field.)

| App | Owns | Status |
|---|---|---|
| **GoHighLevel** | Leads, contacts, sales pipeline, marketing | External master |
| **EcoSphere Field / Dispatch** | Install scheduling, field/site ops, Spruce survey extraction | Built |
| **EcoSphere Design** | Proposal, kit list, purchase orders; design feeds (Spruce/Reonic/EasyPV/OpenSolar) | Mapping/design phase done; standing up catalogue next |
| **ecosphere-pulse** | Financial / BI analytics | Planned |
| **Xero** | Invoices, payments, accounts | External master |
| **WordPress** | Website + web-form leads | External master |
| **EcoSphere Hub (CRM)** | **Canonical customer & job, cross-app links, documents, unified timeline, BUS grants** | v2 scaffold built |

**The anchor key.** A won GHL opportunity (`ghl_opportunity_id`) is the spine that ties a lead →
proposal (Design) → install (Field) → invoice (Xero) → analytics (Pulse). The Hub's job is to
make that join real and queryable.

## 3. What the Hub owns (and what it must NOT duplicate)

Owns: **canonical Customer, Property, Job**, the **link map** (external ids per app), **documents**
(links, not storage), the **unified activity timeline**, and **BUS grant lifecycle / cash-flow**.

Does NOT own (delegates via API):
- Proposals / kit lists / POs → **EcoSphere Design**
- Install scheduling / field ops → **EcoSphere Field**
- Invoicing / accounts → **Xero**
- Lead capture / marketing → **GoHighLevel**

So the Hub is the "single customer/job view" + connective tissue, not a re-implementation of any spoke.

## 4. Canonical model (Hub)

- **Customer** — one per household; external ids: `ghl_id`, `xero_contact_id`, `wordpress_lead_id`.
- **Property** — address/postcode, EPC, off-gas, design refs.
- **Job** — keyed on `ghl_opportunity_id`; value (gross/grant/net), stage, product, dates; links to Design proposal id + Field job id.
- **Documents** — quotes, MCS certs, BUS paperwork, contracts (link to where the file lives).
- **Timeline** — events aggregated across apps.
- **BUS vouchers** — grant lifecycle + cash flow.
- **Link map** — external id ↔ canonical entity (makes every sync idempotent).

We have a clean v2 schema for deals/contacts/pipelines/stages/tags/activities/BUS + BI views.
Planning gaps: the **link map**, **documents**, **per-app external ids**, and a **Job ↔ Design/Field** reference.

## 5. Integration approach
- Per-app connectors, read first then write. GHL connector exists in code.
- Couple by **REST contracts + anchor key**, never shared DB (per Design↔Field precedent).
- Sync: on-demand + scheduled pull (cron) first; webhooks where supported (GHL, Xero) later.
- Idempotent upserts keyed on external ids.
- Orchestration (later): won → Design proposal → Field schedule → Xero invoice → Pulse.

## 6. Open decisions (need Ben)
1. Hub name.
2. App priority order for Hub integration: GHL first — then Field, Design, Xero, WordPress, Pulse in what order?
3. Read-only vs two-way per app, and by when.
4. Documents: where do files live today (Drive / Box / WordPress / email)? Hub links, not stores.
5. Users & roles (owner / sales / installer / office).
6. GDPR / Supabase region (Hub holds PII).
7. Is BUS grant cash-flow the first concrete Hub win?
8. Build approach: continue as owned code vs v0 — and who maintains each app long-term.

## 7. Roadmap (Hub) — runs alongside Design's own Phase 1
- **Phase 0 (mostly done):** v2 schema, hub UI, pipeline/dashboard/contacts/jobs, GHL sync scaffold. *Finish: real Supabase project, run migrations, deploy, prove auth.*
- **Phase 1 — GHL as spine:** real token + sync; add link map + per-app external ids; Job keyed on `ghl_opportunity_id`.
- **Phase 2 — first GHL-can't-do win:** BUS grant tracking + cash-flow; begin Pulse feed.
- **Phase 3 — connect a spoke:** link to **EcoSphere Design** (pull proposal/kit summary per job) or **Field** (install status) via their REST contracts; attach documents.
- **Phase 4 — orchestration:** cross-app actions + selective two-way sync.

## 8. EcoSphere Design — parallel track (Ben's spec, for reference)
Separate app; owns proposal/kit/POs. Phase 1: catalogue + design→product mapping first, then
proposal builder, then POs, then Field hand-off. Cost-only pricing; sell = cost × (1+markup);
consumables fully itemised; prices snapshotted on proposal/PO lines. Design feeds = Spruce
(already extracted in Field), Reonic (PDF-parse, no API), EasyPV, OpenSolar. Couples to Field by
REST, anchored on `ghl_opportunity_id`. **Next step: stand up the catalogue (suppliers + products
CRUD + margin editor), then kit templates + mapping rules, then "resolve a design to a kit".**
→ When we build this, the Hub later reads a per-job proposal summary from Design's API.

## 9. "Ready to build" checklist (this planning phase)
- [ ] Architecture signed off: integration-hub (hybrid), REST + anchor key.
- [ ] Confirm which app we build/extend next: **Hub Phase 1** vs **EcoSphere Design catalogue**.
- [ ] App priority order + read/write intent agreed.
- [ ] Canonical entity + link-map design agreed (Hub).
- [ ] Hosting region + access model decided (GDPR).
- [ ] Names chosen.

## 10. Non-negotiables
- Original work only — no copying Rob's code.
- API keys in server env, never browser/chat.
- PII: least-privilege, appropriate Supabase region.
- Apps couple by API contract + `ghl_opportunity_id`, not shared DB.
- Sandbox can't run a full `next build`; validation here is SQL-parse + TS-syntax.

---

## 11. Decisions log

- **2026-06 — Proposal builder lives inside the EcoSphere Hub** (not a separate "EcoSphere Design" app). The proposal engine, supplier catalogue, design→product mapping rules, kit lists, supplier POs and subcontractor (labour) POs are **modules of the Hub**, sharing the Hub's Supabase database alongside the customer/job/BUS/document records. Consequence: no REST contract needed between Hub and the proposal function; the kit → cost → BUS grant → cash-flow joins all happen in one database.
- **Confirmed earlier:** integration-hub (hybrid) model; GoHighLevel stays the lead/marketing engine (system of record for leads only); `ghl_opportunity_id` is the anchor key; keep heat-loss/solar design in dedicated tools (Spruce confirmed for heat loss) and ingest their **PDF** output (Spruce has no open API).
- **Open:** how the Hub relates to **Field/Dispatch** and **Pulse** — one shared Supabase database for the whole back office, or separate apps talking over REST + the anchor key. (The proposal-in-Hub decision means Pulse, at least, reads naturally from the Hub DB.)

## 12. Proposal Engine — confirmed scope (now a Hub module)
- **Goal:** ingest a completed survey PDF (Spruce heat-loss; later solar) → auto-produce an MCS-compliant, editable proposal + itemised kit list + labour estimate + draft subcontractor PO, so an unskilled office user *verifies* rather than *creates*.
- **MVP:** one heat-loss PDF → extract → one MCS-compliant proposal + kit list + labour estimate, for **heat pumps first**, proven against already-quoted jobs.
- **Inputs:** survey PDF; configurable standing assumptions (radiator types, pipework defaults, primary run length, fittings, labour rates, time-per-task); customer/job details pulled from GHL.
- **Build order (reconciled):** seed a minimal catalogue + mapping rules (the "radiator always needs x, y, z" logic) as the enabler, then the proposal/kit output as the goal. Prices snapshotted on proposal/PO lines.
- **Two PO types:** supplier kit PO + subcontractor labour PO.
- **Human gate:** nothing sends automatically; verifier can edit presentation/wording, MCS-compliance fields locked.
- **Out of scope (v1):** the survey itself, Dispatch/appointments, full Reonic replacement.

- **2026-06 — One shared Supabase database for the whole back office.** Hub (incl. proposal engine), Pulse and Field/Dispatch all live on a single Supabase database; they are modules/front-ends over one schema, not separate databases. **GoHighLevel is the only system kept external** (lead engine), syncing in via `ghl_opportunity_id`. The "REST contract, not shared DB" rule now applies **only to external systems** (GHL, Xero, design tools), not to EcoSphere's own apps.
  - *Implication:* we can now design one canonical schema covering customer, job, proposal/kit/PO, BUS, install and analytics — joins are trivial and Pulse reads directly.
  - *Mitigation for the shared-DB risk:* give each domain clear table ownership (Field owns install tables, proposal engine owns catalogue/proposal tables, etc.); Pulse reads through **stable BI views** rather than raw tables; enforce migration discipline (numbered migrations, no breaking renames — add columns, don't repurpose). The `v_` views are the internal stable contract.
