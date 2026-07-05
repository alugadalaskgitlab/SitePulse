---
name: Equipment master purpose-blind unit gaps
description: planning_equipment_types.standard_outputs is often missing valid units the SDB (snl_item_equipment) actually prices equipment in, causing that equipment to be silently excluded from Gantt auto-duration/bottleneck calc.
---

## The rule
`snl_item_equipment` (SDB norms) stores per-item, **purpose-scoped** equipment norms (e.g. Tipper for "disposal" vs "haul") and can define a norm in units (SQM, HECTARE) that the generic `planning_equipment_types.standard_outputs` master never learned, because the master has no concept of "purpose" — it's just one JSON array of {unit, outputPerHr} per equipment name.

`getEffectiveOutputPerHr` / `calculateAutoDurationFull` (shared/planningEngine.ts) only match on unit against `standardOutputs`; if an equipment's master entry lacks the BOQ item's unit, that equipment silently contributes 0 and drops out of the bottleneck calculation — even though a valid, item-specific `qty_per_boq_unit` may already be sitting correctly on that item's `boq_item_equipment` row (a totally separate field/pathway used for BOM/recipe display, not duration).

**Why:** Confirmed concretely for Tipper: SDB item "Clearing & grubbing" (SQM unit, mechanical means, code 2.01) defines a real disposal-purpose Tipper norm (~1150-1500 SQM/hr per truck), but `planning_equipment_types` Tipper master only had a CUM output — so any Ha./SQM-based item with a Tipper in its recipe got it silently dropped from Gantt duration calc.

**How to apply:** When investigating "wrong/zero auto-duration" or "equipment dropped from bottleneck" complaints, check (a) does the BOQ item's unit have a matching entry in that equipment's `planning_equipment_types.standard_outputs`, and (b) does the *actual* SDB norm for that item+purpose support the missing unit (query `snl_item_equipment` for the matching `snl_items` row) before inventing a number. Also verify the SDB variant actually matches the BOQ item's unit — e.g. clearing/grubbing has both a SQM (mechanical-means, disposal-via-Tipper) SDB variant and a separate HECTARE variant (Dozer-with-attachment + Tractor-trolley, no Tipper at all); don't cross-apply norms between unit variants. Don't fabricate outputs for equipment/units the SDB doesn't actually price — flag it as a recipe mismatch instead (e.g. an item using "Hydraulic Excavator" when the real SDB norm for that unit-variant calls for a Dozer).
