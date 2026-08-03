---
name: Arrangement Demand Exclusion
description: How approved execution arrangements reduce HLC equipment/labour/diesel/material demand (Instruction 025)
---

# Arrangement-driven HLC demand exclusion (Instruction 025)

The rule: only arrangements in statuses approved / mobilisation_pending / in_progress / on_hold affect demand (`DEMAND_AFFECTING_ARRANGEMENT_STATUSES` in shared/planningEngine.ts). Draft/submitted/returned/rejected/cancelled never do.

**Architecture:** everything flows through `calculateBomDemand(items, bars, months, { arrangements })` — never add a parallel calculation. `buildArrangementEffects()` splits arrangements into per-BOQ-item slices (from `boqItemAllocations` or `boqItemId`+`allocatedQty`), caps total at the item quantity (overlap → `arrangementOverlaps` warning, slices scaled proportionally). Per-component responsibility (`components` JSONB: hlc/agency/client/not_applicable/not_decided) drives exclusion via `hlcRetainedFraction()`.

**Key semantics:**
- `not_decided` ALWAYS retains demand (provisional, never silently outsourced).
- Diesel follows the consuming equipment, EXCEPT diesel_fuel=hlc or dieselResponsibility=hlc → HLC keeps fuel demand even for agency equipment.
- General labour (no component mapping) drops only when the entire execution chain (excavation/loading/transport/spreading/watering/compaction) is non-HLC.
- Equipment mapping: purpose beats machine type — check /spread|grading/ BEFORE /dozer/ ("Dozer for spreading" is spreading plant).
- Earthwork material rows keep physical totalQty; the split goes in `arrangementOutsourcedQty`/`arrangementHlcQty`. Equipment/labour/diesel are actually reduced (totals + monthly, same fraction).
- Exclusion uses ALLOCATED qty, not allocated−completed — progress linkage deemed unreliable (documented limitation, §4).

**Consumers:** server shortage-check passes project arrangements into the engine; `/bom` returns `earthworkArrangements` so the CLIENT demand calc (WorkDemand `demand` useMemo) applies them too. Plan-vs-Actual and SiteEntry DPR paths deliberately do NOT pass arrangements — planned totals there must stay physical.

**Why:** commercial correctness — outsourced quantity must not generate HLC procurement/diesel/equipment demand while physical BOQ quantity stays visible.

**How to apply:** any new demand consumer must decide explicitly whether it wants HLC demand (pass arrangements) or physical demand (don't). Tests: tests/arrangementDemandExclusion.test.ts (scenarios A–J, real engine).
