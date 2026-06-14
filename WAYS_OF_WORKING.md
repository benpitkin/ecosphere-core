# Ways of Working — EcoSphere Core / Dispatch

The rules we follow on **every** change. Deliberately lightweight: enough safety
to stop production incidents, not so much it kills momentum. Context: a small,
fast, mostly-AI-built operation with real customers and real money flowing
through it — so the bar is "no silent prod breakage", not enterprise ceremony.

---

## 1. Scope it (before building — ~1 minute)
- One line: **WHAT** we're changing, **WHY**, and **DONE =** how we'll know it works.
- Name the **blast radius**. Does it touch any of these?
  - the **live database / schema**
  - **secrets**
  - a **production deploy**
  - an **external surface** (webhook, customer link, the Core↔Dispatch contract)
  If yes → it needs an explicit human **"go"** before it runs. **No silent prod changes, ever.**

## 2. Build it
- Work on a **branch**. Never commit straight to `main` (`main` = production).
- Match the conventions of the surrounding code.
- **No half-work:** no TODOs, stubs, mock data, `pass`/placeholder functions, or
  "implement X here" comments. If something is genuinely out of scope, say so
  explicitly — don't silently skip it.
- **Secrets never go in code, chat, or the repo.** Env vars only.

## 3. Verify it (before calling it done — don't assume)
- Run them, don't trust that they "should" pass: `npm run build` · `npm test` · `npm run lint`.
- **Trace the unhappy paths** — null/empty input, errors, auth failure, the
  failure mode — not just the happy path. State which cases you checked.
- **Self-review the diff** as if reviewing someone else's PR.
- Fix the **root cause**, never paper over it (no swallowed errors, no disabled tests).
- If you **cannot** verify something by running it, say **"not verified by running"** — never imply it passed.

## 4. Ship it
- Open a **PR**. **CI (build + tests + lint) must be green.**
- Test on the **Vercel preview URL** before merging. Production is not the test bed.
- Merge to `main` (→ prod) **only with an explicit human OK**. Clear commit message.
- **Live DB / schema changes:** a versioned migration file, applied with explicit
  sign-off — never hand-edited blind, never autonomous.
- **Destructive or external-facing changes:** confirm first.

## 5. Confirm + record (after shipping)
- Verify it actually works **in production** — run it, hit the endpoint, or check a monitor.
- Update the memory notes / docs with what changed and any new env or infra.
- Report **honestly**: what's tested & confirmed, what's untested, what you assumed.

---

## Standing rules (settled — don't relitigate)
- **Repos are private.** Permissive RLS (single-tenant, trusted staff) is **intentional** — don't "fix" it.
- **System boundaries:** GHL = acquisition / funnel through *Won*; **Core** = office ops (quote, schedule, job record, invoice); **Dispatch** = field execution. Join key everywhere = `ghl_opportunity_id`.
- **Do NOT apply migration `0006`** to the live Core DB (it would null a hard-coded integration secret).
- **Ben owns Vercel env vars** — flag exactly what to set; don't expect tooling to write them.

## Definition of Done (the checklist — every PR)
- [ ] `build` + `test` + `lint` green (CI)
- [ ] Unhappy paths traced & stated
- [ ] Diff self-reviewed — no stubs / TODOs / secrets / dead code
- [ ] Tested on the preview URL (or "couldn't verify by running" stated explicitly)
- [ ] Any live-DB / secret / external / destructive change had an explicit human go
- [ ] Verified in production after merge
- [ ] Memory / docs updated; honest status given (tested vs untested vs assumed)

## One-time setup to make these rules *automatic* (not just written)
These are GitHub/Vercel toggles only the owner can flip — see the PR description:
1. **Make the GitHub repos private.**
2. **Protect `main`:** require the CI check to pass + no direct pushes (PRs only).
3. **Vercel Deployment Protection → "Only Preview Deployments"** (so webhooks + customer links work on prod; the app has its own login).
4. **Rotate any secret that's ever been pasted in chat / a brief / a public repo.**
