# VB-ARRANGE-02A — storage and entry only

## Implemented

- Nullable `earthwork_arrangements.trip_rates` JSONB, via
  `migrations/0044_arrangement_trip_rates.sql`, Drizzle schema and the existing
  schema-readiness setup. Applied additively to both development databases
  (`sitelog_dev` runtime and `heliumdb` Publish comparison source). No production
  access, backfill or row update.
- Shared validation, POST/PATCH support, arrangement entry table with add/remove,
  inline errors and validation before sending a save.
- Read-only rates on arrangement cards, register rows/details and existing
  arrangement summaries. No DPR display or billing consumer added.
- Existing permission guards retained. New rates follow the existing
  commercial-edit revision guard rather than bypassing approval.

Stored shape:

```json
[
  {"quantity":600,"uom":"CFT","rate":1200},
  {"quantity":800,"uom":"CFT","rate":1600},
  {"quantity":1000,"uom":"CFT","rate":2000}
]
```

No rows means `null`. Values above are test examples, not owner-approved rates.
Quantity must be finite and positive, rate finite and nonnegative, UOM nonblank.
UOM is trimmed and uppercased; duplicate quantity/UOM pairs are rejected.
The existing per-UOM agreed rate remains independent and unchanged.

## Evidence and limits

**The requested signed-in acceptance flow is blocked by existing permissions.**
Normal login as the designated development user succeeded (HTTP 200), but:

- GET `/api/boq/projects/2/earthwork-arrangements`: **403**, view denied.
- POST `/api/boq/projects/2/earthwork-arrangements`: **403**, edit denied.
- Signed-in screen says **No access** (`signed-in-access.jpg`).

No grants or guards were changed. No alternate account or auth bypass was used.
Consequently, evidence 1–6 is **not claimed as a live signed-in save/reopen**.
The substitute evidence is explicitly isolated:

| Requested check | Completed evidence |
|---|---|
| Three rates / reopen | POST route test forwards exact values; real PostgreSQL connection-local TEMP table using arrangement schema stores and reads exact JSONB; component fixture renders three rows |
| Duplicate | POST and PATCH return 400 in route tests before writes; component inline error shown |
| Negative rate / zero quantity | Both routes reject 400; component errors shown |
| Remove a row | PATCH 200 in route test, two values retained; TEMP-table round-trip agrees |
| Empty rows | PATCH 200 with null; null/empty validation tests; TEMP-table null round-trip |
| Billing unchanged | No billing/rate-card code changed or connected to tripRates; all 45 existing development bills retain identical checksums; Bill #1 total remains ₹170,040 before/after the isolated TEMP-table exercise |

`entry-validation.jpg` and `remove-clear-readonly.jpg` are labelled component
fixtures, not saved operational arrangements. `isolated-storage.json` records
the TEMP-table values and one bill before/after. A live bill-preview/payable
comparison after an actual UI rate save remains blocked with the signed-in flow.

## Verification

- **4,614 passed, exact 48 baseline failures, 3 skipped. No new failures.**
- Build passed, exit 0.
- 20 tests added across shared validation, component behavior and existing
  arrangement route tests: valid/invalid/duplicate rates, canonical UOM,
  zero allowed rate, null clearing, removal, revision classification,
  existing agreed-rate independence and no billing coupling.
- Runtime arrangement count **5 → 5**, trips **10 → 10**, bills **45 → 45**.
  All pre-existing-column checksums are identical before/after.
- Arrangement checksum:
  `dfb14827fcdc6cc450fd9f1d699c75e77e0666549592c3bc8f4a31ba5dec8d96`.
- Trip checksum:
  `90445fec9cebf345e88be82e09dcf92faef46a2fa8ff213310c9ef05b82f01a7`.
- Checksums exclude only the newly introduced column when comparing old
  arrangement contents; every existing `trip_rates` is confirmed NULL.
  Both development databases are recorded in `integrity.json`.

## Files

- `shared/arrangementTripRates.ts`, `shared/schema.ts`,
  `shared/executionState.ts`, `shared/planningEngine.ts`
- `client/src/components/ArrangementTripRates.tsx`,
  `EarthworkArrangementDialog.tsx`, `ArrangementRegisterLink.tsx`
- `client/src/pages/ExecutionArrangements.tsx`
- `server/routes.ts`, `server/storage.ts`, `server/index.ts`
- `migrations/0044_arrangement_trip_rates.sql`
- `tests/arrangementTripRates.test.ts`,
  `tests/earthworkArrangementRouteScope.test.ts`,
  `client/src/components/ArrangementTripRates.test.tsx`
- `scripts/arrange02a-verify.mjs`, this evidence folder and commercial-rule memory.

No trips list/filter, vendor rate card, pricing, payable, DPR or billing code
changed. VB-ARRANGE-02B was not started.

Nothing published. A genuine Publish preview is unavailable through exposed
controls; publishing settings are not a preview.
