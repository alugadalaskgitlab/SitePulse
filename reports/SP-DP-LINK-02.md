# SP-DP-LINK-02

## Changes

- Added nullable `parties.pan_no` with migration `0068_parties_pan_no.sql`.
- Applied the migration to development databases `sitelog_dev` and `heliumdb`. Both report `pan_no` as nullable text. No production database was accessed.
- Party Master now saves GST and PAN in capitals, allows blanks, and shows a plain validation message for invalid formats. Party edits remain audited.
- Supply order details now show the current Party Master name, contact, mobile, GST, PAN and address when present, with an Edit in Party master link. Orders with no optional details show “No contractor details in Party master”.
- Order print and the party statement include PAN alongside the existing GST and address details.
- DispatchPro order payloads now include only nonblank string values in `partyDetails`. Saving Party Master details queues each open order through the existing outbox; closed orders are skipped. Truck sending and manual link confirmation were not changed.

The only schema change is:

```sql
ALTER TABLE parties
  ADD COLUMN IF NOT EXISTS pan_no text;
```

## Sample DispatchPro payload

```json
{
  "partyDetails": {
    "address": "12 Road, Alladurg",
    "gstNo": "36ABCDE1234F1Z5",
    "panNo": "ABCDE1234F",
    "contactPerson": "Sunil Kumar",
    "mobile": "9876543210"
  }
}
```

Blank values are omitted, and `partyDetails` is omitted when every field is blank.

## Verification

- Startup readiness after applying the migration: `ready: true` (`checkedColumns: 2446`).
- Focused tests: **54 passed** across 4 files.
- Production build: passed.
- Final full suite: **505 files passed, 2 skipped; 6,028 tests passed, 3 skipped**.
- The first full-suite run found two failures in the existing `vbCarry01CreateRoutes` strict-field checks. The Party create route had begun returning the tax-format message for every validation error. It now returns that plain message only for GST/PAN errors and preserves the existing generic strict-schema response for other invalid fields. The final full suite passes.
- `npm run check` was also attempted; it reports 500 TypeScript diagnostics across 66 files. This check was not green, and its diagnostics were not baseline-compared. The production build and tests pass.
- A signed-in order screenshot could not be captured: the preview browser receives 401 and shows the signed-out splash. I did not bypass authentication. The order-view and print content are covered by UI tests.
- No business records were changed. Nothing was published.
