# SP-DP-LINK-01 — Supply orders to DispatchPro

## What changed

- Saving, editing, changing a mix, closing, or reopening a supply order now queues its current details in the existing DispatchPro outbox. Orders are sent to `POST /api/integrations/sitepulse/orders` with an idempotent order reference, party and SitePulse site, order number, mix lines, period, and status.
- The order screen shows whether the send is queued, needs a retry, or is linked. It refreshes while a send is pending and provides a Retry action when needed.
- A successful DispatchPro response is saved against the SitePulse site. Trucks linked to that supply order use the site-specific DispatchPro id; the truck request payload is unchanged.
- If the returned id conflicts with a manual party link or an existing site link, the link is not overwritten automatically. The Owner can choose **Use it** or **Replace**. Replacing a different party-wide manual link requires that Owner choice and is audit logged.

## Schema

Additive migration `0066_supply_order_dispatchpro_link.sql` was applied to both development databases: `sitelog_dev` and the Publish-facing development database `heliumdb`. It adds:

- `sites.dispatchpro_site_id`
- `dispatchpro_outbox.supply_order_id` (nullable FK to `plant_supply_orders`, `ON DELETE SET NULL`)
- `dispatchpro_outbox.response_site_id`
- `dispatchpro_outbox.response_site_name`
- `dispatchpro_outbox.link_choice`
- Index `dispatchpro_outbox_supply_order_idx` on `(supply_order_id, id)`

The migration changes schema only; no order or truck records were created or edited.

## Verification

- Focused tests: **20 passed** across the new order outbox and route tests, the order screen test, and the existing truck DispatchPro test.
- Full suite: **6,015 passed, 3 skipped, 0 failed** (504 test files passed; 2 skipped).
- `npm run build`: passed.
- Development app restarted; read-only startup readiness reported `ready: true` with 2,445 columns checked.
- Tests confirmed order create/edit/mix-change/close/reopen queue updated snapshots, successful sends save the site id, existing manual links wait for an Owner choice, and truck payloads remain unchanged.

No production database was accessed, and nothing was published.
