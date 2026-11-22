# PLANT-01 — Plant day and dispatches

## Delivered by section

- **A — Start of day:** Kept optional details under “More details,” added opening readings and prior-day prefill, and retained the existing shift-log and DG usage records.
- **B — Each truck:** The operator form focuses on vehicle and load; additional fields remain under “More details.” Party, mix, tanks and location default from the latest truck. Actual consumption remains available for engineer/Owner correction.
- **C — Quick actions:** Tanker received, plant stopped, night/day preheat and DG meter actions use the existing receipt, idle-event, heating-session and equipment-usage records. “No Truck” is an idle reason.
- **D — End of day:** Added closing readings, missing-reading reasons and reconciliation for bitumen, LDO, DG and dispatch totals. Reconciliation is restricted to the existing engineer/Owner verification permission.
- **E — Party daily statement:** Added party/date filters, per-truck challan and arrival/unload details, totals by mix, and clean print/PDF and Excel output.
- **F — Who sees what:** Reused existing plant permissions; no new screen or permission entry was added.
- **G — DispatchPro:** Added the Owner-only site picker, an outbox for create/edit/cancel, retry/status display and a shared-key status callback. Local saves do not wait for DispatchPro.
- **H — Data:** Added only the dispatch linkage fields, shift-log close reason and outbox table/indexes in migration `0058_plant_day_dispatchpro.sql`. Existing dispatches were left unchanged.

## Schema and startup

Migration `0058_plant_day_dispatchpro.sql` was applied to both development databases: `sitelog_dev` and the Publish-facing development database `heliumdb`. It adds the DispatchPro fields, `plant_shift_logs.close_reason`, and the outbox table with its three indexes. No other tables or columns were changed.

The app restarted successfully; startup readiness reported `ready: true` and checked 2,286 columns. Production was not queried or changed.

## Verification

- PLANT-01 and related focused tests: **83 passed across 7 files**.
- `npm run build`: **passed**.
- The full test workflow reported **5,855 passed, 9 failed, 3 skipped**. The failures were in `programmeBarLinkage030A.test.ts` (8) and `dieselStockGuard06mB.test.ts` (1); they concern DPR link/staff validation, not the plant-day or DispatchPro paths. No baseline comparison was run.
- `npm run check` could not complete because the TypeScript process ran out of memory.
- DispatchPro requests and callbacks were tested with mocks. After the Owner added the shared secret securely, a read-only site lookup returned **2 valid site choices**. No dispatch was sent or changed remotely. The base URL is the supplied DispatchPro URL; the secret value is not recorded here.

## Final screen checks

The signed-in checks found and fixed two missed defects:

- The end-of-day reconciliation referenced an undefined value, so the screen showed “Reconciliation could not be loaded.” It now uses the calculated theoretical bitumen total; the development endpoint returned 200 and the screen displayed its readings and missing-reading warnings.
- The previous-day opening-reading lookup omitted the date in its URL. It now requests the dated shift-log route. A read-only check against a development shift log confirmed both tank opening values matched the prior closing values.

After these fixes, the focused tests passed again: **83 passed across 7 files**. `npm run build` passed. The full-suite totals above are from before these two small fixes; the focused suite and build were rerun after them.

## Phone-width screenshots

All screenshots are from the development app at 402 × 874. The temporary Owner account used normal login and was deleted afterward; its sessions and device were also removed. A final check found **0 temporary users, devices, or sessions**. No form was saved and no operational record was created or changed.

The sent-challan row and print view use a browser-only synthetic response (`DP/TEST/PLANT-01`); no dispatch was created or sent.

1. Start and end of day: [01-start-day.jpg](plant01-screenshots/01-start-day.jpg)
2. Plant stopped: [02-plant-stopped.jpg](plant01-screenshots/02-plant-stopped.jpg)
3. Tanker receipt: [03-tanker-receipt.jpg](plant01-screenshots/03-tanker-receipt.jpg)
4. Truck entry: [04-truck-entry.jpg](plant01-screenshots/04-truck-entry.jpg)
5. End-of-day reconciliation: [05-end-reconciliation.jpg](plant01-screenshots/05-end-reconciliation.jpg)
6. Sent challan: [06-sent-challan.jpg](plant01-screenshots/06-sent-challan.jpg)
7. Party daily statement print view: [07-statement-print.jpg](plant01-screenshots/07-statement-print.jpg)

No production database was accessed and nothing was published.

## Follow-up: first-truck fields and day readings

- With no truck entered yet today, **Party/job** and **Mix template** now appear on the truck form as required fields. The Save button stays disabled until both, the vehicle and the load weight are supplied. After a dispatch exists, those choices can be shown in a one-line summary and changed explicitly.
- The Start and end of day card now contains the opening and closing bitumen dips, dryer and boiler meter readings, and generator hour-meter and diesel readings. Opening values continue to prefill from prior readings. Weather, temperatures and LDO dip-stick readings remain in More details.
- A new shift log pre-fills Operator from the signed-in user's linked personnel record when available; the operator can edit it.

## Failure investigation and verification

- The nine earlier failures were not caused by PLANT-01 behavior. The same 8 `programmeBarLinkage030A` and 1 `dieselStockGuard06mB` failures reproduced at baseline commit `29881e51` against this development database: the DPR route's active-personnel guard stopped the tests before their intended assertions. The previous zero-failure run used a clean test database without those ambient personnel rows.
- The two test files now use an explicit empty personnel fixture, preserving their programme-link and diesel-stock assertions while avoiding dependence on development data. No application behavior was changed for this fix.
- Focused PLANT, programme-link and diesel-guard tests: **124 passed across 6 files**.
- Full suite: **5,878 passed, 3 skipped, 0 failed** (483 test files passed; 2 skipped).
- `npm run build`: **passed**. `git diff --check`: **passed**.
- After restart, startup readiness reported `ready: true` and checked 2,286 columns.

## Follow-up phone screenshots

Screenshots are 402 pixels wide. The day-card screenshot uses browser-only sample readings to illustrate the visible fields; they were not saved. The truck screenshot shows the first-truck form with Party/job and Mix template visible and required. A temporary Owner account used the normal development login flow and was deleted afterward, together with its device and sessions. No plant or dispatch form was submitted, no operational records were changed, and no production database was accessed.

1. Start and end of day opening readings: [08-start-day-opening-readings.jpg](plant01-screenshots/08-start-day-opening-readings.jpg)
2. First-truck party and mix fields: [09-first-truck-party-mix.jpg](plant01-screenshots/09-first-truck-party-mix.jpg)
