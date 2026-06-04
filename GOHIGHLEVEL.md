# EcoSphere — Competitive discovery & SWOT analysis

*Prepared June 2026. UK-first. Scope: all-in-one trade/field platforms, solar/heat-pump design tools, and installer CRMs. Lens: build-vs-buy, differentiation, and table-stakes features for the planned EcoSphere software sphere.*

> **Caveats.** Pricing for Commusoft, simPRO, BigChange, ServiceTitan, Reonic and Spruce is **quote-only**; any figures shown for them are third-party estimates and unverified. Boiler Upgrade Scheme (BUS) grant amounts and MCS deadlines change over time — verify against Ofgem / GOV.UK / MCS before hard-coding. A reported "£9,000 off-gas-grid grant / £2,500 air-to-air" figure could **not** be confirmed and is excluded from planning.

---

## 1. Executive summary — the verdict

**One competitor already does most of what the sphere intends: Payaca.** It is UK-built, renewable-native, and the only platform found with first-class MCS documentation, **BUS/ECO grant tracking per project**, DNO G98/G99 submission, design-tool imports (EasyPV, OpenSolar, Heatpunk, Spruce) and a public API — at a flat, transparent price (£999–1,199/mo, or a £299/mo "Accelerator" for newly-incorporated MCS installers). Its existence both **validates the niche** and **collapses much of the naive "build it all" argument**.

**But there is a real, defensible gap.** Across every tool researched, BUS handling stops at *tracking and document prep* — none automate the Ofgem voucher → redemption → payment cash-flow reconciliation or direct MCS Installations Database (MID) submission. Since an installer fronts ~£7,500 per heat pump and is only repaid after redemption, a **grant cash-flow + compliance spine** is genuine white space and maps exactly to EcoSphere's "Pulse + BUS" idea.

**Recommended posture: buy-or-integrate the commodity, build only the wedge.** Don't rebuild marketing (keep GoHighLevel), field service (a mature market), or heat-loss design (Heatpunk/Spruce/Reonic). Concentrate bespoke effort on the cross-app **hub + BUS grant cash-flow + MCS audit spine**, and treat Payaca as the benchmark to beat or buy. See §5–§8.

---

## 2. Competitor set 1 — all-in-one trade / field-service platforms

| Platform | Market | Renewable / MCS / BUS fit | Pricing | API |
|---|---|---|---|---|
| **Payaca** | UK SME clean-tech installers | **Deep**: MCS docs, BUS+ECO grant tracking, DNO G98/G99, design imports | Public, flat: £999–1,199/mo (25 users); £299/mo Accelerator | Public API + MCP |
| **Commusoft** | UK SMEs, 6+ staff | **Marketing-level**: MCS packages, BUS-deduction quotes, heat-loss capture (depth unverified) | Quote-only | Xero/QB; integrations |
| **simPRO** | Larger SME / enterprise | Solar listed; **no MCS/BUS/DNO** | Quote-only (~£100+/mo, unverified) | Strong API, Xero/QB |
| **Joblogic** | SME→enterprise | Heat-pump blog only; **no MCS/BUS** | Public: £30–45/user/mo | Full REST, Xero/Sage/QB |
| **Tradify** | Sole trader / small team | **None** | Public: ~£28–34/user/mo | Connectors (Xero/QB/Sage) |
| **BigChange** | SME→enterprise, fleet | **None** | Mostly quote-only | Strong open API |
| **Klipboard** | SME | **None** | Public: £19–29/user/mo | Xero/QB/Stripe |
| **ServiceTitan** | US enterprise (10+ techs) | **None; no UK/MCS fit** | Quote-only ($245–500/tech/mo) | Robust but US-shaped |

### SWOT (from EcoSphere's perspective)

**Strengths (of buying one of these / threats to a build)**
- Payaca already encodes the expensive regulatory plumbing (MCS, BUS, DNO) EcoSphere would otherwise build and maintain.
- Mature scheduling, stock, PO and Xero/QuickBooks integration are universal — table stakes are solved off-the-shelf.
- Transparent flat pricing (Payaca) can undercut per-user tools past ~6–8 users.

**Weaknesses (gaps EcoSphere can exploit)**
- Only Payaca (and partially Commusoft) is renewable-native; the rest are generic and would need manual MCS/BUS workflows bolted on.
- BUS support is "tracking", not cash-flow reconciliation or MID/Ofgem submission.
- Quote-only pricing (Commusoft, simPRO, BigChange) means sales-led cost and lock-in risk.
- Team-size gates: Commusoft discourages <6 staff; ServiceTitan needs 10+ techs.

**Opportunities**
- Use a bought platform's open API (BigChange, Joblogic, simPRO, Payaca) as a spoke and build only the hub + cash-flow layer on top — a middle path between build and buy.
- A bespoke hub can unify data these single platforms silo.

**Threats**
- Payaca is on EcoSphere's exact roadmap with funding and an AI/MCP story — it may close any gap before a bespoke build ships.
- Building duplicates regulatory logic that shifts with scheme rules: ongoing maintenance + audit risk.

---

## 3. Competitor set 2 — solar / heat-pump design & proposal tools

*(Direct competitors to EcoSphere Design.)*

| Tool | Designs | Kit list / BOM | API / export | UK / MCS / BUS |
|---|---|---|---|---|
| **OpenSolar** | Solar PV (HP = beta visual only; *explicitly not a compliant HP tool*) | Auto BOM incl. racking; checkout to partner catalogue | Enterprise API — **becomes paid Apr 2026** | Solar MCS perf calc; no HP/BUS |
| **Aurora Solar** | Solar PV only | Solar-component BOM | API on Enterprise (quote-only) | **US-centric; no MCS/BUS** |
| **Reonic** | **PV + genuine MCS-grade heat-pump** (EN 12831 heat-load) | Component/parts lists | **Open REST v3, 100+ endpoints (Components, Packages, Offers)** | UK site; MCS-ready (claimed); BUS unconfirmed |
| **EasyPV (Midsummer)** | Solar PV (HP via separate **Heatpunk**) | **Best UK consumables BOM** ("every hook & screw") | No open API; tied to Midsummer ordering | Strong MCS; free / Pro (price unpublished) |
| **Spruce** | **Heat pump only (deepest UK HP)** | Cost line-items, not deep itemised BOM | **No open API** — partner sync only (Pipedrive/Payaca/Commusoft) | **Strongest**: QMS, MCS/CIBSE heat-loss, auto paperwork, **BUS pre-fill** |

### SWOT

**Strengths (of incumbents)**
- Spruce and Heatpunk set a high UK MCS heat-loss bar; EcoSphere Design must match it to be credible.
- EasyPV's consumables-level kit list is the gold standard for accuracy.
- Reonic is the one tool with genuine PV+HP design *and* an open API.

**Weaknesses (EcoSphere Design's opening)**
- **No single tool does PV + compliant HP + deep itemised BOM + open API.** Reonic lacks proven consumables depth; EasyPV lacks an open API; Spruce lacks both deep BOM and an API.
- **Purchase orders to the installer's own suppliers are essentially unserved** — tools stop at the customer proposal or lock ordering to their own wholesaler.
- Open data export is weak sector-wide (Spruce sync-only; EasyPV closed; OpenSolar API going paid; Aurora API enterprise/US). This is the structural reason an "own app" strategy is attractive *and* hard.

**Opportunities**
- EcoSphere Design's confirmed plan — own the proposal, demote design tools to *feeds*, snapshot prices, fully itemise consumables, raise POs to actual suppliers — directly targets the BOM-depth + PO + open-data gaps.
- Spruce extraction already lives in EcoSphere Field; reuse it as a design feed (no rebuild).

**Threats**
- Reonic could become the integration-friendly default if EcoSphere stalls.
- Reonic/Spruce pricing is quote-only — hard to benchmark cost-to-beat.
- Reonic (PDF/portal BOM caveat from earlier) — note the open API finding supersedes the assumption that its BOM is PDF-only; **verify which BOM fields are actually exposed** before relying on it.

---

## 4. Competitor set 3 — CRMs / marketing + the MCS/BUS landscape

**GoHighLevel (current lead engine).** Best-in-class top-of-funnel (funnels, multi-channel nurture, speed-to-lead, reviews); cheap vs assembling tools. **API gated to Unlimited ($297/mo)+** — needed for data egress into a hub. But it is **not domain-aware**: no concept of MCS certs, BUS vouchers, heat-loss or commissioning records; contact/pipeline-centric, not project/compliance-centric. **Verdict: keep as the marketing front-end, not the system of record** — exactly EcoSphere's stated architecture.

**UK MCS/renewable-specific software exists but no clear winner:** Payaca (closest to the sphere vision), Carno ("automated MCS administration"), Reonic, PaperClip (MCS calcs/workflow), Heatpunk (design). Most "track and prepare" rather than automate Ofgem/MID submission + payment reconciliation.

**The regulatory wedge (EcoSphere's differentiator):**
- **BUS grant: £7,500 ASHP/GSHP, £5,000 biomass** (England & Wales; ASHP rose £5k→£7.5k Oct 2023). Funded ~£295m for 2025/26, expected to run to ~Mar 2028.
- **Voucher lifecycle is installer-led and cash-flow-heavy:** installer applies on the customer's behalf → Ofgem issues voucher to the installer → install within ~3 months → MCS certificate generated → voucher redeemed → Ofgem pays the installer. The installer **fronts ~£7,500/heat pump** and carries it until payout — a serious working-capital drag across concurrent jobs.
- **MCS obligations:** technology certification + RECC/HIES membership; register every install on the **MID within ~30 days** of commissioning; certificate goes in the handover pack; full audit trail retained (Ofgem + MCS can audit, with clawback risk).

### SWOT

**Strengths**
- GHL is a strong, cheap, low-switching-cost lead engine — no reason to replace it.
- Keeping GHL as front-end and a bespoke hub as system-of-record is a clean, defensible split.

**Weaknesses (of the incumbents → EcoSphere's opening)**
- No tool found automates **MID/Ofgem submission** or **reconciles voucher → payment against cash position** — only tracking/templates.
- Generic CRMs can't represent compliance entities; niche tools handle them shallowly.

**Opportunities**
- **BUS cash-flow + MCS audit spine is the killer differentiator** and maps to the planned Pulse + BUS modules.
- Compliance-as-a-feature (auto handover packs, MID deadline enforcement) addresses real audit anxiety.

**Threats**
- Payaca already markets BUS + MCS tracking and could deepen it.
- Regulatory figures change — encode them as dated, configurable parameters, not constants.

---

## 5. Build vs buy — verdict

- **Could one platform replace the whole sphere?** Closest is **Payaca** — it covers CRM-ops + MCS + BUS tracking + DNO + design imports natively. It does **not** give: a true cross-app data hub joining GHL + a bespoke Design app + Field + Pulse on a shared key; a fully itemised design→kit→**PO-to-your-suppliers** engine; or automated BUS cash-flow reconciliation/MID submission.
- **What EcoSphere gains by buying:** instant MCS/BUS/DNO plumbing, mature scheduling/stock/PO, Xero integration, no maintenance of regulatory logic. **What it loses:** bespoke fit, ownership, the cross-app hub vision, and the deep PO/BOM control EcoSphere Design is designed for.
- **Recommendation:** a **hybrid "buy/integrate the commodity, build the wedge"** path. Demo Payaca (and Commusoft) first and pressure-test their BUS cash-flow and PO-to-suppliers depth. If they fall short there (likely), build the **hub + BUS cash-flow + Design (kit/PO)** as the bespoke core and integrate the rest by API — exactly the sphere architecture, but scoped so you're not rebuilding solved problems.

---

## 6. Differentiation gaps to exploit

1. **BUS voucher cash-flow reconciliation** — applied → issued → install-by deadline → redeemed → Ofgem-paid, surfaced as grant receivables against cash position. *No competitor does this.*
2. **MID / Ofgem submission + deadline enforcement** — the ~30-day MID clock and audit-trail assembly are manual everywhere.
3. **Design → fully-itemised kit → PO to the installer's own suppliers** — incumbents stop at proposals or lock ordering to their wholesaler.
4. **Cross-app hub on a shared anchor key** (`ghl_opportunity_id`) joining lead → design → install → invoice → analytics — none of the single platforms span this.
5. **Unified PV + compliant heat-pump design** in one flow — only Reonic attempts it; quality/UK-fit unproven.

## 7. Table-stakes the build must not miss

- CRM/pipeline sync from GoHighLevel (API; needs GHL Unlimited tier).
- Quoting/proposals with **BUS grant deduction shown** + ROI/carbon savings, e-sign.
- Heat-loss/MCS design *input* (consume Heatpunk/Spruce/Reonic — don't rebuild).
- **MCS compliance docs**: customer declaration, commissioning certificate, handover pack; MID registration record.
- Scheduling/dispatch + mobile field app (lives in EcoSphere Field).
- Purchase orders + stock, **itemised consumables**, snapshotted prices (EcoSphere Design).
- **Xero integration** (universal expectation in this market).
- DNO G98/G99 awareness for solar/battery.
- Customer portal / proposal acceptance.
- Audit trail + document retention.

## 8. Implications for the sphere plan

- Confirms the **integration-hub (hybrid)** model and the **REST-contract + `ghl_opportunity_id`** spine from `PLAN.md`.
- Sharpens the first build target: the **BUS grant cash-flow + MCS audit spine** is both the clearest differentiator and the thing no one else does — strong candidate for the Hub's Phase 2.
- Reuse over rebuild: GHL (marketing), Heatpunk/Spruce/Reonic (design feeds), Xero (finance), EcoSphere Field (Spruce extraction already built).
- **Action before building:** book Payaca and Commusoft demos and pressure-test (a) BUS cash-flow reconciliation, (b) PO-to-your-own-suppliers, (c) open API depth. Their gaps there are the green light to build the wedge rather than buy.

---

## Sources

**Trade/field platforms:** Payaca (payaca.com/pricing/uk; payaca.com/uk/industries/heat-pump-installers; docs.api.payaca.com) · Commusoft (commusoft.com/en-gb/industries/renewable-energy-software; /plans) · simPRO (simprogroup.com/pricing) · Joblogic (joblogic.com/pricing) · Tradify (tradifyhq.com/uk/pricing) · BigChange (bigchange.com/field-service-management-software) · Klipboard (klipboard.io/pricing) · ServiceTitan (servicetitan.com/pricing).

**Design/proposal tools:** OpenSolar (opensolar.com/pro; /bill-of-materials; support.opensolar.com HP-beta & MCS-calc; OS 3.0 API-paid-Apr-2026 post) · Aurora (aurorasolar.com/pricing; /api) · Reonic (reonic.com/en-gb/industry/heating; /product/360h/integrations; api.reonic.de/rest/v3/docs) · EasyPV (easy-pv.co.uk; midsummerwholesale.co.uk/easy-pv) · Heatpunk (heatpunk.co.uk) · Spruce (spruce.eco; /survey-design; /qms; /paperwork; Pipedrive/Payaca/Commusoft integration pages).

**CRM + MCS/BUS:** GoHighLevel (gohighlevel.com; /pricing) · Carno/Baxi (baxi.co.uk news) · PaperClip (pclip.net) · BUS — Energy Saving Trust (energysavingtrust.org.uk/grants-and-loans/boiler-upgrade-scheme); Ofgem (ofgem.gov.uk/.../boiler-upgrade-scheme-bus); GOV.UK (gov.uk/apply-boiler-upgrade-scheme); installer guides (intergasheating.co.uk Nov-2025; ewipro.com Jan-2026) · MCS MID/handover (mcscertified.com installer MID guidance; Installer Operating Requirements Jan-2025).

*Confidence: high for publicly-listed pricing (Payaca, Joblogic, Tradify, Klipboard, Aurora base, GHL) and for the BUS/MCS process. Lower/unverified for quote-only vendors (Commusoft, simPRO, BigChange, ServiceTitan, Reonic, Spruce), vendor-marketing claims of MCS/BUS depth, and the unconfirmed £9k/£2.5k grant figures.*
