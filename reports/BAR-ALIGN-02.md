# BAR-ALIGN-02 — bar review and Apply

## Cause and fix

The browser calculated the review from the BOQ-items endpoint, while Apply
re-read BOQ items and bars from the database. Both called the same alignment
function, but the inputs differed: the browser's item projection omitted the
saved `fixedQuantity` and `fixedQuantityReachId` fields. Fixed-item allocation
could therefore produce an Update in the browser that the server did not
calculate as an update. Bar snapshot validation and chainage rounding were not
the mismatch.

The review now comes from the server calculation used by Apply. Apply checks
each row shown as Update against its locked recalculation. A changed proposal,
missing bar, missing quantity or failed save is returned with a reason and
written to the audit log. If any previewed row is not accounted for, the page
does not show “Every applicable Update row was saved.”

## Fixture

The regression fixture has only the remaining structure-front bars #953–#955,
each spanning 1.6–3.2 km with `isQtyOverride=true`; the matching Reach 1 bars
are absent. It includes a no-scope segment from 1.6–1.9 km and Reach 3 from
1.9–2.9 km. The server preview proposed:

| Bar | Quantity before | Proposed chainage | Proposed quantity |
| --- | ---: | --- | ---: |
| #953 | 13.665 | 1.9–2.9 | 27.33 |
| #954 | 2.885 | 1.9–2.9 | 5.77 |
| #955 | 1.965 | 1.9–2.9 | 3.93 |

Apply updated all three. A changed proposal is reported as not updated while
the other rows still apply; a simulated empty database update also reports its
bar-specific reason.

## Verification

- Focused tests: 3 files, 19 tests passed.
- Full suite: 475 files — 469 passed, 4 failed, 2 skipped; 5,822 tests —
  5,813 passed, 6 failed, 3 skipped. The six failures are the known older
  failures in `arrangementProcurementCorrection.test.ts` (1),
  `materialReceiptReversal06mD.test.ts` (1), `purchase-indent-pi01.test.ts` (1),
  and `unscheduledReportCredit.test.ts` (3). No BAR-ALIGN-02 test failed.
- `npm run build` passed.
- The application restarted in `NODE_ENV=test`; read-only startup readiness
  reported ready.
- No schema or database data changed. Production was not accessed. Nothing was
  published.
