---
name: Chainage overlap guard
description: DPR chainage duplicate/overlap guard — shared helper seam, reason-field reuse, bypass surfaces
---

# Chainage overlap guard (Batch 06B)

- `shared/chainageOverlap.ts` is the ONLY overlap-semantics seam (side compatibility, KM epsilon, interval intersection, exact-vs-partial classification). `shared/progressReport.ts` re-exports the side helpers from it — never redefine them.
- Overlap is advisory, never a hard block: Final Submit requires a per-row reason via the EXISTING `chainageOverrideReason` field, which is dual-purpose (outside-planned-reach override AND overlap acknowledgement). One reason satisfies both; UI copy must say so, and no flow may clear the other's text.
- **Why:** repeated work on the same stretch (second layer, rework) is legitimate; the field reuse avoided a schema change and keeps one reason per row.
- **How to apply:** any new DPR write path must call the server recheck. Known submit surfaces: POST /api/dprs (non-draft), POST /api/dprs/:id/submit, and **POST /api/dprs/:id/version** — versioning creates a new SUBMITTED DPR directly (schema default) and is the classic bypass; exclude the superseded parent from the prior-set. Drafts (PATCH draft / dprStatus:'draft') stay lenient.
- `GET /api/dprs/:id` needed `assertView("site_dprs")` — it had only site filtering; any endpoint that backs a preview modal must carry section-view authz, not just site scoping.

## Test flake trap
- `registerRoutes` fires `seedDatabase()` WITHOUT awaiting; it creates an example DPR whenever `storage.getDprs()` is empty. In route tests with a proxy-mocked storage, that stray `createDpr` lands mid-test (timing-dependent). Fix: mock `getDprs` to return non-empty so seeding skips (done in the 030A route test).
