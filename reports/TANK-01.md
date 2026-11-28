# TANK-01

## Part 1 — confirmed file deletion

Owners or users with Edit on the source record can remove shared files after one confirmation listing other records (including legacy diesel receipts). File, links and the deletion audit are changed in one transaction. The audit records actor/time, filename, source and other places. Receipts and other business records are untouched; errors shown to users are plain text.

Focused checks: **69 passed across 5 files** after updating the old gallery expectation that linked files never have a bin (deliberately changed by this batch). Build passed. Fixtures only; no migration or real-data changes.

## Part 2 — correct tank stock

One Owner action now reviews Tank 1, Tank 2, read-only barrels, not-in-a-tank and total before saving. Bitumen inputs use MT; LDO uses litres. Mismatched totals are blocked with a short/excess message. A changed preview is refused.

One transaction writes only total-neutral `tank_assignment` entries and before/after audit. Fixtures passed for 16.590 / −9.410 / 1.435 → 0 / 8.615, −11.245 / 12.680 / −1.435 → 0 / 0, and LDO −6,988.401 / +6,988.401 → 0. Barrels, `stock_balances`, party statements, reconciliation and norm-vs-actual remain unchanged.

Focused checks: **72 passed across 4 files**; build passed. Old button/preview tests were updated for the deliberately replaced action. Legacy API requests retain their existing handling.

## Part 3 — tables and exports

HMP Material Stock, the Bitumen tracker and the LDO tracker now use Material | Party | Tank 1 | Tank 2 | Barrels | Not in a tank | Total, plus the Owner-only action. Quantity cells contain only figures and units; barrels show count and quantity. All-zero rows are hidden unless Show all is ticked. One short book-stock note is shown.

PDF, print and Excel use the same columns, formatting and visible rows. Focused checks: **32 passed across 5 files**; build passed. The earlier export assertions were updated for the requested seven-column layout with units.

Small supporting files: `shared/tankAssignment.ts` holds the shared conversion/display helpers; `client/src/components/TankStockPositions.tsx` keeps the three tables identical. No unrelated refactoring.

## Final checks

Full suite ran **once**, using a disposable PostgreSQL database with the development schema and test fixtures: **6,311 passed, 1 failed, 3 existing skips**. All **537 discovered files** were accounted for.

The one failure was an old assertion in `dprBreakdownPersistence1430.test.ts` requiring Delete for equipment attachments. It now requires the deliberately agreed Edit permission and still checks the source-record scope, specifically inside the delete route. Focused rerun: **10 passed**. No app code changed after the full run.

**Combined verified result: 6,312 passed, 0 remaining failures, 3 existing skips** (two opt-in labour/PostgreSQL checks and the opt-in billing fixture server). The full suite was not repeated.

The development app restarted cleanly: read-only startup readiness passed (2,570 columns checked).
Signed-in screens were checked by render tests, not in a signed-in browser.

No migration, production database access, real-record changes, ledger rebuild or publish. No real receipts, dispatches, readings, bills, payments or `stock_balances` were changed.

<details>
<summary>Earlier TANK-02 supporting-file notes</summary>

# TANK-02 — supporting changes

This file records the extra files/sections permitted by the Owner. Batch results are in `reports/TANK-02.md`.

## Part 1

| Extra file or section | Why needed |
| --- | --- |
| `shared/tankBookStock.ts` (new) | Strict calibration inversion, quantity differences and existing-JSON settings handling, shared without changing old calculations. |
| `client/src/components/TankBookStock.tsx` (new) | One summary/settings component reused by both trackers. |
| `server/routes.ts` — plant-settings handlers | Owner-only explicit settings save; preserve those settings during ordinary calibration saves. No schema change. |
| `tests/tank02BookStock.test.tsx` (new) | Calculation and rendered summary/settings tests with fixtures. |
| `tests/tank02SettingsRoute.test.ts` (new) | Owner restriction, validation and preservation tests; mocked settings only. |

The two tracker pages were already in the original allowed list. No storage, schema, calibration implementation or other existing file was changed for this part.

## Part 2

| Extra file or section | Why needed |
| --- | --- |
| `client/src/components/ConfirmTankStock.tsx` (new) | Optional start confirmation using the existing dip reading APIs, with Skip always available. |
| `server/tankDipNotifications.ts` (new) | Permission/site-scoped recipients and recipient-private, deduplicated alerts using existing tables/helpers. |
| `client/src/components/AdminNotifications.tsx` | Open tracker/dip-entry links for the new alert type; existing order links remain unchanged. |
| `server/routes.ts` — shift-log save hook | Send non-blocking alerts after an actual new log/start, not just opening a form. |
| `tests/tank02ConfirmStock.test.tsx`, `tests/tank02StartAlerts.test.ts` (new) | Confirmation, Skip/error paths, recipient scope, missing/difference alerts and links. |
| `tests/stock02Packed.test.ts` | Reuse its real PGlite fixture to prove opening dips persist without stock posting. |

The shared helper gained tank selection and safe deep-link support. Tracker changes only initialise the existing entry dialogs from those links. The shift-log start changes prevent skipped previous-closing defaults becoming false opening confirmations. No storage implementation was changed.

## Part 3 — approved supporting changes

| Extra file or section | Why needed |
| --- | --- |
| `server/tankDipNotifications.ts` | Scheduled reminders, idle-day checks and exact linked-supervisor lookup for after-dip alerts. |
| `server/routes.ts` — receipt/decant success hooks | Request after-dip alerts only after successful saves, without changing saved records or stock calculations. |
| `server/index.ts` | Start the timer without immediate delivery; disabled in the development/test workflow. |
| `tests/tank02Reminders.test.ts`, `tests/tank02NotificationPersistence.test.ts` (new) | India-time schedule, recipients, stop/idle rules and real database CHECK/deduplication coverage. |
| `tests/bitumenTrackerFixBit01.test.tsx` | Verify alert links open the entry on an already mounted tracker. |
| `tests/tank02SettingsRoute.test.ts` | Verify successful/failed decant routes trigger or suppress the after-dip hook. |
| `shared/schema.ts`, `migrations/0080_tank_dip_alert_deliveries.sql` | The Owner explicitly approved one separate tank-alert tracking table and indexes on both dev databases. Existing tables were not changed. |
| `client/src/components/AdminNotifications.tsx` | Separate tank source, private read-state/counts and correct links, without changing order alerts. |
| `server/routes.ts` — tank-alert notification endpoints | Authenticated recipient-only list/count/read/delete operations for the new table. |
| `tests/orders03Notifications.test.tsx` | Verify the tank bell action marks only its own notification read and opens the dip entry; existing order tests remain. |
| `.agents/memory/MEMORY.md`, `.agents/memory/tank-alert-storage.md`, `.agents/memory/test-suite-verification.md` | Retain the separate-store decision, native-constraint fixture rule and disposable database-name requirement. |

The existing order-only CHECK remains unchanged. Both development databases received only migration 0080; exact SQL and readiness results are in `reports/TANK-02.md`.

</details>
