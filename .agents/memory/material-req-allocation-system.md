---
name: Material Requirement Allocation System
description: Schema, storage, and API for the material_requirements + material_requirement_allocations system (Instruction 016)
---

## Core design

- `material_requirements` — central demand record created from Work Programme shortage screen before raising IRN/PI.
- `material_requirement_allocations` — separate table for each internal (IRN) or procurement (PI) portion; allows split fulfilment.

## Key rules

- **Allocation required for requirement-linked PI/IRN**: when `requirementId` is set on a PI or IRN, `allocationId` MUST also be provided. Validated in `createPurchaseIndent` and `createInternalRequisition`.
- **PI** must use `allocationType: "procurement"`; **IRN** must use `allocationType: "internal"`. Wrong type is rejected.
- **Allocation must be in `authorized` status and not yet linked** when PI/IRN is created. Becomes `linked` after document creation.
- **Single-item constraint**: requirement-linked PI/IRN must have exactly one item.

## Quantity semantics (clear field meanings)

- `internallyAllocatedQty`: qty linked to authorized internal (IRN) allocations
- `internallyIssuedQty`: qty actually issued/transferred (updated after issue)
- `procurementRequestedQty`: qty linked to authorized procurement (PI) allocations
- `orderedQty`: qty actually ordered by purchaser (updated after purchaser action)
- `receivedQty`: qty physically received (wired in a later receipt batch)
- `unallocatedBalanceQty`: max(0, requiredQty - internallyAllocatedQty - procurementRequestedQty)
- `physicallyUnfulfilledQty`: max(0, requiredQty - internallyIssuedQty - receivedQty)

## Idempotency

- `clientRequestId` unique index on `material_requirements` (partial: WHERE NOT NULL).
- `createMaterialRequirement` returns existing row if `clientRequestId` matches.

## Material identity

- `materialType`: "plant_material" (uses `materialId`) or "store_item" (uses `storeItemId`)
- Exactly one identity must be set. Both null or both set is rejected at API level.
- `materialId` is required for plant_material; `storeItemId` for store_item.
- If materialId cannot be resolved from shortage row, requirement creation is blocked with clear error.

## Destination

- `destinationType`: "store" | "hmp" | "rmc" | "site"
- "site" → `destinationSiteId` required
- "hmp"/"rmc" → `destinationPlantId` required (FK to plant_settings)
- "store" → both site and plant IDs must be null

## Commitment hooks (narrow, additive)

- `storesVerifyIrn`: updates allocation.committedQty for issued items; throws RECONCILIATION_REQUIRED on sync failure.
- `submitPurchaserAction` (ordered path only): updates requirement.orderedQty + allocation.committedQty; throws RECONCILIATION_REQUIRED on failure.

## computeRequirementStatus

- Single shared function in `shared/planningEngine.ts`; do NOT derive status independently elsewhere.
- Called inside `_refreshRequirementDerivedQty` in storage.

## Auto-create allocation from WorkDemand

- POST /api/material-requirements accepts `withAllocation: "internal"|"procurement"` + `allocationQty` to create allocation inline.
- Returns `{ ...requirement, allocation: { id, ... } }` so client has both requirementId + allocationId.

## WorkDemand confirmation dialog

- Before creating requirement, shows confirmation dialog: material/qty/UOM + destination selector.
- Blocks submission if materialId is null (unresolved in master).
- FAIL FAST on error — no fallback navigation, shows toast, stays on Work Demand.

## Existing code that must NOT be touched (per instruction)

recordDelivery, derivePiStatus, checkAndCompleteIndent, createDraftGrnFromPi, Store GRN finalisation, Admin override flow, PI-linked GRN skip-search logic, cancelStoreGrn, general manual multi-item PI/IRN creation.
