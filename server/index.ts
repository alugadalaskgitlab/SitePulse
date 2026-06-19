import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { initPush, sendPushToAudience } from "./push";
import { storage } from "./storage";
import { ensureBootstrapAdmin, backfillSplitPermissions, migrateEmailPhoneSchema, backfillPlantSubPermissions } from "./auth";
import { db } from "./db";
import { sql } from "drizzle-orm";

const app = express();
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(
  express.json({
    limit: "50mb",
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        const responseStr = JSON.stringify(capturedJsonResponse);
        logLine += ` :: ${responseStr.length > 200 ? responseStr.slice(0, 200) + "..." : responseStr}`;
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  initPush();
  // Run schema-additive migrations BEFORE routes/seed so new columns exist at seed time
  try { await storage.ensureBulkDensityColumn(); } catch (e) { console.error("Pre-routes: Failed to ensure bulk_density column:", e); }
  await registerRoutes(httpServer, app);

  // Auto-seed MoRTH defaults only when the equipment types table is empty (first deploy)
  try {
    const existingEquip = await storage.getPlanningEquipmentTypes(true);
    if (existingEquip.length === 0) {
      const r = await storage.seedPlanningMorthDefaults();
      console.log(`Startup: seedPlanningMorthDefaults — equipment: ${r.equipmentInserted}, labour: ${r.labourInserted}`);
    }
  } catch (e) {
    console.error("Startup: seedPlanningMorthDefaults failed:", e);
  }

  try {
    const r = await storage.backfillMaterialBulkDensity();
    console.log(`Startup: backfillMaterialBulkDensity — updated: ${r.updated}, skipped: ${r.skipped}`);
  } catch (e) {
    console.error("Startup: backfillMaterialBulkDensity failed:", e);
  }

  // ── Startup migration / backfill orchestration ───────────────────────────
  //
  // IDEMPOTENCY STRATEGY
  // ====================
  // Every migration below is meant to run once and never again.  The primary
  // guard is a row in `app_settings` (key → timestamp/sentinel value) that is
  // written after a successful run.  On subsequent startups the flag is found
  // and the body is skipped immediately.
  //
  // RISK: manual DB reset / seed
  // ----------------------------
  // If `app_settings` is truncated or the relevant key is deleted (e.g. during
  // a database seed or manual reset), every flagged migration will re-execute
  // on the next startup.  Each migration therefore must satisfy ONE of these
  // additional safety properties so a spurious re-run causes no harm:
  //
  //   (A) DATA-CONDITION CHECK  — the migration queries the actual data first
  //       and only writes if the condition that prompted it still holds.
  //       Example: backfillMissingDispatchAggregateRows checks for dispatches
  //       that are genuinely missing aggregate ledger rows.
  //
  //   (B) IDEMPOTENT OPERATION  — the SQL is inherently a no-op when re-run
  //       against already-migrated data.  Example: the deduplication helpers
  //       use DELETE … WHERE id NOT IN (SELECT MIN(id) …), which deletes zero
  //       rows when the table is already clean.
  //
  //   (C) DOCUMENTED RISK  — re-running could have a side-effect, but the
  //       effect is bounded and explicitly documented so it is understood.
  //
  // Each method in storage.ts and auth.ts carries an inline comment identifying
  // which category applies and why a silent re-run is (or is not) dangerous.
  // ─────────────────────────────────────────────────────────────────────────

  try {
    await storage.resetAllSequences();
    console.log("Startup: All database sequences reset successfully");
  } catch (e) {
    console.error("Startup: Failed to reset sequences:", e);
  }

  try {
    await storage.ensureMaintenanceTables();
    console.log("Startup: equipment_maintenance_logs and maintenance_parts_used tables ensured");
  } catch (e) {
    console.error("Startup: Failed to ensure maintenance tables:", e);
  }

  try {
    await storage.ensureRmcTables();
    console.log("Startup: RMC tables ensured");
  } catch (e) {
    console.error("Startup: Failed to ensure RMC tables:", e);
  }

  try {
    await storage.ensureHeatingSessionDipColumns();
  } catch (e) {
    console.error("Startup: Failed to ensure heating session dip columns:", e);
  }

  try {
    await storage.ensureMaterialOpeningStockTankNumber();
  } catch (e) {
    console.error("Startup: Failed to ensure material opening stock tank_number column:", e);
  }

  try {
    await storage.ensureSiteIdColumns();
  } catch (e) {
    console.error("Startup: Failed to ensure site_id columns on diesel_requirements/purchase_indents:", e);
  }

  try {
    const siteBackfill = await storage.backfillSiteIdsOnDieselAndIndents();
    console.log(`Startup: backfillSiteIdsOnDieselAndIndents — diesel: scanned ${siteBackfill.dieselScanned}, resolved ${siteBackfill.dieselResolved}, unresolved ${siteBackfill.dieselUnresolved} | indents: scanned ${siteBackfill.indentsScanned}, resolved ${siteBackfill.indentsResolved}, unresolved ${siteBackfill.indentsUnresolved}`);
  } catch (e) {
    console.error("Startup: backfillSiteIdsOnDieselAndIndents failed:", e);
  }

  try {
    await storage.migrateLegacyGeneratorNamesToCanonical();
  } catch (e) {
    console.error("Startup: Failed to migrate legacy generator names:", e);
  }

  // Audit note (Task #546): there is no separate `bitumen_flow_readings` table —
  // bitumen is tracked exclusively via depth-based dip readings in `bitumen_dip_readings`.
  // All auto-insert paths for that table already use .onConflictDoNothing():
  //   • _syncShiftLogReadings()  — shift log save / update
  // Heating sessions do NOT auto-insert bitumen dip rows.
  // The table also has an explicit duplicate-check in createBitumenDipReading() for
  // manual entries (throws DUPLICATE_BITUMEN_DIP before inserting).
  // This startup call removes any historical duplicates that pre-date the unique index.
  try {
    await storage.deduplicateBitumenDipReadings();
  } catch (e) {
    console.error("Startup: deduplicateBitumenDipReadings failed:", e);
  }

  try {
    await storage.deduplicateLdoDipReadings();
  } catch (e) {
    console.error("Startup: deduplicateLdoDipReadings failed:", e);
  }

  try {
    await storage.deduplicateLdoFlowSlotReadings();
  } catch (e) {
    console.error("Startup: deduplicateLdoFlowSlotReadings failed:", e);
  }

  try {
    await storage.backfillLdoFlowReadingsFromHeatingSessions();
  } catch (e) {
    console.error("Startup: Failed to backfill LDO flow readings from heating sessions:", e);
  }

  try {
    await storage.backfillLdoReceiptsFromMaterialReceipts();
  } catch (e) {
    console.error("Startup: Failed to backfill LDO flow readings from material receipts:", e);
  }

  // Stamp tank_number=1 on existing LDO dispatch rows that were backfilled without it
  try {
    const rd = await storage.fixLdoDispatchTankNumbers_v1();
    console.log(`Startup: ${rd.message}`);
  } catch (e) {
    console.error("Startup: fixLdoDispatchTankNumbers_v1 failed:", e);
  }

  // Create ldo_heating_consumption ledger rows for existing heating sessions
  try {
    const rh = await storage.backfillLdoHeatingConsumption_v1();
    console.log(`Startup: ${rh.message}`);
  } catch (e) {
    console.error("Startup: backfillLdoHeatingConsumption_v1 failed:", e);
  }

  // Create ldo_shift_consumption ledger rows for existing shift logs
  try {
    const rs = await storage.backfillLdoShiftMeterConsumption_v1();
    console.log(`Startup: ${rs.message}`);
  } catch (e) {
    console.error("Startup: backfillLdoShiftMeterConsumption_v1 failed:", e);
  }

  try {
    const r = await storage.fixLdoStockDeductionErrors();
    console.log(`Startup: fixLdoStockDeductionErrors — receiptsBackfilled=${r.receiptsBackfilled}, receiptLedgerRemoved=${r.receiptLedgerRemoved}, dispatchLedgerRemoved=${r.dispatchLedgerRemoved}, balancesFixed=${r.balancesFixed}, errors=${r.errors}`);
  } catch (e) {
    console.error("Startup: fixLdoStockDeductionErrors failed:", e);
  }

  try {
    const r0 = await storage.backfillDispatchReferenceIds();
    console.log(`Startup: backfillDispatchReferenceIds — updated: ${r0.updated}, skipped: ${r0.skipped}, errors: ${r0.errors}`);
  } catch (e) {
    console.error("Startup: backfillDispatchReferenceIds failed:", e);
  }

  // ── Dispatch ledger deduplication + unique index ─────────────────────────
  // ORDER MATTERS: dedup must run before index creation so that any
  // pre-existing duplicate rows are removed first.  If the index were
  // attempted first it would fail on a dirty database, leaving the system
  // unprotected until the next restart.
  //
  // Step 1 — remove any existing duplicate (material_id, party_id, reference_id)
  // dispatch rows, keeping only the most-recent (highest id) per group.
  try {
    const r = await storage.deduplicateStockLedgerDispatchRows();
    if (r.rowsDeleted > 0) {
      console.log(`Startup: deduplicateStockLedgerDispatchRows — fixed ${r.groupsFixed} groups, removed ${r.rowsDeleted} duplicate dispatch rows`);
    } else {
      console.log("Startup: deduplicateStockLedgerDispatchRows — 0 rows removed (clean)");
    }
  } catch (e) {
    console.error("Startup: deduplicateStockLedgerDispatchRows failed:", e);
  }

  // Step 2 — create the unique partial index now that the table is clean.
  // Created with raw SQL because drizzle-kit push does not support expression-
  // based index columns (COALESCE).  IF NOT EXISTS makes this idempotent.
  try {
    await db.execute(sql`
      CREATE UNIQUE INDEX IF NOT EXISTS stock_ledger_dispatch_dedup_idx
      ON stock_ledger (material_id, COALESCE(party_id, -1), reference_id)
      WHERE transaction_type = 'dispatch' AND reference_id IS NOT NULL
    `);
    console.log("Startup: stock_ledger_dispatch_dedup_idx ensured");
  } catch (e) {
    console.error("Startup: Failed to create stock_ledger_dispatch_dedup_idx:", e);
  }

  // Step 3 — zero out any owner dispatch rows that were double-charged
  // (owner qty_out > 0 despite shortage_warning showing available=0 AND
  // an HLC "Borrowed from HLC" row already covering the full quantity).
  try {
    const r1b = await storage.fixDoubleDeductedDispatchOwnerRows();
    if (r1b.rowsFixed > 0) {
      console.log(`Startup: fixDoubleDeductedDispatchOwnerRows — fixed ${r1b.rowsFixed} row(s), recomputed ${r1b.materialsRecomputed} material(s)`);
    } else {
      console.log("Startup: fixDoubleDeductedDispatchOwnerRows — 0 rows to fix (clean)");
    }
  } catch (e) {
    console.error("Startup: fixDoubleDeductedDispatchOwnerRows failed:", e);
  }

  try {
    const r2 = await storage.backfillDispatchNotes();
    console.log(`Startup: backfillDispatchNotes — updated: ${r2.updated}, skipped: ${r2.skipped}, errors: ${r2.errors}`);
  } catch (e) {
    console.error("Startup: backfillDispatchNotes failed:", e);
  }

  try {
    const r3 = await storage.backfillBitumenTankNumbers();
    console.log(`Startup: backfillBitumenTankNumbers — updated: ${r3.updated}, errors: ${r3.errors}`);
  } catch (e) {
    console.error("Startup: backfillBitumenTankNumbers failed:", e);
  }

  try {
    const r4 = await storage.backfillMissingDispatchBitumenRows();
    if (r4.created > 0) {
      console.log(`Startup: backfillMissingDispatchBitumenRows — created: ${r4.created}, skipped: ${r4.skipped}, errors: ${r4.errors}`);
    } else {
      console.log(`Startup: backfillMissingDispatchBitumenRows — 0 rows needed (clean), skipped: ${r4.skipped}, errors: ${r4.errors}`);
    }
  } catch (e) {
    console.error("Startup: backfillMissingDispatchBitumenRows failed:", e);
  }

  try {
    const result = await storage.migrate6mmDownUomFix();
    console.log(`Startup: ${result.message}`);
  } catch (e) {
    console.error("Startup: migrate6mmDownUomFix failed:", e);
  }

  try {
    await backfillSplitPermissions();
  } catch (e) {
    console.error("Startup: backfillSplitPermissions failed:", e);
  }

  try {
    await backfillPlantSubPermissions();
  } catch (e) {
    console.error("Startup: backfillPlantSubPermissions failed:", e);
  }

  try {
    await migrateEmailPhoneSchema();
  } catch (e) {
    console.error("Startup: migrateEmailPhoneSchema failed:", e);
  }

  try {
    await ensureBootstrapAdmin();
  } catch (e) {
    console.error("Startup: ensureBootstrapAdmin failed:", e);
  }

  try {
    await storage.purgeOrphanedDeletionReversals();
  } catch (e) {
    console.error("Startup: purgeOrphanedDeletionReversals failed:", e);
  }

  try {
    const r = await storage.backfillMissingDispatchAggregateRows();
    if (r.applied) {
      if (r.dispatchesFixed > 0) {
        console.log(`Startup: backfillMissingDispatchAggregateRows — fixed ${r.dispatchesFixed} dispatch(es) across ${r.templatesProcessed} template(s), created ${r.ledgerRowsCreated} ledger row(s)${r.errors.length ? `, ${r.errors.length} error(s)` : ""}`);
      } else {
        console.log("Startup: backfillMissingDispatchAggregateRows — nothing to fix (clean)");
      }
    } else {
      console.log("Startup: backfillMissingDispatchAggregateRows — already applied, skipping.");
    }
  } catch (e) {
    console.error("Startup: backfillMissingDispatchAggregateRows failed:", e);
  }

  try {
    const r = await storage.cleanupGhostDispatchLedgerRows();
    if (r.applied) {
      if (r.deleted > 0) {
        console.log(`Startup: cleanupGhostDispatchLedgerRows — deleted ${r.deleted} ghost ledger row(s)`);
      } else {
        console.log("Startup: cleanupGhostDispatchLedgerRows — nothing to clean (no ghost rows found)");
      }
    } else {
      console.log("Startup: cleanupGhostDispatchLedgerRows — already applied, skipping.");
    }
  } catch (e) {
    console.error("Startup: cleanupGhostDispatchLedgerRows failed:", e);
  }

  try {
      // Correct orphan-adjustment ledger entries that were wrongly inserted with quantity_in > 0.
      // Those inflate the global stock total. Set quantity_in = 0 for any such rows.
      const orphanFix = await db.execute(sql`
        UPDATE stock_ledger
        SET quantity_in = 0
        WHERE transaction_type = 'adjustment'
          AND notes ILIKE '%orphan balance correction%'
          AND quantity_in > 0
          AND quantity_out = 0
      `);
      const orphanFixCount = (orphanFix as any).rowCount ?? 0;
      if (orphanFixCount > 0) {
        console.log(`Startup: fixOrphanAdjustmentLedger — zeroed quantity_in on ${orphanFixCount} wrong adjustment row(s)`);
      }
    } catch (e) {
      console.error("Startup: fixOrphanAdjustmentLedger failed:", e);
    }

  try {
      const r = await storage.fixLdoDataIssues();
      console.log(`Startup: ${r.message}`);
    } catch (e) {
      console.error("Startup: fixLdoDataIssues failed:", e);
    }

    try {
      const r2 = await storage.fixHlcLdoStockBalance();
      console.log(`Startup: ${r2.message}`);
    } catch (e) {
      console.error("Startup: fixHlcLdoStockBalance failed:", e);
    }

  try {
    const r3 = await storage.backfillLdoDispatchConsumption_v1();
    console.log(`Startup: ${r3.message}`);
  } catch (e) {
    console.error("Startup: backfillLdoDispatchConsumption_v1 failed:", e);
  }

  try {
    const r4 = await storage.fixAllLdoStockBalances_v1();
    console.log(`Startup: ${r4.message}`);
  } catch (e) {
    console.error("Startup: fixAllLdoStockBalances_v1 failed:", e);
  }

  try {
    const r5 = await storage.rebuildLdoDispatchLedger_v1();
    console.log(`Startup: ${r5.message}`);
  } catch (e) {
    console.error("Startup: rebuildLdoDispatchLedger_v1 failed:", e);
  }

  // Definitive cutover: LDO stock moves are now written by truck dispatches only.
  // Purges dip/shift/heating consumption rows, rebuilds clean dispatch rows, recomputes balances.
  try {
    const r6 = await (storage as any).migrateLdoToDispatchModelOnly_v3();
    console.log(`Startup: ${r6.message}`);
  } catch (e) {
    console.error("Startup: migrateLdoToDispatchModelOnly_v3 failed:", e);
  }

  try {
    const r7 = await storage.backfillMissingDispatchLdoRows();
    if (r7.created > 0) {
      console.log(`Startup: backfillMissingDispatchLdoRows — created: ${r7.created}, skipped: ${r7.skipped}, errors: ${r7.errors}`);
    } else {
      console.log(`Startup: backfillMissingDispatchLdoRows — 0 rows needed (clean), skipped: ${r7.skipped}, errors: ${r7.errors}`);
    }
  } catch (e) {
    console.error("Startup: backfillMissingDispatchLdoRows failed:", e);
  }

    // ── Stale draft GRN push alert ───────────────────────────────────────────
  // Runs every hour; sends a single push to managers/admins listing draft
  // GRNs that have had no Purchase Indent reference for > 48 hours.
  // The threshold is read from STALE_GRN_THRESHOLD_HOURS (default 48).
  const _rawStaleHours = parseInt(process.env.STALE_GRN_THRESHOLD_HOURS || "48", 10);
  const STALE_GRN_THRESHOLD_HOURS = Number.isFinite(_rawStaleHours) && _rawStaleHours > 0 && _rawStaleHours <= 8760 ? _rawStaleHours : 48;
  const STALE_GRN_CHECK_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

  async function checkAndNotifyStaleGrns() {
    try {
      const stale = await storage.getStaleGrns(STALE_GRN_THRESHOLD_HOURS);
      if (stale.length === 0) return;
      const body = stale.length === 1
        ? `Draft GRN ${stale[0].grnNumber} has been waiting for a PI for over ${STALE_GRN_THRESHOLD_HOURS}h`
        : `${stale.length} draft GRNs have been waiting for a PI for over ${STALE_GRN_THRESHOLD_HOURS}h`;
      await sendPushToAudience(
        "⏳ Stale Draft GRN Alert",
        body,
        "/stores/grns",
        "managers",
      );
      console.log(`[StaleGRN] Notified managers — ${stale.length} stale draft GRN(s)`);
    } catch (e) {
      console.error("[StaleGRN] Check failed:", e);
    }
  }

  // Run once after startup (after a short delay so DB is warm), then hourly.
  setTimeout(() => {
    checkAndNotifyStaleGrns();
    setInterval(checkAndNotifyStaleGrns, STALE_GRN_CHECK_INTERVAL_MS);
  }, 30_000);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      log(`serving on port ${port}`);
    },
  );
})();
