# Diesel Stock Bucket and Receipt Investigation

**Investigation date:** 31-Aug-2026  
**Data source:** read-only queries against the live production database  
**Data changes made:** none

## Executive conclusion

The live production data does not contain a Diesel/HSD `Plant Common` stock bucket or any null-party Diesel/HSD ledger transaction. The reported **881.37 L** belonged to **HIGH LANE CONSTRUCTIONS (HLC, party 1)** and was reduced to zero by reconciliation **PSR-0001** on 07-Aug-2026.

Receipts `RECV/DSL/26-27/0008` and `RECV/DSL/26-27/0009` are separate database receipts for the same 165 L delivery evidence. `0008` is linked to Diesel Requirement 38; `0009` is an unlinked manual draft. Both added 165 L to the HLC stock bucket when created. The linked-receipt UI already hid its receipt action once a requirement was fully received, but the standalone receipt path remained available.

The current server does **not** enforce the instruction's assumed “cannot exceed pending quantity” rule. It validates a supplied requirement link, canonical Diesel/HSD material, and Liters UOM, but it does not reject cumulative receipt quantity above the requirement quantity. Shared status logic deliberately reports over-receipt as variance. This was investigated and reported only; duplicate-prevention behavior was not changed.

## 1. Display-label correction

The shared display rule now resolves stock owners as follows:

- Null-party `DIESEL` or `HSD` -> **Plant Common**
- Null-party non-diesel material -> **Unknown**
- Resolved non-null party -> the party's saved name
- Unresolved non-null party -> `Party <id>` / `Party #<id>` rather than Plant Common

The material-aware rule is used by:

- Plant Stock: Stock Summary, Current Balances, Ledger Details, visible ledger rows, Excel, PDF, and print
- Material Issues: visible cards, Excel, PDF, and print
- Material Receipts: visible cards/table, Excel, PDF, and print
- Diesel Procurement Report: visible receipt rows, Excel, and PDF

Plant Dispatches was deliberately not relabelled: its party field identifies the dispatch/job recipient and covers bitumen/LDO dispatch data, not a Diesel/HSD stock-owner row. Relabelling every null dispatch party as Plant Common would incorrectly relabel non-diesel records.

## 2. Diesel/HSD stock buckets and ledger history

### Current balances

| Bucket | Party ID | Current balance |
|---|---:|---:|
| HIGH LANE CONSTRUCTIONS | 1 | 95.000 L |
| VATPALLY... | 6 | 0.000 L |
| Plant Common | null | No balance row |

The party-6 zero balance has no matching Diesel/HSD ledger history. It is not the reported 881.37 L balance.

### Complete ledger allocation by owner

Production contains **219 Diesel/HSD ledger rows**, all allocated to **HIGH LANE CONSTRUCTIONS**. There are:

- **0 Plant Common/null-party rows**
- **0 party-6 Diesel/HSD ledger rows**

| Transaction type | Rows | First date | Last date | Quantity in | Quantity out |
|---|---:|---|---|---:|---:|
| Receipt | 75 | 16-Dec-2025 | 31-Aug-2026 | 6,233.148 L | 0.000 L |
| Equipment usage | 74 | 29-Dec-2025 | 28-Aug-2026 | 0.000 L | 4,069.000 L |
| DPR equipment usage | 31 | 04-Feb-2026 | 30-Aug-2026 | 0.000 L | 912.600 L |
| Direct purchase | 32 | 04-Feb-2026 | 15-Aug-2026 | 689.850 L | 689.850 L |
| Issue | 5 | 27-Jan-2026 | 18-Apr-2026 | 0.000 L | 127.180 L |
| Adjustment | 2 | 15-Feb-2026 | 07-Aug-2026 | 0.000 L | 1,029.368 L |

Direct-purchase ledger entries have equal in/out quantities and therefore no net stock effect.

### Date-level breakdown around the reported balance and duplicate receipts

All rows below belong to HLC; Plant Common has no corresponding entries.

| Date | Type | Rows | In | Out | Last recorded balance for that date/type |
|---|---|---:|---:|---:|---:|
| 19-Jul-2026 | DPR equipment usage | 2 | 0 | 28.600 | 884.240 |
| 19-Jul-2026 | Equipment usage | 1 | 0 | 14.340 | 912.840 |
| 20-Jul-2026 | Equipment usage | 1 | 0 | 2.870 | **881.370** |
| 25-Jul-2026 | Direct purchase | 2 | 14.390 | 14.390 | 881.370 |
| 03-Aug-2026 | Direct purchase | 1 | 20.000 | 20.000 | 881.370 |
| 07-Aug-2026 | Adjustment | 1 | 0 | **881.370** | **0.000** |
| 08-Aug-2026 | Direct purchase | 2 | 30.000 | 30.000 | 0.000 |
| 08-Aug-2026 | Equipment usage | 2 | 0 | 30.000 | -30.000 |
| 14-Aug-2026 | DPR equipment usage | 2 | 0 | 35.000 | -65.000 |
| 15-Aug-2026 | Direct purchase | 2 | 30.000 | 30.000 | -65.000 |
| 15-Aug-2026 | Equipment usage | 2 | 0 | 30.000 | -95.000 |
| 16-Aug-2026 | Receipt | 1 | 40.000 | 0 | -55.000 |
| 17-Aug-2026 | DPR equipment usage | 2 | 0 | 30.000 | -45.000 |
| 17-Aug-2026 | Receipt | 1 | 40.000 | 0 | -15.000 |
| 26-Aug-2026 | DPR equipment usage | 3 | 0 | 135.000 | -170.000 |
| 26-Aug-2026 | Equipment usage | 3 | 0 | 135.000 | -35.000 |
| 26-Aug-2026 | Receipt | 1 | 145.000 | 0 | 100.000 |
| 27-Aug-2026 | Receipt | 1 | 140.000 | 0 | -30.000 |
| 28-Aug-2026 | DPR equipment usage | 3 | 0 | 130.000 | -160.000 |
| 28-Aug-2026 | Equipment usage | 3 | 0 | 130.000 | -30.000 |
| 28-Aug-2026 | Receipt | 1 | 130.000 | 0 | 100.000 |
| 29-Aug-2026 | DPR equipment usage | 4 | 0 | 145.000 | -140.000 |
| 29-Aug-2026 | Receipt | 2 | **330.000** | 0 | 25.000 |
| 30-Aug-2026 | DPR equipment usage | 2 | 0 | 120.000 | 55.000 |
| 30-Aug-2026 | Receipt | 1 | 150.000 | 0 | 175.000 |
| 31-Aug-2026 | Receipt | 1 | 40.000 | 0 | 95.000 |

### Bucket recommendation

Do not move, merge, or reassign any current production stock data:

1. The live data has no Plant Common Diesel/HSD history to merge.
2. The 881.37 L balance and its 07-Aug adjustment are internally consistent within HLC.
3. Future null-party Diesel/HSD rows should display as Plant Common, but historical ownership should remain unchanged.
4. The party-6 zero balance can remain untouched; it has no quantity and no Diesel/HSD ledger movements.

## 3. Reconciliation review

### PSR-0001

- Count/posted date: 07-Aug-2026
- Material: Diesel/HSD item 9
- Owner: HLC, party 1
- Old balance: 881.37 L
- Physical quantity: 0 L
- Adjustment: -881.37 L
- Reason: “Material exhausted and financially settled”

No Plant Common row was included because production had no null-party Diesel/HSD balance or ledger history to count.

### PSR-0003

PSR-0003 was submitted on 07-Aug-2026 but contains no reconciliation items. It did not adjust HLC, Plant Common, or any other Diesel/HSD bucket.

## 4. Receipt `0008` / `0009` duplicate investigation

### Receipt `RECV/DSL/26-27/0008` (database ID 136)

- Business receipt date/time: 29-Aug-2026 07:42
- Database creation timestamp: 29-Aug-2026 02:14:31.499 UTC / 07:44:31.499 IST
- Quantity: 165 L Diesel/HSD
- Owner: HLC
- Supplier: DURGABHAVANI
- Vehicle: 0505
- Challan: H1733
- Linked Diesel Requirement: **38**
- Document status: submitted

### Receipt `RECV/DSL/26-27/0009` (database ID 137)

- Business receipt date/time: 29-Aug-2026 21:06
- Database creation timestamp: 29-Aug-2026 15:38:16.460 UTC / 21:08:16.460 IST
- Quantity: 165 L Diesel/HSD
- Owner: HLC
- Supplier: DURGABHAVANI
- Vehicle: 0505
- Challan: H1733
- Linked Diesel Requirement: **none**
- Document status: draft

There are no material-receipt audit rows for IDs 136 or 137, but the link has been creation-only since the linked-receipt feature was introduced; normal receipt edits strip `linkedDieselRequirementId`. The persisted null link on `0009`, together with its later standalone creation, identifies it as the manual/unlinked path.

### Related requirements

- Diesel Requirement 33: 17-Aug-2026, purchased 40 L; unrelated to either 165 L receipt.
- Diesel Requirement 38: 29-Aug-2026, purchased 165 L; linked only to receipt `0008`.

### Root cause and safeguard timing

- Linked Diesel receipt support entered source history on 15-Aug-2026.
- The Diesel PI bypass entered source history on 16-Aug-2026.
- Receipt validation refinements entered source history on 28-Aug-2026.
- Both receipts were created on 29-Aug-2026.
- The linked requirement UI hid “Record Receipt” after linked receipts reached fully received.
- `0009` did not use that linked flow; it was created through the separate standalone Material Receipt path.
- The server route did not, and still does not, reject a receipt merely because cumulative linked quantity exceeds the purchase quantity.
- Shared status logic explicitly permits over-receipt and reports it as variance.

Therefore the confirmed immediate duplicate path is the standalone unlinked receipt flow. The instruction's assumed server-side pending-quantity rejection is not present. This gap was not changed without approval.

## 5. Purchase-indent exemption and warning

The Diesel-linked receipt mode exempts an explicitly linked Diesel Requirement receipt from the normal purchase-indent requirement:

- PI auto-selection is skipped.
- The “No approved indent linked” block/warning is hidden.
- PI submit validation is bypassed.
- The regularisation notice is suppressed.

Receipt `0008` qualifies because it links to Diesel Requirement 38. Receipt `0009` has no requirement link, so its generic **“No approved indent linked”** warning is correct.

## 6. Reversal safety

No cancellation, deletion, reversal, balance, ledger, or reconciliation logic was changed.

Current cancellation/deletion behavior:

1. Locks the receipt row.
2. Resolves the same stock bucket originally credited (`isPlantCommon ? null : partyId`).
3. Locks that exact live stock-balance row.
4. Rejects the full reversal if available quantity is insufficient.
5. Uses an idempotent compensating ledger entry for cancellation and prevents double reversal.

Dedicated reversal and stock-guard tests pass.

## 7. Validation

- Focused label, Diesel receipt, reversal, and stock-guard tests: **5 files / 82 tests passed**
- Receipt reversal and stock sufficiency tests: 25 passed
- Full test suite: **121 files / 2,512 tests passed**
- Production build: passed
- `git diff --check`: passed
- Application workflow: settled restart completed and serving on port 5000 with no startup errors
- Browser console: Vite connected; automated preview had no authenticated session and received the expected 401
- Repository-wide `npm run check`: fails on the existing baseline of 482 TypeScript errors across 48 files. No reported error references `stockOwnerLabel.ts`, `PlantMaterialIssues.tsx`, `PlantMaterialReceipts.tsx`, or the edited label call sites.

Nothing was published. No production data was modified.