---
name: Generalised Execution Arrangement Categories (earthwork + bituminous)
description: How the category registry, bituminous classifier, demand exclusion, and API guards work after Instruction 028
---

## Registry is the single vocabulary source
`shared/executionArrangementCategories.ts` owns per-category component keys, arrangement types, default templates, resource→component regex mappings, fuel-component mapping, and significant components. UI, engine, and routes all consume it — never hardcode component lists elsewhere.

**Why:** earthwork keys were previously hardcoded in executionState/planningEngine; adding bituminous by copy-paste would have forked the vocabulary.

## Key semantics (apply everywhere)
- Responsibilities `agency`/`client`/`not_applicable` exclude company demand; `hlc`/`main_contractor`/`shared`/`not_decided` retain it.
- **Unmapped resources are never excluded** — if a bituminous recipe resource matches no component regex, its demand is retained and a `DEMAND_COMPONENT_MAPPING_MISSING` warning (`mappingWarnings` on BomResult, exposed on shortage-check) is emitted instead. No silent false certainty.
- Earthwork slices keep the legacy exclusion engine untouched; registry mapping applies only to bituminous slices (`workCategory` on the arrangement row, null = earthwork).

## Classifier traps
- Prime/tack coat descriptions mention WMM/GSB as the *receiving surface* — the GSB/WMM veto in `isBituminousBoqItem` must be bypassed when a spray-coat phrase is present (already handled).
- Bare "BC"/"BM" require pavement context; PCC/RCC/cement-concrete are hard vetoes.
- Manual override `bulkMaterialClassification` (bituminous / not_bituminous / review_required, PATCH bulk-classification endpoint + UI in BarArrangementPanel) always beats keyword detection.

## API guards that must stay symmetric
- POST and PATCH on arrangements both enforce: type-valid-for-category, component-key vocabulary, shared-split percentage (SHARED_SPLIT_REQUIRED — never assume 50:50), and workCategory immutability on PATCH.
- POST enforces CATEGORY_ITEM_MISMATCH: bituminous arrangements only on items resolving to bituminous; earthwork arrangements rejected on bituminous items.

## Pre-existing bug fixed en route
`getArrangementProgress` filtered `dprs.status`, a column that never existed — dprs uses `is_superseded`/`is_deleted`/`is_cancelled`. Any future DPR aggregate SQL must use those flags.

## Execution state names
`deriveExecutionState` states are `hlc_inhouse`, `outsourcing_proposed`, `outsourcing_approved`, `partly_outsourced`, `client_supplied`, `on_hold`, `arrangement_required` — not "inhouse_confirmed"/"outsourced_committed".
