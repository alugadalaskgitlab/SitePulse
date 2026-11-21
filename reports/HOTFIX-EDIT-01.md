# HOTFIX-EDIT-01 — DPR edit screen

## Fixes

Restored the `boqItemDisplayText as boqItemDisplayName` import in `SiteEdit.tsx`. The Owner correction item selector now renders BOQ item names when it contains an unlinked saved progress line.

The TypeScript scan found 12 missing-name diagnostics under `client/` and `shared/`. All were fixed:

| File | Missing name | Fix |
| --- | --- | --- |
| `client/src/pages/SiteEdit.tsx` | `boqItemDisplayName` | Restored the existing shared display-name import. |
| `client/src/components/ProgrammeBarPicker.tsx` | `companyShortName` (2 uses) | Read the configured name inside `BarLinkFeedback`. |
| `client/src/components/ReceiptWorkContext.tsx` | `companyShortName` | Read the configured name inside `TripWorkContextSummary`. |
| `client/src/pages/MixImpact.tsx` | `Link` (2 uses) | Restored the Wouter `Link` import. |
| `client/src/pages/PlantDispatches.tsx` | `setActualLdoPerTon` | Changed to the existing `setActualLdoLiters` setter. |
| `client/src/pages/PlantStock.tsx` | `escapeHtml` (3 uses) | Moved the existing helper to module scope. |
| `client/src/pages/StoresGrn.tsx` | `setAwaitingPiFilter`, `setDraftOnly` | Clear the current status filter with `setStatusMode("")`. |

No other TypeScript diagnostics were changed.

## Verification

- Added `client/src/pages/SiteEditOwnerCorrection.test.tsx`. It renders the real SiteEdit page with an Owner fixture for both an unlinked progress line and a linked line, opens the item selector, and verifies the named BOQ option appears: **2 tests passed**.
- Focused DPR edit/correction run: **7 files and 53 tests passed**.
- `tests/dpr314Correction.test.ts` still has **10 pre-existing failures** (`DPR314_CORRECTION: Unexpected correction fields`); the same failures were present before this hotfix. No changes were made to that correction logic.
- `npm run check`: no TS2304/TS2552 errors remain under `client/` or `shared/`. The project-wide check still reports 480 other TypeScript diagnostics, which were left untouched.
- `npm run build`: passed.
- Restarted the development app; startup readiness passed (`ready: true`, 2,261 columns checked). The Owner page checks used test fixtures; no database records were changed.

No production database was queried or changed. Nothing was published.
