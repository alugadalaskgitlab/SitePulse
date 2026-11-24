# STOCK-02 — Packed stock, including LDO

## Add-on

- Packed-unit settings and packed receipts are available for any plant material. The profile supports a standard net weight or volume; LDO can use a 200 L barrel profile.
- Fuel bulk receipts must name Tank 1 or Tank 2. Barrels/drums are received into packed stock with a count, calculated quantity and optional actual-weight override. The old no-tank choice is no longer offered for new receipts.
- LDO decants save the selected date and time, move stock from packed to a tank, and write an LDO-flow receipt for the selected tank. PLANT-04 calculations include that receipt.
- Supply-order stock and shortage/day-left figures include packed stock and show the packed count, such as “incl. 10 barrels.” Dispatch capacity and plant tank use count tank positions only. A store-to-tank issue cannot use packed stock; use Decant instead.
- The stock screen and exports show Tank 1, Tank 2, packed count and quantity, legacy/unassigned stock, and total in the material’s stock unit. LDO quantities are shown in litres.

## Development database changes

Migration `0064_ldo_packed_receipt_tank.sql` adds only:

- `pending_plant_receipts.tank_number` — nullable integer.
- `plant_stock_decants.time` — nullable text.

Applied to `sitelog_dev` and the managed development database `heliumdb`. Both databases report the two columns present. The application restarted against `sitelog_dev` with startup readiness `ready: true` (`checkedColumns: 2427`). No production database was accessed.

## Existing no-tank barrel receipts

These legacy-shaped records were read but not changed:

| Development database | Material / unit | Receipts | Entered quantity |
|---|---|---:|---:|
| `sitelog_dev` | EMULSION / Barrels | 2 | 4 |
| `heliumdb` | EMULSION / Barrels | 1 | 2 |

They remain in their saved unit and are shown as legacy/unassigned stock. They are not converted into packed counts or tank quantities.

## Verification

- `tests/stock02Packed.test.ts`: 16 passed, including the 10-barrel LDO example (2,000 L received; 6 barrels / 1,200 L decanted into Tank 1 at 09:15), tank-only dispatch accounting, bulk LDO tank requirement, correction preserving packed stock, and rejecting a store-to-tank issue that would consume packed stock.
- `tests/dieselReceiptConcurrencyFix1.integration.test.ts`: 6 passed. Its isolated test schema was updated for the packed-stock columns and tank assignment required by the current schema; the concurrency assertions were not weakened.
- `npm run build`: passed.
- Full test suite: 495 files passed, 2 skipped; 5,977 tests passed, 3 skipped, 0 failed.

No existing receipt or ledger row was changed by this work. No production database was accessed and no publishing was performed.
