# PLANT-01 — Plant day and dispatches

## Delivered

- Simplified the dispatch entry to focus on truck and load weight, with additional fields kept under “More details.” New entries default party, mix, tanks and location from the latest dispatch for the day.
- Added start/end-of-day DG meter readings, previous-day opening prefill, missing-reading reasons, and a plant reconciliation summary for bitumen, LDO, generators and dispatch totals. Tanker receipt and plant-stopped quick actions open the existing forms.
- Added the Owner-only DispatchPro site picker, queued create/update/cancel delivery, retry status, and an authenticated-by-shared-key status callback. Local dispatches do not wait for the remote service.
- Added the dispatch statement with party/date filters and Excel/PDF output.

## Schema and startup

Migration `0058_plant_day_dispatchpro.sql` was applied to both development databases: `sitelog_dev` and the Publish-facing development database `heliumdb`. It adds the DispatchPro fields, `plant_shift_logs.close_reason`, and the outbox table with its three indexes. No other tables or columns were changed.

The app restarted successfully; startup readiness reported `ready: true` and checked 2,286 columns. Production was not queried or changed.

## Verification

- PLANT-01 and related focused tests: **83 passed across 7 files**.
- `npm run build`: **passed**.
- The full test workflow reported **5,855 passed, 9 failed, 3 skipped**. The failures were in `programmeBarLinkage030A.test.ts` (8) and `dieselStockGuard06mB.test.ts` (1); they concern DPR link/staff validation, not the plant-day or DispatchPro paths. No baseline comparison was run.
- `npm run check` could not complete because the TypeScript process ran out of memory.
- DispatchPro requests and callbacks were tested with mocks. `SITEPULSE_SHARED_SECRET` is not configured yet; no remote DispatchPro request was made. The base URL is the supplied DispatchPro URL.

## Screenshots

I could not capture the signed-in plant screens. The preview browser is unauthenticated and received HTTP 401 at the shift-log route. I did not bypass login or create a user/device approval. Therefore the requested phone screenshots (start, truck, receipt, stopped plant, reconciliation, statement and challan) remain outstanding.

No plant dispatch, receipt, shift log or other operational record was created or changed for this work. Nothing was published.
