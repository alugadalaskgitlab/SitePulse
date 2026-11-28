# TANK-02

## Part 1 — tracker book stock

Both trackers show tank totals, usable/dead stock, party shares, expected dip and the latest actual dip with date/time. Differences are quantities, bold above the configured limit. Expected dip uses explicit calibration and configured bitumen density; missing inputs show **Calibration needed**, never a guessed density. Negative/out-of-range stock is not clamped to a fake dip.

Owner-only dip settings use the existing plant-settings JSON. Defaults: bitumen 0.2 MT, LDO 50 L, 08:00–18:00 every two hours, India time. Ordinary calibration saves preserve these settings and cannot change them through that path.

Focused tests: **36 passed, 5 files**. Build passed. No migration or real data changes.

Extra supporting files/sections and reasons are listed in `reports/TANK-01.md`, as requested.

## Migration and safety

**No migration; SQL: none.** Neither development database was altered. No production database access, historical repair or publishing. New settings save only after an explicit Owner action; no settings were saved to real data during verification.
