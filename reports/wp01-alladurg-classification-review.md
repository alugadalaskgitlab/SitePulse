# WP-01 Batch 1 — ALLADURG Classification Review

**Project:** ALLADURG (BOQ project ID 2)  
**Mode:** Read-only review  
**Data changes applied:** None

## Summary

- 24 BOQ items reviewed.
- Items 13–22 remain confident linear road work.
- Items 23–28 are confident structure/location-scheduled work.
- Items 29–36 are discrete road assets / road furniture, not culvert or structure work.
- Existing `planning_work_type=structure` is incorrect for items 29–34.
- Existing programme bars were inspected only; none were changed.
- Bill-number, source-row, and category-order backfill is still blocked because the original ALLADURG workbook is not present. No Bill number or Excel row has been guessed.

## Item-by-item review

| BOQ ID | Source item | Section | Current | Recommended context | Recommended stored type | Canonical work type | Review result |
|---:|---:|---|---|---|---|---|---|
| 13 | 1 | Road Works | road | Linear road | road | Clearing & grubbing | Keep |
| 14 | 2 | Road Works | road | Linear road | road | Dismantling/scarifying | Keep |
| 15 | 3 | Road Works | road | Linear road | road | Earthwork | Keep |
| 16 | 4 | Road Works | road | Linear road | road | Earthwork/shoulder | Keep |
| 17 | 5 | Road Works | road | Linear road | road | WMM | Keep |
| 18 | 6 | Road Works | road | Linear road | road | Prime coat | Keep |
| 19 | 7 | Road Works | road | Linear road | road | Tack coat | Keep |
| 20 | 8 | Road Works | road | Linear road | road | Bituminous base | Keep |
| 21 | 9 | Road Works | road | Linear road | road | Tack coat | Keep |
| 22 | 10 | Road Works | road | Linear road | road | Bituminous wearing course | Keep |
| 23 | 1 | HP Culvert 1V, 1000mm NP4 | structure | Structure/location | structure | Structure excavation | Keep |
| 24 | 2 | HP Culvert 1V, 1000mm NP4 | structure | Structure/location | structure | Structure excavation/foundation fill context | Keep |
| 25 | 3 | HP Culvert 1V, 1000mm NP4 | structure | Structure/location | structure | PCC | Keep |
| 26 | 4 | HP Culvert 1V, 1000mm NP4 | structure | Structure/location | structure | PCC/concrete | Keep |
| 27 | 5 | HP Culvert 1V, 1000mm NP4 | structure | Structure/location | structure | PCC | Keep |
| 28 | 6 | HP Culvert 1V, 1000mm NP4 | structure | Structure/location | structure | Pipe culvert | Keep |
| 29 | 1 | Road Furniture | structure | Discrete road asset | road | KM stone | Correct to road |
| 30 | 1 | Road Furniture | structure | Discrete road asset | road | HM/KM stone | Correct to road |
| 31 | 2 | Road Furniture | structure | Discrete road asset | road | Information/name board | Correct to road |
| 32 | 3 | Road Furniture | structure | Discrete road asset | road | Direction/place sign | Correct to road |
| 33 | 4 | Road Furniture | structure | Discrete road asset | road | Traffic sign | Correct to road |
| 34 | 1 | Road Safety Interventions | structure | Discrete road asset | road | Reflective studs | Correct to road |
| 35 | 2 | Road Safety Interventions | road | Discrete road asset | road | Thermoplastic marking | Keep |
| 36 | 4 | Road Safety Interventions | road | Discrete road asset | road | Rumble strips | Keep |

## Existing programme impact review

| BOQ IDs | Existing bars | Evidence links | Review |
|---|---:|---:|---|
| 13–22 | 2 each (Reach 1 and Reach 3) | 0 | Reusable; no reset proposed |
| 23–28 | 0 | 0 | Missing structure/location schedule; do not auto-spread to road reaches |
| 29–31 | 0 | 0 | Missing discrete road-asset placement; not a structure schedule |
| 32–36 | 2 each (Reach 1 and Reach 3) | 0 | Incorrect reach-split bars; safe to reset only after approval |

## Checkpoint

No classification fields, mapping records, BOQ source metadata, or programme bars were changed. Approval is required before applying any recommended ALLADURG corrections.