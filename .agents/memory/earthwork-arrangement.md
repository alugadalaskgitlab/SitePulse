---
name: Earthwork Execution Arrangements
description: Instruction 023 — schema, API, planning engine changes, and UI for earthwork arrangement feature in Work Demand
---

## What was built

A full earthwork execution arrangement flow for recognised earthwork/bulk-fill BOQ items (Embankment, Subgrade, Shoulder, Borrow Soil, etc.).

## Planning engine changes (shared/planningEngine.ts)

- Added `"earthwork_arrangement_required"` to `ProcurementStatus` union type.
- Added `EarthworkArrangementSummary` interface (returned by shortage-check route and stored in ShortageRowResult).
- Added `isEarthworkBulkRequirement?: boolean` to `KeyBomMaterialInputRow`, `BomMaterialRow`, `ShortageRowOpts`, `ShortageRowResult`.
- `buildKeyMaterialRows()` sets `isEarthworkBulkRequirement: true` for earthwork items (line ~855).
- `calculateBomDemand()` propagates `isEarthworkBulkRequirement` from KeyBomMaterialInputRow to BomMaterialRow.
- `computeShortageRow()` fires `"earthwork_arrangement_required"` when `isEarthworkBulkRequirement && materialMappingUnresolved` — this takes highest precedence over `mapping_required`.

## Status rules

- Earthwork rows with no arrangement → `"earthwork_arrangement_required"`.
- If the earthwork BOQ item somehow gains a resolved `materialId` (via explicit mapping), normal coverage logic takes over instead.
- GSB, WMM, fly ash, foundation/trench excavation, structure backfill are NOT earthwork.

## Schema (shared/schema.ts + DB)

New table: `earthwork_arrangements` — one row per arrangement per BOQ item.
Key columns: `boqProjectId`, `boqItemId`, `materialLabel`, `arrangementType`, `status`, `allocatedQty`, `uom`, `agreedRate`, `plannedDailyOutput`, `plannedStartDate`, `targetCompletionDate`, `components` (jsonb), `agencyName`, `borrowSource`, `avgLeadKm`.
Status flow: `draft → submitted → approved → rejected | cancelled`.
Multiple arrangements allowed per BOQ item (split allocation).

## API routes (server/routes.ts)

- `GET /api/boq/projects/:id/earthwork-arrangements` — list for project
- `GET /api/boq/projects/:id/earthwork-arrangements/item/:itemId` — list for BOQ item
- `POST /api/boq/projects/:id/earthwork-arrangements` — create (validates allocation ≤ BOQ qty)
- `PATCH /api/earthwork-arrangements/:id` — update (includes status transitions)
- `DELETE /api/earthwork-arrangements/:id` — soft-cancel

## Shortage-check extension (server/routes.ts)

Loads all earthwork arrangements for the project alongside other parallel queries.
In the shortage row loop: detects `(matRow as any).isEarthworkBulkRequirement`, passes it to `computeShortageRow` opts, and attaches `earthworkArrangements` + `earthworkBoqItemId` to the returned row.

## UI

- `client/src/components/EarthworkArrangementDialog.tsx` — full-featured dialog with:
  - 7 arrangement type options (with auto-template component responsibility)
  - 17 component responsibility fields (each selectable: hlc/agency/client/not_applicable/not_decided)
  - Schedule, equipment, commercial fields
  - ArrangementSummaryCard for viewing/editing/cancelling existing arrangements
  - EarthworkArrangementCell component rendered in Work Demand for `"earthwork_arrangement_required"` rows

- `client/src/pages/WorkDemand.tsx` — adds branch for `"earthwork_arrangement_required"` status before the `mapping_required` check; imports `EarthworkArrangementCell`.

## Tests (tests/earthworkArrangement.test.ts)

38 tests, all passing. Covers:
- A: isEarthworkBoqItem classification
- B: canonical display name mapping
- C: isEarthworkBulkRequirement flag propagation
- D: earthwork_arrangement_required fires correctly
- E: mapping_required fires for non-earthwork unresolved rows
- F: GSB/WMM not classified as earthwork
- G: foundation/trench not classified as earthwork
- H: fly ash not classified as earthwork
- I: normal coverage logic when earthwork item has mapped materialId
- J: v1 backward compat (opts omitted)

## Key constraint preserved

- Total 627/627 tests pass.
- UOM conversion logic (021) untouched.
- GSB/WMM remain canonical materials.
