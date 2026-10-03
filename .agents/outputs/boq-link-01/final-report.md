# BOQ-LINK-01 Part B — implementation and verification report

## Status: implemented, acceptance incomplete — not ready to publish

Part A was accepted and is reproduced in the accompanying HTML report, including its original SQL. B1–B6 code is implemented. Tests and caveats below are evidence-specific; fixture screenshots are NOT authenticated database persistence evidence. No DPR-VIEW-01, BOQ-LINK-02, BOQ-LINK-03, report calculation changes, or publishing was started.

## Migration

Applied only to the verified development targets sitelog_dev (runtime) and heliumdb (Publish comparison). Each column is nullable, has no default and is text. Production read-only information_schema check returned zero resource_scope columns. No production writes.

ALTER TABLE equipment_logs ADD COLUMN resource_scope text NULL;
ALTER TABLE labour_logs ADD COLUMN resource_scope text NULL;
ALTER TABLE material_logs ADD COLUMN resource_scope text NULL;

Versioned in migrations/0040_dpr_resource_scope.sql. The executed development statements included IF NOT EXISTS for idempotence. This batch SQL is ADD COLUMN only. The actual global Publish-generated migration preview was NOT obtained; do not interpret the scoped DDL audit as confirmation that unrelated schema drift cannot appear in Publish.

## B1–B6 changes

- Three nullable resourceScope fields, accepted by request schemas and returned by normal table reads.
- Guided, SiteEdit and classic Detailed labour: ordered Today's activities / General / Other BOQ items / No work item options. Single-item suggestions apply only to eligible new rows; manual and saved values are preserved.
- Equipment: sole item + sole today's programme bar + start/end creates a suggested full-time segment through the existing callback. Meter-only does not invent times. General prompts before removing assignments. Removed existing server assignment-to-parent mirroring; legacy parent-only rows remain a read fallback.
- SiteEdit/Detailed materials: Issued-only defaults. Received retains an available selector but receives no default. Guided materials remain passthrough.
- Shared advisory only: meaningful unlinked resource rows receive labeled, row-addressable guidance. No BOQ progress skips it; General and partial assignments count as linked. Pending editor segment hours use the existing clock calculator without mutating input. Existing mandatory rules are unchanged. The UI highlights and navigates the advised rows.
- Scope is carried through create, draft replacement, final submission, versioning, clone, fallback child copies and detail responses. Server General rejects contradictory equipment child assignments and clears the legacy fallback; labour/material General clears their item link.

## Tests B–K

| Test | Evidence / outcome |
|---|---|
| B | Pass in real-screen synthetic browser fixture: sole activity labour suggestion, full segment, meter-only no segment. Payload and screenshots captured; no new parent assignment path. Actual authenticated save not verified. |
| C | Pass in fixture: two activities at top, no default guesses. |
| D | Pass in fixture/unit tests: manual choice survives activity changes. |
| E | Pass in fixture: General survives adapter save/reopen; server normalization and request-schema tests pass. Real API/database save/reopen not completed. |
| F | Pass in SiteEdit fixture: Issued suggests, Received empty. |
| G | Pass in fixture/shared tests: nonblocking advisory, row highlight, continue submit to adapter; No Site Work skips. Real authenticated submit not completed. |
| H | Saved-row suggestion protection tested; production not written. Old submitted report was not opened with an authenticated session and compared field-for-field; therefore not fully verified. |
| I | Copy paths reviewed and patched; existing clone/version transaction tests and request/scope normalization tests pass. Complete real-database resourceScope draft-to-submit/version round-trip still unverified. |
| J | FAIL: latest full suite 4,084 passed, 55 failed, 1 skipped; 10 unhandled errors. Baseline: 4,059 passed, 53 failed, 3 skipped; 10 errors. Focused final run: 238 passed across 14 files, including enabled LABOUR-01 PostgreSQL tests. All original tests unchanged. |
| K | Pass by added-code grep and storage unit test: new attribution never assigns a non-null equipment parent BOQ ID. Existing historical copy/fallback remains. Explicit General can write NULL to clear a legacy fallback. |

The additional full-suite failures relative to baseline are (1) focusedDprRestoration1449 expecting the obsolete literal Not linked rather than the requested No work item selector, and (2) permission seed-handler call-count test. The latter passed all 15 tests when rerun in isolation; no permission code was changed. No assertion was deleted, changed, or hidden to obtain a green result.

Mandatory regression: tests/fixtures/boq-link-01/readiness-before.ts freezes the pre-batch function. vitest.boq-link-parity.config.ts wraps every reached evaluateDprSubmitReadiness invocation in the unchanged existing fixtures and asserts JSON-string equality of mandatory outputs. No mandatory-parity mismatch was reported. Existing failures can prevent some fixture execution; this is not a claim that every failing fixture completed.

## Persistence path audit

| Path | Scope handling |
|---|---|
| createDpr | Equipment normalization spreads the new field; labour helper and material inserts spread it. |
| updateDraftDpr / replacement helper | Current payload scope survives normalization and child-row replacement/upsert. |
| submitDraftDpr | Shared replacement path carries the field during promotion. |
| updateDpr | Existing equipment/labour/material spread paths retain it. |
| cloneDpr | Added explicit resourceScope projections for all three resource types. |
| createVersionDpr | Edited rows spread scope; original material fallback explicitly includes it; labour/equipment fallback retains source fields. |
| omitted section fallback / supersede | Existing source rows are copied through those same paths; no historical resource-scope backfill. |
| getDpr, with-details, single fetch | Table selects expose the Drizzle field; client hydration/payload projections retain it. |

## Files changed

shared/schema.ts; shared/dprSubmitReadiness.ts; server/storage.ts; migrations/0040_dpr_resource_scope.sql; client/src/pages/GuidedDpr.tsx; SiteEdit.tsx; SiteEntry.tsx; client/src/components/DprEquipmentCompact.tsx; DprReadinessDialog.tsx; ResourceWorkItemSelect.tsx; client/src/lib/resourceSuggestions.ts; resourceReadiness.ts; client/src/hooks/use-resource-suggestions.ts; use-equipment-resource-suggestions.ts; new boqLink01 tests and mandatory-parity fixture/config; isolated browser fixture adapter/runner and its main.tsx wiring. Existing worker-names blocks and original tests are unchanged. The previously requested localhost exposure on fixture port 4178 is preserved.

## Runtime and limits

Application restarted successfully and serves port 5000. Anonymous app capture reaches startup/auth with 401; signed-in UI not verified. B–G images are explicitly labeled synthetic fixture screenshots using real components, not production screenshots.

No BOQ-link backfill was introduced. Important observation: restarting the existing development application ran its PRE-EXISTING startup migrations, which logged superseded-DPR and stock-ledger updates. These were not new BOQ-LINK code, but mean a claim that absolutely no development record changed during verification would be false. Production was not written. Those routines were not changed in this batch.

Other untouched findings: baseline suite failures and typecheck debt; obsolete source-string assertion; permission test full-suite timing interference; actual Publish diff and authenticated lifecycle verification remain outstanding. Nothing else was started.

## Evidence files

.tests logs in .agents/outputs/boq-link-01: tests-baseline.log, tests-final-verified.log, targeted-final.log, backend-focused.log, permission-isolated.log. Browser results: fixture-frontend-result.json. Grep: added-boq-links.txt. Screenshots: screenshots/fixture-*.png; signed-out capture final-running-app.jpg.
