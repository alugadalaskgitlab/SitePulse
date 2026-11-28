# TANK-01

## Part 1 — confirmed file deletion

Owners or users with Edit on the source record can remove shared files after one confirmation listing other records (including legacy diesel receipts). File, links and the deletion audit are changed in one transaction. The audit records actor/time, filename, source and other places. Receipts and other business records are untouched; errors shown to users are plain text.

Focused checks: **69 passed across 5 files** after updating the old gallery expectation that linked files never have a bin (deliberately changed by this batch). Build passed. Fixtures only; no migration or real-data changes.

## Parts 2 and 3

Not yet completed.

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
