# NAMES-CAPS-01

## Changes

- Removed the Names tidy-up page, menu entry, permission, and its API endpoints. No other API routes were changed.
- Added one shared display helper and name style. BOQ short names, materials, equipment and vehicle names, registration numbers, sites, vendors, parties, transporters, and suppliers display in capitals. Full BOQ descriptions and people’s names retain their existing case.
- Inputs preserve exactly what the user types; no aliases, matching keys, or saved snapshots were changed.
- No database was connected to, and no data scripts, backfills, or schema changes were made. No stored rows were changed.

## Screens and PDFs checked

Reviewed the shared display styling in ten screens: Site Material Trips, Trip Review Tools, Materials Received, Plant Material Receipts, Plant Stock, Site Material Stock, Material Balance Report, Work Demand, Equipment Status, and Vendor Master. Additional display updates cover Vendor Bills, Rate Cards, procurement, and BOQ item selectors.

PDF/export checks covered the material receipt slip, vendor bill, and equipment-hire bill/activity statement.

Tally source and schema files are unchanged. Four sample fixture XML files were byte-identical to the pre-batch output:

| Fixture bill | SHA-256 |
| --- | --- |
| HLC/VB/2026/0001 | `bf6e7180ccd755413fa8002c7f2dd9ccd1c1d97f12c4d340b27c16dde9843f9e` |
| HLC/VB/2026/0018 | `572d00a6ddff2efac4afe76bebd6b98cb44ba0bd05fc176afca3f85580912a94` |
| HLC/VB/2026/TEST-ALL-01 | `3d5185134a2464934749c1993c5f24e4eaeb01a88bb0dbf21a9d87f73788bd9b` |
| HLC/VB/2026/TEST-EQ-01 | `4fb2cb2f3692b0359e3541ec9bbaa62886cb4f6b5e9327d3d86c900e9a9e5eb1` |

## Verification

- Focused UI/name tests: 12 files, 148 tests passed across the two focused runs. PDF/export tests also passed: 5 files, 42 tests.
- Full suite: 472 files — 466 passed, 4 failed, 2 skipped; 5,791 tests passed, 6 failed, 3 skipped. The six failures are the known old failures: `arrangementProcurementCorrection.test.ts` (1), `materialReceiptReversal06mD.test.ts` (1), `purchase-indent-pi01.test.ts` (1), and `unscheduledReportCredit.test.ts` (3). No NAMES-CAPS-01 failures remain.
- `npm run build`: passed.
- Not published.
