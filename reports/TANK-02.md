# TANK-02

## Part 1 — tracker book stock

Both trackers show tank totals, usable/dead stock, party shares, expected dip and the latest actual dip with date/time. Differences are quantities, bold above the configured limit. Expected dip uses explicit calibration and configured bitumen density; missing inputs show **Calibration needed**, never a guessed density. Negative/out-of-range stock is not clamped to a fake dip.

Owner-only dip settings use the existing plant-settings JSON. Defaults: bitumen 0.2 MT, LDO 50 L, 08:00–18:00 every two hours, India time. Ordinary calibration saves preserve these settings and cannot change them through that path.

Focused tests: **36 passed, 5 files**. Build passed. No migration or real data changes.

Extra supporting files/sections and reasons are listed in `reports/TANK-01.md`, as requested.

## Part 2 — confirmation at plant-log start

A new log first offers **Confirm tank stock**. Actual dips save through the existing reading routes; blank tanks, failed loading/saving and missing entry permission never prevent **Skip for now**. Existing opening dips are retained, not recreated. Previous closing values are not silently counted as confirmation after Skip.

After a new log is actually saved, missing-opening and over-limit alerts go to active Owners and plant-scoped users with shift-log verification permission. Delivery is recipient-private and deduplicated in the existing operational notification table; in-app and push links open the right tracker/dip form. Alerts cannot fail the log save.

Focused checks: **84 passed across 7 files**, including real PGlite creation of four opening dips with no stock posting. Build passed. No real readings or other data were changed.

## Migration and safety

**No migration; SQL: none.** Neither development database was altered. No production database access, historical repair or publishing. New settings save only after an explicit Owner action; no settings were saved to real data during verification.
