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
