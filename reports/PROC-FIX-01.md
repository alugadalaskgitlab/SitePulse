# PROC-FIX-01

Development and test fixtures only. No production database was queried or changed. No data repair, backfill, migration, or publish was done.

## What changed

- **GRN cancellation:** The 22 Nov deployment log at 5:08 PM IST showed the cancel request failing while Drizzle prepared its query (`Cannot convert undefined or null to object`). The cancel handler selected `users.role`, but the users table has no such field. It now reads the actor's saved name. Owners can cancel even when a linked indent is closed; when a non-owner cannot cancel a closed indent, the response explains why. A reason is required. Cancelling a finalized GRN excludes its quantities from stock.
- **Receiving and stock:** Indent receipt quantities and status are calculated from finalized, non-cancelled GRNs when the indent is displayed. Partial receipts show received and pending quantities in the item's unit. The same calculation feeds the count tiles. History shows only recorded events with actual times and people; missing history is no longer invented. Live stock uses the linked store item's balance.
- **One purchase action:** The server now prevents repeat or duplicate purchase actions, including after an indent edit, and points to an existing GRN when one exists. Existing duplicate records were not changed.
- **Next step and links:** Indents show one next action and open the relevant GRN. GRNs show and filter by the real indent number. Dates and times use the requested IST display.
- **PO numbers:** Blank PO numbers are generated as `HLC/PO/YY-YY/NNNN`, with a shared financial-year sequence across purchase orders and PI order records. Custom numbers and old numbers are preserved.
- **Navigation:** Back and close actions retain list filters and scroll position and return to the originating Stores, HMP, Reports, or Procurement section. Direct GRN/stock entry defaults to Stores; direct indent entry defaults to Procurement. Sidebar context follows the originating section.

No database schema changed. The only `shared/schema.ts` edit adds optional fields to the TypeScript GRN response type; it does not add database columns.

## Existing records left untouched

The duplicate draft `STORE/26-27/0002` and finalized `STORE/26-27/0003` remain for the Owner to handle. No other existing records were audited or repaired.

## Verification

- Focused receiving, navigation, purchase-indent, PI history, and purchase-order tests: **7 files, 62 tests passed**.
- The first full-suite run exposed an incomplete PI-02B test fixture: it created GRN line rows but not the parent `store_grns` table now queried for receipt progress. Added that table to the isolated fixture; no assertion was weakened.
- Final `npm test`: **486 files passed, 2 skipped; 5,906 tests passed, 3 skipped; 0 failures**.
- `npm run build`: passed.
- Development app restarted; startup readiness passed (`ready: true`, 2,286 columns checked).
