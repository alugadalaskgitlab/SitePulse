import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes, setEarthworkSchemaReady } from "./routes";
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

  // ── Pre-routes: critical schema ensures ───────────────────────────────────
  // These MUST complete before routes register — route handlers read these columns.
  // Run in parallel: all are idempotent ADD COLUMN / CREATE TABLE IF NOT EXISTS.
  await Promise.all([
    storage.ensureBulkDensityColumn()
      .catch(e => console.error("Pre-routes: Failed to ensure bulk_density column:", e)),
    storage.ensureStoreCancellationColumns()
      .then(() => console.log("Startup: ensureStoreCancellationColumns — store_grns cancellation + self-approval columns verified/added"))
      .catch(e => console.error("Pre-routes: Failed to ensure store cancellation columns:", e)),
    storage.ensureOrderColumns()
      .then(() => console.log("Startup: ensureOrderColumns — purchase_indent_items order tracking columns verified/added"))
      .catch(e => console.error("Pre-routes: Failed to ensure order columns:", e)),
    storage.ensureMaterialRequirementsTable()
      .then(() => console.log("Startup: ensureMaterialRequirementsTable — material_requirements table + PI/IRN requirementId columns verified/added"))
      .catch(e => console.error("Pre-routes: Failed to ensure material requirements table:", e)),
    storage.ensureBoqMaterialMappings()
      .then(() => console.log("Startup: ensureBoqMaterialMappings — boq_material_mappings table verified/created"))
      .catch(e => console.error("Pre-routes: Failed to ensure boq_material_mappings table:", e)),
    storage.ensureProgrammeBarOutcomeEventsTable()
      .then(() => console.log("Startup: programme_bar_outcome_events table verified/created"))
      .catch(e => console.error("Pre-routes: Failed to ensure programme bar outcome events table:", e)),
    storage.ensureStockReconciliationTables()
      .then(() => console.log("Startup: ensureStockReconciliationTables — stock_reconciliation_sessions/items tables verified/created"))
      .catch(e => console.error("Pre-routes: Failed to ensure stock reconciliation tables:", e)),
    // road_geometry_profiles is now managed through the normal schema path
    // (shared/schema.ts + drizzle push) — startup DDL removed so the publish
    // migration diff can never see a runtime-created table it wants to drop.
    storage.ensureVendorBillPaymentColumns()
      .then(() => console.log("Startup: ensureVendorBillPaymentColumns — vendor_bills payment columns + diesel payment_status columns verified/added"))
      .catch(e => console.error("Pre-routes: Failed to ensure vendor bill payment columns:", e)),
    storage.ensureMaterialReceiptDieselLinkColumn()
      .then(() => console.log("Startup: ensureMaterialReceiptDieselLinkColumn — material_receipts.linked_diesel_requirement_id verified/added"))
      .catch(e => console.error("Pre-routes: Failed to ensure material receipt diesel link column:", e)),
    storage.ensureProjectScopeSchema()
      .then(() => console.log("Startup: ensureProjectScopeSchema — project_scope_segments table + corridor/scope columns verified/added"))
      .catch(e => console.error("Pre-routes: Failed to ensure project scope schema:", e)),
    storage.ensureUserAccessColumns()
      .then(() => console.log("Startup: ensureUserAccessColumns — users.all_sites_access + setup_complete verified/added"))
      .catch(e => console.error("Pre-routes: Failed to ensure user access columns:", e)),
    storage.ensureWorkProgrammeRevisionColumns()
      .then(() => console.log("Startup: ensureWorkProgrammeRevisionColumns — baseline + revision history columns verified/backfilled"))
      .catch(e => console.error("Pre-routes: Failed to ensure work programme revision columns:", e)),
    // Maintenance routes (and DPR breakdown reconciliation) read these tables
    // synchronously.  Keep their schema guard in the pre-routes barrier rather
    // than racing it in the post-listen migration runner.
    storage.ensureMaintenanceTables()
      .then(() => console.log("Startup: equipment_maintenance_logs and maintenance_parts_used tables ensured"))
      .catch(e => console.error("Pre-routes: Failed to ensure maintenance tables:", e)),
    // ── Earthwork tables — MUST complete before routes register ───────────────
    // Earthwork POST/PATCH routes check the earthworkSchemaReady flag (set below).
    // Runs here (blocking) so the flag is true before any request arrives.
    (async () => {
      try {
        await (storage as any).ensureEarthworkTables();
        await (storage as any).repairLegacyCutFillArrangementSources();
        // Verify every column the INSERT uses actually exists
        const colResult = await db.execute(sql`
          SELECT column_name FROM information_schema.columns
          WHERE table_name = 'earthwork_arrangements'
        `);
        const existing = new Set((colResult.rows as any[]).map((r: any) => r.column_name));
        const required = [
          "boq_project_id","boq_item_id","boq_item_allocations","material_label",
          "arrangement_type","agency_name","work_description","reach_label",
          "chainage_from","chainage_to","allocated_qty","uom","agreed_rate",
          "borrow_source","avg_lead_km","mobilisation_date","planned_start_date",
          "actual_start_date","target_completion_date","planned_daily_output",
          "working_hours_per_shift","num_excavators","excavator_type","num_tippers",
          "tipper_capacity_cum","diesel_responsibility","components","inclusions",
          "exclusions","notes","status","prepared_by_user_id","submitted_at",
          "approved_by_user_id","approved_at","returned_at","on_hold_reason",
          "completed_at","rejection_reason","cancellation_reason","created_at","updated_at",
          "source_excavation_boq_item_id",
          "work_category","bituminous_item_type",
          "scope_segment_ids", // Instruction 031 B3 — Applicable Scope linkage
        ];
        const missing = required.filter(c => !existing.has(c));
        if (missing.length > 0) {
          console.error(`Startup: earthwork_arrangements missing columns: ${missing.join(", ")} — Earthwork APIs will be unavailable`);
        } else {
          console.log(`Startup: ensureEarthworkTables — all ${required.length} required columns verified; Earthwork APIs ready`);
          setEarthworkSchemaReady(true);
        }
      } catch (e) {
        console.error("Startup: CRITICAL — Failed to ensure earthwork tables:", e);
        // earthworkSchemaReady stays false; mutation routes return EARTHWORK_SCHEMA_NOT_READY
      }
    })(),
  ]);

  await registerRoutes(httpServer, app);

  // ── Start serving immediately — background migrations run after listen ─────
  // Error handler must sit after all routes but before Vite / static (Express order).
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    res.status(status).json({ message });
    throw err;
  });

  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen({ port, host: "0.0.0.0", reusePort: true }, () => {
    log(`serving on port ${port}`);
  });

  // Kick off background migrations — these do NOT block the server.
  // Safe because: (a) all are idempotent, (b) routes handle missing data gracefully,
  // (c) on a warm DB the entire chain finishes in seconds.
  void runBackgroundMigrations();
})();

// ── Background migration runner ────────────────────────────────────────────────
// Independent migrations are grouped into parallel Promise.all batches.
// Sequential chains (dispatch dedup, LDO stock rebuild) remain ordered.
async function runBackgroundMigrations() {
  // ── Phase 1: Schema ensures (independent — run in parallel) ────────────────
  await Promise.all([
    (async () => { try { await storage.resetAllSequences(); console.log("Startup: All database sequences reset successfully"); } catch (e) { console.error("Startup: Failed to reset sequences:", e); } })(),
    (async () => { try { await storage.ensureBoqProgramSettingsTables(); console.log("Startup: boq_program_settings and boq_mix_template_links tables ensured"); } catch (e) { console.error("Startup: Failed to ensure BOQ program settings tables:", e); } })(),
    (async () => { try { await storage.ensureRmcTables(); console.log("Startup: RMC tables ensured"); } catch (e) { console.error("Startup: Failed to ensure RMC tables:", e); } })(),
    (async () => { try { await storage.ensureSiteRequirementsTable(); console.log("Startup: site_requirements table ensured"); } catch (e) { console.error("Startup: Failed to ensure site_requirements table:", e); } })(),
    (async () => { try { await (storage as any).ensureStructureBarColumns(); console.log("Startup: ensureStructureBarColumns — structure bar columns verified"); } catch (e) { console.error("Startup: Failed to ensure structure bar columns:", e); } })(),
    (async () => { try { const r = await (storage as any).ensureBoqCanonicalUnit(); if (r.units > 0 || r.categories > 0 || r.unitsCleaned > 0) console.log(`Startup: ensureBoqCanonicalUnit — backfilled units: ${r.units}, work categories: ${r.categories}, raw units cleaned: ${r.unitsCleaned}`); } catch (e) { console.error("Startup: Failed to ensure BOQ canonical units:", e); } })(),
    (async () => { try { await storage.ensureHeatingSessionDipColumns(); } catch (e) { console.error("Startup: Failed to ensure heating session dip columns:", e); } })(),
    (async () => { try { await storage.ensureMaterialOpeningStockTankNumber(); } catch (e) { console.error("Startup: Failed to ensure material opening stock tank_number column:", e); } })(),
    (async () => { try { await storage.ensureSiteIdColumns(); } catch (e) { console.error("Startup: Failed to ensure site_id columns on diesel_requirements/purchase_indents:", e); } })(),
    (async () => { try { await storage.ensurePendingStoreReceiptColumns(); console.log("Startup: ensurePendingStoreReceiptColumns — Batch 11 columns verified/added"); } catch (e) { console.error("Startup: Failed to ensure Batch 11 Pending Store Receipt columns:", e); } })(),
    (async () => { try { await (storage as any).ensurePendingPlantReceiptsTable(); console.log("Startup: ensurePendingPlantReceiptsTable — Batch 12 table ensured"); } catch (e) { console.error("Startup: Failed to ensure pending_plant_receipts table:", e); } })(),
    (async () => { try { await (storage as any).ensureServiceCompletionsTable(); console.log("Startup: ensureServiceCompletionsTable — Batch 13 table ensured"); } catch (e) { console.error("Startup: Failed to ensure service_completions table:", e); } })(),
    (async () => { try { await (storage as any).ensureSiteMaterialTripsLinkageColumns(); console.log("Startup: ensureSiteMaterialTripsLinkageColumns — Batch 14 columns ensured"); } catch (e) { console.error("Startup: Failed to ensure site_material_trips linkage columns:", e); } })(),
    (async () => { try { await (storage as any).ensureEquipmentUsageAuditColumns(); console.log("Startup: ensureEquipmentUsageAuditColumns — audit columns verified"); } catch (e) { console.error("Startup: Failed to ensure equipment usage audit columns:", e); } })(),
    (async () => { try { await (storage as any).ensureSiteEnabledModulesColumn(); } catch (e) { console.error("Startup: Failed to ensure enabled_modules column on sites:", e); } })(),
    (async () => { try { await storage.ensureMaterialUomConversionsTable(); console.log("Startup: ensureMaterialUomConversionsTable — material_uom_conversions table + BOQ mapping columns verified/added"); } catch (e) { console.error("Startup: Failed to ensure material_uom_conversions table:", e); } })(),
    // ensureEarthworkTables intentionally removed from background phase —
    // it now runs in the blocking pre-routes section above.
  ]);

  // ── Phase 2: Seeding that depends on Phase 1 tables (parallel) ─────────────
  await Promise.all([
    (async () => {
      try {
        const existingEquip = await storage.getPlanningEquipmentTypes(true);
        if (existingEquip.length === 0) {
          const r = await storage.seedPlanningMorthDefaults();
          console.log(`Startup: seedPlanningMorthDefaults — equipment: ${r.equipmentInserted}, labour: ${r.labourInserted}`);
        }
      } catch (e) { console.error("Startup: seedPlanningMorthDefaults failed:", e); }
    })(),
    (async () => { try { const r = await storage.backfillMaterialBulkDensity(); console.log(`Startup: backfillMaterialBulkDensity — updated: ${r.updated}, skipped: ${r.skipped}`); } catch (e) { console.error("Startup: backfillMaterialBulkDensity failed:", e); } })(),
    // Instruction 030 Part A: auto-allocate previously-approved arrangements that have no bar allocations yet
    (async () => { try { const { backfillArrangementBarAllocations } = await import("./arrangementAllocationSync"); const r = await backfillArrangementBarAllocations(); if (r.arrangements > 0) console.log(`Startup: backfillArrangementBarAllocations — arrangements: ${r.arrangements}, allocations created: ${r.created}, with shortfall: ${r.shortfallCount}`); } catch (e) { console.error("Startup: backfillArrangementBarAllocations failed:", e); } })(),
  ]);

  // ── Phase 3: Independent data backfills (parallel) ─────────────────────────
  await Promise.all([
    (async () => { try { const r = await storage.backfillSiteIdsOnDieselAndIndents(); console.log(`Startup: backfillSiteIdsOnDieselAndIndents — diesel: scanned ${r.dieselScanned}, resolved ${r.dieselResolved}, unresolved ${r.dieselUnresolved} | indents: scanned ${r.indentsScanned}, resolved ${r.indentsResolved}, unresolved ${r.indentsUnresolved}`); } catch (e) { console.error("Startup: backfillSiteIdsOnDieselAndIndents failed:", e); } })(),
    (async () => { try { await storage.migrateLegacyGeneratorNamesToCanonical(); } catch (e) { console.error("Startup: Failed to migrate legacy generator names:", e); } })(),
    (async () => { try { await backfillSplitPermissions(); } catch (e) { console.error("Startup: backfillSplitPermissions failed:", e); } })(),
    (async () => { try { await backfillPlantSubPermissions(); } catch (e) { console.error("Startup: backfillPlantSubPermissions failed:", e); } })(),
    (async () => { try { await migrateEmailPhoneSchema(); } catch (e) { console.error("Startup: migrateEmailPhoneSchema failed:", e); } })(),
    (async () => { try { await ensureBootstrapAdmin(); } catch (e) { console.error("Startup: ensureBootstrapAdmin failed:", e); } })(),
    (async () => { try { const updated = await (storage as any).migrateBulkPlantToMaterial(); if (updated > 0) console.log(`Startup: migrateBulkPlantToMaterial — renamed ${updated} item(s) from bulk_plant → material`); } catch (e) { console.error("Startup: Failed to migrate bulk_plant → material:", e); } })(),
    (async () => { try { const r = await storage.backfillDispatchNotes(); console.log(`Startup: backfillDispatchNotes — updated: ${r.updated}, skipped: ${r.skipped}, errors: ${r.errors}`); } catch (e) { console.error("Startup: backfillDispatchNotes failed:", e); } })(),
    (async () => { try { const r = await storage.backfillBitumenTankNumbers(); console.log(`Startup: backfillBitumenTankNumbers — updated: ${r.updated}, errors: ${r.errors}`); } catch (e) { console.error("Startup: backfillBitumenTankNumbers failed:", e); } })(),
    (async () => { try { const r = await storage.migrate6mmDownUomFix(); console.log(`Startup: ${r.message}`); } catch (e) { console.error("Startup: migrate6mmDownUomFix failed:", e); } })(),
    (async () => { try { await storage.purgeOrphanedDeletionReversals(); } catch (e) { console.error("Startup: purgeOrphanedDeletionReversals failed:", e); } })(),
    (async () => { try { const r = await storage.backfillMissingDispatchAggregateRows(); if (r.applied) { if (r.dispatchesFixed > 0) console.log(`Startup: backfillMissingDispatchAggregateRows — fixed ${r.dispatchesFixed} dispatch(es) across ${r.templatesProcessed} template(s), created ${r.ledgerRowsCreated} ledger row(s)${r.errors.length ? `, ${r.errors.length} error(s)` : ""}`); else console.log("Startup: backfillMissingDispatchAggregateRows — nothing to fix (clean)"); } else console.log("Startup: backfillMissingDispatchAggregateRows — already applied, skipping."); } catch (e) { console.error("Startup: backfillMissingDispatchAggregateRows failed:", e); } })(),
    (async () => { try { const r = await storage.cleanupGhostDispatchLedgerRows(); if (r.applied) { if (r.deleted > 0) console.log(`Startup: cleanupGhostDispatchLedgerRows — deleted ${r.deleted} ghost ledger row(s)`); else console.log("Startup: cleanupGhostDispatchLedgerRows — nothing to clean (no ghost rows found)"); } else console.log("Startup: cleanupGhostDispatchLedgerRows — already applied, skipping."); } catch (e) { console.error("Startup: cleanupGhostDispatchLedgerRows failed:", e); } })(),
    (async () => { try { await storage.deduplicateBitumenDipReadings(); } catch (e) { console.error("Startup: deduplicateBitumenDipReadings failed:", e); } })(),
    (async () => { try { const r = await storage.backfillBoqPlanningInclude(); if (r.set > 0 || r.excluded > 0) console.log(`Startup: backfillBoqPlanningInclude — set: ${r.set}, auto-excluded: ${r.excluded}`); } catch (e) { console.error("Startup: backfillBoqPlanningInclude failed:", e); } })(),
    (async () => {
      try {
        const orphanFix = await db.execute(sql`UPDATE stock_ledger SET quantity_in = 0 WHERE transaction_type = 'adjustment' AND notes ILIKE '%orphan balance correction%' AND quantity_in > 0 AND quantity_out = 0`);
        const orphanFixCount = (orphanFix as any).rowCount ?? 0;
        if (orphanFixCount > 0) console.log(`Startup: fixOrphanAdjustmentLedger — zeroed quantity_in on ${orphanFixCount} wrong adjustment row(s)`);
      } catch (e) { console.error("Startup: fixOrphanAdjustmentLedger failed:", e); }
    })(),
  ]);

  // ── Phase 4: Dispatch dedup chain (ORDER MATTERS — sequential) ─────────────
  try {
    const r = await storage.deduplicateStockLedgerDispatchRows();
    if (r.rowsDeleted > 0) console.log(`Startup: deduplicateStockLedgerDispatchRows — fixed ${r.groupsFixed} groups, removed ${r.rowsDeleted} duplicate dispatch rows`);
    else console.log("Startup: deduplicateStockLedgerDispatchRows — 0 rows removed (clean)");
  } catch (e) { console.error("Startup: deduplicateStockLedgerDispatchRows failed:", e); }

  try {
    await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS stock_ledger_dispatch_dedup_idx ON stock_ledger (material_id, COALESCE(party_id, -1), reference_id) WHERE transaction_type = 'dispatch' AND reference_id IS NOT NULL`);
    console.log("Startup: stock_ledger_dispatch_dedup_idx ensured");
  } catch (e) { console.error("Startup: Failed to create stock_ledger_dispatch_dedup_idx:", e); }

  try {
    const r = await storage.fixDoubleDeductedDispatchOwnerRows();
    if (r.rowsFixed > 0) console.log(`Startup: fixDoubleDeductedDispatchOwnerRows — fixed ${r.rowsFixed} row(s), recomputed ${r.materialsRecomputed} material(s)`);
    else console.log("Startup: fixDoubleDeductedDispatchOwnerRows — 0 rows to fix (clean)");
  } catch (e) { console.error("Startup: fixDoubleDeductedDispatchOwnerRows failed:", e); }

  // ── Phase 5: Dispatch reference backfills ──────────────────────────────────
  try { const r = await storage.backfillDispatchReferenceIds(); console.log(`Startup: backfillDispatchReferenceIds — updated: ${r.updated}, skipped: ${r.skipped}, errors: ${r.errors}`); } catch (e) { console.error("Startup: backfillDispatchReferenceIds failed:", e); }
  try { const r = await storage.backfillMissingDispatchBitumenRows(); if (r.created > 0) console.log(`Startup: backfillMissingDispatchBitumenRows — created: ${r.created}, skipped: ${r.skipped}, errors: ${r.errors}`); else console.log(`Startup: backfillMissingDispatchBitumenRows — 0 rows needed (clean), skipped: ${r.skipped}, errors: ${r.errors}`); } catch (e) { console.error("Startup: backfillMissingDispatchBitumenRows failed:", e); }

  // ── Phase 6: LDO chain (ORDER MATTERS — sequential) ───────────────────────
  try { await storage.deduplicateLdoDipReadings(); } catch (e) { console.error("Startup: deduplicateLdoDipReadings failed:", e); }
  try { await storage.deduplicateLdoFlowSlotReadings(); } catch (e) { console.error("Startup: deduplicateLdoFlowSlotReadings failed:", e); }
  try { await storage.backfillLdoFlowReadingsFromHeatingSessions(); } catch (e) { console.error("Startup: Failed to backfill LDO flow readings from heating sessions:", e); }
  try { await storage.backfillLdoReceiptsFromMaterialReceipts(); } catch (e) { console.error("Startup: Failed to backfill LDO flow readings from material receipts:", e); }
  try { const r = await storage.fixLdoDispatchTankNumbers_v1(); console.log(`Startup: ${r.message}`); } catch (e) { console.error("Startup: fixLdoDispatchTankNumbers_v1 failed:", e); }
  try { const r = await storage.backfillLdoHeatingConsumption_v1(); console.log(`Startup: ${r.message}`); } catch (e) { console.error("Startup: backfillLdoHeatingConsumption_v1 failed:", e); }
  try { const r = await storage.backfillLdoShiftMeterConsumption_v1(); console.log(`Startup: ${r.message}`); } catch (e) { console.error("Startup: backfillLdoShiftMeterConsumption_v1 failed:", e); }
  try { const r = await storage.fixLdoStockDeductionErrors(); console.log(`Startup: fixLdoStockDeductionErrors — receiptsBackfilled=${r.receiptsBackfilled}, receiptLedgerRemoved=${r.receiptLedgerRemoved}, dispatchLedgerRemoved=${r.dispatchLedgerRemoved}, balancesFixed=${r.balancesFixed}, errors=${r.errors}`); } catch (e) { console.error("Startup: fixLdoStockDeductionErrors failed:", e); }
  try { const r = await storage.fixLdoDataIssues(); console.log(`Startup: ${r.message}`); } catch (e) { console.error("Startup: fixLdoDataIssues failed:", e); }
  try { const r = await storage.fixHlcLdoStockBalance(); console.log(`Startup: ${r.message}`); } catch (e) { console.error("Startup: fixHlcLdoStockBalance failed:", e); }
  try { const r = await storage.backfillLdoDispatchConsumption_v1(); console.log(`Startup: ${r.message}`); } catch (e) { console.error("Startup: backfillLdoDispatchConsumption_v1 failed:", e); }
  try { const r = await storage.fixAllLdoStockBalances_v1(); console.log(`Startup: ${r.message}`); } catch (e) { console.error("Startup: fixAllLdoStockBalances_v1 failed:", e); }
  try { const r = await storage.rebuildLdoDispatchLedger_v1(); console.log(`Startup: ${r.message}`); } catch (e) { console.error("Startup: rebuildLdoDispatchLedger_v1 failed:", e); }
  try { const r = await (storage as any).migrateLdoToDispatchModelOnly_v3(); console.log(`Startup: ${r.message}`); } catch (e) { console.error("Startup: migrateLdoToDispatchModelOnly_v3 failed:", e); }
  try { const r = await storage.backfillMissingDispatchLdoRows(); if (r.created > 0) console.log(`Startup: backfillMissingDispatchLdoRows — created: ${r.created}, skipped: ${r.skipped}, errors: ${r.errors}`); else console.log(`Startup: backfillMissingDispatchLdoRows — 0 rows needed (clean), skipped: ${r.skipped}, errors: ${r.errors}`); } catch (e) { console.error("Startup: backfillMissingDispatchLdoRows failed:", e); }

  // ── Stale draft GRN push alert (hourly) ─────────────────────────────────────
  const _rawStaleHours = parseInt(process.env.STALE_GRN_THRESHOLD_HOURS || "48", 10);
  const STALE_GRN_THRESHOLD_HOURS = Number.isFinite(_rawStaleHours) && _rawStaleHours > 0 && _rawStaleHours <= 8760 ? _rawStaleHours : 48;
  const STALE_GRN_CHECK_INTERVAL_MS = 60 * 60 * 1000;

  async function checkAndNotifyStaleGrns() {
    try {
      const stale = await storage.getStaleGrns(STALE_GRN_THRESHOLD_HOURS);
      if (stale.length === 0) return;
      const body = stale.length === 1
        ? `Draft GRN ${stale[0].grnNumber} has been waiting for a PI for over ${STALE_GRN_THRESHOLD_HOURS}h`
        : `${stale.length} draft GRNs have been waiting for a PI for over ${STALE_GRN_THRESHOLD_HOURS}h`;
      await sendPushToAudience("⏳ Stale Draft GRN Alert", body, "/stores/grns", "managers");
      console.log(`[StaleGRN] Notified managers — ${stale.length} stale draft GRN(s)`);
    } catch (e) { console.error("[StaleGRN] Check failed:", e); }
  }
  setTimeout(() => {
    checkAndNotifyStaleGrns();
    setInterval(checkAndNotifyStaleGrns, STALE_GRN_CHECK_INTERVAL_MS);
  }, 30_000);
}

// ── Idempotency strategy (retained for reference) ─────────────────────────────
// Every migration in runBackgroundMigrations() is idempotent:
//   (A) DATA-CONDITION CHECK — queries data first, only writes if condition holds
//   (B) IDEMPOTENT OPERATION — SQL is a no-op when re-run (e.g. DELETE WHERE id NOT IN …)
//   (C) DOCUMENTED RISK      — side-effect is bounded and explicitly documented
// If app_settings is truncated, migrations re-execute but cause no data corruption.
//
