# STARTUP-VERIFY-01 — read-only findings

## Recommendation

**Do not treat this batch as clearance to publish.** Keep the approved startup-removal decision. No repairs should be re-enabled. Build passed and neither audited database had an immediately colliding next ID, but the complete regression run and empty-database boot are blocked by the explicit prohibition on sequence advancement, including fixture databases. Current request-body insertion paths can also supply explicit IDs. Two missing-material dispatch cases still rely on later repair for completeness.

No application source, database data, sequence, startup call, or production deployment was changed by this batch. No application restart, authenticated browser request, repair, migration, cleanup, or fixture database was run. Report files and the read-only evidence collector are the only work products. Production was queried exclusively through the existing SELECT-only replica facility, which reported `transaction_read_only=on`; no production connection string was requested or used.

## A — Regression and build

**Complete suite: BLOCKED, not run.** Fresh passed/failed/skipped counts and a fresh comparison with the 48 failure identities cannot honestly be supplied. This is not a zero-failure result.

Preflight found `tests/dprSections13.integration.test.ts:37–61` creates PGlite tables from the real serial schema; lines 144, 184–186 and other cases insert without IDs. Those operations advance real PostgreSQL-compatible fixture sequences. The instruction prohibits that **in any database, for any reason**. An isolated database or rollback would not resolve this conflict. No files were silently excluded to call a subset “complete.” Individual environmental-failure reruns are consequently also unperformed. Separate permission for disposable fixture database writes/sequence advancement is needed before the complete suite can run.

For historical context only, `reports/dpr-eqlink01/regression-summary.json` recorded 4,788 passed / 52 failed / 3 skipped across 351 files. Its four additional failures against the historical 48 were:

1. `tests/dieselPurchase06m.test.ts` — `06M diesel purchase attachments allows Stores viewers to read the register data and diesel evidence`.
2. `tests/dieselStockGuard06mB.test.ts` — `Task #1433 remaining public and maintenance writers excludes exact Diesel/HSD and unverified materials from orphan-adjustment startup cleanup`.
3. `tests/dprBreakdownPersistence1430.test.ts` — `Task #1430 DPR breakdown persistence wiring authorizes maintenance parts, attachments, health and counts through one source scope`.
4. `tests/permission-map.test.ts` — `generated permission editor contract matches a fresh source audit and detects deliberately corrupted output`.

These are explicitly **not fresh results** and cannot establish the current failure inventory.

**Build: PASS.** An immutable `git archive` of starting HEAD was compiled under `/tmp/startup-verify-snapshot`, with an empty inherited environment except PATH/HOME/NODE_ENV, using the installed dependencies. `npm run build` compiled client and server without starting either. Output is in `build.log`; large-chunk warnings remain. Workspace build outputs and source were not regenerated.

## B — Every development and production ID sequence

Full row-by-row tables:

- `development-sequences.json`: **140** ID-owned sequences in `sitelog_dev`, collected within `BEGIN READ ONLY` with read-only connection defaults.
- `production-sequences.csv` / `production-sequences.json`: **141** sequences, including the platform migration sequence, from the authorized read-only production facility (`neondb`).
- `production-catalog.json`: increments, caches and cycle flags.

Each includes table, sequence, last_value, is_called, MAX(id), increment, next candidate and actual candidate-existence test. CSV/ development JSON also include **gap = last_value − MAX(id)**; blank/null means an empty table. Every observed increment/cache is 1 and cycle is false.

**Neither snapshot contains a next candidate at or below its table's MAX(id), or an immediate candidate collision. No per-table sequence correction is indicated by these snapshots.** Equality between last_value and MAX(id) is normal when is_called=true: the next candidate is MAX+1. A candidate below MAX is a risk, not necessarily an immediate duplicate if that particular ID is a hole; this audit tested actual existence too.

No `nextval`, `setval` or sequence alteration was executed. Sequence state is not MVCC-stable; concurrent legitimate activity and replica lag mean this is a point-in-time observation, not a guarantee for future inserts. Explicit user-supplied IDs can still collide independently of default sequence allocation.

The original reset implementation lists **40**, not 42, table names (`storage.ts:22359–22382`). Names such as `notifications`, `personnel_assignments`, and `ldo_flow_meter_readings` differ from the current corresponding table names; swallowed exceptions prevent its success message proving complete coverage.

## C — Drift, explicit IDs and reuse

### C1/C2: the “no explicit IDs” premise does not hold

`insert-inventory.json` inventories 434 `.values(...)` call sites across tracked server/migration/script files. `raw-insert-search.txt` records raw SQL / identity-override / sequence-reset search hits, including verification tooling. No literal top-level `{ id: ... }` application insert was found by the AST call-site search; two textual `id:` hits are nested metadata and a conditional expression, not top-level inserted IDs. No `OVERRIDING SYSTEM VALUE` application SQL was found.

However, **dynamic spreads are sufficient to supply IDs**. These routes directly forward `req.body` into methods that spread or insert it without stripping `id`:

| Route line in server/routes.ts | Storage method/line | Target |
|---|---|---|
| 4010 | createParty 5475 | parties |
| 4052 | createPlantMaterial 5552 | plant_materials |
| 4160 | createMixType 5586 | mix_types |
| 4543 | createEquipment 5772 | equipment_master |
| 5328 | createTruckDispatchWithStockDeduction 9470, insert 9796 | truck_dispatches |
| 6183 | createGeneratorLog 8116 | generator_logs |
| 13190 | createStoreItem 27096 | store_items |
| 22372 | createPlanningEquipmentType 32542 | planning_equipment_types |
| 22414 | createPlanningLabourType 32565 | planning_labour_types |

TypeScript `Insert...` types are not runtime input filtering. PostgreSQL serial columns accept explicit IDs. A permitted caller supplying a currently unused high ID through these paths bypasses sequence advancement. This was established statically, **not tested with a write**. The rate-card request-body path was inspected as a counterexample: its explicit field allowlist excludes IDs.

SNL importers inspected build inserts with selected business fields, not imported primary IDs. The search also found an explicit `(id,...)` insert in `scripts/task1474-real-regression.test.ts:641`: a synthetic verification fixture, not ordinary startup. The complete call-site inventory is retained; a complete interprocedural proof for every dynamically constructed payload was not obtained, so the table above is the confirmed set, not a claim that all other dynamic paths are safe.

Default-ID inserts themselves advance the sequence normally. Drift can ALSO result from resetting a sequence downward, restores/imports or sequence reconfiguration; explicit IDs are not the only theoretical cause. Narrow proposed remedy: runtime-parse/allowlist create payloads, excluding primary IDs, and handle any genuinely required ID-preserving import as separately authorized maintenance. Do not restore blanket startup resets.

### C3: hard deletion and unprotected references

Hard deletes exist in the reset's scope: equipment_logs replacement/deletion (`storage.ts:4131,4242,5137`), truck_dispatches deletion (`6560`), equipment_usage deletion (`8100,24379,24506`) and stock-ledger cleanup/purging (`10551` and retired repair bodies).

Unprotected identities include `equipment_logs.plant_usage_id` (`schema.ts:242`), `equipment_usage.source_usage_id` (`721`), polymorphic `stock_ledger.reference_id`, and text `vendor_bill_items.source` values such as `auto:site_material_trip:<id>` (see storage 17664–17668 and shared/vendorBillArrangement.ts:73). Development catalog inspection found no FK on the first two fields; the bill-items FK returned by that query covers hire_statement_id, not the source text.

Read-only counts: development has **0 dangling plant_usage_id / 0 dangling source_usage_id**; production has **2 / 0**, respectively (`production-references.json`). These counts do not prove the historical cause, and an already-reused ID can conceal a wrong association rather than remain dangling.

If the highest records are deleted, resetting to the remaining MAX lowers the sequence and permits reuse. An old unprotected reference can then identify the new, unrelated row. Example already visible in production: stock_ledger last_value **266441**, MAX **266405**; the removed reset would lower it by **36**. That gap alone does not prove deletions (failed/rolled-back inserts also consume IDs), nor establish that a specific existing reference was reassigned.

### C4: asynchronous reset hypothesis

**Plausible cause, not proven incident causation.** The old reset was in background phase 1 after listen, while route registration also starts asynchronous seeding. A writer can allocate an ID beyond visible MAX while its transaction is uncommitted; another connection's MAX-based reset can rewind allocation and a later insert collide. This does not require explicit-ID inserts. The earlier memory records a symptom, not SQL timing/transaction traces proving which reset caused it. Removing the reset eliminates that particular startup hazard.

## D — All 33 removed calls, plus inline cleanup

The attached instruction lists 25 names; the actual diff/inventory has 33. `removed-inventory.json` and `removal.diff` reconcile the eight additional names. The following classifications concern current write paths, not whether old stored data is clean. UNCERTAIN is not a safety approval.

| Removed method (storage.ts line) | Classification | Write-path evidence / limitation |
|---|---|---|
| resetAllSequences (22359) | UNCERTAIN | No current collision, but unfiltered explicit-ID paths above remain. It was neither globally necessary nor a safe protection. |
| backfillDispatchNotes (25314) | HISTORICAL | Current dispatch builds mix/delivery labels at 9598 and writes notes with ledger rows. |
| backfillBitumenTankNumbers (25609) | HISTORICAL | Dispatch plan carries tank at 9610; receipt ledger copies tank at 6019. |
| migrate6mmDownUomFix (25478) | HISTORICAL | Targets specific old opening IDs 19/2; current receipt converts configured UOM before balance/ledger posting at 5980–6019. |
| purgeOrphanedDeletionReversals (10551) | UNCERTAIN | Current deletion/reconciliation paths still exist; exhaustive reversal lifecycle equivalence was not demonstrated. |
| backfillMissingDispatchAggregateRows (25972) | HISTORICAL | Current CREATE derives component quantities at 9498 and posts positive plan entries at 9618, then links all inserted ledger IDs in the same transaction. Missing/zero template components remain a setup caveat. |
| cleanupGhostDispatchLedgerRows (26055) | UNCERTAIN | Ordinary dispatch is transactional, but template rebuild and deletion paths require broader lifecycle coverage before excluding new ghosts. |
| deduplicateStockLedgerDispatchRows (20675) | HISTORICAL | CREATE links ledger IDs before transaction commit; retained unique dispatch index guards material/party/reference duplicates. Existing index presence still matters. |
| fixDoubleDeductedDispatchOwnerRows (20729) | HISTORICAL | Current owner-first branch posts only actual owner availability, then remainder to HLC; zero-owner marker is zero, not a second positive deduction (9720–9768). |
| backfillDispatchReferenceIds (25393) | HISTORICAL | CREATE updates every captured ledger ID with result.id at 9816–9821 within the same transaction. |
| backfillMissingDispatchBitumenRows (25706) | LOAD-BEARING, conditional | CREATE silently omits bitumen when lookup finds no material despite positive theoretical demand (9592–9612). After catalog restoration the removed routine can fill it if another dispatch ledger row exists. Normal configured CREATE already posts it. |
| deduplicateLdoDipReadings (20307) | UNCERTAIN | Current heating write deletes/reinserts source-linked rows and uses onConflictDoNothing; schema has unique date/tank/type/plant. Full deployed uniqueness/NULL/source interaction was not verified. |
| deduplicateLdoFlowSlotReadings (20341) | UNCERTAIN | Heating writes source-linked meter rows at 24433–24455, but complete cross-source uniqueness under concurrency not established. |
| backfillLdoFlowReadingsFromHeatingSessions (20159) | HISTORICAL | Current heating save emits opening/closing source-linked readings at 24433–24455. |
| backfillLdoReceiptsFromMaterialReceipts (20377) | HISTORICAL | Receipt CREATE writes sourceMaterialReceiptId-linked flow receipt in same transaction (6022–6043) for tanked LDO/Diesel; barrel/no-tank exclusion is deliberate. |
| fixLdoDispatchTankNumbers_v1 (26493) | HISTORICAL | Current dispatch explicitly supplies ldoTankNumber/default 1 in plan at 9615. |
| backfillLdoHeatingConsumption_v1 (26511) | HISTORICAL | Superseded model: heating records meter evidence, not stock consumption; dispatch posts LDO. |
| backfillLdoShiftMeterConsumption_v1 (26569) | HISTORICAL | Superseded model: shift readings are evidence, dispatch is stock consumption. |
| fixLdoStockDeductionErrors (20434) | HISTORICAL | Obsolete dip model conflicts with dispatch posting; dip ledger helper immediately returns at 13945. Must not run as replacement for current posting. |
| fixLdoDataIssues (26217) | UNCERTAIN | Historical correction exists but no exhaustive proof that all current receipt/edit conversions cannot reproduce its conditions. |
| fixHlcLdoStockBalance (26254) | UNCERTAIN | CREATE adjusts balance transactionally, but all current correction/rebuild paths were not proved equivalent to ledger totals. |
| backfillLdoDispatchConsumption_v1 (26300) | HISTORICAL | Current configured dispatch posts LDO and links reference itself; absent-catalog exception is captured by missing-LDO row below. |
| fixAllLdoStockBalances_v1 (26353) | UNCERTAIN | New dispatch/receipt updates balances, but all later maintenance paths have not been proven consistent. |
| rebuildLdoDispatchLedger_v1 (26402) | HISTORICAL | Current dispatch creates labels, attribution and quantities on write; blanket historical rebuilding is not required for normal new CREATE. |
| migrateLdoToDispatchModelOnly_v3 (26655) | HISTORICAL | Converts old ledger model; new CREATE uses dispatch and dip helper has an early no-op return. Stale comments saying dip consumption is authoritative are not executable evidence. |
| backfillMissingDispatchLdoRows (25847) | LOAD-BEARING, conditional | CREATE skips LDO if exact-name lookup fails, despite positive demand (9595,9614). Later catalog restoration lets this repair fill the missing posting if another dispatch row exists. |
| migrateOrphanStockToHLC (10960) | UNCERTAIN | Current receipt permits null common-stock party; separating valid common stock from all historical orphan cases needs policy/lifecycle evidence beyond a name-based reassignment. |
| cleanupSupersededDprDieselLedger (11019) | UNCERTAIN | Current DPR cleanup helper exists (5060), but all version/cancel/reopen paths were not proven to eliminate every new duplicate case. |
| repairMissingSitePurchases (11084) | HISTORICAL | CREATE and update write supplied purchases (3504,4193); clone copies original purchases (4582). |
| repairLostDieselSource (11152) | UNCERTAIN | Current DPR source validation/copying exists, but a complete version-path proof of all source/evidence fields was not obtained. |
| migrateDprPlantStockDieselToLedger (11260) | UNCERTAIN | Current DPR posting uses shouldCreateDprEquipmentDieselLedger; overlap/version cases need fixture tests, which are blocked here. |
| recalculateAllDispatchConsumption (10346) | HISTORICAL | CREATE computes theoretical/actual/variance at 9482,9773–9814; update recomputes from current template at 6325 onward. Startup recalculation is not the only computation. Template edits changing historical meaning are a separate policy question. |
| fixBadStockBalanceEntries (22875) | HISTORICAL | Repairs specific legacy ledger IDs 245/8364; new receipt/dispatch posts its own balance/ledger atomically. |
| inline orphan-adjustment SQL | UNCERTAIN | Zeroes a historical note-pattern group; proving all current adjustment producers avoid that pattern's accounting error needs wider write-path tests. |

**Narrow proposals for the two LOAD-BEARING cases:** before dispatch insertion/stock posting, resolve each required material and reject missing/ambiguous bitumen or LDO mapping when consumption is positive. Persist all required postings and references atomically. Do not silently skip demand, invent a material, or restore startup repair. Existing affected rows would require their own separately approved, read-only-first maintenance plan.

**Schema:** the exact removal diff removes **no ensure* schema-creation call**. `ensureBoqCanonicalUnit` remains in index.ts:223 (it also updates historical canonical units, so is not pure DDL). `backfillShiftLogLockStatus` remains in routes.ts:22990. The dispatch dedup index creation remains. Other retained startup routines still write; the app's startup is not globally read-only.

**Empty database serving proof: BLOCKED.** It requires schema/data writes and sequence advancement. Static preservation of ensures cannot prove a fresh boot, particularly where ensures run after listen or catch errors. Separate explicit permission for disposable-database startup is needed; no empty database was created.

## E — What is where

- Starting workspace HEAD: **3b210b3339caa2dce34f47630311d6e04dd1d5c4**, initially clean. This is the prior code plus instruction assets.
- Live GitHub `refs/heads/main`, queried with `git ls-remote`: **ddf6fe12a2a2960812bb700317efa38016a66add** (`remote-before.txt`). This independently confirms the previously failed code push has since reached GitHub; local tracking-ref equality alone was not used.
- Published production source SHA: **UNKNOWN**. Deployment metadata reports an active successful autoscale build, but exposes no source SHA. The targeted available deployment log search returns revision-schema messages, not a commit. Consequently whether the published build contains **7fca52e61cab1513ba7c3f63f5d87262cab4f4fc is UNKNOWN**. Neither timestamp inference nor frontend asset similarity was substituted for proof.
- Final evidence commit and push outcome are recorded in `delivery.txt` after the attempted push. No publication was requested or performed.

## Remaining limits and required decisions

The complete suite and fresh boot need explicit relaxation for disposable test databases only; current limits were honored rather than bypassed. Published ancestry needs trusted publishing/build-source metadata. Confirmed input-ID and missing-material paths should be addressed through separately approved narrow write-path changes. UNCERTAIN classifications and incomplete exhaustive payload provenance are disclosed verification limits, not claims of safety. No follow-up tasks were created.
