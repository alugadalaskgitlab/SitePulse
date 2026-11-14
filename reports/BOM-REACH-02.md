# BOM-REACH-02 — scope-driven BOM and reach reports

## Scope and fixed items

Checked development database `sitelog_dev`, project 2 (ALLADURG). The confirmed scope is Reach 1, 0+000–1+600, a no-scope gap from 1+600–1+900, and Reach 3, 1+900–2+900. The older superseded Reach 3 ending at 3+200 is ignored. The BOQ corridor is 2.9 km; confirmed working length is 2.6 km.

The shared allocator now assigns fixed quantities to an explicit reach, or to the only applicable confirmed reach; items applying to multiple reaches remain one “Whole road” row. Of the 15 fixed items in this project, all land in Reach 3; none land in Reach 1 or Whole road. They are the embankment, the six structure/culvert items (excavation, sand fill, PCC 1:3:6, M15 concrete, PCC M15 mix and RCC pipe), and the structure and road-furniture entries measured in Nos, RM or sqm. No fixed-quantity overrides were saved.

## Material demand before and after scope allocation

Quantities come from the item’s allocated scope, not bar quantities. Bars only set timing; their overlap and actual calendar days distribute the scope quantity by month. Quantities without an overlapping bar are shown as “Not scheduled.” Material names below are the resolved demand rows from the current development templates and saved recipes. No recipes were edited.

| Material | Before | Scope-based | Change and reason |
|---|---:|---:|---|
| WMM Material | 1,631.25 cum | 1,462.50 cum | Reduced for the 0.3 km no-scope portion |
| Earth / Borrow Soil | 500 cum | 500 cum | Unchanged; fixed quantity remains in Reach 3 |
| Shoulder Earth / Soil | 1,305 cum | 1,170 cum | Reduced for the no-scope portion |
| Bitumen VG-30 | 94.2563 MT | 84.5057 MT | Reduced with the scoped bituminous quantity |
| Bitumen Emulsion SS-1 | 11.4188 MT | 10.2375 MT | Reduced with the scoped spray-coat quantity |
| Stone Dust | 490.5713 MT | 439.8225 MT | Reduced with the scoped mix quantity |
| 6mm Aggregate | 409.9603 MT | 367.5506 MT | Reduced with the scoped mix quantity |
| 10mm Aggregate | 575.4056 MT | 517.5412 MT | Reduced with the scoped mix quantity |
| 20mm Aggregate | 462.5525 MT | 417.2259 MT | Reduced with the scoped mix quantity |
| Sand | 22.47 MT | 22.47 MT | Unchanged; fixed structure quantity is in Reach 3 |
| Cement | 10.272 MT | 10.272 MT | Unchanged; fixed structure quantity is in Reach 3 |
| LDO / Process Fuel | 11,953.8 L | 10,717.2 L | Reduced with the scoped plant-mix quantity |
| Diesel / HSD | 2,998.5565 L | 2,714.4930 L | Reduced with the scoped resource demand |
| RCC Hume Pipe (NP4) 1000mm dia | 7.5 RM | 7.5 RM | Unchanged; fixed structure quantity is in Reach 3 |

## Balance by reach

Current remaining work quantities from submitted eligible DPRs:

| Reach | Material | Balance |
|---|---|---:|
| Reach 1 | Bitumen Emulsion SS-1 | 6.3 MT |
| Reach 1 | Diesel / HSD | 171.1286 L |
| Reach 3 | Bitumen Emulsion SS-1 | 3.9375 MT |
| Reach 3 | Diesel / HSD | 1,122.6874 L |
| Reach 3 | Earth / Borrow Soil | 500 cum |
| Reach 3 | RCC Hume Pipe (NP4) 1000mm dia | 7.5 RM |
| Reach 3 | Shoulder Earth / Soil | 450 cum |

## Work Programme alignment preview

The preview proposes 24 bar updates, marks 6 bars “Suggest remove,” and finds 9 already aligned; none are blocked. It changes no data until an Owner reviews and confirms Apply. Apply updates only chainage and planned quantity, preserves dates, progress links and notes, and records one audit entry per changed bar.

The corridor ends at 2+900. These saved bars extend to 3+200 and remain unchanged for the Owner to review:

- Bars 930–939, Reach 3 items 1–10: clearing, scarifying, embankment, shoulders, WMM, primer, two tack coats, DGBM and BC.
- Bars 953–957 and 959, items 1–6: excavation, sand fill, PCC 1:3:6, M15 concrete, PCC M15 mix and RCC pipe.
- Bars 940–941: the two reinforced-concrete M15 rows; bars 942–944: sign and direction-sign items; bars 945–947: road studs and painting items.
- The first group and bars 940–947 run from 1+900 to 3+200. Bars 953–957 and 959 run from 1+600 to 3+200.

## Work value and screen changes

Work value now groups items by Reach 1, Reach 3, Whole road, then each no-scope item. Each group has an amount subtotal and the table ends with a grand total. The existing API values are unchanged: bill estimate within BOQ ₹32,10,001.80; value balance ₹1,57,46,250.68; BOQ not needed in no-scope portions ₹21,09,848.40. Group subtotals use those same rows and rates.

The Materials tab order is Material Demand by Month, Compacted and loose material demand, then Balance work — materials by reach. The month table starts at the current month, places earlier demand under “Overdue,” and expands to short BOQ item names. Compacted-and-loose rows show “MT per cum” when configured and “—” otherwise. Plan vs Actual uses the four requested material columns, short names, expandable contributors, existing calculations, and “—” when actuals are unavailable. Work Done remains unchanged.

The quantity-driven Equipment and Labour totals also respond to the scoped item quantities: equipment is 605.38 hours before and 548.20 hours after; labour is 261.85 days before and 244.01 days after. Saved resource rates and recipes did not change.

| Work value group | Scope amount | Done amount | Balance amount |
|---|---:|---:|---:|
| Reach 1 | ₹1,12,52,524.80 | ₹32,01,275.40 | ₹81,29,134.20 |
| Reach 3 | ₹76,26,812.48 | ₹8,726.40 | ₹76,17,116.48 |
| Whole road | ₹0.00 | ₹0.00 | ₹0.00 |
| No-scope portion | ₹21,09,848.40 | — | ₹21,09,848.40 |
| Grand total | ₹2,09,89,185.68 | ₹32,10,001.80 | ₹1,78,56,099.08 |

The Work value totals are unchanged by the presentation/grouping change; the tests verify that group subtotals sum to the grand total.

## Verification

- Focused tests: 7 files, 25 tests passed.
- Full suite: 458 passed, 7 failed, 3 skipped (465 files; 5 failing files). Failures remain in `arrangementProcurementCorrection.test.ts`, `dpr314Correction.test.ts`, `materialReceiptReversal06mD.test.ts`, `purchase-indent-pi01.test.ts` and `unscheduledReportCredit.test.ts` (3 tests). No scope allocator, Work Programme alignment, Materials-tab or Work Value tests failed. The arrangement test’s source-text expectation is also absent at the baseline commit.
- `npm run build`: passed.
- No schema changes or database writes were made. The Owner Apply action was not used; production was not accessed or published.
