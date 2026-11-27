# DIESEL-02

## Part 1 — requisition numbers

Added one display-only formatter: `DSL-REQ/<Indian financial year>/<id padded to 4>`. Requirements, detail/purchase headers, receipt picker, purchase register, direct-fill/choice labels and the requirements Excel workbook use it. The existing comparison workbook is unchanged; Export requirements uses the existing export permission.

Direct-fill responses carry the requisition date so a fill in a later financial year still displays the original requisition number. This is response metadata only, not a stored field.

Focused tests: **51 passed (6 files)**. Build passed. No migration or development/production database writes.

## Part 2 — purchase update summary

The details and purchase update screens now share the read-only facts and equipment table: number/date, raised by/from, approved by, status, equipment, purpose, hours/km, norm, planned and approved litres, and totals. Purchase fields follow the table. Pending approval inputs retain their existing limits and behaviour.

Direct-fill boxes prefill saved/approved litres; a missing approved quantity stays empty rather than becoming zero. Focused tests: **46 passed (6 files)**, including actual page renders, approval inputs and Excel content. Build passed. No migration or database writes.

## Part 3 — diesel store receipts

Diesel/HSD forms now use Liters without tank/barrel controls or messages, including Record receipt from a linked purchase. New diesel receipts store no tank; corrections retain historical tank numbers. Bitumen, LDO and emulsion keep their existing bulk-tank requirement and packed options.

With the Owner's permission, only the receipt-create tank-validation block in storage was changed; no other storage function was changed. Focused tests: **198 passed (17 files)**, including real PGlite receipt/stock transactions and form fixtures. Build passed.

The development app restarted successfully: read-only startup readiness passed, with 2,562 columns checked. No migration, development/production data writes, repairs or whole-project TypeScript check. Database test writes were confined to disposable fixtures. A basic availability snapshot reached the unauthenticated splash screen; signed-in UI was not browser-verified. Page behaviour was checked with rendered fixtures.

## Final checks

Full suite ran **once**: **6,204 passed, 0 failed, 3 skipped**; **523 test files passed, 2 skipped**. The separate real-database receipt fixtures also confirmed that Diesel/HSD receipts remain editable without a tank (**24 passed**). Final build passed. Three commits, one per part. Not published.
