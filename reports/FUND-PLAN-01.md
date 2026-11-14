# FUND-PLAN-01 — Fund planner

## What changed

- Added an Owner-controlled Fund planner beside Work value in Work Programme.
- Plans can be saved, reopened, copied as a new plan, and deleted. Plan edits and their reason are recorded in `audit_logs`.
- A plan stores its selected work, quantities, optional stretch lengths, supplier prices, other costs, margin, and any plan-only recipe values. It does not update the BOQ, shared recipes, stock, bills, or payments.
- The planner shows cost, supplier comparison, other costs, margin, and money to arrange. If supplier prices are missing, it says “Enter prices” instead of showing a misleading zero.
- Added the optional water-added-per-part value for emulsion recipe rows. Neat emulsion is calculated as diluted spray demand divided by `1 + water added per part`; zero preserves the prior demand. Automatic recipe saves retain the saved ratio.

## Development schema and data

The additive migration was applied to the two development databases only: `sitelog_dev` and the publishing-facing development database `heliumdb`. No production database was queried or changed.

The only schema additions are:

- `boq_item_materials.water_added_per_part REAL NULL DEFAULT 0`
- `fund_plans`, with project/name/JSON plan data, optional creator, timestamps, and project/update-time indexes.

Read-only checks after implementation found zero saved plans and zero nonzero water ratios in `sitelog_dev`; the new table in `heliumdb` also has zero rows. No existing recipe, bill, stock, BOQ, or other record was changed.

## Project 2 check

Read-only calculations used the current `sitelog_dev` project “UPGRADATION FROM ALLADURG PWD ROAD TO PAMPAD.” The working-reach denominator is 2.9 km; Reach 1 is 1.6 km. Its 6,000 sqm Prime Coat, 6,000 sqm Tack Coat 1, and 300 cum DGBM produce a planned bill of **₹44,99,946** (about **₹45.00 lakh**). A 30 m WMM stretch in Reach 1 receives **16.875 cum** from the reach allocation.

- DGBM template 9 uses 2.3 MT/cum density and 98% rolling, giving 2.254 MT/cum compacted. The 300 cum plan needs about **28.7385 MT binder** and **647.4615 MT aggregate/dust**.
- Prime and Tack Coat 1 need **5.25 MT emulsion** combined.
- The saved template uses 6.0 L LDO/MT, which gives **4,057.2 L**. The requested **4,226.25 L** uses a plan-only 6.25 L/MT value; the shared recipe was not changed.
- The existing spray rates have water ratio zero. With zero, the new formula divides by one, so demand is unchanged; the tests check equality with the prior calculation. A fixture with water ratio 1 halves neat-emulsion demand.

## Verification

- Fund planner, route, and component tests: **4 passed**. DPR correction compatibility tests: **21 passed**.
- Full suite: **5,769 passed, 6 failed, 3 skipped** across **468 test files**. All six failures are in previously known failing files: `arrangementProcurementCorrection.test.ts` (1 old text assertion), `materialReceiptReversal06mD.test.ts` (1 unit conversion requiring density), `purchase-indent-pi01.test.ts` (1 unit conversion requiring density), and `unscheduledReportCredit.test.ts` (3 legacy progress-credit expectations). The previously failing `dpr314Correction.test.ts` now passes after allowing the unchanged rework flag in its correction payload.
- `npm run build`: passed.
- The development app restarted and reported read-only startup readiness. The screenshot browser was unauthenticated, so it only showed the authentication loading screen; the signed-in planner UI was verified by component and route tests, not by that screenshot.

No publish was performed.
