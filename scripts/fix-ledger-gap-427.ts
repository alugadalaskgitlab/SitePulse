/**
 * One-time data fix: Task #427 — 6mm Down ledger gap for LAXMI (dispatches 49 & 50).
 *
 * Problem: dispatches 49 and 50 (LAXMI, Apr 28 2026) had zero LAXMI stock when
 * created so fromOwner=0 and only HLC borrow entries were written.  getPartyStatement
 * reads LAXMI's ledger only, so both dispatches were invisible → 18.5 MT gap
 * (238.75 MT shown instead of correct 257.25 MT).
 *
 * Fix:
 *   1. Insert 0-qty "marker" ledger rows for LAXMI (party_id=6, mat=3) linking to
 *      dispatch 49 (11 MT template) and dispatch 50 (7.5 MT template).
 *      getPartyStatement reads theoreticalAggregates via referenceId to get templateQty,
 *      then counts the full amount as borrowedFromHlc.
 *   2. Correct the over-counted HLC borrow entries (20415 → 11 MT / ref=49;
 *      20434 → 7.5 MT / ref=50) so HLC's own ledger is also accurate.
 *   3. Recompute balance_after and reconcile stock_balances for material 3.
 *
 * Usage (production):
 *   npx tsx scripts/fix-ledger-gap-427.ts
 *
 * This script is idempotent — safe to run multiple times.
 */
import { db } from "../server/db";
import { stockLedger, stockBalances, parties } from "@shared/schema";
import { and, eq, inArray, sql } from "drizzle-orm";

const LAXMI_PARTY_ID = 6;
const HLC_PARTY_ID   = 1;
const MAT_6MM_DOWN   = 3;
const DISPATCH_49    = 49;
const DISPATCH_50    = 50;
const HLC_ENTRY_49   = 20415; // quantity_out was 12.32, correct is 11
const HLC_ENTRY_50   = 20434; // quantity_out was 14.85, correct is 7.5

async function recomputeBalanceAfterForMaterial(materialId: number) {
  const result = await db.execute(sql`
    WITH r AS (
      SELECT id,
        SUM(COALESCE(quantity_in, 0) - COALESCE(quantity_out, 0))
          OVER (PARTITION BY party_id, material_id ORDER BY date, id
                ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS nb
      FROM stock_ledger
      WHERE material_id = ${materialId}
    )
    UPDATE stock_ledger sl
    SET balance_after = ROUND(r.nb::numeric, 6)
    FROM r
    WHERE sl.id = r.id
      AND sl.balance_after IS DISTINCT FROM ROUND(r.nb::numeric, 6)
  `);
  return (result as { rowCount?: number }).rowCount ?? 0;
}

async function reconcileStockBalancesForMaterial(materialId: number) {
  const entries = await db.select().from(stockLedger)
    .where(and(
      eq(stockLedger.materialId, materialId),
      sql`${stockLedger.transactionType} != 'equipment_issue'`
    ));

  const balMap = new Map<number | null, { balance: number; uom: string }>();
  for (const e of entries) {
    const key = e.partyId ?? null;
    const cur = balMap.get(key) ?? { balance: 0, uom: e.uom || 'Ton' };
    cur.balance += (e.quantityIn || 0) - (e.quantityOut || 0);
    balMap.set(key, cur);
  }

  let updated = 0;
  for (const [partyId, { balance, uom }] of balMap) {
    const rounded = +balance.toFixed(6);
    const cond = partyId == null
      ? and(eq(stockBalances.materialId, materialId), sql`${stockBalances.partyId} IS NULL`)
      : and(eq(stockBalances.materialId, materialId), eq(stockBalances.partyId, partyId));

    const existing = await db.select({ id: stockBalances.id }).from(stockBalances).where(cond).limit(1);
    if (existing.length > 0) {
      await db.update(stockBalances).set({ balance: rounded, lastUpdated: new Date() }).where(cond);
    } else {
      await db.insert(stockBalances).values({ materialId, partyId: partyId ?? null, balance: rounded, uom, lastUpdated: new Date() });
    }
    updated++;
  }
  return updated;
}

async function main() {
  console.log("=== Fix #427: 6mm Down ledger gap for LAXMI (dispatches 49 & 50) ===\n");

  // Guard: must be run on the production database where LAXMI (party_id=6) exists
  const [laxmiCheck] = await db.select({ id: parties.id, name: parties.name })
    .from(parties).where(eq(parties.id, LAXMI_PARTY_ID)).limit(1);
  if (!laxmiCheck) {
    console.log("LAXMI party (id=6) not found — this is not the production database. Aborting.");
    process.exit(0);
  }
  console.log(`LAXMI party: "${laxmiCheck.name}" (id=${laxmiCheck.id})`);

  // Check idempotency
  const existing = await db.select({ referenceId: stockLedger.referenceId })
    .from(stockLedger)
    .where(and(
      eq(stockLedger.partyId, LAXMI_PARTY_ID),
      eq(stockLedger.materialId, MAT_6MM_DOWN),
      eq(stockLedger.transactionType, 'dispatch'),
      eq(stockLedger.quantityOut, 0),
      inArray(stockLedger.referenceId, [DISPATCH_49, DISPATCH_50]),
    ));

  if (existing.length === 2) {
    console.log("Fix already applied — both LAXMI marker rows exist. Nothing to do.");
    process.exit(0);
  }

  const existingRefs = new Set(existing.map(e => e.referenceId));
  console.log(`Found ${existing.length}/2 existing marker rows. Refs present: ${[...existingRefs].join(', ') || 'none'}`);

  // Step 1: Insert missing LAXMI 0-qty marker rows
  let markersInserted = 0;
  for (const dispatchId of [DISPATCH_49, DISPATCH_50]) {
    if (!existingRefs.has(dispatchId)) {
      const [row] = await db.insert(stockLedger).values({
        date: '2026-04-28',
        partyId: LAXMI_PARTY_ID,
        materialId: MAT_6MM_DOWN,
        transactionType: 'dispatch',
        quantityOut: 0,
        balanceAfter: 0,
        uom: 'Ton',
        notes: `Aggregate dispatch (${laxmiCheck.name})`,
        referenceId: dispatchId,
      }).returning({ id: stockLedger.id });
      console.log(`  Inserted LAXMI marker row for dispatch #${dispatchId} → ledger id: ${row?.id}`);
      markersInserted++;
    }
  }

  // Step 2: Correct over-counted HLC borrow entries
  const hlcUpdates = [
    { id: HLC_ENTRY_49, qty: 11,  refId: DISPATCH_49 },
    { id: HLC_ENTRY_50, qty: 7.5, refId: DISPATCH_50 },
  ];
  let hlcEntriesUpdated = 0;
  for (const u of hlcUpdates) {
    const res = await db.update(stockLedger)
      .set({ quantityOut: u.qty, referenceId: u.refId })
      .where(and(
        eq(stockLedger.id, u.id),
        eq(stockLedger.partyId, HLC_PARTY_ID),
        eq(stockLedger.materialId, MAT_6MM_DOWN),
      ));
    const cnt = (res as { rowCount?: number }).rowCount ?? 0;
    console.log(`  HLC entry #${u.id}: ${cnt > 0 ? `updated qty_out=${u.qty}, reference_id=${u.refId}` : 'not found (may already be correct)'}`);
    hlcEntriesUpdated += cnt;
  }

  // Step 3: Recompute balance_after for all 6mm Down ledger rows
  console.log("\nRecomputing balance_after for material_id=3...");
  const balUpdated = await recomputeBalanceAfterForMaterial(MAT_6MM_DOWN);
  console.log(`  Updated ${balUpdated} balance_after values`);

  // Step 4: Reconcile stock_balances for 6mm Down
  console.log("Reconciling stock_balances for material_id=3...");
  const reconciledCount = await reconcileStockBalancesForMaterial(MAT_6MM_DOWN);
  console.log(`  Reconciled ${reconciledCount} party balances`);

  console.log(`\n✓ Done: ${markersInserted} marker rows inserted, ${hlcEntriesUpdated} HLC entries corrected.`);
  console.log("LAXMI 6mm Down consumed should now show 257.25 MT (was 238.75 MT).");
  process.exit(0);
}

main().catch(err => {
  console.error("Fix failed:", err);
  process.exit(1);
});
