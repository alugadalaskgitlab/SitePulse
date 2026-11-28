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
