# Diesel/HSD Negative-Balance Periods and Duplicate Receipt Status

**Task:** #1433, Parts A2/A3/A4 only  
**Production snapshot queried:** 31-Aug-2026, refreshed after ledger activity through 05:05:17 UTC  
**Scope:** Diesel/HSD stock owned by HIGH LANE CONSTRUCTIONS (HLC, party ID 1), from 07-Aug-2026 onward  
**Method:** read-only `SELECT` queries against the production replica  
**Production/application changes:** none

## Executive findings

1. The refreshed production ledger contains **four negative-balance periods** after physical-stock reconciliation PSR-0001 reset the HLC Diesel balance from 881.370 L to 0 on 07-Aug-2026.
2. On an effective-date/source-time reconstruction, the crossings were:
   - 08-Aug: Equipment Usage 160, 10 L, 0 to -10 L;
   - 26-Aug: Equipment Usage 165 (DPR 307), 20 L, 15 to -5 L;
   - 28-Aug: DPR equipment usage ledger 182304 / equipment log 700 (DPR 312), 20 L, 0 to -20 L;
   - 30-Aug: Equipment Usage 177 (DPR version 316), 20 L, 5 to -15 L.
3. The next genuine receipts restoring a positive balance were respectively Receipt 132 (145 L), Receipt 135 (130 L), Receipt 136 (165 L), and Receipt 139 (40 L).
4. The refreshed quantity-based reconstruction finishes at **5.000 L**, exactly matching the current `stock_balances` row.
5. Stored `balance_after` cannot by itself be read as an effective-date history. Fourteen later-created `dpr_equipment_usage` rows have null balances, and backdated Receipt 140 plus the 30-Aug DPR-version postings create additional row-level differences between stored and effective running balances.
6. Receipt **137 / RECV/DSL/26-27/0009** remains a 165 L, 29-Aug-2026, draft, unlinked receipt duplicating the supplier/vehicle/challan/quantity evidence of linked Receipt 136. Current balance is now **5 L**; safe reversal still needs 165 L, so the exact shortfall is now **160 L**.
7. Root-cause audit identified the former `reconcileEquipmentUsageLedger()` maintenance path as unguarded: it backfilled `equipment_usage` ledger deductions for every diesel-issued row, including `dieselSource='direct_purchase'`. That incorrectly deducted direct-purchase rows (including the historical 160/161 class) from Plant Stock and was a direct contributor to the negative balances.
8. Since the prior 95 L / 70 L snapshot, production added backdated genuine Receipt 140 (+30 L), added four 30-Aug equipment-usage deductions (-240 L), and no longer contains the two 30-Aug `dpr_equipment_usage` rows previously totaling -120 L. The net change is **-90 L**, explaining 95 L to 5 L and 70 L to 160 L.

## 1. Boundary and opening position

The only Diesel/HSD material in the relevant production rows is material ID 8, `DIESEL`. Every ledger row from the reporting boundary belongs to HLC (party 1); no Plant Common/null-party Diesel/HSD ledger row is involved.

PSR-0001 establishes the opening point:

| Field | Production value |
|---|---|
| Session / ledger | PSR-0001, session 1 / ledger 133175 |
| Effective count date | 07-Aug-2026 |
| Posted at | 07-Aug-2026 09:13:03.298 UTC (14:43:03.298 IST) |
| Ledger created | 07-Aug-2026 09:13:00.555 UTC (14:43:00.555 IST) |
| Old balance | 881.370 L |
| Physical quantity | 0.000 L |
| Adjustment | -881.370 L |
| Result | 0.000 L |
| Reason | Material exhausted and financially settled |
| Posted by | Sunil kumar |

All running balances below start from that documented zero.

## 2. Ordering and reconstruction method

The production model has two different order concepts:

- `stock_ledger.date` is the effective business date but contains no time.
- A source receipt can supply `material_receipts.time`; some equipment rows supply `start_time`; most relevant DPR-derived equipment rows do not.
- `stock_ledger.created_at` is posting/insertion time. Historical backfills caused many ledger rows to be created days after their effective dates.
- `balance_after` records the balance used or recomputed by the posting path at that point; it is not consistently an effective-date/as-of balance.

The effective reconstruction therefore uses:

1. business date;
2. a genuine source time when one exists;
3. otherwise the source grouping and ledger/source record order, explicitly marked as ambiguous;
4. `quantity_in - quantity_out` for every production ledger row.

For same-day reconstruction, genuine receipts are placed at their recorded receipt times. DPR/equipment rows without a start/end time retain only a date-level effective position. Where a DPR source creation timestamp helps explain likely sequence, it is reported as creation evidence, not silently promoted to an effective transaction time.

### Quantity reconciliation by effective date

| Effective date | Net movements and reconstructed closing balance |
|---|---|
| 07-Aug | PSR-0001 -881.370; closes **0.000** |
| 08-Aug | direct-purchase pairs net 0; equipment deductions -30; closes **-30.000** |
| 14-Aug | DPR deductions -35; closes **-65.000** |
| 15-Aug | direct-purchase pairs net 0; equipment deductions -30; closes **-95.000** |
| 16-Aug | genuine Receipt 130 +40; closes **-55.000** |
| 17-Aug | genuine Receipt 131 +40; DPR deductions -30; closes **-45.000** |
| 18-Aug | newly posted, backdated genuine Receipt 140 +30; closes **-15.000** |
| 26-Aug | genuine Receipt 132 +145; equipment deductions -135; DPR deductions -135; closes **-140.000** |
| 27-Aug | genuine Receipt 134 +140; closes **0.000** |
| 28-Aug | genuine Receipt 135 +130; equipment deductions -130; DPR deductions -130; closes **-130.000** |
| 29-Aug | genuine Receipt 136 +165; duplicate Receipt 137 +165; DPR deductions -145; closes **55.000** |
| 30-Aug | genuine Receipt 138 +150; four equipment deductions -240; closes **-35.000** |
| 31-Aug | genuine Receipt 139 +40; closes **5.000** |

Fresh totals from 07-Aug onward are 1,045.000 L in and 1,921.370 L out, plus the 881.370 L balance existing immediately before PSR-0001. Equivalently, from PSR's resulting zero: receipts of 1,045 L less 565 L `equipment_usage` and 475 L `dpr_equipment_usage` deductions produce **5 L**. The four `direct_purchase` rows contain equal in/out quantities totaling 60 L and have zero net effect.

## 3. Every negative-balance period

| Period | Crossing transaction | Balance before | Deduction | Result | Next genuine receipt restoring `> 0` | Balance before / after receipt | Effective elapsed gap |
|---:|---|---:|---:|---:|---|---:|---|
| 1 | Ledger 180913; `equipment_usage`; ref 160; 08-Aug-2026 09:34 | 0.000 | 10.000 | **-10.000** | Receipt 132 / `RECV/DSL/26-27/0004`; 26-Aug-2026 08:48; 145 L | -15.000 / **130.000** | **17 days 23 h 14 m** |
| 2 | Ledger 172714; `equipment_usage`; ref 165; 26-Aug-2026, no source time | 15.000 | 20.000 | **-5.000** | Receipt 135 / `RECV/DSL/26-27/0007`; 28-Aug-2026 07:37; 130 L | 0.000 / **130.000** | Exact time unavailable; 2 calendar dates, bounded about **31 h 38 m to 55 h 37 m** |
| 3 | Ledger 182304; `dpr_equipment_usage`; ref -700 / equipment log 700; 28-Aug-2026, no source time | 0.000 | 20.000 | **-20.000** | Receipt 136 / `RECV/DSL/26-27/0008`; 29-Aug-2026 07:42; 165 L | -130.000 / **35.000** | Exact time unavailable; next-date recovery, bounded about **7 h 43 m to 31 h 42 m** |
| 4 | Ledger 182315; `equipment_usage`; ref 177; 30-Aug-2026 09:22 | 5.000 | 20.000 | **-15.000** | Receipt 139 / `RECV/DSL/26-27/0011`; 31-Aug-2026 08:05; 40 L | -35.000 / **5.000** | **22 h 43 m** |

The bounds use the full possible day when the crossing source has no effective time; they are not claims of an exact event time.

### Period 1 detail

The crossing source is Equipment Usage 160:

- Effective date/time: 08-Aug-2026 09:34 (end 10:30).
- Equipment: TRACTOR DOZER, TS 34TA 8581.
- Recorded quantity/source: 10 L, `direct_purchase`.
- Site: THAKKADPALLY - SIRUR.
- Fuel station/bill: BPCL DURGABHAVANI / H0431.
- Source record created: 08-Aug-2026 13:21:54.619 UTC (18:51:54.619 IST).
- Crossing ledger created much later: 30-Aug-2026 17:11:11.492 UTC (22:41:11.492 IST).
- Stored `balance_after`: -10.000 L, matching the effective reconstruction.

The period deepened through Equipment Usage 161 (-20), 14-Aug DPR deductions (-35), and 15-Aug equipment deductions (-30), reaching -95 L. Receipt 130 on 16-Aug raised it only to -55 L; Receipt 131 on 17-Aug and subsequent DPR deductions left -45 L. Newly posted Receipt 140 is effective 18-Aug-2026 08:28 and added 30 L, but left the bucket at -15 L. It is Receipt 140 / `RECV/DSL/26-27/0012`, supplier DURGA BHAVANI, challan H1283, linked to Diesel Requirement 34, source/ledger created 31-Aug-2026 04:59:09.043 UTC. Receipt 132 remains the first genuine positive recovery:

- Receipt 132 / `RECV/DSL/26-27/0004`;
- effective 26-Aug-2026 08:48;
- 145 L, DURGABHAVANI, challan H1527, HLC;
- linked to Diesel Requirement 35;
- source and ledger creation 26-Aug-2026 03:21:27.623 UTC;
- reconstructed result 130 L, while the pre-existing stored ledger balance remains 100 L because Receipt 140 was posted later with an earlier effective date.

### Period 2 detail

The crossing source is Equipment Usage 165, generated in the DPR 307 group:

- Effective date: 26-Aug-2026; no start/end time is stored.
- Equipment: TRACTOR DOZER, TS 34TA 8581.
- Quantity/source: 20 L, `plant_stock`.
- DPR/site/task: DPR 307, TAKKADPALLY-SIRUR, DOZING.
- DPR submitted text: 26-Aug-2026 21:21:10.
- Source and crossing-ledger creation: 26-Aug-2026 15:51:12.772 UTC (21:21:12.772 IST).
- Prior event balance: 15 L after Receipt 132 raised the balance to 130 L and Equipment Usages 163/164 deducted 115 L.
- Stored `balance_after`: -35 L; the refreshed effective reconstruction is -5 L, the 30 L difference caused by later-posted backdated Receipt 140.

Three later-created `dpr_equipment_usage` rows for DPR equipment-log IDs 687/688/689 deducted another 135 L and took the reconstructed balance to -140 L. Receipt 134 on 27-Aug added 140 L and reached exactly zero, not above zero. The first positive recovery was:

- Receipt 135 / `RECV/DSL/26-27/0007`;
- effective 28-Aug-2026 07:37;
- 130 L, DURGABHAVANI, vehicle 0505, challan H2023, HLC;
- linked to Diesel Requirement 37;
- source created 28-Aug-2026 02:09:13.632 UTC (07:39:13.632 IST);
- ledger created 28-Aug-2026 02:43:45.848 UTC (08:13:45.848 IST);
- reconstructed result 130 L; stored result 100 L predates the backdated Receipt 140 posting.

If the crossing ledger creation time is used only as a proxy, the gap to Receipt 135's effective time is approximately 34 h 15 m 47 s. The source has no effective time, so the table correctly leaves exact elapsed time unavailable.

### Period 3 detail

The crossing source is the first date-level DPR ledger deduction after the 28-Aug equipment group: ledger 182304, reference -700, sourced from equipment log 700 in DPR 312:

- Effective date: 28-Aug-2026; no start/end time is stored.
- Equipment: TRACTOR DOZER, TS 34TA 8581.
- Quantity/source: 20 L, `plant_stock`.
- DPR/site/task: DPR 312, TAKKADPALLY-SIRUR, DOZING.
- Source created: 29-Aug-2026 00:46:36.043 UTC (06:16:36.043 IST), backdated to 28-Aug.
- Ledger created: 31-Aug-2026 04:21:26.172 UTC (09:51:26.172 IST).
- Prior balance: zero after Receipt 135 raised the balance to 130 L and Equipment Usages 173/174/175 deducted 130 L.
- Stored `balance_after`: null.

The remaining `dpr_equipment_usage` rows for equipment logs 698/699 reduced the balance from -20 L to -130 L. The first genuine positive recovery was:

- Receipt 136 / `RECV/DSL/26-27/0008`;
- effective 29-Aug-2026 07:42;
- 165 L, DURGABHAVANI, vehicle 0505, challan H1733, HLC;
- linked to Diesel Requirement 38;
- source created 29-Aug-2026 02:14:31.499 UTC (07:44:31.499 IST);
- ledger created only on 31-Aug-2026 02:58:03.538 UTC (08:28:03.538 IST);
- reconstructed result 35 L; stored result 25 L.

The crossing ledger was inserted after the recovery had already occurred in business time, demonstrating why a creation-time-only history is invalid.

### Period 4 detail

After 29-Aug closed at 55 L, Receipt 138 added 150 L at 07:43 on 30-Aug, producing 205 L. Four new `plant_stock` Equipment Usage rows then recorded two copies of the same 100 L Excavator and 20 L Soil Compactor work:

- refs 176/177 belong to admin-edited DPR version 316, created 31-Aug-2026 05:03:32.399 UTC;
- refs 180/181 belong to admin-edited DPR version 317, created 31-Aug-2026 05:05:16.523 UTC;
- both DPR versions derive from superseded DPR 315 and carry the same 30-Aug start times, equipment, tasks, and quantities.

Using source start time first, the two 100 L Excavator events at 09:07 reduce 205 L to 5 L. Equipment Usage 177 is the first 09:22 Soil Compactor event and crosses from 5 L to -15 L; Usage 181 then reaches -35 L. Ledger 182315 / ref 177 was created at the same timestamp as its source, 31-Aug-2026 05:03:32.399 UTC. Its stored `balance_after` is 125 L because posting order was 176, 177, 180, 181 rather than source-time order. If posting order is used, ref 180 is instead the crossing row; this is a same-day ordering ambiguity, not a change in the -35 L closing quantity.

The first genuine positive recovery is Receipt 139 / `RECV/DSL/26-27/0011`, effective 31-Aug-2026 08:05, 40 L, DURGA BHAVANI, challan H1859, linked to Diesel Requirement 40. It raises -35 L to 5 L after 22 h 43 m.

## 4. Stored `balance_after` and ordering reconciliation

The following distinctions are material:

1. **Backfilled rows.** Effective 08-Aug ledger rows were inserted on 24 and 30 Aug; effective 14/17/26/28/29 DPR rows were inserted on 31 Aug; Receipt 140 was created on 31 Aug with an 18-Aug effective date; and four 30-Aug Equipment Usage rows were created on 31 Aug. Creation order therefore does not represent operational order.
2. **Null DPR balances.** All 14 current `dpr_equipment_usage` rows (475 L out) have null `balance_after`. They still carry quantities and are included in the quantity-based running sum. Omitting them would not reconcile to the live stock row.
3. **Receipt 136/137 posting-order artifact.**
   - Receipt 136 is the genuine linked 07:42 receipt. Effective ordering gives it a prior balance of -130 and a result of **35 L**, but its stored `balance_after` is **25 L**.
   - Receipt 137 is the later duplicate 21:06 receipt. With Receipt 136 already effective and before the approximately 21:09 DPR 314 source group, effective ordering gives it a result of **200 L**, but its stored `balance_after` is **5 L**.
   - The values make sense only in the historical posting/backfill sequence: Receipt 137's ledger was created on 30 Aug while Receipt 136's ledger was not backfilled until 31 Aug. The values must not be interpreted as chronologically adjacent as-of balances.
4. **Receipt 140 effects.** Receipt 140's stored `balance_after` is 125 L because it added 30 L to the then-current 95 L at posting time. In effective order it lies on 18-Aug and changes -45 L to -15 L. Existing later rows were not rewritten, so several stored balances from 26-Aug onward remain 30 L below the refreshed effective running sum.
5. **30-Aug ordering.** The four new equipment rows have stored balances 145, 125, 25, and 5 L in posting order 176/177/180/181. Their source start times instead order both 100 L rows at 09:07 before both 20 L rows at 09:22. Both orderings close at -35 L, but they identify a different crossing row and prove that `balance_after` is not an effective-time sequence.
6. **Final proof.** Independently summing every current in/out quantity from PSR-0001's zero gives 5 L, exactly equal to current HLC Diesel `stock_balances.balance`. Thus the final total reconciles even though row-level stored history is incomplete or non-chronological.

The mirrored DPR groups deserve explicit operational review: DPR 307 appears as Equipment Usage refs 163/164/165 and later `dpr_equipment_usage` refs -687/-688/-689 for the same equipment quantities (80/35/20 L); DPR 312 similarly appears as Equipment Usage refs 173/174/175 and later refs -698/-699/-700 (100/10/20 L). The fresh snapshot also has DPR versions 316 and 317 posting duplicate 100/20 L sets as refs 176/177 and 180/181. This report includes every current ledger quantity because production balance does. It does not silently decide whether paired representations were intended or duplicated, and it makes no historical correction.

### Change from the prior snapshot

The prior report snapshot reconciled to 95 L using receipts 1,015 L, Equipment Usage deductions 325 L, and DPR deductions 595 L. The refreshed snapshot contains:

- Receipt 140: +30 L, effective 18-Aug, created 31-Aug 04:59:09.043 UTC;
- Equipment Usage refs 176/177: -120 L, created 31-Aug 05:03:32.399 UTC;
- Equipment Usage refs 180/181: -120 L, created 31-Aug 05:05:16.523 UTC;
- no current 30-Aug `dpr_equipment_usage` refs -725/-726, which previously totaled -120 L.

The net snapshot change is `+30 - 120 - 120 + 120 = -90 L`. Therefore current stock moved from 95 L to 5 L. This report describes the production snapshots only; it does not claim that removal/replacement of rows is a valid historical correction.

## 5. Receipt 137 / `RECV/DSL/26-27/0009` reconfirmation

The production record remains:

| Field | Value |
|---|---|
| Database ID / reference | 137 / `RECV/DSL/26-27/0009` |
| Effective receipt date/time | 29-Aug-2026 21:06 |
| Source record created | 29-Aug-2026 15:38:16.460 UTC (21:08:16.460 IST) |
| Ledger ID / created | 180922 / 30-Aug-2026 17:30:34.754 UTC (23:00:34.754 IST) |
| Material / quantity / UOM | DIESEL / 165 L / Liters |
| Owner | HIGH LANE CONSTRUCTIONS, party 1 |
| Supplier | DURGABHAVANI |
| Transporter | DINESH |
| Vehicle | 0505 |
| Challan | H1733 |
| Linked Diesel Requirement | **none** |
| Document status | **draft** |
| Deleted / cancelled | no / no |
| Audit rows for Receipt 137 | none returned |

Receipt 136 / `RECV/DSL/26-27/0008` has the same supplier, vehicle, challan and 165 L quantity. It is the genuine linked receipt at 07:42, linked to purchased Diesel Requirement 38. Requirement 38 records 165 L purchased from DURGABHAVANI against bill H1733; Receipt 136 is the receipt satisfying that purchase. Receipt 137 remains the later standalone/unlinked duplicate record.

**Status clarification:** Receipt 137 is a **draft**, but draft Material Receipts post their stock and ledger effect when they are created; its draft status does not mean the 165 L credit is absent from Plant Stock. The live cancellation requests reviewed in this investigation targeted Receipt **137**. Receipt **136** was the only final-submitted row of the pair and was not the cancellation target.

## 6. Current balance, reversal shortfall, and correction sequence

Current production HLC Diesel balance is **5.000 L**, last updated 31-Aug-2026 05:05:17.449 UTC. Receipt 137 credited **165.000 L**. Therefore:

`165.000 L required - 5.000 L available = 160.000 L shortfall`

The previous snapshot found 95 L available and a 70 L shortfall. The available balance has fallen by 90 L, and the exact reversal shortfall has increased by 90 L to 160 L. Receipt 137 itself is unchanged.

Unrelated later receipts must not be treated as documentary support or reserved “room” for reversing the duplicate. Receipt 140 is a separately evidenced, linked historical receipt, while Receipts 138 (150 L, 30-Aug) and 139 (40 L, 31-Aug) are separate deliveries; none converts Receipt 137 into a valid receipt or can be recharacterized as its support.

The existing safe cancellation mechanism remains the only duplicate-correction path once genuine stock supports the full 165 L reversal. It must not be bypassed, weakened, or replaced by a manual balance/ledger edit.

## 7. Evidence required for any omitted genuine historical delivery

Before PM/Admin records or approves any allegedly omitted historical delivery, they must provide all of:

1. actual delivery **date and time**;
2. **supplier**;
3. delivery **vehicle number**;
4. **challan and/or invoice reference**;
5. delivered **quantity and UOM**;
6. receiving **party/site**;
7. the supporting source document (challan, invoice, weighment/delivery evidence, or equivalent).

PM/Admin should additionally reconcile that evidence against existing receipts, the relevant Diesel Requirement/purchase, supplier references, and vehicle/challan combinations so that Receipt 136/137 evidence is not submitted again under a new record. Only a genuinely omitted delivery, supported by contemporaneous evidence and assigned its actual historical effective date/time, can be considered. A later unrelated receipt, an unsupported balancing entry, or a receipt created solely to manufacture reversal headroom is not acceptable evidence.

## 8. Read-only assurance

All production access for this report used parameterized, read-only `SELECT` queries against the production replica. No production row was inserted, updated, cancelled, voided, deleted, or otherwise changed. No application code was edited, no workflow was run or restarted, and nothing was published.

## 9. Final audit status

The historical finding remains read-only: no production correction was made. The application maintenance-path finding is now explicit: reconciliation must backfill only `plant_stock` equipment fuel, and each such deduction must pass the same locked Diesel stock sufficiency control as live consumption. `direct_purchase` equipment fuel must never create a Plant Stock ledger deduction.