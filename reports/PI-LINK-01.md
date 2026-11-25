# PI-LINK-01 — Site trips linked to purchase indents

## What changed

- Purchase-indent bulk-delivery tracking now lists unlinked site trips for the same destination site and material. The From date defaults to the PI date and can be moved earlier. The list shows the recorded quantity and the amount counted in the PI unit.
- Users with site-material recording permission can link or unlink trips. These actions use the existing PI delivery evidence and audit path. Other PI viewers can inspect the list without changing links.
- A new trip first tries the BOQ item match, then a unique open PI match for the same site and material. One match links automatically; multiple matches offer a choice, including “None — leave unlinked”. A lookup or link failure does not block saving the trip.
- Delivery totals use the PI unit: same-unit values are unchanged; MT/cum conversion uses the material master density; CFT/cum uses 35.315. When conversion is not possible, the row explains that bulk density is missing and links to Material master.
- Partial delivery sets the existing `partially_received` status. Full delivery uses the existing `completed` status. Approvers can close a PI with an outstanding balance after entering a reason; the ordered, delivered and balance quantities, actor, time and reason are retained and audit-logged. Reopen restores the prior status and is also audit-logged.
- The supply-order label is “Work name” in sentence case.
- The existing DispatchPro site-list fixture includes a party ID but no party name. Per the instruction, this item was skipped; DispatchPro was not changed.

## Schema and development databases

Migration `0070_pi_close_with_balance.sql` adds only these nullable columns to `purchase_indents`:

- `closed_balance_reason text`
- `closed_balance_snapshot jsonb`
- `closed_balance_by_user_id integer REFERENCES users(id) ON DELETE SET NULL`
- `closed_balance_at timestamp`

The migration was applied to both development databases: `sitelog_dev` and the Publish-facing `heliumdb`. `sitelog_dev` passes startup readiness (2,477 columns checked). `heliumdb` has the new columns, but its startup check remains blocked by the pre-existing `STARTUP_ACCESS_MIGRATION_REQUIRED` marker. No access migration or unrelated change was applied.

No trip, quantity, date, vendor, hire-link, stock, bill or payment data was changed. No production database was accessed and the app was not published.

## Verification

- Focused PI delivery/linking tests for storage, auto-link, conversion and panel behavior passed.
- PI receipt and concurrency fixture tests after setup correction: **36 passed**. Their isolated schemas now include `plant_materials`, which reconciliation reads for bulk-density conversion; this fixed the two relation errors and the follow-on cleanup deadlock.
- `npm run build`: **passed**.
- Final `npm test`: **509 test files passed, 2 skipped; 6,057 tests passed, 3 skipped, 0 failed**.

The authenticated PI page screenshot was not captured because no development login was provisioned for this batch. The manual-link panel and its states are covered by component tests.
