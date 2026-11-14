# FUND-PLAN-02 — continuation

## 1. Bar alignment

Apply now checks that every proposed update returns a saved row. Missing bars, missing quantities, database
errors and empty update results are reported with a reason and written to the audit log. A failed row does not
block the other rows. If the scope changes after review, the whole Apply is refused with “Scope changed since
preview — open the review again.”

The two notices are separate: bars to update have a Review and update button; outside-scope bars are listed for
removal in the programme. After Apply, the page shows the number updated and each row that was not updated.

The development copy was not changed. Tests use a fixture with the first-front bars omitted and remaining
half-quantity bars #953–#955 at 1.6–3.2 km. A successful Apply moves them to 1.9–2.9 km and restores quantities
27.33, 5.77 and 3.93. Bar #956 stays outside the scope. A second fixture makes the #954 update return no row:
#953 and #955 still update, and #954 is reported with its reason.

## 2. Fund planner

Work is grouped by reach and type. On the read-only project 2 rows:

- Reach 1: item 17 WMM under Base; items 18–22 (prime coat, tack coat, DGBM, tack coat, BC) under Bituminous.
- Reach 3: items 14–16 under Earthwork; item 17 under Base; items 18–22 under Bituminous; items 23–28 under
  CD / structures; items 29–36 under Road furniture.

Each reach has All, None and group-specific selection controls; group controls toggle only that group in that
reach. Jump buttons navigate to the available reach blocks and CD / structures or Road furniture blocks.
Per-reach subtotals roll up to the grand total. “Already done” is read-only from Work value; an older saved
snapshot is shown only as historical information. Inputs retain focus and scroll position while editing.

## 3. Access

Added a separate `fund_planner` view/edit permission under Work programme, described as “Bill value, material
cost and margin planning.” It is off for all existing roles by default; only Owners get access by default.
Broad Work programme access does not grant Fund planner access. The tab and its APIs enforce the new view/edit
permission. No saved roles or user permissions were changed. `replit.md` now requires a separate permission
entry for future screens and tabs.

## Verification and safeguards

- Focused checks: 9 files / 40 tests passed; the permission-catalog checks also passed (2 files / 7 tests).
- Full suite: 470 files; 464 passed, 2 skipped, 4 failed. The 6 failures are the known older failures:
  `arrangementProcurementCorrection` (1), `materialReceiptReversal06mD` (1),
  `purchase-indent-pi01` (1), and `unscheduledReportCredit` (3). No Fund planner or Apply tests failed.
- Updated the permission-catalog test from 28 to 29 features for the new permission.
- `npm run build` passed.
- No schema or database data changed. No production database was queried. Nothing was published.
