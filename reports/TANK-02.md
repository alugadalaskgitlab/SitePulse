# TANK-02

## Part 1 — tracker book stock

Both trackers show tank totals, usable/dead stock, party shares, expected dip and the latest actual dip with date/time. Differences are quantities, bold above the configured limit. Expected dip uses explicit calibration and configured bitumen density; missing inputs show **Calibration needed**, never a guessed density. Negative/out-of-range stock is not clamped to a fake dip.

Owner-only dip settings use the existing plant-settings JSON. Defaults: bitumen 0.2 MT, LDO 50 L, 08:00–18:00 every two hours, India time. Ordinary calibration saves preserve these settings and cannot change them through that path.

Focused tests: **36 passed, 5 files**. Build passed. No migration or real data changes.

Extra supporting files/sections and reasons are listed in `reports/TANK-01.md`, as requested.

## Part 2 — confirmation at plant-log start

A new log first offers **Confirm tank stock**. Actual dips save through the existing reading routes; blank tanks, failed loading/saving and missing entry permission never prevent **Skip for now**. Existing opening dips are retained, not recreated. Previous closing values are not silently counted as confirmation after Skip.

Alerts target active Owners and plant-scoped shift-log verifiers, with tracker/dip-entry links and non-blocking delivery. They now use the separately approved tank-alert table, not the order-alert table.

Initial focused checks: **84 passed across 7 files**, including real PGlite creation of four opening dips with no stock posting. Build passed. The initial notification fixture omitted the database CHECK constraint; it has now been corrected. No real readings or other data were changed.

## Part 3 — reminders and after-dip alerts

Reminders run at 08:00, 10:00, 12:00, 14:00, 16:00 and 18:00 India time by default, only while opening dips are missing. Owner settings can change that schedule. Recipients are dip-entry users and plant-scoped verifiers/Owners. Explicit idle days with no production are skipped. No reminder runs immediately at startup.

Tank receipt/decant success requests an after-dip from the saver and the day's uniquely staff-linked supervisor. Packed/no-tank receipts are excluded. Ambiguous/unlinked supervisors are not guessed; the saver still receives the alert. Decants use their existing default-plant context. Notification failure never changes the saved receipt or stock. In-app links open the appropriate entry even on an already mounted tracker.

The original order-only CHECK rejected tank alert types. Following explicit approval, migration 0080 creates a separate private tank-alert delivery table. Tests run the actual migration in PGlite, retain the old CHECK, and prove deduplication, per-recipient read/delete privacy and unchanged order alerts. No order type was reused or constraint weakened.

## Migration and safety

Migration `0080_tank_dip_alert_deliveries.sql` was applied to **both sitelog_dev and heliumdb**. Exact SQL:

```sql
CREATE TABLE tank_dip_alert_deliveries (
  id serial PRIMARY KEY,
  dedupe_key text NOT NULL,
  recipient_user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  alert_type text NOT NULL,
  title text NOT NULL,
  message text NOT NULL,
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamp DEFAULT now()
);
CREATE UNIQUE INDEX tank_dip_alert_deliveries_dedupe_user_uq
  ON tank_dip_alert_deliveries (dedupe_key, recipient_user_id);
CREATE INDEX tank_dip_alert_deliveries_recipient_created_idx
  ON tank_dip_alert_deliveries (recipient_user_id, created_at);
```

Only this new table, its serial sequence/primary key and two indexes were created. Existing tables and records were not changed; no backfill or startup DDL was added. Both tables remained empty during verification.

Dev app restarted successfully: read-only startup readiness passed, **2,570 columns checked**. Heliumdb passed schema/index checks but its full readiness check stops at the existing access-migration marker requirement; no marker or permission data was added to this Publish-facing copy.

Focused checks: **101 passed across 10 files**. Final build passed.

The full suite ran **once**, against disposable native PostgreSQL with all four integration-test URLs redirected there. It had 6,272 passing assertions, no failed assertions, and one setup failure: `tripArrangementLink.test.ts` requires the database name `sitelog_dev`, not `tank02_test`. Only that file was rerun against a correctly named disposable database: **12 passed**. No app/test assertions were changed for this issue.

Final combined coverage: **6,284 passed, 0 failed, 3 existing explicit skips**. All **534 discovered files** were accounted for: 532 executed and 2 explicitly skipped; no missing files. The whole suite was not repeated. Signed-in UI and push routing were checked through fixtures/component tests, not a signed-in browser or real push delivery (dev VAPID is disabled).

No production database access, real readings, stock changes, historical repair or publishing. New settings save only after an explicit Owner action; no settings were saved to real data during verification.
