# VB-LAYOUT-01 implementation verification

Engineering graduation of both approved attached bill-detail references; existing navigation, styling, bill engine and permissions retained.

## Implementation

- Reuses saved hire statements, frozen working sheets, saved daily evidence, existing bill financial totals, bill export buttons, detailed calendars and status/payment controls.
- Compact saved detail: bill header, permitted Previous Billing Summary, independently expandable equipment/month calendars, Monthly Billing Summary, financial breakdown, existing status/actions. Recorded bill lines/tax details remain expandable.
- Draft hire sections use the same display-only review projection with the already calculated draft result and selected bill-specific terms.
- Whole-bill PDF/Excel, equipment-specific PDF/Excel, saved Print and the existing server PDF route include month-wise review rows. Financial totals are not recalculated by the projection.
- No schema, migration, backfill, data correction, publishing or calculation-engine changes.

## Coverage against requested cases

1–8: focused projection tests cover one/two/three months, clipped boundary months, per-month classifications, missing/open activity, three worked days versus contractual full-month hire and Calendar/30/Custom divisors.

9–13: recorded breakdown day decisions are displayed without reducing gross a second time. Existing hire-engine tests and export tests cover preserved amounts, deductions, advances, TDS, negative net and daily/trip rules. Separate machine projections retain individual basis/rate; no hours/trips are relabelled as days.

14–16: prior-summary tests exclude current/later/other-vendor bills, preserve recorded zero, keep missing Paid evidence neutral and do not treat deducted advances as payments. A superseded equipment-output test now requires absent payment evidence to remain null.

17–21: existing page integration tests cover saved statuses, editing, included calendars, frozen evidence and export permission gates; calendar evidence and tipper daily-hire tests cover historical and trip boundaries. Existing status mutations, no-self-approval enforcement and payment workflow were not changed. No actual browser save/approval/payment was performed.

## Verification

Focused command:

`npx vitest run tests/vendorBillLayout.test.ts client/src/components/vendor-bills/HireMonthlyReview.test.tsx client/src/components/vendor-bills/wholeBillExport.test.ts client/src/components/vendor-bills/wholeBillCalendarEvidence.test.tsx client/src/components/vendor-bills/wholeBillPageIntegration.test.tsx tests/hireBilling.test.ts tests/tipperDailyHire.test.ts tests/equipmentHireBillOutput.test.ts`

Final rerun: 158 tests passed across eight files; `git diff --check` passed. The integration fetch fixture now includes the existing permission-scoped financial-review endpoint, which previously returned no fixture bills. TypeScript check still reports repository-wide pre-existing errors (including Set target settings, Express typing and invalid existing Button variant); no errors identified in the new review/projection components.

Production build is reserved for the owning agent. No workflow was restarted by the implementation agent.

## Signed-in browser / generated-file verification

Used normal development login following the existing read-only browser harness, with its specifically identified disposable device approval and cleanup. No account permission/flag changes, auth bypass, bill/master writes or production access. Browser-only isolated bill responses were intercepted with service-worker bypass and browser cache disabled; these are UI fixtures, not persistence evidence.

Inspected actual single-month and two-month Bill Detail screenshots:

- `/tmp/vb-layout-single-month.png`
- `/tmp/vb-layout-two-month.png`
- `/tmp/vb-layout-independent-september.png`

Confirmed individual expand/collapse (August closed while September remained open), exact day column labels, per-month rows, confirmed identity business label, original application navigation and no clipped financial columns at the tested desktop viewport. The ordinary account has no `vendor_financials` view or Export grant: Previous Billing Summary and export buttons correctly remained absent. Intercepted identities, financial-review and statement response patterns were exercised, but financial-review/statement were explicit browser fixture fetches, not evidence of authorized financial UI access. Existing focused component/page tests cover the permitted financial path.

Generated `/tmp/vb-layout-two-month.pdf` and `/tmp/vb-layout-two-month.xlsx` using the existing builders with the same isolated fixture. Rendered and inspected both PDF pages (`/tmp/vb-layout-pdf-page1.png`, `/tmp/vb-layout-pdf-page2.png`): all seven month columns, both month rows and totals visible without clipping. Reopened the Excel binary and asserted exact headers, two numeric monthly amounts, gross ₹133,064.52 and net ₹105,403.23. An Excel desktop application's visual rendering was not tested.

Browser inspection exposed a remaining pre-existing fabricated-zero/full-payment display in the separate Payment Details badges. Fixed display only: missing Paid/Balance values now remain dashes (including historical Paid bills), and known negative balances are not clamped. Entry/persistence workflow is unchanged. Also corrected the financial heading to Gross Hire Amount when saved gross reconciles, and improved PDF title/note spanning, financial alignment and decimal formatting. Added two payment-display page regressions.

Post-fix focused command: `npx vitest run client/src/components/vendor-bills/HireMonthlyReview.test.tsx client/src/components/vendor-bills/wholeBillExport.test.ts client/src/components/vendor-bills/wholeBillPageIntegration.test.tsx` — **50 tests passed across three files**. `git diff --check` passed.

Payment-timestamp audit: `vendor_bills` stores cumulative `amountPaid`, `paidAt`, `paymentRecordedBy`, Mode/Paid By/Account/Remarks; it has no separate payment-transaction amount/date/time/history field. Payment-details updates intentionally leave timestamps untouched. The Paid status transition sets `paidAt` to status-change time. Neither this timestamp nor cumulative amount identifies an individual transaction, so `lastPayment: null` is deliberate rather than inferred from status, remarks or advance deductions.

## Evidence limitations

- Existing `paidAt` records Paid status, not a transaction date. Without a distinct reliable payment transaction amount/time/reference, Last Payment is a dash. Prior amounts with incomplete payment evidence remain dashes.
- Legacy calendars remain unknown; no live operational data reconstructs saved bills. Available saved lines remain accessible.
- Undated/manual monetary deductions do not establish day-equivalents. Stored override totals or incomplete multi-month evidence are not arbitrarily apportioned: unavailable monthly values are dashes, the stored period amount is retained and the limitation is stated.
- Month gross uses the existing monthly-period function and must reconcile with the stored period gross. Gross precedes separately recorded deductions, while Days Billed excludes interpretable recorded non-payable day decisions. Neither is derived from Worked Days.
