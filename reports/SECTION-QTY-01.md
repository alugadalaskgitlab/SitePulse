# SECTION-QTY-01 — Optional typical sections

## What changed

- Added optional typical-section entries to BOQ item editing for CUM and SQM items.
- For CUM, the section quantity per metre is `(top width + side slope × thickness in metres) × thickness in metres`. For SQM, it is the top width.
- Chainage-covered portions use the section quantity. Eligible working-reach portions without a section keep the previous length-share calculation.
- The same working-reach allocator now supplies quantities to work value, BOM/material demand, fund planning, and programme bar preview/review. Fixed quantities remain unchanged. The BOQ’s saved current quantity is not capped or rewritten.
- Section coverage can be compared with the BOQ quantity; any excess is displayed rather than changing the BOQ quantity.
- Added the `boq_item_sections` permission. It is off by default; the Owner can edit, and another user needs an explicit grant.
- Added migration `0053_boq_item_sections.sql` with one new table and indexes. It contains no drops, renames, or data updates. The migration was not applied to a database in this batch.

No programme bars or real project rows were changed. No production database was queried or modified, and nothing was published.

## Verification

- `tests/typicalSectionQuantity.test.ts` and `tests/scopeBomDemand.test.ts`: **22 tests passed**.
- `npm run build`: **passed**.
- Synthetic browser fixture: **passed**. It saved one section through an intercepted request and confirmed the calculated quantity in the editor and before/after work-value/BOM view. The fixture made no database writes.

Screenshots:

- `screenshots/section-qty-01/item-edit-typical-section-SYNTHETIC.png`
- `screenshots/section-qty-01/work-value-and-bom-before-after-SYNTHETIC.png`

The screenshots show only synthetic fixture data; the signed-in application UI was not verified against a real project.
