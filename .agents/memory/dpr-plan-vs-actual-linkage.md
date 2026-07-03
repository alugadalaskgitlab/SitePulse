---
name: DPR Plan vs Actual linkage (Phase 3)
description: How planned vs actual comparison for equipment/labour/materials was wired into DPR entry and BOM & Demand, including structure/reach grouping and productivity.
---

## What exists
- `equipmentLogs`, `labourLogs`, and `materialLogs` (in `shared/schema.ts`) all carry nullable `boqItemId` + `structureId` columns so a DPR usage/consumption row can optionally be tied back to a Work Programme BOQ item and, within that item, a specific structure/reach location (`work_program_bars.structureId` where `planningMode === "structure_location"`).
- SiteEntry.tsx (the live DPR form) exposes an optional "Link to Work Item" selector plus a "Structure / Reach (optional)" selector on equipment, labour, AND materials rows, with an inline "Planned: X" chip computed via `calculateBomDemand`/`getPlannedDemandForItem(boqItemId, structureId)` scoped to that item (+ structure override). Materials Consumed/Issued is a real, functional card on the DPR form (previously dead code with an always-empty `materials` array — it now has full CRUD, autosave draft restore, and submit filtering on non-empty `material`).
- WorkDemand.tsx (BOM & Demand page) "Plan vs Actual" tab aggregates, per BOQ item: equipment hours + km, labour days, and material quantities (planned via `calculateBomDemand`, actual via linked DPR rows), plus a **productivity metric** (actual progress qty completed — from the existing `/api/boq/projects/:id/plan-vs-actual` endpoint's `totalActual` — divided by actual equipment hours / labour days) and an expandable **structure/reach-level breakdown table** (equip hours/km, labour days, materials) built by cross-referencing each linked row's `structureId` against `programmeBars` (fetched from `/api/boq/projects/:id/programme`) for a human label.

## Key implementation notes
- Equipment KM has no planned baseline in the BOM engine (`BomEquipmentRow` only has `totalHours`) — the report only shows *actual* KM (from `totalKm`, itself derived from `numberOfTrips × tripDistance × 2` for trip-based entries or a direct value), with no variance badge for it.
- Structure/reach rows with no `structureId` linkage are grouped under an explicit "Not linked to a structure/reach" bucket rather than silently dropped, so users can see how much actual data still isn't attributed at that granularity.
- Material actual/planned matching is done by uppercase-trimmed material/component name, mirroring the same pattern already used for equipment (`machine`) and labour (`category`) breakdowns.
