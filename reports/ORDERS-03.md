# ORDERS-03 — Order alerts and master details

## What changed

- Supply alerts now show party and order, each mix’s ordered quantity, period, dispatched quantity and balance, plus short materials where relevant. Values use up to two decimal places.
- A bell alert expands to its full text. “Open order” marks it read and opens the selected order at Material status. Morning summaries open the HMP Hub’s Open orders — material status card. Push links use the same destinations.
- The morning job creates one summary per recipient per day containing all open orders.
- Site master now stores optional work and conversion details and supports attachments. Party master stores optional contact, mobile, GST and address details. Master edits and site attachment changes are audited.
- Supply orders show current linked Site and Party master details. Site details are read-only in the order form; a missing-details message and Site master link are shown without blocking order creation. The Site factor is used when configured; otherwise 2.356 remains editable on the order.
- An Owner can preview copying an order’s saved work details into blank Site master fields, or explicitly choose overwrite. Copying is never automatic.
- Party statements, dispatch exports and order prints include current master contact/work details.

## Schema and safety

Migration `0065_orders_site_party_details_and_alert_links.sql` was applied to the development databases only:

- `sitelog_dev` via `DEV_DATABASE_URL`
- `heliumdb` via the Publish-facing `DATABASE_URL`

It adds eight nullable columns to `sites`, four nullable columns to `parties`, and one nullable `order_id` foreign-key column to `plant_supply_alert_deliveries`. Both database identities and all 13 added columns were verified. Startup readiness passed (`ready: true`). No production database was accessed; no existing business records were changed; nothing was published.

## Checks

- Focused tests: 35 passed across the notification, supply-order and permission-handler test files.
- Full suite: **5,988 passed, 3 skipped; 497 test files passed, 2 skipped.**
- The first full run exposed two failures in `perm01PartBHandlers.test.ts`: its mocked `getSites()` returned no row, so the new before/after audit lookup returned 404. The fixture now supplies the Site being edited; the focused tests and final full run pass.
- `npm run build`: passed.
- App restarted after the final server changes; read-only startup readiness passed.

## Screenshot

Not captured. The available preview capture is unauthenticated and cannot show the signed-in notification popover; I did not bypass authentication or alter a user account. The expanded-alert and “Open order” interaction is covered by `tests/orders03Notifications.test.tsx`.
