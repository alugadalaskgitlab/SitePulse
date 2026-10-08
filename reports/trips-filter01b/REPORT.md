# TRIPS-FILTER-01B — display only

## Changes

- `client/src/pages/SiteMaterialTrips.tsx`: Date first, Time retained;
  `DD-MMM-YYYY` uppercase matches the existing Materials Received trip list.
  Receipt/Challan No. sits beneath the existing Material Source detail.
  NULL, absent or whitespace-only receipt numbers render a plain `-`.
- `client/src/components/TripTransportRoles.behavior.test.tsx`: asserts exact
  column order, distinct dates, Time preservation, challan placement, present
  and blank challans. Optional evidence output uses the actual rendered table.
- Verification script and evidence only otherwise.

No API, query, filter, permission, sort, role-description or work-context changes.
The existing horizontal scroll container is unchanged.

## Screenshots

- **P1** `desktop-dates-challans.jpg`: signed-in development account, July 1–
  October 8 range, showing July, August and October dates in the same list.
- **P2** Actual saved challans are visible in the same screenshot. Every saved
  development trip has a challan, so `blank-challan-fixture.jpg` is explicitly
  labelled **component test fixture**, not saved data. It captures the real
  component's rendered table showing `CH-123` and plain `-` fallbacks.
  No trip was inserted or changed to produce a missing-value example.
- **P3** `phone-dates.jpg` and `phone-challans.jpg`: 390px viewport, before and
  after horizontal scrolling. Page width remains 390px; table scrolls inside
  its existing 276px-wide container (`overflow-x: auto`), not the whole page.

Normal login and list request: HTTP 200. Disposable verification sessions and
the specifically approved new verification device were cleaned up.

## Verification

- Final full suite: **4,594 passed, exact 48 baseline failures, 3 skipped**;
  no new failure identities (`tests.json`).
- Build: passed, exit 0.
- Initial full run had one additional seed-handler mock failure; its isolated
  15-test suite passed without changing any implementation or permission code.
- `site_material_trips`: **10 rows before and after**, identical full-row hash:
  `90445fec9cebf345e88be82e09dcf92faef46a2fa8ff213310c9ef05b82f01a7`.
  See `integrity.json`. No production data accessed; no stored trip changed.

Nothing published. A real Publish preview is unavailable through the exposed
controls; publishing settings are not a Publish preview.
