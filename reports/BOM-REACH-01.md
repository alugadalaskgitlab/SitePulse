# BOM-REACH-01 — Reach material balance

## What changed

The Materials tab now has **Balance work — materials by reach** below the existing compacted-and-loose table. It uses the Work value tab's per-item, per-reach balance rows, then the existing BOM recipes. It shows work left, compacted volume, mix and component MT, loose volume/CFT where the relevant profile exists, and monthly amounts split into overdue, programme months, and not scheduled. Fixed items appear under **Not tied to a reach**; no-scope rows are excluded.

The Procurement tab has the shorter labels requested. UOM setup opens the exact material in the existing Material Master editor, with Advanced conversions open and a **Back to Procurement** link. Tab selection is kept in the URL, and Back closes an open BOM & Demand dialog first.

## Alladurg — current `sitelog_dev`

The confirmed working reaches are Reach 1 (0+000–1+600) and Reach 3 (1+900–2+900); 1+600–1+900 is confirmed no-scope. Figures below use saved recipes and current Work value balances. MT and loose quantities are rounded for display.

| Balance material | Reach 1 | Reach 3 |
|---|---:|---:|
| Shoulder soil | 0 cum compacted / 0 cum loose | 450 cum compacted / 540 cum loose |
| WMM | 210 cum / 463.05 MT / 241.5 cum loose | 562.5 cum / 1,240.31 MT / 646.88 cum loose |
| Emulsion — primer and both tack coats | 6.30 MT | 3.94 MT |
| DGBM mix | 300 cum / 676.20 MT | 187.5 cum / 422.63 MT |
| BC mix | 180 cum / 423.00 MT | 112.5 cum / 264.38 MT |
| VG-30 binder — DGBM and BC combined | 51.99 MT | 32.50 MT |

Reach 1 shoulders differ from the supplied estimate because current submitted billable progress is 915 cum against a 720-cum reach share, leaving no balance. Reach 1 WMM differs because current eligible billable progress is 690 cum against a 900-cum share, leaving 210 cum. Reach 3 shoulder, WMM, DGBM, and BC figures match the supplied estimates after rounding. No recipe or record was changed. The fixed 500-cum embankment remains in **Not tied to a reach**.

Work value excludes incidental progress from balance; the 67.5-cum incidental WMM entry therefore does not reduce WMM balance.

Confirmed identical before and after: Material Demand by Month totals, the compacted-and-loose table, Procurement To buy, and company stock figures. The Procurement wording and display were updated; its existing quantity and stock sources remain the same.

## Verification and safety

- Focused tests: **38 passed across 5 files**, including reach balance/month buckets, compacted-and-loose, Work value, Procurement calculations, and navigation.
- `npm run build`: **passed** (existing Browserslist and large-chunk warnings).
- Full suite: **455 files passed, 5 failed, 2 skipped; 5,748 tests passed, 7 failed, 3 skipped**. The seven failures were existing failures in `arrangementProcurementCorrection.test.ts`, `dpr314Correction.test.ts`, `materialReceiptReversal06mD.test.ts`, `purchase-indent-pi01.test.ts`, and three cases in `unscheduledReportCredit.test.ts`. No BOM-REACH-01 test failed; `vendorBillVb15Server.test.ts` passed.
- The page screenshot attempt received **401 Unauthorized** because this route requires sign-in. No authentication bypass was used; component tests cover the new UI.
- Development database checks used read-only queries and confirmed `current_database() = sitelog_dev`. No production or replica access, data writes, or schema changes.
- No publish was performed.
