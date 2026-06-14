<!-- See WAYS_OF_WORKING.md. Keep this honest — it's the Definition of Done. -->

## What & why
<!-- One line: what changed, why, and how we know it works (DONE =). -->

## Blast radius
<!-- Tick anything this touches; each needs an explicit "go" before it ships. -->
- [ ] Live DB / schema (migration file attached)
- [ ] Secrets / env vars
- [ ] External surface (webhook, customer link, Core↔Dispatch contract)
- [ ] None of the above

## Definition of Done
- [ ] `build` + `test` + `lint` green (CI)
- [ ] Unhappy paths traced & stated
- [ ] Diff self-reviewed — no stubs / TODOs / secrets / dead code
- [ ] Tested on the Vercel preview URL (or "couldn't verify by running" stated)
- [ ] Any live-DB / secret / external / destructive change had an explicit human go
- [ ] Will verify in production after merge
- [ ] Memory / docs updated

## Status (honest)
<!-- What's tested & confirmed, what's untested, what you assumed. -->
