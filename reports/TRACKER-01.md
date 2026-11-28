# TRACKER-01

## Part 1 — Bitumen

Tanks now come first, followed by read-only **Whose bitumen**, one **Consumption** table and dip history. The book-stock box and tracker correction controls are gone. Owner dip settings use the same settings request and fields in a header dialog.

Daily consumption keeps the existing opening minus closing plus receipts and density conversion. Date selection defaults to ten calendar days; older dates can be selected. Production/norm use the existing dispatch totals. Excel, PDF and print are available for consumption; history/positions exports remain.

As approved, selecting an individual party leaves tank-wide actual and difference blank. Existing norm permissions remain in force. No new allocation formula.

Part 1: **38 focused tests passed across five files; build passed.** Existing alert-link opening, stock table and Owner settings checks passed.

## Safety

No migration, access to real application databases, real data edits, server changes or publishing. Dip/stock/receipt/dispatch calculations and reminder/alert delivery are unchanged. Verification uses fixtures.

## Part 2 — LDO and correction tools

LDO follows the same order, with dip history then flow-meter history at the bottom. The consumption table includes the existing dryer-meter daily difference and litres per MT. Redundant LDO overview/consumption panels were consolidated; tank cards and their readings/figures remain.

HMP Material Stock now has Owner-only **Physical stock correction** beside Decant, including when an Owner has no non-zero positions yet. The existing Correct tank stock and Decant tools remain there. Both tracker correction callers moved to the dialog: bitumen keeps the HLC-only target, LDO keeps litre inputs, MT submission and packed stock unchanged. The POST route, submitted audit fields and server audit behavior are unchanged.

Part 2: **90 focused tests passed across 13 files; build passed.** Fixtures check both layouts, totals, date/party filtering, matching Excel/PDF/print totals, Owner settings, unchanged correction requests and TANK-02 reminders/alerts. No real correction was posted.

## Full suite

The full suite ran once against disposable local PostgreSQL with an existing schema-only fixture, not an application database: **6,341 passed, 0 failed, 3 skipped**. All **543 test files** matched the discovered inventory, with none missing. The skips are the two opt-in labour PostgreSQL tests and the standalone VB23B browser fixture server.

The development app restarted and serves on port 5000. Signed-in tracker screens were verified by fixture render tests, not in a signed-in browser. No schema or operational data changed; nothing was published.
