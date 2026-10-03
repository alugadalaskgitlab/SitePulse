> Historical implementation-stage notes. Superseded by final-report.md for current backend, migration and verification status.

# BOQ-LINK-01 Part B — frontend implementation and handoff

## Status: incomplete batch; do not publish

The frontend portions of B2–B4 are implemented. B1 (Drizzle/schema plus development DDL), B5 (shared/server advisory), and B6 (server persistence/copy integration) are **not implemented**. This implementation agent's higher-priority role instruction prohibits backend edits. No database was accessed or modified, no production DDL was added, and neither development database received a migration. The owning agent must complete those parts before treating this batch as finished.

The complete attachment, supplied database skill and dev/prod split memory were read. The database Publish-migration reference and testing skill were also inspected. Approved Part A artifacts were left unchanged: `baseline.sql`, `baseline-results.txt`, and `part-a-baseline.html` in this directory. Part A was not rerun.

## Design and scope

Existing SitePulse/SiteLog utility-form layout, typography, palette, spacing, and motion are preserved. No redesign, new branding, generated imagery, worker-name block changes, reporting calculations, operational measurement changes, backfill, publish action, or DPR-VIEW-01 work.

### Implemented

- Guided, SiteEdit, and classic Detailed SiteEntry labour selectors: Today's activities in progress-row order, General, Other BOQ items, No work item.
- New labour rows suggest the sole activity and show the requested muted note. Zero/multiple activities do not guess.
- Untouched suggestions follow progress changes; manual selection, explicit blank and General remain untouched.
- New equipment with start/end and exactly one distinct item/bar receives one full-clock segment through the same `onWorkAssignmentChange` handler as the editor. Meter-only rows receive no times or segment.
- Guided equipment suggestions also update when its equipment step is unmounted.
- General is visible even on collapsed equipment cards. Assignment removal requires confirmation; cancelling leaves all values unchanged. Confirming clears segments/allocations through the segment callback; no new non-null parent-link write was introduced.
- SiteEdit and classic Detailed materials have the same selector; new Issued rows suggest, Received rows do not. Untouched suggestions clear when a new Issued row is changed to Received. Engineer-chosen links remain unchanged.
- Suggestion provenance is a client-only Symbol: spreads retain it during a live editing session, JSON/API/draft serialization cannot persist it. Hydrated/saved rows are not marked eligible.
- Frontend equipment/labour/material hydration and explicit material/labour payload projections carry `resourceScope`. Guided materials remain unmanaged passthrough.
- All worker-name components, worker-name JSX blocks and original tests are unchanged.

**Persistence caveat:** frontend payload support is not server persistence proof. Current schemas have no `resourceScope` declaration; requests can lose it during validation. Confirmed General on legacy equipment also needs server enforcement to clear the legacy parent fallback without introducing a new parent assignment path.

## Changed files

| File | Change |
|---|---|
| `client/src/lib/resourceSuggestions.ts` | Pure eligibility, activity-order, single-item and full-clock segment helpers |
| `client/src/hooks/use-resource-suggestions.ts` | Live new-row labour/material suggestion lifecycle |
| `client/src/hooks/use-equipment-resource-suggestions.ts` | Guided suggestion updates outside the mounted equipment step |
| `client/src/components/ResourceWorkItemSelect.tsx` | Ordered grouped selectors and suggestion note |
| `client/src/components/DprEquipmentCompact.tsx` | New-row segment suggestion, visible General control and removal confirmation |
| `client/src/pages/GuidedDpr.tsx` | Labour/equipment integrations, hydration/payload scope passthrough |
| `client/src/pages/SiteEdit.tsx` | Labour/material/equipment integration and scope hydration/payload fields |
| `client/src/pages/SiteEntry.tsx` | Classic Detailed/section-editor integration using the existing segment assignment path |
| `tests/boqLink01Frontend.test.tsx` | 10 new unit/component/hook tests |
| `.agents/outputs/boq-link-01/part-b-migration.sql` | Proposed three-statement additive DDL, not applied |
| `.agents/outputs/boq-link-01/part-b-report.md` | This report |

Logs and signed-out screenshot evidence also live in this output directory. Tests rewrote three tracked PDF artifacts; those artifacts were restored to their original content.

## Migration SQL — proposed only, not applied or Publish-verified

```sql
ALTER TABLE equipment_logs ADD COLUMN resource_scope text NULL;
ALTER TABLE labour_logs ADD COLUMN resource_scope text NULL;
ALTER TABLE material_logs ADD COLUMN resource_scope text NULL;
```

There are exactly three pure ADD COLUMN statements, with no default, NOT NULL, rename, drop, or startup migration. The owning agent must add the three Drizzle fields, review current schemas, apply the reviewed DDL separately to runtime development and Publish-comparison development, and verify nullability/defaults and a no-drop Publish preview. Production remains read-only.

## Test evidence

Baseline commit: `ce179c73d0ad4c23195ded3783f0a62a543a65f7`.

| Run | Files | Tests | Errors |
|---|---|---|---|
| Before edits, `npm test` | 20 failed / 274 passed / 2 skipped, 296 total | 53 failed / 4059 passed / 3 skipped, 4115 total | 10 unhandled errors |
| After frontend implementation, `npm test` | 20 failed / 275 passed / 2 skipped, 297 total | 54 failed / 4068 passed / 3 skipped, 4125 total | 10 unhandled errors |
| New frontend plus unchanged LABOUR-01 tests | 3 passed / 1 skipped, 4 total | 22 passed / 2 skipped, 24 total | None reported |

The full suite did **not** pass. Failure-name comparison adds one source-string regression: `focusedDprRestoration1449.test.ts`, “preserves equipment fallback identity while exposing child allocations and labour BOQ links.” Its source assertion requires the old literal `<SelectItem value="__none__">Not linked</SelectItem>` in SiteEdit; the new required selector renders “No work item” via a reusable component. The original test was not edited or weakened. Remaining full-suite failure names match the pre-change baseline.

LABOUR-01 has 12 passing tests and two PostgreSQL tests skipped by their existing environment gates; they were not falsely counted as passed. The new frontend file has 10 passing tests. An earlier intermediate run had two additional source-string failures; those were fixed before the full-suite result above.

`npm run check` remains failing with 484 TypeScript diagnostics across the existing repository. None reference the changed frontend implementation or new test files. A pre-change TypeScript baseline was not collected, so these are not asserted to be byte-for-byte baseline errors.

Evidence:

- `tests-baseline.log`
- `tests-frontend-final.log`
- `tests-labour-frontend.log`
- `typecheck-frontend.log`

### Tests B–K

| Test | Actual evidence and limitation |
|---|---|
| B | Passing component/helper tests for WMM labour selection/note, exact full start/end segment, and meter-only no suggestion. No saved-database evidence; server work remains. |
| C | Passing single/multiple item and distinct/duplicate-bar tests; activity-order helper and grouped selector implemented. Authenticated running-app screenshot unavailable. |
| D | Passing hook tests show live untouched suggestions recompute and manually selected links survive; Guided equipment updates while the equipment editor is unmounted. |
| E | Passing General labour/material mutual-exclusion tests and equipment confirmation cancel/confirm tests. Reopen/save database round-trip unverified. |
| F | Passing Issued/Received default and type-change tests. Actual SiteEdit controls wired. |
| G | Frontend follow-up now verifies nonblocking attribution advice, Guided and SiteEdit row jumps/highlights, synthetic Submit anyway, and No Site Work suppression; see the fixture addendum below. This is not production/authentication/persistence evidence. |
| H | Passing frontend saved-row/hydrated JSON non-eligibility tests. No old submitted DPR accessed or re-saved. Actual production/development row comparison remains outstanding. |
| I | Frontend hydration/payload paths carry scope; server version/draft promotion tests remain outstanding. |
| J | Full-suite counts above; unchanged LABOUR-01 tests pass where enabled. No assertion of full-suite success. |
| K | Diff review and grep show no new non-null equipment parent BOQ assignment. New suggestions contain `boqItemId` only inside segment `boqItems`; equipment creation retains its pre-existing null parent field. Full server grep proof must be completed with B6. |

### Screenshots B–G and authentication limit

The running `/site/guided/combined` route was captured with authentication unchanged. The capture remained on the app startup/auth surface and logged an HTTP 401. An anonymous request to `/api/dprs/with-details` returned 401; the page route itself returned 200. No auth bypass, seeded login, secret access or secret display was used.

`screenshots/guided-auth-limit.jpg` records that limitation. `screenshots/guided-access.jpg` is the initial signed-out capture of `/dpr/guided`, not a B–G acceptance screenshot. Neither image is claimed to verify the signed-in UI. Authenticated B–G screenshots require the owning agent's authenticated tester/session.

## Readiness regression requirement

`shared/dprSubmitReadiness.ts` and all existing readiness tests are unchanged. Original and current file SHA-256:

`71f283d2dab33f9feee2d97e45bfad0e2e0c26d7ec5b9648e381ce59b883676c`

This is unchanged-source evidence only, **not** the requested per-fixture byte-for-byte mandatory comparison after adding B5. The owning agent must capture/replay every existing readiness fixture against this pre-change version when implementing the advisory.

## Resource copy/version/promotion/detail path review

Backend files below were inspected read-only. No backend/schema changes were made.

| Path | Current behavior | Required B6 follow-through |
|---|---|---|
| `shared/schema.ts`: resource tables and `createDprRequestSchema` | Missing field | Add nullable text columns and request round-trip fields |
| `DatabaseStorage.createDpr`, equipment insert around 3447, material insert around 3475 | Normalized equipment and material object spreads; labour helper spreads fields | Declare scope in schema/request; test all three sections |
| `updateDraftDpr` and `_replaceDprChildRecords`, around 3882–4175 | Equipment omission-preservation/normalization; labour replacement; material spreads | Ensure scope survives PATCH and General mutual exclusion |
| `submitDraftDpr`, around 3634, using replacement transaction | Existing final-submit lifecycle | Verify draft General fields persist through promotion without operational math changes |
| `updateDpr`, around 4190–4284 | Older child replacement path with spreads | Include in scope round-trip tests |
| `cloneDpr`, around 4305–4586 | Explicit projections for cloned equipment, labour and material rows | Add scope to all three explicit copy projections; preserve existing links/values |
| `createVersionDpr`, around 4613–4947 | Edited resource insertion plus fallback copies for omitted sections | Edited scope plus omitted-section fallback scope, including explicit original-material projection around 4870 |
| `server/labourWorkers.ts`: `insertLabourWithWorkers`, `readWorkerNames` | Spreads parent fields; worker children handled separately | Scope declaration must flow through; keep LABOUR-01 logic untouched |
| `normaliseDprEquipmentRowsTx`, around 7028 | Spreads row after stripping assignment-only fields | Enforce General/attribution exclusivity without hours/usage changes |
| `preserveOmittedEquipmentAllocationsTx`, around 7208 | Preserves omitted assignments for saved rows | General must not silently restore explicitly confirmed removed links |
| `getDprsWithDetails`, around 2895 | ORM resource relations and spread mapping | Declared scope should round-trip automatically; test list API |
| `getDpr`, around 2956 | ORM detail relations and equipment spread hydration | Test single-DPR endpoint |
| `dpr_versions` bookkeeping / supersede in clone/version paths | References resource-bearing replacement DPRs; supersedes original header | Scope must exist in resource rows on the replacement DPR; do not update original rows |
| cancellation/deletion paths | Header state or deletion; not resource copy | No scope rewrite/backfill needed |
| SiteEdit `mapDprToFormState` / material payload projection | Explicit resource scope fields added | Completed frontend portion |
| SiteEntry full create, recovered draft and section payloads | Resource object spreads and shared SiteEdit hydration | Completed frontend portion; server parser still outstanding |
| Guided equipment split/build, labour payload, unmanaged materials | Generic equipment/material passthrough; explicit labour scope added | Completed frontend portion |

## Not touched / next required work in this same batch

1. Complete B1, B5 and B6 under backend-capable ownership.
2. Apply reviewed additive DDL to both development targets, independently; verify old rows remain NULL.
3. Add advisory-only section issues using `resolveEquipmentBoqHours`, meaningful-row detection and rowIndex; no progress links means no new advisory.
4. Run the required mandatory-fixture baseline regression against the original readiness version.
5. Verify database persistence, legacy General fallback clearing, draft submit and version-copy cases.
6. Obtain authenticated B–G screenshots without bypassing authentication.
7. Resolve or explicitly report the one new stale source-string test failure without altering protected original tests.

No BOQ-LINK-02, BOQ-LINK-03, backfill or report-math work was started.

## Frontend follow-up — B–G isolated real-screen evidence

This addendum supersedes the earlier **frontend** screenshot/test limitations only. Backend/migration/persistence ownership and evidence remain with the owning agent; the preceding backend handoff statements have deliberately not been rewritten by this frontend task.

### Readiness integration fixes

- New resource-attribution advisories have keyboard-accessible “Jump to row” buttons in the shared dialog. Guided changes to the matching wizard step; SiteEdit/Detailed close the modal, expand where required, scroll, and highlight the actual resource row.
- Mandatory rendering/callbacks, mandatory issue arrays, readiness booleans, and “Submit anyway” eligibility are unchanged. Existing non-attribution advisories remain as before.
- Guided and SiteEdit final readiness now retain hydrated equipment `resourceScope`, segments and legacy allocations even where a write payload intentionally omits unchanged saved assignments. No operational hours/diesel/quantity values or write payloads are changed by this readiness-only restoration.
- Filtered payload indexes are mapped back to actual equipment/labour/material UI rows **only for new attribution advisories**. Mandatory and pre-existing advisory indexes are unchanged. Detailed already evaluates full resource arrays; Guided complete-intent already passes saved full arrays. Guided preserved-material review rows expose matching row keys and a Detailed-edit route.

### What the browser run actually verified

`tests/fixtures/dpr-site-entry/verify-boq-link01.mjs` passed **B, C, D, E, F, G, G-edit, G-no-work**, with no captured browser exceptions. It renders the actual Guided and SiteEdit React screens through a fixture-only API adapter. Every screenshot carries the BOQ-LINK-01 synthetic-evidence banner.

| Case | Screenshot under `screenshots/` | Verified scope |
|---|---|---|
| B | `fixture-B-labour-single.png` | Single GSB activity suggests the new labour row and shows the changeable-suggestion note. WMM naming is covered by the component tests. |
| B | `fixture-B-machine-full-segment.png` | New machine assignment spans exactly 08:00–12:00; editor displays 4 h. Captured synthetic PATCH contains one segment with today's referenced programme bar 9901, not the other project bar 9903. No non-null equipment parent BOQ link. |
| B | `fixture-B-meter-only-no-segment.png` | Meter-only machine has no invented start/end or assignment segment; synthetic PATCH is checked. |
| C | `fixture-C-two-activities-options.png` | Two BOQ activities leave the new labour row unassigned; activity items appear first in the selector. |
| D | `fixture-D-manual-choice-preserved.png` | Explicit selection of Clearing survives addition of the second BOQ activity. |
| E | `fixture-E-general-fixture-reopen.png`, `fixture-E-general-readings-fixture-reopen.png` | Confirmation clears equipment assignments; synthetic save/reopen keeps General checked, assignments empty, and original clock readings. **Session-storage adapter round-trip only, not database persistence.** |
| F | `fixture-F-issued-received.png` | Actual SiteEdit Issued row receives the single-activity default; Received row remains “No work item.” |
| G | `fixture-G-nonblocking-advisory.png`, `fixture-G-equipment-row-highlight.png` | Actual Guided advisory offers Submit anyway, jumps to equipment, and applies the highlight. Synthetic submit request is captured. |
| G | `fixture-G-edit-advisory.png`, `fixture-G-edit-row-highlight.png` | Actual SiteEdit advisory also jumps/highlights its machine row. |
| G | `fixture-G-no-site-work.png` | No Site Work screen; browser additionally invokes final readiness and checks attribution advice is absent. |

`fixture-frontend-result.json` contains the synthetic request payload assertions and browser results; `frontend-fixture-browser.log` records the successful run. The API adapter is imported only by the isolated fixture entry, never by the production frontend. UI autosave is cleared between independent cases in the isolated browser; scoped adapter data is retained only for the deliberate General reopen case.

### Frontend verification results and limits

- Follow-up targeted run: **31 passed, 2 skipped**, across 4 passed test files and 1 skipped file. Includes 14 frontend tests, shared readiness tests, and unchanged LABOUR-01 tests. PostgreSQL LABOUR-01 tests retain their existing environment skip gates; they are not counted as passes. Log: `frontend-followup-tests.log`.
- Four additional frontend tests cover hydrated-assignment/scope restoration without changing operational values, attribution-only index remapping with mandatory identity preserved, advisory row navigation plus Submit anyway, and unchanged mandatory blocking/callback behavior.
- `npm run check` still reports **484** repository TypeScript diagnostics. No diagnostics reference the new readiness helper/dialog or changed Guided/SiteEdit readiness integration. Existing SiteEntry Set-iteration diagnostic remains. Log: `frontend-followup-typecheck.log`.
- Full suite was **not rerun in this follow-up**. The previously recorded full-suite baseline and stale source-string failure above remain disclosed; protected original tests were not modified.
- The `Screenshot` tool could not connect to the isolated :4178 runtime, including an attempt while its server was held open. CDP captured the actual rendered screenshots listed above; these were visually inspected. This tool connectivity failure does not convert fixture evidence into authenticated app evidence.
- **Signed-in production/development application UI remains unverified.** Fixture authentication is synthetic, API responses/session-storage writes are synthetic, and no real persistence, migrations, auth, operational database, or customer-record changes are proved by these screenshots.

No backend files were edited by this frontend follow-up, no managed workflows were started/restarted, no publishing occurred, and work stopped at BOQ-LINK-01.