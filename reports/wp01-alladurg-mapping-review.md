# WP-01 Batch 1 — ALLADURG SNL Mapping Review

**Project:** ALLADURG (BOQ project ID 2)  
**Scope:** Culvert cluster, BOQ IDs 23–28  
**Mode:** Read-only review against the expanded MoRTH library  
**Matcher thresholds changed:** No  
**Mappings/recipes applied:** None

## Expanded MoRTH pipe references

The library now models these evidence-backed workbook variants as distinct identities:

| MoRTH item | Arrangement | Diameter/class | Material identity |
|---|---|---|---|
| 9.2 | Single row | 1000mm NP4 | M-149 |
| 9.2 | Single row | 1200mm NP4 | M-150 |
| 9.2 | Single row | 300mm NP4 | M-151 |
| 9.3 | Double row | 1000mm NP4 | M-149 |
| 9.3 | Double row | 1200mm NP4 | M-150 |

The existing 600mm NP3 item remains unchanged. The 9.3 rows were added because the official workbook explicitly contains both double-row variants; no unsupported 9.3/300mm variant was invented.

## Mapping review

| BOQ ID | BOQ work | Current mapping | Review recommendation | Proposed result |
|---:|---|---|---|---|
| 23 | Structure foundation excavation | 12.1 — Excavation for Structures | Compatible sector, unit, and work context | Keep current mapping |
| 24 | Sand filling in foundation trenches | 12.3 — Sand Filling in Foundation Trenches, auto confidence 0.70998794 | Compatible sector, unit, and work context; score remains above the existing 0.70 floor | Keep/confirm current mapping |
| 25 | PCC 1:3:6 | 6.01 — PCC M10 / 1:3:6 | Compatible nominal mix and unit | Keep current mapping |
| 26 | M15 concrete for foundations | 2.4 — M15/M20, ROAD sector, unknown unit | Sector/context incompatible despite grade text | Reject current mapping; leave for exact structure-sector M15 review |
| 27 | PCC M15 for substructure | 6.01 — PCC M10 / 1:3:6 | Grade incompatible: BOQ M15 versus SNL M10 | Reject current mapping; leave for exact M15 review |
| 28 | 1000mm NP4 RCC Hume pipe, HP Culvert 1V | Composite `needs_review`; false RCC/M25 component plus 600mm NP3 suggestion | RCC names the pipe product, not a separate concrete component. Diameter, NP class, and 1V/single-row context select exactly one candidate. | Propose `9.2-NP4-1000`, single row, M-149, rule confidence 0.82 |

## Item 28 deterministic preview

- Composite detection result: **not composite**.
- Exact pipe identity: **1000mm + NP4**.
- Section context: **1V**, treated as the single-row 9.2 variant.
- Selected SNL identity: **`9.2-NP4-1000` / M-149**.
- Existing deterministic rule confidence: **0.82**.
- 600mm NP3 and 9.3 double-row candidates are rejected by identity/context vetoes.
- No recipe rows were written during this review.

## Checkpoint

No ALLADURG mapping, mapping-status, recipe, classification, or programme-bar record was changed. Approval is required before applying the recommendations for IDs 26–28 or the classification corrections reported separately.