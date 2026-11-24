# FIX-SPDP-02 — DispatchPro order payload

## Changes

Supply orders now use DispatchPro's exact field names. Each payload contains only:

```json
{
  "sitePulseOrderId": "SP-ORDER-91",
  "partyName": "North party",
  "sitePulsePartyId": "7",
  "siteName": "Test road",
  "sitePulseSiteId": "18",
  "orderNumber": "PO-91",
  "mixLines": [{ "mix": "BC", "orderedMT": 100 }],
  "periodFrom": "2026-11-01",
  "periodTo": "2026-11-30",
  "status": "open"
}
```

Order mix lines use the mix-template name that truck payloads send as `mixType`, not a dated order-mix label. Their quantities are numeric MT. Dates are sent as `YYYY-MM-DD`.

Orders without a SitePulse site are not queued. The order screen shows “DispatchPro: choose a site for this order first” and offers no Retry button. Old queued payloads are stopped before an external send; Retry reloads the current order and rebuilds the payload.

Truck sending, the outbox table, site links, and database schema were not changed. No database records were edited, no production database was accessed, and nothing was published.

## Checks

- Focused tests: 5 files passed, 28 tests passed.
- Full suite: 507 files; 6,023 passed, 3 skipped, 0 failed.
- `npm run build`: passed.
- Development app restarted and startup readiness reported ready.
