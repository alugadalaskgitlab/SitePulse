# BOM-REACH-03 — fixed quantities in bar preview

## Preview comparison

Read-only comparison on `sitelog_dev`, project 2 (ALLADURG). No Apply action was used. Previous preview results were reproduced from the prior committed calculation using the same development rows.

| Bar | Item | Previous preview | New preview | Proposed chainage |
|---:|---|---:|---:|---|
| 932 | Embankment | 500 | 500 | 1+900–2+900 |
| 937 | DGBM — linear control | 187.5 | 187.5 | 1+900–2+900 |
| 940–947 | Furniture / safety | 3, 17, 1, 4, 4, 56, 6, 9 | 3, 17, 1, 4, 4, 56, 6, 9 | 1+900–2+900 |
| 948–952 | Culvert items in Reach 1 | Suggest remove | Suggest remove | unchanged |
| 953 | Excavation | 27.33 | 27.33 | 1+900–2+900 |
| 954 | Sand filling | 5.77 | 5.77 | 1+900–2+900 |
| 955 | PCC 1:3:6 | 3.93 | 3.93 | 1+900–2+900 |
| 956 | M15 concrete | 17.78 | 17.78 | 1+900–2+900 |
| 957 | RCC pipe | 7.5 | 7.5 | 1+900–2+900 |
| 959 | PCC M15 mix | 14.32 | 14.32 | 1+900–2+900 |

The live-like example of #932 changing from 384.6 to 192.3 did not reproduce in sitelog_dev: its previous and new previews both propose the fixed BOQ quantity 500. Development scope is Reach 1 (0+000–1+600), a no-scope gap (1+600–1+900), and Reach 3 (1+900–2+900); the older Reach 3 ending at 3+200 is superseded. In this copy, #932 has one bar in its fixed Reach 3 allocation.

The live scope described in the instruction also includes furniture and safety in both Reach 1 and Reach 3, while CD Works applies only to Reach 3. Applying those rules to the sitelog_dev bar set (not querying production), each #940–#947 item has one surviving bar, so the preview assigns its full BOQ quantity to that bar. Multiple surviving bars now split the fixed allocation by their trimmed lengths. The #937 linear DGBM value stays 187.5; the new regression test checks this exact snapshot.

## Changes and verification

- Fixed-item preview and Apply quantities now use the shared working-reach allocation. A single surviving bar gets the full allocation; multiple bars split it by trimmed length. Whole-count units use largest-remainder integer allocation; other units round to two decimals and the final bar absorbs rounding.
- Existing chainage trimming and “Suggest remove” behavior are unchanged. A fixed item with no surviving bar gets an informational “add a bar” row; no bar is created automatically.
- Focused scope/alignment tests: 12 passed. Full suite: 7 failed, 5,764 passed, 3 skipped (465 files). The seven failures are the known failures in `arrangementProcurementCorrection.test.ts` (1), `dpr314Correction.test.ts` (1), `materialReceiptReversal06mD.test.ts` (1), `purchase-indent-pi01.test.ts` (1), and `unscheduledReportCredit.test.ts` (3). No new failing file appeared.
- `npm run build`: passed. No schema change, Apply, or production access.

## Test-data safety note

The completed full-suite run used a disposable PostgreSQL database loaded with development schema only. An earlier full-suite attempt timed out before all database URLs were isolated; a read-only marker check found no test rows left in `sitelog_dev`, but the rolled-back fixtures may have advanced sequence counters. I did not reset any sequence.
