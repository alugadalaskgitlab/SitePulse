import { db } from "./db";
import {
  dprs,
  progressEntries,
  equipmentLogs,
  labourLogs,
  materialLogs,
  plantReports,
  plantProduction,
  dprVersions,
  plantVersions,
  appSettings,
  plantSettings,
  type PlantSettings,
  type InsertPlantSettings,
  parties,
  plantMaterials,
  mixTypes,
  mixTemplates,
  mixTemplateComponents,
  equipmentMaster,
  materialReceipts,
  truckDispatches,
  equipmentUsage,
  generatorLogs,
  ldoLogs,
  stockBalances,
  stockLedger,
  materialIssues,
  materialReturns,
  sitePurchases,
  siteMaterialTrips,
  adminNotifications,
  bitumenDipReadings,
  ldoFlowReadings,
  ldoDipReadings,
  plantShiftLogs,
  bitumenHeatingSessions,
  plantHeatingSessionVersions,
  plantShiftLogManpower,
  plantShiftLogManpowerRelabelBatches,
  plantShiftLogManpowerRelabelSnapshots,
  plantShiftLogManpowerDismissedDups,
  plantShiftLogManpowerCustomAliases,
  plantShiftLogManpowerDupActivity,
  plantShiftLogManpowerAliasActivity,
  type PlantShiftLogManpowerRelabelBatch,
  type PlantShiftLogManpowerDismissedDup,
  type PlantShiftLogManpowerCustomAlias,
  type PlantShiftLogManpowerDupActivity,
  type PlantShiftLogManpowerAliasActivity,
  plantShiftLogIdle,
  plantShiftLogVersions,
  type PlantShiftLog,
  type PlantShiftLogWithDetails,
  type PlantShiftLogManpower,
  type PlantShiftLogIdle,
  type UpsertPlantShiftLogInput,
  type BitumenHeatingSession,
  type InsertBitumenHeatingSession,
  type UpsertBitumenHeatingSessionInput,
} from "@shared/schema";
import { getVolumeAtDepth, BITUMEN_DENSITY_KG_PER_LITER, LDO_DENSITY_KG_PER_LITER } from "@shared/bitumen-dip-chart";
import { getLdoMaxDepth, getLdoVolumeAtDepth } from "@shared/ldo-dip-chart";
import { sendPushToAll } from "./push";
import {
  type CreateDprRequest,
  type Dpr,
  type DprWithDetails,
  type PlantReport,
  type CreatePlantReportRequest,
  type PlantReportWithDetails,
  type AppSetting,
  type Party,
  type InsertParty,
  type PlantMaterial,
  type InsertPlantMaterial,
  type MixType,
  type InsertMixType,
  type MixTemplate,
  type InsertMixTemplate,
  type MixTemplateComponent,
  type InsertMixTemplateComponent,
  type EquipmentMasterType,
  type InsertEquipmentMaster,
  type MaterialReceipt,
  type InsertMaterialReceipt,
  type TruckDispatch,
  type InsertTruckDispatch,
  type EquipmentUsage,
  type InsertEquipmentUsage,
  type GeneratorLog,
  type InsertGeneratorLog,
  type LdoLog,
  type InsertLdoLog,
  type StockBalance,
  type InsertStockBalance,
  type StockLedgerEntry,
  type InsertStockLedger,
  type MaterialIssue,
  type InsertMaterialIssue,
  type MaterialReturn,
  type InsertMaterialReturn,
  type MaterialOpeningStock,
  type InsertMaterialOpeningStock,
  materialOpeningStocks,
  type AdminNotification,
  type InsertAdminNotification,
  type SiteMaterialTrip,
  type InsertSiteMaterialTrip,
  consumptionAuditLog,
  type ConsumptionAuditLog,
  type InsertConsumptionAuditLog,
  sites,
  type Site,
  type InsertSite,
  type BitumenDipReading,
  type InsertBitumenDipReading,
  type LdoFlowReading,
  type InsertLdoFlowReading,
  type LdoDipReading,
  type InsertLdoDipReading,
  pushSubscriptions,
  type PushSubscription,
  type InsertPushSubscription,
  dieselRequirements,
  dieselRequirementItems,
  type DieselRequirement,
  type DieselRequirementItem,
  type DieselRequirementWithItems,
  type CreateDieselRequirementRequest,
  type InsertDieselRequirement,
  type InsertDieselRequirementItem,
  purchaseIndents,
  purchaseIndentItems,
  purchaseIndentItemHistory,
  type PurchaseIndent,
  type PurchaseIndentItem,
  type PurchaseIndentItemHistoryEntry,
  type PurchaseIndentWithItems,
  type CreatePurchaseIndentRequest,
  personnel,
  activityPersonnel,
  type Personnel,
  type InsertPersonnel,
  type ActivityPersonnel,
  DEFAULT_LDO_NORM,
  CONSUMPTION_TOLERANCE_PERCENT,
  vendorBills,
  vendorBillItems,
  type VendorBill,
  type VendorBillItem,
  type VendorBillWithItems,
  type CreateVendorBillRequest,
  type InsertVendorBill,
  type InsertVendorBillItem,
  vendorAliases,
  mixEstimates,
  type MixEstimate,
  type InsertMixEstimate,
  priceScenarios,
  type PriceScenario,
  type InsertPriceScenario,
  type VendorAlias,
  vendorRateCards,
  type VendorRateCard,
  type InsertVendorRateCard,
  concreteEstimates,
  type ConcreteEstimate,
  type InsertConcreteEstimate,
  concreteEstimatesV2,
  type ConcreteEstimateV2,
  type InsertConcreteEstimateV2,
  users,
} from "@shared/schema";
import { eq, desc, and, gte, lte, gt, lt, ne, notInArray, inArray, or, sql, asc, isNull, isNotNull, ilike, getTableColumns } from "drizzle-orm";
import { format } from "date-fns";
import { canonicalizeMachineType } from "@shared/canonicalize";
import {
  HEATING_TRENDS_HOT_OIL_END_TEMP_MIN_C,
  HEATING_TRENDS_HOT_OIL_DELTA_MIN_C,
  HEATING_TRENDS_MISMATCH_THRESHOLD_L,
} from "@shared/heating-trends-constants";

// Task #434 — Maximum acceptable divergence between LDO flow-meter consumption
// and dip-stick-derived consumption within a single shift before the operator is
// warned. Expressed in litres. Adjust via this single constant if the threshold
// needs to be tuned without touching the comparison logic.
const LDO_DIVERGENCE_THRESHOLD_LITERS = 300;

// Task #490 — Convert an LDO material receipt quantity to litres using the same
// logic as convertLdoToL() on the frontend (PlantLdoFlowMeter.tsx).
function convertLdoQtyToLiters(quantity: number, uom: string): number {
  const u = uom.toLowerCase().trim();
  if (u === "liters" || u === "litres" || u === "l") return quantity;
  if (u === "kg") return quantity / LDO_DENSITY_KG_PER_LITER;
  if (u === "mt" || u === "ton" || u === "tons" || u === "t") return (quantity * 1000) / LDO_DENSITY_KG_PER_LITER;
  return quantity; // fallback: treat as litres
}

export interface IStorage {
  // DPRs
  getDprs(filters?: { site?: string; engineer?: string; dateFrom?: string; dateTo?: string }): Promise<Dpr[]>;
  getDprsWithDetails(): Promise<DprWithDetails[]>;
  getDpr(id: number): Promise<DprWithDetails | undefined>;
  createDpr(dpr: CreateDprRequest, clientTimestamp?: string): Promise<Dpr>;
  updateDpr(id: number, dpr: CreateDprRequest): Promise<Dpr | undefined>;
  cloneDpr(id: number, editedBy: string, clientTimestamp?: string): Promise<Dpr | undefined>;
  createVersionDpr(originalId: number, dprData: CreateDprRequest, editedBy: string, clientTimestamp?: string): Promise<Dpr>;
  deleteDpr(id: number): Promise<boolean>;
  
  // Plant Reports
  getPlantReports(): Promise<PlantReport[]>;
  getPlantReport(id: number): Promise<PlantReportWithDetails | undefined>;
  createPlantReport(report: CreatePlantReportRequest): Promise<PlantReport>;
  clonePlantReport(id: number, editedBy: string): Promise<PlantReport | undefined>;
  updatePlantReport(id: number, report: CreatePlantReportRequest): Promise<PlantReport | undefined>;
  deletePlantReport(id: number): Promise<boolean>;
  
  // App Settings (PIN management)
  getSetting(key: string): Promise<string | null>;
  setSetting(key: string, value: string): Promise<void>;
  // Task #253 — per-plant tank calibration (bitumen dip → MT).
  getPlantSettings(plantName: string): Promise<PlantSettings | null>;
  listPlantSettings(): Promise<PlantSettings[]>;
  upsertPlantSettings(input: InsertPlantSettings): Promise<PlantSettings>;
  // Plant Module Phase-1 - Masters
  getParties(): Promise<Party[]>;
  createParty(party: InsertParty): Promise<Party>;
  updateParty(id: number, party: Partial<InsertParty>): Promise<Party | undefined>;
  deleteParty(id: number): Promise<boolean>;
  
  getPlantMaterials(): Promise<PlantMaterial[]>;
  createPlantMaterial(material: InsertPlantMaterial): Promise<PlantMaterial>;
  updatePlantMaterial(id: number, material: Partial<InsertPlantMaterial>): Promise<PlantMaterial | undefined>;
  deletePlantMaterial(id: number): Promise<boolean>;
  
  getMixTypes(): Promise<MixType[]>;
  createMixType(mixType: InsertMixType): Promise<MixType>;
  updateMixType(id: number, mixType: Partial<InsertMixType>): Promise<MixType | undefined>;
  deleteMixType(id: number): Promise<boolean>;
  
  getMixTemplates(): Promise<MixTemplate[]>;
  getAllMixTemplateComponents(): Promise<MixTemplateComponent[]>;
  getMixTemplateWithComponents(id: number): Promise<{ template: MixTemplate; components: MixTemplateComponent[] } | undefined>;
  createMixTemplate(template: InsertMixTemplate, components?: InsertMixTemplateComponent[]): Promise<MixTemplate>;
  updateMixTemplate(id: number, template: Partial<InsertMixTemplate>, components?: InsertMixTemplateComponent[]): Promise<MixTemplate | undefined>;
  deleteMixTemplate(id: number): Promise<boolean>;
  
  getEquipmentMaster(includeInactive?: boolean): Promise<EquipmentMasterType[]>;
  createEquipment(equipment: InsertEquipmentMaster): Promise<EquipmentMasterType>;
  updateEquipment(id: number, equipment: Partial<InsertEquipmentMaster>): Promise<EquipmentMasterType | undefined>;
  deleteEquipment(id: number): Promise<boolean>;
  hasEquipmentUsageHistory(id: number): Promise<boolean>;
  
  // Plant Module Phase-1 - Transactions
  getMaterialReceipts(filters?: { partyId?: number; dateFrom?: string; dateTo?: string }): Promise<MaterialReceipt[]>;
  createMaterialReceipt(receipt: InsertMaterialReceipt): Promise<MaterialReceipt>;
  updateMaterialReceipt(id: number, receipt: Partial<InsertMaterialReceipt>): Promise<MaterialReceipt | undefined>;
  deleteMaterialReceipt(id: number): Promise<boolean>;
  
  getTruckDispatches(filters?: { partyId?: number; dateFrom?: string; dateTo?: string }): Promise<TruckDispatch[]>;
  createTruckDispatch(dispatch: InsertTruckDispatch): Promise<TruckDispatch>;
  updateTruckDispatch(id: number, dispatch: Partial<InsertTruckDispatch>, adjustedBy?: string): Promise<TruckDispatch | undefined>;
  deleteTruckDispatch(id: number): Promise<boolean>;
  
  getEquipmentUsage(filters?: { equipmentId?: number; dateFrom?: string; dateTo?: string }): Promise<EquipmentUsage[]>;
  createEquipmentUsage(usage: InsertEquipmentUsage): Promise<EquipmentUsage>;
  updateEquipmentUsage(id: number, usage: Partial<InsertEquipmentUsage>): Promise<EquipmentUsage | undefined>;
  deleteEquipmentUsage(id: number): Promise<boolean>;
  
  getGeneratorLogs(filters?: { dateFrom?: string; dateTo?: string }): Promise<GeneratorLog[]>;
  createGeneratorLog(log: InsertGeneratorLog): Promise<GeneratorLog>;
  
  getLdoLogs(filters?: { partyId?: number; dateFrom?: string; dateTo?: string }): Promise<LdoLog[]>;
  createLdoLog(log: InsertLdoLog): Promise<LdoLog>;
  updateLdoLog(id: number, updates: Partial<InsertLdoLog>): Promise<LdoLog | undefined>;
  getLdoDailySummary(date: string, plantName?: string): Promise<{
    openingStockL: number | null;
    ldoReceivedL: number;
    ldoConsumedL: number;
    closingStockL: number | null;
    tonsProducedMT: number;
    hasFlowReadings: boolean;
  }>;
  
  getStockBalances(partyId?: number): Promise<StockBalance[]>;
  updateStockBalance(partyId: number | null, materialId: number, quantity: number, uom: string): Promise<StockBalance>;
  
  // Stock Ledger
  getStockLedger(filters?: { partyId?: number; materialId?: number; dateFrom?: string; dateTo?: string }): Promise<StockLedgerEntry[]>;
  getStockBalanceAsOf(date: string, filters?: { partyId?: number; materialId?: number }): Promise<{ materialId: number; partyId: number | null; uom: string; totalIn: number; totalOut: number }[]>;
  getPartyStatement(partyId: number, materialId: number, dateFrom?: string, dateTo?: string): Promise<{
    summary: { totalReceived: number; dispatchedOwn: number; borrowedFromHlc: number; replenishedToHlc: number; outstanding: number; uom: string };
    entries: (StockLedgerEntry & { displayType: string; borrowedQty: number; runningBalance: number })[];
  }>;
  getHlcBorrowReconciliation(partyId: number, materialId: number, dateFrom?: string, dateTo?: string): Promise<{
    uom: string;
    rows: { date: string; site: string; partyStatementBorrowed: number; hlcLedgerDispatched: number | null; delta: number | null; isLegacy: boolean }[];
    totals: { partyStatementBorrowed: number; hlcLedgerDispatched: number; delta: number };
  }>;
  addStockLedgerEntry(entry: InsertStockLedger): Promise<StockLedgerEntry>;
  
  // Material Issues (issues to sites/parties from central store)
  getMaterialIssues(filters?: { partyId?: number; dateFrom?: string; dateTo?: string }): Promise<MaterialIssue[]>;
  createMaterialIssue(issue: InsertMaterialIssue): Promise<MaterialIssue>;
  updateMaterialIssue(id: number, issue: Partial<InsertMaterialIssue>): Promise<MaterialIssue | undefined>;
  deleteMaterialIssue(id: number): Promise<boolean>;
  
  // Material Returns (returns of issued materials back to stock)
  getMaterialReturns(filters?: { materialId?: number; originalIssueId?: number; dateFrom?: string; dateTo?: string }): Promise<MaterialReturn[]>;
  getReturnedQtyForIssue(issueId: number): Promise<number>;
  createMaterialReturn(ret: InsertMaterialReturn): Promise<MaterialReturn>;
  updateMaterialReturn(id: number, updates: Partial<InsertMaterialReturn>): Promise<MaterialReturn | undefined>;
  deleteMaterialReturn(id: number): Promise<boolean>;
  
  // Material Opening Stocks
  getMaterialOpeningStocks(filters?: { materialId?: number; partyId?: number }): Promise<MaterialOpeningStock[]>;
  getMaterialOpeningStock(id: number): Promise<MaterialOpeningStock | undefined>;
  createMaterialOpeningStock(stock: InsertMaterialOpeningStock): Promise<MaterialOpeningStock>;
  updateMaterialOpeningStock(id: number, stock: Partial<InsertMaterialOpeningStock>): Promise<MaterialOpeningStock | undefined>;
  deleteMaterialOpeningStock(id: number): Promise<boolean>;
  
  // Enhanced dispatch with stock deduction
  createTruckDispatchWithStockDeduction(
    dispatch: InsertTruckDispatch & { allowHlcFallback?: boolean },
  ): Promise<{ dispatch: TruckDispatch; shortages: { materialId: number; required: number; available: number }[] }>;

  // Physical stock correction (reconcile book stock to physical measurement)
  postStockCorrection(data: { materialId: number; partyId: number; physicalQty: number; uom: string; date: string; notes: string; correctedBy: string }): Promise<{ adjustment: number; previousBalance: number; newBalance: number; ledgerEntry: StockLedgerEntry }>;
  
  // Recalculate all dispatch consumption from mix templates
  recalculateAllDispatchConsumption(): Promise<{ updated: number; errors: number; varianceFixed: number }>;
  
  // Create missing ledger entries for equipment usage diesel and clean up orphaned reversals
  reconcileEquipmentUsageLedger(): Promise<{ created: number; skipped: number; errors: number; cleaned: number }>;
  purgeOrphanedDeletionReversals(): Promise<{ removed: number }>;
  
  // Reconcile stock balances from ledger entries (excludes legacy equipment_issue)
  reconcileStockBalancesFromLedger(): Promise<{ updated: number; created: number; errors: number }>;

  // One-time data fix: insert missing LAXMI 0-qty marker rows for dispatches 49 & 50
  // and correct the over-counted HLC borrow entries (Task #427).
  applyLedgerGapFix427(): Promise<{ alreadyApplied: boolean; markersInserted: number; hlcEntriesUpdated: number; reconciled: { updated: number; created: number; errors: number } }>;

  // Backfill historical dispatch ledger notes from old patterns (e.g. "Aggregate dispatch (Party)")
  // to the new "MixName — DeliveryLocation" format introduced in Task #406.
  backfillDispatchNotes(): Promise<{ updated: number; skipped: number; errors: number }>;

  // Rebuild aggregate dispatch ledger entries for a template from a date+time cutoff
  rebuildDispatchLedgerForTemplate(opts: {
    templateId: number;
    fromDateTime: string;
  }): Promise<{
    fromDateTime: string;
    dispatches: number;
    ledgerRowsDeleted: number;
    ledgerRowsCreated: number;
    errors: string[];
  }>;

  // Admin: preview / move ledger rows between parties (historical reassignment).
  previewLedgerForReassignment(opts: {
    materialId: number;
    fromPartyId: number;
    dateFrom?: string;
    dateTo?: string;
    transactionType?: string;
  }): Promise<{ id: number; date: string; transactionType: string; quantityIn: number | null; quantityOut: number | null; uom: string | null; notes: string | null }[]>;

  executeLedgerReassignment(opts: {
    materialId: number;
    fromPartyId: number;
    toPartyId: number;
    dateFrom?: string;
    dateTo?: string;
    transactionType?: string;
  }): Promise<{ moved: number; totalIn: number; totalOut: number; reconciled: { updated: number; created: number; errors: number } }>;

  // Create a forward stock transfer between two parties (e.g. returning borrowed material)
  createStockTransfer(opts: {
    materialId: number;
    fromPartyId: number;
    toPartyId: number;
    quantity: number;
    date: string;
    notes?: string;
    actorName?: string;
  }): Promise<{ outEntry: StockLedgerEntry; inEntry: StockLedgerEntry; reconciled: { updated: number; created: number; errors: number } }>;

  // Migrate orphan stock (NULL partyId) to HLC party
  migrateOrphanStockToHLC(): Promise<{ ledgerFixed: number; balancesMerged: number; errors: number }>;
  
  // Clean up duplicate diesel stock ledger entries from superseded/edited DPRs
  cleanupSupersededDprDieselLedger(): Promise<{ removed: number; errors: number }>;

  // Repair site purchases lost during DPR edits - carry forward from previous versions
  repairMissingSitePurchases(): Promise<{ repaired: number; errors: number }>;

  // Repair diesel source lost during DPR edits - carry forward direct_purchase from original versions
  repairLostDieselSource(): Promise<{ repaired: number; ledgerCreated: number; errors: number }>;

  // Migrate historical DPR plant_stock diesel to stock ledger (with overlap detection against Plant Equipment Usage)
  migrateDprPlantStockDieselToLedger(): Promise<{ created: number; skipped: number; overlapped: number; errors: number }>;

  // Mark superseded DPRs from version chains
  migrateSupersededDprs(): Promise<{ marked: number; errors: number }>;

  // Update historical DPR engineer names to "NAME - ROLE" from Personnel Master
  migrateEngineerNamesToPersonnelFormat(): Promise<{ updated: number; unmatched: number; errors: number }>;

  // Backfill contractorName / category / gender on legacy plant_shift_log_manpower rows
  migrateLegacyPlantShiftLogManpower(): Promise<{ updated: number; skipped: number; errors: number }>;

  // Backfill lock_status = 'unlocked' on all plant_shift_logs rows (Task #376 — lock gate removed in #375)
  backfillShiftLogLockStatus(): Promise<{ updated: number; errors: number }>;

  // Rewrite legacy short generator names (e.g. "600 KVA") to canonical Equipment Master names ("600 KVA GENERATOR")
  migrateLegacyGeneratorNamesToCanonical(): Promise<{ generatorLogsUpdated: number; heatingSessionsUpdated: number; errors: number }>;

  // Ensures the 4 LDO dip columns added in Task #551 exist on bitumen_heating_sessions.
  // Safe to run multiple times (ALTER TABLE … ADD COLUMN IF NOT EXISTS).
  ensureHeatingSessionDipColumns(): Promise<void>;

  // Removes duplicate dip rows from bitumen_dip_readings before the unique index is enforced,
  // keeping the lowest id per (date, tank_number, reading_type, plant_name).
  deduplicateBitumenDipReadings(): Promise<{ removed: number }>;

  // Removes duplicate dip rows from ldo_dip_readings before the unique index is enforced,
  // keeping the lowest id per (date, tank_number, reading_type, plant_name).
  deduplicateLdoDipReadings(): Promise<{ removed: number }>;

  // Backfill LDO Flow Meter ledger rows (tagged sourceHeatingSessionId) from historical bitumen heating sessions.
  // Removes duplicate slot (opening/closing) rows from ldo_flow_readings before the unique
  // index is applied, keeping the lowest id per (date, tank_number, reading_type, plant_name).
  deduplicateLdoFlowSlotReadings(): Promise<{ removed: number }>;

  // Idempotent: drops rows already tagged for each session, re-inserts opening/closing if values are present.
  backfillLdoFlowReadingsFromHeatingSessions(): Promise<{ sessionsScanned: number; rowsInserted: number; sessionsUpdated: number; sessionsSkipped: number; errors: number }>;

  // Backfill LDO Flow Meter ledger receipt rows from historical LDO material receipts that don't already
  // have a linked flow reading (sourceMaterialReceiptId). Idempotent: skips already-linked rows.
  backfillLdoReceiptsFromMaterialReceipts(): Promise<{ receiptsScanned: number; rowsInserted: number; rowsSkipped: number; errors: number }>;

  // Admin: list shift-log workers tagged UNKNOWN CONTRACTOR / OTHER, grouped by name
  listShiftLogManpowerNeedingReview(opts?: { dateFrom?: string; dateTo?: string; plantName?: string }): Promise<Array<{
    name: string;
    count: number;
    earliestDate: string;
    latestDate: string;
    currentContractors: string[];
    currentCategories: string[];
    currentGenders: string[];
    roles: string[];
    needsContractor: boolean;
    needsCategory: boolean;
    shiftLogIds: number[];
  }>>;

  // Mine past (non-undone) merge batches to learn name-pair and token-pair
  // equivalences ("MD." merged into "MOHAMMED" once → flag the same pair next
  // time it appears). Used by the cleanup screen's smarter suggester.
  // `count` is the number of distinct merge batches that contributed to the
  // pair — repeat patterns get a higher count and are treated with higher
  // confidence by the cluster builder.
  getShiftLogManpowerLearnedAliases(): Promise<{
    pairs: Array<{
      a: string;
      b: string;
      count: number;
      examples: Array<{ batchId: number; from: string; to: string; actor: string; createdAt: string }>;
    }>;
    tokenPairs: Array<{
      a: string;
      b: string;
      count: number;
      examples: Array<{ batchId: number; from: string; to: string; actor: string; createdAt: string }>;
    }>;
  }>;

  // Admin: bulk-set name/contractor/category/gender for every shift-log row whose
  // worker name (case-insensitive, trimmed) matches one of `fromNames`. `toName`
  // becomes the new canonical worker name for every matched row. When `fromNames`
  // contains more than one entry this performs a merge of duplicate spellings.
  bulkRelabelShiftLogManpowerByName(input: {
    fromNames: string[];
    toName: string;
    contractorName: string;
    category: string;
    gender: string;
    actor: string;
  }): Promise<{ updated: number; batchId: number }>;

  // Recent merge/relabel batches done from the worker-cleanup screen, newest
  // first. Limited to the retention window (days) and excludes already-undone
  // batches.
  getRecentShiftLogManpowerRelabelBatches(days: number): Promise<Array<
    PlantShiftLogManpowerRelabelBatch & { isMerge: boolean }
  >>;

  // Restore the previous (name, contractor, category, gender) for every row
  // that was changed in the given batch. Marks the batch as undone. Throws
  // if already undone or older than 30 days.
  undoShiftLogManpowerRelabelBatch(input: {
    batchId: number;
    actor: string;
  }): Promise<{ restored: number }>;

  // Persisted "not a duplicate" decisions for the worker-cleanup screen.
  // Scoped per-plant ("site"): the same name-pair can be marked
  // not-a-duplicate on Plant A while still being suggested on Plant B. Use
  // ALL_PLANTS_SENTINEL when the cleanup screen is in cross-plant view.
  listShiftLogManpowerDismissedDuplicatePairs(plantName: string): Promise<PlantShiftLogManpowerDismissedDup[]>;
  addShiftLogManpowerDismissedDuplicatePairs(input: {
    plantName: string;
    pairs: Array<[string, string]>;
    actor: string;
  }): Promise<{ added: number; addedPairs: Array<[string, string]> }>;
  removeShiftLogManpowerDismissedDuplicatePair(id: number): Promise<{
    removed: boolean;
    pair: { plantName: string; nameA: string; nameB: string } | null;
  }>;
  removeShiftLogManpowerDismissedDuplicatePairsBulk(input: {
    plantName: string;
    ids?: number[];
    olderThanDays?: number;
  }): Promise<{
    removed: number;
    removedIds: number[];
    removedPairs: Array<[string, string]>;
  }>;

  // Audit feed of dismiss / restore / bulk-restore actions, used to render
  // the worker-cleanup recent-activity timeline alongside merges.
  addShiftLogManpowerDupActivity(input: {
    actor: string;
    plantName: string;
    action: "dismiss" | "restore" | "bulk_restore";
    pairs: Array<[string, string]>;
  }): Promise<void>;
  getRecentShiftLogManpowerDupActivity(days: number): Promise<PlantShiftLogManpowerDupActivity[]>;

  // Admin-managed custom token-equivalence pairs for the duplicate-suggester
  // (kind = 'alias') and admin-suppressed learned token-pairs (kind =
  // 'suppress_learned'). Both kinds live in the same table; the cleanup screen
  // uses them to extend / mute the auto-mined dictionary.
  listShiftLogManpowerCustomAliases(): Promise<PlantShiftLogManpowerCustomAlias[]>;
  /** Adds a custom alias or suppression entry to the duplicate-suggester
   * dictionary.
   * - `alias`: explicit token equivalence (e.g. CHIKKU↔CHANDRA)
   * - `suppress_learned`: mute an auto-mined token-pair without undoing the
   *    merge that created it
   * - `suppress_learned_pair`: mute an auto-mined full-name pair (preserves
   *    spaces inside the pair so e.g. "MD KAREEM" ↔ "MOHAMMED KAREEM" matches
   *    the corresponding entry returned by getShiftLogManpowerLearnedAliases)
   */
  addShiftLogManpowerCustomAlias(input: {
    tokenA: string;
    tokenB: string;
    kind: "alias" | "suppress_learned" | "suppress_learned_pair";
    actor: string;
  }): Promise<{ added: boolean; alias: PlantShiftLogManpowerCustomAlias | null }>;
  /** Returns the (tokenA, tokenB, kind) of the deleted row so callers can
   * snapshot it into the alias-activity audit before it disappears. */
  deleteShiftLogManpowerCustomAlias(id: number): Promise<{
    removed: boolean;
    tokenA: string | null;
    tokenB: string | null;
    kind: string | null;
  }>;

  // Audit feed of custom-alias dictionary edits (add/remove of aliases and
  // mute/unmute of learned aliases). Used to render the "Recent alias changes"
  // sub-panel inside Manage aliases with a one-click revert per entry.
  addShiftLogManpowerAliasActivity(input: {
    actor: string;
    action: "add" | "remove";
    kind: "alias" | "suppress_learned" | "suppress_learned_pair";
    tokenA: string;
    tokenB: string;
  }): Promise<void>;
  getRecentShiftLogManpowerAliasActivity(days: number): Promise<PlantShiftLogManpowerAliasActivity[]>;

  /** Bulk-revert a list of alias-activity entries in one call.
   * For "add" entries: deletes the matching alias row (if still present).
   * For "remove" entries: re-inserts the alias row (if not already present).
   * Writes one audit row per successfully-reverted entry.
   * Returns a count of reverted and skipped (already-reverted / no-op) entries.
   */
  bulkRevertShiftLogManpowerAliasActivities(input: {
    actor: string;
    activities: Array<{
      action: "add" | "remove";
      kind: "alias" | "suppress_learned" | "suppress_learned_pair";
      tokenA: string;
      tokenB: string;
    }>;
  }): Promise<{
    reverted: number;
    skipped: number;
    appliedActivities: Array<{ action: "add" | "remove"; kind: "alias" | "suppress_learned" | "suppress_learned_pair"; tokenA: string; tokenB: string }>;
  }>;

  // Fix bad stock_balance / stock_ledger entries created by old buggy party-detection logic
  fixBadStockBalanceEntries(): Promise<{ fixed: number; skipped: boolean }>;
  
  // Site Material Logs Summary
  getSiteMaterialLogs(filters?: { site?: string; dateFrom?: string; dateTo?: string }): Promise<{
    id: number;
    dprId: number;
    date: string;
    site: string;
    type: string;
    material: string;
    quantity: number | null;
    uom: string | null;
    supplier: string | null;
    vehicleNumber: string | null;
    location: string | null;
    receiptNumber: string | null;
  }[]>;
  
  // Admin Notifications
  getNotifications(): Promise<AdminNotification[]>;
  getUnreadNotificationCount(): Promise<number>;
  createNotification(data: InsertAdminNotification): Promise<AdminNotification>;
  markNotificationRead(id: number): Promise<void>;
  markAllNotificationsRead(): Promise<void>;
  deleteNotification(id: number): Promise<void>;

  // Push Subscriptions
  getAllPushSubscriptions(): Promise<PushSubscription[]>;
  getActivePushSubscriptions(): Promise<PushSubscription[]>;
  createPushSubscription(data: InsertPushSubscription): Promise<PushSubscription>;
  deletePushSubscriptionByEndpoint(endpoint: string): Promise<void>;
  deletePushSubscriptionsByUserId(userId: number): Promise<void>;
  
  // Sites Master
  getSites(): Promise<Site[]>;
  createSite(site: InsertSite): Promise<Site>;
  updateSite(id: number, site: Partial<InsertSite>): Promise<Site | undefined>;
  deleteSite(id: number): Promise<boolean>;
  seedSitesFromDprs(): Promise<number>;

  // Site Purchases Report
  getAllSitePurchases(filters?: { site?: string; dateFrom?: string; dateTo?: string }): Promise<any[]>;
  updateSitePurchase(id: number, data: { itemDescription?: string; quantity?: number | null; uom?: string | null; vendor?: string | null; billNo?: string | null; amount?: number | null }): Promise<any>;

  // Site Material Trips (Quick Entry)
  getSiteMaterialTrips(filters?: { site?: string; material?: string; dateFrom?: string; dateTo?: string }): Promise<SiteMaterialTrip[]>;
  createSiteMaterialTrip(data: InsertSiteMaterialTrip): Promise<SiteMaterialTrip>;
  updateSiteMaterialTrip(id: number, data: Partial<InsertSiteMaterialTrip>): Promise<SiteMaterialTrip>;
  deleteSiteMaterialTrip(id: number): Promise<void>;

  // Combined Materials Received (site_material_trips + DPR material_logs type=Received)
  getAllMaterialsReceived(filters?: { site?: string; material?: string; dateFrom?: string; dateTo?: string; supplier?: string }): Promise<any[]>;
  getMaterialSuppliers(): Promise<string[]>;
  
  // Consumption Audit Log
  getConsumptionAuditLog(filters?: { dispatchId?: number; dateFrom?: string; dateTo?: string }): Promise<ConsumptionAuditLog[]>;
  createConsumptionAuditEntry(data: InsertConsumptionAuditLog): Promise<ConsumptionAuditLog>;
  
  // Dispatch Variance Report
  getDispatchesWithVariance(filters?: { dateFrom?: string; dateTo?: string }): Promise<TruckDispatch[]>;

  // Personnel Master
  getPersonnel(includeInactive?: boolean): Promise<Personnel[]>;
  createPersonnel(data: InsertPersonnel): Promise<Personnel>;
  updatePersonnel(id: number, data: Partial<InsertPersonnel>): Promise<Personnel | undefined>;
  togglePersonnelActive(id: number): Promise<Personnel | undefined>;
  deletePersonnel(id: number): Promise<boolean>;
  hasPersonnelUsageHistory(id: number): Promise<boolean>;

  // Activity Personnel
  saveActivityPersonnel(progressEntryId: number, personnelIds: number[]): Promise<void>;
  getActivityPersonnel(progressEntryIds: number[]): Promise<ActivityPersonnel[]>;

  // Purchase Indents
  getPurchaseIndents(filters?: { dateFrom?: string; dateTo?: string; status?: string; priority?: string }): Promise<PurchaseIndentWithItems[]>;
  getPurchaseIndent(id: number): Promise<PurchaseIndentWithItems | undefined>;
  createPurchaseIndent(data: CreatePurchaseIndentRequest): Promise<PurchaseIndentWithItems>;
  approvePurchaseIndent(id: number, approvedItems: { itemId: number; approvedQty: number }[], approvedBy: string, remarks?: string): Promise<PurchaseIndentWithItems | undefined>;
  rejectPurchaseIndent(id: number, reason: string, rejectedBy: string): Promise<PurchaseIndentWithItems | undefined>;
  updatePurchaseItemStatus(itemId: number, purchaseData: { purchaseStatus?: string; qtyPurchased?: number; vendor?: string; billNo?: string; rate?: number; amount?: number; purchaseRemarks?: string }, actionBy?: string): Promise<PurchaseIndentItem | undefined>;
  cancelPurchaseItem(itemId: number, cancelledBy: string, reason: string): Promise<PurchaseIndentItem | undefined>;
  forceCloseIndent(indentId: number, closedBy: string, reason: string): Promise<PurchaseIndentWithItems | undefined>;
  getItemHistory(itemId: number): Promise<PurchaseIndentItemHistoryEntry[]>;
  getProcurementReport(filters?: { dateFrom?: string; dateTo?: string; purchaseStatus?: string; purpose?: string; vendor?: string }): Promise<{ items: any[]; summary: { totalItems: number; purchased: number; partial: number; cancelled: number; notPurchased: number; pending: number; totalSpend: number; fulfillmentRate: number } }>;
  updatePurchaseIndent(id: number, data: CreatePurchaseIndentRequest): Promise<PurchaseIndentWithItems | undefined>;
  setIndentNotifyMessage(id: number, message: string): Promise<void>;
  setItemReviewerNote(itemId: number, note: string): Promise<void>;
  deletePurchaseIndent(id: number): Promise<boolean>;

  // Daily Diesel Requirements
  getDieselRequirements(filters?: { dateFrom?: string; dateTo?: string; status?: string }): Promise<DieselRequirementWithItems[]>;
  getDieselRequirement(id: number): Promise<DieselRequirementWithItems | undefined>;
  createDieselRequirement(data: CreateDieselRequirementRequest): Promise<DieselRequirementWithItems>;
  approveDieselRequirement(id: number, approvedItems: { itemId: number; approvedQty: number }[], approvedBy: string): Promise<DieselRequirementWithItems | undefined>;
  rejectDieselRequirement(id: number, reason: string, rejectedBy: string): Promise<DieselRequirementWithItems | undefined>;
  updateDieselPurchase(id: number, purchaseData: { qtyPurchased?: number; supplier?: string; billNo?: string; rate?: number; amount?: number; purchasedAt?: string; purchaseRemarks?: string }): Promise<DieselRequirementWithItems | undefined>;
  getDieselComparisonReport(dateFrom: string, dateTo: string): Promise<{ date: string; totalPlanned: number; totalApproved: number; totalPurchased: number; totalActualIssued: number }[]>;
  updateDieselRequirement(id: number, data: CreateDieselRequirementRequest): Promise<DieselRequirementWithItems | undefined>;
  deleteDieselRequirement(id: number): Promise<boolean>;

  // Vendor Bills
  getVendorBills(filters?: { dateFrom?: string; dateTo?: string; vendor?: string; status?: string }): Promise<VendorBillWithItems[]>;
  getVendorBill(id: number): Promise<VendorBillWithItems | undefined>;
  createVendorBill(data: CreateVendorBillRequest): Promise<VendorBillWithItems>;
  updateVendorBill(id: number, data: CreateVendorBillRequest): Promise<VendorBillWithItems | undefined>;
  updateVendorBillStatus(id: number, status: string, actor: string): Promise<VendorBillWithItems | undefined>;
  deleteVendorBill(id: number): Promise<boolean>;
  getVendorBillAutoItems(vendorName: string, billType: string, periodFrom: string, periodTo: string, entryTypeFilter?: string | null): Promise<Partial<InsertVendorBillItem>[]>;
  getVendorNames(): Promise<string[]>;
  getVendorAliases(): Promise<VendorAlias[]>;
  addVendorAlias(canonicalName: string, alias: string): Promise<VendorAlias>;
  deleteVendorAlias(id: number): Promise<boolean>;
  resolveVendorAliases(vendorName: string): Promise<string[]>;

  getVendorRateCards(vendorName?: string): Promise<VendorRateCard[]>;
  discoverVendorItems(vendorName: string): Promise<{ itemKey: string; itemLabel: string; category: string; unit: string; rate: number | null; rateCardId: number | null }[]>;
  upsertVendorRateCard(data: InsertVendorRateCard): Promise<VendorRateCard>;
  deleteVendorRateCard(id: number): Promise<boolean>;
  checkDuplicateBilledItems(vendorName: string, items: { date: string; equipmentId?: number | null; description?: string; category?: string | null; siteName?: string | null }[], excludeBillId?: number): Promise<{ index: number; billNo: string; billStatus: string }[]>;

  discoverVendors(billType: string, periodFrom: string, periodTo: string): Promise<{
    vendorName: string;
    recordCount: number;
    categories: string[];
    existingBill: { id: number; billNo: string; status: string } | null;
  }[]>;

  getMixEstimates(): Promise<MixEstimate[]>;
  getMixEstimate(id: number): Promise<MixEstimate | undefined>;
  createMixEstimate(data: InsertMixEstimate): Promise<MixEstimate>;
  updateMixEstimate(id: number, data: Partial<InsertMixEstimate>): Promise<MixEstimate | undefined>;
  deleteMixEstimate(id: number): Promise<boolean>;
  fixNullContractorLabels(): Promise<{ updated: number }>;
  fixLabourContractorCasing(): Promise<{ updated: number }>;
  renameContractor(from: string, to: string): Promise<number>;
  getPriceScenarios(estimateId: number): Promise<PriceScenario[]>;
  getPriceScenario(id: number): Promise<PriceScenario | undefined>;
  createPriceScenario(data: InsertPriceScenario): Promise<PriceScenario>;
  updatePriceScenario(id: number, data: { name?: string; state?: string; baseState?: string }): Promise<PriceScenario | undefined>;
  deletePriceScenario(id: number): Promise<boolean>;
  getConcreteEstimates(): Promise<ConcreteEstimate[]>;
  getConcreteEstimate(id: number): Promise<ConcreteEstimate | undefined>;
  createConcreteEstimate(data: InsertConcreteEstimate): Promise<ConcreteEstimate>;
  updateConcreteEstimate(id: number, data: Partial<InsertConcreteEstimate>): Promise<ConcreteEstimate | undefined>;
  deleteConcreteEstimate(id: number): Promise<boolean>;
  getConcreteEstimatesV2(): Promise<ConcreteEstimateV2[]>;
  getConcreteEstimateV2(id: number): Promise<ConcreteEstimateV2 | undefined>;
  createConcreteEstimateV2(data: InsertConcreteEstimateV2): Promise<ConcreteEstimateV2>;
  updateConcreteEstimateV2(id: number, data: Partial<InsertConcreteEstimateV2>): Promise<ConcreteEstimateV2 | undefined>;
  deleteConcreteEstimateV2(id: number): Promise<boolean>;

  // Plant Shift Log + Daily Plant Report
  getPlantShiftLogs(filters?: { dateFrom?: string; dateTo?: string }): Promise<PlantShiftLog[]>;
  getPlantShiftLog(id: number): Promise<PlantShiftLogWithDetails | undefined>;
  getPlantShiftLogByDate(date: string, _shiftCodeIgnored?: string, plantName?: string): Promise<PlantShiftLogWithDetails | undefined>;
  upsertPlantShiftLog(input: UpsertPlantShiftLogInput, editedBy?: string, authorizedRole?: "admin" | "manager" | null): Promise<PlantShiftLogWithDetails & { divergenceWarnings: string[] }>;
  finalizePlantShiftLog(id: number, finalizedBy: string): Promise<PlantShiftLog | undefined>;
  deletePlantShiftLog(id: number): Promise<boolean>;
  getDailyPlantSummary(date: string, plantName?: string): Promise<unknown>;
  // Task #219 — Per-(date, plant) Boiler Meter reconciliation across heating
  // sessions, shift log meter and LDO flow ledger. Used by the heating
  // sessions list to surface days where the three sources have drifted.
  getBoilerMeterReconciliation(filters: {
    dateFrom: string;
    dateTo: string;
    plantName?: string;
  }): Promise<Array<{
    date: string;
    plantName: string;
    sessionsLdoT1L: number | null;
    shiftLogT1L: number | null;
    ledgerSessionsT1L: number | null;
    ledgerShiftT1L: number | null;
    reconciliation: BoilerMeterReconciliationDetail;
  }>>;
  getDailyPlantReportIndex(filters?: { from?: string; to?: string; plant?: string; parties?: number[]; mixTypes?: string[] }): Promise<Array<{
    date: string;
    plantName: string;
    hasDispatches: boolean;
    hasEquipment: boolean;
    hasShiftLog: boolean;
    hasBitumenDips: boolean;
    hasLdoMeter: boolean;
    hasHeatingSessions: boolean;
    totalLoads: number;
    totalProductionMt: number;
    sessionsCount: number;
    shiftLogFinalized: boolean;
    dryerFedFrom: "TANK_1" | "TANK_2" | null;
    breakdown: Array<{ partyName: string; mixType: string; loads: number; mt: number }>;
    ldoBoilerLitres: number | null;
    ldoDryerLitres: number | null;
    ldoHeatingSessionLitres: number | null;
    dgDieselLitres: number | null;
    bitumenTank1OpeningDip: number | null;
    bitumenTank1ClosingDip: number | null;
    bitumenTank2OpeningDip: number | null;
    bitumenTank2ClosingDip: number | null;
    bitumenTemplateMt: number | null;
  }>>;

  // Bitumen Heating Sessions
  getBitumenHeatingSessions(filters?: { dateFrom?: string; dateTo?: string; date?: string; plantName?: string }): Promise<BitumenHeatingSession[]>;
  getBitumenHeatingSession(id: number): Promise<BitumenHeatingSession | undefined>;
  upsertBitumenHeatingSession(input: UpsertBitumenHeatingSessionInput, editedBy?: string, authorizedRole?: "admin" | "manager" | null): Promise<BitumenHeatingSession>;
  finalizeBitumenHeatingSession(id: number, finalizedBy: string): Promise<BitumenHeatingSession | undefined>;
  deleteBitumenHeatingSession(id: number): Promise<boolean>;
  getHeatingTrends(filters: { dateFrom: string; dateTo: string; plantName?: string }): Promise<HeatingTrendsResult>;
  getLatestLdoMeterReading(tank: number, beforeDateTime: string, plantName?: string): Promise<{ value: number; date: string; time: string | null; source: string; sourceId: number } | null>;
  // Task #300 — Per-(date, plant) dryer-source mismatch between shift logs and
  // heating sessions. Surfaced in both list views so operators can spot and
  // fix conflicts on historical records before re-opening them.
  // Task #333 — Also flags intra-day heating-session conflicts (two sessions
  // on the same date with different dryerFedFrom values).
  getDryerSourceMismatches(filters: {
    dateFrom: string;
    dateTo: string;
    plantName?: string;
  }): Promise<Array<{
    date: string;
    plantName: string;
    shiftLogId: number | null;
    shiftLogValue: "TANK_1" | "TANK_2" | null;
    conflictingSessions: Array<{ id: number; dryerFedFrom: "TANK_1" | "TANK_2"; sessionType: string; startTime: string | null }>;
    intraSessionConflicts: Array<{ id: number; dryerFedFrom: "TANK_1" | "TANK_2"; sessionType: string; startTime: string | null }>;
    hasIntraSessionConflict: boolean;
    hasMismatch: boolean;
  }>>;
  // Task #332 — Bulk-align dryerFedFrom on a set of heating sessions in one
  // operation. Used by the one-click conflict-resolution action panel.
  alignDryerSourceForSessions(sessionIds: number[], targetValue: "TANK_1" | "TANK_2"): Promise<number>;
  // Task #334 — Inline dryer-source fix from mismatch toast. Updates just the
  // dryerFedFrom field on a single shift log without a full upsert cycle.
  patchShiftLogDryerSource(id: number, dryerFedFrom: "TANK_1" | "TANK_2"): Promise<boolean>;
}

// Task #219 — Detail returned by the per-(date, plant) Boiler Meter
// reconciliation. Diffs are computed in litres; null when one of the two
// sources for that pair is missing. `anyMismatch` is true when at least one
// available diff exceeds `thresholdL` (the same 5 L tolerance used by the
// existing heating-trends mismatch flag).
export type BoilerMeterReconciliationDetail = {
  thresholdL: number;
  sessionsVsShiftL: number | null;
  sessionsVsLedgerL: number | null;
  shiftVsLedgerL: number | null;
  anyMismatch: boolean;
  mismatches: Array<{ kind: "sessions_vs_shift" | "sessions_vs_ledger" | "shift_vs_ledger"; deltaL: number }>;
};

// Helper — sum (closing − opening) per source-tagged group within a set of
// LDO Flow Meter rows. Rows without an opening or closing partner contribute
// nothing. Returns null when no source-tagged rows exist for the chosen kind.
export function computeLdoLedgerConsumedL(
  rows: Array<Pick<LdoFlowReading, "tankNumber" | "readingType" | "meterReading" | "sourceShiftLogId" | "sourceHeatingSessionId">>,
  kind: "session" | "shift",
): number | null {
  const groups = new Map<number, { opening: number | null; closing: number | null }>();
  for (const r of rows) {
    if (r.tankNumber !== 1) continue;
    const key = kind === "session" ? r.sourceHeatingSessionId : r.sourceShiftLogId;
    if (key == null) continue;
    const cur = groups.get(key) || { opening: null, closing: null };
    if (r.readingType === "opening") cur.opening = r.meterReading;
    else if (r.readingType === "closing") cur.closing = r.meterReading;
    groups.set(key, cur);
  }
  if (groups.size === 0) return null;
  let total = 0;
  let any = false;
  for (const g of groups.values()) {
    if (g.opening != null && g.closing != null) {
      total += Math.max(0, g.closing - g.opening);
      any = true;
    }
  }
  return any ? Math.round(total * 10) / 10 : null;
}

export function buildBoilerMeterReconciliation(input: {
  sessionsLdoT1L: number | null;
  shiftLogT1L: number | null;
  ledgerSessionsT1L: number | null;
  ledgerShiftT1L: number | null;
  thresholdL?: number;
}): BoilerMeterReconciliationDetail {
  const thresholdL = input.thresholdL ?? 5;
  const round1 = (n: number) => Math.round(n * 10) / 10;
  const sessionsVsShiftL = (input.sessionsLdoT1L != null && input.shiftLogT1L != null)
    ? round1(input.sessionsLdoT1L - input.shiftLogT1L) : null;
  const sessionsVsLedgerL = (input.sessionsLdoT1L != null && input.ledgerSessionsT1L != null)
    ? round1(input.sessionsLdoT1L - input.ledgerSessionsT1L) : null;
  const shiftVsLedgerL = (input.shiftLogT1L != null && input.ledgerShiftT1L != null)
    ? round1(input.shiftLogT1L - input.ledgerShiftT1L) : null;
  const mismatches: BoilerMeterReconciliationDetail["mismatches"] = [];
  if (sessionsVsShiftL != null && Math.abs(sessionsVsShiftL) > thresholdL) {
    mismatches.push({ kind: "sessions_vs_shift", deltaL: sessionsVsShiftL });
  }
  if (sessionsVsLedgerL != null && Math.abs(sessionsVsLedgerL) > thresholdL) {
    mismatches.push({ kind: "sessions_vs_ledger", deltaL: sessionsVsLedgerL });
  }
  if (shiftVsLedgerL != null && Math.abs(shiftVsLedgerL) > thresholdL) {
    mismatches.push({ kind: "shift_vs_ledger", deltaL: shiftVsLedgerL });
  }
  return {
    thresholdL,
    sessionsVsShiftL,
    sessionsVsLedgerL,
    shiftVsLedgerL,
    anyMismatch: mismatches.length > 0,
    mismatches,
  };
}

export type HeatingTrendsBucket = {
  count: number;
  hours: number;
  ldoT1L: number;
  dgDieselL: number;
  lPerHour: number | null;
  lPerMT: number | null;
};
export type HeatingTrendsRow = {
  date: string;
  productionMT: number;
  night: HeatingTrendsBucket;
  day: HeatingTrendsBucket;
  total: HeatingTrendsBucket;
  hotOilEndAvgC: number | null;
  hotOilEndMinC: number | null;
  hotOilEndMaxC: number | null;
  hotOilEndSampleCount: number;
  hotOilEndBelowThreshold: boolean;
  // Hot-oil supply vs return temperatures (Task #236). Daily averages of
  // the supply (heater outlet) and return (heater inlet) readings, plus
  // the per-session delta (supply − return) averaged across the day.
  // A shrinking delta over time is a leading indicator of heat-exchanger
  // fouling; days whose average delta drops below thresholds.hotOilDeltaMinC
  // are flagged on the trends chart and table.
  hotOilSupplyAvgC: number | null;
  hotOilReturnAvgC: number | null;
  hotOilDeltaAvgC: number | null;
  hotOilDeltaSampleCount: number;
  hotOilDeltaBelowThreshold: boolean;
  // Shift-meter Tank-1 reconciliation (Task #155). Computed from
  // plantShiftLogs.ldoTank1ClosingMeter − ldoTank1OpeningMeter for the same
  // date / plant. Lets the trend report surface days where heating-session
  // logs disagree with the shift meter (operators forgetting to log sessions
  // or mis-reading the meter).
  shiftMeterT1L: number | null;
  shiftMeterLPerMT: number | null;
  mismatchL: number | null;
  mismatchFlag: boolean;
};
export type HeatingTrendsResult = {
  dateFrom: string;
  dateTo: string;
  plantName: string;
  targetLPerMT: number;
  hotOilEndTempMinC: number;
  hotOilDeltaMinC: number;
  mismatchThresholdL: number;
  rows: HeatingTrendsRow[];
  summary: {
    days: number;
    sessionCount: number;
    totalHours: number;
    totalLdoT1L: number;
    dgDieselL: number;
    totalProductionMT: number;
    lPerHour: number | null;
    lPerMT: number | null;
    hotOilEndAvgC: number | null;
    hotOilEndMinC: number | null;
    hotOilEndMaxC: number | null;
    hotOilFlaggedDays: number;
    hotOilSupplyAvgC: number | null;
    hotOilReturnAvgC: number | null;
    hotOilDeltaAvgC: number | null;
    hotOilDeltaMinObservedC: number | null;
    hotOilDeltaFlaggedDays: number;
    totalShiftMeterT1L: number;
    shiftMeterLPerMT: number | null;
    mismatchDays: number;
    daysWithShiftMeter: number;
  };
};

type PlantReportWithDetailsLocal = PlantReportWithDetails;

export type StockShortagePayload = {
  needsConfirmation: true;
  ownerPartyId: number;
  ownerPartyName: string;
  fallbackPartyId: number | null;
  fallbackPartyName: string | null;
  shortages: { materialId: number; materialName: string; required: number; available: number; shortfall: number; uom: string }[];
};

export class StockShortageError extends Error {
  readonly code = "STOCK_SHORTAGE_NEEDS_CONFIRMATION" as const;
  readonly payload: StockShortagePayload;
  constructor(payload: StockShortagePayload) {
    super("STOCK_SHORTAGE_NEEDS_CONFIRMATION");
    this.payload = payload;
    this.name = "StockShortageError";
  }
}

export class DatabaseStorage implements IStorage {
  async getDprs(filters?: { site?: string; engineer?: string; dateFrom?: string; dateTo?: string }): Promise<Dpr[]> {
    let conditions = [];
    
    conditions.push(eq(dprs.isSuperseded, false));
    if (filters?.site) conditions.push(eq(dprs.site, filters.site));
    if (filters?.engineer) conditions.push(eq(dprs.engineer, filters.engineer));
    if (filters?.dateFrom) conditions.push(gte(dprs.date, filters.dateFrom));
    if (filters?.dateTo) conditions.push(lte(dprs.date, filters.dateTo));

    return await db.select()
      .from(dprs)
      .where(and(...conditions))
      .orderBy(desc(dprs.date));
  }

  // Helper to extract base site name (strips " – Edited by..." or " – Copy by..." suffix)
  private getBaseSiteName(site: string): string {
    // More robust pattern: look for "Edited by" or "Copy by" anywhere in the string
    // and strip everything from there onwards (including any preceding dash/whitespace)
    // This handles all dash variants and spacing issues
    const editPattern = /\s*[-–—:]\s*(Edited by|Copy by)\s+.*/i;
    let result = site.replace(editPattern, '').trim();
    
    // Fallback: also check for just "Edited by" or "Copy by" without dash
    const directPattern = /\s+(Edited by|Copy by)\s+.*/i;
    result = result.replace(directPattern, '').trim();
    
    return result || site;
  }

  // Helper to get the effective timestamp for comparison
  // Uses ID as a reliable tiebreaker since auto-incrementing IDs guarantee newer records have higher IDs
  private getEffectiveTimestamp(dpr: { id: number; submittedAt: string | null; createdAt: Date | null }): number {
    // Primary: use ID as a reliable proxy for creation order (higher ID = newer)
    // This avoids timezone issues with timestamp comparison
    return dpr.id;
  }

  async getDprsWithDetails(): Promise<DprWithDetails[]> {
    return await db.query.dprs.findMany({
      where: eq(dprs.isSuperseded, false),
      with: {
        progress: true,
        equipment: true,
        labour: true,
        materials: true,
        sitePurchases: true,
      },
      orderBy: desc(dprs.date),
    });
  }

  async getDpr(id: number): Promise<DprWithDetails | undefined> {
    const dpr = await db.query.dprs.findFirst({
      where: eq(dprs.id, id),
      with: {
        progress: true,
        equipment: true,
        labour: true,
        materials: true,
        sitePurchases: true,
      }
    });
    return dpr;
  }

  async createDpr(dprData: CreateDprRequest, clientTimestamp?: string): Promise<Dpr> {
    // Transaction to insert DPR and all related nested data
    // Use client-provided timestamp for accurate local time, fall back to server time
    const submittedAt = clientTimestamp || format(new Date(), "yyyy-MM-dd HH:mm:ss");
    
    return await db.transaction(async (tx) => {
      // 1. Insert DPR Header with submission timestamp (uppercase text fields)
      const [newDpr] = await tx.insert(dprs).values({
        date: dprData.date,
        site: dprData.site.toUpperCase(),
        engineer: dprData.engineer.toUpperCase(),
        submittedAt: submittedAt,
      }).returning();

      const dprId = newDpr.id;

      // 2. Insert Progress Entries with uppercase text fields
      if (dprData.progress?.length) {
        const progressWithPersonnel = dprData.progress.map(p => {
          const { personnelIds, ...progressData } = p as any;
          return { progressData: { ...progressData, dprId, activity: progressData.activity?.toUpperCase() || progressData.activity, noSiteWorkDescription: progressData.noSiteWorkDescription?.toUpperCase() || progressData.noSiteWorkDescription }, personnelIds: personnelIds || [] };
        });
        const insertedProgress = await tx.insert(progressEntries).values(
          progressWithPersonnel.map(p => p.progressData)
        ).returning();
        for (let i = 0; i < insertedProgress.length; i++) {
          const pIds = progressWithPersonnel[i].personnelIds as number[];
          if (pIds.length > 0) {
            await tx.insert(activityPersonnel).values(
              pIds.map((personnelId: number) => ({ progressEntryId: insertedProgress[i].id, personnelId }))
            );
          }
        }
      }

      // 3. Insert Equipment Logs with uppercase text fields
      if (dprData.equipment?.length) {
        const insertedEquipLogs = await tx.insert(equipmentLogs).values(
          dprData.equipment.map(e => ({ 
            ...e, 
            dprId,
            machine: e.machine?.toUpperCase() || e.machine,
            operator: e.operator?.toUpperCase() || e.operator,
            task: e.task?.toUpperCase() || e.task,
          }))
        ).returning();

        await this.processDprEquipmentDieselLedger(tx, insertedEquipLogs, dprData.date, dprData.site);
      }

      // 4. Insert Labour Logs
      if (dprData.labour?.length) {
        await tx.insert(labourLogs).values(
          dprData.labour.map(l => ({ ...l, dprId }))
        );
      }

      // 5. Insert Material Logs with uppercase text fields
      if (dprData.materials?.length) {
        await tx.insert(materialLogs).values(
          dprData.materials.map(m => ({ 
            ...m, 
            dprId,
            vehicleNumber: m.vehicleNumber?.toUpperCase() || m.vehicleNumber,
            supplier: m.supplier?.toUpperCase() || m.supplier,
            location: m.location?.toUpperCase() || m.location,
          }))
        );
      }

      // 6. Insert Site Purchases with uppercase text fields
      if (dprData.sitePurchases?.length) {
        await tx.insert(sitePurchases).values(
          dprData.sitePurchases.map(sp => ({
            ...sp,
            dprId,
            itemDescription: sp.itemDescription?.toUpperCase() || sp.itemDescription,
            vendor: sp.vendor?.toUpperCase() || sp.vendor,
            billNo: sp.billNo?.toUpperCase() || sp.billNo,
          }))
        );
      }

      return newDpr;
    });
  }

  async updateDpr(id: number, dprData: CreateDprRequest): Promise<Dpr | undefined> {
    const existing = await this.getDpr(id);
    if (!existing) return undefined;

    return await db.transaction(async (tx) => {
      // Update DPR header
      const [updated] = await tx.update(dprs)
        .set({
          date: dprData.date,
          site: dprData.site,
          engineer: dprData.engineer,
        })
        .where(eq(dprs.id, id))
        .returning();

      // Clean up old DPR equipment diesel ledger entries before deleting equipment logs
      await this.cleanupDprEquipmentDieselLedger(tx, id);

      // Clean up old activity personnel before deleting progress entries
      const oldProgressIds = (await tx.select({ id: progressEntries.id }).from(progressEntries).where(eq(progressEntries.dprId, id))).map(p => p.id);
      if (oldProgressIds.length > 0) {
        await tx.delete(activityPersonnel).where(inArray(activityPersonnel.progressEntryId, oldProgressIds));
      }

      // Delete old entries and insert new ones
      await tx.delete(progressEntries).where(eq(progressEntries.dprId, id));
      await tx.delete(equipmentLogs).where(eq(equipmentLogs.dprId, id));
      await tx.delete(labourLogs).where(eq(labourLogs.dprId, id));
      await tx.delete(materialLogs).where(eq(materialLogs.dprId, id));
      await tx.delete(sitePurchases).where(eq(sitePurchases.dprId, id));

      if (dprData.progress?.length) {
        const progressWithPersonnel = dprData.progress.map(p => {
          const { personnelIds, ...progressData } = p as any;
          return { progressData: { ...progressData, dprId: id, activity: progressData.activity?.toUpperCase() || progressData.activity, noSiteWorkDescription: progressData.noSiteWorkDescription?.toUpperCase() || progressData.noSiteWorkDescription }, personnelIds: personnelIds || [] };
        });
        const insertedProgress = await tx.insert(progressEntries).values(
          progressWithPersonnel.map(p => p.progressData)
        ).returning();
        for (let i = 0; i < insertedProgress.length; i++) {
          const pIds = progressWithPersonnel[i].personnelIds as number[];
          if (pIds.length > 0) {
            await tx.insert(activityPersonnel).values(
              pIds.map((personnelId: number) => ({ progressEntryId: insertedProgress[i].id, personnelId }))
            );
          }
        }
      }

      if (dprData.equipment?.length) {
        const insertedEquipLogs = await tx.insert(equipmentLogs).values(
          dprData.equipment.map(e => ({ ...e, dprId: id }))
        ).returning();

        await this.processDprEquipmentDieselLedger(tx, insertedEquipLogs, dprData.date, dprData.site);
      }

      if (dprData.labour?.length) {
        await tx.insert(labourLogs).values(
          dprData.labour.map(l => ({ ...l, dprId: id }))
        );
      }

      if (dprData.materials?.length) {
        await tx.insert(materialLogs).values(
          dprData.materials.map(m => ({ ...m, dprId: id }))
        );
      }

      if (dprData.sitePurchases?.length) {
        await tx.insert(sitePurchases).values(
          dprData.sitePurchases.map(sp => ({
            ...sp,
            dprId: id,
            itemDescription: sp.itemDescription?.toUpperCase() || sp.itemDescription,
            vendor: sp.vendor?.toUpperCase() || sp.vendor,
            billNo: sp.billNo?.toUpperCase() || sp.billNo,
          }))
        );
      }

      return updated;
    });
  }

  async cloneDpr(id: number, editedBy: string, clientTimestamp?: string): Promise<Dpr | undefined> {
    const original = await this.getDpr(id);
    if (!original) return undefined;

    // Use client-provided timestamp for accurate local time, fall back to server time
    const dateTime = clientTimestamp || format(new Date(), "yyyy-MM-dd HH:mm:ss");
    const roleName = editedBy === "manager" ? "Manager" : editedBy === "admin" ? "Admin" : "Engineer";
    
    // Strip any existing suffix and get base site name, then add new suffix
    const baseSite = this.getBaseSiteName(original.site);
    const newSiteName = `${baseSite.toUpperCase()} – Copy by ${roleName} – ${dateTime}`;

    return await db.transaction(async (tx) => {
      // Create a copy of the DPR with timestamp and role tag
      // IMPORTANT: Set submittedAt to ensure proper timestamp comparison for version deduplication
      const [newDpr] = await tx.insert(dprs).values({
        date: original.date,
        site: newSiteName,
        engineer: original.engineer.toUpperCase(),
        role: editedBy,
        submittedAt: dateTime,
      }).returning();

      const dprId = newDpr.id;

      // Copy progress entries with uppercase and activity personnel
      if (original.progress?.length) {
        const oldProgressIds = original.progress.map(p => p.id);
        const oldPersonnel = oldProgressIds.length > 0
          ? await tx.select().from(activityPersonnel).where(inArray(activityPersonnel.progressEntryId, oldProgressIds))
          : [];
        const insertedProgress = await tx.insert(progressEntries).values(
          original.progress.map(p => ({
            dprId,
            activity: p.activity?.toUpperCase() || p.activity,
            chainageFrom: p.chainageFrom,
            chainageTo: p.chainageTo,
            side: p.side,
            length: p.length,
            width: p.width,
            thickness: p.thickness,
            quantity: p.quantity,
            uom: p.uom,
            noSiteWork: (p as any).noSiteWork || false,
            noSiteWorkDescription: (p as any).noSiteWorkDescription,
          }))
        ).returning();
        for (let i = 0; i < insertedProgress.length; i++) {
          const oldId = original.progress[i].id;
          const pIds = oldPersonnel.filter(ap => ap.progressEntryId === oldId).map(ap => ap.personnelId);
          if (pIds.length > 0) {
            await tx.insert(activityPersonnel).values(
              pIds.map(personnelId => ({ progressEntryId: insertedProgress[i].id, personnelId }))
            );
          }
        }
      }

      // Copy equipment logs with uppercase
      if (original.equipment?.length) {
        const insertedEquipLogs = await tx.insert(equipmentLogs).values(
          original.equipment.map(e => ({
            dprId,
            machine: e.machine?.toUpperCase() || e.machine,
            operator: e.operator?.toUpperCase() || e.operator,
            startTime: e.startTime,
            endTime: e.endTime,
            diesel: e.diesel,
            task: e.task?.toUpperCase() || e.task,
            equipmentId: e.equipmentId,
            dieselSource: e.dieselSource,
            fuelStation: e.fuelStation,
            billNumber: e.billNumber,
            amountPaid: e.amountPaid,
            vehicleNo: e.vehicleNo,
            openingReading: e.openingReading,
            closingReading: e.closingReading,
            hoursWorked: e.hoursWorked,
            dieselNorm: e.dieselNorm,
            expectedDiesel: e.expectedDiesel,
            entryType: (e as any).entryType ?? "time_meter",
            numberOfTrips: (e as any).numberOfTrips ?? null,
            tripDistance: (e as any).tripDistance ?? null,
            totalKm: (e as any).totalKm ?? null,
          }))
        ).returning();

        await this.processDprEquipmentDieselLedger(tx, insertedEquipLogs, original.date, original.site);
      }

      // Copy labour logs
      if (original.labour?.length) {
        await tx.insert(labourLogs).values(
          original.labour.map(l => ({
            dprId,
            category: l.category,
            gender: l.gender,
            count: l.count,
          }))
        );
      }

      // Copy material logs with uppercase
      if (original.materials?.length) {
        await tx.insert(materialLogs).values(
          original.materials.map(m => ({
            dprId,
            type: m.type,
            material: m.material,
            supplier: m.supplier?.toUpperCase() || m.supplier,
            quantity: m.quantity,
            uom: m.uom,
            vehicleNumber: m.vehicleNumber?.toUpperCase() || m.vehicleNumber,
            location: m.location?.toUpperCase() || m.location,
            receiptNumber: m.receiptNumber,
          }))
        );
      }

      // Copy site purchases with uppercase
      if (original.sitePurchases?.length) {
        await tx.insert(sitePurchases).values(
          original.sitePurchases.map(sp => ({
            dprId,
            itemDescription: sp.itemDescription?.toUpperCase() || sp.itemDescription,
            quantity: sp.quantity,
            uom: sp.uom,
            vendor: sp.vendor?.toUpperCase() || sp.vendor,
            billNo: sp.billNo?.toUpperCase() || sp.billNo,
            amount: sp.amount,
          }))
        );
      }

      // Record version history
      await tx.insert(dprVersions).values({
        originalDprId: id,
        dprId: newDpr.id,
        editedBy,
      });

      // Mark original DPR as superseded so it no longer appears in listings or reports
      await tx.update(dprs).set({ isSuperseded: true }).where(eq(dprs.id, id));

      return newDpr;
    });
  }

  async createVersionDpr(originalId: number, dprData: CreateDprRequest, editedBy: string, clientTimestamp?: string): Promise<Dpr> {
    // Use client-provided timestamp for accurate local time, fall back to server time
    const dateTime = clientTimestamp || format(new Date(), "yyyy-MM-dd HH:mm:ss");
    const roleName = editedBy === "manager" ? "Manager" : editedBy === "admin" ? "Admin" : "Engineer";
    
    // Strip any existing suffix and get base site name, then add new suffix
    const baseSite = this.getBaseSiteName(dprData.site);
    const newSiteName = `${baseSite.toUpperCase()} – Edited by ${roleName} – ${dateTime}`;

    return await db.transaction(async (tx) => {
      // Clean up original DPR's diesel ledger entries before creating new version
      await this.cleanupDprEquipmentDieselLedger(tx, originalId);

      // Create new DPR with edited data and timestamp
      // IMPORTANT: Set submittedAt to ensure proper timestamp comparison for version deduplication
      const [newDpr] = await tx.insert(dprs).values({
        date: dprData.date,
        site: newSiteName,
        engineer: dprData.engineer.toUpperCase(),
        role: editedBy,
        submittedAt: dateTime,
      }).returning();

      const dprId = newDpr.id;

      // Insert edited progress entries with uppercase text fields
      if (dprData.progress?.length) {
        await tx.insert(progressEntries).values(
          dprData.progress.map(p => ({ 
            ...p, 
            dprId,
            activity: p.activity?.toUpperCase() || p.activity,
          }))
        );
      }

      // Insert edited equipment logs with uppercase text fields
      if (dprData.equipment?.length) {
        const insertedEquipLogs = await tx.insert(equipmentLogs).values(
          dprData.equipment.map(e => ({ 
            ...e, 
            dprId,
            machine: e.machine?.toUpperCase() || e.machine,
            operator: e.operator?.toUpperCase() || e.operator,
            task: e.task?.toUpperCase() || e.task,
          }))
        ).returning();

        await this.processDprEquipmentDieselLedger(tx, insertedEquipLogs, dprData.date, dprData.site);
      }

      // Insert edited labour logs
      if (dprData.labour?.length) {
        await tx.insert(labourLogs).values(
          dprData.labour.map(l => ({ ...l, dprId }))
        );
      }

      // Insert edited material logs with uppercase text fields
      // Distinguish: explicit empty array [] = user intentionally cleared materials
      // undefined/not present = field wasn't sent, carry forward from original to prevent data loss
      if (Array.isArray(dprData.materials)) {
        if (dprData.materials.length > 0) {
          await tx.insert(materialLogs).values(
            dprData.materials.map(m => ({ 
              ...m, 
              dprId,
              vehicleNumber: m.vehicleNumber?.toUpperCase() || m.vehicleNumber,
              supplier: m.supplier?.toUpperCase() || m.supplier,
              location: m.location?.toUpperCase() || m.location,
            }))
          );
        }
        // else: explicit empty array = user intentionally cleared, don't carry forward
      } else {
        // Field not present at all - carry forward from original DPR to prevent accidental data loss
        const originalMaterials = await tx.select().from(materialLogs)
          .where(eq(materialLogs.dprId, originalId));
        if (originalMaterials.length > 0) {
          await tx.insert(materialLogs).values(
            originalMaterials.map(m => ({
              dprId,
              type: m.type,
              material: m.material,
              quantity: m.quantity,
              uom: m.uom,
              vehicleNumber: m.vehicleNumber,
              supplier: m.supplier,
              location: m.location,
              receiptNumber: m.receiptNumber,
            }))
          );
        }
      }

      // Insert edited site purchases with uppercase text fields
      // Distinguish: explicit empty array [] = user intentionally cleared purchases
      // undefined/not present = field wasn't sent, carry forward from original to prevent data loss
      if (Array.isArray(dprData.sitePurchases)) {
        if (dprData.sitePurchases.length > 0) {
          await tx.insert(sitePurchases).values(
            dprData.sitePurchases.map(sp => ({
              ...sp,
              dprId,
              itemDescription: sp.itemDescription?.toUpperCase() || sp.itemDescription,
              vendor: sp.vendor?.toUpperCase() || sp.vendor,
              billNo: sp.billNo?.toUpperCase() || sp.billNo,
            }))
          );
        }
        // else: explicit empty array = user intentionally cleared, don't carry forward
      } else {
        // Field not present at all - carry forward from original DPR to prevent accidental data loss
        const originalPurchases = await tx.select().from(sitePurchases)
          .where(eq(sitePurchases.dprId, originalId));
        if (originalPurchases.length > 0) {
          await tx.insert(sitePurchases).values(
            originalPurchases.map(sp => ({
              dprId,
              itemDescription: sp.itemDescription,
              quantity: sp.quantity,
              uom: sp.uom,
              vendor: sp.vendor,
              billNo: sp.billNo,
              amount: sp.amount,
            }))
          );
        }
      }

      // Record version history
      await tx.insert(dprVersions).values({
        originalDprId: originalId,
        dprId: newDpr.id,
        editedBy,
      });

      // Mark original DPR as superseded so it no longer appears in listings
      await tx.update(dprs).set({ isSuperseded: true }).where(eq(dprs.id, originalId));

      return newDpr;
    });
  }

  private async processDprEquipmentDieselLedger(
    tx: any,
    insertedEquipLogs: any[],
    dprDate: string,
    siteName: string
  ) {
    const DPR_DIESEL_CUTOFF_DATE = '2026-02-01';
    if (dprDate < DPR_DIESEL_CUTOFF_DATE) return;

    const dieselLogs = insertedEquipLogs.filter(
      e => e.diesel && e.diesel > 0 && (e.dieselSource === 'direct_purchase' || e.dieselSource === 'plant_stock')
    );
    if (dieselLogs.length === 0) return;

    const [dieselMaterial] = await tx.select().from(plantMaterials)
      .where(sql`LOWER(${plantMaterials.name}) = 'diesel'`)
      .limit(1);
    if (!dieselMaterial) return;

    const allPartiesForHlc = await tx.select().from(parties).orderBy(parties.id);
    let hlcParty = allPartiesForHlc.find((p: any) => p.name?.toUpperCase() === 'HLC');
    if (!hlcParty) hlcParty = allPartiesForHlc.find((p: any) => p.name?.toUpperCase().includes('HLC') || p.name?.toUpperCase().includes('HIGH LANE'));
    if (!hlcParty) hlcParty = allPartiesForHlc[0];
    const hlcPartyId = hlcParty?.id || null;

    for (const eLog of dieselLogs) {
      const dieselQty = eLog.diesel;
      const equipLogRefId = -eLog.id;

      if (eLog.dieselSource === 'direct_purchase') {
        const fuelStation = eLog.fuelStation || 'Fuel Station';
        const billNumber = eLog.billNumber || '';
        const amountPaid = eLog.amountPaid || 0;

        await tx.insert(stockLedger).values({
          date: dprDate,
          partyId: hlcPartyId,
          materialId: dieselMaterial.id,
          transactionType: "direct_purchase",
          referenceId: equipLogRefId,
          quantityIn: dieselQty,
          quantityOut: dieselQty,
          balanceAfter: null,
          uom: dieselMaterial.defaultUom || 'Liters',
          notes: `Direct purchase at ${fuelStation}${billNumber ? `, Bill: ${billNumber}` : ''}${amountPaid ? `, Rs. ${amountPaid}` : ''} - ${eLog.machine || 'Equipment'} at ${siteName}`,
        });
      } else if (eLog.dieselSource === 'plant_stock') {
        const [existingBalance] = await tx.select().from(stockBalances)
          .where(and(
            hlcPartyId ? eq(stockBalances.partyId, hlcPartyId) : sql`${stockBalances.partyId} IS NULL`,
            eq(stockBalances.materialId, dieselMaterial.id)
          ))
          .limit(1);

        const newBalance = (existingBalance?.balance || 0) - dieselQty;

        if (existingBalance) {
          await tx.update(stockBalances)
            .set({ balance: newBalance, lastUpdated: new Date() })
            .where(eq(stockBalances.id, existingBalance.id));
        } else {
          await tx.insert(stockBalances).values({
            partyId: hlcPartyId,
            materialId: dieselMaterial.id,
            balance: newBalance,
            uom: dieselMaterial.defaultUom || 'Liters',
          });
        }

        await tx.insert(stockLedger).values({
          date: dprDate,
          partyId: hlcPartyId,
          materialId: dieselMaterial.id,
          transactionType: "dpr_equipment_usage",
          referenceId: equipLogRefId,
          quantityOut: dieselQty,
          balanceAfter: newBalance,
          uom: dieselMaterial.defaultUom || 'Liters',
          notes: `DPR diesel issued to ${eLog.machine || 'Equipment'} at ${siteName}`,
        });
      }
    }
  }

  private async cleanupDprEquipmentDieselLedger(tx: any, dprId: number) {
    const existingLogs = await tx.select().from(equipmentLogs)
      .where(eq(equipmentLogs.dprId, dprId));

    const dieselLogs = existingLogs.filter(
      (e: any) => e.diesel && e.diesel > 0 && (e.dieselSource === 'direct_purchase' || e.dieselSource === 'plant_stock')
    );
    if (dieselLogs.length === 0) return;

    for (const eLog of dieselLogs) {
      const equipLogRefId = -eLog.id;

      if (eLog.dieselSource === 'plant_stock') {
        const [ledgerEntry] = await tx.select().from(stockLedger).where(
          and(
            eq(stockLedger.transactionType, 'dpr_equipment_usage'),
            eq(stockLedger.referenceId, equipLogRefId)
          )
        ).limit(1);

        if (ledgerEntry && ledgerEntry.quantityOut) {
          const [dieselMaterial] = await tx.select().from(plantMaterials)
            .where(sql`LOWER(${plantMaterials.name}) = 'diesel'`)
            .limit(1);
          const allPartiesCleanup = await tx.select().from(parties).orderBy(parties.id);
          let hlcPartyCleanup = allPartiesCleanup.find((p: any) => p.name?.toUpperCase() === 'HLC');
          if (!hlcPartyCleanup) hlcPartyCleanup = allPartiesCleanup.find((p: any) => p.name?.toUpperCase().includes('HLC') || p.name?.toUpperCase().includes('HIGH LANE'));
          if (!hlcPartyCleanup) hlcPartyCleanup = allPartiesCleanup[0];
          const hlcPartyId = hlcPartyCleanup?.id || null;

          if (dieselMaterial) {
            const [existingBalance] = await tx.select().from(stockBalances)
              .where(and(
                hlcPartyId ? eq(stockBalances.partyId, hlcPartyId) : sql`${stockBalances.partyId} IS NULL`,
                eq(stockBalances.materialId, dieselMaterial.id)
              ))
              .limit(1);

            if (existingBalance) {
              const restoredBalance = (existingBalance.balance || 0) + ledgerEntry.quantityOut;
              await tx.update(stockBalances)
                .set({ balance: restoredBalance, lastUpdated: new Date() })
                .where(eq(stockBalances.id, existingBalance.id));
            }
          }
        }

        await tx.delete(stockLedger).where(
          and(
            eq(stockLedger.transactionType, 'dpr_equipment_usage'),
            eq(stockLedger.referenceId, equipLogRefId)
          )
        );
      } else if (eLog.dieselSource === 'direct_purchase') {
        await tx.delete(stockLedger).where(
          and(
            eq(stockLedger.transactionType, 'direct_purchase'),
            eq(stockLedger.referenceId, equipLogRefId)
          )
        );
      }
    }
  }

  async deleteDpr(id: number): Promise<boolean> {
    return await db.transaction(async (tx) => {
      const allVersionIds = await this.collectVersionChainAncestors(tx, id);

      for (const dprId of allVersionIds) {
        await this.cleanupDprEquipmentDieselLedger(tx, dprId);
        await tx.delete(progressEntries).where(eq(progressEntries.dprId, dprId));
        await tx.delete(equipmentLogs).where(eq(equipmentLogs.dprId, dprId));
        await tx.delete(labourLogs).where(eq(labourLogs.dprId, dprId));
        await tx.delete(materialLogs).where(eq(materialLogs.dprId, dprId));
        await tx.delete(sitePurchases).where(eq(sitePurchases.dprId, dprId));
      }

      await tx.delete(dprVersions).where(
        or(
          inArray(dprVersions.dprId, allVersionIds),
          inArray(dprVersions.originalDprId, allVersionIds)
        )
      );

      await tx.delete(dprs).where(inArray(dprs.id, allVersionIds));
      return true;
    });
  }

  private async collectVersionChainAncestors(tx: any, targetId: number): Promise<number[]> {
    const allVersionLinks = await tx.select().from(dprVersions);
    const chainIds = new Set<number>([targetId]);

    const traceAncestors = (dprId: number) => {
      for (const v of allVersionLinks) {
        if (v.dprId === dprId && !chainIds.has(v.originalDprId)) {
          chainIds.add(v.originalDprId);
          traceAncestors(v.originalDprId);
        }
      }
    };

    traceAncestors(targetId);

    return Array.from(chainIds);
  }

  // Plant Report Methods
  async getPlantReports(): Promise<PlantReport[]> {
    return await db.select()
      .from(plantReports)
      .orderBy(desc(plantReports.date));
  }

  async getPlantReport(id: number): Promise<PlantReportWithDetailsLocal | undefined> {
    const report = await db.query.plantReports.findFirst({
      where: eq(plantReports.id, id),
      with: {
        production: true,
      }
    });
    return report as PlantReportWithDetailsLocal | undefined;
  }

  async createPlantReport(reportData: CreatePlantReportRequest): Promise<PlantReport> {
    return await db.transaction(async (tx) => {
      const [newReport] = await tx.insert(plantReports).values({
        date: reportData.date,
        siteName: reportData.siteName,
        role: reportData.role || "engineer",
      }).returning();

      const plantReportId = newReport.id;

      if (reportData.production?.length) {
        await tx.insert(plantProduction).values(
          reportData.production.map(p => ({ ...p, plantReportId }))
        );
      }

      return newReport;
    });
  }

  async clonePlantReport(id: number, editedBy: string): Promise<PlantReport | undefined> {
    const original = await this.getPlantReport(id);
    if (!original) return undefined;

    const now = new Date();
    const dateTime = now.toISOString().replace('T', ' ').substring(0, 19);
    const roleName = editedBy === "manager" ? "Manager" : editedBy === "admin" ? "Admin" : "Engineer";

    return await db.transaction(async (tx) => {
      const [newReport] = await tx.insert(plantReports).values({
        date: original.date,
        siteName: `${original.siteName} – Copy by ${roleName} – ${dateTime}`,
        role: editedBy,
      }).returning();

      const plantReportId = newReport.id;

      if (original.production?.length) {
        await tx.insert(plantProduction).values(
          original.production.map(p => ({
            plantReportId,
            material: p.material,
            quantity: p.quantity,
            uom: p.uom,
            supplier: p.supplier,
          }))
        );
      }

      await tx.insert(plantVersions).values({
        originalPlantId: id,
        plantId: newReport.id,
        editedBy,
      });

      return newReport;
    });
  }

  async updatePlantReport(id: number, reportData: CreatePlantReportRequest): Promise<PlantReport | undefined> {
    const existing = await this.getPlantReport(id);
    if (!existing) return undefined;

    return await db.transaction(async (tx) => {
      const [updated] = await tx.update(plantReports)
        .set({
          date: reportData.date,
          siteName: reportData.siteName,
          role: reportData.role || existing.role,
        })
        .where(eq(plantReports.id, id))
        .returning();

      await tx.delete(plantProduction).where(eq(plantProduction.plantReportId, id));

      if (reportData.production?.length) {
        await tx.insert(plantProduction).values(
          reportData.production.map(p => ({ ...p, plantReportId: id }))
        );
      }

      return updated;
    });
  }

  async deletePlantReport(id: number): Promise<boolean> {
    return await db.transaction(async (tx) => {
      await tx.delete(plantProduction).where(eq(plantProduction.plantReportId, id));
      await tx.delete(plantVersions).where(eq(plantVersions.plantId, id));
      await tx.delete(plantVersions).where(eq(plantVersions.originalPlantId, id));
      const result = await tx.delete(plantReports).where(eq(plantReports.id, id)).returning();
      return result.length > 0;
    });
  }

  async getSetting(key: string): Promise<string | null> {
    const setting = await db.select().from(appSettings).where(eq(appSettings.key, key)).limit(1);
    return setting.length > 0 ? setting[0].value : null;
  }

  async setSetting(key: string, value: string): Promise<void> {
    const existing = await db.select().from(appSettings).where(eq(appSettings.key, key)).limit(1);
    if (existing.length > 0) {
      await db.update(appSettings)
        .set({ value, updatedAt: new Date() })
        .where(eq(appSettings.key, key));
    } else {
      await db.insert(appSettings).values({ key, value });
    }
  }

  // Task #253 — per-plant tank calibration. Stored on a small table keyed by
  // plantName so different plants can have different tank geometries. Density
  // default (1.01 kg/L) is applied at compute time in the dipCmToMt helper.
  async getPlantSettings(plantName: string): Promise<PlantSettings | null> {
    const rows = await db.select().from(plantSettings).where(eq(plantSettings.plantName, plantName)).limit(1);
    return rows[0] ?? null;
  }

  async listPlantSettings(): Promise<PlantSettings[]> {
    return db.select().from(plantSettings).orderBy(plantSettings.plantName);
  }

  async upsertPlantSettings(input: InsertPlantSettings): Promise<PlantSettings> {
    const existing = await this.getPlantSettings(input.plantName);
    const patch = {
      bitumenTank1LitresPerCm: input.bitumenTank1LitresPerCm ?? null,
      bitumenTank2LitresPerCm: input.bitumenTank2LitresPerCm ?? null,
      bitumenDensityKgPerL: input.bitumenDensityKgPerL ?? null,
      updatedAt: new Date(),
    };
    if (existing) {
      const [updated] = await db.update(plantSettings)
        .set(patch)
        .where(eq(plantSettings.plantName, input.plantName))
        .returning();
      return updated;
    }
    const [inserted] = await db.insert(plantSettings).values({
      plantName: input.plantName,
      ...patch,
    }).returning();
    return inserted;
  }

  // ============================================
  // PLANT MODULE PHASE-1 - MASTERS IMPLEMENTATION
  // ============================================

  // Party/Job Master
  async getParties(): Promise<Party[]> {
    return db.select().from(parties).where(eq(parties.isActive, 1)).orderBy(asc(parties.name));
  }

  async createParty(party: InsertParty): Promise<Party> {
    const uppercased = { ...party, name: party.name.toUpperCase() };
    const [result] = await db.insert(parties).values(uppercased).returning();
    return result;
  }

  async updateParty(id: number, party: Partial<InsertParty>): Promise<Party | undefined> {
    const updates = { ...party };
    if (updates.name) updates.name = updates.name.toUpperCase();
    const [result] = await db.update(parties).set(updates).where(eq(parties.id, id)).returning();
    return result;
  }

  async deleteParty(id: number): Promise<boolean> {
    const [result] = await db.update(parties).set({ isActive: 0 }).where(eq(parties.id, id)).returning();
    return !!result;
  }

  // Plant Materials Master
  async getPlantMaterials(): Promise<PlantMaterial[]> {
    return db.select().from(plantMaterials).where(eq(plantMaterials.isActive, 1)).orderBy(asc(plantMaterials.name));
  }

  async createPlantMaterial(material: InsertPlantMaterial): Promise<PlantMaterial> {
    const uppercased = { ...material, name: material.name.toUpperCase().trim() };
    
    // Check for existing material with same name and category to prevent duplicates
    const [existing] = await db.select().from(plantMaterials)
      .where(sql`UPPER(TRIM(${plantMaterials.name})) = ${uppercased.name} AND ${plantMaterials.category} = ${uppercased.category}`)
      .limit(1);
    
    if (existing) {
      return existing; // Return existing material instead of creating duplicate
    }
    
    const [result] = await db.insert(plantMaterials).values(uppercased).returning();
    return result;
  }

  async updatePlantMaterial(id: number, material: Partial<InsertPlantMaterial>): Promise<PlantMaterial | undefined> {
    const updates = { ...material };
    if (updates.name) updates.name = updates.name.toUpperCase();
    const [result] = await db.update(plantMaterials).set(updates).where(eq(plantMaterials.id, id)).returning();
    return result;
  }

  async deletePlantMaterial(id: number): Promise<boolean> {
    const [result] = await db.update(plantMaterials).set({ isActive: 0 }).where(eq(plantMaterials.id, id)).returning();
    return !!result;
  }

  // Mix Types
  async getMixTypes(): Promise<MixType[]> {
    return db.select().from(mixTypes).where(eq(mixTypes.isActive, 1)).orderBy(asc(mixTypes.name));
  }

  async createMixType(mixType: InsertMixType): Promise<MixType> {
    const uppercased = { ...mixType, name: mixType.name.toUpperCase() };
    const [result] = await db.insert(mixTypes).values(uppercased).returning();
    return result;
  }

  async updateMixType(id: number, mixType: Partial<InsertMixType>): Promise<MixType | undefined> {
    const updates = { ...mixType };
    if (updates.name) updates.name = updates.name.toUpperCase();
    const [result] = await db.update(mixTypes).set(updates).where(eq(mixTypes.id, id)).returning();
    return result;
  }

  async deleteMixType(id: number): Promise<boolean> {
    const [result] = await db.update(mixTypes).set({ isActive: 0 }).where(eq(mixTypes.id, id)).returning();
    return !!result;
  }

  // Mix Templates
  async getMixTemplates(): Promise<MixTemplate[]> {
    return db.select().from(mixTemplates).where(eq(mixTemplates.isActive, 1)).orderBy(asc(mixTemplates.name));
  }

  async getAllMixTemplateComponents(): Promise<MixTemplateComponent[]> {
    return db.select().from(mixTemplateComponents);
  }

  async getMixTemplateWithComponents(id: number): Promise<{ template: MixTemplate; components: MixTemplateComponent[] } | undefined> {
    const [template] = await db.select().from(mixTemplates).where(eq(mixTemplates.id, id)).limit(1);
    if (!template) return undefined;
    const components = await db.select().from(mixTemplateComponents).where(eq(mixTemplateComponents.templateId, id));
    return { template, components };
  }

  async createMixTemplate(template: InsertMixTemplate, components?: InsertMixTemplateComponent[]): Promise<MixTemplate> {
    return db.transaction(async (tx) => {
      const uppercased = { ...template, name: template.name.toUpperCase() };
      const [result] = await tx.insert(mixTemplates).values(uppercased).returning();
      if (components?.length) {
        await tx.insert(mixTemplateComponents).values(
          components.map(c => ({ ...c, templateId: result.id }))
        );
      }
      return result;
    });
  }

  async updateMixTemplate(id: number, template: Partial<InsertMixTemplate>, components?: InsertMixTemplateComponent[]): Promise<MixTemplate | undefined> {
    return db.transaction(async (tx) => {
      const updates = { ...template };
      if (updates.name) updates.name = updates.name.toUpperCase();
      const [result] = await tx.update(mixTemplates).set(updates).where(eq(mixTemplates.id, id)).returning();
      if (components) {
        await tx.delete(mixTemplateComponents).where(eq(mixTemplateComponents.templateId, id));
        if (components.length) {
          await tx.insert(mixTemplateComponents).values(
            components.map(c => ({ ...c, templateId: id }))
          );
        }
      }
      return result;
    });
  }

  async deleteMixTemplate(id: number): Promise<boolean> {
    const [result] = await db.update(mixTemplates).set({ isActive: 0 }).where(eq(mixTemplates.id, id)).returning();
    return !!result;
  }

  // Equipment Master
  async getEquipmentMaster(includeInactive?: boolean): Promise<EquipmentMasterType[]> {
    if (includeInactive) {
      return db.select().from(equipmentMaster).orderBy(asc(equipmentMaster.name));
    }
    return db.select().from(equipmentMaster).where(eq(equipmentMaster.isActive, 1)).orderBy(asc(equipmentMaster.name));
  }

  async createEquipment(equipment: InsertEquipmentMaster): Promise<EquipmentMasterType> {
    const uppercased = { ...equipment, name: equipment.name.toUpperCase() };
    const [result] = await db.insert(equipmentMaster).values(uppercased).returning();
    return result;
  }

  async updateEquipment(id: number, equipment: Partial<InsertEquipmentMaster>): Promise<EquipmentMasterType | undefined> {
    const updates = { ...equipment };
    if (updates.name) updates.name = updates.name.toUpperCase();
    const [result] = await db.update(equipmentMaster).set(updates).where(eq(equipmentMaster.id, id)).returning();
    return result;
  }

  async deleteEquipment(id: number): Promise<boolean> {
    const [result] = await db.update(equipmentMaster).set({ isActive: 0 }).where(eq(equipmentMaster.id, id)).returning();
    return !!result;
  }

  async hasEquipmentUsageHistory(id: number): Promise<boolean> {
    const [usageRow] = await db.select({ id: equipmentUsage.id })
      .from(equipmentUsage)
      .where(eq(equipmentUsage.equipmentId, id))
      .limit(1);
    if (usageRow) return true;
    const [logRow] = await db.select({ id: equipmentLogs.id })
      .from(equipmentLogs)
      .where(eq(equipmentLogs.equipmentId, id))
      .limit(1);
    return !!logRow;
  }

  // ============================================
  // PLANT MODULE PHASE-1 - TRANSACTIONS IMPLEMENTATION
  // ============================================

  // Material Receipts
  async getMaterialReceipts(filters?: { partyId?: number; dateFrom?: string; dateTo?: string }): Promise<MaterialReceipt[]> {
    let conditions = [];
    if (filters?.partyId) conditions.push(eq(materialReceipts.partyId, filters.partyId));
    if (filters?.dateFrom) conditions.push(gte(materialReceipts.date, filters.dateFrom));
    if (filters?.dateTo) conditions.push(lte(materialReceipts.date, filters.dateTo));
    
    return db.select().from(materialReceipts)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(materialReceipts.date));
  }

  async createMaterialReceipt(receipt: InsertMaterialReceipt): Promise<MaterialReceipt> {
    return db.transaction(async (tx) => {
      const uppercased = {
        ...receipt,
        supplier: receipt.supplier?.toUpperCase(),
        transporter: receipt.transporter?.toUpperCase(),
        vehicleNumber: receipt.vehicleNumber?.toUpperCase(),
        challanNumber: receipt.challanNumber?.toUpperCase(),
      };
      const [result] = await tx.insert(materialReceipts).values(uppercased).returning();
      
      // Determine the target partyId for stock
      const targetPartyId = receipt.isPlantCommon ? null : (receipt.partyId ?? null);
      
      // Get material info for UOM conversion
      const [material] = await tx.select().from(plantMaterials).where(eq(plantMaterials.id, receipt.materialId)).limit(1);
      
      // Apply UOM conversion if receipt UOM differs from default/stock UOM
      // Stock is always tracked in the default UOM (usually Ton for aggregates)
      let stockQuantity = receipt.quantity;
      let stockUom = receipt.uom;
      
      if (material?.conversionFactor && material?.conversionFromUom && material?.conversionToUom) {
        // If receipt is in the "from" UOM, convert to "to" UOM
        if (receipt.uom.toUpperCase() === material.conversionFromUom.toUpperCase()) {
          stockQuantity = receipt.quantity * material.conversionFactor;
          stockUom = material.conversionToUom;
        }
      }
      
      // Get current balance
      const condition = targetPartyId === null 
        ? and(sql`${stockBalances.partyId} IS NULL`, eq(stockBalances.materialId, receipt.materialId))
        : and(eq(stockBalances.partyId, targetPartyId), eq(stockBalances.materialId, receipt.materialId));
      
      const [existing] = await tx.select().from(stockBalances).where(condition).limit(1);
      const newBalance = (existing?.balance || 0) + stockQuantity;
      
      // Update stock balance (using converted quantity)
      if (existing) {
        await tx.update(stockBalances)
          .set({ balance: newBalance, lastUpdated: new Date() })
          .where(eq(stockBalances.id, existing.id));
      } else {
        await tx.insert(stockBalances).values({
          partyId: targetPartyId,
          materialId: receipt.materialId,
          balance: stockQuantity,
          uom: stockUom,
        });
      }
      
      // Add ledger entry (store converted quantity for stock, note original in notes)
      const conversionNote = stockQuantity !== receipt.quantity 
        ? `From ${receipt.supplier || 'Supplier'} (${receipt.quantity} ${receipt.uom} converted to ${stockQuantity.toFixed(3)} ${stockUom})`
        : receipt.supplier ? `From ${receipt.supplier}` : undefined;
      
      await tx.insert(stockLedger).values({
        date: receipt.date,
        partyId: targetPartyId,
        materialId: receipt.materialId,
        transactionType: "receipt",
        referenceId: result.id,
        quantityIn: stockQuantity, // Use converted quantity for ledger
        balanceAfter: newBalance,
        uom: stockUom,
        notes: conversionNote,
      });

      // Task #490 — If this is an LDO receipt, insert a linked ldo_flow_readings
      // receipt row so the flow-meter tracker balance reflects the delivery.
      if (material && material.name.toUpperCase().trim() === "LDO") {
        const qtyL = convertLdoQtyToLiters(receipt.quantity, receipt.uom);
        await tx.insert(ldoFlowReadings).values({
          date: receipt.date,
          time: receipt.time || null,
          tankNumber: receipt.tankNumber ?? 1,
          meterReading: 0,
          readingType: "receipt",
          quantityLiters: qtyL,
          notes: `AUTO FROM MATERIAL RECEIPT #${result.id}`,
          plantName: receipt.plantName ?? "Main Plant",
          sourceMaterialReceiptId: result.id,
        });
      }
      
      return result;
    });
  }

  async updateMaterialReceipt(id: number, receipt: Partial<InsertMaterialReceipt>): Promise<MaterialReceipt | undefined> {
    return db.transaction(async (tx) => {
      // Get existing receipt first
      const [existing] = await tx.select().from(materialReceipts).where(eq(materialReceipts.id, id)).limit(1);
      if (!existing) return undefined;
      
      // Uppercase text fields
      const updates = { ...receipt };
      if (updates.supplier) updates.supplier = updates.supplier.toUpperCase();
      if (updates.transporter) updates.transporter = updates.transporter.toUpperCase();
      if (updates.vehicleNumber) updates.vehicleNumber = updates.vehicleNumber.toUpperCase();
      if (updates.challanNumber) updates.challanNumber = updates.challanNumber.toUpperCase();
      
      // Calculate old stock quantity (what was originally added)
      const [oldMaterial] = await tx.select().from(plantMaterials).where(eq(plantMaterials.id, existing.materialId)).limit(1);
      let oldStockQuantity = existing.quantity;
      let oldStockUom = existing.uom;
      if (oldMaterial?.conversionFactor && oldMaterial?.conversionFromUom && oldMaterial?.conversionToUom) {
        if (existing.uom.toUpperCase() === oldMaterial.conversionFromUom.toUpperCase()) {
          oldStockQuantity = existing.quantity * oldMaterial.conversionFactor;
          oldStockUom = oldMaterial.conversionToUom;
        }
      }
      
      // Calculate new stock quantity
      const newMaterialId = receipt.materialId ?? existing.materialId;
      const newQuantity = receipt.quantity ?? existing.quantity;
      const newUom = receipt.uom ?? existing.uom;
      const newIsPlantCommon = receipt.isPlantCommon ?? existing.isPlantCommon;
      const newPartyId = receipt.partyId ?? existing.partyId;
      
      const [newMaterial] = await tx.select().from(plantMaterials).where(eq(plantMaterials.id, newMaterialId)).limit(1);
      let newStockQuantity = newQuantity;
      let newStockUom = newUom;
      if (newMaterial?.conversionFactor && newMaterial?.conversionFromUom && newMaterial?.conversionToUom) {
        if (newUom.toUpperCase() === newMaterial.conversionFromUom.toUpperCase()) {
          newStockQuantity = newQuantity * newMaterial.conversionFactor;
          newStockUom = newMaterial.conversionToUom;
        }
      }
      
      // Reverse old stock balance
      const oldTargetPartyId = existing.isPlantCommon ? null : (existing.partyId ?? null);
      const oldCondition = oldTargetPartyId === null 
        ? and(sql`${stockBalances.partyId} IS NULL`, eq(stockBalances.materialId, existing.materialId))
        : and(eq(stockBalances.partyId, oldTargetPartyId), eq(stockBalances.materialId, existing.materialId));
      
      const [oldBalance] = await tx.select().from(stockBalances).where(oldCondition).limit(1);
      if (oldBalance) {
        await tx.update(stockBalances)
          .set({ balance: oldBalance.balance - oldStockQuantity, lastUpdated: new Date() })
          .where(eq(stockBalances.id, oldBalance.id));
      }
      
      // Apply new stock balance
      const newTargetPartyId = newIsPlantCommon ? null : (newPartyId ?? null);
      const newCondition = newTargetPartyId === null 
        ? and(sql`${stockBalances.partyId} IS NULL`, eq(stockBalances.materialId, newMaterialId))
        : and(eq(stockBalances.partyId, newTargetPartyId), eq(stockBalances.materialId, newMaterialId));
      
      const [newBalance] = await tx.select().from(stockBalances).where(newCondition).limit(1);
      const finalBalance = (newBalance?.balance || 0) + newStockQuantity;
      
      if (newBalance) {
        await tx.update(stockBalances)
          .set({ balance: finalBalance, lastUpdated: new Date() })
          .where(eq(stockBalances.id, newBalance.id));
      } else {
        await tx.insert(stockBalances).values({
          partyId: newTargetPartyId,
          materialId: newMaterialId,
          balance: newStockQuantity,
          uom: newStockUom,
        });
      }
      
      // Update or recreate ledger entry
      await tx.delete(stockLedger).where(and(
        eq(stockLedger.transactionType, "receipt"),
        eq(stockLedger.referenceId, id)
      ));
      
      const conversionNote = newStockQuantity !== newQuantity 
        ? `From ${updates.supplier || existing.supplier || 'Supplier'} (${newQuantity} ${newUom} converted to ${newStockQuantity.toFixed(3)} ${newStockUom})`
        : updates.supplier || existing.supplier ? `From ${updates.supplier || existing.supplier}` : undefined;
      
      await tx.insert(stockLedger).values({
        date: receipt.date ?? existing.date,
        partyId: newTargetPartyId,
        materialId: newMaterialId,
        transactionType: "receipt",
        referenceId: id,
        quantityIn: newStockQuantity,
        balanceAfter: finalBalance,
        uom: newStockUom,
        notes: conversionNote,
      });

      // Task #490 — Sync the linked ldo_flow_readings receipt row.
      // Drop any existing linked row then re-insert if the (new) material is LDO.
      await tx.delete(ldoFlowReadings).where(eq(ldoFlowReadings.sourceMaterialReceiptId, id));

      const [newMaterialForLdo] = await tx.select().from(plantMaterials)
        .where(eq(plantMaterials.id, newMaterialId)).limit(1);
      if (newMaterialForLdo && newMaterialForLdo.name.toUpperCase().trim() === "LDO") {
        const newDate = receipt.date ?? existing.date;
        const newTime = receipt.time !== undefined ? receipt.time : existing.time;
        const newTankNumber = receipt.tankNumber !== undefined ? (receipt.tankNumber ?? 1) : (existing.tankNumber ?? 1);
        const newPlantName = receipt.plantName ?? existing.plantName ?? "Main Plant";
        const qtyL = convertLdoQtyToLiters(newQuantity, newUom);
        await tx.insert(ldoFlowReadings).values({
          date: newDate,
          time: newTime || null,
          tankNumber: newTankNumber,
          meterReading: 0,
          readingType: "receipt",
          quantityLiters: qtyL,
          notes: `AUTO FROM MATERIAL RECEIPT #${id}`,
          plantName: newPlantName,
          sourceMaterialReceiptId: id,
        });
      }
      
      // Update the receipt record
      const [result] = await tx.update(materialReceipts).set(updates).where(eq(materialReceipts.id, id)).returning();
      return result;
    });
  }

  async deleteMaterialReceipt(id: number): Promise<boolean> {
    return db.transaction(async (tx) => {
      // Get the receipt to reverse the stock balance
      const [receipt] = await tx.select().from(materialReceipts).where(eq(materialReceipts.id, id)).limit(1);
      if (!receipt) return false;
      
      // Get material for conversion factor
      const [material] = await tx.select().from(plantMaterials).where(eq(plantMaterials.id, receipt.materialId)).limit(1);
      
      // Calculate the converted quantity that was added
      let stockQuantity = receipt.quantity;
      if (material?.conversionFactor && material?.conversionFromUom && material?.conversionToUom) {
        if (receipt.uom.toUpperCase() === material.conversionFromUom.toUpperCase()) {
          stockQuantity = receipt.quantity * material.conversionFactor;
        }
      }
      
      // Reverse the stock balance
      const targetPartyId = receipt.isPlantCommon ? null : (receipt.partyId ?? null);
      const condition = targetPartyId === null 
        ? and(sql`${stockBalances.partyId} IS NULL`, eq(stockBalances.materialId, receipt.materialId))
        : and(eq(stockBalances.partyId, targetPartyId), eq(stockBalances.materialId, receipt.materialId));
      
      const [existing] = await tx.select().from(stockBalances).where(condition).limit(1);
      if (existing) {
        await tx.update(stockBalances)
          .set({ balance: existing.balance - stockQuantity, lastUpdated: new Date() })
          .where(eq(stockBalances.id, existing.id));
      }
      
      // Delete related ledger entry
      await tx.delete(stockLedger).where(and(
        eq(stockLedger.transactionType, "receipt"),
        eq(stockLedger.referenceId, id)
      ));

      // Task #490 — Remove linked ldo_flow_readings receipt row if present.
      await tx.delete(ldoFlowReadings).where(eq(ldoFlowReadings.sourceMaterialReceiptId, id));
      
      // Delete the receipt
      await tx.delete(materialReceipts).where(eq(materialReceipts.id, id));
      return true;
    });
  }

  // Truck Dispatches
  async getTruckDispatches(filters?: { partyId?: number; dateFrom?: string; dateTo?: string }): Promise<TruckDispatch[]> {
    let conditions = [];
    if (filters?.partyId) conditions.push(eq(truckDispatches.partyId, filters.partyId));
    if (filters?.dateFrom) conditions.push(gte(truckDispatches.date, filters.dateFrom));
    if (filters?.dateTo) conditions.push(lte(truckDispatches.date, filters.dateTo));
    
    return db.select().from(truckDispatches)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(truckDispatches.date));
  }

  async createTruckDispatch(dispatch: InsertTruckDispatch): Promise<TruckDispatch> {
    // Get mix template to calculate theoretical consumption
    const [template] = await db.select().from(mixTemplates).where(eq(mixTemplates.id, dispatch.mixTemplateId)).limit(1);
    
    const theoreticalBitumenPercent = template?.bitumenPercent || 0;
    const theoreticalBitumenQty = (dispatch.loadWeight * theoreticalBitumenPercent) / 100;
    const ldoNorm = (template as any)?.ldoNorm || DEFAULT_LDO_NORM;
    const theoreticalLdoQty = dispatch.loadWeight * ldoNorm;
    
    const uppercased = {
      ...dispatch,
      truckNumber: dispatch.truckNumber.toUpperCase(),
      deliveryLocation: dispatch.deliveryLocation?.toUpperCase(),
      theoreticalBitumenPercent,
      theoreticalBitumenQty,
      theoreticalLdoQty,
      // Set actual = theoretical by default
      actualBitumenPercent: dispatch.actualBitumenPercent ?? theoreticalBitumenPercent,
      actualBitumenQty: dispatch.actualBitumenQty ?? theoreticalBitumenQty,
      actualLdoQty: dispatch.actualLdoQty ?? theoreticalLdoQty,
    };
    
    const [result] = await db.insert(truckDispatches).values(uppercased).returning();
    return result;
  }

  async updateTruckDispatch(id: number, dispatch: Partial<InsertTruckDispatch>, adjustedBy?: string): Promise<TruckDispatch | undefined> {
    return db.transaction(async (tx) => {
      // Get current dispatch to always recompute theoretical values from latest template data
      const [currentDispatch] = await tx.select().from(truckDispatches).where(eq(truckDispatches.id, id)).limit(1);
      if (!currentDispatch) return undefined;

      const uppercased: any = {
        ...dispatch,
        truckNumber: dispatch.truckNumber?.toUpperCase(),
        deliveryLocation: dispatch.deliveryLocation?.toUpperCase(),
      };

      // Always recompute theoretical values from the mix template (use new values if provided, otherwise current)
      const mixTemplateId = dispatch.mixTemplateId ?? currentDispatch.mixTemplateId;
      const loadWeight = dispatch.loadWeight ?? currentDispatch.loadWeight;
      
      let theoreticalBitumenQty = currentDispatch.theoreticalBitumenQty || 0;
      let theoreticalLdoQty = currentDispatch.theoreticalLdoQty || 0;

      if (mixTemplateId && loadWeight) {
        const [template] = await tx.select().from(mixTemplates).where(eq(mixTemplates.id, mixTemplateId)).limit(1);
        if (template) {
          const bitumenPercent = template.bitumenPercent || 0;
          const ldoNorm = template.ldoNorm || 6;
          // Always set these computed values on every update
          uppercased.theoreticalBitumenPercent = bitumenPercent;
          uppercased.theoreticalBitumenQty = (loadWeight * bitumenPercent) / 100;
          uppercased.theoreticalLdoQty = loadWeight * ldoNorm;
          theoreticalBitumenQty = uppercased.theoreticalBitumenQty;
          theoreticalLdoQty = uppercased.theoreticalLdoQty;
        }
      }
      
      const theoreticalBitumenPercent = uppercased.theoreticalBitumenPercent ?? currentDispatch.theoreticalBitumenPercent ?? 0;

      let newActualBitumenPercent: number;
      let newActualBitumenQty: number;
      if (dispatch.actualBitumenPercent !== undefined && dispatch.actualBitumenPercent !== null) {
        newActualBitumenPercent = dispatch.actualBitumenPercent;
        newActualBitumenQty = (loadWeight * dispatch.actualBitumenPercent) / 100;
        uppercased.actualBitumenQty = newActualBitumenQty;
      } else if (currentDispatch.actualBitumenPercent !== null && currentDispatch.actualBitumenPercent !== undefined) {
        newActualBitumenPercent = currentDispatch.actualBitumenPercent;
        newActualBitumenQty = currentDispatch.actualBitumenQty ?? theoreticalBitumenQty;
      } else {
        newActualBitumenPercent = theoreticalBitumenPercent;
        newActualBitumenQty = theoreticalBitumenQty;
      }

      const newActualLdoQty = dispatch.actualLdoQty ?? currentDispatch.actualLdoQty ?? theoreticalLdoQty;

      const bitumenVariancePercent = theoreticalBitumenPercent > 0
        ? ((newActualBitumenPercent - theoreticalBitumenPercent) / theoreticalBitumenPercent) * 100
        : 0;
      const ldoVariancePercent = theoreticalLdoQty > 0
        ? ((newActualLdoQty - theoreticalLdoQty) / theoreticalLdoQty) * 100
        : 0;

      uppercased.bitumenVariancePercent = Math.abs(bitumenVariancePercent) > 0.01 ? bitumenVariancePercent : null;
      uppercased.ldoVariancePercent = Math.abs(ldoVariancePercent) > 0.01 ? ldoVariancePercent : null;

      const bitumenChanged = dispatch.actualBitumenPercent !== undefined &&
                            dispatch.actualBitumenPercent !== currentDispatch.actualBitumenPercent;
      const ldoChanged = dispatch.actualLdoQty !== undefined &&
                        dispatch.actualLdoQty !== currentDispatch.actualLdoQty;

      if (bitumenChanged || ldoChanged) {
        uppercased.adjustedBy = adjustedBy || "operator";
        uppercased.adjustedAt = new Date();
      }

      const [result] = await tx.update(truckDispatches)
        .set(uppercased)
        .where(eq(truckDispatches.id, id))
        .returning();

      if (bitumenChanged && Math.abs(bitumenVariancePercent) > 0.01) {
        await tx.insert(consumptionAuditLog).values({
          dispatchId: id,
          adjustmentType: "bitumen",
          previousValue: currentDispatch.actualBitumenPercent || currentDispatch.theoreticalBitumenPercent,
          newValue: newActualBitumenPercent,
          theoreticalValue: theoreticalBitumenPercent,
          variancePercent: bitumenVariancePercent,
          adjustedBy: adjustedBy || "operator",
        });
      }

      if (ldoChanged && Math.abs(ldoVariancePercent) > 0.01) {
        await tx.insert(consumptionAuditLog).values({
          dispatchId: id,
          adjustmentType: "ldo",
          previousValue: currentDispatch.actualLdoQty || currentDispatch.theoreticalLdoQty,
          newValue: newActualLdoQty,
          theoreticalValue: theoreticalLdoQty,
          variancePercent: ldoVariancePercent,
          adjustedBy: adjustedBy || "operator",
        });
      }
      
      return result;
    });
  }

  async deleteTruckDispatch(id: number): Promise<boolean> {
    return db.transaction(async (tx) => {
      // Get the dispatch to reverse the stock ledger entries
      const [dispatch] = await tx.select().from(truckDispatches).where(eq(truckDispatches.id, id)).limit(1);
      if (!dispatch) return false;
      
      // Delete related ledger entries (consumption entries for this dispatch)
      await tx.delete(stockLedger).where(and(
        eq(stockLedger.transactionType, "dispatch"),
        eq(stockLedger.referenceId, id)
      ));
      
      // Delete the dispatch
      await tx.delete(truckDispatches).where(eq(truckDispatches.id, id));
      return true;
    });
  }

  // Equipment Usage
  async getEquipmentUsage(filters?: { equipmentId?: number; dateFrom?: string; dateTo?: string }): Promise<EquipmentUsage[]> {
    let conditions = [];
    if (filters?.equipmentId) conditions.push(eq(equipmentUsage.equipmentId, filters.equipmentId));
    if (filters?.dateFrom) conditions.push(gte(equipmentUsage.date, filters.dateFrom));
    if (filters?.dateTo) conditions.push(lte(equipmentUsage.date, filters.dateTo));
    
    return db.select().from(equipmentUsage)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(equipmentUsage.date));
  }

  async createEquipmentUsage(usage: InsertEquipmentUsage): Promise<EquipmentUsage> {
    return this._createEquipmentUsageTxn(usage);
  }

  private async _createEquipmentUsageTxn(usage: InsertEquipmentUsage): Promise<EquipmentUsage> {
    return db.transaction(async (tx) => {
      // Get equipment to calculate expected diesel
      const [equipment] = await tx.select().from(equipmentMaster).where(eq(equipmentMaster.id, usage.equipmentId)).limit(1);
      
      const isShifting = (usage.entryType || "").toLowerCase() === "shifting";
      
      let hoursOrKmRun = 0;
      let expectedDiesel = 0;
      let openingDiesel = usage.openingDiesel ?? 0;
      let dieselIssued = usage.dieselIssued || 0;
      let closingDiesel = 0;
      let variance = 0;
      let numberOfTrips = usage.numberOfTrips || 0;
      let tripDistance = usage.tripDistance || 0;
      let tripBasedEntry = usage.tripBasedEntry === true;
      let totalKm = 0;
      
      if (isShifting) {
        hoursOrKmRun = 0;
        expectedDiesel = 0;
        openingDiesel = 0;
        dieselIssued = 0;
        closingDiesel = 0;
        variance = 0;
        numberOfTrips = 0;
        tripDistance = 0;
        tripBasedEntry = false;
        totalKm = 0;
      } else {
        // Calculate hours/km from meter readings or time entry (meter takes priority)
        const isHourMeterEquip = equipment?.meterType === "hour_meter";
        const AVERAGE_SPEED_KMPH = 25;
        
        if (usage.openingReading !== null && usage.openingReading !== undefined && 
            usage.closingReading !== null && usage.closingReading !== undefined) {
          hoursOrKmRun = usage.closingReading - usage.openingReading;
        } else if (usage.startTime && usage.endTime) {
          const [startHour, startMin] = usage.startTime.split(':').map(Number);
          const [endHour, endMin] = usage.endTime.split(':').map(Number);
          const startMins = startHour * 60 + startMin;
          const endMins = endHour * 60 + endMin;
          const diff = endMins - startMins;
          const hoursFromTime = diff > 0 ? diff / 60 : 0;
          
          if (isHourMeterEquip) {
            hoursOrKmRun = hoursFromTime;
          } else {
            hoursOrKmRun = hoursFromTime * AVERAGE_SPEED_KMPH;
          }
        }
        
        totalKm = numberOfTrips * tripDistance * 2;
        
        const norm = equipment?.consumptionNorm || 0;
        const isHourMeter = equipment?.meterType === "hour_meter";
        
        if (tripBasedEntry) {
          if (totalKm > 0) {
            const normPerKm = isHourMeter ? norm / AVERAGE_SPEED_KMPH : norm;
            expectedDiesel = totalKm * normPerKm;
          }
        } else if (hoursOrKmRun > 0) {
          expectedDiesel = hoursOrKmRun * norm;
        }
        
        closingDiesel = openingDiesel + dieselIssued - expectedDiesel;
        variance = dieselIssued - expectedDiesel;

        // If the operator entered a Diesel Balance in Tank dip, that is the
        // source of truth for the closing-tank value (overrides the
        // norm-derived estimate above).
        if (usage.dieselBalanceInTank != null) {
          closingDiesel = usage.dieselBalanceInTank;
        }
      }
      
      const [result] = await tx.insert(equipmentUsage).values({
        ...usage,
        hoursOrKmRun,
        numberOfTrips: numberOfTrips || null,
        tripDistance: tripDistance || null,
        totalKm: totalKm || null,
        expectedDiesel,
        openingDiesel,
        closingDiesel,
        variance,
      }).returning();
      
      // DIESEL STOCK MANAGEMENT: Based on dieselSource
      // - plant_stock: Deduct from HLC stock (existing behavior)
      // - direct_purchase: Record as procurement (no stock deduction, creates In ledger entry)
      // - contractor: No stock impact (dieselIncluded=true legacy compatibility)
      const dieselIncluded = usage.dieselIncluded === true;
      const dieselSource = usage.dieselSource || 'plant_stock';
      
      if (dieselIssued > 0 && !dieselIncluded && dieselSource !== 'contractor') {
        // Find diesel material (case-insensitive search)
        const [dieselMaterial] = await tx.select().from(plantMaterials)
          .where(sql`LOWER(${plantMaterials.name}) = 'diesel'`)
          .limit(1);
        
        // Find HLC party for diesel stock
        const [hlcParty] = await tx.select().from(parties)
          .where(sql`UPPER(TRIM(${parties.name})) = 'HLC'`)
          .limit(1);
        const hlcPartyId = hlcParty?.id || null;
        
        if (dieselMaterial) {
          if (dieselSource === 'plant_stock') {
            // Deduct from HLC stock
            const [existingBalance] = await tx.select().from(stockBalances)
              .where(and(
                hlcPartyId ? eq(stockBalances.partyId, hlcPartyId) : sql`${stockBalances.partyId} IS NULL`,
                eq(stockBalances.materialId, dieselMaterial.id)
              ))
              .limit(1);
            
            const newBalance = (existingBalance?.balance || 0) - dieselIssued;
            
            if (existingBalance) {
              await tx.update(stockBalances)
                .set({ balance: newBalance, lastUpdated: new Date() })
                .where(eq(stockBalances.id, existingBalance.id));
            } else {
              await tx.insert(stockBalances).values({
                partyId: hlcPartyId,
                materialId: dieselMaterial.id,
                balance: newBalance,
                uom: dieselMaterial.defaultUom || 'Liters',
              });
            }
            
            // Create ledger entry for equipment diesel issue (stock deduction)
            await tx.insert(stockLedger).values({
              date: usage.date,
              partyId: hlcPartyId,
              materialId: dieselMaterial.id,
              transactionType: "equipment_usage",
              referenceId: result.id,
              quantityOut: dieselIssued,
              balanceAfter: newBalance,
              uom: dieselMaterial.defaultUom || 'Liters',
              notes: `Diesel issued to ${equipment?.name || 'Equipment'}`,
            });
          } else if (dieselSource === 'direct_purchase') {
            // Direct purchase: Create ledger entry as procurement (quantityIn) for tracking
            // but DO NOT add to stock balance (fuel goes directly into equipment tank)
            const siteName = usage.siteName || 'Site';
            const fuelStation = usage.fuelStation || 'Fuel Station';
            const billNumber = usage.billNumber || '';
            const amountPaid = usage.amountPaid || 0;
            
            await tx.insert(stockLedger).values({
              date: usage.date,
              partyId: hlcPartyId,
              materialId: dieselMaterial.id,
              transactionType: "direct_purchase",
              referenceId: result.id,
              quantityIn: dieselIssued, // Record as procurement for reporting
              quantityOut: dieselIssued, // Also consumed immediately
              balanceAfter: null, // No balance change (bypasses plant stock)
              uom: dieselMaterial.defaultUom || 'Liters',
              notes: `Direct purchase at ${fuelStation}${billNumber ? `, Bill: ${billNumber}` : ''}${amountPaid ? `, Rs. ${amountPaid}` : ''} - ${equipment?.name || 'Equipment'} at ${siteName}`,
            });
          }
        }
      }
      
      return result;
    });
  }

  async updateEquipmentUsage(id: number, usage: Partial<InsertEquipmentUsage>): Promise<EquipmentUsage | undefined> {
    return this._updateEquipmentUsageTxn(id, usage);
  }

  private async _updateEquipmentUsageTxn(id: number, usage: Partial<InsertEquipmentUsage>): Promise<EquipmentUsage | undefined> {
    return db.transaction(async (tx) => {
      const [existing] = await tx.select().from(equipmentUsage).where(eq(equipmentUsage.id, id)).limit(1);
      if (!existing) return undefined;

      const equipmentId = usage.equipmentId ?? existing.equipmentId;
      const [equipment] = await tx.select().from(equipmentMaster).where(eq(equipmentMaster.id, equipmentId)).limit(1);
      
      const entryType = usage.entryType ?? existing.entryType ?? "time_meter";
      const isShifting = entryType.toLowerCase() === "shifting";
      
      const oldDieselIssued = existing.dieselIssued || 0;
      
      let hoursOrKmRun = 0;
      let expectedDiesel = 0;
      let openingDiesel = 0;
      let newDieselIssued = 0;
      let closingDiesel = 0;
      let variance = 0;
      let numberOfTrips = 0;
      let tripDistance2 = 0;
      let tripBasedEntry = false;
      let totalKm = 0;
      
      if (isShifting) {
        // No calculations needed for shifting/mobilization entries
      } else {
        const openingReading = usage.openingReading ?? existing.openingReading;
        const closingReading = usage.closingReading ?? existing.closingReading;
        const startTime = usage.startTime ?? (existing as any).startTime;
        const endTime = usage.endTime ?? (existing as any).endTime;
        newDieselIssued = usage.dieselIssued ?? existing.dieselIssued ?? 0;
        openingDiesel = usage.openingDiesel ?? existing.openingDiesel ?? 0;
        
        numberOfTrips = usage.numberOfTrips ?? (existing as any).numberOfTrips ?? 0;
        tripDistance2 = usage.tripDistance ?? (existing as any).tripDistance ?? 0;
        tripBasedEntry = usage.tripBasedEntry !== undefined 
          ? usage.tripBasedEntry === true 
          : (existing as any).tripBasedEntry === true;
        totalKm = numberOfTrips * tripDistance2 * 2;
        
        const AVERAGE_SPEED_KMPH = 25;
        const isHourMeterEquip = equipment?.meterType === "hour_meter";
        
        if (openingReading !== null && openingReading !== undefined && 
            closingReading !== null && closingReading !== undefined) {
          hoursOrKmRun = closingReading - openingReading;
        } else if (startTime && endTime) {
          const [startHour, startMin] = startTime.split(':').map(Number);
          const [endHour, endMin] = endTime.split(':').map(Number);
          const startMins = startHour * 60 + startMin;
          const endMins = endHour * 60 + endMin;
          const diff = endMins - startMins;
          const hoursFromTime = diff > 0 ? diff / 60 : 0;
          
          if (isHourMeterEquip) {
            hoursOrKmRun = hoursFromTime;
          } else {
            hoursOrKmRun = hoursFromTime * AVERAGE_SPEED_KMPH;
          }
        }
        
        const norm = equipment?.consumptionNorm || 0;
        const isHourMeter = equipment?.meterType === "hour_meter";
        
        if (tripBasedEntry) {
          if (totalKm > 0) {
            const normPerKm = isHourMeter ? norm / AVERAGE_SPEED_KMPH : norm;
            expectedDiesel = totalKm * normPerKm;
          }
        } else if (hoursOrKmRun > 0) {
          expectedDiesel = hoursOrKmRun * norm;
        }
        
        closingDiesel = openingDiesel + newDieselIssued - expectedDiesel;
        variance = newDieselIssued - expectedDiesel;

        // Operator's Diesel Balance in Tank dip overrides the norm-derived
        // closing value. Prefer the new value, falling back to the existing
        // stored dip when not changed in this update.
        const effectiveDip = usage.dieselBalanceInTank !== undefined
          ? usage.dieselBalanceInTank
          : existing.dieselBalanceInTank;
        if (effectiveDip != null) {
          closingDiesel = effectiveDip;
        }
      }
      
      const [result] = await tx.update(equipmentUsage)
        .set({
          ...usage,
          hoursOrKmRun,
          numberOfTrips: numberOfTrips || null,
          tripDistance: tripDistance2 || null,
          totalKm: totalKm || null,
          expectedDiesel,
          openingDiesel,
          closingDiesel,
          variance,
          remarks: usage.remarks?.toUpperCase(),
        })
        .where(eq(equipmentUsage.id, id))
        .returning();
      
      // AUTO STOCK ADJUSTMENT: Handle diesel stock and ledger updates
      // Track diesel source changes alongside dieselIncluded
      const oldDieselIncluded = (existing as any).dieselIncluded === true;
      const newDieselIncluded = usage.dieselIncluded !== undefined ? usage.dieselIncluded === true : oldDieselIncluded;
      const oldDieselSource = (existing as any).dieselSource || 'plant_stock';
      const newDieselSource = usage.dieselSource !== undefined ? usage.dieselSource : oldDieselSource;
      
      // Stock is only affected when dieselSource is plant_stock (not contractor or direct_purchase)
      const oldAffectsStock = !oldDieselIncluded && oldDieselSource === 'plant_stock';
      const newAffectsStock = !newDieselIncluded && newDieselSource === 'plant_stock';
      
      // Need to update ledger if dieselIssued changes OR if date/equipment changes
      const dieselDiff = newDieselIssued - oldDieselIssued;
      const dateChanged = usage.date !== undefined && usage.date !== existing.date;
      const equipmentChanged = usage.equipmentId !== undefined && usage.equipmentId !== existing.equipmentId;
      const dieselSourceChanged = newDieselSource !== oldDieselSource;
      const dieselIncludedChanged = usage.dieselIncluded !== undefined && usage.dieselIncluded !== oldDieselIncluded;
      
      // Find diesel material and HLC party for all operations
      const [dieselMaterial] = await tx.select().from(plantMaterials)
        .where(sql`LOWER(${plantMaterials.name}) = 'diesel'`)
        .limit(1);
      const [hlcParty] = await tx.select().from(parties)
        .where(sql`UPPER(TRIM(${parties.name})) = 'HLC'`)
        .limit(1);
      const hlcPartyId = hlcParty?.id || null;
      
      // Delete existing ledger entries (both equipment_usage and direct_purchase types)
      await tx.delete(stockLedger).where(
        and(
          sql`${stockLedger.transactionType} IN ('equipment_usage', 'direct_purchase')`, 
          eq(stockLedger.referenceId, id)
        )
      );
      
      if (dieselMaterial) {
        // Handle stock balance restoration/deduction based on source changes
        // If old source affected stock but new doesn't, restore the old amount
        if (oldAffectsStock && !newAffectsStock && oldDieselIssued > 0) {
          const [existingBalance] = await tx.select().from(stockBalances)
            .where(and(
              hlcPartyId ? eq(stockBalances.partyId, hlcPartyId) : sql`${stockBalances.partyId} IS NULL`,
              eq(stockBalances.materialId, dieselMaterial.id)
            ))
            .limit(1);
          
          const newBalance = (existingBalance?.balance || 0) + oldDieselIssued;
          if (existingBalance) {
            await tx.update(stockBalances)
              .set({ balance: newBalance, lastUpdated: new Date() })
              .where(eq(stockBalances.id, existingBalance.id));
          }
        }
        
        // If new source affects stock but old didn't, deduct the new amount
        if (!oldAffectsStock && newAffectsStock && newDieselIssued > 0) {
          const [existingBalance] = await tx.select().from(stockBalances)
            .where(and(
              hlcPartyId ? eq(stockBalances.partyId, hlcPartyId) : sql`${stockBalances.partyId} IS NULL`,
              eq(stockBalances.materialId, dieselMaterial.id)
            ))
            .limit(1);
          
          const newBalance = (existingBalance?.balance || 0) - newDieselIssued;
          if (existingBalance) {
            await tx.update(stockBalances)
              .set({ balance: newBalance, lastUpdated: new Date() })
              .where(eq(stockBalances.id, existingBalance.id));
          } else {
            await tx.insert(stockBalances).values({
              partyId: hlcPartyId,
              materialId: dieselMaterial.id,
              balance: newBalance,
              uom: dieselMaterial.defaultUom || 'Liters',
            });
          }
        }
        
        // If both old and new affect stock, handle the difference
        if (oldAffectsStock && newAffectsStock && dieselDiff !== 0) {
          const [existingBalance] = await tx.select().from(stockBalances)
            .where(and(
              hlcPartyId ? eq(stockBalances.partyId, hlcPartyId) : sql`${stockBalances.partyId} IS NULL`,
              eq(stockBalances.materialId, dieselMaterial.id)
            ))
            .limit(1);
          
          const newBalance = (existingBalance?.balance || 0) - dieselDiff;
          if (existingBalance) {
            await tx.update(stockBalances)
              .set({ balance: newBalance, lastUpdated: new Date() })
              .where(eq(stockBalances.id, existingBalance.id));
          } else {
            await tx.insert(stockBalances).values({
              partyId: hlcPartyId,
              materialId: dieselMaterial.id,
              balance: newBalance,
              uom: dieselMaterial.defaultUom || 'Liters',
            });
          }
        }
        
        // Create new ledger entry based on current source
        if (newDieselIssued > 0 && !newDieselIncluded && newDieselSource !== 'contractor') {
          const usageDate = usage.date ?? existing.date;
          const [currentBalance] = await tx.select().from(stockBalances)
            .where(and(
              hlcPartyId ? eq(stockBalances.partyId, hlcPartyId) : sql`${stockBalances.partyId} IS NULL`,
              eq(stockBalances.materialId, dieselMaterial.id)
            ))
            .limit(1);
          
          if (newDieselSource === 'plant_stock') {
            await tx.insert(stockLedger).values({
              date: usageDate,
              partyId: hlcPartyId,
              materialId: dieselMaterial.id,
              transactionType: "equipment_usage",
              referenceId: result.id,
              quantityOut: newDieselIssued,
              balanceAfter: currentBalance?.balance || 0,
              uom: dieselMaterial.defaultUom || 'Liters',
              notes: `Diesel issued to ${equipment?.name || 'Equipment'}`,
            });
          } else if (newDieselSource === 'direct_purchase') {
            const siteName = usage.siteName ?? ((existing as any).siteName || 'Site');
            const fuelStation = usage.fuelStation ?? ((existing as any).fuelStation || 'Fuel Station');
            const billNumber = usage.billNumber ?? ((existing as any).billNumber || '');
            const amountPaid = usage.amountPaid ?? ((existing as any).amountPaid || 0);
            
            await tx.insert(stockLedger).values({
              date: usageDate,
              partyId: hlcPartyId,
              materialId: dieselMaterial.id,
              transactionType: "direct_purchase",
              referenceId: result.id,
              quantityIn: newDieselIssued,
              quantityOut: newDieselIssued,
              balanceAfter: null,
              uom: dieselMaterial.defaultUom || 'Liters',
              notes: `Direct purchase at ${fuelStation}${billNumber ? `, Bill: ${billNumber}` : ''}${amountPaid ? `, Rs. ${amountPaid}` : ''} - ${equipment?.name || 'Equipment'} at ${siteName}`,
            });
          }
        }
      }
      
      return result;
    });
  }

  async deleteEquipmentUsage(id: number): Promise<boolean> {
    return db.transaction(async (tx) => {
      // Get the existing record
      const [existing] = await tx.select().from(equipmentUsage).where(eq(equipmentUsage.id, id)).limit(1);
      if (!existing) return false;
      
      const dieselIssued = existing.dieselIssued || 0;
      const dieselIncluded = (existing as any).dieselIncluded === true;
      const dieselSource = (existing as any).dieselSource || 'plant_stock';
      
      // Always delete any existing ledger entries (both equipment_usage and direct_purchase)
      await tx.delete(stockLedger).where(
        and(
          sql`${stockLedger.transactionType} IN ('equipment_usage', 'direct_purchase')`, 
          eq(stockLedger.referenceId, id)
        )
      );
      
      // AUTO STOCK RESTORATION: Only restore if diesel was from plant_stock (not direct_purchase or contractor)
      const affectsStock = !dieselIncluded && dieselSource === 'plant_stock';
      if (dieselIssued > 0 && affectsStock) {
        // Find diesel material
        const [dieselMaterial] = await tx.select().from(plantMaterials)
          .where(sql`LOWER(${plantMaterials.name}) = 'diesel'`)
          .limit(1);
        
        // Find HLC party for diesel stock
        const [hlcParty] = await tx.select().from(parties)
          .where(sql`UPPER(TRIM(${parties.name})) = 'HLC'`)
          .limit(1);
        const hlcPartyId = hlcParty?.id || null;
        
        if (dieselMaterial) {
          // Restore to HLC stock
          const [existingBalance] = await tx.select().from(stockBalances)
            .where(and(
              hlcPartyId ? eq(stockBalances.partyId, hlcPartyId) : sql`${stockBalances.partyId} IS NULL`,
              eq(stockBalances.materialId, dieselMaterial.id)
            ))
            .limit(1);
          
          const newBalance = (existingBalance?.balance || 0) + dieselIssued;
          
          if (existingBalance) {
            await tx.update(stockBalances)
              .set({ balance: newBalance, lastUpdated: new Date() })
              .where(eq(stockBalances.id, existingBalance.id));
          } else {
            // Create balance if it doesn't exist (edge case - shouldn't normally happen)
            await tx.insert(stockBalances).values({
              partyId: hlcPartyId,
              materialId: dieselMaterial.id,
              balance: newBalance,
              uom: dieselMaterial.defaultUom || 'Liters',
            });
          }
        }
      }
      
      // Delete the usage record
      await tx.delete(equipmentUsage).where(eq(equipmentUsage.id, id));
      return true;
    });
  }

  // Generator Logs
  async getGeneratorLogs(filters?: { dateFrom?: string; dateTo?: string }): Promise<GeneratorLog[]> {
    let conditions = [];
    if (filters?.dateFrom) conditions.push(gte(generatorLogs.date, filters.dateFrom));
    if (filters?.dateTo) conditions.push(lte(generatorLogs.date, filters.dateTo));
    
    return db.select().from(generatorLogs)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(generatorLogs.date));
  }

  async createGeneratorLog(log: InsertGeneratorLog): Promise<GeneratorLog> {
    const hoursRun = log.hoursRun || 0;
    const openingDiesel = log.openingDiesel || 0;
    const dieselIssued = log.dieselIssued || 0;
    const closingDiesel = log.closingDiesel;
    
    // Calculate diesel consumed:
    // Preferred: (Opening + Issued) - Closing
    // Fallback (if closing not entered): Hours × norm (assume 5 L/hr default)
    const DIESEL_NORM_PER_HOUR = 5; // Liters per hour default
    let dieselConsumed: number;
    
    if (closingDiesel !== null && closingDiesel !== undefined) {
      // Primary method: tank measurement
      dieselConsumed = openingDiesel + dieselIssued - closingDiesel;
    } else {
      // Fallback: hours × norm
      dieselConsumed = hoursRun * DIESEL_NORM_PER_HOUR;
    }
    
    // Validation: diesel consumed cannot be negative
    if (dieselConsumed < 0) {
      dieselConsumed = 0;
    }
    
    // Validation: diesel consumed cannot exceed (opening + issued)
    const maxPossible = openingDiesel + dieselIssued;
    if (dieselConsumed > maxPossible && maxPossible > 0) {
      dieselConsumed = maxPossible;
    }
    
    const efficiency = hoursRun > 0 ? dieselConsumed / hoursRun : 0;
    
    const [result] = await db.insert(generatorLogs).values({
      ...log,
      generatorName: log.generatorName.toUpperCase(),
      dieselConsumed,
      efficiency,
    }).returning();
    
    return result;
  }

  // LDO Logs
  async getLdoLogs(filters?: { partyId?: number; dateFrom?: string; dateTo?: string }): Promise<LdoLog[]> {
    let conditions = [];
    if (filters?.partyId) conditions.push(eq(ldoLogs.partyId, filters.partyId));
    if (filters?.dateFrom) conditions.push(gte(ldoLogs.date, filters.dateFrom));
    if (filters?.dateTo) conditions.push(lte(ldoLogs.date, filters.dateTo));
    
    return db.select().from(ldoLogs)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(ldoLogs.date));
  }

  async createLdoLog(log: InsertLdoLog): Promise<LdoLog> {
    // Check for an existing entry on the same date before inserting
    const [existing] = await db.select({ id: ldoLogs.id })
      .from(ldoLogs)
      .where(eq(ldoLogs.date, String(log.date)))
      .limit(1);
    if (existing) {
      const err = Object.assign(
        new Error(`An LDO log entry for ${log.date} already exists.`),
        { code: "DUPLICATE_LDO_DATE" as const }
      );
      throw err;
    }

    // Calculate expected LDO based on tons produced
    const tonsProduced = log.tonsProduced || 0;
    const expectedLdo = tonsProduced * DEFAULT_LDO_NORM;
    const ldoConsumed = log.ldoConsumed || 0;
    const variance = expectedLdo - ldoConsumed;
    const efficiency = tonsProduced > 0 ? ldoConsumed / tonsProduced : 0;
    
    const [result] = await db.insert(ldoLogs).values({
      ...log,
      expectedLdo,
      variance,
      efficiency,
    }).returning();
    
    return result;
  }

  async updateLdoLog(id: number, updates: Partial<InsertLdoLog>): Promise<LdoLog | undefined> {
    // Recompute derived fields from updated values
    const tonsProduced = updates.tonsProduced !== undefined ? (updates.tonsProduced || 0) : undefined;
    const ldoConsumed = updates.ldoConsumed !== undefined ? (updates.ldoConsumed || 0) : undefined;

    let derivedFields: Partial<typeof ldoLogs.$inferInsert> = {};
    if (tonsProduced !== undefined || ldoConsumed !== undefined) {
      // Fetch current row to fill any missing value
      const [current] = await db.select().from(ldoLogs).where(eq(ldoLogs.id, id)).limit(1);
      if (!current) return undefined;
      const resolvedTons = tonsProduced !== undefined ? tonsProduced : (current.tonsProduced || 0);
      const resolvedConsumed = ldoConsumed !== undefined ? ldoConsumed : (current.ldoConsumed || 0);
      const expectedLdo = resolvedTons * DEFAULT_LDO_NORM;
      derivedFields = {
        expectedLdo,
        variance: expectedLdo - resolvedConsumed,
        efficiency: resolvedTons > 0 ? resolvedConsumed / resolvedTons : 0,
      };
    }

    const [result] = await db.update(ldoLogs)
      .set({ ...updates, ...derivedFields })
      .where(eq(ldoLogs.id, id))
      .returning();
    return result;
  }

  async getLdoDailySummary(date: string, plantName?: string): Promise<{
    openingStockL: number | null;
    ldoReceivedL: number;
    ldoConsumedL: number;
    closingStockL: number | null;
    tonsProducedMT: number;
    hasFlowReadings: boolean;
  }> {
    // Fetch all flow readings (no date cap) so computeTankStock works correctly
    const conds: any[] = [];
    if (plantName) conds.push(eq(ldoFlowReadings.plantName, plantName));
    const allReadings = await db.select().from(ldoFlowReadings)
      .where(conds.length ? and(...conds) : undefined);

    // Helper: effective stock tank (mirrors ldoStock.ts)
    const effectiveTank = (r: LdoFlowReading) => {
      if (r.tankNumber === 2 && r.dryerFedFrom === "TANK_1") return 1;
      return r.tankNumber;
    };

    // Port of computeTankStock — applied to a given slice of readings
    const computeTank = (readings: LdoFlowReading[], tankNum: number): number | null => {
      const physicalTank = readings.filter(r => r.tankNumber === tankNum);
      const stockEntries = physicalTank
        .filter(r => r.readingType === "stock")
        .sort((a, b) => {
          const dc = b.date.localeCompare(a.date);
          return dc !== 0 ? dc : (b.time || "").localeCompare(a.time || "");
        });
      if (stockEntries.length === 0) return null;

      const latest = stockEntries[0];
      const baseL = latest.quantityLiters || 0;
      const baseDT = `${latest.date}T${latest.time || "00:00"}`;

      const receiptsSince = physicalTank
        .filter(r => r.readingType === "receipt" && `${r.date}T${r.time || "00:00"}` > baseDT)
        .reduce((s, r) => s + (r.quantityLiters || 0), 0);

      type Pair = { openings: LdoFlowReading[]; closings: LdoFlowReading[] };
      const pairs = new Map<string, Pair>();
      for (const r of readings) {
        if (effectiveTank(r) !== tankNum) continue;
        if (r.readingType !== "opening" && r.readingType !== "closing") continue;
        if (r.date < latest.date) continue;
        if (r.date === latest.date && `${r.date}T${r.time || "00:00"}` <= baseDT) continue;
        const key = r.sourceShiftLogId != null
          ? `S${r.sourceShiftLogId}::${r.tankNumber}`
          : r.sourceHeatingSessionId != null
            ? `H${r.sourceHeatingSessionId}::${r.tankNumber}`
            : `D${r.date}::${r.tankNumber}`;
        let p = pairs.get(key);
        if (!p) { p = { openings: [], closings: [] }; pairs.set(key, p); }
        if (r.readingType === "opening") p.openings.push(r);
        else p.closings.push(r);
      }

      let consumed = 0;
      pairs.forEach(p => {
        if (!p.openings.length || !p.closings.length) return;
        const openVal = [...p.openings].sort((a, b) => (a.time || "").localeCompare(b.time || ""))[0].meterReading;
        const closeVal = [...p.closings].sort((a, b) => (b.time || "").localeCompare(a.time || ""))[0].meterReading;
        const diff = closeVal - openVal;
        if (diff > 0) consumed += diff;
      });

      return baseL + receiptsSince - consumed;
    };

    // Opening stock = tank balance at END of the day before `date`
    const beforeDate = allReadings.filter(r => r.date < date);
    const t1Open = computeTank(beforeDate, 1);
    const t2Open = computeTank(beforeDate, 2);
    const openingStockL = (t1Open === null && t2Open === null)
      ? null
      : (t1Open || 0) + (t2Open || 0);

    // Readings for the target date only
    const dayReadings = allReadings.filter(r => r.date === date);

    // LDO received = sum of receipt rows for the date (both tanks)
    const ldoReceivedL = dayReadings
      .filter(r => r.readingType === "receipt")
      .reduce((s, r) => s + (r.quantityLiters || 0), 0);

    // Whether the target date has any flow readings (determines if LDO fields
    // are truly meter-derived vs. just opening stock from a prior baseline)
    const hasFlowReadings = dayReadings.length > 0;

    // LDO consumed = meter-pair diffs for the date, grouped by PHYSICAL
    // tankNumber so that a shift with both boiler (tank-1) and dryer (tank-2,
    // dryerFedFrom=TANK_1) meter pairs don't collapse into one group.
    const computeDayConsumption = (readings: LdoFlowReading[]): number => {
      type Pair = { openings: LdoFlowReading[]; closings: LdoFlowReading[] };
      const pairs = new Map<string, Pair>();
      for (const r of readings) {
        if (r.readingType !== "opening" && r.readingType !== "closing") continue;
        // Key uses physical tankNumber (r.tankNumber) — not effectiveTank — so
        // cross-tank pairs from the same source keep separate buckets.
        const key = r.sourceShiftLogId != null
          ? `S${r.sourceShiftLogId}::${r.tankNumber}`
          : r.sourceHeatingSessionId != null
            ? `H${r.sourceHeatingSessionId}::${r.tankNumber}`
            : `D${r.date}::${r.tankNumber}`;
        let p = pairs.get(key);
        if (!p) { p = { openings: [], closings: [] }; pairs.set(key, p); }
        if (r.readingType === "opening") p.openings.push(r);
        else p.closings.push(r);
      }
      let consumed = 0;
      pairs.forEach(p => {
        if (!p.openings.length || !p.closings.length) return;
        const openVal = [...p.openings].sort((a, b) => (a.time || "").localeCompare(b.time || ""))[0].meterReading;
        const closeVal = [...p.closings].sort((a, b) => (b.time || "").localeCompare(a.time || ""))[0].meterReading;
        const diff = closeVal - openVal;
        if (diff > 0) consumed += diff;
      });
      return consumed;
    };
    const ldoConsumedL = computeDayConsumption(dayReadings);

    const closingStockL = openingStockL !== null
      ? openingStockL + ldoReceivedL - ldoConsumedL
      : null;

    // Tons produced = sum of loadWeight from dispatches for the date
    const dispConds: any[] = [eq(truckDispatches.date, date)];
    if (plantName) dispConds.push(eq(truckDispatches.plantName, plantName));
    const dispatches = await db.select({ loadWeight: truckDispatches.loadWeight })
      .from(truckDispatches)
      .where(and(...dispConds));
    const tonsProducedMT = dispatches.reduce((s, d) => s + (d.loadWeight || 0), 0);

    return { openingStockL, ldoReceivedL, ldoConsumedL, closingStockL, tonsProducedMT, hasFlowReadings };
  }

  // Stock Balances
  async getStockBalances(partyId?: number): Promise<StockBalance[]> {
    if (partyId !== undefined) {
      return db.select().from(stockBalances).where(
        partyId === null 
          ? sql`${stockBalances.partyId} IS NULL`
          : eq(stockBalances.partyId, partyId)
      );
    }
    return db.select().from(stockBalances);
  }

  async updateStockBalance(partyId: number | null, materialId: number, quantity: number, uom: string): Promise<StockBalance> {
    // Find existing balance
    const condition = partyId === null 
      ? and(sql`${stockBalances.partyId} IS NULL`, eq(stockBalances.materialId, materialId))
      : and(eq(stockBalances.partyId, partyId), eq(stockBalances.materialId, materialId));
    
    const [existing] = await db.select().from(stockBalances).where(condition).limit(1);
    
    // Round to eliminate floating-point accumulation errors (e.g. 1.14e-13 → 0)
    const roundBalance = (val: number) => {
      const rounded = Math.round(val * 1e9) / 1e9;
      return Math.abs(rounded) < 1e-9 ? 0 : rounded;
    };

    if (existing) {
      const [result] = await db.update(stockBalances)
        .set({ 
          balance: roundBalance(existing.balance + quantity),
          lastUpdated: new Date()
        })
        .where(eq(stockBalances.id, existing.id))
        .returning();
      return result;
    } else {
      const [result] = await db.insert(stockBalances).values({
        partyId,
        materialId,
        balance: roundBalance(quantity),
        uom,
      }).returning();
      return result;
    }
  }

  // Stock Ledger
  async getStockLedger(filters?: { partyId?: number; materialId?: number; dateFrom?: string; dateTo?: string }): Promise<StockLedgerEntry[]> {
    let conditions = [];
    if (filters?.partyId !== undefined) {
      conditions.push(filters.partyId === null 
        ? sql`${stockLedger.partyId} IS NULL`
        : eq(stockLedger.partyId, filters.partyId));
    }
    if (filters?.materialId) conditions.push(eq(stockLedger.materialId, filters.materialId));
    if (filters?.dateFrom) conditions.push(gte(stockLedger.date, filters.dateFrom));
    if (filters?.dateTo) conditions.push(lte(stockLedger.date, filters.dateTo));
    
    return db.select().from(stockLedger)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(stockLedger.date));
  }

  async getStockBalanceAsOf(date: string, filters?: { partyId?: number; materialId?: number }): Promise<{ materialId: number; partyId: number | null; uom: string; totalIn: number; totalOut: number }[]> {
    const conditions = [
      lt(stockLedger.date, date),
      ne(stockLedger.transactionType, 'equipment_issue'),
    ];
    if (filters?.partyId !== undefined) {
      conditions.push(
        filters.partyId === null
          ? sql`${stockLedger.partyId} IS NULL`
          : eq(stockLedger.partyId, filters.partyId)
      );
    }
    if (filters?.materialId) conditions.push(eq(stockLedger.materialId, filters.materialId));

    return db.select({
      materialId: stockLedger.materialId,
      partyId: stockLedger.partyId,
      uom: stockLedger.uom,
      totalIn: sql<number>`COALESCE(SUM(${stockLedger.quantityIn}), 0)`,
      totalOut: sql<number>`COALESCE(SUM(${stockLedger.quantityOut}), 0)`,
    })
    .from(stockLedger)
    .where(and(...conditions))
    .groupBy(stockLedger.materialId, stockLedger.partyId, stockLedger.uom);
  }

  async addStockLedgerEntry(entry: InsertStockLedger): Promise<StockLedgerEntry> {
    const [result] = await db.insert(stockLedger).values(entry).returning();
    return result;
  }

  async getPartyStatement(partyId: number, materialId: number, dateFrom?: string, dateTo?: string): Promise<{
    summary: { totalReceived: number; dispatchedOwn: number; borrowedFromHlc: number; replenishedToHlc: number; outstanding: number; uom: string };
    entries: (StockLedgerEntry & { displayType: string; borrowedQty: number; runningBalance: number; templateQty?: number; ownQty?: number })[];
  }> {
    // Fetch ledger entries for this party+material in the date range
    const conditions = [
      eq(stockLedger.partyId, partyId),
      eq(stockLedger.materialId, materialId),
      ne(stockLedger.transactionType, 'equipment_issue' as string),
    ];
    if (dateFrom) conditions.push(gte(stockLedger.date, dateFrom));
    if (dateTo) conditions.push(lte(stockLedger.date, dateTo));

    const entries = await db.select().from(stockLedger)
      .where(and(...conditions))
      .orderBy(asc(stockLedger.date), asc(stockLedger.id));

    // Fetch dispatch records for entries that have a referenceId.
    // Also fetches theoreticalAggregates so we can derive the full template quantity
    // for each dispatch (needed for the corrected own-vs-borrowed split).
    const refIds = [...new Set(
      entries.filter(e => e.referenceId != null).map(e => e.referenceId!)
    )];
    const dispatches = refIds.length
      ? await db.select({
          id: truckDispatches.id,
          deliveryLocation: truckDispatches.deliveryLocation,
          theoreticalAggregates: truckDispatches.theoreticalAggregates,
        })
          .from(truckDispatches).where(inArray(truckDispatches.id, refIds))
      : [];
    const dispatchMeta = new Map(dispatches.map(d => [d.id, {
      deliveryLocation: d.deliveryLocation,
      theoreticalAggregates: d.theoreticalAggregates,
    }]));

    // Resolve material UOM
    const [mat] = await db.select({ defaultUom: plantMaterials.defaultUom, conversionToUom: plantMaterials.conversionToUom })
      .from(plantMaterials).where(eq(plantMaterials.id, materialId)).limit(1);
    const uom = mat?.conversionToUom || mat?.defaultUom || 'Ton';

    // ── Pre-process: identify rebuild delta rows and build signed-delta maps ──────
    // Delta rows are written by insertLegacyDeltaEntry with notes containing
    // "[rebuild delta]" (dispatch type, positive) or "[rebuild delta reversal]"
    // (adjustment type, negative).  We absorb them into their parent dispatch
    // row and hide them from the output entirely.
    //
    // Two matching paths:
    //   Part A (linked): original dispatch entry already has referenceId = dispatch.id
    //     → deltaMap[referenceId] holds the signed delta; looked up directly.
    //   Part B (unlinked): original dispatch entry has referenceId = null while the
    //     delta row has referenceId = dispatch.id → matched by date+materialId+partyId
    //     using a sequential queue (delta rows and original rows share same date/material).
    const isRebuildRevisionNote = (n: string) =>
      n.includes('[rebuild delta]') || n.includes('[rebuild delta reversal]');

    // Step 1 — collect referenceIds on non-delta dispatch entries (Part A originals)
    const linkedRefIds = new Set<number>();
    for (const e of entries) {
      if (!isRebuildRevisionNote(e.notes ?? '') && e.referenceId != null && e.transactionType === 'dispatch') {
        linkedRefIds.add(e.referenceId);
      }
    }

    // Step 1b — collect date+materialId+partyId keys for unlinked original dispatch entries.
    // Used in Step 2 to detect when a Part-B delta has NO matching original entry — meaning
    // the material was brand-new for that dispatch (added to the template after the dispatch
    // was created). In that case the delta row carries the full quantity and must NOT be
    // silently skipped; the main loop will process it as a standalone dispatch entry.
    const originalEntryDateKeys = new Set<string>();
    for (const e of entries) {
      if (
        !isRebuildRevisionNote(e.notes ?? '') &&
        e.referenceId === null &&
        e.transactionType === 'dispatch'
      ) {
        originalEntryDateKeys.add(`${e.date}|${e.materialId}|${e.partyId ?? 0}`);
      }
    }

    // Step 2 — classify each delta row as Part A or Part B
    const deltaMap = new Map<number, number>();                          // Part A: refId → signed delta
    const dateKeyDeltaQueue = new Map<string, { delta: number; refId: number }[]>(); // Part B: date|mat|party → queue
    const deltaRowIds = new Set<number>(); // IDs of rows to skip in the main loop

    for (const e of entries) {
      const notes = e.notes ?? '';
      if (!isRebuildRevisionNote(notes)) continue;

      // Always drop delta rows with no referenceId — nothing to pair them with.
      if (e.referenceId == null) {
        deltaRowIds.add(e.id);
        continue;
      }

      const signedDelta = e.transactionType === 'dispatch'
        ? (e.quantityOut || 0)
        : -(e.quantityIn || 0);

      if (linkedRefIds.has(e.referenceId)) {
        // Part A: direct referenceId match — absorb into parent dispatch, skip in main loop.
        deltaRowIds.add(e.id);
        deltaMap.set(e.referenceId, (deltaMap.get(e.referenceId) ?? 0) + signedDelta);
      } else {
        const dateKey = `${e.date}|${e.materialId}|${e.partyId ?? 0}`;
        if (originalEntryDateKeys.has(dateKey) || e.transactionType !== 'dispatch') {
          // Part B (normal): an original unlinked entry exists to pair with, OR this is a
          // reversal adjustment — queue it and skip it in the main loop as usual.
          deltaRowIds.add(e.id);
          const queue = dateKeyDeltaQueue.get(dateKey) ?? [];
          queue.push({ delta: signedDelta, refId: e.referenceId });
          dateKeyDeltaQueue.set(dateKey, queue);
        }
        // Part B (new-material): no original entry exists for this material on this dispatch.
        // Do NOT add to deltaRowIds — the main loop processes it as a standalone dispatch
        // entry. Its referenceId lets dispatchMeta supply theoreticalAggregates[materialId]
        // as templateQty, giving the correct own-vs-borrowed split.
      }
    }

    let totalReceived = 0;
    let dispatchedOwn = 0;
    let replenishedToHlc = 0;
    let borrowedFromHlc = 0;
    let running = 0; // party's own-stock running balance

    type DetailEntry = StockLedgerEntry & {
      displayType: string;
      borrowedQty: number;
      runningBalance: number;
      templateQty?: number;
      ownQty?: number;
    };
    const detail: DetailEntry[] = [];

    // running = party's own physical stock balance.
    // Borrowed-dispatch rows do NOT change running (HLC supplied that material).
    // Replenishment to HLC decreases party stock.
    // Rebuild delta rows are skipped — absorbed into their parent dispatch row.
    for (const e of entries) {
      // Skip rebuild delta rows — they are merged into their parent dispatch below
      if (deltaRowIds.has(e.id)) continue;

      const qIn = e.quantityIn || 0;
      const qOut = e.quantityOut || 0;

      if (e.transactionType === 'opening') {
        running += qIn;
        totalReceived += qIn;
        detail.push({ ...e, displayType: 'opening', borrowedQty: 0, runningBalance: running });
      } else if (e.transactionType === 'receipt') {
        running += qIn;
        totalReceived += qIn;
        detail.push({ ...e, displayType: 'receipt', borrowedQty: 0, runningBalance: running });
      } else if (e.transactionType === 'return') {
        running += qIn;
        detail.push({ ...e, displayType: 'return', borrowedQty: 0, runningBalance: running });
      } else if (e.transactionType === 'adjustment') {
        // Regular (non-delta) stock correction
        running += qIn - qOut;
        detail.push({ ...e, displayType: 'correction', borrowedQty: 0, runningBalance: running });
      } else if (e.transactionType === 'dispatch') {
        // Apply any rebuild delta — Part A (direct refId) or Part B (date-key queue fallback)
        let delta = 0;
        let siteRefId = e.referenceId;
        if (e.referenceId != null) {
          // Part A: original entry already has the matching referenceId
          delta = deltaMap.get(e.referenceId) ?? 0;
        } else {
          // Part B: original entry has referenceId = null — consume next queued delta
          const dateKey = `${e.date}|${e.materialId}|${e.partyId ?? 0}`;
          const queue = dateKeyDeltaQueue.get(dateKey);
          if (queue && queue.length > 0) {
            const item = queue.shift()!;
            delta = item.delta;
            siteRefId = item.refId; // use delta row's refId for site lookup
          }
        }
        const originalQty = qOut;
        const netRequired = Math.max(0, originalQty + delta);

        // Resolve the full template quantity from theoreticalAggregates (updated by the rebuild).
        // This is the authoritative "how much of this material should have been consumed" value.
        // Falls back to netRequired for pre-rebuild legacy rows without aggregates data.
        let templateQty = netRequired;
        if (siteRefId != null) {
          const meta = dispatchMeta.get(siteRefId);
          if (meta?.theoreticalAggregates) {
            try {
              const agg: Record<string, number> =
                typeof meta.theoreticalAggregates === 'string'
                  ? JSON.parse(meta.theoreticalAggregates as string)
                  : (meta.theoreticalAggregates as Record<string, number>);
              const aggVal = agg[String(materialId)] ?? (agg as Record<number, number>)[materialId];
              if (aggVal != null && +aggVal > 0) templateQty = +aggVal;
            } catch { /* fallback to netRequired */ }
          }
        }

        // Build note: "Material Consumed — {site} (revision info if applicable)"
        const site = siteRefId != null
          ? (dispatchMeta.get(siteRefId)?.deliveryLocation?.trim() || '')
          : '';
        let note = 'Material Consumed';
        if (site) note += ` \u2014 ${site}`;
        if (Math.abs(delta) >= 0.0001) {
          const sign = delta >= 0 ? '+' : '';
          note += ` (was ${originalQty.toFixed(3)}T, ${sign}${delta.toFixed(3)}T \u2192 ${netRequired.toFixed(3)}T)`;
        }

        // Own-vs-borrowed split using a running-balance simulation:
        // running = cumulative own-stock remaining for this party.
        // ownQty  = how much of this dispatch came from the party's own stock
        //           (capped at whatever is still available in the running balance).
        // borrowedQty = the shortfall that HLC must cover (template obligation minus own).
        // running is decremented by ownQty only — borrowed material never depletes
        // the party's own-stock counter.
        const available = Math.max(0, running);
        const ownQty = Math.min(templateQty, available);
        const borrowedQty = Math.max(0, templateQty - ownQty);

        running -= ownQty;

        dispatchedOwn += ownQty;
        borrowedFromHlc += borrowedQty;

        // Single row per dispatch — templateQty, ownQty, and borrowedQty are embedded
        // as extra fields so the frontend can show the breakdown inline without synthetic rows.
        detail.push({
          ...e,
          quantityOut: ownQty,
          notes: note,
          displayType: 'own_dispatch',
          borrowedQty,
          ownQty,
          templateQty,
          runningBalance: running,
        });
      } else if (e.transactionType === 'transfer') {
        if (qOut > 0) {
          running -= qOut;
          replenishedToHlc += qOut;
          detail.push({ ...e, displayType: 'replenishment', borrowedQty: 0, runningBalance: running });
        } else {
          running += qIn;
          detail.push({ ...e, displayType: 'transfer_in', borrowedQty: 0, runningBalance: running });
        }
      } else if (e.transactionType === 'issue') {
        // Material issued directly from stock (e.g. to a site) — reduces the party's
        // physical balance just like a dispatch, so running must decrease.
        running -= qOut;
        detail.push({ ...e, displayType: 'other', borrowedQty: 0, runningBalance: running });
      } else {
        detail.push({ ...e, displayType: 'other', borrowedQty: 0, runningBalance: running });
      }
    }

    const outstanding = Math.max(0, borrowedFromHlc - replenishedToHlc);

    return {
      summary: { totalReceived, dispatchedOwn, borrowedFromHlc, replenishedToHlc, outstanding, uom },
      entries: detail,
    };
  }

  async getHlcBorrowReconciliation(partyId: number, materialId: number, dateFrom?: string, dateTo?: string): Promise<{
    uom: string;
    rows: { date: string; site: string; partyStatementBorrowed: number; hlcLedgerDispatched: number | null; delta: number | null; isLegacy: boolean }[];
    totals: { partyStatementBorrowed: number; hlcLedgerDispatched: number; delta: number };
  }> {
    // 1. Compute the full-history party statement up to dateTo (no dateFrom) so the running
    //    balance — and therefore borrowedQty — is accurate from the very first transaction.
    //    We filter to the requested date window manually in step 2.
    const stmt = await this.getPartyStatement(partyId, materialId, undefined, dateTo);
    const { uom } = stmt.summary;

    // 2. Filter dispatch entries to the requested window and split by link status.
    const dispatchEntries = stmt.entries.filter(e => {
      if (e.displayType !== 'own_dispatch') return false;
      if (dateFrom && e.date < dateFrom) return false;
      return true;
    });
    const linkedEntries   = dispatchEntries.filter(e => e.referenceId != null);
    const unlinkedEntries = dispatchEntries.filter(e => e.referenceId == null);

    // 3. Distinct referenceIds for linked party dispatches.
    const linkedRefIds = [...new Set(linkedEntries.map(e => e.referenceId!))];

    // 4. Find HLC party.
    const allParties = await db.select({ id: parties.id, name: parties.name }).from(parties);
    const hlcParty =
      allParties.find(p => p.name?.trim().toUpperCase() === 'HLC') ??
      allParties.find(p => p.name?.trim().toUpperCase().includes('HLC') || p.name?.trim().toUpperCase().includes('HIGH LANE'));
    const hlcPartyId = hlcParty?.id ?? null;

    // 5. Fetch HLC ledger rows ONLY for linked dispatches using referenceId.
    //    This is fully party-scoped: no cross-contamination with other parties that
    //    borrowed the same material on the same date.
    const hlcLinkedRaw = hlcPartyId !== null && linkedRefIds.length > 0
      ? await db
          .select({ date: stockLedger.date, quantityOut: stockLedger.quantityOut })
          .from(stockLedger)
          .where(and(
            eq(stockLedger.partyId, hlcPartyId),
            eq(stockLedger.materialId, materialId),
            eq(stockLedger.transactionType, 'dispatch'),
            inArray(stockLedger.referenceId, linkedRefIds),
          ))
      : [];

    // 6. Aggregate HLC totals by date (linked only).
    const hlcByDate = new Map<string, number>();
    for (const r of hlcLinkedRaw) {
      hlcByDate.set(r.date, (hlcByDate.get(r.date) ?? 0) + (r.quantityOut ?? 0));
    }

    // 7a. Build linked rows: aggregate borrowed and HLC by date; full-outer-join on date.
    const linkedByDate = new Map<string, number>();
    const siteByDate   = new Map<string, string[]>();
    const extractSite  = (notes: string | null) => {
      const m = (notes ?? '').match(/Material Consumed\s*[—\-]\s*(.+?)(?:\s*\(was |\s*$)/);
      return m ? m[1].trim() : null;
    };
    for (const e of linkedEntries) {
      linkedByDate.set(e.date, (linkedByDate.get(e.date) ?? 0) + (e.borrowedQty ?? 0));
      const site = extractSite(e.notes ?? null);
      if (site) {
        const bucket = siteByDate.get(e.date) ?? [];
        if (!bucket.includes(site)) bucket.push(site);
        siteByDate.set(e.date, bucket);
      }
    }
    const linkedDates = new Set([...linkedByDate.keys(), ...hlcByDate.keys()]);
    const linkedRows = [...linkedDates].sort().map(date => {
      const partyStatementBorrowed = linkedByDate.get(date) ?? 0;
      const hlcLedgerDispatched    = hlcByDate.get(date)   ?? 0;
      const delta = partyStatementBorrowed - hlcLedgerDispatched;
      const sites = siteByDate.get(date) ?? [];
      const site  = sites.length > 1 ? `${sites[0]} (+${sites.length - 1} more)` : (sites[0] ?? '');
      return { date, site, partyStatementBorrowed, hlcLedgerDispatched: hlcLedgerDispatched as number | null, delta: delta as number | null, isLegacy: false };
    });

    // 7b. Build legacy (unlinked) rows: these cannot be reliably matched to HLC ledger entries
    //     because the original dispatch lacked a referenceId and matching by date/material alone
    //     would include other parties' HLC rows. Surface them with hlcLedgerDispatched = null
    //     so the admin knows they require manual verification.
    const unlinkedByDate = new Map<string, number>();
    const unlinkedSiteByDate = new Map<string, string[]>();
    for (const e of unlinkedEntries) {
      unlinkedByDate.set(e.date, (unlinkedByDate.get(e.date) ?? 0) + (e.borrowedQty ?? 0));
      const site = extractSite(e.notes ?? null);
      if (site) {
        const bucket = unlinkedSiteByDate.get(e.date) ?? [];
        if (!bucket.includes(site)) bucket.push(site);
        unlinkedSiteByDate.set(e.date, bucket);
      }
    }
    const legacyRows = [...unlinkedByDate.keys()].sort().map(date => {
      const partyStatementBorrowed = unlinkedByDate.get(date)!;
      const sites = unlinkedSiteByDate.get(date) ?? [];
      const site  = sites.length > 1 ? `${sites[0]} (+${sites.length - 1} more)` : (sites[0] ?? '');
      return { date, site, partyStatementBorrowed, hlcLedgerDispatched: null as number | null, delta: null as number | null, isLegacy: true };
    });

    // 8. Merge and sort all rows.
    const rows = [...linkedRows, ...legacyRows].sort((a, b) => a.date.localeCompare(b.date));

    // 9. Totals: sum only reconcilable (non-legacy) rows.
    const totals = linkedRows.reduce(
      (acc, r) => ({
        partyStatementBorrowed: acc.partyStatementBorrowed + r.partyStatementBorrowed,
        hlcLedgerDispatched:    acc.hlcLedgerDispatched    + (r.hlcLedgerDispatched ?? 0),
        delta:                  acc.delta                  + (r.delta ?? 0),
      }),
      { partyStatementBorrowed: 0, hlcLedgerDispatched: 0, delta: 0 },
    );

    return { uom, rows, totals };
  }

  async postStockCorrection(data: {
    materialId: number;
    partyId: number;
    physicalQty: number;
    uom: string;
    date: string;
    notes: string;
    correctedBy: string;
  }): Promise<{ adjustment: number; previousBalance: number; newBalance: number; ledgerEntry: StockLedgerEntry }> {
    return db.transaction(async (tx) => {
      // Get the selected party's current balance for this material
      const condition = and(eq(stockBalances.partyId, data.partyId), eq(stockBalances.materialId, data.materialId));
      const [existing] = await tx.select().from(stockBalances).where(condition).limit(1);
      const previousBalance = existing?.balance ?? 0;
      const adjustment = data.physicalQty - previousBalance;

      // Update or create the party's balance
      if (existing) {
        await tx.update(stockBalances)
          .set({ balance: data.physicalQty, lastUpdated: new Date() })
          .where(eq(stockBalances.id, existing.id));
      } else {
        await tx.insert(stockBalances).values({
          partyId: data.partyId, materialId: data.materialId, balance: data.physicalQty, uom: data.uom,
        });
      }

      // Write ledger entry
      const [entry] = await tx.insert(stockLedger).values({
        date: data.date,
        partyId: data.partyId,
        materialId: data.materialId,
        transactionType: "adjustment",
        quantityIn: adjustment > 0 ? adjustment : 0,
        quantityOut: adjustment < 0 ? Math.abs(adjustment) : 0,
        balanceAfter: data.physicalQty,
        uom: data.uom,
        notes: `Physical stock correction by ${data.correctedBy}. ${data.notes}`,
      }).returning();

      return { adjustment, previousBalance, newBalance: data.physicalQty, ledgerEntry: entry };
    });
  }

  // Enhanced truck dispatch with automatic stock deduction
  // Returns the saved dispatch on success; throws StockShortageError when
  // the owner has insufficient stock and the caller did not opt in to HLC borrow.
  async createTruckDispatchWithStockDeduction(
    dispatch: InsertTruckDispatch & { allowHlcFallback?: boolean },
  ): Promise<{ dispatch: TruckDispatch; shortages: { materialId: number; required: number; available: number }[] }> {
    const { allowHlcFallback = false, ...dispatchData } = dispatch;
    return db.transaction(async (tx) => {
      // Get mix template with components
      const [template] = await tx.select().from(mixTemplates).where(eq(mixTemplates.id, dispatchData.mixTemplateId)).limit(1);
      const components = await tx.select().from(mixTemplateComponents).where(eq(mixTemplateComponents.templateId, dispatchData.mixTemplateId));
      
      // Calculate theoretical consumption
      const loadWeight = dispatch.loadWeight;
      const theoreticalBitumenPercent = template?.bitumenPercent || 0;
      const theoreticalBitumenQty = (loadWeight * theoreticalBitumenPercent) / 100;
      const ldoNorm = (template as any)?.ldoNorm || DEFAULT_LDO_NORM;
      const theoreticalLdoQty = loadWeight * ldoNorm;
      
      // Calculate aggregate consumption from components (percent of total mix).
      // Applies moisture-content (MC) and wastage-factor (WF) corrections:
      //   adjustedQty = (loadWeight × percent/100) × (1 + WF/100) / (1 − MC/100)
      // MC must be < 100 (denominator guard). Default MC=0, WF=0 → no change.
      const applyMcWfAdjustment = (baseQty: number, mc: number, wf: number): number => {
        if (mc >= 100) throw new Error(`Invalid moisture content ${mc}% — must be less than 100%`);
        if (mc === 0 && wf === 0) return baseQty;
        return baseQty * (1 + wf / 100) / (1 - mc / 100);
      };
      const theoreticalAggregates: Record<number, number> = {};
      for (const comp of components) {
        const percent = (comp as any).percent || 0;
        const mc = Math.max(0, Math.min((comp as any).moistureContent || 0, 30));
        const wf = Math.max(0, Math.min((comp as any).wastageFactor || 0, 20));
        const baseQty = loadWeight * percent / 100;
        theoreticalAggregates[comp.materialId] = applyMcWfAdjustment(baseQty, mc, wf);
      }
      
      // Owner-first deduction model:
      //  1. The dispatch's partyId is treated as the material owner.
      //  2. We deduct from THAT party's stock only.
      //  3. If their stock can't cover it, we surface the shortage.
      //     - If the caller passed allowHlcFallback=true, the shortfall is
      //       borrowed from HLC's stock and tagged "(Borrowed from HLC)".
      //     - Otherwise we throw a structured error so the API can return 409
      //       and the UI can prompt the user for explicit consent.
      const shortages: { materialId: number; required: number; available: number }[] = [];
      const partyId = dispatchData.partyId;
      
      // Find HLC party (used for the optional borrow path)
      const allPartiesList = await tx.select().from(parties).orderBy(parties.id);
      // Strict HLC lookup: never silently fall back to an arbitrary party.
      const hlcParty = allPartiesList.find(p => p.name?.toUpperCase() === 'HLC')
        || allPartiesList.find(p => p.name?.toUpperCase().includes('HIGH LANE'))
        || null;
      const hlcPartyId = hlcParty?.id ?? null;
      const ownerParty = allPartiesList.find(p => p.id === partyId);
      const ownerPartyName = ownerParty?.name || `Party #${partyId}`;
      
      // Track ledger IDs inserted during this dispatch so we can backfill referenceId
      const insertedLedgerIds: number[] = [];

      // Helper to deduct from a specific source and write ledger entry.
      // If the dispatch UOM differs from the balance UOM, the quantity is converted
      // using the material's conversion factor before deducting (e.g. Ton dispatch
      // from a CFT-denominated opening balance like 6MM Down).
      const deductFromSource = async (pId: number | null, matId: number, qty: number, uom: string, notes: string) => {
        const condition = pId === null 
          ? and(sql`${stockBalances.partyId} IS NULL`, eq(stockBalances.materialId, matId))
          : and(eq(stockBalances.partyId, pId), eq(stockBalances.materialId, matId));
        const [existing] = await tx.select().from(stockBalances).where(condition).limit(1);

        // UOM mismatch check: convert qty to the balance's UOM when they differ
        let deductQty = qty;
        let deductUom = uom;
        if (existing?.uom && existing.uom !== uom) {
          const [mat] = await tx.select().from(plantMaterials)
            .where(eq(plantMaterials.id, matId)).limit(1);
          if (mat?.conversionFactor && mat.conversionFromUom && mat.conversionToUom) {
            if (
              uom.toUpperCase() === mat.conversionToUom.toUpperCase() &&
              existing.uom.toUpperCase() === mat.conversionFromUom.toUpperCase()
            ) {
              // Dispatch in Ton, balance in CFT → convert Ton → CFT
              deductQty = qty / mat.conversionFactor;
              deductUom = existing.uom;
            } else if (
              uom.toUpperCase() === mat.conversionFromUom.toUpperCase() &&
              existing.uom.toUpperCase() === mat.conversionToUom.toUpperCase()
            ) {
              // Dispatch in CFT, balance in Ton → convert CFT → Ton
              deductQty = qty * mat.conversionFactor;
              deductUom = existing.uom;
            }
          }
        }
        
        const newBalance = (existing?.balance || 0) - deductQty;
        
        if (existing) {
          await tx.update(stockBalances)
            .set({ balance: newBalance, lastUpdated: new Date() })
            .where(eq(stockBalances.id, existing.id));
        } else {
          await tx.insert(stockBalances).values({ partyId: pId, materialId: matId, balance: newBalance, uom: deductUom });
        }
        
        const [insertedRow] = await tx.insert(stockLedger).values({
          date: dispatchData.date,
          partyId: pId,
          materialId: matId,
          transactionType: "dispatch",
          quantityOut: deductQty,
          balanceAfter: newBalance,
          uom: deductUom,
          notes,
        }).returning({ id: stockLedger.id });
        if (insertedRow?.id) insertedLedgerIds.push(insertedRow.id);
        
        return newBalance;
      };
      
      // Resolve materials we need
      const [bitumenMaterial] = await tx.select().from(plantMaterials)
        .where(sql`UPPER(${plantMaterials.name}) LIKE '%BITUMEN%'`)
        .limit(1);
      const [ldoMaterial] = await tx.select().from(plantMaterials)
        .where(sql`UPPER(${plantMaterials.name}) = 'LDO'`)
        .limit(1);

      // Build human-readable label for ledger notes: mix type + delivery site
      const mixLabel = [
        template?.name ?? "Dispatch",
        dispatchData.deliveryLocation?.trim() || null,
      ].filter(Boolean).join(" — ");

      // Build the consumption plan: list of {matId, qty, uom, label}
      type Plan = { matId: number; qty: number; uom: string; label: string };
      const plan: Plan[] = [];
      if (bitumenMaterial && theoreticalBitumenQty > 0) {
        plan.push({ matId: bitumenMaterial.id, qty: theoreticalBitumenQty, uom: "Ton", label: mixLabel });
      }
      if (ldoMaterial && theoreticalLdoQty > 0) {
        plan.push({ matId: ldoMaterial.id, qty: theoreticalLdoQty, uom: "Liters", label: mixLabel });
      }
      for (const [matIdStr, qty] of Object.entries(theoreticalAggregates)) {
        const matId = parseInt(matIdStr);
        if (qty > 0) plan.push({ matId, qty, uom: "Ton", label: mixLabel });
      }
      
      // Helper to read a single party balance (returns raw value and UOM).
      const getBalanceRow = async (pId: number | null, matId: number) => {
        const condition = pId === null 
          ? and(sql`${stockBalances.partyId} IS NULL`, eq(stockBalances.materialId, matId))
          : and(eq(stockBalances.partyId, pId), eq(stockBalances.materialId, matId));
        const [bal] = await tx.select().from(stockBalances).where(condition).limit(1);
        return { balance: bal?.balance || 0, uom: bal?.uom || null };
      };

      // Helper: look up material conversion info from matRows (pre-fetched below).
      const getMatConversion = (matId: number) => matRows.find(m => m.id === matId);

      // Convert a balance expressed in `fromUom` into `toUom` using the material's factor.
      // Returns the original value unchanged if no known conversion applies.
      const normalizeBalance = (value: number, fromUom: string | null, toUom: string, matId: number) => {
        if (!fromUom || fromUom === toUom) return value;
        const mat = getMatConversion(matId);
        if (!mat?.conversionFactor || !mat.conversionFromUom || !mat.conversionToUom) return value;
        if (
          fromUom.toUpperCase() === mat.conversionFromUom.toUpperCase() &&
          toUom.toUpperCase() === mat.conversionToUom.toUpperCase()
        ) {
          return value * mat.conversionFactor;          // e.g. CFT → Ton
        }
        if (
          fromUom.toUpperCase() === mat.conversionToUom.toUpperCase() &&
          toUom.toUpperCase() === mat.conversionFromUom.toUpperCase()
        ) {
          return value / mat.conversionFactor;          // e.g. Ton → CFT
        }
        return value;
      };
      
      // PHASE 1: Compute shortages without writing anything.
      // Normalise the balance to the dispatch item's UOM before comparing so that
      // a CFT balance is not compared directly against a Ton dispatch quantity.
      const shortageDetails: { materialId: number; materialName: string; required: number; available: number; shortfall: number; uom: string }[] = [];
      const matIdsForLookup = Array.from(new Set(plan.map(p => p.matId)));
      const matRows = matIdsForLookup.length
        ? await tx.select().from(plantMaterials).where(inArray(plantMaterials.id, matIdsForLookup))
        : [];
      const matNameById = new Map(matRows.map(m => [m.id, m.name]));
      
      for (const item of plan) {
        const { balance: rawBal, uom: balUom } = await getBalanceRow(partyId, item.matId);
        const ownerBal = normalizeBalance(rawBal, balUom, item.uom, item.matId);
        if (ownerBal < item.qty) {
          const shortfall = +(item.qty - ownerBal).toFixed(6);
          shortageDetails.push({
            materialId: item.matId,
            materialName: matNameById.get(item.matId) || `Material #${item.matId}`,
            required: +item.qty.toFixed(6),
            available: +ownerBal.toFixed(6),
            shortfall,
            uom: item.uom,
          });
        }
      }
      
      // If shortages exist and caller hasn't approved HLC fallback, abort with structured info.
      if (shortageDetails.length > 0 && !allowHlcFallback) {
        // Thrown so the route handler can return HTTP 409 with the payload.
        const err = new StockShortageError({
          needsConfirmation: true,
          ownerPartyId: partyId,
          ownerPartyName,
          fallbackPartyId: hlcPartyId,
          fallbackPartyName: hlcParty?.name ?? null,
          shortages: shortageDetails,
        });
        throw err;
      }
      
      // PHASE 2: Actually deduct.
      // Normalise balance to item UOM for the split calculation before calling
      // deductFromSource (which handles its own conversion internally).
      for (const item of plan) {
        const { balance: rawBal, uom: balUom } = await getBalanceRow(partyId, item.matId);
        const ownerBal = normalizeBalance(rawBal, balUom, item.uom, item.matId);
        const fromOwner = Math.min(Math.max(ownerBal, 0), item.qty);
        if (fromOwner > 0) {
          await deductFromSource(partyId, item.matId, fromOwner, item.uom, item.label);
        }
        const remaining = +(item.qty - fromOwner).toFixed(9);
        if (remaining > 0) {
          // Borrowing branch — only reachable when allowHlcFallback === true.
          if (hlcPartyId && hlcPartyId !== partyId) {
            // When the owner has zero stock (fromOwner === 0), insert a 0-qty marker row for the
            // owner party BEFORE the HLC borrow entry.  Without this marker getPartyStatement only
            // reads the owner's ledger and would never see this dispatch at all, so the full HLC
            // obligation would be silently dropped from borrowedFromHlc.
            if (fromOwner === 0) {
              const [markerRow] = await tx.insert(stockLedger).values({
                date: dispatchData.date,
                partyId,
                materialId: item.matId,
                transactionType: "dispatch",
                quantityOut: 0,
                balanceAfter: Math.max(ownerBal, 0),
                uom: item.uom,
                notes: item.label,
              }).returning({ id: stockLedger.id });
              if (markerRow?.id) insertedLedgerIds.push(markerRow.id);
            }
            await deductFromSource(hlcPartyId, item.matId, remaining, item.uom, `${item.label} (Borrowed from HLC)`);
          } else {
            // Owner IS HLC, or no HLC found — record the shortfall against the owner so the ledger remains complete.
            await deductFromSource(partyId, item.matId, remaining, item.uom, `${item.label} (${ownerPartyName} — short)`);
          }
          shortages.push({ materialId: item.matId, required: item.qty, available: Math.max(ownerBal, 0) });
        }
      }
      
      // Calculate actual values (use provided or default to theoretical)
      const actualBitumenPercent = dispatchData.actualBitumenPercent ?? theoreticalBitumenPercent;
      const actualBitumenQty = dispatchData.actualBitumenQty ?? theoreticalBitumenQty;
      const actualLdoQty = dispatchData.actualLdoQty ?? theoreticalLdoQty;
      
      // Calculate variance percentages (if actual differs from theoretical)
      const bitumenVariancePercent = theoreticalBitumenQty > 0 
        ? ((actualBitumenQty - theoreticalBitumenQty) / theoreticalBitumenQty) * 100 
        : 0;
      const ldoVariancePercent = theoreticalLdoQty > 0 
        ? ((actualLdoQty - theoreticalLdoQty) / theoreticalLdoQty) * 100 
        : 0;
      
      // Check if user provided actual values different from theoretical
      const hasAdjustment = (dispatchData.actualBitumenPercent !== undefined && dispatchData.actualBitumenPercent !== null) ||
                           (dispatchData.actualBitumenQty !== undefined && dispatchData.actualBitumenQty !== null) ||
                           (dispatchData.actualLdoQty !== undefined && dispatchData.actualLdoQty !== null);
      
      // Create the dispatch record with variance tracking
      const [result] = await tx.insert(truckDispatches).values({
        ...dispatchData,
        truckNumber: dispatchData.truckNumber.toUpperCase(),
        deliveryLocation: dispatchData.deliveryLocation?.toUpperCase(),
        theoreticalBitumenPercent,
        theoreticalBitumenQty,
        theoreticalLdoQty,
        theoreticalAggregates: JSON.stringify(theoreticalAggregates),
        actualBitumenPercent,
        actualBitumenQty,
        actualLdoQty,
        bitumenVariancePercent: Math.abs(bitumenVariancePercent) > 0.01 ? bitumenVariancePercent : null,
        ldoVariancePercent: Math.abs(ldoVariancePercent) > 0.01 ? ldoVariancePercent : null,
        adjustedBy: hasAdjustment ? "operator" : null,
        adjustedAt: hasAdjustment ? new Date() : null,
        stockDeducted: 1,
        shortageWarning: shortages.length ? JSON.stringify(shortages) : null,
      }).returning();

      // Backfill referenceId on all ledger rows created during this transaction
      if (insertedLedgerIds.length > 0) {
        await tx.update(stockLedger)
          .set({ referenceId: result.id })
          .where(inArray(stockLedger.id, insertedLedgerIds));
      }
      
      // Create audit log entries if actual differs from theoretical
      if (hasAdjustment && Math.abs(bitumenVariancePercent) > 0.01) {
        await tx.insert(consumptionAuditLog).values({
          dispatchId: result.id,
          adjustmentType: "bitumen",
          previousValue: theoreticalBitumenQty,
          newValue: actualBitumenQty,
          theoreticalValue: theoreticalBitumenQty,
          variancePercent: bitumenVariancePercent,
          adjustedBy: "operator",
        });
      }
      
      if (hasAdjustment && Math.abs(ldoVariancePercent) > 0.01) {
        await tx.insert(consumptionAuditLog).values({
          dispatchId: result.id,
          adjustmentType: "ldo",
          previousValue: theoreticalLdoQty,
          newValue: actualLdoQty,
          theoreticalValue: theoreticalLdoQty,
          variancePercent: ldoVariancePercent,
          adjustedBy: "operator",
        });
      }
      
      return { dispatch: result, shortages };
    });
  }

  async rebuildDispatchLedgerForTemplate(opts: {
    templateId: number;
    fromDateTime: string;
  }): Promise<{
    fromDateTime: string;
    dispatches: number;
    ledgerRowsDeleted: number;
    ledgerRowsCreated: number;
    errors: string[];
  }> {
    const { templateId, fromDateTime } = opts;
    const errors: string[] = [];

    // 1. Get current aggregate components for this template
    const components = await db.select().from(mixTemplateComponents)
      .where(eq(mixTemplateComponents.templateId, templateId));
    const aggMaterialIds = components.map(c => c.materialId);
    if (!aggMaterialIds.length) {
      return { fromDateTime, dispatches: 0, ledgerRowsDeleted: 0, ledgerRowsCreated: 0, errors: ['No aggregate components defined for this template'] };
    }
    // Grows to include removed-component materials discovered during rebuild
    const allAffectedMatIds = new Set<number>(aggMaterialIds);

    // 2. Parse fromDateTime — format "YYYY-MM-DDTHH:MM"
    const fromDate = fromDateTime.substring(0, 10);
    const fromTime = fromDateTime.substring(11, 16) || '00:00';

    // 3. Find all dispatches for this template at or after the cutoff
    const allTemplateDispatches = await db.select().from(truckDispatches)
      .where(eq(truckDispatches.mixTemplateId, templateId));

    const affectedDispatches = allTemplateDispatches.filter(d => {
      if (d.date > fromDate) return true;
      if (d.date === fromDate) return (d.time || '00:00') >= fromTime;
      return false;
    });

    if (!affectedDispatches.length) {
      return { fromDateTime, dispatches: 0, ledgerRowsDeleted: 0, ledgerRowsCreated: 0, errors: [] };
    }

    // 4. Look up HLC party for borrow-split recreation
    const [hlcParty] = await db.select().from(parties)
      .where(sql`UPPER(TRIM(${parties.name})) = 'HLC'`)
      .limit(1);
    const hlcPartyId = hlcParty?.id ?? null;
    const hlcPartyName = hlcParty?.name ?? 'HLC';

    const allParties = await db.select().from(parties);
    const partyNameMap = new Map(allParties.map(p => [p.id, p.name]));

    const dispatchIds = affectedDispatches.map(d => d.id);

    // 5. Split dispatches into two categories:
    //    "linked"  — have precise referenceId rows (created after the createDispatch backfill fix)
    //    "legacy"  — no referenceId on their aggregate entries (pre-fix rows)
    //
    // Legacy rows use a delta/adjustment approach to avoid the mid-day cutoff
    // ambiguity: we never bulk-delete unlinked rows (which could hit pre-cutoff
    // dispatches on the same date), and HLC borrow entries that belong to legacy
    // dispatches are left intact — only the delta adjustment is inserted.
    // A dispatch is "linked" if any stock-ledger dispatch row has its ID as referenceId.
    // We intentionally do NOT filter by aggMaterialIds here so that dispatches whose
    // only linked rows are for materials removed from the template are still classified
    // as "linked" (precise delete+recreate rather than delta).
    const linkedCheck = await db
      .select({ referenceId: stockLedger.referenceId })
      .from(stockLedger)
      .where(
        and(
          inArray(stockLedger.referenceId, dispatchIds),
          eq(stockLedger.transactionType, 'dispatch')
        )
      );
    const linkedDispatchIds = new Set(
      linkedCheck.map(e => e.referenceId).filter((id): id is number => id != null)
    );
    let linkedDispatches = affectedDispatches.filter(d => linkedDispatchIds.has(d.id));
    let legacyDispatches  = affectedDispatches.filter(d => !linkedDispatchIds.has(d.id));

    let ledgerRowsDeleted = 0;
    let ledgerRowsCreated = 0;

    // Helper: proportional owner/HLC split based on shortageWarning recorded at dispatch time
    const computeSplit = (dispatch: typeof truckDispatches.$inferSelect, matId: number, totalQty: number) => {
      if (!dispatch.shortageWarning || dispatch.partyId === hlcPartyId) {
        return { ownerQty: totalQty, hlcQty: 0 };
      }
      let shortages: { materialId: number; required: number; available: number }[] = [];
      try { shortages = JSON.parse(dispatch.shortageWarning as string) ?? []; } catch { /* ignore */ }
      const s = shortages.find(x => x.materialId === matId);
      if (!s || s.required <= 0) return { ownerQty: totalQty, hlcQty: 0 };
      const ownerFraction = Math.min(1, Math.max(0, s.available / s.required));
      const ownerQty = +(totalQty * ownerFraction).toFixed(9);
      return { ownerQty, hlcQty: +(totalQty - ownerQty).toFixed(9) };
    };

    const sortByDateTime = (list: typeof affectedDispatches) =>
      [...list].sort((a, b) => {
        const dc = a.date.localeCompare(b.date);
        return dc !== 0 ? dc : (a.time || '00:00').localeCompare(b.time || '00:00');
      });

    // 5.5. Backfill referenceId for legacy dispatches so PART A can delete+recreate
    //      them precisely.  Finds each dispatch's existing stock_ledger rows by
    //      quantity match (±0.001 to absorb real-column float imprecision); only
    //      updates when there is exactly one candidate (safe from collision).
    if (legacyDispatches.length > 0) {
      for (const dispatch of legacyDispatches) {
        if (!dispatch.theoreticalAggregates) continue;
        let oldAgg: Record<string, number> = {};
        try { oldAgg = JSON.parse(dispatch.theoreticalAggregates as string) ?? {}; } catch { continue; }

        for (const [matIdStr, totalQty] of Object.entries(oldAgg)) {
          const matId = Number(matIdStr);
          if (isNaN(matId) || totalQty <= 0) continue;
          const { ownerQty, hlcQty } = computeSplit(dispatch, matId, totalQty);

          if (ownerQty > 0.0001 && dispatch.partyId !== null) {
            const candidates = await db.select({ id: stockLedger.id }).from(stockLedger).where(and(
              eq(stockLedger.date, dispatch.date), eq(stockLedger.partyId, dispatch.partyId),
              eq(stockLedger.materialId, matId), eq(stockLedger.transactionType, 'dispatch'),
              isNull(stockLedger.referenceId),
              gte(stockLedger.quantityOut, ownerQty - 0.001), lte(stockLedger.quantityOut, ownerQty + 0.001)
            ));
            if (candidates.length === 1)
              await db.update(stockLedger).set({ referenceId: dispatch.id }).where(eq(stockLedger.id, candidates[0].id));
          }
          if (hlcQty > 0.0001 && hlcPartyId !== null) {
            const candidates = await db.select({ id: stockLedger.id }).from(stockLedger).where(and(
              eq(stockLedger.date, dispatch.date), eq(stockLedger.partyId, hlcPartyId),
              eq(stockLedger.materialId, matId), eq(stockLedger.transactionType, 'dispatch'),
              isNull(stockLedger.referenceId),
              gte(stockLedger.quantityOut, hlcQty - 0.001), lte(stockLedger.quantityOut, hlcQty + 0.001)
            ));
            if (candidates.length === 1)
              await db.update(stockLedger).set({ referenceId: dispatch.id }).where(eq(stockLedger.id, candidates[0].id));
          }
        }
      }

      // Re-classify after backfill
      const afterBackfill = await db.select({ referenceId: stockLedger.referenceId }).from(stockLedger)
        .where(and(inArray(stockLedger.referenceId, dispatchIds), eq(stockLedger.transactionType, 'dispatch')));
      const updatedLinkedIds = new Set(
        afterBackfill.map(e => e.referenceId).filter((id): id is number => id != null)
      );
      linkedDispatches = affectedDispatches.filter(d => updatedLinkedIds.has(d.id));
      legacyDispatches  = affectedDispatches.filter(d => !updatedLinkedIds.has(d.id));
    }

    // ── PART A: Linked dispatches — delete and recreate precisely ────────────────
    if (linkedDispatches.length > 0) {
      const linkedIds = linkedDispatches.map(d => d.id);

      // Build the union of current and historical aggregate materialIds so we can
      // use an explicit filter on the delete.  We derive historical IDs from each
      // dispatch's theoreticalAggregates JSON — this avoids accidentally deleting
      // non-aggregate dispatch ledger rows (bitumen, LDO) that may also carry the
      // same referenceId since createTruckDispatchWithStockDeduction backfills it.
      const safeDeleteMatIds = new Set<number>(aggMaterialIds);
      for (const d of linkedDispatches) {
        try {
          if (d.theoreticalAggregates) {
            const oldAgg: Record<string, number> =
              JSON.parse(d.theoreticalAggregates as string) ?? {};
            Object.keys(oldAgg).map(Number).filter(n => !isNaN(n))
              .forEach(id => safeDeleteMatIds.add(id));
          }
        } catch { /* ignore */ }
      }
      const safeDeleteMatIdsArr = [...safeDeleteMatIds];

      const deleted = await db.delete(stockLedger)
        .where(
          and(
            inArray(stockLedger.referenceId, linkedIds),
            eq(stockLedger.transactionType, 'dispatch'),
            inArray(stockLedger.materialId, safeDeleteMatIdsArr)
          )
        )
        .returning({ id: stockLedger.id, materialId: stockLedger.materialId });
      ledgerRowsDeleted += deleted.length;
      // Track every material that had rows deleted for balance recompute later
      deleted.forEach(r => { if (r.materialId != null) allAffectedMatIds.add(r.materialId); });

      for (const dispatch of sortByDateTime(linkedDispatches)) {
        try {
          const partyName = partyNameMap.get(dispatch.partyId ?? -1) ?? `Party #${dispatch.partyId}`;

          // ── Orphan cleanup: remove "no_ref" duplicate entries from the pre-backfill era ────
          // When dispatches were originally created before the referenceId backfill code was
          // added, ledger entries were written with referenceId = null. After a template
          // proportion change + Ledger Rebuild, the main bulk-delete removes only "has_ref"
          // entries (WHERE reference_id IN ...). The old "no_ref" rows are never touched,
          // leaving one stale duplicate per dispatch per material.
          //
          // Strategy: for each template component, delete the single oldest remaining no_ref
          // dispatch entry for that (date, party, material) using LIMIT 1 ORDER BY id.
          // We do NOT filter by quantity because theoreticalAggregates already reflects the
          // CURRENT proportions (already updated by a prior rebuild), not the historical ones
          // at which the orphans were written. Quantity matching would silently find nothing.
          //
          // Safety: dispatches in linkedDispatches are guaranteed to have been rebuilt
          // (they have has_ref entries). Any remaining no_ref entry on the same date/party/
          // material is therefore an orphan. Processing dispatches in sortByDateTime order
          // and using LIMIT 1 ORDER BY id ensures each call removes exactly one orphan in
          // ascending-id order — correct even when multiple dispatches share the same date.
          for (const comp of components) {
            if (dispatch.partyId !== null) {
              const orphanDel = await db.execute(sql`
                DELETE FROM stock_ledger
                WHERE id = (
                  SELECT id FROM stock_ledger
                  WHERE date             = ${dispatch.date}
                    AND party_id         = ${dispatch.partyId}
                    AND material_id      = ${comp.materialId}
                    AND transaction_type = 'dispatch'
                    AND reference_id     IS NULL
                  ORDER BY id
                  LIMIT 1
                )
              `);
              const n = (orphanDel as { rowCount?: number }).rowCount ?? 0;
              ledgerRowsDeleted += n;
              if (n > 0) allAffectedMatIds.add(comp.materialId);
            }

            if (hlcPartyId !== null) {
              const orphanDelHlc = await db.execute(sql`
                DELETE FROM stock_ledger
                WHERE id = (
                  SELECT id FROM stock_ledger
                  WHERE date             = ${dispatch.date}
                    AND party_id         = ${hlcPartyId}
                    AND material_id      = ${comp.materialId}
                    AND transaction_type = 'dispatch'
                    AND reference_id     IS NULL
                  ORDER BY id
                  LIMIT 1
                )
              `);
              const nh = (orphanDelHlc as { rowCount?: number }).rowCount ?? 0;
              ledgerRowsDeleted += nh;
              if (nh > 0) allAffectedMatIds.add(comp.materialId);
            }
          }
          // ── End orphan cleanup ────────────────────────────────────────────────────────────

          const newAggregates: Record<number, number> = {};

          for (const comp of components) {
            const mc = Math.max(0, Math.min(comp.moistureContent || 0, 30));
            const wf = Math.max(0, Math.min(comp.wastageFactor || 0, 20));
            if (mc >= 100) { errors.push(`Dispatch #${dispatch.id}: moisture content ${mc}% is invalid`); continue; }
            const baseQty = dispatch.loadWeight * (comp.percent ?? 0) / 100;
            const totalQty = +(mc !== 0 || wf !== 0
              ? baseQty * (1 + wf / 100) / (1 - mc / 100)
              : baseQty).toFixed(9);
            if (totalQty <= 0) continue;
            const { ownerQty, hlcQty } = computeSplit(dispatch, comp.materialId, totalQty);

            // Insert owner row always when there's a template quantity to track.
            // ownerQty may be 0 when the dispatch is fully HLC-covered — in that case we
            // still write a 0-qty marker row so getPartyStatement can detect this dispatch
            // in the owner's ledger and count the HLC obligation toward borrowedFromHlc.
            if (ownerQty > 0 || (ownerQty === 0 && hlcQty > 0 && dispatch.partyId !== null)) {
              await db.insert(stockLedger).values({
                date: dispatch.date,
                partyId: dispatch.partyId,
                materialId: comp.materialId,
                transactionType: 'dispatch',
                quantityOut: ownerQty,
                balanceAfter: 0,
                uom: 'Ton',
                notes: `Aggregate dispatch (${partyName})`,
                referenceId: dispatch.id,
              });
              ledgerRowsCreated++;
            }
            if (hlcQty > 0 && hlcPartyId) {
              await db.insert(stockLedger).values({
                date: dispatch.date,
                partyId: hlcPartyId,
                materialId: comp.materialId,
                transactionType: 'dispatch',
                quantityOut: hlcQty,
                balanceAfter: 0,
                uom: 'Ton',
                notes: `Aggregate dispatch (Borrowed from ${hlcPartyName})`,
                referenceId: dispatch.id,
              });
              ledgerRowsCreated++;
            }
            newAggregates[comp.materialId] = totalQty;
          }

          await db.update(truckDispatches)
            .set({ theoreticalAggregates: JSON.stringify(newAggregates) })
            .where(eq(truckDispatches.id, dispatch.id));
        } catch (err) {
          errors.push(`Dispatch #${dispatch.id}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    }

    // ── PART B: Remaining unmatched dispatches — delta fallback ──────────────────
    // For dispatches where backfill couldn't assign a unique referenceId (e.g. two
    // dispatches with the same loadWeight on the same day), insert proportional
    // delta entries (owner + HLC split) rather than replacing unidentifiable rows.
    const insertLegacyDeltaEntry = async (
      partyId: number | null,
      partyLabel: string,
      date: string,
      materialId: number,
      delta: number,
      refId: number,
    ) => {
      if (Math.abs(delta) < 0.0001) return;
      if (delta > 0) {
        await db.insert(stockLedger).values({
          date,
          partyId,
          materialId,
          transactionType: 'dispatch',
          quantityOut: delta,
          balanceAfter: 0,
          uom: 'Ton',
          notes: `Aggregate dispatch (${partyLabel}) [rebuild delta]`,
          referenceId: refId,
        });
      } else {
        await db.insert(stockLedger).values({
          date,
          partyId,
          materialId,
          transactionType: 'adjustment',
          quantityIn: -delta,
          balanceAfter: 0,
          uom: 'Ton',
          notes: `Aggregate dispatch reversal (${partyLabel}) [rebuild delta]`,
          referenceId: refId,
        });
      }
      ledgerRowsCreated++;
    };

    // Current components keyed by materialId for fast lookup
    const currentCompByMat = new Map(components.map(c => [c.materialId, c]));

    for (const dispatch of sortByDateTime(legacyDispatches)) {
      try {
        let oldAggregates: Record<string, number> = {};
        try {
          if (dispatch.theoreticalAggregates) {
            oldAggregates = JSON.parse(dispatch.theoreticalAggregates as string) ?? {};
          }
        } catch { /* ignore */ }

        const partyName = partyNameMap.get(dispatch.partyId ?? -1) ?? `Party #${dispatch.partyId}`;
        const newAggregates: Record<number, number> = {};

        // Union of current component materialIds and any materialIds recorded in
        // oldAggregates — so removed materials get a full reversal delta.
        const legacyMatIds = new Set<number>([
          ...components.map(c => c.materialId),
          ...Object.keys(oldAggregates).map(Number).filter(n => !isNaN(n)),
        ]);

        for (const matId of legacyMatIds) {
          allAffectedMatIds.add(matId);
          const comp = currentCompByMat.get(matId);
          const newQty = comp
            ? +((() => {
                const mc = Math.max(0, Math.min(comp.moistureContent || 0, 30));
                const wf = Math.max(0, Math.min(comp.wastageFactor || 0, 20));
                if (mc >= 100) throw new Error(`Invalid moisture content ${mc}% for material ${matId}`);
                const base = dispatch.loadWeight * (comp.percent ?? 0) / 100;
                return mc !== 0 || wf !== 0 ? base * (1 + wf / 100) / (1 - mc / 100) : base;
              })()).toFixed(9)
            : 0;
          const oldQty = +(oldAggregates[String(matId)] ?? 0);
          const totalDelta = +(newQty - oldQty).toFixed(9);

          // Only persist into newAggregates for active (current) components
          if (comp && newQty > 0) newAggregates[matId] = newQty;

          if (Math.abs(totalDelta) < 0.0001) continue;

          // Extract owner fraction from shortageWarning (same ratio used at dispatch time)
          let ownerFraction = 1;
          if (dispatch.shortageWarning && dispatch.partyId !== hlcPartyId) {
            try {
              const sw: { materialId: number; required: number; available: number }[] =
                JSON.parse(dispatch.shortageWarning as string) ?? [];
              const s = sw.find(x => x.materialId === matId);
              if (s && s.required > 0) {
                ownerFraction = Math.min(1, Math.max(0, s.available / s.required));
              }
            } catch { /* ignore */ }
          }

          const ownerDelta = +(totalDelta * ownerFraction).toFixed(9);
          const hlcDelta   = +(totalDelta - ownerDelta).toFixed(9);

          await insertLegacyDeltaEntry(dispatch.partyId, partyName, dispatch.date, matId, ownerDelta, dispatch.id);

          if (Math.abs(hlcDelta) >= 0.0001 && hlcPartyId !== null) {
            const hlcLabel = partyNameMap.get(hlcPartyId) ?? "HLC";
            await insertLegacyDeltaEntry(hlcPartyId, hlcLabel, dispatch.date, matId, hlcDelta, dispatch.id);
          }
        }

        await db.update(truckDispatches)
          .set({ theoreticalAggregates: JSON.stringify(newAggregates) })
          .where(eq(truckDispatches.id, dispatch.id));
      } catch (err) {
        errors.push(`Legacy dispatch #${dispatch.id}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // 7. Re-sync all dispatch theoretical values (bitumen %, LDO, variance) via
    //    the canonical recalculation method so nothing diverges from the main flow.
    await this.recalculateAllDispatchConsumption();

    // 8. Recompute running balanceAfter for every affected material
    // (includes removed-component materials discovered during rebuild)
    for (const matId of allAffectedMatIds) {
      try {
        await this.recomputeBalanceAfterForMaterial(matId);
      } catch (err) {
        errors.push(`Balance recompute material #${matId}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // 9. Reconcile stock_balances table to match ledger totals
    await this.reconcileStockBalancesFromLedger();

    return {
      fromDateTime,
      dispatches: affectedDispatches.length,
      ledgerRowsDeleted,
      ledgerRowsCreated,
      errors,
    };
  }

  async recalculateAllDispatchConsumption(): Promise<{ updated: number; errors: number; varianceFixed: number }> {
    let updated = 0;
    let errors = 0;
    let varianceFixed = 0;
    
    const allDispatches = await db.select().from(truckDispatches);
    const templates = await db.select().from(mixTemplates);
    const templateMap = new Map(templates.map(t => [t.id, t]));
    
    for (const dispatch of allDispatches) {
      try {
        const template = templateMap.get(dispatch.mixTemplateId);
        if (!template) continue;
        
        const theoreticalBitumenPercent = template.bitumenPercent || 0;
        const theoreticalBitumenQty = (dispatch.loadWeight * theoreticalBitumenPercent) / 100;
        const ldoNorm = (template as any)?.ldoNorm || DEFAULT_LDO_NORM;
        const theoreticalLdoQty = dispatch.loadWeight * ldoNorm;
        
        const updateData: any = {
          theoreticalBitumenPercent,
          theoreticalBitumenQty,
          theoreticalLdoQty,
        };
        
        if (!dispatch.actualBitumenPercent) {
          updateData.actualBitumenPercent = theoreticalBitumenPercent;
        }
        if (!dispatch.actualLdoQty) {
          updateData.actualLdoQty = theoreticalLdoQty;
        }
        
        const finalActualBitumenPercent = dispatch.actualBitumenPercent || theoreticalBitumenPercent;
        const finalActualLdoQty = dispatch.actualLdoQty || theoreticalLdoQty;
        
        updateData.actualBitumenQty = (dispatch.loadWeight * finalActualBitumenPercent) / 100;
        
        const bitumenVariancePercent = theoreticalBitumenPercent > 0
          ? ((finalActualBitumenPercent - theoreticalBitumenPercent) / theoreticalBitumenPercent) * 100
          : 0;
        const ldoVariancePercent = theoreticalLdoQty > 0
          ? ((finalActualLdoQty - theoreticalLdoQty) / theoreticalLdoQty) * 100
          : 0;
        
        updateData.bitumenVariancePercent = Math.abs(bitumenVariancePercent) > 0.01 ? bitumenVariancePercent : null;
        updateData.ldoVariancePercent = Math.abs(ldoVariancePercent) > 0.01 ? ldoVariancePercent : null;
        
        const hadMissingVariance = (
          (dispatch.bitumenVariancePercent === null && updateData.bitumenVariancePercent !== null) ||
          (dispatch.ldoVariancePercent === null && updateData.ldoVariancePercent !== null)
        );
        
        await db.update(truckDispatches)
          .set(updateData)
          .where(eq(truckDispatches.id, dispatch.id));
        
        updated++;
        if (hadMissingVariance) varianceFixed++;
      } catch (err) {
        console.error(`Error updating dispatch ${dispatch.id}:`, err);
        errors++;
      }
    }
    
    return { updated, errors, varianceFixed };
  }

  // Create missing ledger entries for equipment usage diesel and clean up orphaned reversals
  async reconcileEquipmentUsageLedger(): Promise<{ created: number; skipped: number; errors: number; cleaned: number }> {
    let created = 0;
    let skipped = 0;
    let errors = 0;
    let cleaned = 0;

    try {
      // STEP 1: Clean up orphaned "Deleted issue reversal" adjustment entries
      // These were created when material issues were deleted, but if the same diesel
      // was re-entered via equipment usage, these reversals should be removed
      const reversalEntries = await db.select().from(stockLedger)
        .where(and(
          eq(stockLedger.transactionType, 'adjustment'),
          sql`${stockLedger.notes} LIKE '%Deleted issue%reversal%'`
        ));
      
      for (const entry of reversalEntries) {
        try {
          await db.delete(stockLedger).where(eq(stockLedger.id, entry.id));
          cleaned++;
          console.log(`Cleaned up orphaned reversal entry #${entry.id}: ${entry.notes}`);
        } catch (err) {
          console.error(`Error cleaning reversal entry ${entry.id}:`, err);
        }
      }

      // STEP 2: Get diesel material
      const [dieselMaterial] = await db.select().from(plantMaterials)
        .where(sql`LOWER(${plantMaterials.name}) = 'diesel'`)
        .limit(1);
      
      if (!dieselMaterial) {
        console.error('Diesel material not found');
        return { created: 0, skipped: 0, errors: 1, cleaned };
      }

      // Get HLC party
      const [hlcParty] = await db.select().from(parties)
        .where(sql`UPPER(TRIM(${parties.name})) = 'HLC'`)
        .limit(1);
      const hlcPartyId = hlcParty?.id || null;

      // Get all equipment usage entries with diesel issued > 0 and not contractor-provided
      const usageEntries = await db.select({
        usage: equipmentUsage,
        equipment: equipmentMaster,
      })
        .from(equipmentUsage)
        .leftJoin(equipmentMaster, eq(equipmentUsage.equipmentId, equipmentMaster.id))
        .where(and(
          sql`${equipmentUsage.dieselIssued} > 0`,
          sql`(${equipmentUsage.dieselIncluded} IS NULL OR ${equipmentUsage.dieselIncluded} = false)`
        ));

      // Get existing equipment_usage ledger entries
      const existingLedgerEntries = await db.select().from(stockLedger)
        .where(eq(stockLedger.transactionType, 'equipment_usage'));
      
      const existingRefIds = new Set(existingLedgerEntries.map(e => e.referenceId));

      for (const { usage, equipment } of usageEntries) {
        try {
          // Skip if ledger entry already exists
          if (existingRefIds.has(usage.id)) {
            skipped++;
            continue;
          }

          const dieselIssued = usage.dieselIssued || 0;
          if (dieselIssued <= 0) {
            skipped++;
            continue;
          }

          // Create ledger entry (don't update stock balance here - will reconcile after)
          await db.insert(stockLedger).values({
            date: usage.date,
            partyId: hlcPartyId,
            materialId: dieselMaterial.id,
            transactionType: "equipment_usage",
            referenceId: usage.id,
            quantityOut: dieselIssued,
            balanceAfter: 0, // Will be recalculated by reconciliation
            uom: dieselMaterial.defaultUom || 'Liters',
            notes: `Diesel issued to ${equipment?.name || 'Equipment'} (backfilled)`,
          });

          created++;
        } catch (err) {
          console.error(`Error creating ledger entry for usage ${usage.id}:`, err);
          errors++;
        }
      }

    } catch (err) {
      console.error('Error in reconcileEquipmentUsageLedger:', err);
      errors++;
    }

    return { created, skipped, errors, cleaned };
  }

  async purgeOrphanedDeletionReversals(): Promise<{ removed: number }> {
    let removed = 0;
    try {
      const orphans = await db.select({ id: stockLedger.id }).from(stockLedger)
        .where(and(
          eq(stockLedger.transactionType, 'adjustment'),
          sql`${stockLedger.notes} ~ 'Deleted (opening stock|issue|return) #[0-9]+ reversal'`
        ));
      for (const row of orphans) {
        await db.delete(stockLedger).where(eq(stockLedger.id, row.id));
        removed++;
      }
      if (removed > 0) {
        console.log(`purgeOrphanedDeletionReversals: removed ${removed} erroneous reversal ledger entries`);
      }
    } catch (err) {
      console.error('purgeOrphanedDeletionReversals failed:', err);
    }
    return { removed };
  }

  // Reconcile stock balances from ledger entries (excludes legacy equipment_issue)
  async previewLedgerForReassignment(opts: {
    materialId: number;
    fromPartyId: number;
    dateFrom?: string;
    dateTo?: string;
    transactionType?: string;
  }) {
    const conds: any[] = [
      eq(stockLedger.materialId, opts.materialId),
      eq(stockLedger.partyId, opts.fromPartyId),
    ];
    if (opts.dateFrom) conds.push(gte(stockLedger.date, opts.dateFrom));
    if (opts.dateTo) conds.push(lte(stockLedger.date, opts.dateTo));
    if (opts.transactionType) conds.push(eq(stockLedger.transactionType, opts.transactionType));

    const rows = await db.select({
      id: stockLedger.id,
      date: stockLedger.date,
      transactionType: stockLedger.transactionType,
      quantityIn: stockLedger.quantityIn,
      quantityOut: stockLedger.quantityOut,
      uom: stockLedger.uom,
      notes: stockLedger.notes,
    }).from(stockLedger).where(and(...conds)).orderBy(asc(stockLedger.date), asc(stockLedger.id));
    return rows;
  }

  async executeLedgerReassignment(opts: {
    materialId: number;
    fromPartyId: number;
    toPartyId: number;
    dateFrom?: string;
    dateTo?: string;
    transactionType?: string;
  }) {
    const conds: any[] = [
      eq(stockLedger.materialId, opts.materialId),
      eq(stockLedger.partyId, opts.fromPartyId),
    ];
    if (opts.dateFrom) conds.push(gte(stockLedger.date, opts.dateFrom));
    if (opts.dateTo) conds.push(lte(stockLedger.date, opts.dateTo));
    if (opts.transactionType) conds.push(eq(stockLedger.transactionType, opts.transactionType));

    // Read first so we can return totals
    const matched = await db.select().from(stockLedger).where(and(...conds));
    const totalIn = matched.reduce((s, r) => s + (r.quantityIn || 0), 0);
    const totalOut = matched.reduce((s, r) => s + (r.quantityOut || 0), 0);

    if (matched.length === 0) {
      return { moved: 0, totalIn: 0, totalOut: 0, reconciled: { updated: 0, created: 0, errors: 0 } };
    }

    // Append a marker note so the audit trail makes the move visible
    const stamp = new Date().toISOString().slice(0, 19).replace("T", " ");
    const moveNote = `[Reassigned ${opts.fromPartyId}→${opts.toPartyId} on ${stamp}]`;

    await db.update(stockLedger)
      .set({
        partyId: opts.toPartyId,
        notes: sql`COALESCE(${stockLedger.notes}, '') || ' ' || ${moveNote}`,
      })
      .where(and(...conds));

    // Recompute the historical `balance_after` column for the affected material
    // so the dispatch/movement history reads correctly under the new owner.
    await this.recomputeBalanceAfterForMaterial(opts.materialId);

    // Now recompute balances from ledger so per-party totals reflect the move.
    const reconciled = await this.reconcileStockBalancesFromLedger();

    return { moved: matched.length, totalIn, totalOut, reconciled };
  }

  // Create a forward inter-party stock transfer (e.g. returning borrowed material to HLC).
  // Writes two ledger rows in a transaction, then reconciles balances.
  async createStockTransfer(opts: {
    materialId: number;
    fromPartyId: number;
    toPartyId: number;
    quantity: number;
    date: string;
    notes?: string;
    actorName?: string;
  }): Promise<{ outEntry: StockLedgerEntry; inEntry: StockLedgerEntry; reconciled: { updated: number; created: number; errors: number } }> {
    const { materialId, fromPartyId, toPartyId, quantity, date, notes, actorName } = opts;

    // Resolve UOM from material master
    const [material] = await db.select().from(plantMaterials).where(eq(plantMaterials.id, materialId));
    const uom = material?.defaultUom || "MT";

    // Resolve party names for audit notes
    const [fromParty] = await db.select().from(parties).where(eq(parties.id, fromPartyId));
    const [toParty] = await db.select().from(parties).where(eq(parties.id, toPartyId));
    const fromName = fromParty?.name || `Party ${fromPartyId}`;
    const toName = toParty?.name || `Party ${toPartyId}`;
    const stamp = new Date().toISOString().slice(0, 19).replace("T", " ");
    const actorTag = actorName ? ` by ${actorName}` : "";

    const [outRow, inRow] = await db.transaction(async (tx) => {
      const [out] = await tx.insert(stockLedger).values({
        date,
        partyId: fromPartyId,
        materialId,
        transactionType: "transfer",
        quantityIn: 0,
        quantityOut: quantity,
        uom,
        notes: `Transfer → ${toName}${actorTag} [${stamp}]${notes ? `: ${notes}` : ""}`,
      }).returning();

      const [ins] = await tx.insert(stockLedger).values({
        date,
        partyId: toPartyId,
        materialId,
        transactionType: "transfer",
        quantityIn: quantity,
        quantityOut: 0,
        uom,
        notes: `Transfer from ${fromName}${actorTag} [${stamp}]${notes ? `: ${notes}` : ""}`,
      }).returning();

      return [out, ins];
    });

    await this.recomputeBalanceAfterForMaterial(materialId);
    const reconciled = await this.reconcileStockBalancesFromLedger();

    return { outEntry: outRow, inEntry: inRow, reconciled };
  }

  // Rewrites the running `balance_after` column on stock_ledger chronologically,
  // partitioned by (party_id, material_id). Safe to call at any time.
  async recomputeBalanceAfterForMaterial(materialId: number): Promise<{ updated: number }> {
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
    return { updated: (result as { rowCount?: number }).rowCount ?? 0 };
  }

  async reconcileStockBalancesFromLedger(): Promise<{ updated: number; created: number; errors: number }> {
    let updated = 0;
    let created = 0;
    let errors = 0;

    try {
      // Get all ledger entries excluding legacy equipment_issue
      const ledgerEntries = await db.select().from(stockLedger)
        .where(sql`${stockLedger.transactionType} != 'equipment_issue'`);

      // Calculate balance for each material-party combination.
      // All transaction types use (quantityIn - quantityOut) which covers:
      //   opening, receipt, adjustment → quantityIn set, quantityOut 0
      //   return                       → quantityIn set (material back in stock)
      //   dispatch, issue, equipment_usage → quantityOut set, quantityIn 0
      const balanceMap = new Map<string, { materialId: number; partyId: number | null; balance: number; uom: string }>();

      for (const entry of ledgerEntries) {
        const key = `${entry.materialId}-${entry.partyId ?? 'null'}`;
        const existing = balanceMap.get(key);
        const quantityIn = entry.quantityIn || 0;
        const quantityOut = entry.quantityOut || 0;
        const netChange = quantityIn - quantityOut;

        if (existing) {
          existing.balance += netChange;
        } else {
          balanceMap.set(key, {
            materialId: entry.materialId,
            partyId: entry.partyId,
            balance: netChange,
            uom: entry.uom || 'Units',
          });
        }
      }

      // Round balances to eliminate floating-point accumulation errors (e.g. 1.14e-13 → 0)
      for (const data of Array.from(balanceMap.values())) {
        data.balance = Math.round(data.balance * 1e9) / 1e9;
        if (Math.abs(data.balance) < 1e-9) data.balance = 0;
      }

      // Update stock_balances table to match calculated values
      for (const data of Array.from(balanceMap.values())) {
        try {
          const condition = data.partyId === null
            ? and(sql`${stockBalances.partyId} IS NULL`, eq(stockBalances.materialId, data.materialId))
            : and(eq(stockBalances.partyId, data.partyId), eq(stockBalances.materialId, data.materialId));

          const [existing] = await db.select().from(stockBalances).where(condition).limit(1);

          if (existing) {
            await db.update(stockBalances)
              .set({ balance: data.balance, uom: data.uom, lastUpdated: new Date() })
              .where(eq(stockBalances.id, existing.id));
            updated++;
          } else {
            await db.insert(stockBalances).values({
              materialId: data.materialId,
              partyId: data.partyId,
              balance: data.balance,
              uom: data.uom,
            });
            created++;
          }
        } catch (err) {
          console.error(`Error reconciling balance for material ${data.materialId}, party ${data.partyId}:`, err);
          errors++;
        }
      }

      // Delete legacy equipment_issue entries from ledger (clean up)
      await db.delete(stockLedger).where(eq(stockLedger.transactionType, 'equipment_issue'));

    } catch (err) {
      console.error('Error in reconcileStockBalancesFromLedger:', err);
      errors++;
    }

    return { updated, created, errors };
  }

  async applyLedgerGapFix427(): Promise<{ alreadyApplied: boolean; markersInserted: number; hlcEntriesUpdated: number; reconciled: { updated: number; created: number; errors: number } }> {
    // Constants for this fix
    const LAXMI_PARTY_ID = 6;
    const HLC_PARTY_ID   = 1;
    const MAT_6MM_DOWN   = 3;
    const DISPATCH_49    = 49;
    const DISPATCH_50    = 50;
    const HLC_ENTRY_49   = 20415; // quantity_out was 12.32, correct is 11
    const HLC_ENTRY_50   = 20434; // quantity_out was 14.85, correct is 7.5

    // Guard: if LAXMI party doesn't exist in this environment, skip (non-production env)
    const [laxmiParty] = await db.select({ id: parties.id, name: parties.name })
      .from(parties).where(eq(parties.id, LAXMI_PARTY_ID)).limit(1);
    if (!laxmiParty) {
      return { alreadyApplied: true, markersInserted: 0, hlcEntriesUpdated: 0, reconciled: { updated: 0, created: 0, errors: 0 } };
    }
    const laxmiName = laxmiParty.name;

    // ── Step A: LAXMI 0-qty marker rows ────────────────────────────────────────
    // Check independently for each dispatch so reruns always converge even if only
    // one marker was inserted in a previous partial run.
    const existingMarkers = await db.select({ referenceId: stockLedger.referenceId })
      .from(stockLedger)
      .where(and(
        eq(stockLedger.partyId, LAXMI_PARTY_ID),
        eq(stockLedger.materialId, MAT_6MM_DOWN),
        eq(stockLedger.transactionType, 'dispatch'),
        eq(stockLedger.quantityOut, 0),
        inArray(stockLedger.referenceId, [DISPATCH_49, DISPATCH_50]),
      ));
    const existingMarkerRefs = new Set(existingMarkers.map(e => e.referenceId));

    let markersInserted = 0;
    for (const dispatchId of [DISPATCH_49, DISPATCH_50]) {
      if (!existingMarkerRefs.has(dispatchId)) {
        await db.insert(stockLedger).values({
          date: '2026-04-28',
          partyId: LAXMI_PARTY_ID,
          materialId: MAT_6MM_DOWN,
          transactionType: 'dispatch',
          quantityOut: 0,
          balanceAfter: 0,
          uom: 'Ton',
          notes: `Aggregate dispatch (${laxmiName})`,
          referenceId: dispatchId,
        });
        markersInserted++;
      }
    }

    // ── Step B: HLC borrow entry corrections ───────────────────────────────────
    // Always check the current state of each HLC entry and update if qty or
    // referenceId is still wrong — independent of whether markers were inserted.
    const hlcWanted: { id: number; qty: number; refId: number }[] = [
      { id: HLC_ENTRY_49, qty: 11,  refId: DISPATCH_49 },
      { id: HLC_ENTRY_50, qty: 7.5, refId: DISPATCH_50 },
    ];
    let hlcEntriesUpdated = 0;
    for (const u of hlcWanted) {
      // Only update when at least one field still differs — keeps rowCount and
      // "alreadyApplied" truthful on repeated calls.
      const res = await db.update(stockLedger)
        .set({ quantityOut: u.qty, referenceId: u.refId })
        .where(and(
          eq(stockLedger.id, u.id),
          eq(stockLedger.partyId, HLC_PARTY_ID),
          eq(stockLedger.materialId, MAT_6MM_DOWN),
          sql`(${stockLedger.quantityOut} IS DISTINCT FROM ${u.qty}
            OR ${stockLedger.referenceId} IS DISTINCT FROM ${u.refId})`,
        ));
      hlcEntriesUpdated += (res as { rowCount?: number }).rowCount ?? 0;
    }

    const alreadyApplied = markersInserted === 0 && hlcEntriesUpdated === 0;

    // Recompute balance_after for 6mm Down rows then update stock_balances for
    // material_id=3 only — avoids the heavier global reconcile with side-effects.
    await this.recomputeBalanceAfterForMaterial(MAT_6MM_DOWN);
    const reconcileResult = await db.execute(sql`
      WITH ledger_totals AS (
        SELECT party_id,
          ROUND(SUM(COALESCE(quantity_in, 0) - COALESCE(quantity_out, 0))::numeric, 6) AS balance
        FROM stock_ledger
        WHERE material_id = ${MAT_6MM_DOWN}
          AND transaction_type != 'equipment_issue'
        GROUP BY party_id
      )
      UPDATE stock_balances sb
      SET balance = lt.balance,
          last_updated = NOW()
      FROM ledger_totals lt
      WHERE sb.material_id = ${MAT_6MM_DOWN}
        AND sb.party_id IS NOT DISTINCT FROM lt.party_id
        AND sb.balance IS DISTINCT FROM lt.balance
    `);
    const reconciled = {
      updated: (reconcileResult as { rowCount?: number }).rowCount ?? 0,
      created: 0,
      errors: 0,
    };

    return { alreadyApplied, markersInserted, hlcEntriesUpdated, reconciled };
  }

  async migrateOrphanStockToHLC(): Promise<{ ledgerFixed: number; balancesMerged: number; errors: number }> {
    let ledgerFixed = 0;
    let balancesMerged = 0;
    let errors = 0;

    try {
      const orphanLedgerEntries = await db.select().from(stockLedger)
        .where(sql`${stockLedger.partyId} IS NULL`);

      if (orphanLedgerEntries.length === 0) {
        const orphanBalances = await db.select().from(stockBalances)
          .where(sql`${stockBalances.partyId} IS NULL`);
        if (orphanBalances.length === 0) {
          return { ledgerFixed: 0, balancesMerged: 0, errors: 0 };
        }
      }

      const allParties = await db.select().from(parties).orderBy(parties.id);
      let hlcParty = allParties.find(p => p.name?.toUpperCase() === 'HLC');
      if (!hlcParty) {
        hlcParty = allParties[0];
      }
      if (!hlcParty) {
        console.error('migrateOrphanStockToHLC: No parties exist, cannot migrate');
        return { ledgerFixed: 0, balancesMerged: 0, errors: 1 };
      }
      const hlcId = hlcParty.id;
      console.log(`migrateOrphanStockToHLC: Using party "${hlcParty.name}" (id=${hlcId}) as target`);

      if (orphanLedgerEntries.length > 0) {
        await db.update(stockLedger)
          .set({ partyId: hlcId })
          .where(sql`${stockLedger.partyId} IS NULL`);
        ledgerFixed = orphanLedgerEntries.length;
      }

      const orphanBalances = await db.select().from(stockBalances)
        .where(sql`${stockBalances.partyId} IS NULL`);
      for (const orphan of orphanBalances) {
        await db.delete(stockBalances).where(eq(stockBalances.id, orphan.id));
        balancesMerged++;
      }

      const recalcResult = await this.reconcileStockBalancesFromLedger();
      console.log(`migrateOrphanStockToHLC: Reconciled balances - updated: ${recalcResult.updated}, created: ${recalcResult.created}`);

    } catch (err) {
      console.error('migrateOrphanStockToHLC: Fatal error:', err);
      errors++;
    }

    return { ledgerFixed, balancesMerged, errors };
  }

  async cleanupSupersededDprDieselLedger(): Promise<{ removed: number; errors: number }> {
    let removed = 0;
    let errors = 0;

    try {
      const allDprs = await db.select().from(dprs).orderBy(desc(dprs.date));
      
      const latestByKey = new Map<string, number>();
      const supersededDprIds: number[] = [];

      for (const dpr of allDprs) {
        const baseSite = this.getBaseSiteName(dpr.site);
        const key = `${baseSite}|${dpr.date}`;
        const existingId = latestByKey.get(key);
        if (!existingId) {
          latestByKey.set(key, dpr.id);
        } else if (dpr.id > existingId) {
          supersededDprIds.push(existingId);
          latestByKey.set(key, dpr.id);
        } else {
          supersededDprIds.push(dpr.id);
        }
      }

      if (supersededDprIds.length === 0) {
        return { removed: 0, errors: 0 };
      }

      for (const dprId of supersededDprIds) {
        try {
          const eqLogs = await db.select().from(equipmentLogs)
            .where(eq(equipmentLogs.dprId, dprId));

          const dieselLogs = eqLogs.filter(
            (e: any) => e.diesel && e.diesel > 0 && e.dieselSource === 'direct_purchase'
          );

          for (const eLog of dieselLogs) {
            const equipLogRefId = -eLog.id;
            const deleted = await db.delete(stockLedger).where(
              and(
                eq(stockLedger.transactionType, 'direct_purchase'),
                eq(stockLedger.referenceId, equipLogRefId)
              )
            ).returning();
            removed += deleted.length;
          }
        } catch (err) {
          console.error(`cleanupSupersededDprDieselLedger: Error processing DPR ${dprId}:`, err);
          errors++;
        }
      }

      if (removed > 0) {
        await this.reconcileStockBalancesFromLedger();
      }

    } catch (err) {
      console.error('cleanupSupersededDprDieselLedger: Fatal error:', err);
      errors++;
    }

    return { removed, errors };
  }

  async repairMissingSitePurchases(): Promise<{ repaired: number; errors: number }> {
    let repaired = 0;
    let errors = 0;

    try {
      const allDprs = await db.select({
        id: dprs.id,
        date: dprs.date,
        site: dprs.site,
      }).from(dprs).orderBy(desc(dprs.id));

      const groupedByKey = new Map<string, number[]>();
      for (const dpr of allDprs) {
        const baseSite = this.getBaseSiteName(dpr.site);
        const key = `${baseSite}|${dpr.date}`;
        if (!groupedByKey.has(key)) {
          groupedByKey.set(key, []);
        }
        groupedByKey.get(key)!.push(dpr.id);
      }

      for (const [key, ids] of Array.from(groupedByKey.entries())) {
        if (ids.length < 2) continue;

        const latestId = ids[0];
        const olderIds = ids.slice(1);

        const latestPurchases = await db.select().from(sitePurchases)
          .where(eq(sitePurchases.dprId, latestId));

        if (latestPurchases.length > 0) continue;

        for (const olderId of olderIds) {
          const olderPurchases = await db.select().from(sitePurchases)
            .where(eq(sitePurchases.dprId, olderId));

          if (olderPurchases.length > 0) {
            try {
              await db.insert(sitePurchases).values(
                olderPurchases.map(sp => ({
                  dprId: latestId,
                  itemDescription: sp.itemDescription,
                  quantity: sp.quantity,
                  uom: sp.uom,
                  vendor: sp.vendor,
                  billNo: sp.billNo,
                  amount: sp.amount,
                }))
              );
              repaired += olderPurchases.length;
              console.log(`repairMissingSitePurchases: Copied ${olderPurchases.length} purchases from DPR ${olderId} to latest DPR ${latestId} (${key})`);
            } catch (err) {
              console.error(`repairMissingSitePurchases: Error copying purchases for ${key}:`, err);
              errors++;
            }
            break;
          }
        }
      }
    } catch (err) {
      console.error('repairMissingSitePurchases: Fatal error:', err);
      errors++;
    }

    return { repaired, errors };
  }

  async repairLostDieselSource(): Promise<{ repaired: number; ledgerCreated: number; errors: number }> {
    let repaired = 0;
    let ledgerCreated = 0;
    let errors = 0;

    try {
      const allVersions = await db.select({
        originalDprId: dprVersions.originalDprId,
        versionDprId: dprVersions.dprId,
      }).from(dprVersions);

      const originalIds = Array.from(new Set(allVersions.map(v => v.originalDprId)));

      for (const originalId of originalIds) {
        try {
          const originalEquipLogs = await db.select().from(equipmentLogs)
            .where(and(
              eq(equipmentLogs.dprId, originalId),
              eq(equipmentLogs.dieselSource, 'direct_purchase'),
              gt(equipmentLogs.diesel, 0)
            ));

          if (originalEquipLogs.length === 0) continue;

          let latestVersionId = originalId;
          let foundChild = true;
          while (foundChild) {
            const children = allVersions
              .filter(v => v.originalDprId === latestVersionId)
              .sort((a, b) => b.versionDprId - a.versionDprId);
            if (children.length > 0) {
              latestVersionId = children[0].versionDprId;
            } else {
              foundChild = false;
            }
          }

          if (latestVersionId === originalId) continue;

          const latestEquipLogs = await db.select().from(equipmentLogs)
            .where(eq(equipmentLogs.dprId, latestVersionId));

          const matchPairs: Array<{ origLog: typeof originalEquipLogs[0]; latestLog: typeof latestEquipLogs[0] }> = [];
          const usedLatestIds = new Set<number>();

          for (const origLog of originalEquipLogs) {
            const matchingLatest = latestEquipLogs.find(
              l => l.machine === origLog.machine
                && l.diesel === origLog.diesel
                && l.dieselSource !== 'direct_purchase'
                && (l.operator || null) === (origLog.operator || null)
                && (l.task || null) === (origLog.task || null)
                && !usedLatestIds.has(l.id)
            );
            if (matchingLatest) {
              matchPairs.push({ origLog, latestLog: matchingLatest });
              usedLatestIds.add(matchingLatest.id);
            }
          }

          if (matchPairs.length === 0) continue;

          const latestDpr = await db.select().from(dprs).where(eq(dprs.id, latestVersionId)).limit(1);
          if (latestDpr.length === 0) continue;

          await db.transaction(async (tx) => {
            for (const { origLog, latestLog } of matchPairs) {
              await tx.update(equipmentLogs)
                .set({
                  dieselSource: 'direct_purchase',
                  fuelStation: origLog.fuelStation,
                  billNumber: origLog.billNumber,
                  amountPaid: origLog.amountPaid,
                })
                .where(eq(equipmentLogs.id, latestLog.id));

              repaired++;
              console.log(`repairLostDieselSource: Restored direct_purchase for equipment log ${latestLog.id} (${latestLog.machine}) in DPR ${latestVersionId}, copied from original log ${origLog.id} in DPR ${originalId}`);
            }

            await this.cleanupDprEquipmentDieselLedger(tx, latestVersionId);

            const updatedLogs = await tx.select().from(equipmentLogs)
              .where(and(
                eq(equipmentLogs.dprId, latestVersionId),
                eq(equipmentLogs.dieselSource, 'direct_purchase'),
                gt(equipmentLogs.diesel, 0)
              ));

            if (updatedLogs.length > 0) {
              await this.processDprEquipmentDieselLedger(tx, updatedLogs, latestDpr[0].date, latestDpr[0].site);
              ledgerCreated += updatedLogs.length;
              console.log(`repairLostDieselSource: Created ${updatedLogs.length} stock ledger entries for DPR ${latestVersionId} (date: ${latestDpr[0].date})`);
            }
          });
        } catch (err) {
          console.error(`repairLostDieselSource: Error processing original DPR ${originalId}:`, err);
          errors++;
        }
      }
    } catch (err) {
      console.error('repairLostDieselSource: Fatal error:', err);
      errors++;
    }

    return { repaired, ledgerCreated, errors };
  }

  async migrateDprPlantStockDieselToLedger(): Promise<{ created: number; skipped: number; overlapped: number; errors: number }> {
    const DPR_DIESEL_CUTOFF_DATE = '2026-02-01';
    let created = 0;
    let skipped = 0;
    let overlapped = 0;
    let errors = 0;

    try {
      const [dieselMaterial] = await db.select().from(plantMaterials)
        .where(sql`LOWER(${plantMaterials.name}) = 'diesel'`)
        .limit(1);
      if (!dieselMaterial) {
        console.log('migrateDprPlantStockDieselToLedger: No diesel material found, skipping');
        return { created, skipped, overlapped, errors };
      }

      const allPartiesForMigration = await db.select().from(parties).orderBy(parties.id);
      let hlcParty = allPartiesForMigration.find(p => p.name?.toUpperCase() === 'HLC');
      if (!hlcParty) hlcParty = allPartiesForMigration.find(p => p.name?.toUpperCase().includes('HLC') || p.name?.toUpperCase().includes('HIGH LANE'));
      if (!hlcParty) hlcParty = allPartiesForMigration[0];
      const hlcPartyId = hlcParty?.id || null;

      const existingDprUsageEntries = await db.select({ id: stockLedger.id })
        .from(stockLedger)
        .where(eq(stockLedger.transactionType, 'dpr_equipment_usage'));

      if (existingDprUsageEntries.length > 0) {
        await db.delete(stockLedger).where(eq(stockLedger.transactionType, 'dpr_equipment_usage'));
        console.log(`migrateDprPlantStockDieselToLedger: Cleaned up ${existingDprUsageEntries.length} old dpr_equipment_usage entries for fresh re-migration`);
        const orphanBalances = await db.select().from(stockBalances)
          .where(and(
            sql`${stockBalances.partyId} IS NULL`,
            eq(stockBalances.materialId, dieselMaterial.id)
          ));
        for (const ob of orphanBalances) {
          await db.delete(stockBalances).where(eq(stockBalances.id, ob.id));
        }
      }

      const allPlantStockLogs = await db.select({
        id: equipmentLogs.id,
        dprId: equipmentLogs.dprId,
        machine: equipmentLogs.machine,
        diesel: equipmentLogs.diesel,
        dieselSource: equipmentLogs.dieselSource,
        equipmentId: equipmentLogs.equipmentId,
        date: dprs.date,
        site: dprs.site,
      }).from(equipmentLogs)
        .innerJoin(dprs, eq(dprs.id, equipmentLogs.dprId))
        .where(and(
          gt(equipmentLogs.diesel, 0),
          sql`(${equipmentLogs.dieselSource} = 'plant_stock' OR ${equipmentLogs.dieselSource} IS NULL)`,
          sql`${dprs.date} >= ${DPR_DIESEL_CUTOFF_DATE}`
        ))
        .orderBy(dprs.date);

      if (allPlantStockLogs.length === 0) {
        console.log(`migrateDprPlantStockDieselToLedger: No plant_stock DPR equipment logs found on or after ${DPR_DIESEL_CUTOFF_DATE}`);
        await this.reconcileStockBalancesFromLedger();
        return { created, skipped, overlapped, errors };
      }

      const allVersions = await db.select({
        originalDprId: dprVersions.originalDprId,
        dprId: dprVersions.dprId,
      }).from(dprVersions);

      const allVersionedIds = new Set<number>();
      const childToParent = new Map<number, number>();
      for (const v of allVersions) {
        allVersionedIds.add(v.originalDprId);
        allVersionedIds.add(v.dprId);
        childToParent.set(v.dprId, v.originalDprId);
      }

      const findRoot = (dprId: number): number => {
        let current = dprId;
        const visited = new Set<number>();
        while (childToParent.has(current) && !visited.has(current)) {
          visited.add(current);
          current = childToParent.get(current)!;
        }
        return current;
      };

      const rootToLeaves = new Map<number, number[]>();
      const originals = new Set(allVersions.map(v => v.originalDprId));
      for (const id of Array.from(allVersionedIds)) {
        if (!originals.has(id)) {
          const root = findRoot(id);
          if (!rootToLeaves.has(root)) {
            rootToLeaves.set(root, []);
          }
          rootToLeaves.get(root)!.push(id);
        }
      }

      const supersededDprIds = new Set<number>();
      for (const id of Array.from(allVersionedIds)) {
        supersededDprIds.add(id);
      }
      for (const leaves of Array.from(rootToLeaves.values())) {
        const latestLeaf = Math.max(...leaves);
        supersededDprIds.delete(latestLeaf);
      }

      for (const log of allPlantStockLogs) {
        try {
          if (supersededDprIds.has(log.dprId)) {
            skipped++;
            continue;
          }

          const dieselAmt = log.diesel || 0;
          const siteName = (log.site || '').replace(/ – Edited by .*$/, '');

          await db.insert(stockLedger).values({
            date: log.date,
            partyId: hlcPartyId,
            materialId: dieselMaterial.id,
            transactionType: "dpr_equipment_usage",
            referenceId: -log.id,
            quantityOut: dieselAmt,
            balanceAfter: null,
            uom: dieselMaterial.defaultUom || 'Liters',
            notes: `DPR diesel issued to ${log.machine || 'Equipment'} at ${siteName}`,
          });

          created++;
        } catch (err) {
          console.error(`migrateDprPlantStockDieselToLedger: Error processing equip log ${log.id}:`, err);
          errors++;
        }
      }

      await this.reconcileStockBalancesFromLedger();
      console.log(`migrateDprPlantStockDieselToLedger: Summary (cutoff: ${DPR_DIESEL_CUTOFF_DATE}) - created: ${created}, skipped: ${skipped} (superseded versions), errors: ${errors}`);
    } catch (err) {
      console.error('migrateDprPlantStockDieselToLedger: Fatal error:', err);
      errors++;
    }

    return { created, skipped, overlapped, errors };
  }

  async getSiteMaterialLogs(filters?: { site?: string; material?: string; dateFrom?: string; dateTo?: string }): Promise<{
    id: number;
    dprId: number;
    date: string;
    site: string;
    type: string;
    material: string;
    quantity: number | null;
    uom: string | null;
    supplier: string | null;
    vehicleNumber: string | null;
    location: string | null;
    receiptNumber: string | null;
  }[]> {
    // First, get only the latest version of each DPR (same logic as getDprs)
    const allDprs = await db.select().from(dprs).orderBy(desc(dprs.date));
    
    // Deduplicate by base site name + date, keeping only the latest version
    const latestDprIds = new Set<number>();
    const latestByKey = new Map<string, { id: number }>();
    
    for (const dpr of allDprs) {
      const baseSite = this.getBaseSiteName(dpr.site);
      const key = `${baseSite}|${dpr.date}`;
      const existing = latestByKey.get(key);
      if (!existing) {
        latestByKey.set(key, { id: dpr.id });
      } else if (dpr.id > existing.id) {
        // Higher ID = newer version
        latestByKey.set(key, { id: dpr.id });
      }
    }
    
    // Collect only the latest DPR IDs
    Array.from(latestByKey.values()).forEach(entry => {
      latestDprIds.add(entry.id);
    });
    
    // Now query materials only from latest DPRs
    let conditions: any[] = [];
    
    if (filters?.site) {
      // For site filter, we need to match against base site name
      // Get DPR IDs that match the site filter (using base site name matching)
      const matchingDprIds: number[] = [];
      for (const dpr of allDprs) {
        if (latestDprIds.has(dpr.id)) {
          const baseSite = this.getBaseSiteName(dpr.site);
          if (baseSite === filters.site || dpr.site === filters.site) {
            matchingDprIds.push(dpr.id);
          }
        }
      }
      if (matchingDprIds.length === 0) {
        return []; // No matching DPRs
      }
      conditions.push(sql`${materialLogs.dprId} IN (${sql.join(matchingDprIds.map(id => sql`${id}`), sql`, `)})`);
    } else {
      // Filter to only latest DPRs
      const latestIds = Array.from(latestDprIds);
      if (latestIds.length === 0) {
        return [];
      }
      conditions.push(sql`${materialLogs.dprId} IN (${sql.join(latestIds.map(id => sql`${id}`), sql`, `)})`);
    }
    
    if (filters?.material) conditions.push(eq(materialLogs.material, filters.material));
    if (filters?.dateFrom) conditions.push(gte(dprs.date, filters.dateFrom));
    if (filters?.dateTo) conditions.push(lte(dprs.date, filters.dateTo));

    const query = db
      .select({
        id: materialLogs.id,
        dprId: materialLogs.dprId,
        date: dprs.date,
        site: dprs.site,
        type: materialLogs.type,
        material: materialLogs.material,
        quantity: materialLogs.quantity,
        uom: materialLogs.uom,
        supplier: materialLogs.supplier,
        vehicleNumber: materialLogs.vehicleNumber,
        location: materialLogs.location,
        receiptNumber: materialLogs.receiptNumber,
      })
      .from(materialLogs)
      .innerJoin(dprs, eq(materialLogs.dprId, dprs.id));

    const result = await query.where(and(...conditions)).orderBy(desc(dprs.date), desc(materialLogs.id));

    return result;
  }

  // Admin Notifications
  async getNotifications(): Promise<AdminNotification[]> {
    return await db.select().from(adminNotifications).orderBy(desc(adminNotifications.createdAt));
  }

  async getUnreadNotificationCount(): Promise<number> {
    const result = await db.select({ count: sql<number>`count(*)` })
      .from(adminNotifications)
      .where(eq(adminNotifications.isRead, 0));
    return result[0]?.count || 0;
  }

  async createNotification(data: InsertAdminNotification): Promise<AdminNotification> {
    const [notification] = await db.insert(adminNotifications).values(data).returning();
    return notification;
  }

  async markNotificationRead(id: number): Promise<void> {
    await db.update(adminNotifications).set({ isRead: 1 }).where(eq(adminNotifications.id, id));
  }

  async markAllNotificationsRead(): Promise<void> {
    await db.update(adminNotifications).set({ isRead: 1 }).where(eq(adminNotifications.isRead, 0));
  }

  async deleteNotification(id: number): Promise<void> {
    await db.delete(adminNotifications).where(eq(adminNotifications.id, id));
  }

  // Push Subscriptions
  async getAllPushSubscriptions(): Promise<PushSubscription[]> {
    return await db.select().from(pushSubscriptions);
  }

  async createPushSubscription(data: InsertPushSubscription): Promise<PushSubscription> {
    const [sub] = await db
      .insert(pushSubscriptions)
      .values(data)
      .onConflictDoUpdate({
        target: pushSubscriptions.endpoint,
        // Refresh on every re-subscribe so role/userId stay current.
        set: { p256dh: data.p256dh, auth: data.auth, label: data.label, role: data.role, userId: data.userId ?? null },
      })
      .returning();
    return sub;
  }

  async deletePushSubscriptionByEndpoint(endpoint: string): Promise<void> {
    await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint));
  }

  async deletePushSubscriptionsByUserId(userId: number): Promise<void> {
    await db.delete(pushSubscriptions).where(eq(pushSubscriptions.userId, userId));
  }

  // Returns subscriptions that should actually receive a push:
  // — subscriptions linked to a user with notificationsEnabled=true, OR
  // — legacy anonymous subscriptions (userId IS NULL) kept for back-compat.
  async getActivePushSubscriptions(): Promise<PushSubscription[]> {
    const all = await db.select().from(pushSubscriptions);
    if (all.length === 0) return [];
    // Collect the distinct userIds that have linked subscriptions.
    const linkedUserIds = [...new Set(all.filter(s => s.userId != null).map(s => s.userId as number))];
    let enabledUserIds: Set<number> = new Set();
    if (linkedUserIds.length > 0) {
      const rows = await db
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.notificationsEnabled, true), inArray(users.id, linkedUserIds)));
      enabledUserIds = new Set(rows.map(r => r.id));
    }
    return all.filter(s => s.userId == null || enabledUserIds.has(s.userId));
  }

  // ============================================
  // MATERIAL ISSUES IMPLEMENTATION
  // ============================================

  async getMaterialIssues(filters?: { partyId?: number; dateFrom?: string; dateTo?: string }): Promise<MaterialIssue[]> {
    let conditions = [];
    if (filters?.partyId !== undefined) {
      conditions.push(filters.partyId === null 
        ? sql`${materialIssues.partyId} IS NULL`
        : eq(materialIssues.partyId, filters.partyId));
    }
    if (filters?.dateFrom) conditions.push(gte(materialIssues.date, filters.dateFrom));
    if (filters?.dateTo) conditions.push(lte(materialIssues.date, filters.dateTo));
    
    return db.select().from(materialIssues)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(materialIssues.date));
  }

  async createMaterialIssue(issue: InsertMaterialIssue): Promise<MaterialIssue> {
    return db.transaction(async (tx) => {
      const uppercased = {
        ...issue,
        issuedTo: issue.issuedTo.toUpperCase(),
        vehicleNumber: issue.vehicleNumber?.toUpperCase(),
      };
      const [result] = await tx.insert(materialIssues).values(uppercased).returning();
      
      // Determine party ID for stock deduction
      const stockPartyId = issue.isPlantCommon ? null : issue.partyId;
      
      // Get material info for UOM conversion
      const [material] = await tx.select().from(plantMaterials).where(eq(plantMaterials.id, issue.materialId)).limit(1);
      
      // Apply UOM conversion if issue UOM differs from stock UOM
      let stockQuantity = issue.quantity;
      let stockUom = issue.uom;
      
      if (material?.conversionFactor && material?.conversionFromUom && material?.conversionToUom) {
        if (issue.uom.toUpperCase() === material.conversionFromUom.toUpperCase()) {
          stockQuantity = issue.quantity * material.conversionFactor;
          stockUom = material.conversionToUom;
        }
      }
      
      // Update stock balance (reduce)
      const condition = stockPartyId === null 
        ? and(sql`${stockBalances.partyId} IS NULL`, eq(stockBalances.materialId, issue.materialId))
        : and(eq(stockBalances.partyId, stockPartyId!), eq(stockBalances.materialId, issue.materialId));
      
      const [existing] = await tx.select().from(stockBalances).where(condition).limit(1);
      const newBalance = (existing?.balance || 0) - stockQuantity;
      
      if (existing) {
        await tx.update(stockBalances)
          .set({ balance: newBalance, lastUpdated: new Date() })
          .where(eq(stockBalances.id, existing.id));
      } else {
        await tx.insert(stockBalances).values({
          partyId: stockPartyId,
          materialId: issue.materialId,
          balance: newBalance,
          uom: stockUom,
        });
      }
      
      // Add ledger entry with converted quantity
      const conversionNote = stockQuantity !== issue.quantity
        ? `Issue to ${issue.issuedTo}${issue.purpose ? ` - ${issue.purpose}` : ''} (${issue.quantity} ${issue.uom} = ${stockQuantity.toFixed(3)} ${stockUom})`
        : `Issue to ${issue.issuedTo}${issue.purpose ? ` - ${issue.purpose}` : ''}`;
      
      await tx.insert(stockLedger).values({
        date: issue.date,
        partyId: stockPartyId,
        materialId: issue.materialId,
        transactionType: "issue",
        referenceId: result.id,
        quantityOut: stockQuantity,
        balanceAfter: newBalance,
        uom: stockUom,
        notes: conversionNote,
      });
      
      return result;
    });
  }

  async updateMaterialIssue(id: number, issue: Partial<InsertMaterialIssue>): Promise<MaterialIssue | undefined> {
    return db.transaction(async (tx) => {
      const [original] = await tx.select().from(materialIssues).where(eq(materialIssues.id, id)).limit(1);
      if (!original) return undefined;
      
      const updates: any = {};
      if (issue.date !== undefined) updates.date = issue.date;
      if (issue.time !== undefined) updates.time = issue.time;
      if (issue.partyId !== undefined) updates.partyId = issue.partyId;
      if (issue.isPlantCommon !== undefined) updates.isPlantCommon = issue.isPlantCommon;
      if (issue.materialId !== undefined) updates.materialId = issue.materialId;
      if (issue.quantity !== undefined) updates.quantity = issue.quantity;
      if (issue.uom !== undefined) updates.uom = issue.uom;
      if (issue.issuedTo !== undefined) updates.issuedTo = issue.issuedTo.toUpperCase();
      if (issue.purpose !== undefined) updates.purpose = issue.purpose;
      if (issue.vehicleNumber !== undefined) updates.vehicleNumber = issue.vehicleNumber?.toUpperCase();
      if (issue.notes !== undefined) updates.notes = issue.notes;
      
      // Get material info for UOM conversion (original material)
      const [origMaterial] = await tx.select().from(plantMaterials).where(eq(plantMaterials.id, original.materialId)).limit(1);
      
      // Calculate original stock quantity with conversion
      let origStockQuantity = original.quantity;
      if (origMaterial?.conversionFactor && origMaterial?.conversionFromUom && origMaterial?.conversionToUom) {
        if (original.uom.toUpperCase() === origMaterial.conversionFromUom.toUpperCase()) {
          origStockQuantity = original.quantity * origMaterial.conversionFactor;
        }
      }
      
      // Reverse original stock impact (add back the converted quantity)
      const originalStockPartyId = original.isPlantCommon ? null : original.partyId;
      const origCondition = originalStockPartyId === null 
        ? and(sql`${stockBalances.partyId} IS NULL`, eq(stockBalances.materialId, original.materialId))
        : and(eq(stockBalances.partyId, originalStockPartyId), eq(stockBalances.materialId, original.materialId));
      
      const [origBal] = await tx.select().from(stockBalances).where(origCondition).limit(1);
      if (origBal) {
        await tx.update(stockBalances)
          .set({ balance: origBal.balance + origStockQuantity, lastUpdated: new Date() })
          .where(eq(stockBalances.id, origBal.id));
      }
      
      // Update the issue record
      const [result] = await tx.update(materialIssues).set(updates).where(eq(materialIssues.id, id)).returning();
      
      // Apply new stock impact with conversion
      const newStockPartyId = (updates.isPlantCommon ?? original.isPlantCommon) ? null : (updates.partyId ?? original.partyId);
      const newMaterialId = updates.materialId ?? original.materialId;
      const newQuantity = updates.quantity ?? original.quantity;
      const newUom = updates.uom ?? original.uom;
      const newIssuedTo = updates.issuedTo ?? original.issuedTo;
      const newPurpose = updates.purpose ?? original.purpose;
      const newDate = updates.date ?? original.date;
      
      // Get material info for new material (may be different if material changed)
      const [newMaterial] = await tx.select().from(plantMaterials).where(eq(plantMaterials.id, newMaterialId)).limit(1);
      
      let newStockQuantity = newQuantity;
      let newStockUom = newUom;
      if (newMaterial?.conversionFactor && newMaterial?.conversionFromUom && newMaterial?.conversionToUom) {
        if (newUom.toUpperCase() === newMaterial.conversionFromUom.toUpperCase()) {
          newStockQuantity = newQuantity * newMaterial.conversionFactor;
          newStockUom = newMaterial.conversionToUom;
        }
      }
      
      const newCondition = newStockPartyId === null 
        ? and(sql`${stockBalances.partyId} IS NULL`, eq(stockBalances.materialId, newMaterialId))
        : and(eq(stockBalances.partyId, newStockPartyId), eq(stockBalances.materialId, newMaterialId));
      
      const [newBal] = await tx.select().from(stockBalances).where(newCondition).limit(1);
      const newBalance = (newBal?.balance || 0) - newStockQuantity;
      
      if (newBal) {
        await tx.update(stockBalances)
          .set({ balance: newBalance, lastUpdated: new Date() })
          .where(eq(stockBalances.id, newBal.id));
      } else {
        await tx.insert(stockBalances).values({
          partyId: newStockPartyId,
          materialId: newMaterialId,
          balance: newBalance,
          uom: newStockUom,
        });
      }
      
      // Delete old ledger entry and insert new one
      await tx.delete(stockLedger).where(
        and(eq(stockLedger.transactionType, "issue"), eq(stockLedger.referenceId, id))
      );
      
      const conversionNote = newStockQuantity !== newQuantity
        ? `Issue to ${newIssuedTo}${newPurpose ? ` - ${newPurpose}` : ''} (${newQuantity} ${newUom} = ${newStockQuantity.toFixed(3)} ${newStockUom})`
        : `Issue to ${newIssuedTo}${newPurpose ? ` - ${newPurpose}` : ''}`;
      
      await tx.insert(stockLedger).values({
        date: newDate,
        partyId: newStockPartyId,
        materialId: newMaterialId,
        transactionType: "issue",
        referenceId: result.id,
        quantityOut: newStockQuantity,
        balanceAfter: newBalance,
        uom: newStockUom,
        notes: conversionNote,
      });
      
      return result;
    });
  }

  async deleteMaterialIssue(id: number): Promise<boolean> {
    return db.transaction(async (tx) => {
      const [issue] = await tx.select().from(materialIssues).where(eq(materialIssues.id, id)).limit(1);
      if (!issue) return false;
      
      // Get material info for UOM conversion
      const [material] = await tx.select().from(plantMaterials).where(eq(plantMaterials.id, issue.materialId)).limit(1);
      
      let stockQuantity = issue.quantity;
      let stockUom = issue.uom;
      if (material?.conversionFactor && material?.conversionFromUom && material?.conversionToUom) {
        if (issue.uom.toUpperCase() === material.conversionFromUom.toUpperCase()) {
          stockQuantity = issue.quantity * material.conversionFactor;
          stockUom = material.conversionToUom;
        }
      }
      
      // Reverse stock balance with converted quantity
      const stockPartyId = issue.isPlantCommon ? null : issue.partyId;
      const condition = stockPartyId === null 
        ? and(sql`${stockBalances.partyId} IS NULL`, eq(stockBalances.materialId, issue.materialId))
        : and(eq(stockBalances.partyId, stockPartyId), eq(stockBalances.materialId, issue.materialId));
      
      const [existing] = await tx.select().from(stockBalances).where(condition).limit(1);
      if (existing) {
        const newBalance = existing.balance + stockQuantity;
        await tx.update(stockBalances)
          .set({ balance: newBalance, lastUpdated: new Date() })
          .where(eq(stockBalances.id, existing.id));
      }
      
      await tx.delete(stockLedger).where(
        and(eq(stockLedger.transactionType, "issue"), eq(stockLedger.referenceId, id))
      );
      
      await tx.delete(materialIssues).where(eq(materialIssues.id, id));
      
      return true;
    });
  }

  // ============================================
  // MATERIAL RETURNS
  // ============================================

  async getMaterialReturns(filters?: { materialId?: number; originalIssueId?: number; dateFrom?: string; dateTo?: string }): Promise<MaterialReturn[]> {
    let conditions = [];
    if (filters?.materialId !== undefined) conditions.push(eq(materialReturns.materialId, filters.materialId));
    if (filters?.originalIssueId !== undefined) conditions.push(eq(materialReturns.originalIssueId, filters.originalIssueId));
    if (filters?.dateFrom) conditions.push(gte(materialReturns.date, filters.dateFrom));
    if (filters?.dateTo) conditions.push(lte(materialReturns.date, filters.dateTo));

    return db.select().from(materialReturns)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(materialReturns.date));
  }

  async getReturnedQtyForIssue(issueId: number): Promise<number> {
    const returns = await db.select().from(materialReturns)
      .where(eq(materialReturns.originalIssueId, issueId));
    return returns.reduce((sum, r) => sum + r.quantity, 0);
  }

  async createMaterialReturn(ret: InsertMaterialReturn): Promise<MaterialReturn> {
    return db.transaction(async (tx) => {
      const [originalIssue] = await tx.select().from(materialIssues)
        .where(eq(materialIssues.id, ret.originalIssueId)).limit(1);
      if (!originalIssue) throw new Error("Original issue not found");

      const existingReturns = await tx.select().from(materialReturns)
        .where(eq(materialReturns.originalIssueId, ret.originalIssueId));
      const totalReturned = existingReturns.reduce((sum, r) => sum + r.quantity, 0);
      const remaining = originalIssue.quantity - totalReturned;

      if (ret.quantity > remaining) {
        throw new Error(`Return quantity (${ret.quantity}) exceeds remaining issuable amount (${remaining.toFixed(2)})`);
      }

      const uppercased = {
        ...ret,
        returnedBy: ret.returnedBy?.toUpperCase(),
        vehicleNumber: ret.vehicleNumber?.toUpperCase(),
        notes: ret.notes?.toUpperCase(),
      };

      const [result] = await tx.insert(materialReturns).values(uppercased).returning();

      // Get material info for UOM conversion
      const [material] = await tx.select().from(plantMaterials).where(eq(plantMaterials.id, ret.materialId)).limit(1);
      
      let stockQuantity = ret.quantity;
      let stockUom = ret.uom;
      if (material?.conversionFactor && material?.conversionFromUom && material?.conversionToUom) {
        if (ret.uom.toUpperCase() === material.conversionFromUom.toUpperCase()) {
          stockQuantity = ret.quantity * material.conversionFactor;
          stockUom = material.conversionToUom;
        }
      }

      const stockPartyId = ret.isPlantCommon ? null : ret.partyId;

      const condition = stockPartyId === null
        ? and(sql`${stockBalances.partyId} IS NULL`, eq(stockBalances.materialId, ret.materialId))
        : and(eq(stockBalances.partyId, stockPartyId!), eq(stockBalances.materialId, ret.materialId));

      const [existing] = await tx.select().from(stockBalances).where(condition).limit(1);
      const newBalance = (existing?.balance || 0) + stockQuantity;

      if (existing) {
        await tx.update(stockBalances)
          .set({ balance: newBalance, lastUpdated: new Date() })
          .where(eq(stockBalances.id, existing.id));
      } else {
        await tx.insert(stockBalances).values({
          partyId: stockPartyId,
          materialId: ret.materialId,
          balance: newBalance,
          uom: stockUom,
        });
      }

      const conversionNote = stockQuantity !== ret.quantity
        ? `Return from issue #${ret.originalIssueId}${ret.returnedBy ? ` by ${ret.returnedBy}` : ''} (${ret.quantity} ${ret.uom} = ${stockQuantity.toFixed(3)} ${stockUom})`
        : `Return from issue #${ret.originalIssueId}${ret.returnedBy ? ` by ${ret.returnedBy}` : ''}`;

      await tx.insert(stockLedger).values({
        date: ret.date,
        partyId: stockPartyId,
        materialId: ret.materialId,
        transactionType: "return",
        referenceId: result.id,
        quantityIn: stockQuantity,
        balanceAfter: newBalance,
        uom: stockUom,
        notes: conversionNote,
      });

      return result;
    });
  }

  async updateMaterialReturn(id: number, updates: Partial<InsertMaterialReturn>): Promise<MaterialReturn | undefined> {
    return db.transaction(async (tx) => {
      const [original] = await tx.select().from(materialReturns).where(eq(materialReturns.id, id)).limit(1);
      if (!original) return undefined;

      // Get material info for UOM conversion (original)
      const [material] = await tx.select().from(plantMaterials).where(eq(plantMaterials.id, original.materialId)).limit(1);

      let origStockQuantity = original.quantity;
      let origStockUom = original.uom;
      if (material?.conversionFactor && material?.conversionFromUom && material?.conversionToUom) {
        if (original.uom.toUpperCase() === material.conversionFromUom.toUpperCase()) {
          origStockQuantity = original.quantity * material.conversionFactor;
          origStockUom = material.conversionToUom;
        }
      }

      // Reverse original stock balance
      const origStockPartyId = original.isPlantCommon ? null : original.partyId;
      const origCondition = origStockPartyId === null
        ? and(sql`${stockBalances.partyId} IS NULL`, eq(stockBalances.materialId, original.materialId))
        : and(eq(stockBalances.partyId, origStockPartyId!), eq(stockBalances.materialId, original.materialId));

      const [origBal] = await tx.select().from(stockBalances).where(origCondition).limit(1);
      if (origBal) {
        await tx.update(stockBalances)
          .set({ balance: origBal.balance - origStockQuantity, lastUpdated: new Date() })
          .where(eq(stockBalances.id, origBal.id));
      }

      // Validate new quantity against original issue remaining (considering this return already exists)
      const newQuantity = updates.quantity ?? original.quantity;
      const newOriginalIssueId = updates.originalIssueId ?? original.originalIssueId;
      
      const [originalIssue] = await tx.select().from(materialIssues)
        .where(eq(materialIssues.id, newOriginalIssueId)).limit(1);
      if (!originalIssue) throw new Error("Original issue not found");

      const existingReturns = await tx.select().from(materialReturns)
        .where(and(eq(materialReturns.originalIssueId, newOriginalIssueId), sql`${materialReturns.id} != ${id}`));
      const totalReturned = existingReturns.reduce((sum, r) => sum + r.quantity, 0);
      const remaining = originalIssue.quantity - totalReturned;

      if (newQuantity > remaining) {
        throw new Error(`Return quantity (${newQuantity}) exceeds remaining issuable amount (${remaining.toFixed(2)})`);
      }

      // Uppercase text fields
      const uppercasedUpdates: any = { ...updates };
      if (updates.returnedBy) uppercasedUpdates.returnedBy = updates.returnedBy.toUpperCase();
      if (updates.vehicleNumber) uppercasedUpdates.vehicleNumber = updates.vehicleNumber.toUpperCase();
      if (updates.notes) uppercasedUpdates.notes = updates.notes.toUpperCase();

      // Update the return record
      const [result] = await tx.update(materialReturns)
        .set(uppercasedUpdates)
        .where(eq(materialReturns.id, id))
        .returning();

      // Apply new stock balance
      const newMaterialId = updates.materialId ?? original.materialId;
      const newUom = updates.uom ?? original.uom;
      const newPartyId = (updates.isPlantCommon ?? original.isPlantCommon) ? null : (updates.partyId ?? original.partyId);

      const [newMaterial] = await tx.select().from(plantMaterials).where(eq(plantMaterials.id, newMaterialId)).limit(1);
      
      let newStockQuantity = newQuantity;
      let newStockUom = newUom;
      if (newMaterial?.conversionFactor && newMaterial?.conversionFromUom && newMaterial?.conversionToUom) {
        if (newUom.toUpperCase() === newMaterial.conversionFromUom.toUpperCase()) {
          newStockQuantity = newQuantity * newMaterial.conversionFactor;
          newStockUom = newMaterial.conversionToUom;
        }
      }

      const newCondition = newPartyId === null
        ? and(sql`${stockBalances.partyId} IS NULL`, eq(stockBalances.materialId, newMaterialId))
        : and(eq(stockBalances.partyId, newPartyId!), eq(stockBalances.materialId, newMaterialId));

      const [newBal] = await tx.select().from(stockBalances).where(newCondition).limit(1);
      const newBalance = (newBal?.balance ?? 0) + newStockQuantity;

      if (newBal) {
        await tx.update(stockBalances)
          .set({ balance: newBalance, lastUpdated: new Date() })
          .where(eq(stockBalances.id, newBal.id));
      } else {
        await tx.insert(stockBalances).values({
          partyId: newPartyId,
          materialId: newMaterialId,
          balance: newBalance,
          uom: newStockUom,
        });
      }

      // Delete old ledger entry and create new one
      await tx.delete(stockLedger).where(
        and(eq(stockLedger.transactionType, "return"), eq(stockLedger.referenceId, id))
      );

      const newDate = updates.date ?? original.date;
      const conversionNote = newStockQuantity !== newQuantity
        ? `Return from issue #${newOriginalIssueId}${result.returnedBy ? ` by ${result.returnedBy}` : ''} (${newQuantity} ${newUom} = ${newStockQuantity.toFixed(3)} ${newStockUom})`
        : `Return from issue #${newOriginalIssueId}${result.returnedBy ? ` by ${result.returnedBy}` : ''}`;

      await tx.insert(stockLedger).values({
        date: newDate,
        partyId: newPartyId,
        materialId: newMaterialId,
        transactionType: "return",
        referenceId: result.id,
        quantityIn: newStockQuantity,
        balanceAfter: newBalance,
        uom: newStockUom,
        notes: conversionNote,
      });

      return result;
    });
  }

  async deleteMaterialReturn(id: number): Promise<boolean> {
    return db.transaction(async (tx) => {
      const [ret] = await tx.select().from(materialReturns).where(eq(materialReturns.id, id)).limit(1);
      if (!ret) return false;

      // Get material info for UOM conversion
      const [material] = await tx.select().from(plantMaterials).where(eq(plantMaterials.id, ret.materialId)).limit(1);
      
      let stockQuantity = ret.quantity;
      let stockUom = ret.uom;
      if (material?.conversionFactor && material?.conversionFromUom && material?.conversionToUom) {
        if (ret.uom.toUpperCase() === material.conversionFromUom.toUpperCase()) {
          stockQuantity = ret.quantity * material.conversionFactor;
          stockUom = material.conversionToUom;
        }
      }

      const stockPartyId = ret.isPlantCommon ? null : ret.partyId;
      const condition = stockPartyId === null
        ? and(sql`${stockBalances.partyId} IS NULL`, eq(stockBalances.materialId, ret.materialId))
        : and(eq(stockBalances.partyId, stockPartyId!), eq(stockBalances.materialId, ret.materialId));

      const [existing] = await tx.select().from(stockBalances).where(condition).limit(1);
      if (existing) {
        const newBalance = existing.balance - stockQuantity;
        await tx.update(stockBalances)
          .set({ balance: newBalance, lastUpdated: new Date() })
          .where(eq(stockBalances.id, existing.id));
      }

      await tx.delete(stockLedger).where(
        and(eq(stockLedger.transactionType, "return"), eq(stockLedger.referenceId, id))
      );

      await tx.delete(materialReturns).where(eq(materialReturns.id, id));

      return true;
    });
  }

  // Material Opening Stocks
  async getMaterialOpeningStocks(filters?: { materialId?: number; partyId?: number }): Promise<MaterialOpeningStock[]> {
    let conditions = [];
    if (filters?.materialId !== undefined) {
      conditions.push(eq(materialOpeningStocks.materialId, filters.materialId));
    }
    if (filters?.partyId !== undefined) {
      conditions.push(filters.partyId === null 
        ? sql`${materialOpeningStocks.partyId} IS NULL`
        : eq(materialOpeningStocks.partyId, filters.partyId));
    }
    
    return db.select().from(materialOpeningStocks)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(materialOpeningStocks.date));
  }

  async getMaterialOpeningStock(id: number): Promise<MaterialOpeningStock | undefined> {
    const [result] = await db.select().from(materialOpeningStocks)
      .where(eq(materialOpeningStocks.id, id))
      .limit(1);
    return result;
  }

  async createMaterialOpeningStock(stock: InsertMaterialOpeningStock): Promise<MaterialOpeningStock> {
    return db.transaction(async (tx) => {
      const [result] = await tx.insert(materialOpeningStocks).values(stock).returning();
      
      // Determine stock owner (partyId or plant common)
      const stockPartyId = stock.isPlantCommon ? null : stock.partyId;

      // Apply UOM conversion if the material has a conversion factor and the entered
      // UOM matches the "from" side (e.g. CFT → Ton for aggregates like 6MM Down).
      // Mirrors the same logic used by createMaterialReceipt.
      const [openingMaterial] = await tx.select().from(plantMaterials)
        .where(eq(plantMaterials.id, stock.materialId)).limit(1);
      let stockQuantity = stock.quantity;
      let stockUom = stock.uom;
      if (
        openingMaterial?.conversionFactor &&
        openingMaterial.conversionFromUom &&
        openingMaterial.conversionToUom &&
        stock.uom.toUpperCase() === openingMaterial.conversionFromUom.toUpperCase()
      ) {
        stockQuantity = stock.quantity * openingMaterial.conversionFactor;
        stockUom = openingMaterial.conversionToUom;
      }
      
      // Update stock balance
      const condition = stockPartyId === null 
        ? and(sql`${stockBalances.partyId} IS NULL`, eq(stockBalances.materialId, stock.materialId))
        : and(eq(stockBalances.partyId, stockPartyId!), eq(stockBalances.materialId, stock.materialId));
      
      const [existing] = await tx.select().from(stockBalances).where(condition).limit(1);
      const newBalance = (existing?.balance ?? 0) + stockQuantity;
      
      if (existing) {
        await tx.update(stockBalances)
          .set({ balance: newBalance, lastUpdated: new Date() })
          .where(eq(stockBalances.id, existing.id));
      } else {
        await tx.insert(stockBalances).values({
          partyId: stockPartyId,
          materialId: stock.materialId,
          balance: newBalance,
          uom: stockUom,
        });
      }
      
      // Add ledger entry for opening stock (always in the stock UOM after conversion)
      const conversionNote = stockQuantity !== stock.quantity
        ? `Opening stock entry (${stock.quantity} ${stock.uom} converted to ${stockQuantity.toFixed(3)} ${stockUom})`
        : (stock.notes ?? "Opening stock entry");
      await tx.insert(stockLedger).values({
        date: stock.date,
        partyId: stockPartyId,
        materialId: stock.materialId,
        transactionType: "opening",
        referenceId: result.id,
        quantityIn: stockQuantity,
        balanceAfter: newBalance,
        uom: stockUom,
        notes: conversionNote,
      });
      
      return result;
    });
  }

  async updateMaterialOpeningStock(id: number, updates: Partial<InsertMaterialOpeningStock>): Promise<MaterialOpeningStock | undefined> {
    return db.transaction(async (tx) => {
      const [original] = await tx.select().from(materialOpeningStocks)
        .where(eq(materialOpeningStocks.id, id))
        .limit(1);
      if (!original) return undefined;

      // Compute the stock quantity that was originally applied (possibly converted).
      // Mirrors the reverse-step logic in updateMaterialReceipt.
      const [oldMaterial] = await tx.select().from(plantMaterials)
        .where(eq(plantMaterials.id, original.materialId)).limit(1);
      let oldStockQuantity = original.quantity;
      if (
        oldMaterial?.conversionFactor &&
        oldMaterial.conversionFromUom &&
        oldMaterial.conversionToUom &&
        original.uom.toUpperCase() === oldMaterial.conversionFromUom.toUpperCase()
      ) {
        oldStockQuantity = original.quantity * oldMaterial.conversionFactor;
      }
      
      // Reverse original stock balance using the converted amount
      const originalStockPartyId = original.isPlantCommon ? null : original.partyId;
      const origCondition = originalStockPartyId === null 
        ? and(sql`${stockBalances.partyId} IS NULL`, eq(stockBalances.materialId, original.materialId))
        : and(eq(stockBalances.partyId, originalStockPartyId), eq(stockBalances.materialId, original.materialId));
      
      const [origBal] = await tx.select().from(stockBalances).where(origCondition).limit(1);
      if (origBal) {
        await tx.update(stockBalances)
          .set({ balance: origBal.balance - oldStockQuantity, lastUpdated: new Date() })
          .where(eq(stockBalances.id, origBal.id));
      }
      
      // Update the opening stock record
      const [result] = await tx.update(materialOpeningStocks)
        .set(updates)
        .where(eq(materialOpeningStocks.id, id))
        .returning();
      
      // Compute the new stock quantity (possibly converted)
      const newStockPartyId = (updates.isPlantCommon ?? original.isPlantCommon) ? null : (updates.partyId ?? original.partyId);
      const newMaterialId = updates.materialId ?? original.materialId;
      const newQuantity = updates.quantity ?? original.quantity;
      const newUom = updates.uom ?? original.uom;

      const [newMaterial] = await tx.select().from(plantMaterials)
        .where(eq(plantMaterials.id, newMaterialId)).limit(1);
      let newStockQuantity = newQuantity;
      let newStockUom = newUom;
      if (
        newMaterial?.conversionFactor &&
        newMaterial.conversionFromUom &&
        newMaterial.conversionToUom &&
        newUom.toUpperCase() === newMaterial.conversionFromUom.toUpperCase()
      ) {
        newStockQuantity = newQuantity * newMaterial.conversionFactor;
        newStockUom = newMaterial.conversionToUom;
      }
      
      const newCondition = newStockPartyId === null 
        ? and(sql`${stockBalances.partyId} IS NULL`, eq(stockBalances.materialId, newMaterialId))
        : and(eq(stockBalances.partyId, newStockPartyId), eq(stockBalances.materialId, newMaterialId));
      
      const [newBal] = await tx.select().from(stockBalances).where(newCondition).limit(1);
      const newBalance = (newBal?.balance ?? 0) + newStockQuantity;
      
      if (newBal) {
        await tx.update(stockBalances)
          .set({ balance: newBalance, lastUpdated: new Date() })
          .where(eq(stockBalances.id, newBal.id));
      } else {
        await tx.insert(stockBalances).values({
          partyId: newStockPartyId,
          materialId: newMaterialId,
          balance: newBalance,
          uom: newStockUom,
        });
      }
      
      // Delete old ledger entry and create new one in the stock UOM
      await tx.delete(stockLedger).where(
        and(eq(stockLedger.transactionType, "opening"), eq(stockLedger.referenceId, id))
      );
      
      const newDate = updates.date ?? original.date;
      const newNotes = updates.notes ?? original.notes;
      const conversionNote = newStockQuantity !== newQuantity
        ? `Opening stock entry (${newQuantity} ${newUom} converted to ${newStockQuantity.toFixed(3)} ${newStockUom})`
        : (newNotes ?? "Opening stock entry");

      await tx.insert(stockLedger).values({
        date: newDate,
        partyId: newStockPartyId,
        materialId: newMaterialId,
        transactionType: "opening",
        referenceId: result.id,
        quantityIn: newStockQuantity,
        balanceAfter: newBalance,
        uom: newStockUom,
        notes: conversionNote,
      });
      
      return result;
    });
  }

  async deleteMaterialOpeningStock(id: number): Promise<boolean> {
    return db.transaction(async (tx) => {
      const [stock] = await tx.select().from(materialOpeningStocks)
        .where(eq(materialOpeningStocks.id, id))
        .limit(1);
      if (!stock) return false;

      // Compute how much was originally credited to the balance (with UOM conversion).
      // Mirrors the same logic in createMaterialOpeningStock / updateMaterialOpeningStock.
      const [mat] = await tx.select().from(plantMaterials)
        .where(eq(plantMaterials.id, stock.materialId)).limit(1);
      let reverseQuantity = stock.quantity;
      let reverseUom = stock.uom;
      if (
        mat?.conversionFactor &&
        mat.conversionFromUom &&
        mat.conversionToUom &&
        stock.uom.toUpperCase() === mat.conversionFromUom.toUpperCase()
      ) {
        reverseQuantity = stock.quantity * mat.conversionFactor;
        reverseUom = mat.conversionToUom;
      }
      
      // Reverse stock balance using the converted amount
      const stockPartyId = stock.isPlantCommon ? null : stock.partyId;
      const condition = stockPartyId === null 
        ? and(sql`${stockBalances.partyId} IS NULL`, eq(stockBalances.materialId, stock.materialId))
        : and(eq(stockBalances.partyId, stockPartyId), eq(stockBalances.materialId, stock.materialId));
      
      const [existing] = await tx.select().from(stockBalances).where(condition).limit(1);
      if (existing) {
        const newBalance = existing.balance - reverseQuantity;
        await tx.update(stockBalances)
          .set({ balance: newBalance, lastUpdated: new Date() })
          .where(eq(stockBalances.id, existing.id));
      }
      
      // Delete ledger entries for this opening stock
      await tx.delete(stockLedger).where(
        and(eq(stockLedger.transactionType, "opening"), eq(stockLedger.referenceId, id))
      );
      
      // Delete the opening stock record
      await tx.delete(materialOpeningStocks).where(eq(materialOpeningStocks.id, id));
      
      return true;
    });
  }

  // ============================================
  // Site Material Trips (Quick Entry)
  // ============================================
  
  async getAllSitePurchases(filters?: { site?: string; dateFrom?: string; dateTo?: string }): Promise<any[]> {
    let conditions: any[] = [
      or(eq(dprs.isSuperseded, false), isNull(dprs.isSuperseded)),
    ];
    
    if (filters?.dateFrom) conditions.push(gte(dprs.date, filters.dateFrom));
    if (filters?.dateTo) conditions.push(lte(dprs.date, filters.dateTo));
    
    const results = await db.select({
      id: sitePurchases.id,
      dprId: sitePurchases.dprId,
      itemDescription: sitePurchases.itemDescription,
      quantity: sitePurchases.quantity,
      uom: sitePurchases.uom,
      vendor: sitePurchases.vendor,
      billNo: sitePurchases.billNo,
      amount: sitePurchases.amount,
      date: dprs.date,
      site: dprs.site,
      engineer: dprs.engineer,
    })
    .from(sitePurchases)
    .innerJoin(dprs, eq(sitePurchases.dprId, dprs.id))
    .where(and(...conditions))
    .orderBy(desc(dprs.date));
    
    let filtered = results
      .map(rest => ({
        ...rest,
        site: this.getBaseSiteName(rest.site),
        source: "purchase" as const,
      }));
    
    if (filters?.site) {
      const filterSite = filters.site.toUpperCase().trim();
      filtered = filtered.filter(r => r.site.toUpperCase().trim() === filterSite);
    }

    let dieselConditions: any[] = [
      eq(equipmentLogs.dieselSource, 'direct_purchase'),
      or(eq(dprs.isSuperseded, false), isNull(dprs.isSuperseded)),
    ];
    if (filters?.dateFrom) dieselConditions.push(gte(dprs.date, filters.dateFrom));
    if (filters?.dateTo) dieselConditions.push(lte(dprs.date, filters.dateTo));

    const dieselResults = await db.select({
      id: equipmentLogs.id,
      dprId: equipmentLogs.dprId,
      machine: equipmentLogs.machine,
      diesel: equipmentLogs.diesel,
      fuelStation: equipmentLogs.fuelStation,
      billNumber: equipmentLogs.billNumber,
      amountPaid: equipmentLogs.amountPaid,
      date: dprs.date,
      site: dprs.site,
      engineer: dprs.engineer,
    })
    .from(equipmentLogs)
    .innerJoin(dprs, eq(equipmentLogs.dprId, dprs.id))
    .where(and(...dieselConditions));

    let dieselFiltered = dieselResults
      .filter(r => (r.amountPaid || 0) > 0)
      .map(row => ({
        id: row.id,
        dprId: row.dprId,
        itemDescription: `DIESEL - ${row.machine || 'EQUIPMENT'}`,
        quantity: row.diesel || null,
        uom: "LTR" as string | null,
        vendor: row.fuelStation || null,
        billNo: row.billNumber || null,
        amount: row.amountPaid || null,
        date: row.date,
        site: this.getBaseSiteName(row.site),
        engineer: row.engineer,
        source: "diesel" as const,
      }));

    if (filters?.site) {
      const filterSite = filters.site.toUpperCase().trim();
      dieselFiltered = dieselFiltered.filter(r => r.site.toUpperCase().trim() === filterSite);
    }

    const combined = [...filtered, ...dieselFiltered];
    combined.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    return combined;
  }

  async updateSitePurchase(id: number, data: { itemDescription?: string; quantity?: number | null; uom?: string | null; vendor?: string | null; billNo?: string | null; amount?: number | null }): Promise<any> {
    const updateData: any = {};
    if (data.itemDescription !== undefined) updateData.itemDescription = data.itemDescription.toUpperCase();
    if (data.quantity !== undefined) updateData.quantity = data.quantity;
    if (data.uom !== undefined) updateData.uom = data.uom?.toUpperCase() || data.uom;
    if (data.vendor !== undefined) updateData.vendor = data.vendor?.toUpperCase() || data.vendor;
    if (data.billNo !== undefined) updateData.billNo = data.billNo?.toUpperCase() || data.billNo;
    if (data.amount !== undefined) updateData.amount = data.amount;
    
    const [updated] = await db.update(sitePurchases)
      .set(updateData)
      .where(eq(sitePurchases.id, id))
      .returning();
    return updated;
  }

  async getSiteMaterialTrips(filters?: { site?: string; material?: string; dateFrom?: string; dateTo?: string }): Promise<SiteMaterialTrip[]> {
    let conditions = [];
    
    if (filters?.site) conditions.push(eq(siteMaterialTrips.site, filters.site));
    if (filters?.material) conditions.push(eq(siteMaterialTrips.material, filters.material));
    if (filters?.dateFrom) conditions.push(gte(siteMaterialTrips.date, filters.dateFrom));
    if (filters?.dateTo) conditions.push(lte(siteMaterialTrips.date, filters.dateTo));
    
    const trips = await db.select()
      .from(siteMaterialTrips)
      .where(and(...conditions))
      .orderBy(desc(siteMaterialTrips.date), desc(siteMaterialTrips.createdAt));
    
    return trips;
  }

  async createSiteMaterialTrip(data: InsertSiteMaterialTrip): Promise<SiteMaterialTrip> {
    const [trip] = await db.insert(siteMaterialTrips).values(data).returning();
    return trip;
  }

  async updateSiteMaterialTrip(id: number, data: Partial<InsertSiteMaterialTrip>): Promise<SiteMaterialTrip> {
    const [trip] = await db.update(siteMaterialTrips)
      .set(data)
      .where(eq(siteMaterialTrips.id, id))
      .returning();
    return trip;
  }

  async deleteSiteMaterialTrip(id: number): Promise<void> {
    await db.delete(siteMaterialTrips).where(eq(siteMaterialTrips.id, id));
  }

  async getAllMaterialsReceived(filters?: { site?: string; material?: string; dateFrom?: string; dateTo?: string; supplier?: string }): Promise<any[]> {
    const tripConditions: any[] = [];
    if (filters?.dateFrom) tripConditions.push(gte(siteMaterialTrips.date, filters.dateFrom));
    if (filters?.dateTo) tripConditions.push(lte(siteMaterialTrips.date, filters.dateTo));
    if (filters?.material) tripConditions.push(ilike(siteMaterialTrips.material, `%${filters.material}%`));
    if (filters?.supplier) tripConditions.push(ilike(siteMaterialTrips.supplier, `%${filters.supplier}%`));

    const trips = await db.select().from(siteMaterialTrips)
      .where(tripConditions.length > 0 ? and(...tripConditions) : undefined)
      .orderBy(desc(siteMaterialTrips.date), desc(siteMaterialTrips.createdAt));

    const dprConditions: any[] = [
      eq(materialLogs.type, 'Received'),
      or(eq(dprs.isSuperseded, false), isNull(dprs.isSuperseded)),
    ];
    if (filters?.dateFrom) dprConditions.push(gte(dprs.date, filters.dateFrom));
    if (filters?.dateTo) dprConditions.push(lte(dprs.date, filters.dateTo));
    if (filters?.material) dprConditions.push(ilike(materialLogs.material, `%${filters.material}%`));
    if (filters?.supplier) dprConditions.push(ilike(materialLogs.supplier, `%${filters.supplier}%`));

    const dprMaterials = await db.select({
      id: materialLogs.id,
      dprId: materialLogs.dprId,
      material: materialLogs.material,
      supplier: materialLogs.supplier,
      quantity: materialLogs.quantity,
      uom: materialLogs.uom,
      vehicleNumber: materialLogs.vehicleNumber,
      location: materialLogs.location,
      receiptNumber: materialLogs.receiptNumber,
      date: dprs.date,
      site: dprs.site,
      engineer: dprs.engineer,
    })
    .from(materialLogs)
    .innerJoin(dprs, eq(materialLogs.dprId, dprs.id))
    .where(and(...dprConditions))
    .orderBy(desc(dprs.date));

    let dprResults = dprMaterials.map(row => ({
      id: row.id,
      dprId: row.dprId,
      source: "dpr" as const,
      date: row.date,
      site: this.getBaseSiteName(row.site),
      material: row.material,
      supplier: row.supplier || null,
      quantity: row.quantity || 0,
      uom: row.uom || "",
      vehicleNumber: row.vehicleNumber || null,
      location: row.location || null,
      receiptNumber: row.receiptNumber || null,
      enteredBy: row.engineer || null,
      time: null,
      notes: null,
    }));

    let tripResults = trips.map(t => ({
      id: t.id,
      source: "trip" as const,
      date: t.date,
      site: t.site,
      material: t.material,
      supplier: t.supplier || null,
      quantity: t.quantity || 0,
      uom: t.uom || "",
      vehicleNumber: t.vehicleNumber || null,
      location: t.location || null,
      receiptNumber: t.receiptNumber || null,
      enteredBy: t.enteredBy || null,
      time: t.time || null,
      notes: t.notes || null,
    }));

    const waterConditions: any[] = [
      or(
        ilike(equipmentLogs.machine, '%water%'),
        ilike(equipmentLogs.machine, '%tanker%'),
      ),
      or(eq(dprs.isSuperseded, false), isNull(dprs.isSuperseded)),
    ];
    if (filters?.dateFrom) waterConditions.push(gte(dprs.date, filters.dateFrom));
    if (filters?.dateTo) waterConditions.push(lte(dprs.date, filters.dateTo));
    if (filters?.material && !filters.material.toUpperCase().includes('WATER')) {
      waterConditions.push(sql`1=0`);
    }

    const waterEntries = await db.select({
      id: equipmentLogs.id,
      machine: equipmentLogs.machine,
      operator: equipmentLogs.operator,
      vehicleNo: equipmentLogs.vehicleNo,
      task: equipmentLogs.task,
      numberOfTrips: equipmentLogs.numberOfTrips,
      waterQuantity: equipmentLogs.waterQuantity,
      startTime: equipmentLogs.startTime,
      endTime: equipmentLogs.endTime,
      date: dprs.date,
      site: dprs.site,
      engineer: dprs.engineer,
    })
    .from(equipmentLogs)
    .innerJoin(dprs, eq(equipmentLogs.dprId, dprs.id))
    .where(and(...waterConditions))
    .orderBy(desc(dprs.date));

    let waterResults = waterEntries
      .filter(row => row.waterQuantity || row.numberOfTrips)
      .map(row => ({
        id: row.id,
        source: "equipment" as const,
        date: row.date,
        site: this.getBaseSiteName(row.site),
        material: "Water",
        supplier: row.operator || row.machine || null,
        quantity: row.waterQuantity || 0,
        uom: "Liters",
        vehicleNumber: row.vehicleNo || null,
        location: row.task || null,
        receiptNumber: null,
        enteredBy: row.engineer || null,
        time: row.startTime || null,
        notes: row.numberOfTrips ? `${row.numberOfTrips} trip(s)` : null,
      }));

    if (filters?.site) {
      const filterSite = filters.site.toUpperCase().trim();
      dprResults = dprResults.filter(r => r.site.toUpperCase().trim() === filterSite);
      tripResults = tripResults.filter(r => (r.site || '').toUpperCase().trim() === filterSite);
      waterResults = waterResults.filter(r => r.site.toUpperCase().trim() === filterSite);
    }

    if (filters?.supplier) {
      const sup = filters.supplier.toUpperCase().trim();
      waterResults = waterResults.filter(r => (r.supplier || '').toUpperCase().includes(sup));
    }

    const combined = [...tripResults, ...dprResults, ...waterResults];
    combined.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    return combined;
  }

  async getMaterialSuppliers(): Promise<string[]> {
    const [tripSuppliers, dprSuppliers] = await Promise.all([
      db.selectDistinct({ supplier: siteMaterialTrips.supplier })
        .from(siteMaterialTrips)
        .where(isNotNull(siteMaterialTrips.supplier)),
      db.selectDistinct({ supplier: materialLogs.supplier })
        .from(materialLogs)
        .innerJoin(dprs, eq(materialLogs.dprId, dprs.id))
        .where(and(
          eq(materialLogs.type, 'Received'),
          isNotNull(materialLogs.supplier),
          or(eq(dprs.isSuperseded, false), isNull(dprs.isSuperseded)),
        )),
    ]);
    const all = new Set<string>();
    for (const row of [...tripSuppliers, ...dprSuppliers]) {
      const val = (row.supplier || '').trim().toUpperCase();
      if (val) all.add(val);
    }
    return [...all].sort();
  }

  // Consumption Audit Log
  async getConsumptionAuditLog(filters?: { dispatchId?: number; dateFrom?: string; dateTo?: string }): Promise<ConsumptionAuditLog[]> {
    let conditions = [];
    if (filters?.dispatchId) conditions.push(eq(consumptionAuditLog.dispatchId, filters.dispatchId));
    if (filters?.dateFrom) conditions.push(gte(consumptionAuditLog.createdAt, new Date(filters.dateFrom)));
    if (filters?.dateTo) conditions.push(lte(consumptionAuditLog.createdAt, new Date(filters.dateTo + "T23:59:59")));
    
    return db.select().from(consumptionAuditLog)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(consumptionAuditLog.createdAt));
  }

  async createConsumptionAuditEntry(data: InsertConsumptionAuditLog): Promise<ConsumptionAuditLog> {
    const [result] = await db.insert(consumptionAuditLog).values(data).returning();
    return result;
  }

  // Get dispatches with actual consumption differing from theoretical (variance report)
  async getDispatchesWithVariance(filters?: { dateFrom?: string; dateTo?: string }): Promise<TruckDispatch[]> {
    let conditions = [
      sql`(${truckDispatches.bitumenVariancePercent} IS NOT NULL AND ${truckDispatches.bitumenVariancePercent} != 0)
          OR (${truckDispatches.ldoVariancePercent} IS NOT NULL AND ${truckDispatches.ldoVariancePercent} != 0)`
    ];
    if (filters?.dateFrom) conditions.push(gte(truckDispatches.date, filters.dateFrom));
    if (filters?.dateTo) conditions.push(lte(truckDispatches.date, filters.dateTo));
    
    return db.select().from(truckDispatches)
      .where(and(...conditions))
      .orderBy(desc(truckDispatches.date), desc(truckDispatches.id));
  }
  // Sites Master
  async getSites(): Promise<Site[]> {
    return db.select().from(sites).orderBy(asc(sites.name));
  }

  async createSite(site: InsertSite): Promise<Site> {
    const [result] = await db.insert(sites).values({
      ...site,
      name: site.name.toUpperCase().trim(),
    }).returning();
    return result;
  }

  async updateSite(id: number, data: Partial<InsertSite>): Promise<Site | undefined> {
    const updates: any = { ...data };
    if (updates.name) updates.name = updates.name.toUpperCase().trim();
    const [result] = await db.update(sites).set(updates).where(eq(sites.id, id)).returning();
    return result;
  }

  async deleteSite(id: number): Promise<boolean> {
    const result = await db.delete(sites).where(eq(sites.id, id)).returning();
    return result.length > 0;
  }

  async seedSitesFromDprs(): Promise<number> {
    const allDprs = await db.select({ site: dprs.site }).from(dprs);
    const uniqueSites = new Set<string>();
    for (const dpr of allDprs) {
      const baseSite = this.getBaseSiteName(dpr.site).toUpperCase().trim();
      if (baseSite) uniqueSites.add(baseSite);
    }
    const existingSites = await db.select({ name: sites.name }).from(sites);
    const existingNames = new Set(existingSites.map(s => s.name.toUpperCase().trim()));
    let created = 0;
    for (const siteName of Array.from(uniqueSites)) {
      if (!existingNames.has(siteName)) {
        await db.insert(sites).values({ name: siteName });
        created++;
      }
    }
    return created;
  }

  // ============================================
  // BITUMEN DIP READINGS
  // ============================================

  async getBitumenDipReadings(filters?: { tankNumber?: number; dateFrom?: string; dateTo?: string; readingType?: string; plantName?: string }): Promise<BitumenDipReading[]> {
    let conditions = [];
    if (filters?.tankNumber !== undefined) conditions.push(eq(bitumenDipReadings.tankNumber, filters.tankNumber));
    if (filters?.readingType) conditions.push(eq(bitumenDipReadings.readingType, filters.readingType));
    if (filters?.dateFrom) conditions.push(gte(bitumenDipReadings.date, filters.dateFrom));
    if (filters?.dateTo) conditions.push(lte(bitumenDipReadings.date, filters.dateTo));
    if (filters?.plantName) conditions.push(eq(bitumenDipReadings.plantName, filters.plantName));

    return db.select().from(bitumenDipReadings)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(bitumenDipReadings.date), desc(bitumenDipReadings.time));
  }

  async createBitumenDipReading(reading: InsertBitumenDipReading): Promise<BitumenDipReading> {
    const [existing] = await db.select({ id: bitumenDipReadings.id })
      .from(bitumenDipReadings)
      .where(and(
        eq(bitumenDipReadings.date, String(reading.date)),
        eq(bitumenDipReadings.tankNumber, reading.tankNumber),
        eq(bitumenDipReadings.readingType, reading.readingType),
        eq(bitumenDipReadings.plantName, reading.plantName ?? "Main Plant"),
      ))
      .limit(1);
    if (existing) {
      const err = Object.assign(
        new Error(`A ${reading.readingType} reading for Tank ${reading.tankNumber} on ${reading.date} already exists.`),
        { code: "DUPLICATE_BITUMEN_DIP" as const }
      );
      throw err;
    }

    const uppercased = {
      ...reading,
      notes: reading.notes?.toUpperCase(),
    };
    const [result] = await db.insert(bitumenDipReadings).values(uppercased).returning();
    return result;
  }

  async updateBitumenDipReading(id: number, updates: Partial<InsertBitumenDipReading>): Promise<BitumenDipReading | undefined> {
    const cleanUpdates: any = {};
    if (updates.date !== undefined) cleanUpdates.date = updates.date;
    if (updates.time !== undefined) cleanUpdates.time = updates.time;
    if (updates.tankNumber !== undefined) cleanUpdates.tankNumber = updates.tankNumber;
    if (updates.depthCm !== undefined) cleanUpdates.depthCm = updates.depthCm;
    if (updates.volumeLiters !== undefined) cleanUpdates.volumeLiters = updates.volumeLiters;
    if (updates.weightKg !== undefined) cleanUpdates.weightKg = updates.weightKg;
    if (updates.readingType !== undefined) cleanUpdates.readingType = updates.readingType;
    if (updates.notes !== undefined) cleanUpdates.notes = updates.notes?.toUpperCase();
    if (updates.plantName !== undefined) cleanUpdates.plantName = updates.plantName;
    
    const [result] = await db.update(bitumenDipReadings)
      .set(cleanUpdates)
      .where(eq(bitumenDipReadings.id, id))
      .returning();
    return result;
  }

  async deleteBitumenDipReading(id: number): Promise<boolean> {
    const [deleted] = await db.delete(bitumenDipReadings).where(eq(bitumenDipReadings.id, id)).returning();
    return !!deleted;
  }

  // ============================================
  // LDO FLOW METER READINGS
  // ============================================

  async getLdoFlowReadings(filters?: { tankNumber?: number; dateFrom?: string; dateTo?: string; readingType?: string; plantName?: string }): Promise<LdoFlowReading[]> {
    let conditions = [];
    if (filters?.tankNumber) conditions.push(eq(ldoFlowReadings.tankNumber, filters.tankNumber));
    if (filters?.readingType) conditions.push(eq(ldoFlowReadings.readingType, filters.readingType));
    if (filters?.dateFrom) conditions.push(gte(ldoFlowReadings.date, filters.dateFrom));
    if (filters?.dateTo) conditions.push(lte(ldoFlowReadings.date, filters.dateTo));
    if (filters?.plantName) conditions.push(eq(ldoFlowReadings.plantName, filters.plantName));

    return db.select().from(ldoFlowReadings)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(ldoFlowReadings.date), desc(ldoFlowReadings.time));
  }

  async createLdoFlowReading(reading: InsertLdoFlowReading): Promise<LdoFlowReading> {
    const uppercased = {
      ...reading,
      notes: reading.notes?.toUpperCase(),
    };
    const [result] = await db.insert(ldoFlowReadings).values(uppercased).returning();
    return result;
  }

  async updateLdoFlowReading(id: number, updates: Partial<InsertLdoFlowReading>): Promise<LdoFlowReading | undefined> {
    const cleanUpdates: any = {};
    if (updates.date !== undefined) cleanUpdates.date = updates.date;
    if (updates.time !== undefined) cleanUpdates.time = updates.time;
    if (updates.tankNumber !== undefined) cleanUpdates.tankNumber = updates.tankNumber;
    if (updates.meterReading !== undefined) cleanUpdates.meterReading = updates.meterReading;
    if (updates.readingType !== undefined) cleanUpdates.readingType = updates.readingType;
    if (updates.quantityLiters !== undefined) cleanUpdates.quantityLiters = updates.quantityLiters;
    if (updates.notes !== undefined) cleanUpdates.notes = updates.notes?.toUpperCase();
    if (updates.plantName !== undefined) cleanUpdates.plantName = updates.plantName;
    if (updates.dryerFedFrom !== undefined) cleanUpdates.dryerFedFrom = updates.dryerFedFrom ?? null;
    
    const [result] = await db.update(ldoFlowReadings)
      .set(cleanUpdates)
      .where(eq(ldoFlowReadings.id, id))
      .returning();
    return result;
  }

  async deleteLdoFlowReading(id: number): Promise<boolean> {
    const [deleted] = await db.delete(ldoFlowReadings).where(eq(ldoFlowReadings.id, id)).returning();
    return !!deleted;
  }

  async getOrphanedLdoFlowRows(filters: { dateFrom?: string; dateTo?: string; plant?: string }): Promise<LdoFlowReading[]> {
    const conds = [isNotNull(ldoFlowReadings.sourceHeatingSessionId)];
    if (filters.dateFrom) conds.push(gte(ldoFlowReadings.date, filters.dateFrom));
    if (filters.dateTo) conds.push(lte(ldoFlowReadings.date, filters.dateTo));
    if (filters.plant) conds.push(eq(ldoFlowReadings.plantName, filters.plant));

    const rows = await db.select().from(ldoFlowReadings).where(and(...conds));
    if (rows.length === 0) return [];

    const sessionIds = [...new Set(rows.map(r => r.sourceHeatingSessionId!))];
    const existing = await db
      .select({ id: bitumenHeatingSessions.id })
      .from(bitumenHeatingSessions)
      .where(inArray(bitumenHeatingSessions.id, sessionIds));
    const existingSet = new Set(existing.map(s => s.id));
    return rows.filter(r => !existingSet.has(r.sourceHeatingSessionId!));
  }

  async deleteOrphanedLdoFlowRows(filters: { dateFrom?: string; dateTo?: string; plant?: string }): Promise<{ deleted: number }> {
    const orphaned = await this.getOrphanedLdoFlowRows(filters);
    if (orphaned.length === 0) return { deleted: 0 };
    const ids = orphaned.map(r => r.id);
    await db.delete(ldoFlowReadings).where(inArray(ldoFlowReadings.id, ids));
    return { deleted: ids.length };
  }

  // --- LDO Flow-Meter Backfill (admin-only historical entry) -----------------
  // Backfill rows live alongside shift-log / heating-session / manual rows in
  // `ldo_flow_readings`. They are identified by a "[BACKFILL ...]" marker in
  // `notes` and scoped to a plant via the dedicated `plant_name` column.
  // Idempotency is per (date, plant, tank, opening|closing): on re-save the
  // storage method deletes the existing backfill row for that key and
  // re-inserts. Rows owned by a shift log, heating session, or non-backfill
  // manual entry are NEVER overwritten — they are returned as conflicts.

  private isLdoBackfillRow(notes: string | null | undefined): boolean {
    return !!notes && notes.toUpperCase().startsWith("[BACKFILL");
  }

  async getLdoFlowReadingsForBackfill(filters: { dateFrom: string; dateTo: string; plant?: string }): Promise<LdoFlowReading[]> {
    const conds = [
      gte(ldoFlowReadings.date, filters.dateFrom),
      lte(ldoFlowReadings.date, filters.dateTo),
    ];
    if (filters.plant) conds.push(eq(ldoFlowReadings.plantName, filters.plant));

    return db.select().from(ldoFlowReadings)
      .where(and(...conds))
      .orderBy(asc(ldoFlowReadings.date), asc(ldoFlowReadings.tankNumber), asc(ldoFlowReadings.readingType), asc(ldoFlowReadings.time));
  }

  async upsertLdoFlowReadingsBackfill(
    rows: Array<{ date: string; plant: string; tank: number; opening: number | null; closing: number | null; remarks: string | null; dryerFedFrom?: "TANK_1" | "TANK_2" }>,
    actor: string,
  ): Promise<{ inserted: number; deleted: number; skipped: number; conflicts: Array<{ date: string; plant: string; tank: number; reason: string }> }> {
    let inserted = 0, deleted = 0, skipped = 0;
    const conflicts: Array<{ date: string; plant: string; tank: number; reason: string }> = [];

    await db.transaction(async (tx) => {
      for (const row of rows) {
        const tank = row.tank;
        const plant = row.plant || "Main Plant";

        if (row.opening != null && row.closing != null && row.closing < row.opening) {
          conflicts.push({ date: row.date, plant, tank, reason: "closing meter < opening meter" });
          skipped++;
          continue;
        }

        const existing = await tx.select().from(ldoFlowReadings).where(and(
          eq(ldoFlowReadings.date, row.date),
          eq(ldoFlowReadings.tankNumber, tank),
          eq(ldoFlowReadings.plantName, plant),
        ));

        for (const rt of ["opening", "closing"] as const) {
          const value = rt === "opening" ? row.opening : row.closing;
          // undefined means "leave this reading type untouched" (not the same as null = delete)
          if (value === undefined) continue;
          const sameType = existing.filter(e => e.readingType === rt);
          const protectedRow = sameType.find(e =>
            e.sourceShiftLogId != null
            || e.sourceHeatingSessionId != null
          );

          if (protectedRow) {
            if (value != null && value !== protectedRow.meterReading) {
              const owner = protectedRow.sourceShiftLogId != null
                ? "shift-log"
                : "heating-session";
              conflicts.push({ date: row.date, plant, tank, reason: `${rt} blocked by ${owner} reading` });
              skipped++;
            }
            continue;
          }

          // Delete the existing row (backfill or manual) for this plant/date/tank/type
          // before re-inserting. Shift-log and heating-session rows are excluded above.
          // Other plants' rows are isolated by plant_name and not touched.
          const toDelete = sameType.filter(e =>
            e.sourceShiftLogId == null && e.sourceHeatingSessionId == null
          );
          for (const b of toDelete) {
            await tx.delete(ldoFlowReadings).where(eq(ldoFlowReadings.id, b.id));
            deleted++;
          }

          if (value != null) {
            const time = rt === "opening" ? "06:00" : "18:00";
            const noteBits = [`[BACKFILL BY ${(actor || "admin").toUpperCase()}]`];
            if (row.remarks) noteBits.push(row.remarks);
            await tx.insert(ldoFlowReadings).values({
              date: row.date,
              time,
              tankNumber: tank,
              meterReading: value,
              readingType: rt,
              notes: noteBits.join(" ").toUpperCase(),
              plantName: plant,
              ...(tank === 2 && row.dryerFedFrom ? { dryerFedFrom: row.dryerFedFrom } : {}),
            } satisfies InsertLdoFlowReading);
            inserted++;
          }
        }
      }
    });

    return { inserted, deleted, skipped, conflicts };
  }

  // ============================================
  // LDO DIP READINGS
  // ============================================

  async getLdoDipReadings(filters?: { tankNumber?: number; dateFrom?: string; dateTo?: string; readingType?: string; plant?: string }): Promise<LdoDipReading[]> {
    let conditions = [];
    if (filters?.tankNumber !== undefined) conditions.push(eq(ldoDipReadings.tankNumber, filters.tankNumber));
    if (filters?.readingType) conditions.push(eq(ldoDipReadings.readingType, filters.readingType));
    if (filters?.dateFrom) conditions.push(gte(ldoDipReadings.date, filters.dateFrom));
    if (filters?.dateTo) conditions.push(lte(ldoDipReadings.date, filters.dateTo));
    if (filters?.plant) conditions.push(eq(ldoDipReadings.plantName, filters.plant));

    return db.select().from(ldoDipReadings)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(ldoDipReadings.date), desc(ldoDipReadings.time));
  }

  async createLdoDipReading(reading: InsertLdoDipReading): Promise<LdoDipReading> {
    const [existing] = await db.select({ id: ldoDipReadings.id })
      .from(ldoDipReadings)
      .where(and(
        eq(ldoDipReadings.date, String(reading.date)),
        eq(ldoDipReadings.tankNumber, reading.tankNumber),
        eq(ldoDipReadings.readingType, reading.readingType),
        eq(ldoDipReadings.plantName, reading.plantName ?? "Main Plant"),
      ))
      .limit(1);
    if (existing) {
      const err = Object.assign(
        new Error(`A ${reading.readingType} dip reading for Tank ${reading.tankNumber} on ${reading.date} already exists.`),
        { code: "DUPLICATE_LDO_DIP" as const }
      );
      throw err;
    }

    const uppercased = {
      ...reading,
      notes: reading.notes?.toUpperCase(),
    };
    const [result] = await db.insert(ldoDipReadings).values(uppercased).returning();
    return result;
  }

  async updateLdoDipReading(id: number, updates: Partial<InsertLdoDipReading>): Promise<LdoDipReading | undefined> {
    const cleanUpdates: any = {};
    if (updates.date !== undefined) cleanUpdates.date = updates.date;
    if (updates.time !== undefined) cleanUpdates.time = updates.time;
    if (updates.tankNumber !== undefined) cleanUpdates.tankNumber = updates.tankNumber;
    if (updates.depthCm !== undefined) cleanUpdates.depthCm = updates.depthCm;
    if (updates.volumeLiters !== undefined) cleanUpdates.volumeLiters = updates.volumeLiters;
    if (updates.weightKg !== undefined) cleanUpdates.weightKg = updates.weightKg;
    if (updates.readingType !== undefined) cleanUpdates.readingType = updates.readingType;
    if (updates.notes !== undefined) cleanUpdates.notes = updates.notes?.toUpperCase();

    const [result] = await db.update(ldoDipReadings)
      .set(cleanUpdates)
      .where(eq(ldoDipReadings.id, id))
      .returning();
    return result;
  }

  async deleteLdoDipReading(id: number): Promise<boolean> {
    const [deleted] = await db.delete(ldoDipReadings).where(eq(ldoDipReadings.id, id)).returning();
    return !!deleted;
  }

  // --- LDO Dip Backfill (admin-only historical entry) ------------------------
  // Mirrors `upsertLdoFlowReadingsBackfill` but for physical dip-stick readings.
  // Backfill rows live in `ldo_dip_readings` alongside operator-entered manual
  // rows and are identified by a "[BACKFILL ...]" marker in `notes`. Idempotency
  // is per (date, plant, tank, opening|closing): on re-save the storage method
  // deletes the existing backfill row for that key and re-inserts. Manual rows
  // (notes without the BACKFILL marker) are NEVER overwritten — they are
  // returned as conflicts.

  private isLdoDipBackfillRow(notes: string | null | undefined): boolean {
    return !!notes && notes.toUpperCase().startsWith("[BACKFILL");
  }

  async getLdoDipReadingsForBackfill(filters: { dateFrom: string; dateTo: string; plant?: string }): Promise<LdoDipReading[]> {
    const conds = [
      gte(ldoDipReadings.date, filters.dateFrom),
      lte(ldoDipReadings.date, filters.dateTo),
    ];
    if (filters.plant) conds.push(eq(ldoDipReadings.plantName, filters.plant));

    return db.select().from(ldoDipReadings)
      .where(and(...conds))
      .orderBy(asc(ldoDipReadings.date), asc(ldoDipReadings.tankNumber), asc(ldoDipReadings.readingType), asc(ldoDipReadings.time));
  }

  async upsertLdoDipReadingsBackfill(
    rows: Array<{ date: string; plant: string; tank: number; openingDepth?: number | null; closingDepth?: number | null; remarks: string | null }>,
    actor: string,
  ): Promise<{ inserted: number; deleted: number; skipped: number; conflicts: Array<{ date: string; plant: string; tank: number; reason: string }> }> {
    let inserted = 0, deleted = 0, skipped = 0;
    const conflicts: Array<{ date: string; plant: string; tank: number; reason: string }> = [];

    await db.transaction(async (tx) => {
      for (const row of rows) {
        const tank = row.tank;
        const plant = row.plant || "Main Plant";
        const maxDepth = getLdoMaxDepth(tank);

        if (row.openingDepth != null && (row.openingDepth < 0 || row.openingDepth > maxDepth)) {
          conflicts.push({ date: row.date, plant, tank, reason: `opening depth out of range (0..${maxDepth} cm)` });
          skipped++;
          continue;
        }
        if (row.closingDepth != null && (row.closingDepth < 0 || row.closingDepth > maxDepth)) {
          conflicts.push({ date: row.date, plant, tank, reason: `closing depth out of range (0..${maxDepth} cm)` });
          skipped++;
          continue;
        }

        const existing = await tx.select().from(ldoDipReadings).where(and(
          eq(ldoDipReadings.date, row.date),
          eq(ldoDipReadings.tankNumber, tank),
          eq(ldoDipReadings.plantName, plant),
        ));

        for (const rt of ["opening", "closing"] as const) {
          const depth = rt === "opening" ? row.openingDepth : row.closingDepth;
          // undefined means this reading type was not touched — leave it alone.
          if (depth === undefined) continue;
          const sameType = existing.filter(e => e.readingType === rt);

          // Delete ALL existing rows for this plant/date/tank/type (both
          // backfill and manual) before re-inserting. Admin backfill is
          // authoritative and may overwrite operator-entered manual readings.
          for (const b of sameType) {
            await tx.delete(ldoDipReadings).where(eq(ldoDipReadings.id, b.id));
            deleted++;
          }

          if (depth != null) {
            const time = rt === "opening" ? "06:00" : "18:00";
            const volume = getLdoVolumeAtDepth(tank, depth);
            const weight = volume * LDO_DENSITY_KG_PER_LITER;
            const noteBits = [`[BACKFILL BY ${(actor || "admin").toUpperCase()}]`];
            if (row.remarks) noteBits.push(row.remarks);
            await tx.insert(ldoDipReadings).values({
              date: row.date,
              time,
              tankNumber: tank,
              depthCm: depth,
              volumeLiters: Math.round(volume * 100) / 100,
              weightKg: Math.round(weight * 100) / 100,
              readingType: rt,
              notes: noteBits.join(" ").toUpperCase(),
              plantName: plant,
            } satisfies InsertLdoDipReading);
            inserted++;
          }
        }
      }
    });

    return { inserted, deleted, skipped, conflicts };
  }

  // ============================================
  // LDO BOOK-VS-PHYSICAL RECONCILIATION
  // ============================================

  async computeLdoReconciliation(params: {
    dateFrom: string;
    dateTo: string;
    plant: string;
  }): Promise<Array<{
    date: string;
    openingDipL: number | null;
    openingDipMT: number | null;
    meterConsumptionL: number;
    receiptsL: number;
    expectedClosingL: number | null;
    expectedClosingMT: number | null;
    actualClosingDipL: number | null;
    actualClosingDipMT: number | null;
    varianceL: number | null;
    varianceMT: number | null;
    variancePct: number | null;
    hasOpeningDip: boolean;
    hasClosingDip: boolean;
    hasMeterData: boolean;
    missingOpeningTanks: number[];
    missingClosingTanks: number[];
  }>> {
    const { dateFrom, dateTo, plant } = params;

    // Fetch all dip readings for this plant up to dateTo (include pre-range data for carry-forward)
    const allDipReadings = await db.select().from(ldoDipReadings)
      .where(and(
        eq(ldoDipReadings.plantName, plant),
        lte(ldoDipReadings.date, dateTo),
      ))
      .orderBy(asc(ldoDipReadings.date), asc(ldoDipReadings.time));

    // Fetch flow readings strictly within the date range
    const flowReadings = await db.select().from(ldoFlowReadings)
      .where(and(
        eq(ldoFlowReadings.plantName, plant),
        gte(ldoFlowReadings.date, dateFrom),
        lte(ldoFlowReadings.date, dateTo),
      ))
      .orderBy(asc(ldoFlowReadings.date), asc(ldoFlowReadings.time));

    // Look up LDO material ID
    const [ldoMaterial] = await db.select().from(plantMaterials)
      .where(sql`UPPER(TRIM(${plantMaterials.name})) = 'LDO'`)
      .limit(1);

    // Fetch LDO material receipts in the date range
    let ldoReceiptRows: { date: string; quantity: number; uom: string }[] = [];
    if (ldoMaterial) {
      ldoReceiptRows = await db.select({
        date: materialReceipts.date,
        quantity: materialReceipts.quantity,
        uom: materialReceipts.uom,
      }).from(materialReceipts)
        .where(and(
          eq(materialReceipts.materialId, ldoMaterial.id),
          eq(materialReceipts.plantName, plant),
          gte(materialReceipts.date, dateFrom),
          lte(materialReceipts.date, dateTo),
        ));
    }

    // Group dip readings per tank (sorted asc by date+time for carry-forward)
    const dipByTank: Record<number, typeof allDipReadings> = { 1: [], 2: [] };
    for (const d of allDipReadings) {
      if (d.tankNumber === 1 || d.tankNumber === 2) dipByTank[d.tankNumber].push(d);
    }

    // Helper: find the most recent dip for a tank before a given date (carry-forward basis)
    const getLatestDipBefore = (tank: 1 | 2, beforeDate: string) => {
      const cands = dipByTank[tank]
        .filter(d => d.date < beforeDate)
        .sort((a, b) => {
          const dc = b.date.localeCompare(a.date);
          return dc !== 0 ? dc : (b.time || "").localeCompare(a.time || "");
        });
      return cands[0] || null;
    };

    // Helper: find a dip reading of a specific readingType on a given date for a tank
    const getDipOnDate = (tank: 1 | 2, date: string, readingType: string) => {
      return dipByTank[tank]
        .filter(d => d.date === date && d.readingType === readingType)
        .sort((a, b) => (b.time || "").localeCompare(a.time || ""))[0] || null;
    };

    // Convert receipt quantity to liters
    const receiptToL = (qty: number, uom: string) => {
      const u = uom.toLowerCase();
      if (u === "mt" || u === "ton" || u === "tons" || u === "t") return (qty * 1000) / LDO_DENSITY_KG_PER_LITER;
      if (u === "kg") return qty / LDO_DENSITY_KG_PER_LITER;
      return qty; // liters / litres / l
    };

    // Group receipts by date (total liters)
    const receiptsByDate: Record<string, number> = {};
    for (const r of ldoReceiptRows) {
      receiptsByDate[r.date] = (receiptsByDate[r.date] || 0) + receiptToL(r.quantity, r.uom);
    }

    // Group flow readings by date
    const flowByDate: Record<string, typeof flowReadings> = {};
    for (const r of flowReadings) {
      if (!flowByDate[r.date]) flowByDate[r.date] = [];
      flowByDate[r.date].push(r);
    }

    // Generate all calendar dates from dateFrom to dateTo
    const dates: string[] = [];
    const cur = new Date(dateFrom + "T00:00:00Z");
    const end = new Date(dateTo + "T00:00:00Z");
    while (cur <= end) {
      dates.push(cur.toISOString().slice(0, 10));
      cur.setUTCDate(cur.getUTCDate() + 1);
    }

    const result = [];
    for (const date of dates) {
      // Opening dip for each tank:
      //   1st choice — "opening" type reading on this date
      //   2nd choice — most recent dip reading before this date (carry-forward)
      const getOpeningDip = (tank: 1 | 2) =>
        getDipOnDate(tank, date, "opening") || getLatestDipBefore(tank, date);

      // Actual closing dip — "closing" type reading on this date
      const getClosingDip = (tank: 1 | 2) => getDipOnDate(tank, date, "closing");

      const t1Opening = getOpeningDip(1);
      const t2Opening = getOpeningDip(2);
      const t1Closing = getClosingDip(1);
      const t2Closing = getClosingDip(2);

      const hasOpeningDip = !!(t1Opening || t2Opening);
      const hasClosingDip = !!(t1Closing || t2Closing);

      const openingL = (t1Opening?.volumeLiters || 0) + (t2Opening?.volumeLiters || 0);

      // Meter consumption — pair up opening/closing readings per source group
      const dayFlow = flowByDate[date] || [];
      type Pair = { openings: typeof flowReadings; closings: typeof flowReadings };
      const pairs = new Map<string, Pair>();
      for (const r of dayFlow) {
        if (r.readingType !== "opening" && r.readingType !== "closing") continue;
        const key = r.sourceShiftLogId != null
          ? `S${r.sourceShiftLogId}::${r.tankNumber}`
          : r.sourceHeatingSessionId != null
            ? `H${r.sourceHeatingSessionId}::${r.tankNumber}`
            : `D${r.date}::${r.tankNumber}`;
        if (!pairs.has(key)) pairs.set(key, { openings: [], closings: [] });
        if (r.readingType === "opening") pairs.get(key)!.openings.push(r);
        else pairs.get(key)!.closings.push(r);
      }

      let consumptionL = 0;
      pairs.forEach((p) => {
        if (!p.openings.length || !p.closings.length) return;
        const openVal = p.openings.sort((a, b) => (a.time || "").localeCompare(b.time || ""))[0].meterReading;
        const closeVal = p.closings.sort((a, b) => (b.time || "").localeCompare(a.time || ""))[0].meterReading;
        const diff = closeVal - openVal;
        if (diff > 0) consumptionL += diff;
      });

      const receiptsL = receiptsByDate[date] || 0;
      const expectedClosingL = hasOpeningDip ? openingL - consumptionL + receiptsL : null;
      const actualClosingL = hasClosingDip
        ? (t1Closing?.volumeLiters || 0) + (t2Closing?.volumeLiters || 0)
        : null;

      const varianceL =
        expectedClosingL != null && actualClosingL != null
          ? actualClosingL - expectedClosingL
          : null;
      const variancePct =
        varianceL != null && openingL > 0
          ? Math.round((varianceL / openingL) * 1000) / 10
          : null;

      result.push({
        date,
        openingDipL: hasOpeningDip ? Math.round(openingL) : null,
        openingDipMT: hasOpeningDip ? Math.round(openingL * LDO_DENSITY_KG_PER_LITER) / 1000 : null,
        meterConsumptionL: Math.round(consumptionL),
        receiptsL: Math.round(receiptsL),
        expectedClosingL: expectedClosingL != null ? Math.round(expectedClosingL) : null,
        expectedClosingMT: expectedClosingL != null ? Math.round(expectedClosingL * LDO_DENSITY_KG_PER_LITER) / 1000 : null,
        actualClosingDipL: actualClosingL != null ? Math.round(actualClosingL) : null,
        actualClosingDipMT: actualClosingL != null ? Math.round(actualClosingL * LDO_DENSITY_KG_PER_LITER) / 1000 : null,
        varianceL: varianceL != null ? Math.round(varianceL) : null,
        varianceMT: varianceL != null ? Math.round(varianceL * LDO_DENSITY_KG_PER_LITER) / 1000 : null,
        variancePct,
        hasOpeningDip,
        hasClosingDip,
        hasMeterData: dayFlow.some(r => r.readingType === "opening" || r.readingType === "closing"),
        missingOpeningTanks: ([1, 2] as const).filter(t => (t === 1 ? !t1Opening : !t2Opening)),
        missingClosingTanks: ([1, 2] as const).filter(t => (t === 1 ? !t1Closing : !t2Closing)),
      });
    }

    return result;
  }

  // Personnel Master
  async getPersonnel(includeInactive?: boolean): Promise<Personnel[]> {
    if (includeInactive) {
      return db.select().from(personnel).orderBy(asc(personnel.name));
    }
    return db.select().from(personnel).where(eq(personnel.isActive, 1)).orderBy(asc(personnel.name));
  }

  async createPersonnel(data: InsertPersonnel): Promise<Personnel> {
    const uppercased = { ...data, name: data.name.toUpperCase() };
    const [result] = await db.insert(personnel).values(uppercased).returning();
    return result;
  }

  async updatePersonnel(id: number, data: Partial<InsertPersonnel>): Promise<Personnel | undefined> {
    const updates = { ...data };
    if (updates.name) updates.name = updates.name.toUpperCase();
    const [result] = await db.update(personnel).set(updates).where(eq(personnel.id, id)).returning();
    return result;
  }

  async togglePersonnelActive(id: number): Promise<Personnel | undefined> {
    const [existing] = await db.select().from(personnel).where(eq(personnel.id, id)).limit(1);
    if (!existing) return undefined;
    const newStatus = existing.isActive === 1 ? 0 : 1;
    const [result] = await db.update(personnel).set({ isActive: newStatus }).where(eq(personnel.id, id)).returning();
    return result;
  }

  async deletePersonnel(id: number): Promise<boolean> {
    const [result] = await db.delete(personnel).where(eq(personnel.id, id)).returning();
    return !!result;
  }

  async hasPersonnelUsageHistory(id: number): Promise<boolean> {
    // Check DPR / activity-personnel junction (FK reference)
    const [dprRow] = await db.select({ id: activityPersonnel.id })
      .from(activityPersonnel)
      .where(eq(activityPersonnel.personnelId, id))
      .limit(1);
    if (dprRow) return true;

    // Check shift-log manpower by name (shift logs store names as text, no FK)
    const [person] = await db.select({ name: personnel.name })
      .from(personnel)
      .where(eq(personnel.id, id))
      .limit(1);
    if (!person) return false;

    const [shiftRow] = await db.select({ id: plantShiftLogManpower.id })
      .from(plantShiftLogManpower)
      .where(sql`UPPER(TRIM(${plantShiftLogManpower.name})) = UPPER(TRIM(${person.name}))`)
      .limit(1);
    return !!shiftRow;
  }

  // Activity Personnel
  async saveActivityPersonnel(progressEntryId: number, personnelIds: number[]): Promise<void> {
    await db.delete(activityPersonnel).where(eq(activityPersonnel.progressEntryId, progressEntryId));
    if (personnelIds.length > 0) {
      await db.insert(activityPersonnel).values(
        personnelIds.map(personnelId => ({ progressEntryId, personnelId }))
      );
    }
  }

  async getActivityPersonnel(progressEntryIds: number[]): Promise<ActivityPersonnel[]> {
    if (progressEntryIds.length === 0) return [];
    return db.select().from(activityPersonnel).where(inArray(activityPersonnel.progressEntryId, progressEntryIds));
  }

  async migrateSupersededDprs(): Promise<{ marked: number; errors: number }> {
    const result = { marked: 0, errors: 0 };
    try {
      const supersededIds = new Set<number>();

      // Step 1: Mark originals from dpr_versions where the new version has "Edited by" (not "Copy by")
      const allVersions = await db.select().from(dprVersions);
      const allDprsList = await db.select().from(dprs);
      const dprMap = new Map(allDprsList.map(d => [d.id, d]));
      
      for (const v of allVersions) {
        const newDpr = dprMap.get(v.dprId);
        if (newDpr && /Edited by/i.test(newDpr.site)) {
          supersededIds.add(v.originalDprId);
        }
      }

      // Step 2: Handle legacy duplicates not tracked in dpr_versions
      // Group all non-superseded DPRs by baseSiteName + date, mark older ones
      const groups = new Map<string, { id: number; site: string }[]>();
      for (const dpr of allDprsList) {
        if (supersededIds.has(dpr.id)) continue;
        const baseSite = this.getBaseSiteName(dpr.site);
        const key = `${baseSite}|${dpr.date}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push({ id: dpr.id, site: dpr.site });
      }

      for (const entries of groups.values()) {
        if (entries.length <= 1) continue;
        entries.sort((a, b) => b.id - a.id);
        for (let i = 1; i < entries.length; i++) {
          supersededIds.add(entries[i].id);
        }
      }

      if (supersededIds.size > 0) {
        const idsToMark = Array.from(supersededIds);
        await db.update(dprs)
          .set({ isSuperseded: true })
          .where(inArray(dprs.id, idsToMark));
        result.marked = idsToMark.length;
        console.log(`migrateSupersededDprs: Marked ${result.marked} DPRs as superseded`);
      }
    } catch (err) {
      console.error('migrateSupersededDprs: Fatal error:', err);
      result.errors++;
    }
    return result;
  }

  // ============================================
  // PURCHASE INDENTS CRUD
  // ============================================

  async getPurchaseIndents(filters?: { dateFrom?: string; dateTo?: string; status?: string; priority?: string }): Promise<PurchaseIndentWithItems[]> {
    let conditions: any[] = [];
    if (filters?.dateFrom) conditions.push(gte(purchaseIndents.date, filters.dateFrom));
    if (filters?.dateTo) conditions.push(lte(purchaseIndents.date, filters.dateTo));
    if (filters?.status) conditions.push(eq(purchaseIndents.status, filters.status));

    const indents = await db.query.purchaseIndents.findMany({
      where: conditions.length ? and(...conditions) : undefined,
      with: { items: true },
      orderBy: desc(purchaseIndents.date),
    });

    if (filters?.priority) {
      return (indents as PurchaseIndentWithItems[]).filter(indent =>
        indent.items.some(item => item.priority === filters.priority)
      );
    }

    return indents as PurchaseIndentWithItems[];
  }

  async getPurchaseIndent(id: number): Promise<PurchaseIndentWithItems | undefined> {
    const indent = await db.query.purchaseIndents.findFirst({
      where: eq(purchaseIndents.id, id),
      with: { items: { with: { history: { orderBy: desc(purchaseIndentItemHistory.actionAt) } } } },
    });
    return indent as PurchaseIndentWithItems | undefined;
  }

  private async generateIndentNo(tx: any): Promise<string> {
    const year = new Date().getFullYear();
    const [result] = await tx.select({ count: sql<number>`count(*)` })
      .from(purchaseIndents)
      .where(sql`EXTRACT(YEAR FROM ${purchaseIndents.createdAt}) = ${year}`);
    const seq = (Number(result?.count) || 0) + 1;
    return `HLC/PI/${year}/${String(seq).padStart(4, '0')}`;
  }

  async createPurchaseIndent(data: CreatePurchaseIndentRequest): Promise<PurchaseIndentWithItems> {
    return await db.transaction(async (tx) => {
      const indentNo = await this.generateIndentNo(tx);

      const [indent] = await tx.insert(purchaseIndents).values({
        date: data.date,
        indentNo,
        proposedBy: data.proposedBy.toUpperCase(),
        raisedBy: data.raisedBy.toUpperCase(),
        status: data.status || "pending",
        remarks: data.remarks?.toUpperCase() || data.remarks,
      }).returning();

      let items: PurchaseIndentItem[] = [];
      if (data.items?.length) {
        items = await tx.insert(purchaseIndentItems).values(
          data.items.map(item => ({
            indentId: indent.id,
            description: item.description.toUpperCase(),
            qty: item.qty,
            uom: item.uom.toUpperCase(),
            purpose: item.purpose.toUpperCase(),
            priority: item.priority || "normal",
            materialId: item.materialId || null,
          }))
        ).returning();
      }

      return { ...indent, items };
    });
  }

  async approvePurchaseIndent(id: number, approvedItems: { itemId: number; approvedQty: number }[], approvedBy: string, remarks?: string): Promise<PurchaseIndentWithItems | undefined> {
    const existing = await this.getPurchaseIndent(id);
    if (!existing) return undefined;

    return await db.transaction(async (tx) => {
      const approvedAt = format(new Date(), "yyyy-MM-dd HH:mm:ss");

      await tx.update(purchaseIndents)
        .set({
          status: "approved",
          approvedBy: approvedBy.toUpperCase(),
          approvedAt,
          approvalRemarks: remarks?.toUpperCase() || remarks,
        })
        .where(eq(purchaseIndents.id, id));

      for (const ai of approvedItems) {
        await tx.update(purchaseIndentItems)
          .set({ approvedQty: ai.approvedQty })
          .where(eq(purchaseIndentItems.id, ai.itemId));
      }

      const result = await db.query.purchaseIndents.findFirst({
        where: eq(purchaseIndents.id, id),
        with: { items: true },
      });
      return result as PurchaseIndentWithItems | undefined;
    });
  }

  async rejectPurchaseIndent(id: number, reason: string, rejectedBy: string): Promise<PurchaseIndentWithItems | undefined> {
    const existing = await this.getPurchaseIndent(id);
    if (!existing) return undefined;

    await db.update(purchaseIndents)
      .set({
        status: "rejected",
        rejectionReason: reason.toUpperCase(),
        approvedBy: rejectedBy.toUpperCase(),
        approvedAt: format(new Date(), "yyyy-MM-dd HH:mm:ss"),
      })
      .where(eq(purchaseIndents.id, id));

    const result = await db.query.purchaseIndents.findFirst({
      where: eq(purchaseIndents.id, id),
      with: { items: true },
    });
    return result as PurchaseIndentWithItems | undefined;
  }

  private async checkAndCompleteIndent(indentId: number): Promise<void> {
    const allItems = await db.select().from(purchaseIndentItems)
      .where(eq(purchaseIndentItems.indentId, indentId));

    const terminalStatuses = ["PURCHASED", "PARTIAL", "NOT_PURCHASED", "CANCELLED"];
    const allTerminal = allItems.every(item =>
      item.purchaseStatus && terminalStatuses.includes(item.purchaseStatus.toUpperCase())
    );

    if (allTerminal && allItems.length > 0) {
      await db.update(purchaseIndents)
        .set({ status: "completed" })
        .where(eq(purchaseIndents.id, indentId));
    }
  }

  async updatePurchaseItemStatus(itemId: number, purchaseData: { purchaseStatus?: string; qtyPurchased?: number; vendor?: string; billNo?: string; rate?: number; amount?: number; purchaseRemarks?: string }, actionBy?: string): Promise<PurchaseIndentItem | undefined> {
    const updates: any = { ...purchaseData };
    if (updates.vendor) updates.vendor = updates.vendor.toUpperCase();
    if (updates.billNo) updates.billNo = updates.billNo.toUpperCase();
    if (updates.purchaseRemarks) updates.purchaseRemarks = updates.purchaseRemarks.toUpperCase();
    if (updates.purchaseStatus) updates.purchaseStatus = updates.purchaseStatus.toUpperCase();

    const [updatedItem] = await db.update(purchaseIndentItems)
      .set(updates)
      .where(eq(purchaseIndentItems.id, itemId))
      .returning();

    if (!updatedItem) return undefined;

    if (updates.purchaseStatus && actionBy) {
      await db.insert(purchaseIndentItemHistory).values({
        itemId,
        action: updates.purchaseStatus.toUpperCase(),
        actionBy: actionBy.toUpperCase(),
        notes: updates.purchaseRemarks || null,
        qtyValue: updates.qtyPurchased || null,
        vendor: updates.vendor || null,
        billNo: updates.billNo || null,
        rate: updates.rate || null,
        amount: updates.amount || null,
      });
    }

    await this.checkAndCompleteIndent(updatedItem.indentId);

    return updatedItem;
  }

  async cancelPurchaseItem(itemId: number, cancelledBy: string, reason: string): Promise<PurchaseIndentItem | undefined> {
    const [existingItem] = await db.select().from(purchaseIndentItems).where(eq(purchaseIndentItems.id, itemId));
    if (!existingItem) return undefined;
    const uncancellableStatuses = ["PURCHASED", "NOT_PURCHASED", "CANCELLED"];
    if (existingItem.purchaseStatus && uncancellableStatuses.includes(existingItem.purchaseStatus.toUpperCase())) {
      throw new Error(`Cannot cancel item with status: ${existingItem.purchaseStatus}`);
    }

    const now = new Date().toISOString();
    const [updatedItem] = await db.update(purchaseIndentItems)
      .set({
        purchaseStatus: "CANCELLED",
        purchaseRemarks: reason.toUpperCase(),
        cancelledBy: cancelledBy.toUpperCase(),
        cancelledAt: now,
      })
      .where(eq(purchaseIndentItems.id, itemId))
      .returning();

    if (!updatedItem) return undefined;

    await db.insert(purchaseIndentItemHistory).values({
      itemId,
      action: "CANCELLED",
      actionBy: cancelledBy.toUpperCase(),
      notes: reason.toUpperCase(),
      qtyValue: null,
      vendor: null,
      billNo: null,
      rate: null,
      amount: null,
    });

    await this.checkAndCompleteIndent(updatedItem.indentId);

    return updatedItem;
  }

  async forceCloseIndent(indentId: number, closedBy: string, reason: string): Promise<PurchaseIndentWithItems | undefined> {
    const [indent] = await db.select().from(purchaseIndents).where(eq(purchaseIndents.id, indentId));
    if (!indent) return undefined;
    if (indent.status === "completed" || indent.status === "rejected" || indent.status === "pending") {
      throw new Error(`Cannot force close indent with status: ${indent.status}`);
    }

    const allItems = await db.select().from(purchaseIndentItems)
      .where(eq(purchaseIndentItems.indentId, indentId));

    const skipStatuses = ["PURCHASED", "NOT_PURCHASED", "CANCELLED"];
    const now = new Date().toISOString();

    for (const item of allItems) {
      if (!item.purchaseStatus || !skipStatuses.includes(item.purchaseStatus.toUpperCase())) {
        await db.update(purchaseIndentItems)
          .set({
            purchaseStatus: "CANCELLED",
            purchaseRemarks: `FORCE CLOSED: ${reason.toUpperCase()}`,
            cancelledBy: closedBy.toUpperCase(),
            cancelledAt: now,
          })
          .where(eq(purchaseIndentItems.id, item.id));

        await db.insert(purchaseIndentItemHistory).values({
          itemId: item.id,
          action: "CANCELLED",
          actionBy: closedBy.toUpperCase(),
          notes: `FORCE CLOSED: ${reason.toUpperCase()}`,
          qtyValue: null,
          vendor: null,
          billNo: null,
          rate: null,
          amount: null,
        });
      }
    }

    await db.update(purchaseIndents)
      .set({ status: "completed" })
      .where(eq(purchaseIndents.id, indentId));

    return this.getPurchaseIndent(indentId);
  }

  async updatePurchaseIndent(id: number, data: CreatePurchaseIndentRequest): Promise<PurchaseIndentWithItems | undefined> {
    const existing = await this.getPurchaseIndent(id);
    if (!existing) return undefined;
    if (existing.status === "completed") {
      throw new Error(`Cannot edit indent with status: ${existing.status}`);
    }

    return await db.transaction(async (tx) => {
      const updateFields: any = {
        date: data.date,
        proposedBy: data.proposedBy.toUpperCase(),
        raisedBy: data.raisedBy.toUpperCase(),
        remarks: data.remarks?.toUpperCase() || data.remarks,
      };

      if (existing.status !== "pending") {
        updateFields.status = "pending";
        updateFields.approvedBy = null;
        updateFields.approvedAt = null;
        updateFields.approvalRemarks = null;
        updateFields.rejectionReason = null;
      }

      await tx.update(purchaseIndents)
        .set(updateFields)
        .where(eq(purchaseIndents.id, id));

      const existingItemIds = existing.items.map(i => i.id);
      if (existingItemIds.length > 0) {
        await tx.delete(purchaseIndentItemHistory).where(inArray(purchaseIndentItemHistory.itemId, existingItemIds));
      }
      await tx.delete(purchaseIndentItems).where(eq(purchaseIndentItems.indentId, id));

      let items: PurchaseIndentItem[] = [];
      if (data.items?.length) {
        items = await tx.insert(purchaseIndentItems).values(
          data.items.map(item => ({
            indentId: id,
            description: item.description.toUpperCase(),
            qty: item.qty,
            uom: item.uom.toUpperCase(),
            purpose: item.purpose.toUpperCase(),
            priority: item.priority || "normal",
            materialId: item.materialId || null,
          }))
        ).returning();
      }

      const [updatedIndent] = await tx.select().from(purchaseIndents).where(eq(purchaseIndents.id, id));
      return { ...updatedIndent, items };
    });
  }

  async setIndentNotifyMessage(id: number, message: string): Promise<void> {
    await db.update(purchaseIndents).set({ notifyMessage: message }).where(eq(purchaseIndents.id, id));
  }

  async setItemReviewerNote(itemId: number, note: string): Promise<void> {
    await db.update(purchaseIndentItems).set({ reviewerNote: note }).where(eq(purchaseIndentItems.id, itemId));
  }

  async deletePurchaseIndent(id: number): Promise<boolean> {
    const existing = await this.getPurchaseIndent(id);
    if (!existing) return false;

    await db.transaction(async (tx) => {
      const itemIds = existing.items.map(i => i.id);
      if (itemIds.length > 0) {
        await tx.delete(purchaseIndentItemHistory).where(inArray(purchaseIndentItemHistory.itemId, itemIds));
      }
      await tx.delete(purchaseIndentItems).where(eq(purchaseIndentItems.indentId, id));
      await tx.delete(purchaseIndents).where(eq(purchaseIndents.id, id));
    });
    return true;
  }

  async getItemHistory(itemId: number): Promise<PurchaseIndentItemHistoryEntry[]> {
    const history = await db.select().from(purchaseIndentItemHistory)
      .where(eq(purchaseIndentItemHistory.itemId, itemId))
      .orderBy(desc(purchaseIndentItemHistory.actionAt));
    return history;
  }

  async getProcurementReport(filters?: { dateFrom?: string; dateTo?: string; purchaseStatus?: string; purpose?: string; vendor?: string }): Promise<{ items: any[]; summary: { totalItems: number; purchased: number; partial: number; cancelled: number; notPurchased: number; pending: number; totalSpend: number; fulfillmentRate: number } }> {
    let conditions: any[] = [];
    if (filters?.dateFrom) conditions.push(gte(purchaseIndents.date, filters.dateFrom));
    if (filters?.dateTo) conditions.push(lte(purchaseIndents.date, filters.dateTo));
    if (filters?.purpose) conditions.push(eq(purchaseIndentItems.purpose, filters.purpose.toUpperCase()));
    if (filters?.vendor) conditions.push(ilike(purchaseIndentItems.vendor, `%${filters.vendor}%`));

    const rows = await db.select({
      itemId: purchaseIndentItems.id,
      indentId: purchaseIndentItems.indentId,
      indentNo: purchaseIndents.indentNo,
      indentDate: purchaseIndents.date,
      indentStatus: purchaseIndents.status,
      description: purchaseIndentItems.description,
      purpose: purchaseIndentItems.purpose,
      priority: purchaseIndentItems.priority,
      qty: purchaseIndentItems.qty,
      uom: purchaseIndentItems.uom,
      approvedQty: purchaseIndentItems.approvedQty,
      purchaseStatus: purchaseIndentItems.purchaseStatus,
      qtyPurchased: purchaseIndentItems.qtyPurchased,
      vendor: purchaseIndentItems.vendor,
      billNo: purchaseIndentItems.billNo,
      rate: purchaseIndentItems.rate,
      amount: purchaseIndentItems.amount,
      purchaseRemarks: purchaseIndentItems.purchaseRemarks,
      cancelledBy: purchaseIndentItems.cancelledBy,
      cancelledAt: purchaseIndentItems.cancelledAt,
    })
    .from(purchaseIndentItems)
    .innerJoin(purchaseIndents, eq(purchaseIndentItems.indentId, purchaseIndents.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(purchaseIndents.date), purchaseIndentItems.id);

    let filteredRows = rows;
    if (filters?.purchaseStatus) {
      if (filters.purchaseStatus === "pending") {
        filteredRows = rows.filter(r => !r.purchaseStatus);
      } else {
        filteredRows = rows.filter(r => r.purchaseStatus?.toUpperCase() === filters.purchaseStatus!.toUpperCase());
      }
    }

    const totalItems = filteredRows.length;
    const purchased = filteredRows.filter(r => r.purchaseStatus?.toUpperCase() === "PURCHASED").length;
    const partial = filteredRows.filter(r => r.purchaseStatus?.toUpperCase() === "PARTIAL").length;
    const cancelled = filteredRows.filter(r => r.purchaseStatus?.toUpperCase() === "CANCELLED").length;
    const notPurchased = filteredRows.filter(r => r.purchaseStatus?.toUpperCase() === "NOT_PURCHASED").length;
    const pending = filteredRows.filter(r => !r.purchaseStatus).length;
    const totalSpend = filteredRows.reduce((sum, r) => sum + (r.amount || 0), 0);
    const fulfilled = purchased + partial;
    const fulfillmentRate = totalItems > 0 ? Math.round((fulfilled / totalItems) * 100) : 0;

    return {
      items: filteredRows,
      summary: { totalItems, purchased, partial, cancelled, notPurchased, pending, totalSpend, fulfillmentRate },
    };
  }

  // ============================================
  // VENDOR BILLS CRUD
  // ============================================

  async getVendorBills(filters?: { dateFrom?: string; dateTo?: string; vendor?: string; status?: string }): Promise<VendorBillWithItems[]> {
    let conditions: any[] = [];
    if (filters?.dateFrom) conditions.push(gte(vendorBills.billDate, filters.dateFrom));
    if (filters?.dateTo) conditions.push(lte(vendorBills.billDate, filters.dateTo));
    if (filters?.vendor) conditions.push(eq(vendorBills.vendorName, filters.vendor.toUpperCase()));
    if (filters?.status) conditions.push(eq(vendorBills.status, filters.status));

    const bills = await db.query.vendorBills.findMany({
      where: conditions.length > 0 ? and(...conditions) : undefined,
      with: { items: true },
      orderBy: desc(vendorBills.billDate),
    });
    return bills as VendorBillWithItems[];
  }

  async getVendorBill(id: number): Promise<VendorBillWithItems | undefined> {
    const bill = await db.query.vendorBills.findFirst({
      where: eq(vendorBills.id, id),
      with: { items: true },
    });
    return bill as VendorBillWithItems | undefined;
  }

  private async generateVendorBillNo(): Promise<string> {
    const year = new Date().getFullYear();
    const existing = await db.select({ billNo: vendorBills.billNo })
      .from(vendorBills)
      .where(sql`${vendorBills.billNo} LIKE ${'HLC/VB/' + year + '/%'}`)
      .orderBy(desc(vendorBills.id));
    
    let nextNum = 1;
    if (existing.length > 0) {
      const lastNo = existing[0].billNo;
      const parts = lastNo.split('/');
      const lastNum = parseInt(parts[parts.length - 1], 10);
      if (!isNaN(lastNum)) nextNum = lastNum + 1;
    }
    return `HLC/VB/${year}/${String(nextNum).padStart(4, '0')}`;
  }

  async createVendorBill(data: CreateVendorBillRequest): Promise<VendorBillWithItems> {
    const billNo = await this.generateVendorBillNo();

    return await db.transaction(async (tx) => {
      const [bill] = await tx.insert(vendorBills).values({
        billDate: data.billDate,
        billNo,
        billType: data.billType.toUpperCase(),
        vendorName: data.vendorName.toUpperCase(),
        periodFrom: data.periodFrom,
        periodTo: data.periodTo,
        status: data.status || "draft",
        notes: data.notes?.toUpperCase() || data.notes,
        totalAmount: data.totalAmount,
        adjustmentLabel: (data as any).adjustmentLabel?.toUpperCase() || null,
        adjustmentAmount: (data as any).adjustmentAmount || 0,
        gstRateEquipment: (data as any).gstRateEquipment || null,
        gstRateMaterial: (data as any).gstRateMaterial || null,
        gstRateTransport: (data as any).gstRateTransport || null,
        gstRateLabour: (data as any).gstRateLabour || null,
        tdsRate: (data as any).tdsRate || null,
        verifiedBy: data.verifiedBy?.toUpperCase() || data.verifiedBy,
        verifiedAt: data.verifiedAt,
        approvedBy: data.approvedBy?.toUpperCase() || data.approvedBy,
        approvedAt: data.approvedAt,
        paidAt: data.paidAt,
        paymentRemarks: data.paymentRemarks?.toUpperCase() || data.paymentRemarks,
      }).returning();

      let items: VendorBillItem[] = [];
      if (data.items?.length) {
        items = await tx.insert(vendorBillItems).values(
          data.items.map(item => ({
            billId: bill.id,
            date: item.date ?? null,
            category: item.category ?? null,
            description: item.description.toUpperCase(),
            qty: item.qty,
            unit: item.unit?.toUpperCase() || item.unit,
            rate: item.rate,
            amount: item.amount,
            source: item.source || "manual",
            equipmentId: item.equipmentId,
            leadDistance: item.leadDistance ?? null,
            siteName: (item as any).siteName?.toUpperCase() || null,
          }))
        ).returning();
      }

      return { ...bill, items };
    });
  }

  async updateVendorBill(id: number, data: CreateVendorBillRequest): Promise<VendorBillWithItems | undefined> {
    const existing = await this.getVendorBill(id);
    if (!existing) return undefined;

    return await db.transaction(async (tx) => {
      const setData: any = {
          billDate: data.billDate,
          billType: data.billType.toUpperCase(),
          vendorName: data.vendorName.toUpperCase(),
          periodFrom: data.periodFrom,
          periodTo: data.periodTo,
          notes: data.notes?.toUpperCase() || data.notes,
          totalAmount: data.totalAmount,
          adjustmentLabel: (data as any).adjustmentLabel?.toUpperCase() || null,
          adjustmentAmount: (data as any).adjustmentAmount || 0,
          gstRateEquipment: (data as any).gstRateEquipment || null,
          gstRateMaterial: (data as any).gstRateMaterial || null,
          gstRateTransport: (data as any).gstRateTransport || null,
          gstRateLabour: (data as any).gstRateLabour || null,
          tdsRate: (data as any).tdsRate || null,
          paymentRemarks: data.paymentRemarks?.toUpperCase() || data.paymentRemarks,
        };
      if (data.status) {
        setData.status = data.status;
        if (data.status === "draft") {
          setData.verifiedBy = null;
          setData.verifiedAt = null;
          setData.approvedBy = null;
          setData.approvedAt = null;
        }
      }
      const [updated] = await tx.update(vendorBills)
        .set(setData)
        .where(eq(vendorBills.id, id))
        .returning();

      await tx.delete(vendorBillItems).where(eq(vendorBillItems.billId, id));

      let items: VendorBillItem[] = [];
      if (data.items?.length) {
        items = await tx.insert(vendorBillItems).values(
          data.items.map(item => ({
            billId: id,
            date: item.date ?? null,
            category: item.category ?? null,
            description: item.description.toUpperCase(),
            qty: item.qty,
            unit: item.unit?.toUpperCase() || item.unit,
            rate: item.rate,
            amount: item.amount,
            source: item.source || "manual",
            equipmentId: item.equipmentId,
            leadDistance: item.leadDistance ?? null,
            siteName: (item as any).siteName?.toUpperCase() || null,
          }))
        ).returning();
      }

      return { ...updated, items };
    });
  }

  async updateVendorBillStatus(id: number, status: string, actor: string): Promise<VendorBillWithItems | undefined> {
    const existing = await this.getVendorBill(id);
    if (!existing) return undefined;

    const validTransitions: Record<string, string[]> = {
      draft: ["verified"],
      verified: ["approved"],
      approved: ["paid"],
    };

    const allowed = validTransitions[existing.status];
    if (!allowed || !allowed.includes(status)) {
      throw new Error(`Invalid status transition from "${existing.status}" to "${status}"`);
    }

    const updates: Partial<VendorBill> = { status };
    const now = format(new Date(), "yyyy-MM-dd HH:mm:ss");
    const actorUpper = actor.toUpperCase();

    if (status === "verified") {
      updates.verifiedBy = actorUpper;
      updates.verifiedAt = now;
    } else if (status === "approved") {
      updates.approvedBy = actorUpper;
      updates.approvedAt = now;
    } else if (status === "paid") {
      updates.paidAt = now;
    }

    await db.update(vendorBills)
      .set(updates)
      .where(eq(vendorBills.id, id));

    return await this.getVendorBill(id);
  }

  async deleteVendorBill(id: number): Promise<boolean> {
    const existing = await this.getVendorBill(id);
    if (!existing) return false;

    await db.transaction(async (tx) => {
      await tx.delete(vendorBillItems).where(eq(vendorBillItems.billId, id));
      await tx.delete(vendorBills).where(eq(vendorBills.id, id));
    });

    return true;
  }

  async getVendorBillAutoItems(vendorName: string, billType: string, periodFrom: string, periodTo: string, entryTypeFilter?: string | null): Promise<Partial<InsertVendorBillItem>[]> {
    const vendorVariants = await this.resolveVendorAliases(vendorName);
    const bt = billType.toLowerCase();
    const items: Partial<InsertVendorBillItem>[] = [];

    const entryTypeLabel = (entryType: string | null) => {
      switch ((entryType || "").toLowerCase()) {
        case "hourly": return "HOURLY HIRE";
        case "daily": return "DAILY HIRE";
        case "trip_based": return "TRIP BASED";
        case "monthly": return "MONTHLY HIRE";
        case "shifting": return "MOBILIZATION";
        case "time_meter": return "TIME/METER";
        default: return "TIME/METER";
      }
    };

    const entryTypeUnit = (entryType: string | null) => {
      switch ((entryType || "").toLowerCase()) {
        case "hourly": return "HRS";
        case "daily": return "DAYS";
        case "trip_based": return "TRIPS";
        case "monthly": return "MONTHS";
        case "shifting": return "TRIP";
        default: return "HRS";
      }
    };

    const calcQty = (row: { hoursWorked?: number | null; startTime?: string | null; endTime?: string | null; numberOfTrips?: number | null; hoursOrKmRun?: number | null; entryType?: string | null }) => {
      const et = (row.entryType || "").toLowerCase();
      if (et === "shifting") return 1;
      if (et === "trip_based" && row.numberOfTrips) return row.numberOfTrips;
      if (et === "daily") return 1;
      if (et === "monthly") return 1;
      if (row.hoursWorked && row.hoursWorked > 0) return row.hoursWorked;
      if (row.hoursOrKmRun && row.hoursOrKmRun > 0) return row.hoursOrKmRun;
      if (row.startTime && row.endTime) {
        const [sh, sm] = row.startTime.split(":").map(Number);
        const [eh, em] = row.endTime.split(":").map(Number);
        if (!isNaN(sh) && !isNaN(sm) && !isNaN(eh) && !isNaN(em)) {
          const diff = (eh * 60 + em - sh * 60 - sm) / 60;
          if (diff > 0) return Math.round(diff * 100) / 100;
        }
      }
      return 0;
    };

    const calcHours = (row: { hoursWorked?: number | null; startTime?: string | null; endTime?: string | null; hoursOrKmRun?: number | null }) => {
      if (row.hoursWorked && row.hoursWorked > 0) return row.hoursWorked;
      if (row.hoursOrKmRun && row.hoursOrKmRun > 0) return row.hoursOrKmRun;
      if (row.startTime && row.endTime) {
        const [sh, sm] = row.startTime.split(":").map(Number);
        const [eh, em] = row.endTime.split(":").map(Number);
        if (!isNaN(sh) && !isNaN(sm) && !isNaN(eh) && !isNaN(em)) {
          const diff = (eh * 60 + em - sh * 60 - sm) / 60;
          if (diff > 0) return Math.round(diff * 100) / 100;
        }
      }
      return 0;
    };

    const matchesEntryTypeFilter = (entryType: string | null) => {
      if (!entryTypeFilter || entryTypeFilter === "all") return true;
      const et = (entryType || "time_meter").toLowerCase();
      if (et === "shifting") return entryTypeFilter === "shifting" || entryTypeFilter === "all";
      if (entryTypeFilter === "daily_hourly") return ["daily", "hourly", "time_meter"].includes(et);
      if (entryTypeFilter === "trip_based") return et === "trip_based";
      if (entryTypeFilter === "monthly") return et === "monthly";
      if (entryTypeFilter === "shifting") return et === "shifting";
      return true;
    };

    const vendorMatchSql = (col: any) => {
      if (vendorVariants.length === 1) {
        return sql`UPPER(TRIM(${col})) = ${vendorVariants[0]}`;
      }
      return sql`UPPER(TRIM(${col})) IN (${sql.join(vendorVariants.map(v => sql`${v}`), sql`, `)})`;
    };

    if (bt === "equipment" || bt === "all") {
      const hiredEquipment = await db.select()
        .from(equipmentMaster)
        .where(and(
          vendorMatchSql(equipmentMaster.vendorName),
          eq(equipmentMaster.ownership, "hired"),
        ));

      if (hiredEquipment.length > 0) {
        const eqIds = hiredEquipment.map(e => e.id);
        const eqMap = new Map(hiredEquipment.map(e => [e.id, e.name]));

        const dprLogs = await db.select({
          date: dprs.date,
          machine: equipmentLogs.machine,
          entryType: equipmentLogs.entryType,
          hoursWorked: equipmentLogs.hoursWorked,
          startTime: equipmentLogs.startTime,
          endTime: equipmentLogs.endTime,
          numberOfTrips: equipmentLogs.numberOfTrips,
          equipmentId: equipmentLogs.equipmentId,
          diesel: equipmentLogs.diesel,
          task: equipmentLogs.task,
          site: dprs.site,
        })
        .from(equipmentLogs)
        .innerJoin(dprs, eq(dprs.id, equipmentLogs.dprId))
        .where(and(
          inArray(equipmentLogs.equipmentId, eqIds),
          gte(dprs.date, periodFrom),
          lte(dprs.date, periodTo),
          eq(dprs.isSuperseded, false),
        ));

        for (const row of dprLogs) {
          if (!matchesEntryTypeFilter(row.entryType)) continue;
          const qty = calcQty({ hoursWorked: row.hoursWorked, startTime: row.startTime, endTime: row.endTime, numberOfTrips: row.numberOfTrips, entryType: row.entryType });
          const hours = calcHours({ hoursWorked: row.hoursWorked, startTime: row.startTime, endTime: row.endTime });
          const dieselVal = row.diesel || 0;
          if (qty > 0) {
            const machineName = eqMap.get(row.equipmentId!) || row.machine;
            const label = entryTypeLabel(row.entryType);
            const taskPart = row.task ? ` - ${row.task.toUpperCase()}` : "";
            let desc = `${machineName}${taskPart} (SITE) - ${label} | ${hours} HRS`;
            if (dieselVal > 0) desc += ` | DIESEL: ${dieselVal}L`;
            const cleanSite = row.site ? row.site.replace(/\s*[–-]\s*Edited by .*/i, "").trim().toUpperCase() : "";
            const siteLabel = cleanSite ? `SITE: ${cleanSite}` : "SITE";
            items.push({
              date: typeof row.date === "string" ? row.date : (row.date as Date).toISOString().split("T")[0],
              category: "equipment",
              description: desc,
              qty,
              unit: entryTypeUnit(row.entryType),
              source: "auto",
              equipmentId: row.equipmentId,
              siteName: siteLabel,
            });
          }
        }

        const plantUsage = await db.select()
          .from(equipmentUsage)
          .where(and(
            inArray(equipmentUsage.equipmentId, eqIds),
            gte(equipmentUsage.date, periodFrom),
            lte(equipmentUsage.date, periodTo),
          ));

        for (const row of plantUsage) {
          const et = row.entryType || "time_meter";
          if (!matchesEntryTypeFilter(et)) continue;
          const qty = calcQty({ hoursOrKmRun: row.hoursOrKmRun, startTime: row.startTime, endTime: row.endTime, numberOfTrips: row.numberOfTrips, entryType: et });
          const hours = calcHours({ hoursOrKmRun: row.hoursOrKmRun, startTime: row.startTime, endTime: row.endTime });
          const dieselVal = row.dieselIssued || 0;
          if (qty > 0) {
            const machineName = eqMap.get(row.equipmentId) || "EQUIPMENT";
            const label = entryTypeLabel(et);
            const taskPart = row.task ? ` - ${row.task.toUpperCase()}` : "";
            let desc = `${machineName}${taskPart} (PLANT) - ${label} | ${hours} HRS`;
            if (dieselVal > 0) desc += ` | DIESEL: ${dieselVal}L`;
            items.push({
              date: typeof row.date === "string" ? row.date : (row.date as Date).toISOString().split("T")[0],
              category: "equipment",
              description: desc,
              qty,
              unit: entryTypeUnit(et),
              source: "auto",
              equipmentId: row.equipmentId,
              siteName: "PLANT",
            });
          }
        }
      }

      const unlinkedConditions = [
        isNull(equipmentLogs.equipmentId),
        gte(dprs.date, periodFrom),
        lte(dprs.date, periodTo),
        eq(dprs.isSuperseded, false),
      ];
      const variantOrConditions = vendorVariants.map(v => sql`UPPER(TRIM(${equipmentLogs.machine})) LIKE '%' || ${v} || '%'`);
      if (variantOrConditions.length > 0) {
        unlinkedConditions.push(or(...variantOrConditions)!);
      }

      const unlinkedLogs = await db.select({
        date: dprs.date,
        machine: equipmentLogs.machine,
        entryType: equipmentLogs.entryType,
        hoursWorked: equipmentLogs.hoursWorked,
        startTime: equipmentLogs.startTime,
        endTime: equipmentLogs.endTime,
        numberOfTrips: equipmentLogs.numberOfTrips,
        diesel: equipmentLogs.diesel,
        task: equipmentLogs.task,
        site: dprs.site,
      })
      .from(equipmentLogs)
      .innerJoin(dprs, eq(dprs.id, equipmentLogs.dprId))
      .where(and(...unlinkedConditions));

      for (const row of unlinkedLogs) {
        if (!matchesEntryTypeFilter(row.entryType)) continue;
        const qty = calcQty({ hoursWorked: row.hoursWorked, startTime: row.startTime, endTime: row.endTime, numberOfTrips: row.numberOfTrips, entryType: row.entryType });
        const hours = calcHours({ hoursWorked: row.hoursWorked, startTime: row.startTime, endTime: row.endTime });
        const dieselVal = row.diesel || 0;
        if (qty > 0) {
          const label = entryTypeLabel(row.entryType);
          const taskPart = row.task ? ` - ${row.task.toUpperCase()}` : "";
          let desc = `${(row.machine || "EQUIPMENT").toUpperCase()}${taskPart} (SITE-UNLINKED) - ${label} | ${hours} HRS`;
          if (dieselVal > 0) desc += ` | DIESEL: ${dieselVal}L`;
          const cleanSite = row.site ? row.site.replace(/\s*[–-]\s*Edited by .*/i, "").trim().toUpperCase() : "";
          const siteLabel = cleanSite ? `SITE*: ${cleanSite}` : "SITE*";
          items.push({
            date: typeof row.date === "string" ? row.date : (row.date as Date).toISOString().split("T")[0],
            category: "equipment",
            description: desc,
            qty,
            unit: entryTypeUnit(row.entryType),
            source: "auto",
            siteName: siteLabel,
          });
        }
      }
    }

    if (bt === "material" || bt === "all") {
      const dprMaterials = await db.select({
        date: dprs.date,
        material: materialLogs.material,
        quantity: materialLogs.quantity,
        uom: materialLogs.uom,
        supplier: materialLogs.supplier,
        site: dprs.site,
      })
      .from(materialLogs)
      .innerJoin(dprs, eq(dprs.id, materialLogs.dprId))
      .where(and(
        eq(materialLogs.type, "Received"),
        vendorMatchSql(materialLogs.supplier),
        gte(dprs.date, periodFrom),
        lte(dprs.date, periodTo),
        eq(dprs.isSuperseded, false),
      ));

      for (const row of dprMaterials) {
        if (row.quantity && row.quantity > 0) {
          const cleanSite = row.site ? row.site.replace(/\s*[–-]\s*Edited by .*/i, "").trim().toUpperCase() : "";
          const siteLabel = cleanSite ? `SITE: ${cleanSite}` : "SITE";
          items.push({
            date: typeof row.date === "string" ? row.date : (row.date as Date).toISOString().split("T")[0],
            category: "material",
            description: `${(row.material || "MATERIAL").toUpperCase()} (SITE)`,
            qty: row.quantity,
            unit: row.uom || "NOS",
            source: "auto",
            siteName: siteLabel,
          });
        }
      }

      const siteTrips = await db.select()
        .from(siteMaterialTrips)
        .where(and(
          vendorMatchSql(siteMaterialTrips.supplier),
          gte(siteMaterialTrips.date, periodFrom),
          lte(siteMaterialTrips.date, periodTo),
        ));

      for (const row of siteTrips) {
        if (row.quantity && row.quantity > 0) {
          items.push({
            date: typeof row.date === "string" ? row.date : (row.date as Date).toISOString().split("T")[0],
            category: "material",
            description: `${(row.material || "MATERIAL").toUpperCase()} (SITE TRIP)`,
            qty: row.quantity,
            unit: row.uom || "NOS",
            source: "auto",
            siteName: `SITE: ${(row.site || "").toUpperCase()}`,
          });
        }
      }

      const plantReceipts = await db.select({
        date: materialReceipts.date,
        materialId: materialReceipts.materialId,
        quantity: materialReceipts.quantity,
        uom: materialReceipts.uom,
        materialName: plantMaterials.name,
      })
      .from(materialReceipts)
      .innerJoin(plantMaterials, eq(plantMaterials.id, materialReceipts.materialId))
      .where(and(
        vendorMatchSql(materialReceipts.supplier),
        gte(materialReceipts.date, periodFrom),
        lte(materialReceipts.date, periodTo),
      ));

      for (const row of plantReceipts) {
        if (row.quantity && row.quantity > 0) {
          items.push({
            date: typeof row.date === "string" ? row.date : (row.date as Date).toISOString().split("T")[0],
            category: "material",
            description: `${(row.materialName || "MATERIAL").toUpperCase()} (PLANT)`,
            qty: row.quantity,
            unit: row.uom || "NOS",
            source: "auto",
            siteName: "PLANT",
          });
        }
      }
    }

    if (bt === "transport" || bt === "all") {
      // Shifting/Mobilization entries: matched by TRANSPORT vehicle's vendor
      const shiftingTransportEquipment = await db.select()
        .from(equipmentMaster)
        .where(and(
          vendorMatchSql(equipmentMaster.vendorName),
          eq(equipmentMaster.ownership, "hired"),
        ));
      const transportEqIds = shiftingTransportEquipment.map(e => e.id);
      const transportEqMap = new Map(shiftingTransportEquipment.map(e => [e.id, `${e.name}${e.registrationNumber ? ` (${e.registrationNumber})` : ''}`]));
      
      if (transportEqIds.length > 0) {
        const shiftingEntries = await db.select()
          .from(equipmentUsage)
          .where(and(
            inArray(equipmentUsage.transportEquipmentId, transportEqIds),
            eq(equipmentUsage.entryType, "shifting"),
            gte(equipmentUsage.date, periodFrom),
            lte(equipmentUsage.date, periodTo),
          ));
        
        if (shiftingEntries.length > 0) {
          const shiftedEquipIds = [...new Set(shiftingEntries.map(e => e.equipmentId))];
          const shiftedEquipList = await db.select().from(equipmentMaster).where(inArray(equipmentMaster.id, shiftedEquipIds));
          const shiftedEqMap = new Map(shiftedEquipList.map(e => [e.id, `${e.name}${e.registrationNumber ? ` (${e.registrationNumber})` : ''}`]));
          
          for (const row of shiftingEntries) {
            if (!matchesEntryTypeFilter("shifting")) continue;
            const shiftedEquipName = shiftedEqMap.get(row.equipmentId) || "EQUIPMENT";
            const transportVehicleName = row.transportEquipmentId ? transportEqMap.get(row.transportEquipmentId) || "TRANSPORT" : "TRANSPORT";
            const shiftFrom = (row as any).shiftFrom || "?";
            const shiftTo = (row as any).shiftTo || "?";
            const desc = `MOBILIZATION: ${shiftedEquipName} (${shiftFrom} → ${shiftTo}) via ${transportVehicleName}`;
            items.push({
              date: typeof row.date === "string" ? row.date : (row.date as Date).toISOString().split("T")[0],
              category: "transport",
              description: desc,
              qty: 1,
              unit: "TRIP",
              source: "auto",
              equipmentId: row.transportEquipmentId || row.equipmentId,
              leadDistance: (row as any).transportDistance || null,
            });
          }
        }
      }

      const dispatches = await db.select()
        .from(truckDispatches)
        .where(and(
          vendorMatchSql(truckDispatches.ownerName),
          gte(truckDispatches.date, periodFrom),
          lte(truckDispatches.date, periodTo),
        ));

      for (const row of dispatches) {
        items.push({
          date: typeof row.date === "string" ? row.date : (row.date as Date).toISOString().split("T")[0],
          category: "transport",
          description: `${(row.truckNumber || "TRUCK").toUpperCase()} → ${(row.deliveryLocation || "").toUpperCase()} (${row.loadWeight || 0} MT)`,
          qty: 1,
          unit: "TRIP",
          source: "auto",
          leadDistance: null,
        });
      }

      // Material receipts where the transporter matches the vendor — allows
      // generating haulage bills for aggregate/material transport contractors.
      const transportReceipts = await db.select({
        date: materialReceipts.date,
        materialName: plantMaterials.name,
        quantity: materialReceipts.quantity,
        uom: materialReceipts.uom,
        challanNumber: materialReceipts.challanNumber,
        vehicleNumber: materialReceipts.vehicleNumber,
      })
      .from(materialReceipts)
      .innerJoin(plantMaterials, eq(plantMaterials.id, materialReceipts.materialId))
      .where(and(
        vendorMatchSql(materialReceipts.transporter),
        gte(materialReceipts.date, periodFrom),
        lte(materialReceipts.date, periodTo),
      ));

      for (const row of transportReceipts) {
        const challanPart = row.challanNumber ? ` — Challan ${row.challanNumber}` : "";
        const vehiclePart = row.vehicleNumber ? ` [${row.vehicleNumber}]` : "";
        items.push({
          date: typeof row.date === "string" ? row.date : (row.date as Date).toISOString().split("T")[0],
          category: "transport",
          description: `MATERIAL TRANSPORT: ${(row.materialName || "MATERIAL").toUpperCase()} (${row.quantity} ${row.uom})${challanPart}${vehiclePart}`,
          qty: 1,
          unit: "TRIP",
          source: "auto",
          siteName: "PLANT",
        });
      }
    }

    if (bt === "labour" || bt === "all") {
      const labRows = await db.select({
        date: dprs.date,
        category: labourLogs.category,
        gender: labourLogs.gender,
        count: labourLogs.count,
        task: labourLogs.task,
        site: dprs.site,
      })
      .from(labourLogs)
      .innerJoin(dprs, eq(dprs.id, labourLogs.dprId))
      .where(and(
        vendorMatchSql(labourLogs.contractor),
        gte(dprs.date, periodFrom),
        lte(dprs.date, periodTo),
        eq(dprs.isSuperseded, false),
      ));

      type LabKey = string;
      const groups = new Map<LabKey, { date: string; site: string; category: string; gender: string | null; count: number; tasks: Map<string, number> }>();
      for (const row of labRows) {
        if (!row.count || row.count <= 0) continue;
        const dateStr = typeof row.date === "string" ? row.date : (row.date as Date).toISOString().split("T")[0];
        const cleanSite = row.site ? row.site.replace(/\s*[–-]\s*Edited by .*/i, "").trim().toUpperCase() : "";
        const cat = (row.category || "UNSKILLED").toUpperCase().trim();
        const gender = row.gender ? row.gender.toUpperCase().trim() : null;
        const key = `${dateStr}|${cleanSite}|${cat}|${gender || ""}`;
        const grp = groups.get(key) || { date: dateStr, site: cleanSite, category: cat, gender, count: 0, tasks: new Map<string, number>() };
        grp.count += row.count;
        if (row.task) {
          const t = row.task.toUpperCase().trim();
          grp.tasks.set(t, (grp.tasks.get(t) || 0) + row.count);
        }
        groups.set(key, grp);
      }

      for (const grp of groups.values()) {
        const genderPart = grp.gender ? ` ${grp.gender}` : "";
        let topTask = "";
        let topQty = 0;
        for (const [t, q] of grp.tasks) {
          if (q > topQty) { topTask = t; topQty = q; }
        }
        const taskPart = topTask ? ` - ${topTask}` : "";
        const desc = `LABOUR ${grp.category}${genderPart}${taskPart}`;
        const siteLabel = grp.site ? `SITE: ${grp.site}` : "SITE";
        items.push({
          date: grp.date,
          category: "labour",
          description: desc,
          qty: grp.count,
          unit: "HEAD-DAY",
          source: "auto",
          siteName: siteLabel,
        });
      }

      // Plant Shift Log manpower (groups by date, plant, contractor, category, gender)
      const plantManpowerRows = await db.select({
        date: plantShiftLogs.date,
        plantName: plantShiftLogs.plantName,
        category: plantShiftLogManpower.category,
        gender: plantShiftLogManpower.gender,
      })
      .from(plantShiftLogManpower)
      .innerJoin(plantShiftLogs, eq(plantShiftLogs.id, plantShiftLogManpower.shiftLogId))
      .where(and(
        vendorMatchSql(plantShiftLogManpower.contractorName),
        gte(plantShiftLogs.date, periodFrom),
        lte(plantShiftLogs.date, periodTo),
      ));

      const plantGroups = new Map<string, { date: string; plant: string; category: string; gender: string | null; count: number }>();
      for (const row of plantManpowerRows) {
        const dateStr = typeof row.date === "string" ? row.date : (row.date as Date).toISOString().split("T")[0];
        const plant = (row.plantName || "MAIN PLANT").toUpperCase().trim();
        const cat = (row.category || "UNSKILLED").toUpperCase().trim();
        const gender = row.gender ? row.gender.toUpperCase().trim() : null;
        const key = `${dateStr}|${plant}|${cat}|${gender || ""}`;
        const grp = plantGroups.get(key) || { date: dateStr, plant, category: cat, gender, count: 0 };
        grp.count += 1;
        plantGroups.set(key, grp);
      }

      for (const grp of plantGroups.values()) {
        const genderPart = grp.gender ? ` ${grp.gender}` : "";
        const desc = `LABOUR ${grp.category}${genderPart}`;
        items.push({
          date: grp.date,
          category: "labour",
          description: desc,
          qty: grp.count,
          unit: "HEAD-DAY",
          source: "auto",
          siteName: `PLANT: ${grp.plant}`,
        });
      }
    }

    items.sort((a, b) => {
      const dateComp = (a.date || "").localeCompare(b.date || "");
      if (dateComp !== 0) return dateComp;
      const catOrder: Record<string, number> = { equipment: 1, material: 2, transport: 3, labour: 4 };
      return (catOrder[a.category || ""] || 9) - (catOrder[b.category || ""] || 9);
    });

    return items;
  }

  async getVendorNames(): Promise<string[]> {
    const names = new Set<string>();

    const eqVendors = await db.select({ name: equipmentMaster.vendorName })
      .from(equipmentMaster)
      .where(sql`${equipmentMaster.vendorName} IS NOT NULL AND ${equipmentMaster.vendorName} != ''`);
    for (const r of eqVendors) { if (r.name) names.add(r.name.toUpperCase().trim()); }

    const mrSuppliers = await db.select({ name: materialReceipts.supplier })
      .from(materialReceipts)
      .where(sql`${materialReceipts.supplier} IS NOT NULL AND ${materialReceipts.supplier} != ''`);
    for (const r of mrSuppliers) { if (r.name) names.add(r.name.toUpperCase().trim()); }

    const mlSuppliers = await db.select({ name: materialLogs.supplier })
      .from(materialLogs)
      .where(sql`${materialLogs.supplier} IS NOT NULL AND ${materialLogs.supplier} != ''`);
    for (const r of mlSuppliers) { if (r.name) names.add(r.name.toUpperCase().trim()); }

    const smtSuppliers = await db.select({ name: siteMaterialTrips.supplier })
      .from(siteMaterialTrips)
      .where(sql`${siteMaterialTrips.supplier} IS NOT NULL AND ${siteMaterialTrips.supplier} != ''`);
    for (const r of smtSuppliers) { if (r.name) names.add(r.name.toUpperCase().trim()); }

    const tdOwners = await db.select({ name: truckDispatches.ownerName })
      .from(truckDispatches)
      .where(sql`${truckDispatches.ownerName} IS NOT NULL AND ${truckDispatches.ownerName} != ''`);
    for (const r of tdOwners) { if (r.name) names.add(r.name.toUpperCase().trim()); }

    const labContractors = await db.selectDistinct({ name: labourLogs.contractor })
      .from(labourLogs)
      .where(sql`${labourLogs.contractor} IS NOT NULL AND ${labourLogs.contractor} != ''`);
    for (const r of labContractors) { if (r.name) names.add(r.name.toUpperCase().trim()); }

    const plantLabContractors = await db.selectDistinct({ name: plantShiftLogManpower.contractorName })
      .from(plantShiftLogManpower)
      .where(sql`${plantShiftLogManpower.contractorName} IS NOT NULL AND ${plantShiftLogManpower.contractorName} != ''`);
    for (const r of plantLabContractors) { if (r.name) names.add(r.name.toUpperCase().trim()); }

    const billVendors = await db.selectDistinct({ name: vendorBills.vendorName })
      .from(vendorBills)
      .where(sql`${vendorBills.vendorName} IS NOT NULL AND ${vendorBills.vendorName} != ''`);
    for (const r of billVendors) { if (r.name) names.add(r.name.toUpperCase().trim()); }

    const allAliases = await db.select().from(vendorAliases);
    const aliasToCanonical = new Map<string, string>();
    for (const a of allAliases) {
      aliasToCanonical.set(a.alias.toUpperCase().trim(), a.canonicalName.toUpperCase().trim());
    }

    const deduped = new Set<string>();
    for (const name of names) {
      const canonical = aliasToCanonical.get(name);
      deduped.add(canonical || name);
    }

    return [...deduped].sort();
  }

  async getDieselRequirements(filters?: { dateFrom?: string; dateTo?: string; status?: string }): Promise<DieselRequirementWithItems[]> {
    const results = await db.query.dieselRequirements.findMany({
      with: { items: true },
      orderBy: desc(dieselRequirements.date),
    });

    let filtered = results as DieselRequirementWithItems[];
    if (filters?.dateFrom) {
      filtered = filtered.filter(r => r.date >= filters.dateFrom!);
    }
    if (filters?.dateTo) {
      filtered = filtered.filter(r => r.date <= filters.dateTo!);
    }
    if (filters?.status) {
      filtered = filtered.filter(r => r.status === filters.status);
    }
    return filtered;
  }

  async getDieselRequirement(id: number): Promise<DieselRequirementWithItems | undefined> {
    const result = await db.query.dieselRequirements.findFirst({
      where: eq(dieselRequirements.id, id),
      with: { items: true },
    });
    return result as DieselRequirementWithItems | undefined;
  }

  async createDieselRequirement(data: CreateDieselRequirementRequest): Promise<DieselRequirementWithItems> {
    return await db.transaction(async (tx) => {
      const [requirement] = await tx.insert(dieselRequirements).values({
        date: data.date,
        raisedBy: data.raisedBy.toUpperCase(),
        totalPlanned: data.totalPlanned,
        status: data.status || "pending",
        remarks: data.remarks?.toUpperCase() || data.remarks,
      }).returning();

      let items: DieselRequirementItem[] = [];
      if (data.items?.length) {
        items = await tx.insert(dieselRequirementItems).values(
          data.items.map(item => ({
            requirementId: requirement.id,
            equipmentId: item.equipmentId,
            equipmentName: item.equipmentName.toUpperCase(),
            purpose: item.purpose?.toUpperCase() || item.purpose,
            estHours: item.estHours,
            norm: item.norm,
            plannedQty: item.plannedQty,
          }))
        ).returning();
      }

      return { ...requirement, items };
    });
  }

  async approveDieselRequirement(id: number, approvedItems: { itemId: number; approvedQty: number }[], approvedBy: string): Promise<DieselRequirementWithItems | undefined> {
    const existing = await this.getDieselRequirement(id);
    if (!existing) return undefined;

    return await db.transaction(async (tx) => {
      const approvedAt = format(new Date(), "yyyy-MM-dd HH:mm:ss");

      for (const ai of approvedItems) {
        await tx.update(dieselRequirementItems)
          .set({ approvedQty: ai.approvedQty })
          .where(eq(dieselRequirementItems.id, ai.itemId));
      }

      const updatedItems = await tx.select().from(dieselRequirementItems)
        .where(eq(dieselRequirementItems.requirementId, id));
      const totalApproved = updatedItems.reduce((sum, item) => sum + (item.approvedQty || 0), 0);

      await tx.update(dieselRequirements)
        .set({
          status: "approved",
          approvedBy: approvedBy.toUpperCase(),
          approvedAt,
          totalApproved,
        })
        .where(eq(dieselRequirements.id, id));

      const result = await db.query.dieselRequirements.findFirst({
        where: eq(dieselRequirements.id, id),
        with: { items: true },
      });
      return result as DieselRequirementWithItems | undefined;
    });
  }

  async rejectDieselRequirement(id: number, reason: string, rejectedBy: string): Promise<DieselRequirementWithItems | undefined> {
    const existing = await this.getDieselRequirement(id);
    if (!existing) return undefined;

    await db.update(dieselRequirements)
      .set({
        status: "rejected",
        rejectionReason: reason.toUpperCase(),
        approvedBy: rejectedBy.toUpperCase(),
        approvedAt: format(new Date(), "yyyy-MM-dd HH:mm:ss"),
      })
      .where(eq(dieselRequirements.id, id));

    const result = await db.query.dieselRequirements.findFirst({
      where: eq(dieselRequirements.id, id),
      with: { items: true },
    });
    return result as DieselRequirementWithItems | undefined;
  }

  async updateDieselPurchase(id: number, purchaseData: { qtyPurchased?: number; supplier?: string; billNo?: string; rate?: number; amount?: number; purchasedAt?: string; purchaseRemarks?: string }): Promise<DieselRequirementWithItems | undefined> {
    const existing = await this.getDieselRequirement(id);
    if (!existing) return undefined;

    const updates: any = { ...purchaseData };
    if (updates.supplier) updates.supplier = updates.supplier.toUpperCase();
    if (updates.billNo) updates.billNo = updates.billNo.toUpperCase();
    if (updates.purchaseRemarks) updates.purchaseRemarks = updates.purchaseRemarks.toUpperCase();
    if (!updates.purchasedAt) updates.purchasedAt = format(new Date(), "yyyy-MM-dd HH:mm:ss");
    updates.status = "purchased";

    await db.update(dieselRequirements)
      .set(updates)
      .where(eq(dieselRequirements.id, id));

    const result = await db.query.dieselRequirements.findFirst({
      where: eq(dieselRequirements.id, id),
      with: { items: true },
    });
    return result as DieselRequirementWithItems | undefined;
  }

  async updateDieselRequirement(id: number, data: CreateDieselRequirementRequest): Promise<DieselRequirementWithItems | undefined> {
    const existing = await this.getDieselRequirement(id);
    if (!existing) return undefined;

    return await db.transaction(async (tx) => {
      const updateFields: any = {
        date: data.date,
        raisedBy: data.raisedBy.toUpperCase(),
        totalPlanned: data.totalPlanned,
        remarks: data.remarks?.toUpperCase() || data.remarks,
      };

      if (existing.status !== "pending") {
        updateFields.status = "pending";
        updateFields.totalApproved = null;
        updateFields.approvedBy = null;
        updateFields.approvedAt = null;
        updateFields.rejectionReason = null;
        updateFields.qtyPurchased = null;
        updateFields.supplier = null;
        updateFields.billNo = null;
        updateFields.rate = null;
        updateFields.amount = null;
        updateFields.purchasedAt = null;
        updateFields.purchaseRemarks = null;
      }

      await tx.update(dieselRequirements)
        .set(updateFields)
        .where(eq(dieselRequirements.id, id));

      await tx.delete(dieselRequirementItems).where(eq(dieselRequirementItems.requirementId, id));

      let items: DieselRequirementItem[] = [];
      if (data.items?.length) {
        items = await tx.insert(dieselRequirementItems).values(
          data.items.map(item => ({
            requirementId: id,
            equipmentId: item.equipmentId,
            equipmentName: item.equipmentName.toUpperCase(),
            purpose: item.purpose?.toUpperCase() || item.purpose,
            estHours: item.estHours,
            norm: item.norm,
            plannedQty: item.plannedQty,
          }))
        ).returning();
      }

      const [updated] = await tx.select().from(dieselRequirements).where(eq(dieselRequirements.id, id));
      return { ...updated, items };
    });
  }

  async deleteDieselRequirement(id: number): Promise<boolean> {
    const existing = await this.getDieselRequirement(id);
    if (!existing) return false;

    await db.transaction(async (tx) => {
      await tx.delete(dieselRequirementItems).where(eq(dieselRequirementItems.requirementId, id));
      await tx.delete(dieselRequirements).where(eq(dieselRequirements.id, id));
    });
    return true;
  }

  async getDieselComparisonReport(dateFrom: string, dateTo: string): Promise<{ date: string; totalPlanned: number; totalApproved: number; totalPurchased: number; totalActualIssued: number }[]> {
    const requirements = await db.select()
      .from(dieselRequirements)
      .where(and(
        gte(dieselRequirements.date, dateFrom),
        lte(dieselRequirements.date, dateTo),
      ))
      .orderBy(asc(dieselRequirements.date));

    const dieselMat = await db.select().from(plantMaterials)
      .where(sql`LOWER(${plantMaterials.name}) = 'diesel'`)
      .limit(1);
    const dieselMaterialId = dieselMat[0]?.id;

    const usageRecords = await db.select()
      .from(equipmentUsage)
      .where(and(
        gte(equipmentUsage.date, dateFrom),
        lte(equipmentUsage.date, dateTo),
      ));

    const equipLogs = await db.select({
      diesel: equipmentLogs.diesel,
      date: dprs.date,
    })
    .from(equipmentLogs)
    .innerJoin(dprs, eq(dprs.id, equipmentLogs.dprId))
    .where(and(
      gte(dprs.date, dateFrom),
      lte(dprs.date, dateTo),
      or(eq(dprs.isSuperseded, false), isNull(dprs.isSuperseded)),
    ));

    const dateMap = new Map<string, { totalPlanned: number; totalApproved: number; totalPurchased: number; totalActualIssued: number }>();

    for (const req of requirements) {
      const existing = dateMap.get(req.date) || { totalPlanned: 0, totalApproved: 0, totalPurchased: 0, totalActualIssued: 0 };
      existing.totalPlanned += req.totalPlanned || 0;
      existing.totalApproved += req.totalApproved || 0;
      existing.totalPurchased += req.qtyPurchased || 0;
      dateMap.set(req.date, existing);
    }

    for (const usage of usageRecords) {
      const d = usage.date;
      const existing = dateMap.get(d) || { totalPlanned: 0, totalApproved: 0, totalPurchased: 0, totalActualIssued: 0 };
      existing.totalActualIssued += usage.dieselIssued || 0;
      dateMap.set(d, existing);
    }

    for (const eLog of equipLogs) {
      if (eLog.diesel && eLog.diesel > 0) {
        const d = eLog.date;
        const existing = dateMap.get(d) || { totalPlanned: 0, totalApproved: 0, totalPurchased: 0, totalActualIssued: 0 };
        existing.totalActualIssued += eLog.diesel || 0;
        dateMap.set(d, existing);
      }
    }

    return Array.from(dateMap.entries())
      .map(([date, data]) => ({ date, ...data }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  async migrateEngineerNamesToPersonnelFormat(): Promise<{ updated: number; unmatched: number; errors: number }> {
    const result = { updated: 0, unmatched: 0, errors: 0 };
    try {
      const allPersonnel = await this.getPersonnel(true);
      if (allPersonnel.length === 0) {
        console.log('migrateEngineerNamesToPersonnelFormat: No personnel found, skipping');
        return result;
      }

      const allDprsList = await db.select().from(dprs);
      const rolePattern = /\s*-\s*(ENGINEER|SUPERVISOR|ASSISTANT|FOREMAN|OTHER)\s*$/i;

      const personnelByName = new Map<string, typeof allPersonnel[0]>();
      for (const p of allPersonnel) {
        const key = p.name.trim().toUpperCase();
        if (!personnelByName.has(key)) {
          personnelByName.set(key, p);
        }
      }

      for (const dpr of allDprsList) {
        try {
          if (rolePattern.test(dpr.engineer)) continue;

          const engineerUpper = dpr.engineer.trim().toUpperCase();
          const match = personnelByName.get(engineerUpper);

          if (match) {
            const newValue = `${match.name.trim().toUpperCase()} - ${match.role.toUpperCase()}`;
            if (newValue !== dpr.engineer) {
              await db.update(dprs).set({ engineer: newValue }).where(eq(dprs.id, dpr.id));
              result.updated++;
            }
          } else {
            result.unmatched++;
          }
        } catch (err) {
          console.error(`migrateEngineerNamesToPersonnelFormat: Error processing DPR ${dpr.id}:`, err);
          result.errors++;
        }
      }

      if (result.updated > 0 || result.unmatched > 0) {
        console.log(`migrateEngineerNamesToPersonnelFormat: Updated ${result.updated}, unmatched ${result.unmatched}, errors ${result.errors}`);
      }
    } catch (err) {
      console.error('migrateEngineerNamesToPersonnelFormat: Fatal error:', err);
      result.errors++;
    }
    return result;
  }

  async migrateLegacyPlantShiftLogManpower(): Promise<{ updated: number; skipped: number; errors: number }> {
    const result = { updated: 0, skipped: 0, errors: 0 };
    try {
      const legacyRows = await db.select().from(plantShiftLogManpower).where(
        or(
          isNull(plantShiftLogManpower.contractorName),
          eq(plantShiftLogManpower.contractorName, ""),
          isNull(plantShiftLogManpower.category),
          eq(plantShiftLogManpower.category, ""),
          isNull(plantShiftLogManpower.gender),
          eq(plantShiftLogManpower.gender, ""),
        )
      );

      if (legacyRows.length === 0) {
        return result;
      }

      const allAliases = await db.select().from(vendorAliases);
      const aliasToCanonical = new Map<string, string>();
      for (const a of allAliases) {
        aliasToCanonical.set(a.alias.toUpperCase().trim(), a.canonicalName.toUpperCase().trim());
        aliasToCanonical.set(a.canonicalName.toUpperCase().trim(), a.canonicalName.toUpperCase().trim());
      }
      const canonicaliseContractor = (raw: string): string => {
        const upper = raw.toUpperCase().trim().replace(/\s+/g, " ");
        return aliasToCanonical.get(upper) || upper;
      };

      const categoryKeywords: Array<{ kw: RegExp; cat: string }> = [
        { kw: /\bMASON\b/i, cat: "MASON" },
        { kw: /\bHELPER\b/i, cat: "HELPER" },
        { kw: /\bMAZ?DOOR\b/i, cat: "MAZDOOR" },
        { kw: /\bLAB(?:OU?R(?:ER)?)?\b/i, cat: "MAZDOOR" },
        { kw: /\bCARPENTER\b/i, cat: "CARPENTER" },
        { kw: /\b(BAR[\s-]?BENDER|BARBENDER|BENDER)\b/i, cat: "BAR-BENDER" },
        { kw: /\bOPERATOR\b/i, cat: "OPERATOR" },
        { kw: /\bDRIVER\b/i, cat: "DRIVER" },
        { kw: /\bELECTRICIAN\b/i, cat: "ELECTRICIAN" },
        { kw: /\bMECHANIC\b/i, cat: "MECHANIC" },
        { kw: /\b(WATCHMAN|GUARD|SECURITY)\b/i, cat: "WATCHMAN" },
      ];
      const detectCategory = (text: string): string | null => {
        for (const { kw, cat } of categoryKeywords) {
          if (kw.test(text)) return cat;
        }
        return null;
      };

      // Try to extract an embedded contractor reference from the worker name.
      // Patterns: "RAM (RAMU CONTRACTORS)", "RAM - RAMU CONTRACTORS", "RAM / RAMU CONTRACTORS"
      const extractContractor = (name: string): string | null => {
        const parenMatch = name.match(/^.*?\s*[\(\[]\s*([^)\]]+?)\s*[\)\]]\s*$/);
        if (parenMatch && parenMatch[1].trim()) {
          return parenMatch[1].trim();
        }
        const dashMatch = name.match(/^.*?\s*[-/|]\s*([A-Za-z][A-Za-z0-9 .&'_-]{2,})\s*$/);
        if (dashMatch && dashMatch[1].trim()) {
          // Avoid eating obvious role tokens (MASON, HELPER, etc.) as contractor
          const tail = dashMatch[1].trim();
          if (!detectCategory(tail) || /CONTRACTOR|LABOUR|LABOR|SUPPLIER|TEAM|GANG|PARTY/i.test(tail)) {
            return tail;
          }
        }
        return null;
      };

      for (const row of legacyRows) {
        try {
          const rawName = String(row.name || "").trim();
          if (!rawName) {
            result.skipped++;
            continue;
          }

          const extractedContractor = extractContractor(rawName);
          const roleText = String(row.role || "");
          const combinedText = `${rawName} ${roleText}`;

          const hasContractor = !!(row.contractorName && row.contractorName.trim());
          const hasCategory = !!(row.category && row.category.trim());
          const hasGender = !!(row.gender && row.gender.trim());

          const newContractor = hasContractor
            ? canonicaliseContractor(row.contractorName as string)
            : (extractedContractor ? canonicaliseContractor(extractedContractor) : "UNKNOWN CONTRACTOR");

          const detectedCat = detectCategory(combinedText);
          const newCategory = hasCategory
            ? (row.category as string).toUpperCase().trim()
            : (detectedCat || "OTHER");

          const newGender = hasGender
            ? (row.gender as string).toUpperCase().trim()
            : "MALE";

          await db.update(plantShiftLogManpower)
            .set({ contractorName: newContractor, category: newCategory, gender: newGender })
            .where(eq(plantShiftLogManpower.id, row.id));
          result.updated++;
        } catch (err) {
          console.error(`migrateLegacyPlantShiftLogManpower: Error processing row ${row.id}:`, err);
          result.errors++;
        }
      }

      if (result.updated > 0 || result.errors > 0) {
        console.log(`migrateLegacyPlantShiftLogManpower: Updated ${result.updated}, skipped ${result.skipped}, errors ${result.errors}`);
      }
    } catch (err) {
      console.error('migrateLegacyPlantShiftLogManpower: Fatal error:', err);
      result.errors++;
    }
    return result;
  }

  async backfillShiftLogLockStatus(): Promise<{ updated: number; errors: number }> {
    const result = { updated: 0, errors: 0 };
    try {
      const res = await db.update(plantShiftLogs)
        .set({ lockStatus: "unlocked" })
        .where(eq(plantShiftLogs.lockStatus, "locked"));
      result.updated = (res as { rowCount?: number }).rowCount ?? 0;
    } catch (err) {
      console.error("backfillShiftLogLockStatus: Fatal error:", err);
      result.errors++;
    }
    return result;
  }

  async migrateLegacyGeneratorNamesToCanonical(): Promise<{ generatorLogsUpdated: number; heatingSessionsUpdated: number; errors: number }> {
    const result = { generatorLogsUpdated: 0, heatingSessionsUpdated: 0, errors: 0 };
    try {
      const allEquipment = await db.select().from(equipmentMaster);
      const canonicalByStripped = new Map<string, string>();
      for (const eq of allEquipment) {
        const name = (eq.name || "").trim();
        if (!name) continue;
        const upper = name.toUpperCase().replace(/\s+/g, " ");
        if (!/\sGENERATOR$/.test(upper)) continue;
        const stripped = upper.replace(/\s+GENERATOR$/, "").trim();
        if (!stripped) continue;
        if (!canonicalByStripped.has(stripped)) {
          canonicalByStripped.set(stripped, name);
        }
      }

      if (canonicalByStripped.size === 0) {
        return result;
      }

      const normalize = (raw: string | null | undefined): string | null => {
        if (!raw) return null;
        const trimmed = raw.trim();
        if (!trimmed) return null;
        const upper = trimmed.toUpperCase().replace(/\s+/g, " ");
        const stripped = upper.replace(/\s+GENERATOR$/, "").trim();
        const canonical = canonicalByStripped.get(stripped);
        if (!canonical) return null;
        if (trimmed === canonical) return null;
        return canonical;
      };

      const allGenLogs = await db.select().from(generatorLogs);
      for (const row of allGenLogs) {
        try {
          const newName = normalize(row.generatorName);
          if (newName) {
            await db.update(generatorLogs).set({ generatorName: newName }).where(eq(generatorLogs.id, row.id));
            result.generatorLogsUpdated++;
          }
        } catch (err) {
          console.error(`migrateLegacyGeneratorNamesToCanonical: Error updating generator_logs ${row.id}:`, err);
          result.errors++;
        }
      }

      const allHeating = await db.select().from(bitumenHeatingSessions).where(isNotNull(bitumenHeatingSessions.dgGeneratorName));
      for (const row of allHeating) {
        try {
          const newName = normalize(row.dgGeneratorName);
          if (newName) {
            await db.update(bitumenHeatingSessions).set({ dgGeneratorName: newName }).where(eq(bitumenHeatingSessions.id, row.id));
            result.heatingSessionsUpdated++;
          }
        } catch (err) {
          console.error(`migrateLegacyGeneratorNamesToCanonical: Error updating bitumen_heating_sessions ${row.id}:`, err);
          result.errors++;
        }
      }

      if (result.generatorLogsUpdated > 0 || result.heatingSessionsUpdated > 0 || result.errors > 0) {
        console.log(`migrateLegacyGeneratorNamesToCanonical: generator_logs updated ${result.generatorLogsUpdated}, bitumen_heating_sessions updated ${result.heatingSessionsUpdated}, errors ${result.errors}`);
      }
    } catch (err) {
      console.error('migrateLegacyGeneratorNamesToCanonical: Fatal error:', err);
      result.errors++;
    }
    return result;
  }

  async ensureHeatingSessionDipColumns(): Promise<void> {
    const cols = [
      "ldo_tank1_opening_dip",
      "ldo_tank1_closing_dip",
      "ldo_tank2_opening_dip",
      "ldo_tank2_closing_dip",
    ];
    for (const col of cols) {
      await db.execute(sql.raw(`ALTER TABLE bitumen_heating_sessions ADD COLUMN IF NOT EXISTS ${col} real`));
    }
    console.log("ensureHeatingSessionDipColumns: columns verified/added");
  }

  async backfillLdoFlowReadingsFromHeatingSessions(): Promise<{ sessionsScanned: number; rowsInserted: number; sessionsUpdated: number; sessionsSkipped: number; errors: number }> {
    const MIGRATION_FLAG = "backfill_ldo_flow_from_heating_sessions_v1";
    const existing = await db.select().from(appSettings).where(eq(appSettings.key, MIGRATION_FLAG)).limit(1);
    if (existing.length > 0) {
      console.log("backfillLdoFlowReadingsFromHeatingSessions: already applied, skipping.");
      return { sessionsScanned: 0, rowsInserted: 0, sessionsUpdated: 0, sessionsSkipped: 0, errors: 0 };
    }

    const result = { sessionsScanned: 0, rowsInserted: 0, sessionsUpdated: 0, sessionsSkipped: 0, errors: 0 };
    try {
      const sessions = await db.select().from(bitumenHeatingSessions).orderBy(bitumenHeatingSessions.id);
      result.sessionsScanned = sessions.length;

      for (const session of sessions) {
        try {
          const hasOpening = session.ldoTank1OpeningMeter != null;
          const hasClosing = session.ldoTank1ClosingMeter != null;

          await db.transaction(async (tx) => {
            // Always drop any rows previously tagged for this session — matches
            // upsertBitumenHeatingSession semantics so stale rows on now all-null
            // sessions get cleaned too.
            await tx.delete(ldoFlowReadings)
              .where(eq(ldoFlowReadings.sourceHeatingSessionId, session.id));

            if (!hasOpening && !hasClosing) {
              result.sessionsSkipped++;
              return;
            }

            const ldoRows: InsertLdoFlowReading[] = [];
            const startTimeStr = session.startTime || null;
            const endTimeStr = session.endTime || null;
            if (hasOpening) {
              ldoRows.push({
                date: session.date,
                time: startTimeStr,
                tankNumber: 1,
                meterReading: session.ldoTank1OpeningMeter as number,
                readingType: "opening",
                notes: `Auto from heating session #${session.id}`,
                plantName: session.plantName,
                sourceHeatingSessionId: session.id,
              });
            }
            if (hasClosing) {
              const consumed = session.ldoTank1Consumed ??
                (hasOpening
                  ? Math.max(0, (session.ldoTank1ClosingMeter as number) - (session.ldoTank1OpeningMeter as number))
                  : null);
              ldoRows.push({
                date: session.date,
                time: endTimeStr,
                tankNumber: 1,
                meterReading: session.ldoTank1ClosingMeter as number,
                readingType: "closing",
                quantityLiters: consumed,
                notes: `Auto from heating session #${session.id}`,
                plantName: session.plantName,
                sourceHeatingSessionId: session.id,
              });
            }
            if (ldoRows.length > 0) {
              // Delete ALL existing rows for the same slot keys before re-inserting,
              // regardless of sourceHeatingSessionId. Without the unique index on
              // production, onConflictDoNothing has nothing to detect — so any
              // surviving row (manual or tagged to a different session) would
              // create a duplicate. Deleting by slot key is safe here because:
              //   1. We already deleted this session's own tagged rows above.
              //   2. Sessions are processed in ascending ID order, so the
              //      highest-ID session for a given slot always wins — deterministic.
              //   3. Non-receipt rows only: readingType is always opening/closing.
              for (const row of ldoRows) {
                await tx.delete(ldoFlowReadings)
                  .where(and(
                    eq(ldoFlowReadings.date, row.date),
                    eq(ldoFlowReadings.tankNumber, row.tankNumber!),
                    eq(ldoFlowReadings.readingType, row.readingType!),
                    eq(ldoFlowReadings.plantName, row.plantName!),
                  ));
              }
              const inserted = await tx.insert(ldoFlowReadings).values(ldoRows).onConflictDoNothing().returning({ id: ldoFlowReadings.id });
              result.rowsInserted += inserted.length;
              if (inserted.length > 0) result.sessionsUpdated++;
            }
          });
        } catch (err) {
          console.error(`backfillLdoFlowReadingsFromHeatingSessions: Error processing session ${session.id}:`, err);
          result.errors++;
        }
      }

      console.log(`backfillLdoFlowReadingsFromHeatingSessions: scanned ${result.sessionsScanned}, sessions updated ${result.sessionsUpdated}, rows inserted ${result.rowsInserted}, skipped ${result.sessionsSkipped}, errors ${result.errors}`);
      if (result.errors === 0) {
        await db.insert(appSettings).values({ key: MIGRATION_FLAG, value: new Date().toISOString() }).onConflictDoNothing();
        console.log("backfillLdoFlowReadingsFromHeatingSessions: migration flag recorded, will skip on future restarts.");
      } else {
        console.warn("backfillLdoFlowReadingsFromHeatingSessions: completed with errors — migration flag NOT recorded, will retry on next restart.");
      }
    } catch (err) {
      console.error('backfillLdoFlowReadingsFromHeatingSessions: Fatal error:', err);
      result.errors++;
    }
    return result;
  }

  async deduplicateBitumenDipReadings(): Promise<{ removed: number }> {
    const MIGRATION_FLAG = "deduplicate_bitumen_dip_readings_v1";
    const existing = await db.select().from(appSettings).where(eq(appSettings.key, MIGRATION_FLAG)).limit(1);
    if (existing.length > 0) {
      console.log("deduplicateBitumenDipReadings: already applied, skipping.");
      return { removed: 0 };
    }
    try {
      const result = await db.execute(sql`
        DELETE FROM bitumen_dip_readings
        WHERE id NOT IN (
          SELECT MIN(id)
          FROM bitumen_dip_readings
          GROUP BY date, tank_number, reading_type, plant_name
        )
      `);
      const removed = (result as { rowCount?: number }).rowCount ?? 0;
      if (removed > 0) {
        console.log(`deduplicateBitumenDipReadings: removed ${removed} duplicate dip row(s)`);
      }
      await db.insert(appSettings).values({ key: MIGRATION_FLAG, value: new Date().toISOString() }).onConflictDoNothing();
      console.log("deduplicateBitumenDipReadings: migration flag recorded, will skip on future restarts.");
      return { removed };
    } catch (err) {
      console.error("deduplicateBitumenDipReadings: error — flag NOT recorded, will retry on next restart:", err);
      throw err;
    }
  }

  async deduplicateLdoDipReadings(): Promise<{ removed: number }> {
    const MIGRATION_FLAG = "deduplicate_ldo_dip_readings_v1";
    const existing = await db.select().from(appSettings).where(eq(appSettings.key, MIGRATION_FLAG)).limit(1);
    if (existing.length > 0) {
      console.log("deduplicateLdoDipReadings: already applied, skipping.");
      return { removed: 0 };
    }
    try {
      const result = await db.execute(sql`
        DELETE FROM ldo_dip_readings
        WHERE id NOT IN (
          SELECT MIN(id)
          FROM ldo_dip_readings
          GROUP BY date, tank_number, reading_type, plant_name
        )
      `);
      const removed = (result as { rowCount?: number }).rowCount ?? 0;
      if (removed > 0) {
        console.log(`deduplicateLdoDipReadings: removed ${removed} duplicate dip row(s)`);
      }
      await db.insert(appSettings).values({ key: MIGRATION_FLAG, value: new Date().toISOString() }).onConflictDoNothing();
      console.log("deduplicateLdoDipReadings: migration flag recorded, will skip on future restarts.");
      return { removed };
    } catch (err) {
      console.error("deduplicateLdoDipReadings: error — flag NOT recorded, will retry on next restart:", err);
      throw err;
    }
  }

  async deduplicateLdoFlowSlotReadings(): Promise<{ removed: number }> {
    const MIGRATION_FLAG = "deduplicate_ldo_flow_slot_readings_v1";
    const existing = await db.select().from(appSettings).where(eq(appSettings.key, MIGRATION_FLAG)).limit(1);
    if (existing.length > 0) {
      console.log("deduplicateLdoFlowSlotReadings: already applied, skipping.");
      return { removed: 0 };
    }
    try {
      const result = await db.execute(sql`
        DELETE FROM ldo_flow_readings
        WHERE id NOT IN (
          SELECT MIN(id)
          FROM ldo_flow_readings
          WHERE reading_type NOT IN ('receipt')
          GROUP BY date, tank_number, reading_type, plant_name
        )
        AND reading_type NOT IN ('receipt')
      `);
      const removed = (result as { rowCount?: number }).rowCount ?? 0;
      if (removed > 0) {
        console.log(`deduplicateLdoFlowSlotReadings: removed ${removed} duplicate slot row(s)`);
      }
      await db.insert(appSettings).values({ key: MIGRATION_FLAG, value: new Date().toISOString() }).onConflictDoNothing();
      console.log("deduplicateLdoFlowSlotReadings: migration flag recorded, will skip on future restarts.");
      return { removed };
    } catch (err) {
      console.error("deduplicateLdoFlowSlotReadings: error — flag NOT recorded, will retry on next restart:", err);
      throw err;
    }
  }

  async backfillLdoReceiptsFromMaterialReceipts(): Promise<{ receiptsScanned: number; rowsInserted: number; rowsSkipped: number; errors: number }> {
    const result = { receiptsScanned: 0, rowsInserted: 0, rowsSkipped: 0, errors: 0 };
    try {
      // Find all LDO material IDs (guard against duplicate master rows)
      const ldoMaterials = await db.select({ id: plantMaterials.id }).from(plantMaterials)
        .where(sql`UPPER(TRIM(${plantMaterials.name})) = 'LDO'`);
      if (ldoMaterials.length === 0) {
        console.log("backfillLdoReceiptsFromMaterialReceipts: No LDO material found in plant_materials, skipping.");
        return result;
      }
      const ldoMaterialIds = ldoMaterials.map(m => m.id);

      // Fetch all LDO material receipts (across all matching material IDs)
      const ldoReceipts = await db.select().from(materialReceipts)
        .where(inArray(materialReceipts.materialId, ldoMaterialIds))
        .orderBy(asc(materialReceipts.id));
      result.receiptsScanned = ldoReceipts.length;

      // Collect already-linked material receipt IDs
      const existingLinked = await db.select({ sourceMaterialReceiptId: ldoFlowReadings.sourceMaterialReceiptId })
        .from(ldoFlowReadings)
        .where(isNotNull(ldoFlowReadings.sourceMaterialReceiptId));
      const linkedSet = new Set(existingLinked.map(r => r.sourceMaterialReceiptId));

      for (const receipt of ldoReceipts) {
        if (linkedSet.has(receipt.id)) {
          result.rowsSkipped++;
          continue;
        }
        try {
          const qtyL = convertLdoQtyToLiters(receipt.quantity, receipt.uom);
          await db.insert(ldoFlowReadings).values({
            date: receipt.date,
            time: receipt.time || null,
            tankNumber: receipt.tankNumber ?? 1,
            meterReading: 0,
            readingType: "receipt",
            quantityLiters: qtyL,
            notes: `AUTO FROM MATERIAL RECEIPT #${receipt.id}`,
            plantName: receipt.plantName ?? "Main Plant",
            sourceMaterialReceiptId: receipt.id,
          });
          result.rowsInserted++;
        } catch (err) {
          console.error(`backfillLdoReceiptsFromMaterialReceipts: Error processing receipt ${receipt.id}:`, err);
          result.errors++;
        }
      }

      console.log(`backfillLdoReceiptsFromMaterialReceipts: scanned ${result.receiptsScanned}, inserted ${result.rowsInserted}, skipped ${result.rowsSkipped}, errors ${result.errors}`);
    } catch (err) {
      console.error("backfillLdoReceiptsFromMaterialReceipts: Fatal error:", err);
      result.errors++;
    }
    return result;
  }

  async listShiftLogManpowerNeedingReview(opts?: { dateFrom?: string; dateTo?: string; plantName?: string }): Promise<Array<{
    name: string;
    count: number;
    earliestDate: string;
    latestDate: string;
    currentContractors: string[];
    currentCategories: string[];
    currentGenders: string[];
    roles: string[];
    needsContractor: boolean;
    needsCategory: boolean;
    shiftLogIds: number[];
  }>> {
    const conds: any[] = [
      or(
        eq(plantShiftLogManpower.contractorName, "UNKNOWN CONTRACTOR"),
        eq(plantShiftLogManpower.category, "OTHER"),
      )!,
    ];
    if (opts?.dateFrom) conds.push(gte(plantShiftLogs.date, opts.dateFrom));
    if (opts?.dateTo) conds.push(lte(plantShiftLogs.date, opts.dateTo));
    if (opts?.plantName && opts.plantName.trim()) {
      conds.push(eq(plantShiftLogs.plantName, opts.plantName.trim()));
    }

    const rows = await db.select({
      id: plantShiftLogManpower.id,
      name: plantShiftLogManpower.name,
      role: plantShiftLogManpower.role,
      contractorName: plantShiftLogManpower.contractorName,
      category: plantShiftLogManpower.category,
      gender: plantShiftLogManpower.gender,
      date: plantShiftLogs.date,
      shiftLogId: plantShiftLogManpower.shiftLogId,
    })
      .from(plantShiftLogManpower)
      .innerJoin(plantShiftLogs, eq(plantShiftLogs.id, plantShiftLogManpower.shiftLogId))
      .where(and(...conds));

    type Group = {
      name: string;
      count: number;
      earliestDate: string;
      latestDate: string;
      currentContractors: Set<string>;
      currentCategories: Set<string>;
      currentGenders: Set<string>;
      roles: Set<string>;
      needsContractor: boolean;
      needsCategory: boolean;
      shiftLogIds: Set<number>;
    };
    const groups = new Map<string, Group>();
    for (const r of rows) {
      const nameKey = String(r.name || "").trim().toUpperCase();
      if (!nameKey) continue;
      const dateStr = typeof r.date === "string" ? r.date : (r.date as Date).toISOString().split("T")[0];
      let g = groups.get(nameKey);
      if (!g) {
        g = {
          name: nameKey,
          count: 0,
          earliestDate: dateStr,
          latestDate: dateStr,
          currentContractors: new Set(),
          currentCategories: new Set(),
          currentGenders: new Set(),
          roles: new Set(),
          needsContractor: false,
          needsCategory: false,
          shiftLogIds: new Set(),
        };
        groups.set(nameKey, g);
      }
      g.count += 1;
      if (dateStr < g.earliestDate) g.earliestDate = dateStr;
      if (dateStr > g.latestDate) g.latestDate = dateStr;
      if (r.contractorName) g.currentContractors.add(r.contractorName);
      if (r.category) g.currentCategories.add(r.category);
      if (r.gender) g.currentGenders.add(r.gender);
      if (r.role) g.roles.add(r.role);
      if (typeof r.shiftLogId === "number") g.shiftLogIds.add(r.shiftLogId);
      if (r.contractorName === "UNKNOWN CONTRACTOR") g.needsContractor = true;
      if (r.category === "OTHER") g.needsCategory = true;
    }
    return Array.from(groups.values())
      .map(g => ({
        name: g.name,
        count: g.count,
        earliestDate: g.earliestDate,
        latestDate: g.latestDate,
        currentContractors: Array.from(g.currentContractors),
        currentCategories: Array.from(g.currentCategories),
        currentGenders: Array.from(g.currentGenders),
        roles: Array.from(g.roles),
        needsContractor: g.needsContractor,
        needsCategory: g.needsCategory,
        shiftLogIds: Array.from(g.shiftLogIds),
      }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }

  // Mine past (still-active) merge batches to derive name-pair and token-pair
  // equivalences. Each non-undone batch with N source names + 1 target name
  // contributes a learned alias for every (source, target) where source !=
  // target, and for every token-position where source/target differ but the
  // remaining tokens match exactly. The cleanup screen surfaces future name
  // pairs that re-use these learned aliases as duplicate suggestions even when
  // they would otherwise fail the typo / phonetic checks.
  async getShiftLogManpowerLearnedAliases(): Promise<{
    pairs: Array<{
      a: string;
      b: string;
      count: number;
      examples: Array<{ batchId: number; from: string; to: string; actor: string; createdAt: string }>;
    }>;
    tokenPairs: Array<{
      a: string;
      b: string;
      count: number;
      examples: Array<{ batchId: number; from: string; to: string; actor: string; createdAt: string }>;
    }>;
  }> {
    const batches = await db.select({
      id: plantShiftLogManpowerRelabelBatches.id,
      fromNames: plantShiftLogManpowerRelabelBatches.fromNames,
      toName: plantShiftLogManpowerRelabelBatches.toName,
      actor: plantShiftLogManpowerRelabelBatches.actor,
      createdAt: plantShiftLogManpowerRelabelBatches.createdAt,
    })
      .from(plantShiftLogManpowerRelabelBatches)
      .where(isNull(plantShiftLogManpowerRelabelBatches.undoneAt))
      .orderBy(desc(plantShiftLogManpowerRelabelBatches.createdAt));
    // Mirror the client-side normalizeName(): strip trailing/embedded
    // punctuation and collapse whitespace so mined aliases ("MD." vs the
    // client's normalized "MD") share the same key.
    const normalize = (s: string) =>
      String(s || "")
        .toUpperCase()
        .replace(/[.,;:!?\-_/\\]+$/g, "")
        .replace(/[.,;:!?]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    const pairKey = (a: string, b: string) => (a < b ? `${a}||${b}` : `${b}||${a}`);
    // batchPairKeys[batchId] tracks pair-keys already credited to that batch
    // so two source-spellings that resolve to the same canonical pair don't
    // double-count one merge as confidence "2".
    type Example = { batchId: number; from: string; to: string; actor: string; createdAt: string };
    const MAX_EXAMPLES = 3;
    const pairCount = new Map<string, { a: string; b: string; batches: Set<number>; examples: Example[] }>();
    const tokenPairCount = new Map<string, { a: string; b: string; batches: Set<number>; examples: Example[] }>();
    // Batches arrive newest-first (orderBy desc(createdAt)); push examples in
    // arrival order and keep only the first MAX_EXAMPLES so admins see the most
    // recent merges that taught each pattern.
    for (const b of batches) {
      const to = normalize(b.toName);
      if (!to) continue;
      const createdAtIso = b.createdAt instanceof Date ? b.createdAt.toISOString() : String(b.createdAt);
      for (const rawFrom of b.fromNames || []) {
        const from = normalize(rawFrom);
        if (!from || from === to) continue;
        const k = pairKey(from, to);
        const [pa, pb] = from < to ? [from, to] : [to, from];
        let pe = pairCount.get(k);
        if (!pe) { pe = { a: pa, b: pb, batches: new Set(), examples: [] }; pairCount.set(k, pe); }
        if (!pe.batches.has(b.id) && pe.examples.length < MAX_EXAMPLES) {
          pe.examples.push({ batchId: b.id, from: rawFrom, to: b.toName, actor: b.actor, createdAt: createdAtIso });
        }
        pe.batches.add(b.id);
        const ta = from.split(/\s+/).filter(Boolean);
        const tb = to.split(/\s+/).filter(Boolean);
        if (ta.length !== tb.length) continue;
        for (let i = 0; i < ta.length; i++) {
          if (ta[i] === tb[i]) continue;
          // Only call out a token-pair equivalence when every other token
          // already matches exactly — otherwise we'd over-generalise from
          // multi-difference merges.
          let othersMatch = true;
          for (let j = 0; j < ta.length; j++) {
            if (j === i) continue;
            if (ta[j] !== tb[j]) { othersMatch = false; break; }
          }
          if (!othersMatch) continue;
          const tk = pairKey(ta[i], tb[i]);
          const [tpa, tpb] = ta[i] < tb[i] ? [ta[i], tb[i]] : [tb[i], ta[i]];
          let te = tokenPairCount.get(tk);
          if (!te) { te = { a: tpa, b: tpb, batches: new Set(), examples: [] }; tokenPairCount.set(tk, te); }
          if (!te.batches.has(b.id) && te.examples.length < MAX_EXAMPLES) {
            te.examples.push({ batchId: b.id, from: rawFrom, to: b.toName, actor: b.actor, createdAt: createdAtIso });
          }
          te.batches.add(b.id);
        }
      }
    }
    const pairs = Array.from(pairCount.values())
      .map(v => ({ a: v.a, b: v.b, count: v.batches.size, examples: v.examples }))
      .sort((x, y) => y.count - x.count || x.a.localeCompare(y.a));
    const tokenPairs = Array.from(tokenPairCount.values())
      .map(v => ({ a: v.a, b: v.b, count: v.batches.size, examples: v.examples }))
      .sort((x, y) => y.count - x.count || x.a.localeCompare(y.a));
    return { pairs, tokenPairs };
  }

  async bulkRelabelShiftLogManpowerByName(input: {
    fromNames: string[];
    toName: string;
    contractorName: string;
    category: string;
    gender: string;
    actor: string;
  }): Promise<{ updated: number; batchId: number }> {
    const fromNamesUpper = Array.from(
      new Set(
        (input.fromNames || [])
          .map(n => String(n || "").trim().toUpperCase())
          .filter(n => n.length > 0)
      )
    );
    if (fromNamesUpper.length === 0) throw new Error("At least one source worker name is required");
    const toNameTrim = String(input.toName || "").trim();
    if (!toNameTrim) throw new Error("Target (canonical) worker name is required");
    const toNameUpper = toNameTrim.toUpperCase();
    const contractorRaw = String(input.contractorName || "").trim();
    if (!contractorRaw) throw new Error("Contractor is required");
    const category = String(input.category || "").trim().toUpperCase();
    if (!category) throw new Error("Category is required");
    const gender = String(input.gender || "").trim().toUpperCase();
    if (!gender) throw new Error("Gender is required");
    const actorTrim = String(input.actor || "").trim();
    if (actorTrim.length < 2) throw new Error("Operator name (actor) is required for audit log");

    const allAliases = await db.select().from(vendorAliases);
    const aliasToCanonical = new Map<string, string>();
    for (const a of allAliases) {
      aliasToCanonical.set(a.alias.toUpperCase().trim(), a.canonicalName.toUpperCase().trim());
      aliasToCanonical.set(a.canonicalName.toUpperCase().trim(), a.canonicalName.toUpperCase().trim());
    }
    const upperContractor = contractorRaw.toUpperCase().replace(/\s+/g, " ");
    const canonicalContractor = aliasToCanonical.get(upperContractor) || upperContractor;

    return await db.transaction(async (tx) => {
      // Snapshot every matched row's current values BEFORE the update so we can
      // undo this batch later.
      const matchedRows = await tx.select({
        id: plantShiftLogManpower.id,
        name: plantShiftLogManpower.name,
        contractorName: plantShiftLogManpower.contractorName,
        category: plantShiftLogManpower.category,
        gender: plantShiftLogManpower.gender,
      })
        .from(plantShiftLogManpower)
        .where(sql`UPPER(TRIM(${plantShiftLogManpower.name})) IN (${sql.join(fromNamesUpper.map(n => sql`${n}`), sql`, `)})`);

      if (matchedRows.length === 0) {
        // Still record an empty batch so the admin sees the action attempted? No —
        // skip writing audit / batch when nothing changed.
        return { updated: 0, batchId: 0 };
      }

      const [batch] = await tx.insert(plantShiftLogManpowerRelabelBatches).values({
        actor: actorTrim,
        fromNames: fromNamesUpper,
        toName: toNameUpper,
        contractorName: canonicalContractor,
        category,
        gender,
        rowCount: matchedRows.length,
      }).returning({ id: plantShiftLogManpowerRelabelBatches.id });

      // Bulk insert per-row snapshots
      await tx.insert(plantShiftLogManpowerRelabelSnapshots).values(
        matchedRows.map(r => ({
          batchId: batch.id,
          manpowerId: r.id,
          prevName: r.name,
          prevContractorName: r.contractorName,
          prevCategory: r.category,
          prevGender: r.gender,
        }))
      );

      const result = await tx.update(plantShiftLogManpower)
        .set({
          name: toNameUpper,
          contractorName: canonicalContractor,
          category,
          gender,
        })
        .where(inArray(plantShiftLogManpower.id, matchedRows.map(r => r.id)))
        .returning({ id: plantShiftLogManpower.id });
      return { updated: result.length, batchId: batch.id };
    });
  }

  async getRecentShiftLogManpowerRelabelBatches(days: number): Promise<Array<
    PlantShiftLogManpowerRelabelBatch & { isMerge: boolean }
  >> {
    const safeDays = Math.max(1, Math.min(365, Math.floor(days || 30)));
    const cutoff = new Date(Date.now() - safeDays * 24 * 60 * 60 * 1000);
    const rows = await db.select().from(plantShiftLogManpowerRelabelBatches)
      .where(and(
        gte(plantShiftLogManpowerRelabelBatches.createdAt, cutoff),
        isNull(plantShiftLogManpowerRelabelBatches.undoneAt),
      ))
      .orderBy(desc(plantShiftLogManpowerRelabelBatches.createdAt))
      .limit(100);
    return rows.map(r => {
      const fromList = r.fromNames || [];
      const isMerge = fromList.length > 1
        || fromList.some(n => String(n || "").trim().toUpperCase() !== String(r.toName || "").trim().toUpperCase());
      return { ...r, isMerge };
    });
  }

  async undoShiftLogManpowerRelabelBatch(input: {
    batchId: number;
    actor: string;
  }): Promise<{ restored: number }> {
    const actorTrim = String(input.actor || "").trim();
    if (actorTrim.length < 2) throw new Error("Operator name (actor) is required for audit log");
    if (!Number.isFinite(input.batchId) || input.batchId <= 0) throw new Error("Invalid batchId");

    return await db.transaction(async (tx) => {
      const [batch] = await tx.select().from(plantShiftLogManpowerRelabelBatches)
        .where(eq(plantShiftLogManpowerRelabelBatches.id, input.batchId))
        .limit(1);
      if (!batch) throw new Error("Merge batch not found");
      if (batch.undoneAt) throw new Error("This merge has already been undone");
      const ageMs = Date.now() - new Date(batch.createdAt).getTime();
      if (ageMs > 30 * 24 * 60 * 60 * 1000) {
        throw new Error("This merge is older than 30 days and can no longer be undone");
      }

      const snapshots = await tx.select().from(plantShiftLogManpowerRelabelSnapshots)
        .where(eq(plantShiftLogManpowerRelabelSnapshots.batchId, input.batchId));

      // Refuse to undo if any of this batch's affected rows were touched by a
      // later (still-active) relabel batch — undoing would silently overwrite
      // the newer intentional edits. Admin must undo the newer batch first.
      const affectedIds = snapshots.map(s => s.manpowerId);
      if (affectedIds.length > 0) {
        const conflicts = await tx
          .select({
            manpowerId: plantShiftLogManpowerRelabelSnapshots.manpowerId,
            laterBatchId: plantShiftLogManpowerRelabelSnapshots.batchId,
          })
          .from(plantShiftLogManpowerRelabelSnapshots)
          .innerJoin(
            plantShiftLogManpowerRelabelBatches,
            eq(plantShiftLogManpowerRelabelBatches.id, plantShiftLogManpowerRelabelSnapshots.batchId),
          )
          .where(and(
            inArray(plantShiftLogManpowerRelabelSnapshots.manpowerId, affectedIds),
            gt(plantShiftLogManpowerRelabelSnapshots.batchId, input.batchId),
            isNull(plantShiftLogManpowerRelabelBatches.undoneAt),
          ))
          .limit(5);
        if (conflicts.length > 0) {
          const laterIds = Array.from(new Set(conflicts.map(c => c.laterBatchId))).join(", ");
          throw new Error(
            `Cannot undo: some of these worker rows were changed by a newer merge (batch ${laterIds}). Undo the newer merge first.`
          );
        }
      }

      let restored = 0;
      for (const s of snapshots) {
        const res = await tx.update(plantShiftLogManpower)
          .set({
            name: s.prevName,
            contractorName: s.prevContractorName,
            category: s.prevCategory,
            gender: s.prevGender,
          })
          .where(eq(plantShiftLogManpower.id, s.manpowerId))
          .returning({ id: plantShiftLogManpower.id });
        restored += res.length;
      }

      await tx.update(plantShiftLogManpowerRelabelBatches)
        .set({ undoneAt: new Date(), undoneBy: actorTrim })
        .where(eq(plantShiftLogManpowerRelabelBatches.id, input.batchId));

      return { restored };
    });
  }

  async listShiftLogManpowerDismissedDuplicatePairs(plantName: string): Promise<PlantShiftLogManpowerDismissedDup[]> {
    const plant = String(plantName || "").trim();
    if (!plant) throw new Error("plantName is required");
    return await db.select().from(plantShiftLogManpowerDismissedDups)
      .where(eq(plantShiftLogManpowerDismissedDups.plantName, plant))
      .orderBy(desc(plantShiftLogManpowerDismissedDups.dismissedAt));
  }

  async addShiftLogManpowerDismissedDuplicatePairs(input: {
    plantName: string;
    pairs: Array<[string, string]>;
    actor: string;
  }): Promise<{ added: number; addedPairs: Array<[string, string]> }> {
    const actorTrim = String(input.actor || "").trim();
    if (actorTrim.length < 2) throw new Error("Operator name (actor) is required for audit log");
    const plant = String(input.plantName || "").trim();
    if (!plant) throw new Error("plantName is required");
    const norm = (s: string) => String(s || "").toUpperCase().trim();
    const seen = new Set<string>();
    const values: Array<{ plantName: string; nameA: string; nameB: string; dismissedBy: string }> = [];
    for (const p of input.pairs || []) {
      if (!Array.isArray(p) || p.length !== 2) continue;
      const a = norm(p[0]);
      const b = norm(p[1]);
      if (!a || !b || a === b) continue;
      const [nameA, nameB] = a < b ? [a, b] : [b, a];
      const k = `${nameA}||${nameB}`;
      if (seen.has(k)) continue;
      seen.add(k);
      values.push({ plantName: plant, nameA, nameB, dismissedBy: actorTrim });
    }
    if (values.length === 0) return { added: 0, addedPairs: [] };
    const inserted = await db.insert(plantShiftLogManpowerDismissedDups)
      .values(values)
      .onConflictDoNothing({ target: [plantShiftLogManpowerDismissedDups.plantName, plantShiftLogManpowerDismissedDups.nameA, plantShiftLogManpowerDismissedDups.nameB] })
      .returning({ id: plantShiftLogManpowerDismissedDups.id, nameA: plantShiftLogManpowerDismissedDups.nameA, nameB: plantShiftLogManpowerDismissedDups.nameB });
    return {
      added: inserted.length,
      addedPairs: inserted.map((r) => [r.nameA, r.nameB] as [string, string]),
    };
  }

  async removeShiftLogManpowerDismissedDuplicatePair(id: number): Promise<{
    removed: boolean;
    pair: { plantName: string; nameA: string; nameB: string } | null;
  }> {
    if (!Number.isFinite(id) || id <= 0) throw new Error("Valid id is required");
    const res = await db.delete(plantShiftLogManpowerDismissedDups)
      .where(eq(plantShiftLogManpowerDismissedDups.id, id))
      .returning({
        id: plantShiftLogManpowerDismissedDups.id,
        plantName: plantShiftLogManpowerDismissedDups.plantName,
        nameA: plantShiftLogManpowerDismissedDups.nameA,
        nameB: plantShiftLogManpowerDismissedDups.nameB,
      });
    if (res.length === 0) return { removed: false, pair: null };
    const r = res[0];
    return {
      removed: true,
      pair: { plantName: r.plantName, nameA: r.nameA, nameB: r.nameB },
    };
  }

  async removeShiftLogManpowerDismissedDuplicatePairsBulk(input: {
    plantName: string;
    ids?: number[];
    olderThanDays?: number;
  }): Promise<{ removed: number; removedIds: number[]; removedPairs: Array<[string, string]> }> {
    const plant = String(input.plantName || "").trim();
    if (!plant) throw new Error("plantName is required");
    const ids = Array.isArray(input.ids)
      ? input.ids.map((n) => Number(n)).filter((n) => Number.isFinite(n) && n > 0)
      : [];
    const olderThanDays = Number(input.olderThanDays);
    const hasOlderThan = Number.isFinite(olderThanDays) && olderThanDays >= 0;
    if (ids.length === 0 && !hasOlderThan) {
      throw new Error("Either ids or olderThanDays must be provided");
    }
    const conditions = [eq(plantShiftLogManpowerDismissedDups.plantName, plant)];
    if (ids.length > 0) {
      conditions.push(inArray(plantShiftLogManpowerDismissedDups.id, ids));
    }
    if (hasOlderThan) {
      const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);
      conditions.push(lt(plantShiftLogManpowerDismissedDups.dismissedAt, cutoff));
    }
    const res = await db.delete(plantShiftLogManpowerDismissedDups)
      .where(and(...conditions))
      .returning({
        id: plantShiftLogManpowerDismissedDups.id,
        nameA: plantShiftLogManpowerDismissedDups.nameA,
        nameB: plantShiftLogManpowerDismissedDups.nameB,
      });
    return {
      removed: res.length,
      removedIds: res.map((r) => r.id),
      removedPairs: res.map((r) => [r.nameA, r.nameB] as [string, string]),
    };
  }

  async addShiftLogManpowerDupActivity(input: {
    actor: string;
    plantName: string;
    action: "dismiss" | "restore" | "bulk_restore";
    pairs: Array<[string, string]>;
  }): Promise<void> {
    const actorTrim = String(input.actor || "").trim();
    const plant = String(input.plantName || "").trim();
    if (!actorTrim || !plant) return;
    const cleanPairs = (input.pairs || [])
      .filter((p) => Array.isArray(p) && p.length === 2 && p[0] && p[1])
      .map((p) => [String(p[0]), String(p[1])] as [string, string]);
    if (cleanPairs.length === 0) return;
    await db.insert(plantShiftLogManpowerDupActivity).values({
      actor: actorTrim,
      plantName: plant,
      action: input.action,
      pairs: cleanPairs,
      pairCount: cleanPairs.length,
    });
  }

  async getRecentShiftLogManpowerDupActivity(days: number): Promise<PlantShiftLogManpowerDupActivity[]> {
    const safeDays = Math.max(1, Math.min(365, Math.floor(days || 30)));
    const cutoff = new Date(Date.now() - safeDays * 24 * 60 * 60 * 1000);
    return await db.select().from(plantShiftLogManpowerDupActivity)
      .where(gte(plantShiftLogManpowerDupActivity.createdAt, cutoff))
      .orderBy(desc(plantShiftLogManpowerDupActivity.createdAt))
      .limit(200);
  }

  async listShiftLogManpowerCustomAliases(): Promise<PlantShiftLogManpowerCustomAlias[]> {
    return await db.select().from(plantShiftLogManpowerCustomAliases)
      .orderBy(desc(plantShiftLogManpowerCustomAliases.createdAt));
  }

  async addShiftLogManpowerCustomAlias(input: {
    tokenA: string;
    tokenB: string;
    kind: "alias" | "suppress_learned" | "suppress_learned_pair";
    actor: string;
  }): Promise<{ added: boolean; alias: PlantShiftLogManpowerCustomAlias | null }> {
    const actorTrim = String(input.actor || "").trim();
    if (actorTrim.length < 2) throw new Error("Operator name (actor) is required for audit log");
    if (
      input.kind !== "alias"
      && input.kind !== "suppress_learned"
      && input.kind !== "suppress_learned_pair"
    ) {
      throw new Error("kind must be 'alias', 'suppress_learned', or 'suppress_learned_pair'");
    }
    // Token-pair kinds collapse all non-alphanumerics (one token only).
    // Full-name pair suppression preserves the inner whitespace structure so
    // it can be matched against the normalized full-name pairs surfaced by
    // getShiftLogManpowerLearnedAliases (which collapse punctuation but keep
    // word boundaries).
    const normToken = (s: string) =>
      String(s || "")
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "")
        .trim();
    const normFullName = (s: string) =>
      String(s || "")
        .toUpperCase()
        .replace(/[.,;:!?\-_/\\]+$/g, "")
        .replace(/[.,;:!?]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    const norm = input.kind === "suppress_learned_pair" ? normFullName : normToken;
    const a0 = norm(input.tokenA);
    const b0 = norm(input.tokenB);
    if (!a0 || !b0) throw new Error("Both tokens must contain at least one letter or digit");
    if (a0 === b0) throw new Error("Tokens must be different");
    const [tokenA, tokenB] = a0 < b0 ? [a0, b0] : [b0, a0];
    const inserted = await db.insert(plantShiftLogManpowerCustomAliases)
      .values({ tokenA, tokenB, kind: input.kind, createdBy: actorTrim })
      .onConflictDoNothing({
        target: [
          plantShiftLogManpowerCustomAliases.tokenA,
          plantShiftLogManpowerCustomAliases.tokenB,
          plantShiftLogManpowerCustomAliases.kind,
        ],
      })
      .returning();
    if (inserted.length === 0) return { added: false, alias: null };
    return { added: true, alias: inserted[0] };
  }

  async deleteShiftLogManpowerCustomAlias(id: number): Promise<{
    removed: boolean;
    tokenA: string | null;
    tokenB: string | null;
    kind: string | null;
  }> {
    if (!Number.isFinite(id) || id <= 0) throw new Error("Valid id is required");
    const res = await db.delete(plantShiftLogManpowerCustomAliases)
      .where(eq(plantShiftLogManpowerCustomAliases.id, id))
      .returning({
        id: plantShiftLogManpowerCustomAliases.id,
        tokenA: plantShiftLogManpowerCustomAliases.tokenA,
        tokenB: plantShiftLogManpowerCustomAliases.tokenB,
        kind: plantShiftLogManpowerCustomAliases.kind,
      });
    if (res.length === 0) {
      return { removed: false, tokenA: null, tokenB: null, kind: null };
    }
    const r = res[0];
    return { removed: true, tokenA: r.tokenA, tokenB: r.tokenB, kind: r.kind };
  }

  async addShiftLogManpowerAliasActivity(input: {
    actor: string;
    action: "add" | "remove";
    kind: "alias" | "suppress_learned" | "suppress_learned_pair";
    tokenA: string;
    tokenB: string;
  }): Promise<void> {
    const actorTrim = String(input.actor || "").trim();
    const tokenA = String(input.tokenA || "").trim();
    const tokenB = String(input.tokenB || "").trim();
    if (!actorTrim || !tokenA || !tokenB) return;
    if (input.action !== "add" && input.action !== "remove") return;
    if (
      input.kind !== "alias"
      && input.kind !== "suppress_learned"
      && input.kind !== "suppress_learned_pair"
    ) return;
    await db.insert(plantShiftLogManpowerAliasActivity).values({
      actor: actorTrim,
      action: input.action,
      kind: input.kind,
      tokenA,
      tokenB,
    });
  }

  async getRecentShiftLogManpowerAliasActivity(days: number): Promise<PlantShiftLogManpowerAliasActivity[]> {
    const safeDays = Math.max(1, Math.min(365, Math.floor(days || 30)));
    const cutoff = new Date(Date.now() - safeDays * 24 * 60 * 60 * 1000);
    return await db.select().from(plantShiftLogManpowerAliasActivity)
      .where(gte(plantShiftLogManpowerAliasActivity.createdAt, cutoff))
      .orderBy(desc(plantShiftLogManpowerAliasActivity.createdAt))
      .limit(200);
  }

  async bulkRevertShiftLogManpowerAliasActivities(input: {
    actor: string;
    activities: Array<{
      action: "add" | "remove";
      kind: "alias" | "suppress_learned" | "suppress_learned_pair";
      tokenA: string;
      tokenB: string;
    }>;
  }): Promise<{
    reverted: number;
    skipped: number;
    appliedActivities: Array<{ action: "add" | "remove"; kind: "alias" | "suppress_learned" | "suppress_learned_pair"; tokenA: string; tokenB: string }>;
  }> {
    const actorTrim = String(input.actor || "").trim();
    if (actorTrim.length < 2) throw new Error("Operator name (actor) is required for audit log");
    let reverted = 0;
    let skipped = 0;
    const appliedActivities: Array<{ action: "add" | "remove"; kind: "alias" | "suppress_learned" | "suppress_learned_pair"; tokenA: string; tokenB: string }> = [];
    for (const a of input.activities) {
      if (a.action === "add") {
        const rows = await db.select().from(plantShiftLogManpowerCustomAliases)
          .where(and(
            eq(plantShiftLogManpowerCustomAliases.tokenA, a.tokenA),
            eq(plantShiftLogManpowerCustomAliases.tokenB, a.tokenB),
            eq(plantShiftLogManpowerCustomAliases.kind, a.kind),
          ))
          .limit(1);
        if (rows.length === 0) { skipped++; continue; }
        await db.delete(plantShiftLogManpowerCustomAliases)
          .where(eq(plantShiftLogManpowerCustomAliases.id, rows[0].id));
        try {
          await db.insert(plantShiftLogManpowerAliasActivity).values({
            actor: actorTrim,
            action: "remove",
            kind: a.kind,
            tokenA: a.tokenA,
            tokenB: a.tokenB,
          });
        } catch (auditErr) {
          console.error("shift-log-manpower bulk-revert-alias audit write failed (remove):", auditErr);
        }
        appliedActivities.push({ action: a.action, kind: a.kind, tokenA: a.tokenA, tokenB: a.tokenB });
        reverted++;
      } else {
        const result = await this.addShiftLogManpowerCustomAlias({
          tokenA: a.tokenA,
          tokenB: a.tokenB,
          kind: a.kind,
          actor: actorTrim,
        });
        if (!result.added) { skipped++; continue; }
        if (result.alias) {
          try {
            await db.insert(plantShiftLogManpowerAliasActivity).values({
              actor: actorTrim,
              action: "add",
              kind: a.kind,
              tokenA: result.alias.tokenA,
              tokenB: result.alias.tokenB,
            });
          } catch (auditErr) {
            console.error("shift-log-manpower bulk-revert-alias audit write failed (add):", auditErr);
          }
          appliedActivities.push({ action: a.action, kind: a.kind, tokenA: result.alias.tokenA, tokenB: result.alias.tokenB });
        }
        reverted++;
      }
    }
    return { reverted, skipped, appliedActivities };
  }

  async getVendorAliases(): Promise<VendorAlias[]> {
    return await db.select().from(vendorAliases).orderBy(asc(vendorAliases.canonicalName));
  }

  async addVendorAlias(canonicalName: string, alias: string): Promise<VendorAlias> {
    const [result] = await db.insert(vendorAliases).values({
      canonicalName: canonicalName.toUpperCase().trim(),
      alias: alias.toUpperCase().trim(),
    }).returning();
    return result;
  }

  async deleteVendorAlias(id: number): Promise<boolean> {
    const result = await db.delete(vendorAliases).where(eq(vendorAliases.id, id)).returning();
    return result.length > 0;
  }

  async resolveVendorAliases(vendorName: string): Promise<string[]> {
    const upper = vendorName.toUpperCase().trim();
    const allAliases = await db.select().from(vendorAliases);
    const names = new Set<string>();
    names.add(upper);
    for (const a of allAliases) {
      if (a.canonicalName === upper || a.alias === upper) {
        names.add(a.canonicalName);
        names.add(a.alias);
      }
    }
    const relatedCanonicals = [...names];
    for (const a of allAliases) {
      if (relatedCanonicals.includes(a.canonicalName)) {
        names.add(a.alias);
      }
    }
    return [...names];
  }

  async discoverVendors(billType: string, periodFrom: string, periodTo: string): Promise<{
    vendorName: string;
    recordCount: number;
    categories: string[];
    existingBill: { id: number; billNo: string; status: string } | null;
  }[]> {
    const bt = billType.toLowerCase();
    const vendorRecords = new Map<string, { count: number; categories: Set<string> }>();

    const allAliases = await db.select().from(vendorAliases);
    const aliasToCanonical = new Map<string, string>();
    for (const a of allAliases) {
      aliasToCanonical.set(a.alias.toUpperCase().trim(), a.canonicalName.toUpperCase().trim());
    }

    const resolveCanonical = (name: string): string => {
      const upper = name.toUpperCase().trim();
      return aliasToCanonical.get(upper) || upper;
    };

    const addRecord = (rawName: string, category: string) => {
      if (!rawName || !rawName.trim()) return;
      const canonical = resolveCanonical(rawName);
      const existing = vendorRecords.get(canonical) || { count: 0, categories: new Set<string>() };
      existing.count++;
      existing.categories.add(category);
      vendorRecords.set(canonical, existing);
    };

    if (bt === "equipment" || bt === "all") {
      const hiredEquipment = await db.select()
        .from(equipmentMaster)
        .where(and(
          eq(equipmentMaster.ownership, "hired"),
          sql`${equipmentMaster.vendorName} IS NOT NULL AND ${equipmentMaster.vendorName} != ''`,
        ));

      if (hiredEquipment.length > 0) {
        const eqIdToVendor = new Map(hiredEquipment.map(e => [e.id, e.vendorName!]));
        const eqIds = hiredEquipment.map(e => e.id);

        const dprLogs = await db.select({
          equipmentId: equipmentLogs.equipmentId,
        })
        .from(equipmentLogs)
        .innerJoin(dprs, eq(dprs.id, equipmentLogs.dprId))
        .where(and(
          inArray(equipmentLogs.equipmentId, eqIds),
          gte(dprs.date, periodFrom),
          lte(dprs.date, periodTo),
          eq(dprs.isSuperseded, false),
        ));

        for (const row of dprLogs) {
          const vendor = eqIdToVendor.get(row.equipmentId!);
          if (vendor) addRecord(vendor, "equipment");
        }

        const plantUsage = await db.select({
          equipmentId: equipmentUsage.equipmentId,
        })
        .from(equipmentUsage)
        .where(and(
          inArray(equipmentUsage.equipmentId, eqIds),
          gte(equipmentUsage.date, periodFrom),
          lte(equipmentUsage.date, periodTo),
        ));

        for (const row of plantUsage) {
          const vendor = eqIdToVendor.get(row.equipmentId);
          if (vendor) addRecord(vendor, "equipment");
        }
      }
    }

    if (bt === "material" || bt === "all") {
      const dprMaterials = await db.select({
        supplier: materialLogs.supplier,
      })
      .from(materialLogs)
      .innerJoin(dprs, eq(dprs.id, materialLogs.dprId))
      .where(and(
        eq(materialLogs.type, "Received"),
        sql`${materialLogs.supplier} IS NOT NULL AND ${materialLogs.supplier} != ''`,
        gte(dprs.date, periodFrom),
        lte(dprs.date, periodTo),
        eq(dprs.isSuperseded, false),
      ));

      for (const row of dprMaterials) {
        if (row.supplier) addRecord(row.supplier, "material");
      }

      const siteTrips = await db.select({
        supplier: siteMaterialTrips.supplier,
      })
      .from(siteMaterialTrips)
      .where(and(
        sql`${siteMaterialTrips.supplier} IS NOT NULL AND ${siteMaterialTrips.supplier} != ''`,
        gte(siteMaterialTrips.date, periodFrom),
        lte(siteMaterialTrips.date, periodTo),
      ));

      for (const row of siteTrips) {
        if (row.supplier) addRecord(row.supplier, "material");
      }

      const plantReceipts = await db.select({
        supplier: materialReceipts.supplier,
      })
      .from(materialReceipts)
      .where(and(
        sql`${materialReceipts.supplier} IS NOT NULL AND ${materialReceipts.supplier} != ''`,
        gte(materialReceipts.date, periodFrom),
        lte(materialReceipts.date, periodTo),
      ));

      for (const row of plantReceipts) {
        if (row.supplier) addRecord(row.supplier, "material");
      }
    }

    if (bt === "transport" || bt === "all") {
      const dispatches = await db.select({
        ownerName: truckDispatches.ownerName,
      })
      .from(truckDispatches)
      .where(and(
        sql`${truckDispatches.ownerName} IS NOT NULL AND ${truckDispatches.ownerName} != ''`,
        gte(truckDispatches.date, periodFrom),
        lte(truckDispatches.date, periodTo),
      ));

      for (const row of dispatches) {
        if (row.ownerName) addRecord(row.ownerName, "transport");
      }
    }

    if (bt === "labour" || bt === "all") {
      const labRows = await db.select({
        contractor: labourLogs.contractor,
      })
      .from(labourLogs)
      .innerJoin(dprs, eq(dprs.id, labourLogs.dprId))
      .where(and(
        sql`${labourLogs.contractor} IS NOT NULL AND ${labourLogs.contractor} != ''`,
        gte(dprs.date, periodFrom),
        lte(dprs.date, periodTo),
        eq(dprs.isSuperseded, false),
      ));

      for (const row of labRows) {
        if (row.contractor) addRecord(row.contractor, "labour");
      }

      const plantLabRows = await db.select({
        contractor: plantShiftLogManpower.contractorName,
      })
      .from(plantShiftLogManpower)
      .innerJoin(plantShiftLogs, eq(plantShiftLogs.id, plantShiftLogManpower.shiftLogId))
      .where(and(
        sql`${plantShiftLogManpower.contractorName} IS NOT NULL AND ${plantShiftLogManpower.contractorName} != ''`,
        gte(plantShiftLogs.date, periodFrom),
        lte(plantShiftLogs.date, periodTo),
      ));

      for (const row of plantLabRows) {
        if (row.contractor) addRecord(row.contractor, "labour");
      }
    }

    const existingBills = await db.select({
      id: vendorBills.id,
      vendorName: vendorBills.vendorName,
      billNo: vendorBills.billNo,
      billType: vendorBills.billType,
      status: vendorBills.status,
      periodFrom: vendorBills.periodFrom,
      periodTo: vendorBills.periodTo,
    })
    .from(vendorBills);

    const results: {
      vendorName: string;
      recordCount: number;
      categories: string[];
      existingBill: { id: number; billNo: string; status: string } | null;
    }[] = [];

    for (const [canonical, data] of Array.from(vendorRecords.entries())) {
      const vendorVariantsArr = [canonical];
      for (const a of allAliases) {
        if (a.canonicalName.toUpperCase().trim() === canonical) {
          vendorVariantsArr.push(a.alias.toUpperCase().trim());
        }
      }

      let matchedBill: { id: number; billNo: string; status: string } | null = null;
      for (const bill of existingBills) {
        const billVendorUpper = bill.vendorName.toUpperCase().trim();
        const billTypeMatch = bt === "all" || bill.billType.toLowerCase() === bt || bill.billType.toLowerCase() === "all";
        if (vendorVariantsArr.includes(billVendorUpper) && billTypeMatch) {
          const hasOverlap = bill.periodFrom && bill.periodTo &&
            bill.periodFrom <= periodTo && bill.periodTo >= periodFrom;
          if (hasOverlap || (!bill.periodFrom && !bill.periodTo)) {
            matchedBill = { id: bill.id, billNo: bill.billNo, status: bill.status };
            break;
          }
        }
      }

      results.push({
        vendorName: canonical,
        recordCount: data.count,
        categories: Array.from(data.categories),
        existingBill: matchedBill,
      });
    }

    results.sort((a, b) => b.recordCount - a.recordCount);
    return results;
  }

  async exportTable(tableName: string): Promise<any | null> {
    switch (tableName) {
      case "equipment_master":
        return db.select().from(equipmentMaster);
      case "vendor_aliases":
        return db.select().from(vendorAliases);
      case "parties":
        return db.select().from(parties);
      case "plant_materials":
        return db.select().from(plantMaterials);
      case "mix_templates": {
        const templates = await db.select().from(mixTemplates);
        const components = await db.select().from(mixTemplateComponents);
        return { templates, components };
      }
      case "equipment_usage":
        return db.select().from(equipmentUsage);
      case "truck_dispatches":
        return db.select().from(truckDispatches);
      case "material_receipts":
        return db.select().from(materialReceipts);
      case "material_issues":
        return db.select().from(materialIssues);
      case "dprs": {
        const dprRows = await db.select().from(dprs);
        const progress = await db.select().from(progressEntries);
        const eqLogs = await db.select().from(equipmentLogs);
        const matLogs = await db.select().from(materialLogs);
        const labLogs = await db.select().from(labourLogs);
        return { dprs: dprRows, progressEntries: progress, equipmentLogs: eqLogs, materialLogs: matLogs, labourLogs: labLogs };
      }
      case "stock_ledger":
        return db.select().from(stockLedger);
      case "stock_balances":
        return db.select().from(stockBalances);
      case "vendor_bills": {
        const bills = await db.select().from(vendorBills);
        const items = await db.select().from(vendorBillItems);
        return { bills, items };
      }
      case "purchase_indents": {
        const indents = await db.select().from(purchaseIndents);
        const items = await db.select().from(purchaseIndentItems);
        const history = await db.select().from(purchaseIndentItemHistory);
        return { indents, items, history };
      }
      case "diesel_requirements": {
        const reqs = await db.select().from(dieselRequirements);
        const items = await db.select().from(dieselRequirementItems);
        return { requirements: reqs, items };
      }
      case "sites":
        return db.select().from(sites);
      default:
        return null;
    }
  }

  async importData(data: Record<string, any>): Promise<{ imported: string[]; skipped: string[]; errors: string[] }> {
    const imported: string[] = [];
    const skipped: string[] = [];
    const errors: string[] = [];

    const convertDateStrings = (obj: any) => {
      const result = { ...obj };
      for (const key of Object.keys(result)) {
        if (typeof result[key] === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(result[key])) {
          result[key] = new Date(result[key]);
        }
      }
      return result;
    };

    const upsertRows = async (table: any, rows: any[], tableName: string) => {
      if (!rows || !Array.isArray(rows) || rows.length === 0) {
        skipped.push(tableName);
        return;
      }
      try {
        for (const rawRow of rows) {
          const row = convertDateStrings(rawRow);
          const { id, ...rest } = row;
          if (id) {
            const existing = await db.select().from(table).where(eq(table.id, id)).limit(1);
            if (existing.length > 0) {
              await db.update(table).set(rest).where(eq(table.id, id));
            } else {
              await db.insert(table).values(row).onConflictDoNothing();
            }
          } else {
            await db.insert(table).values(rest).onConflictDoNothing();
          }
        }
        imported.push(`${tableName} (${rows.length} rows)`);
      } catch (err: any) {
        errors.push(`${tableName}: ${err.message}`);
      }
    };

    if (data.parties) await upsertRows(parties, data.parties, "parties");
    if (data.sites) await upsertRows(sites, data.sites, "sites");
    if (data.plant_materials) await upsertRows(plantMaterials, data.plant_materials, "plant_materials");
    if (data.equipment_master) await upsertRows(equipmentMaster, data.equipment_master, "equipment_master");
    if (data.vendor_aliases) await upsertRows(vendorAliases, data.vendor_aliases, "vendor_aliases");

    if (data.mix_templates) {
      if (data.mix_templates.templates) await upsertRows(mixTemplates, data.mix_templates.templates, "mix_templates");
      if (data.mix_templates.components) await upsertRows(mixTemplateComponents, data.mix_templates.components, "mix_template_components");
    }

    if (data.material_receipts) await upsertRows(materialReceipts, data.material_receipts, "material_receipts");
    if (data.material_issues) await upsertRows(materialIssues, data.material_issues, "material_issues");
    if (data.truck_dispatches) await upsertRows(truckDispatches, data.truck_dispatches, "truck_dispatches");
    if (data.equipment_usage) await upsertRows(equipmentUsage, data.equipment_usage, "equipment_usage");

    if (data.dprs) {
      if (data.dprs.dprs) await upsertRows(dprs, data.dprs.dprs, "dprs");
      if (data.dprs.progressEntries) await upsertRows(progressEntries, data.dprs.progressEntries, "progress_entries");
      if (data.dprs.equipmentLogs) await upsertRows(equipmentLogs, data.dprs.equipmentLogs, "equipment_logs");
      if (data.dprs.materialLogs) await upsertRows(materialLogs, data.dprs.materialLogs, "material_logs");
      if (data.dprs.labourLogs) await upsertRows(labourLogs, data.dprs.labourLogs, "labour_logs");
    }

    if (data.stock_ledger) await upsertRows(stockLedger, data.stock_ledger, "stock_ledger");
    if (data.stock_balances) await upsertRows(stockBalances, data.stock_balances, "stock_balances");

    if (data.vendor_bills) {
      if (data.vendor_bills.bills) await upsertRows(vendorBills, data.vendor_bills.bills, "vendor_bills");
      if (data.vendor_bills.items) await upsertRows(vendorBillItems, data.vendor_bills.items, "vendor_bill_items");
    }

    if (data.purchase_indents) {
      if (data.purchase_indents.indents) await upsertRows(purchaseIndents, data.purchase_indents.indents, "purchase_indents");
      if (data.purchase_indents.items) await upsertRows(purchaseIndentItems, data.purchase_indents.items, "purchase_indent_items");
      if (data.purchase_indents.history) await upsertRows(purchaseIndentItemHistory, data.purchase_indents.history, "purchase_indent_item_history");
    }

    if (data.diesel_requirements) {
      if (data.diesel_requirements.requirements) await upsertRows(dieselRequirements, data.diesel_requirements.requirements, "diesel_requirements");
      if (data.diesel_requirements.items) await upsertRows(dieselRequirementItems, data.diesel_requirements.items, "diesel_requirement_items");
    }

    await this.resetAllSequences();

    return { imported, skipped, errors };
  }

  async resetAllSequences(): Promise<void> {
    const tables = [
      "dprs", "progress_entries", "equipment_logs", "material_logs", "labour_logs",
      "plant_reports", "parties", "plant_materials", "material_opening_stocks",
      "mix_types", "mix_templates", "mix_template_components",
      "equipment_master", "material_receipts", "truck_dispatches",
      "equipment_usage", "generator_logs", "ldo_logs",
      "stock_ledger", "material_issues", "material_returns", "site_material_trips",
      "stock_balances", "vendor_bills", "vendor_bill_items", "vendor_aliases",
      "notifications", "push_subscriptions", "app_settings", "personnel", "personnel_assignments",
      "purchase_indents", "purchase_indent_items", "purchase_indent_item_history",
      "diesel_requirements", "diesel_requirement_items", "sites",
      "ldo_flow_meter_readings"
    ];
    for (const table of tables) {
      try {
        await db.execute(sql.raw(
          `SELECT setval(pg_get_serial_sequence('${table}', 'id'), COALESCE((SELECT MAX(id) FROM "${table}"), 1))`
        ));
      } catch (_e) {
      }
    }
  }
  async getVendorRateCards(vendorName?: string): Promise<VendorRateCard[]> {
    if (vendorName) {
      const variants = await this.resolveVendorAliases(vendorName);
      const conditions = variants.map(v => sql`UPPER(TRIM(${vendorRateCards.vendorName})) = ${v}`);
      return db.select().from(vendorRateCards).where(or(...conditions)).orderBy(vendorRateCards.vendorName, vendorRateCards.category, vendorRateCards.itemKey);
    }
    return db.select().from(vendorRateCards).orderBy(vendorRateCards.vendorName, vendorRateCards.category, vendorRateCards.itemKey);
  }

  async upsertVendorRateCard(data: InsertVendorRateCard): Promise<VendorRateCard> {
    const upperVendor = data.vendorName.toUpperCase().trim();
    const upperKey = data.itemKey.toUpperCase().trim();
    const existing = await db.select().from(vendorRateCards)
      .where(and(
        sql`UPPER(TRIM(${vendorRateCards.vendorName})) = ${upperVendor}`,
        sql`UPPER(TRIM(${vendorRateCards.itemKey})) = ${upperKey}`,
        eq(vendorRateCards.category, data.category),
      ));
    if (existing.length > 0) {
      const [updated] = await db.update(vendorRateCards)
        .set({ rate: data.rate, unit: data.unit, itemLabel: data.itemLabel, notes: data.notes, updatedAt: new Date() })
        .where(eq(vendorRateCards.id, existing[0].id))
        .returning();
      return updated;
    }
    const [created] = await db.insert(vendorRateCards).values({
      ...data,
      vendorName: upperVendor,
      itemKey: upperKey,
    }).returning();
    return created;
  }

  async deleteVendorRateCard(id: number): Promise<boolean> {
    const result = await db.delete(vendorRateCards).where(eq(vendorRateCards.id, id)).returning();
    return result.length > 0;
  }

  async discoverVendorItems(vendorName: string): Promise<{ itemKey: string; itemLabel: string; category: string; unit: string; rate: number | null; rateCardId: number | null }[]> {
    const vendorVariants = await this.resolveVendorAliases(vendorName);
    const vendorMatchSql = (col: any) => {
      if (vendorVariants.length === 1) {
        return sql`UPPER(TRIM(${col})) = ${vendorVariants[0]}`;
      }
      return sql`UPPER(TRIM(${col})) IN (${sql.join(vendorVariants.map(v => sql`${v}`), sql`, `)})`;
    };

    const entryTypeLabel = (et: string) => {
      switch (et.toLowerCase()) {
        case "hourly": return "HOURLY HIRE";
        case "daily": return "DAILY HIRE";
        case "trip_based": return "TRIP BASED";
        case "monthly": return "MONTHLY HIRE";
        case "shifting": return "MOBILIZATION";
        case "time_meter": return "TIME/METER";
        default: return "TIME/METER";
      }
    };
    const entryTypeUnit = (et: string) => {
      switch (et.toLowerCase()) {
        case "hourly": return "HRS";
        case "daily": return "DAYS";
        case "trip_based": return "TRIPS";
        case "monthly": return "MONTHS";
        case "shifting": return "TRIP";
        default: return "HRS";
      }
    };
    const canonicalizeEqName = (name: string) => canonicalizeMachineType(name).toUpperCase().trim().replace(/\s+/g, "_");
    const canonicalizeMatName = (name: string) => name.toUpperCase().trim().replace(/\s+/g, "_");

    const itemMap = new Map<string, { itemKey: string; itemLabel: string; category: string; unit: string }>();

    const hiredEquipment = await db.select()
      .from(equipmentMaster)
      .where(and(
        vendorMatchSql(equipmentMaster.vendorName),
        eq(equipmentMaster.ownership, "hired"),
      ));

    if (hiredEquipment.length > 0) {
      const eqIds = hiredEquipment.map(e => e.id);
      const eqMap = new Map(hiredEquipment.map(e => [e.id, e.name]));

      const dprEntryTypes = await db.selectDistinct({
        equipmentId: equipmentLogs.equipmentId,
        entryType: equipmentLogs.entryType,
      })
      .from(equipmentLogs)
      .innerJoin(dprs, eq(dprs.id, equipmentLogs.dprId))
      .where(and(
        inArray(equipmentLogs.equipmentId, eqIds),
        eq(dprs.isSuperseded, false),
      ));

      for (const row of dprEntryTypes) {
        const et = row.entryType || "time_meter";
        const rawName = eqMap.get(row.equipmentId!) || "EQUIPMENT";
        const canonical = canonicalizeMachineType(rawName).toUpperCase().trim();
        const unit = entryTypeUnit(et);
        const key = `EQ_${canonical.replace(/\s+/g, "_")}_${unit}`;
        if (!itemMap.has(key)) {
          itemMap.set(key, {
            itemKey: key,
            itemLabel: `${canonical} - ${entryTypeLabel(et)}`,
            category: "equipment",
            unit,
          });
        }
      }

      const plantEntryTypes = await db.selectDistinct({
        equipmentId: equipmentUsage.equipmentId,
        entryType: equipmentUsage.entryType,
      })
      .from(equipmentUsage)
      .where(inArray(equipmentUsage.equipmentId, eqIds));

      for (const row of plantEntryTypes) {
        const et = row.entryType || "time_meter";
        const rawName = eqMap.get(row.equipmentId) || "EQUIPMENT";
        const canonical = canonicalizeMachineType(rawName).toUpperCase().trim();
        const unit = entryTypeUnit(et);
        const key = `EQ_${canonical.replace(/\s+/g, "_")}_${unit}`;
        if (!itemMap.has(key)) {
          itemMap.set(key, {
            itemKey: key,
            itemLabel: `${canonical} - ${entryTypeLabel(et)}`,
            category: "equipment",
            unit,
          });
        }
      }
    }

    const addMaterial = (matName: string, uom: string | null) => {
      const name = (matName || "MATERIAL").toUpperCase().trim();
      const unit = (uom || "NOS").toUpperCase().trim();
      const key = `MAT_${canonicalizeMatName(name)}_${unit}`;
      if (!itemMap.has(key)) {
        itemMap.set(key, {
          itemKey: key,
          itemLabel: name,
          category: "material",
          unit,
        });
      }
    };

    const dprMaterials = await db.selectDistinct({
      material: materialLogs.material,
      uom: materialLogs.uom,
    })
    .from(materialLogs)
    .innerJoin(dprs, eq(dprs.id, materialLogs.dprId))
    .where(and(
      eq(materialLogs.type, "Received"),
      vendorMatchSql(materialLogs.supplier),
      eq(dprs.isSuperseded, false),
    ));

    for (const row of dprMaterials) {
      addMaterial(row.material || "MATERIAL", row.uom);
    }

    const siteTrips = await db.selectDistinct({
      material: siteMaterialTrips.material,
      uom: siteMaterialTrips.uom,
    })
    .from(siteMaterialTrips)
    .where(vendorMatchSql(siteMaterialTrips.supplier));

    for (const row of siteTrips) {
      addMaterial(row.material || "MATERIAL", row.uom);
    }

    const plantReceipts = await db.selectDistinct({
      materialName: plantMaterials.name,
      uom: materialReceipts.uom,
    })
    .from(materialReceipts)
    .innerJoin(plantMaterials, eq(plantMaterials.id, materialReceipts.materialId))
    .where(vendorMatchSql(materialReceipts.supplier));

    for (const row of plantReceipts) {
      addMaterial(row.materialName || "MATERIAL", row.uom);
    }

    const transportEq = hiredEquipment.length > 0 ? hiredEquipment : await db.select()
      .from(equipmentMaster)
      .where(and(
        vendorMatchSql(equipmentMaster.vendorName),
        eq(equipmentMaster.ownership, "hired"),
      ));
    const transportEqIds = transportEq.map(e => e.id);
    if (transportEqIds.length > 0) {
      const shiftingItems = await db.selectDistinct({
        transportEquipmentId: equipmentUsage.transportEquipmentId,
      })
      .from(equipmentUsage)
      .where(and(
        inArray(equipmentUsage.transportEquipmentId, transportEqIds),
        eq(equipmentUsage.entryType, "shifting"),
      ));

      const transportMachineTypes = new Set<string>();
      for (const row of shiftingItems) {
        if (row.transportEquipmentId) {
          const teq = transportEq.find(e => e.id === row.transportEquipmentId);
          const rawName = teq ? teq.name : "TRANSPORT";
          const canonical = canonicalizeMachineType(rawName).toUpperCase().trim();
          transportMachineTypes.add(canonical);
        }
      }

      for (const canonical of transportMachineTypes) {
        const key = `EQ_${canonical.replace(/\s+/g, "_")}_TRIP`;
        if (!itemMap.has(key)) {
          itemMap.set(key, {
            itemKey: key,
            itemLabel: `${canonical} - TRANSPORT`,
            category: "transport",
            unit: "TRIP",
          });
        }
      }
    }

    const labCombos = await db.selectDistinct({
      category: labourLogs.category,
      gender: labourLogs.gender,
    })
    .from(labourLogs)
    .innerJoin(dprs, eq(dprs.id, labourLogs.dprId))
    .where(and(
      vendorMatchSql(labourLogs.contractor),
      eq(dprs.isSuperseded, false),
    ));

    const plantLabCombos = await db.selectDistinct({
      category: plantShiftLogManpower.category,
      gender: plantShiftLogManpower.gender,
    })
    .from(plantShiftLogManpower)
    .where(vendorMatchSql(plantShiftLogManpower.contractorName));

    const allLabCombos: { category: string | null; gender: string | null }[] = [...labCombos, ...plantLabCombos];

    for (const row of allLabCombos) {
      const cat = (row.category || "UNSKILLED").toUpperCase().trim();
      const gender = row.gender ? row.gender.toUpperCase().trim() : null;
      const keySuffix = gender ? `${cat}_${gender}` : cat;
      const key = `LAB_${keySuffix}`;
      const labelGender = gender ? ` ${gender}` : "";
      if (!itemMap.has(key)) {
        itemMap.set(key, {
          itemKey: key,
          itemLabel: `LABOUR ${cat}${labelGender}`,
          category: "labour",
          unit: "HEAD-DAY",
        });
      }
    }

    const vendorBillConds = vendorVariants.map(v => sql`UPPER(TRIM(${vendorBills.vendorName})) = ${v}`);
    const existingBillRows = await db.select({
      category: vendorBillItems.category,
      description: vendorBillItems.description,
      unit: vendorBillItems.unit,
      equipmentId: vendorBillItems.equipmentId,
    })
    .from(vendorBillItems)
    .innerJoin(vendorBills, eq(vendorBills.id, vendorBillItems.billId))
    .where(or(...vendorBillConds));

    const allEqIds = [...new Set(existingBillRows.filter(r => r.equipmentId).map(r => r.equipmentId!))];
    let billEqNameMap = new Map<number, string>();
    if (allEqIds.length > 0) {
      const eqRows = await db.select({ id: equipmentMaster.id, name: equipmentMaster.name })
        .from(equipmentMaster)
        .where(inArray(equipmentMaster.id, allEqIds));
      billEqNameMap = new Map(eqRows.map(e => [e.id, e.name]));
    }

    for (const row of existingBillRows) {
      if (!row.description) continue;
      let key = "";
      if (row.equipmentId) {
        const rawName = billEqNameMap.get(row.equipmentId) || row.description.split(" - ")[0]?.trim() || "EQUIPMENT";
        const canonical = canonicalizeMachineType(rawName).toUpperCase().trim();
        const unit = (row.unit || "HRS").toUpperCase().trim();
        key = `EQ_${canonical.replace(/\s+/g, "_")}_${unit}`;
        if (!itemMap.has(key)) {
          const entryTypeMatch = row.description.match(/(?:- )?(HOURLY HIRE|DAILY HIRE|TRIP BASED|MONTHLY HIRE|TIME\/METER|MOBILIZATION|TRANSPORT)/);
          const entryLabel = entryTypeMatch ? entryTypeMatch[1] : unit;
          itemMap.set(key, {
            itemKey: key,
            itemLabel: `${canonical} - ${entryLabel}`,
            category: row.category || "equipment",
            unit,
          });
        }
      } else {
        const desc = row.description.trim().toUpperCase();
        const cleanDesc = desc.replace(/\s*\(SITE\)\s*$/i, "").replace(/\s*\(PLANT\)\s*$/i, "").replace(/\s*\(SITE TRIP\)\s*$/i, "").trim();
        if (row.category === "material") {
          const unit = (row.unit || "NOS").toUpperCase().trim();
          key = `MAT_${canonicalizeMatName(cleanDesc)}_${unit}`;
        } else if (row.category === "transport") {
          const canonical = canonicalizeMachineType(cleanDesc).toUpperCase().trim();
          const unit = (row.unit || "TRIP").toUpperCase().trim();
          key = `EQ_${canonical.replace(/\s+/g, "_")}_${unit}`;
          if (!itemMap.has(key)) {
            itemMap.set(key, {
              itemKey: key,
              itemLabel: `${canonical} - TRANSPORT`,
              category: "transport",
              unit,
            });
          }
          continue;
        } else {
          key = cleanDesc || desc;
        }
        if (key && !itemMap.has(key)) {
          itemMap.set(key, {
            itemKey: key,
            itemLabel: cleanDesc || desc,
            category: row.category || "other",
            unit: (row.unit || "NOS").toUpperCase().trim(),
          });
        }
      }
    }

    const existingCards = await this.getVendorRateCards(vendorName);
    const cardMap = new Map(existingCards.map(c => [c.itemKey.toUpperCase().trim(), c]));

    for (const card of existingCards) {
      const key = card.itemKey.toUpperCase().trim();
      if (/^\d+_/.test(key)) continue;
      if (!itemMap.has(key)) {
        itemMap.set(key, {
          itemKey: key,
          itemLabel: card.itemLabel || key,
          category: card.category,
          unit: card.unit,
        });
      }
    }

    const results: { itemKey: string; itemLabel: string; category: string; unit: string; rate: number | null; rateCardId: number | null }[] = [];
    for (const [key, item] of itemMap) {
      const card = cardMap.get(key);
      results.push({
        ...item,
        rate: card ? Number(card.rate) : null,
        rateCardId: card ? card.id : null,
      });
    }

    results.sort((a, b) => {
      if (a.category !== b.category) return a.category.localeCompare(b.category);
      return a.itemLabel.localeCompare(b.itemLabel);
    });

    return results;
  }

  async checkDuplicateBilledItems(vendorName: string, items: { date: string; equipmentId?: number | null; description?: string; category?: string | null; siteName?: string | null }[], excludeBillId?: number): Promise<{ index: number; billNo: string; billStatus: string }[]> {
    const variants = await this.resolveVendorAliases(vendorName);
    const vendorConds = variants.map(v => sql`UPPER(TRIM(${vendorBills.vendorName})) = ${v}`);
    const whereConditions = excludeBillId
      ? and(or(...vendorConds), sql`${vendorBills.id} != ${excludeBillId}`)
      : or(...vendorConds);
    const existingBills = await db.select().from(vendorBills).where(whereConditions);
    if (existingBills.length === 0) return [];

    const billIds = existingBills.map(b => b.id);
    const existingItems = await db.select().from(vendorBillItems).where(inArray(vendorBillItems.billId, billIds));

    const billMap = new Map(existingBills.map(b => [b.id, b]));
    const duplicates: { index: number; billNo: string; billStatus: string }[] = [];

    const labourHead = (desc?: string | null): string => {
      if (!desc) return "";
      return desc.toUpperCase().trim().split(" - ")[0].trim();
    };
    const isLabourDesc = (desc?: string | null): boolean => {
      return !!desc && desc.toUpperCase().trim().startsWith("LABOUR ");
    };

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const itemIsLabour = (item.category || "").toLowerCase() === "labour" || isLabourDesc(item.description);

      for (const existing of existingItems) {
        const bill = billMap.get(existing.billId);
        if (!bill) continue;
        const dateMatch = existing.date === item.date;
        if (!dateMatch) continue;

        const eqMatch = item.equipmentId && existing.equipmentId && item.equipmentId === existing.equipmentId;

        let labourMatch = false;
        if (itemIsLabour && isLabourDesc(existing.description)) {
          const sameSite = (item.siteName || "").toUpperCase().trim() ===
                           (existing.siteName || "").toUpperCase().trim();
          if (sameSite) {
            labourMatch = labourHead(item.description) === labourHead(existing.description);
          }
        }

        const descMatch = !item.equipmentId && !itemIsLabour && item.description && existing.description &&
          item.description.toUpperCase().trim() === existing.description.toUpperCase().trim();

        if (eqMatch || labourMatch || descMatch) {
          duplicates.push({ index: i, billNo: bill.billNo, billStatus: bill.status });
          break;
        }
      }
    }
    return duplicates;
  }
  async fixBadStockBalanceEntries(): Promise<{ fixed: number; skipped: boolean }> {
    try {
      // Check if the bad entries still exist (guard against running twice)
      const bal12 = await db.select({ id: stockBalances.id }).from(stockBalances).where(eq(stockBalances.id, 12)).limit(1);
      const bal13 = await db.select({ id: stockBalances.id }).from(stockBalances).where(eq(stockBalances.id, 13)).limit(1);
      if (bal12.length === 0 && bal13.length === 0) {
        return { fixed: 0, skipped: true };
      }
      let fixed = 0;
      // --- Fix 1: PRIVATE VENTURE 10/12MM opening stock (ledger id=245 + balance id=12) ---
      if (bal12.length > 0) {
        const led245 = await db.select({ id: stockLedger.id }).from(stockLedger)
          .where(and(eq(stockLedger.id, 245), eq(stockLedger.partyId, 5))).limit(1);
        if (led245.length > 0) {
          await db.delete(stockLedger).where(eq(stockLedger.id, 245));
          fixed++;
          console.log('fixBadStockBalanceEntries: Deleted PRIVATE VENTURE 10/12MM stock_ledger entry id=245');
        }
        await db.delete(stockBalances).where(eq(stockBalances.id, 12));
        fixed++;
        console.log('fixBadStockBalanceEntries: Deleted PRIVATE VENTURE 10/12MM stock_balance id=12');
      }
      // --- Fix 2: Null-party Diesel equipment_usage (ledger id=8364 + balance id=13) ---
      if (bal13.length > 0) {
        const led8364 = await db.select({ id: stockLedger.id, quantityOut: stockLedger.quantityOut })
          .from(stockLedger).where(and(eq(stockLedger.id, 8364), isNull(stockLedger.partyId))).limit(1);
        if (led8364.length > 0) {
          const qtyOut = led8364[0].quantityOut ?? 63;
          // Reassign ledger entry to HLC (party_id=1)
          await db.update(stockLedger).set({ partyId: 1 }).where(eq(stockLedger.id, 8364));
          // Deduct from HLC's diesel balance (balance id=1, stored in Liters)
          await db.execute(sql`UPDATE stock_balances SET balance = balance - ${qtyOut} WHERE id = 1`);
          fixed += 2;
          console.log(`fixBadStockBalanceEntries: Moved null-party diesel ledger 8364 to HLC, deducted ${qtyOut} L from HLC diesel balance`);
        }
        await db.delete(stockBalances).where(eq(stockBalances.id, 13));
        fixed++;
        console.log('fixBadStockBalanceEntries: Deleted null-party diesel stock_balance id=13');
      }
      return { fixed, skipped: false };
    } catch (err) {
      console.error('fixBadStockBalanceEntries: Error:', err);
      return { fixed: 0, skipped: false };
    }
  }

  // ====== MIX ESTIMATES ======

  async fixNullContractorLabels(): Promise<{ updated: number }> {
    const result = await db.execute(sql`
      UPDATE mix_estimates
      SET contractor = TRIM(state::jsonb->'jobs'->0->>'contractor')
      WHERE contractor IS NULL
        AND TRIM(state::jsonb->'jobs'->0->>'contractor') IS NOT NULL
        AND TRIM(state::jsonb->'jobs'->0->>'contractor') <> ''
    `);
    return { updated: result.rowCount ?? 0 };
  }

  async fixLabourContractorCasing(): Promise<{ updated: number }> {
    const result = await db.execute(sql`
      UPDATE labour_logs
      SET contractor = UPPER(TRIM(contractor))
      WHERE contractor IS NOT NULL
        AND contractor <> UPPER(TRIM(contractor))
    `);
    return { updated: result.rowCount ?? 0 };
  }

  async renameContractor(from: string, to: string): Promise<number> {
    const result = await db.execute(sql`
      UPDATE mix_estimates
      SET contractor = UPPER(TRIM(${to}))
      WHERE UPPER(TRIM(contractor)) = UPPER(TRIM(${from}))
    `);
    return result.rowCount ?? 0;
  }

  async getMixEstimates(): Promise<MixEstimate[]> {
    return await db.select().from(mixEstimates).orderBy(desc(mixEstimates.updatedAt));
  }

  async getMixEstimate(id: number): Promise<MixEstimate | undefined> {
    const [row] = await db.select().from(mixEstimates).where(eq(mixEstimates.id, id));
    return row;
  }

  async createMixEstimate(data: InsertMixEstimate): Promise<MixEstimate> {
    const [row] = await db.insert(mixEstimates).values(data).returning();
    return row;
  }

  async updateMixEstimate(id: number, data: Partial<InsertMixEstimate>): Promise<MixEstimate | undefined> {
    const [row] = await db.update(mixEstimates)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(mixEstimates.id, id))
      .returning();
    return row;
  }

  async deleteMixEstimate(id: number): Promise<boolean> {
    const result = await db.delete(mixEstimates).where(eq(mixEstimates.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async getPriceScenarios(estimateId: number): Promise<PriceScenario[]> {
    return await db.select().from(priceScenarios)
      .where(eq(priceScenarios.estimateId, estimateId))
      .orderBy(desc(priceScenarios.createdAt));
  }

  async getPriceScenario(id: number): Promise<PriceScenario | undefined> {
    const [row] = await db.select().from(priceScenarios).where(eq(priceScenarios.id, id));
    return row;
  }

  async createPriceScenario(data: InsertPriceScenario): Promise<PriceScenario> {
    const [row] = await db.insert(priceScenarios).values(data).returning();
    return row;
  }

  async updatePriceScenario(id: number, data: { name?: string; state?: string; baseState?: string }): Promise<PriceScenario | undefined> {
    const updateData: any = { ...data, updatedAt: new Date() };
    if (data.baseState !== undefined) {
      const existing = await this.getPriceScenario(id);
      if (existing?.baseState) {
        delete updateData.baseState;
      }
    }
    const [row] = await db.update(priceScenarios)
      .set(updateData)
      .where(eq(priceScenarios.id, id))
      .returning();
    return row;
  }

  async deletePriceScenario(id: number): Promise<boolean> {
    const result = await db.delete(priceScenarios).where(eq(priceScenarios.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async getConcreteEstimates(): Promise<ConcreteEstimate[]> {
    return await db.select().from(concreteEstimates).orderBy(desc(concreteEstimates.updatedAt));
  }

  async getConcreteEstimate(id: number): Promise<ConcreteEstimate | undefined> {
    const [row] = await db.select().from(concreteEstimates).where(eq(concreteEstimates.id, id));
    return row;
  }

  async createConcreteEstimate(data: InsertConcreteEstimate): Promise<ConcreteEstimate> {
    const [row] = await db.insert(concreteEstimates).values(data).returning();
    return row;
  }

  async updateConcreteEstimate(id: number, data: Partial<InsertConcreteEstimate>): Promise<ConcreteEstimate | undefined> {
    const [row] = await db.update(concreteEstimates)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(concreteEstimates.id, id))
      .returning();
    return row;
  }

  async deleteConcreteEstimate(id: number): Promise<boolean> {
    const result = await db.delete(concreteEstimates).where(eq(concreteEstimates.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async getConcreteEstimatesV2(): Promise<ConcreteEstimateV2[]> {
    return await db.select().from(concreteEstimatesV2).orderBy(desc(concreteEstimatesV2.updatedAt));
  }

  async getConcreteEstimateV2(id: number): Promise<ConcreteEstimateV2 | undefined> {
    const [row] = await db.select().from(concreteEstimatesV2).where(eq(concreteEstimatesV2.id, id));
    return row;
  }

  async createConcreteEstimateV2(data: InsertConcreteEstimateV2): Promise<ConcreteEstimateV2> {
    const [row] = await db.insert(concreteEstimatesV2).values(data).returning();
    return row;
  }

  async updateConcreteEstimateV2(id: number, data: Partial<InsertConcreteEstimateV2>): Promise<ConcreteEstimateV2 | undefined> {
    const [row] = await db.update(concreteEstimatesV2)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(concreteEstimatesV2.id, id))
      .returning();
    return row;
  }

  async deleteConcreteEstimateV2(id: number): Promise<boolean> {
    const result = await db.delete(concreteEstimatesV2).where(eq(concreteEstimatesV2.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // ============================================
  // PLANT SHIFT LOG
  // ============================================

  async getPlantShiftLogs(filters?: { dateFrom?: string; dateTo?: string }): Promise<PlantShiftLog[]> {
    const conditions: any[] = [];
    if (filters?.dateFrom) conditions.push(gte(plantShiftLogs.date, filters.dateFrom));
    if (filters?.dateTo) conditions.push(lte(plantShiftLogs.date, filters.dateTo));
    return db.select().from(plantShiftLogs)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(plantShiftLogs.date), desc(plantShiftLogs.shiftCode));
  }

  async getPlantShiftLogByDate(date: string, _shiftCodeIgnored?: string, plantName: string = "Main Plant"): Promise<PlantShiftLogWithDetails | undefined> {
    const [header] = await db.select().from(plantShiftLogs)
      .where(and(eq(plantShiftLogs.date, date), eq(plantShiftLogs.plantName, plantName)))
      .limit(1);
    if (!header) return undefined;
    const manpower = await db.select().from(plantShiftLogManpower).where(eq(plantShiftLogManpower.shiftLogId, header.id));
    const idleEvents = await db.select().from(plantShiftLogIdle).where(eq(plantShiftLogIdle.shiftLogId, header.id));
    return { ...header, manpower, idleEvents };
  }

  async getPlantShiftLog(id: number): Promise<PlantShiftLogWithDetails | undefined> {
    const [header] = await db.select().from(plantShiftLogs).where(eq(plantShiftLogs.id, id)).limit(1);
    if (!header) return undefined;
    const manpower = await db.select().from(plantShiftLogManpower).where(eq(plantShiftLogManpower.shiftLogId, header.id));
    const idleEvents = await db.select().from(plantShiftLogIdle).where(eq(plantShiftLogIdle.shiftLogId, header.id));
    return { ...header, manpower, idleEvents };
  }

  // Idempotent write-through. Deletes all readings tagged sourceShiftLogId=log.id
  // and re-inserts only those entries with non-null values from the shift log.
  private async _syncShiftLogReadings(tx: typeof db, log: PlantShiftLog): Promise<string[]> {
    await tx.delete(ldoFlowReadings).where(eq(ldoFlowReadings.sourceShiftLogId, log.id));
    await tx.delete(bitumenDipReadings).where(eq(bitumenDipReadings.sourceShiftLogId, log.id));
    await tx.delete(ldoDipReadings).where(eq(ldoDipReadings.sourceShiftLogId, log.id));

    const ldoRows: any[] = [];
    // Compute consumption deltas early. Dip-stick is the authoritative source while
    // flow meters are being calibrated; meter delta is kept as a fallback only.
    const dipDeltaT1 =
      log.ldoTank1OpeningDip != null && log.ldoTank1ClosingDip != null
        ? getLdoVolumeAtDepth(1, log.ldoTank1OpeningDip) - getLdoVolumeAtDepth(1, log.ldoTank1ClosingDip)
        : null;
    const dipDeltaT2 =
      log.ldoTank2OpeningDip != null && log.ldoTank2ClosingDip != null
        ? getLdoVolumeAtDepth(2, log.ldoTank2OpeningDip) - getLdoVolumeAtDepth(2, log.ldoTank2ClosingDip)
        : null;
    const meterDeltaT1 =
      log.ldoTank1OpeningMeter != null && log.ldoTank1ClosingMeter != null
        ? log.ldoTank1ClosingMeter - log.ldoTank1OpeningMeter
        : null;
    const meterDeltaT2 =
      log.ldoTank2OpeningMeter != null && log.ldoTank2ClosingMeter != null
        ? log.ldoTank2ClosingMeter - log.ldoTank2OpeningMeter
        : null;
    // When dryerFedFrom === "TANK_1", both boiler (T1 meter) and dryer (T2 meter)
    // draw from Tank 1 stock. For the dip path, full dipDeltaT1 covers the combined
    // draw. For the meter fallback, sum both meter deltas into Tank 1's closing row
    // (both drain Tank 1 stock) — Tank 2 closing row carries no quantity in this mode.
    const closingQtyT1 = dipDeltaT1 != null
      ? Math.max(0, dipDeltaT1)
      : log.dryerFedFrom === "TANK_1" && meterDeltaT1 != null && meterDeltaT2 != null
        ? Math.max(0, meterDeltaT1 + meterDeltaT2)
        : (meterDeltaT1 != null ? Math.max(0, meterDeltaT1) : null);
    const closingQtyT2 = log.dryerFedFrom === "TANK_1"
      ? null
      : (dipDeltaT2 != null ? Math.max(0, dipDeltaT2) : (meterDeltaT2 != null ? Math.max(0, meterDeltaT2) : null));
    const pushLdo = (tank: number, type: "opening" | "closing", value: number | null | undefined, time: string | null, qty?: number | null) => {
      if (value === null || value === undefined) return;
      const row: any = {
        date: log.date,
        time,
        tankNumber: tank,
        meterReading: value,
        readingType: type,
        notes: `AUTO from Plant Shift Log #${log.id}`,
        plantName: log.plantName,
        sourceShiftLogId: log.id,
        // Task #255 — only the dryer-meter rows (tank=2) need the dryer-source
        // tag; boiler-meter rows always debit Tank-1 stock so we leave
        // dryerFedFrom NULL for them.
        dryerFedFrom: tank === 2 ? (log.dryerFedFrom || "TANK_2") : null,
      };
      if (type === "closing" && qty != null) row.quantityLiters = qty;
      ldoRows.push(row);
    };
    pushLdo(1, "opening", log.ldoTank1OpeningMeter, log.plantStartTime);
    pushLdo(1, "closing", log.ldoTank1ClosingMeter, log.plantStopTime, closingQtyT1);
    pushLdo(2, "opening", log.ldoTank2OpeningMeter, log.plantStartTime);
    pushLdo(2, "closing", log.ldoTank2ClosingMeter, log.plantStopTime, closingQtyT2);
    if (ldoRows.length) await tx.insert(ldoFlowReadings).values(ldoRows).onConflictDoNothing();

    const bitumenRows: any[] = [];
    const pushBitumen = (tank: number, type: "opening" | "closing", depth: number | null | undefined, time: string | null) => {
      if (depth === null || depth === undefined) return;
      const vol = getVolumeAtDepth(depth);
      const wt = vol * BITUMEN_DENSITY_KG_PER_LITER;
      bitumenRows.push({
        date: log.date,
        time,
        tankNumber: tank,
        depthCm: depth,
        volumeLiters: Math.round(vol),
        weightKg: Math.round(wt),
        readingType: type,
        notes: `AUTO from Plant Shift Log #${log.id}`,
        plantName: log.plantName,
        sourceShiftLogId: log.id,
      });
    };
    pushBitumen(1, "opening", log.bitumenTank1OpeningDip, log.plantStartTime);
    pushBitumen(1, "closing", log.bitumenTank1ClosingDip, log.plantStopTime);
    pushBitumen(2, "opening", log.bitumenTank2OpeningDip, log.plantStartTime);
    pushBitumen(2, "closing", log.bitumenTank2ClosingDip, log.plantStopTime);
    if (bitumenRows.length) await tx.insert(bitumenDipReadings).values(bitumenRows).onConflictDoNothing();

    // Task #344 — LDO dip readings auto-created from shift log dip fields.
    const ldoDipRows: any[] = [];
    const pushLdoDip = (tank: number, type: "opening" | "closing", depth: number | null | undefined, time: string | null) => {
      if (depth === null || depth === undefined) return;
      const vol = getLdoVolumeAtDepth(tank, depth);
      const wt = vol * LDO_DENSITY_KG_PER_LITER;
      ldoDipRows.push({
        date: log.date,
        time,
        tankNumber: tank,
        depthCm: depth,
        volumeLiters: Math.round(vol),
        weightKg: Math.round(wt),
        readingType: type,
        notes: `AUTO from Plant Shift Log #${log.id}`,
        plantName: log.plantName,
        sourceShiftLogId: log.id,
      });
    };
    pushLdoDip(1, "opening", log.ldoTank1OpeningDip, log.plantStartTime);
    pushLdoDip(1, "closing", log.ldoTank1ClosingDip, log.plantStopTime);
    pushLdoDip(2, "opening", log.ldoTank2OpeningDip, log.plantStartTime);
    pushLdoDip(2, "closing", log.ldoTank2ClosingDip, log.plantStopTime);
    if (ldoDipRows.length) await tx.insert(ldoDipReadings).values(ldoDipRows).onConflictDoNothing();

    // Task #434 — Divergence check: compare dip-derived stock change vs meter-
    // reported consumption for each physical tank where both are available.
    //
    // Stock routing determines which physical tank each meter draws from:
    //   dryerFedFrom === "TANK_1"  → both boiler-meter (tank-1) AND dryer-meter
    //                                 (tank-2) draw from Tank 1 stock; Tank 2 dip
    //                                 is unaffected so no Tank-2 check is done.
    //   dryerFedFrom === "TANK_2"  → boiler-meter draws from Tank 1, dryer-meter
    //                                 draws from Tank 2; compare each independently.
    const divergenceWarnings: string[] = [];
    // meterDeltaT1, meterDeltaT2, dipDeltaT1, dipDeltaT2 are computed above
    // near pushLdo and are reused here for the divergence check.

    const pushDivergenceWarning = (label: string, meterConsumed: number, dipConsumed: number) => {
      const diff = Math.abs(meterConsumed - dipConsumed);
      if (diff > LDO_DIVERGENCE_THRESHOLD_LITERS) {
        console.warn(
          `[ShiftLog #${log.id}] LDO ${label} divergence: meter=${meterConsumed.toFixed(0)} L, dip=${dipConsumed.toFixed(0)} L, diff=${diff.toFixed(0)} L`
        );
        divergenceWarnings.push(
          `LDO ${label}: meter shows ${Math.round(meterConsumed)} L consumed but dip-stick shows ${Math.round(dipConsumed)} L — difference of ${Math.round(diff)} L exceeds threshold. Check for a measurement error or meter fault.`
        );
      }
    };

    if (log.dryerFedFrom === "TANK_1") {
      // Both meters draw from Tank 1. The combined meter consumption should
      // match the Tank 1 dip stock loss. Require both meter pairs — if either
      // is absent we cannot compute the full combined consumption and would risk
      // a false-positive warning from the missing half.
      if (meterDeltaT1 != null && meterDeltaT2 != null && dipDeltaT1 != null) {
        pushDivergenceWarning("Tank 1 (Boiler+Dryer combined, fed from Tank 1)", meterDeltaT1 + meterDeltaT2, dipDeltaT1);
      }
    } else {
      // dryerFedFrom === "TANK_2" (default): each meter draws from its own tank.
      if (meterDeltaT1 != null && dipDeltaT1 != null) {
        pushDivergenceWarning("Tank 1 (Boiler)", meterDeltaT1, dipDeltaT1);
      }
      if (meterDeltaT2 != null && dipDeltaT2 != null) {
        pushDivergenceWarning("Tank 2 (Dryer)", meterDeltaT2, dipDeltaT2);
      }
    }

    return divergenceWarnings;
  }

  async upsertPlantShiftLog(input: UpsertPlantShiftLogInput, editedBy?: string, authorizedRole?: "admin" | "manager" | null): Promise<PlantShiftLogWithDetails & { divergenceWarnings: string[] }> {
    const { manpower = [], idleEvents = [], editedBy: _ignore, pin: _pin, ...header } = input as any;
    const shiftCode = header.shiftCode || "DAY";
    const plantName = header.plantName || "Main Plant";

    return db.transaction(async (tx) => {
      const [existing] = await tx.select().from(plantShiftLogs)
        .where(and(eq(plantShiftLogs.date, header.date), eq(plantShiftLogs.plantName, plantName)))
        .limit(1);

      // Block edits to a finalized log unless authorized (manager/admin PIN verified at the route)
      if (existing && existing.isFinalized === 1 && !authorizedRole) {
        const err: any = new Error("Shift log is finalized — manager or admin PIN required to edit");
        err.code = "FINALIZED_LOCKED";
        throw err;
      }

      let saved: PlantShiftLog;
      if (existing) {
        // Snapshot prior version (full: header + manpower + idle) for audit
        const priorMp = await tx.select().from(plantShiftLogManpower).where(eq(plantShiftLogManpower.shiftLogId, existing.id));
        const priorIdle = await tx.select().from(plantShiftLogIdle).where(eq(plantShiftLogIdle.shiftLogId, existing.id));
        await tx.insert(plantShiftLogVersions).values({
          shiftLogId: existing.id,
          snapshot: { header: existing, manpower: priorMp, idleEvents: priorIdle } as any,
          editedBy: editedBy || "operator",
        });
        const [updated] = await tx.update(plantShiftLogs)
          .set({ ...header, shiftCode, updatedAt: new Date() })
          .where(eq(plantShiftLogs.id, existing.id))
          .returning();
        saved = updated;

        await tx.delete(plantShiftLogManpower).where(eq(plantShiftLogManpower.shiftLogId, existing.id));
        await tx.delete(plantShiftLogIdle).where(eq(plantShiftLogIdle.shiftLogId, existing.id));
      } else {
        const [created] = await tx.insert(plantShiftLogs).values({ ...header, shiftCode, plantName }).returning();
        saved = created;
      }

      if (manpower.length) {
        await tx.insert(plantShiftLogManpower).values(
          manpower.map((m: any) => ({
            shiftLogId: saved.id,
            name: m.name,
            role: m.role || null,
            contractorName: m.contractorName ? String(m.contractorName).toUpperCase().trim() : null,
            category: m.category ? String(m.category).toUpperCase().trim() : null,
            gender: m.gender ? String(m.gender).toUpperCase().trim() : null,
          }))
        );
      }
      if (idleEvents.length) {
        await tx.insert(plantShiftLogIdle).values(
          idleEvents.map((e: any) => ({
            shiftLogId: saved.id,
            startTime: e.startTime,
            endTime: e.endTime || null,
            reason: e.reason,
            remarks: e.remarks || null,
          }))
        );
      }

      const divergenceWarnings = await this._syncShiftLogReadings(tx, saved);

      const mp = await tx.select().from(plantShiftLogManpower).where(eq(plantShiftLogManpower.shiftLogId, saved.id));
      const ie = await tx.select().from(plantShiftLogIdle).where(eq(plantShiftLogIdle.shiftLogId, saved.id));
      return { ...saved, manpower: mp, idleEvents: ie, divergenceWarnings };
    });
  }

  async finalizePlantShiftLog(id: number, finalizedBy: string): Promise<PlantShiftLog | undefined> {
    const [updated] = await db.update(plantShiftLogs)
      .set({ isFinalized: 1, finalizedBy, finalizedAt: new Date(), updatedAt: new Date() })
      .where(eq(plantShiftLogs.id, id))
      .returning();
    return updated;
  }

  async deletePlantShiftLog(id: number): Promise<boolean> {
    return db.transaction(async (tx) => {
      await tx.delete(ldoFlowReadings).where(eq(ldoFlowReadings.sourceShiftLogId, id));
      await tx.delete(bitumenDipReadings).where(eq(bitumenDipReadings.sourceShiftLogId, id));
      await tx.delete(ldoDipReadings).where(eq(ldoDipReadings.sourceShiftLogId, id));
      await tx.delete(plantShiftLogManpower).where(eq(plantShiftLogManpower.shiftLogId, id));
      await tx.delete(plantShiftLogIdle).where(eq(plantShiftLogIdle.shiftLogId, id));
      await tx.delete(plantShiftLogVersions).where(eq(plantShiftLogVersions.shiftLogId, id));
      const result = await tx.delete(plantShiftLogs).where(eq(plantShiftLogs.id, id)).returning();
      return result.length > 0;
    });
  }

  async getDailyPlantReportIndex(filters?: { from?: string; to?: string; plant?: string; parties?: number[]; mixTypes?: string[] }): Promise<Array<{
    date: string; plantName: string;
    hasDispatches: boolean; hasEquipment: boolean; hasShiftLog: boolean;
    hasBitumenDips: boolean; hasLdoMeter: boolean; hasHeatingSessions: boolean;
    totalLoads: number; totalProductionMt: number; sessionsCount: number;
    shiftLogFinalized: boolean;
    dryerFedFrom: "TANK_1" | "TANK_2" | null;
    breakdown: Array<{ partyName: string; mixType: string; loads: number; mt: number }>;
    ldoBoilerLitres: number | null;
    ldoDryerLitres: number | null;
    ldoHeatingSessionLitres: number | null;
    dgDieselLitres: number | null;
    bitumenTank1OpeningDip: number | null;
    bitumenTank1ClosingDip: number | null;
    bitumenTank2OpeningDip: number | null;
    bitumenTank2ClosingDip: number | null;
    bitumenTemplateMt: number | null;
  }>> {
    const from = filters?.from;
    const to = filters?.to;
    const plant = filters?.plant;
    const partyIds = Array.from(new Set((filters?.parties || []).filter((n) => Number.isFinite(n))));
    const mixTypeNames = Array.from(new Set((filters?.mixTypes || []).map((s) => String(s)).filter(Boolean)));
    const hasPartyOrMixFilter = partyIds.length > 0 || mixTypeNames.length > 0;
    // Resolve mix-template IDs for the requested mix types once and reuse below.
    const matchingMixIds: number[] | null = mixTypeNames.length
      ? (await db.select({ id: mixTemplates.id }).from(mixTemplates)
          .where(inArray(mixTemplates.mixType, mixTypeNames))).map((r) => r.id)
      : null;
    if (mixTypeNames.length && (matchingMixIds?.length ?? 0) === 0) {
      // Mix-type filter requested but no template matches → empty result.
      return [];
    }
    const dateRange = (col: any) => and(
      from ? gte(col, from) : undefined,
      to ? lte(col, to) : undefined,
    );
    const plantEq = (col: any) => (plant ? eq(col, plant) : undefined);

    // When party/mix-type filters are present we restrict the index to (date, plant)
    // combinations that have at least one matching truck dispatch. Other tables
    // (shift log, equipment, fuel) don't carry party/mix info, so we only surface
    // their flags for those same matching keys.
    let allowedKeys: Set<string> | null = null;
    if (hasPartyOrMixFilter) {
      allowedKeys = new Set<string>();
      const matchingDispKeys = await db.select({
        date: truckDispatches.date,
        plantName: truckDispatches.plantName,
      }).from(truckDispatches)
        .where(and(
          dateRange(truckDispatches.date),
          plantEq(truckDispatches.plantName),
          partyIds.length ? inArray(truckDispatches.partyId, partyIds) : undefined,
          matchingMixIds ? inArray(truckDispatches.mixTemplateId, matchingMixIds) : undefined,
        ))
        .groupBy(truckDispatches.date, truckDispatches.plantName);
      for (const r of matchingDispKeys) allowedKeys.add(`${r.date}|${r.plantName}`);
      if (allowedKeys.size === 0) return [];
    }

    type Row = {
      date: string; plantName: string;
      hasDispatches: boolean; hasEquipment: boolean; hasShiftLog: boolean;
      hasBitumenDips: boolean; hasLdoMeter: boolean; hasHeatingSessions: boolean;
      totalLoads: number; totalProductionMt: number; sessionsCount: number;
      shiftLogFinalized: boolean;
      dryerFedFrom: "TANK_1" | "TANK_2" | null;
      breakdown: Array<{ partyName: string; mixType: string; loads: number; mt: number }>;
      ldoBoilerLitres: number | null;
      ldoDryerLitres: number | null;
      ldoHeatingSessionLitres: number | null;
      dgDieselLitres: number | null;
      bitumenTank1OpeningDip: number | null;
      bitumenTank1ClosingDip: number | null;
      bitumenTank2OpeningDip: number | null;
      bitumenTank2ClosingDip: number | null;
      bitumenTemplateMt: number | null;
    };
    const map = new Map<string, Row>();
    const get = (date: string, plantName: string): Row => {
      const key = `${date}|${plantName}`;
      let r = map.get(key);
      if (!r) {
        r = {
          date, plantName,
          hasDispatches: false, hasEquipment: false, hasShiftLog: false,
          hasBitumenDips: false, hasLdoMeter: false, hasHeatingSessions: false,
          totalLoads: 0, totalProductionMt: 0, sessionsCount: 0,
          shiftLogFinalized: false,
          dryerFedFrom: null,
          breakdown: [],
          ldoBoilerLitres: null, ldoDryerLitres: null,
          ldoHeatingSessionLitres: null, dgDieselLitres: null,
          bitumenTank1OpeningDip: null, bitumenTank1ClosingDip: null,
          bitumenTank2OpeningDip: null, bitumenTank2ClosingDip: null,
          bitumenTemplateMt: null,
        };
        map.set(key, r);
      }
      return r;
    };

    const dispRows = await db.select({
      date: truckDispatches.date,
      plantName: truckDispatches.plantName,
      loads: sql<number>`COUNT(*)::int`,
      mt: sql<number>`COALESCE(SUM(${truckDispatches.loadWeight}),0)::float`,
    }).from(truckDispatches)
      .where(and(
        dateRange(truckDispatches.date),
        plantEq(truckDispatches.plantName),
        partyIds.length ? inArray(truckDispatches.partyId, partyIds) : undefined,
        matchingMixIds ? inArray(truckDispatches.mixTemplateId, matchingMixIds) : undefined,
      ))
      .groupBy(truckDispatches.date, truckDispatches.plantName);
    for (const r of dispRows) {
      const row = get(r.date, r.plantName);
      row.hasDispatches = true;
      row.totalLoads = Number(r.loads) || 0;
      row.totalProductionMt = Number(r.mt) || 0;
    }

    // Per (date, plant) breakdown by party + mix type, respecting active filters.
    const breakdownRows = await db.select({
      date: truckDispatches.date,
      plantName: truckDispatches.plantName,
      partyId: truckDispatches.partyId,
      mixTemplateId: truckDispatches.mixTemplateId,
      loads: sql<number>`COUNT(*)::int`,
      mt: sql<number>`COALESCE(SUM(${truckDispatches.loadWeight}),0)::float`,
    }).from(truckDispatches)
      .where(and(
        dateRange(truckDispatches.date),
        plantEq(truckDispatches.plantName),
        partyIds.length ? inArray(truckDispatches.partyId, partyIds) : undefined,
        matchingMixIds ? inArray(truckDispatches.mixTemplateId, matchingMixIds) : undefined,
      ))
      .groupBy(
        truckDispatches.date,
        truckDispatches.plantName,
        truckDispatches.partyId,
        truckDispatches.mixTemplateId,
      );
    if (breakdownRows.length > 0) {
      const allParties = await db.select({ id: parties.id, name: parties.name }).from(parties);
      const partyName = new Map(allParties.map((p) => [p.id, p.name]));
      const allTemplates = await db.select({ id: mixTemplates.id, mixType: mixTemplates.mixType }).from(mixTemplates);
      const tplMix = new Map(allTemplates.map((t) => [t.id, t.mixType]));
      for (const r of breakdownRows) {
        const row = get(r.date, r.plantName);
        row.breakdown.push({
          partyName: partyName.get(r.partyId) || `Party #${r.partyId}`,
          mixType: tplMix.get(r.mixTemplateId) || "—",
          loads: Number(r.loads) || 0,
          mt: Number(r.mt) || 0,
        });
      }
      // Stable sort: largest MT first, ties by party name then mix type.
      for (const row of map.values()) {
        row.breakdown.sort((a, b) =>
          (b.mt - a.mt)
          || a.partyName.localeCompare(b.partyName)
          || a.mixType.localeCompare(b.mixType)
        );
      }
    }

    const eqRows = await db.select({
      date: equipmentUsage.date,
      plantName: equipmentUsage.plantName,
    }).from(equipmentUsage)
      .where(and(dateRange(equipmentUsage.date), plantEq(equipmentUsage.plantName)))
      .groupBy(equipmentUsage.date, equipmentUsage.plantName);
    for (const r of eqRows) get(r.date, r.plantName).hasEquipment = true;

    const slRows = await db.select({
      date: plantShiftLogs.date,
      plantName: plantShiftLogs.plantName,
      isFinalized: plantShiftLogs.isFinalized,
      dryerFedFrom: plantShiftLogs.dryerFedFrom,
      ldoTank1OpeningMeter: plantShiftLogs.ldoTank1OpeningMeter,
      ldoTank1ClosingMeter: plantShiftLogs.ldoTank1ClosingMeter,
      ldoTank2OpeningMeter: plantShiftLogs.ldoTank2OpeningMeter,
      ldoTank2ClosingMeter: plantShiftLogs.ldoTank2ClosingMeter,
      ldoTank1OpeningDip: plantShiftLogs.ldoTank1OpeningDip,
      ldoTank1ClosingDip: plantShiftLogs.ldoTank1ClosingDip,
      ldoTank2OpeningDip: plantShiftLogs.ldoTank2OpeningDip,
      ldoTank2ClosingDip: plantShiftLogs.ldoTank2ClosingDip,
      bitumenTank1OpeningDip: plantShiftLogs.bitumenTank1OpeningDip,
      bitumenTank1ClosingDip: plantShiftLogs.bitumenTank1ClosingDip,
      bitumenTank2OpeningDip: plantShiftLogs.bitumenTank2OpeningDip,
      bitumenTank2ClosingDip: plantShiftLogs.bitumenTank2ClosingDip,
    }).from(plantShiftLogs)
      .where(and(dateRange(plantShiftLogs.date), plantEq(plantShiftLogs.plantName)));
    for (const r of slRows) {
      const row = get(r.date, r.plantName);
      row.hasShiftLog = true;
      if (r.isFinalized) row.shiftLogFinalized = true;
      if (r.dryerFedFrom === "TANK_1" || r.dryerFedFrom === "TANK_2") {
        row.dryerFedFrom = r.dryerFedFrom;
      }
      // LDO boiler (Tank 1) — prefer dip-based delta; fall back to meter delta.
      // When dryerFedFrom === "TANK_1" and dip is used: the full Tank 1 dip delta
      // covers both boiler + dryer; attribute it all to ldoBoilerLitres (split is
      // unavailable from dip alone).
      const slDipDeltaT1 = r.ldoTank1OpeningDip != null && r.ldoTank1ClosingDip != null
        ? getLdoVolumeAtDepth(1, r.ldoTank1OpeningDip) - getLdoVolumeAtDepth(1, r.ldoTank1ClosingDip)
        : null;
      const slDipDeltaT2 = r.ldoTank2OpeningDip != null && r.ldoTank2ClosingDip != null
        ? getLdoVolumeAtDepth(2, r.ldoTank2OpeningDip) - getLdoVolumeAtDepth(2, r.ldoTank2ClosingDip)
        : null;
      if (slDipDeltaT1 != null) {
        row.ldoBoilerLitres = Math.max(0, slDipDeltaT1);
      } else if (r.ldoTank1OpeningMeter != null && r.ldoTank1ClosingMeter != null) {
        row.ldoBoilerLitres = Math.max(0, r.ldoTank1ClosingMeter - r.ldoTank1OpeningMeter);
      }
      // LDO dryer (Tank 2):
      // - dryerFedFrom === "TANK_1" AND T1 dip used → dryer already in ldoBoilerLitres; skip.
      // - dryerFedFrom === "TANK_1" AND T1 dip absent → meter split fallback; T2 dip is
      //   irrelevant in TANK_1 mode so only the T2 meter is used here.
      // - dryerFedFrom === "TANK_2" → prefer T2 dip, fall back to T2 meter.
      if (r.dryerFedFrom === "TANK_1" && slDipDeltaT1 != null) {
        // Dryer share already included in ldoBoilerLitres; do nothing.
      } else if (r.dryerFedFrom === "TANK_1") {
        // T1 dip absent: use T2 meter only (T2 dip irrelevant in TANK_1 feed mode).
        if (r.ldoTank2OpeningMeter != null && r.ldoTank2ClosingMeter != null) {
          row.ldoDryerLitres = Math.max(0, r.ldoTank2ClosingMeter - r.ldoTank2OpeningMeter);
        }
      } else {
        // TANK_2 feed mode: prefer T2 dip, fall back to T2 meter.
        if (slDipDeltaT2 != null) {
          row.ldoDryerLitres = Math.max(0, slDipDeltaT2);
        } else if (r.ldoTank2OpeningMeter != null && r.ldoTank2ClosingMeter != null) {
          row.ldoDryerLitres = Math.max(0, r.ldoTank2ClosingMeter - r.ldoTank2OpeningMeter);
        }
      }
      // Bitumen dip readings (raw — frontend converts to MT using dip chart)
      if (r.bitumenTank1OpeningDip != null) row.bitumenTank1OpeningDip = r.bitumenTank1OpeningDip;
      if (r.bitumenTank1ClosingDip != null) row.bitumenTank1ClosingDip = r.bitumenTank1ClosingDip;
      if (r.bitumenTank2OpeningDip != null) row.bitumenTank2OpeningDip = r.bitumenTank2OpeningDip;
      if (r.bitumenTank2ClosingDip != null) row.bitumenTank2ClosingDip = r.bitumenTank2ClosingDip;
    }

    const hsRows = await db.select({
      date: bitumenHeatingSessions.date,
      plantName: bitumenHeatingSessions.plantName,
      cnt: sql<number>`COUNT(*)::int`,
      ldoConsumed: sql<number>`COALESCE(SUM(${bitumenHeatingSessions.ldoTank1Consumed}), 0)::float`,
      dgDiesel: sql<number>`COALESCE(SUM(${bitumenHeatingSessions.dgDieselConsumed}), 0)::float`,
    }).from(bitumenHeatingSessions)
      .where(and(dateRange(bitumenHeatingSessions.date), plantEq(bitumenHeatingSessions.plantName)))
      .groupBy(bitumenHeatingSessions.date, bitumenHeatingSessions.plantName);
    for (const r of hsRows) {
      const row = get(r.date, r.plantName);
      row.hasHeatingSessions = true;
      row.sessionsCount = Number(r.cnt) || 0;
      // Set even when 0 — a recorded zero is meaningful (no LDO/DG used that day)
      row.ldoHeatingSessionLitres = Number(r.ldoConsumed);
      row.dgDieselLitres = Number(r.dgDiesel);
    }

    const bdRows = await db.select({
      date: bitumenDipReadings.date,
      plantName: bitumenDipReadings.plantName,
    }).from(bitumenDipReadings)
      .where(and(dateRange(bitumenDipReadings.date), plantEq(bitumenDipReadings.plantName)))
      .groupBy(bitumenDipReadings.date, bitumenDipReadings.plantName);
    for (const r of bdRows) get(r.date, r.plantName).hasBitumenDips = true;

    const ldoRows = await db.select({
      date: ldoFlowReadings.date,
      plantName: ldoFlowReadings.plantName,
    }).from(ldoFlowReadings)
      .where(and(dateRange(ldoFlowReadings.date), plantEq(ldoFlowReadings.plantName)))
      .groupBy(ldoFlowReadings.date, ldoFlowReadings.plantName);
    for (const r of ldoRows) get(r.date, r.plantName).hasLdoMeter = true;

    // Bitumen template MT: SUM(loadWeight × bitumenPercent/100) per (date, plant)
    // Respects the same party/mix filters as the dispatch totals.
    const btplRows = await db.select({
      date: truckDispatches.date,
      plantName: truckDispatches.plantName,
      templateMt: sql<number>`COALESCE(SUM(${truckDispatches.loadWeight} * ${mixTemplates.bitumenPercent} / 100.0), 0)::float`,
    }).from(truckDispatches)
      .innerJoin(mixTemplates, and(
        eq(truckDispatches.mixTemplateId, mixTemplates.id),
        isNotNull(mixTemplates.bitumenPercent),
      ))
      .where(and(
        dateRange(truckDispatches.date),
        plantEq(truckDispatches.plantName),
        partyIds.length ? inArray(truckDispatches.partyId, partyIds) : undefined,
        matchingMixIds ? inArray(truckDispatches.mixTemplateId, matchingMixIds) : undefined,
      ))
      .groupBy(truckDispatches.date, truckDispatches.plantName);
    for (const r of btplRows) {
      // Set even when 0 — a recorded zero means template calls for no bitumen that day
      get(r.date, r.plantName).bitumenTemplateMt = Number(r.templateMt);
    }

    let result = Array.from(map.values());
    if (allowedKeys) {
      result = result.filter((r) => allowedKeys!.has(`${r.date}|${r.plantName}`));
    }
    return result.sort(
      (a, b) => b.date.localeCompare(a.date) || a.plantName.localeCompare(b.plantName)
    );
  }

  async getDailyPlantSummary(date: string, plantName: string = "Main Plant"): Promise<unknown> {
    // Pick the relevant log for this (date, plant) regardless of shift code.
    // Preference order: FULL → DAY → NIGHT → first available.
    const allShifts = await db.select().from(plantShiftLogs)
      .where(and(eq(plantShiftLogs.date, date), eq(plantShiftLogs.plantName, plantName)));
    const headerRow = allShifts[0];
    const shift = headerRow ? await this.getPlantShiftLog(headerRow.id) : undefined;

    const dispatches = await db.select().from(truckDispatches).where(and(eq(truckDispatches.date, date), eq(truckDispatches.plantName, plantName)));
    // Plant-only equipment: exclude site-DPR rows (dprId set) so JCBs/tippers
    // logged against a site DPR don't bleed into the plant's daily report.
    const equipment = await db.select().from(equipmentUsage).where(and(
      eq(equipmentUsage.date, date),
      eq(equipmentUsage.plantName, plantName),
      isNull(equipmentUsage.dprId),
    ));
    // Plant-scoped fuel datasets: filter by (date, plantName) so manually-entered
    // and backfilled rows (which have no sourceShiftLogId) are included alongside
    // shift-log/heating-session-sourced rows.
    const ldoFlows = await db.select().from(ldoFlowReadings)
      .where(and(eq(ldoFlowReadings.date, date), eq(ldoFlowReadings.plantName, plantName)));
    const bitumenDips = await db.select().from(bitumenDipReadings)
      .where(and(eq(bitumenDipReadings.date, date), eq(bitumenDipReadings.plantName, plantName)));
    const ldoDips = await db.select().from(ldoDipReadings)
      .where(and(eq(ldoDipReadings.date, date), eq(ldoDipReadings.plantName, plantName)));
    const receipts = await db.select().from(materialReceipts).where(and(eq(materialReceipts.date, date), eq(materialReceipts.plantName, plantName)));
    const generators = await db.select().from(generatorLogs).where(and(eq(generatorLogs.date, date), eq(generatorLogs.plantName, plantName)));
    const allMixTemplates = await db.select().from(mixTemplates);
    const allParties = await db.select().from(parties);
    const allMaterials = await db.select().from(plantMaterials);
    const allEquipment = await db.select().from(equipmentMaster);
    const mixById = new Map(allMixTemplates.map(m => [m.id, m]));
    const partyById = new Map(allParties.map(p => [p.id, p]));
    const matById = new Map(allMaterials.map(m => [m.id, m]));
    const eqpById = new Map(allEquipment.map(e => [e.id, e]));

    // Production
    const totalLoads = dispatches.length;
    const totalProductionMT = dispatches.reduce((s, d) => s + (d.loadWeight || 0), 0);
    const theoreticalBitumenMT = dispatches.reduce((s, d) => s + (d.theoreticalBitumenQty || 0), 0);
    const theoreticalLdoL = dispatches.reduce((s, d) => s + (d.theoreticalLdoQty || 0), 0);
    const actualBitumenMT = dispatches.reduce((s, d) => {
      if (d.actualBitumenQty != null) return s + d.actualBitumenQty;
      if (d.actualBitumenPercent != null) return s + (d.loadWeight * d.actualBitumenPercent / 100);
      return s + (d.theoreticalBitumenQty || 0);
    }, 0);
    const actualLdoL = dispatches.reduce((s, d) => s + (d.actualLdoQty ?? d.theoreticalLdoQty ?? 0), 0);

    // LDO derived from shift log opening/closing meters (either tank).
    // Falls back to LDO dip readings (opening − closing) when meter values absent.
    let ldoConsumedT1: number | null = null;
    let ldoConsumedT2: number | null = null;
    let t1Source: "shift_meter" | "dip_fallback" | null = null;
    let t2Source: "shift_meter" | "dip_fallback" | null = null;
    if (shift?.ldoTank1OpeningMeter != null && shift?.ldoTank1ClosingMeter != null) {
      ldoConsumedT1 = Math.max(0, shift.ldoTank1ClosingMeter - shift.ldoTank1OpeningMeter);
      t1Source = "shift_meter";
    } else {
      const t1Open = ldoDips.find(d => d.tankNumber === 1 && d.readingType === "opening");
      const t1Close = ldoDips.find(d => d.tankNumber === 1 && d.readingType === "closing");
      if (t1Open && t1Close && t1Open.volumeLiters != null && t1Close.volumeLiters != null) {
        ldoConsumedT1 = Math.max(0, t1Open.volumeLiters - t1Close.volumeLiters);
        t1Source = "dip_fallback";
      }
    }
    if (shift?.ldoTank2OpeningMeter != null && shift?.ldoTank2ClosingMeter != null) {
      ldoConsumedT2 = Math.max(0, shift.ldoTank2ClosingMeter - shift.ldoTank2OpeningMeter);
      t2Source = "shift_meter";
    } else {
      const t2Open = ldoDips.find(d => d.tankNumber === 2 && d.readingType === "opening");
      const t2Close = ldoDips.find(d => d.tankNumber === 2 && d.readingType === "closing");
      if (t2Open && t2Close && t2Open.volumeLiters != null && t2Close.volumeLiters != null) {
        ldoConsumedT2 = Math.max(0, t2Open.volumeLiters - t2Close.volumeLiters);
        t2Source = "dip_fallback";
      }
    }
    const presentSources = [t1Source, t2Source].filter((s): s is "shift_meter" | "dip_fallback" => s !== null);
    const uniqueSources = Array.from(new Set(presentSources));
    const ldoSource: "shift_meter" | "dip_fallback" | "mixed" =
      uniqueSources.length === 0 ? "shift_meter" :
      uniqueSources.length === 1 ? uniqueSources[0] : "mixed";
    const ldoConsumedTotalL = (ldoConsumedT1 || 0) + (ldoConsumedT2 || 0);

    // Plant running hours from shift log
    let runningHours: number | null = null;
    if (shift?.plantStartTime && shift?.plantStopTime) {
      const [sh, sm] = shift.plantStartTime.split(":").map(Number);
      const [eh, em] = shift.plantStopTime.split(":").map(Number);
      if (!isNaN(sh) && !isNaN(eh)) {
        let mins = (eh * 60 + (em || 0)) - (sh * 60 + (sm || 0));
        if (mins < 0) mins += 24 * 60;
        runningHours = Math.round((mins / 60) * 100) / 100;
      }
    }
    const ldoLPerHour = (runningHours && runningHours > 0 && ldoConsumedTotalL > 0)
      ? Math.round((ldoConsumedTotalL / runningHours) * 100) / 100 : null;
    const ldoLPerMT = (totalProductionMT > 0 && ldoConsumedTotalL > 0)
      ? Math.round((ldoConsumedTotalL / totalProductionMT) * 1000) / 1000 : null;
    // Tank-1 (boiler / bitumen heating) and Tank-2 (dryer / mix production) are
    // physically separate consumers — keep per-MT metrics separated so reports
    // never mix boiler heating with dryer production.
    const dryerLPerMT = (totalProductionMT > 0 && (ldoConsumedT2 || 0) > 0)
      ? Math.round(((ldoConsumedT2 as number) / totalProductionMT) * 1000) / 1000 : null;
    const boilerLPerMT = (totalProductionMT > 0 && (ldoConsumedT1 || 0) > 0)
      ? Math.round(((ldoConsumedT1 as number) / totalProductionMT) * 1000) / 1000 : null;

    // Idle minutes by reason
    const idleByReason: Record<string, number> = {};
    let totalIdleMinutes = 0;
    for (const ev of shift?.idleEvents || []) {
      if (!ev.startTime || !ev.endTime) continue;
      const [sh, sm] = ev.startTime.split(":").map(Number);
      const [eh, em] = ev.endTime.split(":").map(Number);
      if (isNaN(sh) || isNaN(eh)) continue;
      let mins = (eh * 60 + (em || 0)) - (sh * 60 + (sm || 0));
      if (mins < 0) mins += 24 * 60;
      idleByReason[ev.reason] = (idleByReason[ev.reason] || 0) + mins;
      totalIdleMinutes += mins;
    }

    // Equipment usage with derived diesel efficiency (DG fuel).
    // closingDiesel is now persisted as the operator's actual dip when one
    // was entered, so the dip-first fallback below is defensive (kept to
    // protect any historic rows written before that change).
    const equipmentSummary = equipment.map(e => {
      const opening = e.openingDiesel ?? null;
      // Defensive: prefer dieselBalanceInTank for legacy rows where
      // closingDiesel was the norm-derived estimate.
      const closing = e.dieselBalanceInTank ?? e.closingDiesel ?? null;
      const issued = e.dieselIssued ?? 0;
      const hours = e.hoursOrKmRun ?? null;
      const expected = e.expectedDiesel ?? null;
      let consumed: number | null = null;
      let lPerHr: number | null = null;
      if (opening != null && closing != null) {
        consumed = Math.max(0, opening + issued - closing);
        if (hours && hours > 0) lPerHr = Math.round((consumed / hours) * 100) / 100;
      }
      const variance = (consumed != null && expected != null) ? Math.round((consumed - expected) * 100) / 100 : null;
      const variancePct = (variance != null && expected != null && expected > 0)
        ? Math.round((variance / expected) * 1000) / 10
        : null;
      return {
        id: e.id,
        equipmentId: e.equipmentId,
        hours,
        opening, closing, issued,
        consumed,
        lPerHr,
        expected,
        variance,
        variancePct,
        balanceConfirmed: e.dieselBalanceConfirmed === true,
        operator: e.operator,
        remarks: e.remarks,
      };
    });

    // Productive hours = running hours − idle hours
    const productiveHours = runningHours != null
      ? Math.max(0, Math.round((runningHours - totalIdleMinutes / 60) * 100) / 100)
      : null;

    // Production by mix template
    const byMixMap = new Map<number, { mixTemplateId: number; mixName: string; mixType: string; loads: number; mt: number }>();
    for (const d of dispatches) {
      const m = mixById.get(d.mixTemplateId);
      const key = d.mixTemplateId;
      const cur = byMixMap.get(key) || {
        mixTemplateId: key,
        mixName: m?.name || `Mix #${key}`,
        mixType: m?.mixType || "—",
        loads: 0, mt: 0,
      };
      cur.loads += 1;
      cur.mt += d.loadWeight || 0;
      byMixMap.set(key, cur);
    }
    const productionByMix = Array.from(byMixMap.values()).sort((a, b) => b.mt - a.mt);

    // Dispatch list (compact for report)
    const dispatchList = dispatches
      .slice()
      .sort((a, b) => (a.time || "").localeCompare(b.time || ""))
      .map(d => ({
        id: d.id,
        time: d.time,
        truckNumber: d.truckNumber,
        partyName: partyById.get(d.partyId)?.name || `Party #${d.partyId}`,
        mixName: mixById.get(d.mixTemplateId)?.name || `Mix #${d.mixTemplateId}`,
        loadWeight: d.loadWeight,
        deliveryLocation: d.deliveryLocation,
      }));

    // Receipts summary (by material)
    const receiptsByMaterial = new Map<number, { materialId: number; materialName: string; uom: string; quantity: number; lines: number }>();
    for (const r of receipts) {
      const cur = receiptsByMaterial.get(r.materialId) || {
        materialId: r.materialId,
        materialName: matById.get(r.materialId)?.name || `Mat #${r.materialId}`,
        uom: r.uom,
        quantity: 0, lines: 0,
      };
      cur.quantity += r.quantity || 0;
      cur.lines += 1;
      receiptsByMaterial.set(r.materialId, cur);
    }
    const receiptsSummary = Array.from(receiptsByMaterial.values()).sort((a, b) => a.materialName.localeCompare(b.materialName));

    // Equipment with names + total diesel issued
    const equipmentEnriched = equipmentSummary.map(e => ({
      ...e,
      equipmentName: e.equipmentId ? (eqpById.get(e.equipmentId)?.name || `#${e.equipmentId}`) : null,
    }));
    const totalDieselIssued = equipment.reduce((s, e) => s + (e.dieselIssued || 0), 0);

    // DG derived efficiency: computed from equipment_usage rows for DG-type
    // equipment (opening + issued − closing over hours), then compared against
    // recorded generator_logs.efficiency. Per task spec the derived figure
    // comes from the equipment-usage tank-balance source of truth.
    const dgEquipmentIds = new Set(
      allEquipment.filter(e => (e.equipmentType || "").toLowerCase() === "generator").map(e => e.id)
    );
    const dgUsageByName = new Map<string, { consumed: number; hours: number; opening: number | null; issued: number; closing: number | null }>();
    for (const e of equipment) {
      if (!dgEquipmentIds.has(e.equipmentId)) continue;
      const eqp = eqpById.get(e.equipmentId);
      if (!eqp) continue;
      const open = e.openingDiesel ?? null;
      const iss = e.dieselIssued ?? 0;
      // Defensive: closingDiesel is now persisted as the dip when one was
      // entered, but for legacy rows it may still be the norm-derived value
      // — prefer dieselBalanceInTank when present.
      const close = e.dieselBalanceInTank ?? e.closingDiesel ?? null;
      const hrs = e.hoursOrKmRun ?? 0;
      const cons = (open != null && close != null) ? Math.max(0, open + iss - close) : 0;
      const cur = dgUsageByName.get(eqp.name) || { consumed: 0, hours: 0, opening: null, issued: 0, closing: null };
      cur.consumed += cons;
      cur.hours += hrs;
      cur.opening = cur.opening == null ? open : cur.opening;
      cur.issued += iss;
      cur.closing = close ?? cur.closing;
      dgUsageByName.set(eqp.name, cur);
    }

    const generatorSummary = generators.map(g => {
      const usage = dgUsageByName.get(g.generatorName);
      const opening = usage?.opening ?? g.openingDiesel ?? null;
      const issued = usage?.issued ?? g.dieselIssued ?? 0;
      const closing = usage?.closing ?? g.closingDiesel ?? null;
      const hrs = usage?.hours || g.hoursRun || null;
      const consumed = usage?.consumed ?? ((opening != null && closing != null) ? Math.max(0, opening + issued - closing) : null);
      const lPerHr = (consumed != null && hrs && hrs > 0) ? Math.round((consumed / hrs) * 100) / 100 : null;
      return {
        id: g.id, generatorName: g.generatorName, hoursRun: hrs,
        opening, issued, closing, consumed, lPerHr,
        derivedSource: usage ? "equipment_usage" : "generator_logs",
        efficiency: g.efficiency ?? null,
        sourceHeatingSessionId: g.sourceHeatingSessionId ?? null,
      };
    });
    const generatorTotalDieselConsumed = generatorSummary.reduce((s, g) => s + (g.consumed || 0), 0);

    const boilerHeating = await this._getBoilerHeatingSummary(date, plantName, shift, totalProductionMT, ldoConsumedT1, ldoFlows);

    // Primary-source rule: when heating sessions exist for the day, sessions
    // are the source of truth for Tank-1 LDO. The shift-log Tank-1 value is
    // demoted to a reconciliation field. This prevents double-counting and
    // keeps the report aligned with the operator's actual boiler runs.
    const t1PrimarySource: "sessions" | "shift_meter" | "dip_fallback" =
      (boilerHeating && boilerHeating.sessionCount > 0)
        ? "sessions"
        : (t1Source ?? "shift_meter");
    const effectiveT1L = t1PrimarySource === "sessions"
      ? (boilerHeating?.sessionsLdoT1L ?? null)
      : ldoConsumedT1;
    const reconciliationT1ShiftL = t1PrimarySource === "sessions" ? ldoConsumedT1 : null;
    const effectiveTotalL = (effectiveT1L || 0) + (ldoConsumedT2 || 0);
    // When the plant log has no start/stop times (runningHours is null) but the
    // primary source is heating sessions, fall back to the total session hours so
    // that L / Hour (combined) can still be computed from measured session data.
    const hoursForLPerHour = (runningHours && runningHours > 0)
      ? runningHours
      : (t1PrimarySource === "sessions" && boilerHeating && boilerHeating.totalHours > 0
          ? boilerHeating.totalHours
          : null);
    const effectiveLPerHour = (hoursForLPerHour && hoursForLPerHour > 0 && effectiveTotalL > 0)
      ? Math.round((effectiveTotalL / hoursForLPerHour) * 100) / 100 : null;
    const effectiveLPerMT = (totalProductionMT > 0 && effectiveTotalL > 0)
      ? Math.round((effectiveTotalL / totalProductionMT) * 1000) / 1000 : null;
    const effectiveBoilerLPerMT = (totalProductionMT > 0 && (effectiveT1L || 0) > 0)
      ? Math.round(((effectiveT1L as number) / totalProductionMT) * 1000) / 1000 : null;

    // Per-tank stock-deducted view: dryer-meter litres are attributed to
    // whichever tank the operator pointed the dryer at. Boiler meter always
    // debits Tank-1. Anything not recorded stays null so the report doesn't
    // imply a zero where nothing was metered.
    const dryerFedFromShift: "TANK_1" | "TANK_2" =
      shift?.dryerFedFrom === "TANK_1" ? "TANK_1" : "TANK_2";
    const dryerL = ldoConsumedT2;
    const hasAnyT1 = (effectiveT1L != null) || (dryerFedFromShift === "TANK_1" && dryerL != null);
    const hasAnyT2 = (dryerFedFromShift === "TANK_2" && dryerL != null);
    const tank1DeductedL = hasAnyT1
      ? (effectiveT1L ?? 0) + (dryerFedFromShift === "TANK_1" ? (dryerL ?? 0) : 0)
      : null;
    const tank2DeductedL = hasAnyT2
      ? (dryerFedFromShift === "TANK_2" ? (dryerL ?? 0) : 0)
      : null;

    // Dip-stick delta: compute opening − closing volume from ldo_dip_readings
    // rows that were auto-generated by this shift log (sourceShiftLogId).
    // These are separate from the meter readings and let managers cross-check
    // the two measurement sources. Only use shift-log-tagged rows so manual
    // dip entries on other dates don't bleed in.
    const shiftLogId = shift?.id ?? null;
    const shiftDips = shiftLogId != null
      ? ldoDips.filter(d => d.sourceShiftLogId === shiftLogId)
      : [];
    const dipT1Open = shiftDips.find(d => d.tankNumber === 1 && d.readingType === "opening");
    const dipT1Close = shiftDips.find(d => d.tankNumber === 1 && d.readingType === "closing");
    const dipT2Open = shiftDips.find(d => d.tankNumber === 2 && d.readingType === "opening");
    const dipT2Close = shiftDips.find(d => d.tankNumber === 2 && d.readingType === "closing");
    // Signed delta: positive = consumed, negative = tank refilled during shift.
    // Not clamped to zero so refill events remain visible for discrepancy analysis.
    const dipDeltaT1L: number | null =
      (dipT1Open?.volumeLiters != null && dipT1Close?.volumeLiters != null)
        ? Math.round((dipT1Open.volumeLiters - dipT1Close.volumeLiters) * 10) / 10
        : null;
    const dipDeltaT2L: number | null =
      (dipT2Open?.volumeLiters != null && dipT2Close?.volumeLiters != null)
        ? Math.round((dipT2Open.volumeLiters - dipT2Close.volumeLiters) * 10) / 10
        : null;

    return {
      date,
      plantName,
      shift,
      production: {
        totalLoads,
        totalProductionMT,
        theoreticalBitumenMT,
        actualBitumenMT,
        bitumenVarianceMT: actualBitumenMT - theoreticalBitumenMT,
        theoreticalLdoL,
        actualLdoL,
        byMix: productionByMix,
      },
      dispatches: dispatchList,
      receipts: { byMaterial: receiptsSummary, totalLines: receipts.length },
      runningHours,
      productiveHours,
      ldo: {
        consumedT1L: effectiveT1L,
        consumedT2L: ldoConsumedT2,
        consumedTotalL: effectiveTotalL || null,
        lPerHour: effectiveLPerHour,
        lPerMT: effectiveLPerMT,
        dryerLPerMT,
        boilerLPerMT: effectiveBoilerLPerMT,
        source: ldoSource,
        primarySourceT1: t1PrimarySource,
        reconciliationT1ShiftL,
        dryerFedFrom: dryerFedFromShift,
        tank1DeductedL,
        tank2DeductedL,
        dipDeltaT1L,
        dipDeltaT2L,
      },
      bitumenDips,
      ldoFlows,
      ldoDips,
      equipment: equipmentEnriched,
      totalDieselIssued,
      generators: { items: generatorSummary, totalDieselConsumedL: generatorTotalDieselConsumed },
      manpower: shift?.manpower || [],
      manpowerByContractor: (() => {
        const rows = (shift?.manpower || []) as Array<{ contractorName?: string | null; category?: string | null; gender?: string | null }>;
        const map = new Map<string, { contractor: string; category: string; gender: string; count: number }>();
        for (const r of rows) {
          const contractor = (r.contractorName && r.contractorName.trim()) || "Unassigned";
          const category = (r.category && r.category.trim()) || "—";
          const gender = (r.gender && r.gender.trim()) || "—";
          const key = `${contractor}||${category}||${gender}`;
          const existing = map.get(key);
          if (existing) existing.count += 1;
          else map.set(key, { contractor, category, gender, count: 1 });
        }
        return Array.from(map.values()).sort((a, b) =>
          a.contractor.localeCompare(b.contractor) ||
          a.category.localeCompare(b.category) ||
          a.gender.localeCompare(b.gender)
        );
      })(),
      idle: {
        events: shift?.idleEvents || [],
        byReason: idleByReason,
        totalMinutes: totalIdleMinutes,
      },
      boilerHeating,
    };
  }

  // ============================================
  // BITUMEN HEATING SESSIONS
  // ============================================

  private _computeDurationHours(start?: string | null, end?: string | null): number | null {
    if (!start || !end) return null;
    const [sh, sm] = start.split(":").map(Number);
    const [eh, em] = end.split(":").map(Number);
    if (isNaN(sh) || isNaN(eh)) return null;
    let mins = (eh * 60 + (em || 0)) - (sh * 60 + (sm || 0));
    if (mins < 0) mins += 24 * 60;
    return Math.round((mins / 60) * 1000) / 1000;
  }

  async getBitumenHeatingSessions(filters: { dateFrom?: string; dateTo?: string; date?: string; plantName?: string } = {}): Promise<BitumenHeatingSession[]> {
    const conds: any[] = [];
    if (filters.date) conds.push(eq(bitumenHeatingSessions.date, filters.date));
    if (filters.dateFrom) conds.push(gte(bitumenHeatingSessions.date, filters.dateFrom));
    if (filters.dateTo) conds.push(lte(bitumenHeatingSessions.date, filters.dateTo));
    if (filters.plantName) conds.push(eq(bitumenHeatingSessions.plantName, filters.plantName));

    // LEFT JOIN generator_logs to resolve dgGeneratorName for sessions that were
    // linked before the write-back was introduced. COALESCE prefers the stored value
    // (fast path for new sessions) and falls back to the joined name (legacy rows).
    const { dgGeneratorName: _stored, ...restCols } = getTableColumns(bitumenHeatingSessions);
    const q = db.select({
      ...restCols,
      dgGeneratorName: sql<string | null>`COALESCE(${bitumenHeatingSessions.dgGeneratorName}, ${generatorLogs.generatorName})`,
    }).from(bitumenHeatingSessions)
      .leftJoin(generatorLogs, eq(bitumenHeatingSessions.generatorLogId, generatorLogs.id));

    const rows = conds.length
      ? await q.where(and(...conds)).orderBy(desc(bitumenHeatingSessions.date), asc(bitumenHeatingSessions.startTime))
      : await q.orderBy(desc(bitumenHeatingSessions.date), asc(bitumenHeatingSessions.startTime));
    return rows as BitumenHeatingSession[];
  }

  async getBitumenHeatingSession(id: number): Promise<BitumenHeatingSession | undefined> {
    const [row] = await db.select().from(bitumenHeatingSessions).where(eq(bitumenHeatingSessions.id, id)).limit(1);
    return row;
  }

  async upsertBitumenHeatingSession(input: UpsertBitumenHeatingSessionInput, editedBy?: string, authorizedRole?: "admin" | "manager" | null): Promise<BitumenHeatingSession> {
    const { id, pin: _pin, editedBy: _e, ...rest } = input;
    const payload: Partial<InsertBitumenHeatingSession> = { ...rest };

    // Server-side meter integrity: closing >= opening for LDO Tank-1, and DG diesel
    // open + issued >= close. Defends against malformed (non-UI) clients.
    if (payload.ldoTank1OpeningMeter != null && payload.ldoTank1ClosingMeter != null
        && payload.ldoTank1ClosingMeter < payload.ldoTank1OpeningMeter) {
      const err: any = new Error("LDO Tank-1 closing meter must be ≥ opening meter");
      err.code = "METER_DECREASING";
      throw err;
    }
    if (payload.dgMode === "inline"
        && payload.dgOpeningDiesel != null && payload.dgClosingDiesel != null) {
      const op = payload.dgOpeningDiesel;
      const cl = payload.dgClosingDiesel;
      const iss = payload.dgIssuedDiesel ?? 0;
      if (cl > op + iss) {
        const err: any = new Error("DG closing diesel cannot exceed opening + issued");
        err.code = "DG_DIESEL_INCONSISTENT";
        throw err;
      }
    }

    // Derived numbers
    const durationHours = this._computeDurationHours(payload.startTime, payload.endTime);
    if (durationHours != null) payload.durationHours = durationHours;
    // Dip-stick readings are the authoritative source for LDO consumption while the
    // flow meters are being calibrated. Fall back to meter delta only when dip is absent.
    if (payload.ldoTank1OpeningDip != null && payload.ldoTank1ClosingDip != null) {
      payload.ldoTank1Consumed = Math.max(0,
        getLdoVolumeAtDepth(1, payload.ldoTank1OpeningDip) - getLdoVolumeAtDepth(1, payload.ldoTank1ClosingDip)
      );
    } else if (payload.ldoTank1OpeningMeter != null && payload.ldoTank1ClosingMeter != null) {
      payload.ldoTank1Consumed = Math.max(0, payload.ldoTank1ClosingMeter - payload.ldoTank1OpeningMeter);
    }
    if (payload.dgMode === "inline") {
      // Auto-coerce inline → none when the operator left every DG field blank
      // (default form state). Prevents persisting empty placeholder generator
      // log rows when no DG actually ran during the heating session.
      // Generator name is intentionally excluded — it's pre-populated with a
      // default ("600 KVA") so its presence does not indicate that DG actually ran.
      const hasAnyDgInput = !!payload.dgStartTime || !!payload.dgEndTime
        || payload.dgOpeningDiesel != null || payload.dgClosingDiesel != null
        || payload.dgIssuedDiesel != null
        || payload.dgOpeningHourMeter != null || payload.dgClosingHourMeter != null;
      if (!hasAnyDgInput) {
        payload.dgMode = "none";
      } else {
        // Validate hour-meter range when both readings provided.
        if (payload.dgOpeningHourMeter != null && payload.dgClosingHourMeter != null
            && payload.dgClosingHourMeter < payload.dgOpeningHourMeter) {
          const err: any = new Error("DG closing hour-meter must be ≥ opening hour-meter");
          err.code = "DG_HOUR_METER_RANGE";
          throw err;
        }
        // Prefer hour-meter reading for DG hours when both are provided; fall
        // back to clock time. This drives reporting and L/Hr efficiency.
        const dgHoursFromMeter = (payload.dgOpeningHourMeter != null && payload.dgClosingHourMeter != null)
          ? Math.max(0, Math.round((payload.dgClosingHourMeter - payload.dgOpeningHourMeter) * 100) / 100)
          : null;
        const dgHoursFromTime = this._computeDurationHours(payload.dgStartTime, payload.dgEndTime);
        const dgHours = dgHoursFromMeter ?? dgHoursFromTime;
        if (dgHours != null) payload.dgHoursRun = dgHours;
        const op = payload.dgOpeningDiesel ?? null;
        const cl = payload.dgClosingDiesel ?? null;
        const iss = payload.dgIssuedDiesel ?? 0;
        if (op != null && cl != null) payload.dgDieselConsumed = Math.max(0, op + iss - cl);
      }
    }
    if (payload.dgMode === "link" && payload.generatorLogId == null) {
      const err: any = new Error("dgMode='link' requires selecting an existing Generator Log");
      err.code = "GEN_LOG_REQUIRED";
      throw err;
    } else if (payload.dgMode === "link" && payload.generatorLogId != null) {
      // Pull the linked generator log first to validate same-date / same-plant.
      const [linked] = await db.select().from(generatorLogs)
        .where(eq(generatorLogs.id, payload.generatorLogId)).limit(1);
      if (!linked) {
        const err: any = new Error(`Generator log #${payload.generatorLogId} not found`);
        err.code = "GEN_LOG_NOT_FOUND";
        throw err;
      }
      if (payload.date && linked.date !== payload.date) {
        const err: any = new Error(`Linked generator log date (${linked.date}) does not match heating session date (${payload.date})`);
        err.code = "GEN_LOG_DATE_MISMATCH";
        throw err;
      }
      if (payload.plantName && linked.plantName && linked.plantName !== payload.plantName) {
        const err: any = new Error(`Linked generator log plant (${linked.plantName}) does not match heating session plant (${payload.plantName})`);
        err.code = "GEN_LOG_PLANT_MISMATCH";
        throw err;
      }
      // Guard: a generator log may only be linked from one heating session at
      // a time, otherwise its diesel/hours would be over-attributed.
      const conflicts = await db.select({ id: bitumenHeatingSessions.id })
        .from(bitumenHeatingSessions)
        .where(eq(bitumenHeatingSessions.generatorLogId, payload.generatorLogId));
      const otherLink = conflicts.find(c => c.id !== id);
      if (otherLink) {
        const err: any = new Error(`Generator log #${payload.generatorLogId} is already linked to heating session #${otherLink.id}.`);
        err.code = "GEN_LOG_ALREADY_LINKED";
        throw err;
      }
      // Pull totals and name from the linked generator log so reports and badges
      // work without a join on every list load.
      payload.dgHoursRun = linked.hoursRun ?? null;
      payload.dgDieselConsumed = linked.dieselConsumed ?? null;
      payload.dgGeneratorName = linked.generatorName ?? null;
    } else if (payload.dgMode !== "inline") {
      // Only clear computed values for "none" mode (no DG run).
      // For "inline" mode the values were already computed in the block above
      // and must not be overwritten here.
      payload.dgDieselConsumed = null;
      payload.dgHoursRun = null;
    }

    return db.transaction(async (tx) => {
      let existing: BitumenHeatingSession | undefined;
      if (id) {
        [existing] = await tx.select().from(bitumenHeatingSessions).where(eq(bitumenHeatingSessions.id, id)).limit(1);
        if (existing && existing.isFinalized === 1 && !authorizedRole) {
          const err: any = new Error("Heating session is finalized — manager or admin PIN required to edit");
          err.code = "FINALIZED_LOCKED";
          throw err;
        }
      }

      let saved: BitumenHeatingSession;
      if (existing) {
        await tx.insert(plantHeatingSessionVersions).values({
          sessionId: existing.id,
          snapshot: existing as Record<string, unknown>,
          editedBy: editedBy || "operator",
        });
        const [updated] = await tx.update(bitumenHeatingSessions)
          .set({ ...payload, updatedAt: new Date() })
          .where(eq(bitumenHeatingSessions.id, existing.id))
          .returning();
        saved = updated;
      } else {
        const [created] = await tx.insert(bitumenHeatingSessions)
          .values({ ...payload, createdBy: editedBy || "operator" } as any)
          .returning();
        saved = created;
      }

      // DG sync
      if (saved.dgMode === "inline") {
        // Upsert generator log keyed by sourceHeatingSessionId
        const [existingDg] = await tx.select().from(generatorLogs)
          .where(eq(generatorLogs.sourceHeatingSessionId, saved.id)).limit(1);
        const dgRow = {
          date: saved.date,
          generatorName: saved.dgGeneratorName || "600 KVA GENERATOR",
          startTime: saved.dgStartTime,
          endTime: saved.dgEndTime,
          hoursRun: saved.dgHoursRun,
          openingDiesel: saved.dgOpeningDiesel,
          dieselIssued: saved.dgIssuedDiesel,
          closingDiesel: saved.dgClosingDiesel,
          dieselConsumed: saved.dgDieselConsumed,
          efficiency: (saved.dgDieselConsumed != null && saved.dgHoursRun && saved.dgHoursRun > 0)
            ? Math.round((saved.dgDieselConsumed / saved.dgHoursRun) * 1000) / 1000 : null,
          plantName: saved.plantName,
          sourceHeatingSessionId: saved.id,
        };
        let linkedId: number;
        if (existingDg) {
          const [u] = await tx.update(generatorLogs).set(dgRow).where(eq(generatorLogs.id, existingDg.id)).returning();
          linkedId = u.id;
        } else {
          const [c] = await tx.insert(generatorLogs).values(dgRow).returning();
          linkedId = c.id;
        }
        if (saved.generatorLogId !== linkedId) {
          const [u] = await tx.update(bitumenHeatingSessions)
            .set({ generatorLogId: linkedId })
            .where(eq(bitumenHeatingSessions.id, saved.id))
            .returning();
          saved = u;
        }
      } else if (saved.dgMode === "link") {
        // Switching from inline → link can target the very row this session
        // previously created (generatorLogId === inline row id). In that case
        // we MUST NOT delete it; instead release it from this session by
        // clearing sourceHeatingSessionId so it becomes a standalone log.
        // Any other inline row tagged for this session is a true orphan and
        // is removed.
        if (saved.generatorLogId != null) {
          await tx.update(generatorLogs)
            .set({ sourceHeatingSessionId: null })
            .where(and(
              eq(generatorLogs.sourceHeatingSessionId, saved.id),
              eq(generatorLogs.id, saved.generatorLogId),
            ));
        }
        await tx.delete(generatorLogs).where(and(
          eq(generatorLogs.sourceHeatingSessionId, saved.id),
          ...(saved.generatorLogId != null ? [ne(generatorLogs.id, saved.generatorLogId)] : []),
        ));
      } else {
        // dgMode === "none": no link, drop any inline DG row for this session
        await tx.delete(generatorLogs).where(eq(generatorLogs.sourceHeatingSessionId, saved.id));
        if (saved.generatorLogId != null) {
          const [u] = await tx.update(bitumenHeatingSessions)
            .set({ generatorLogId: null })
            .where(eq(bitumenHeatingSessions.id, saved.id))
            .returning();
          saved = u;
        }
      }

      // Equipment Usage mirror: when the operator captures a DG run inline
      // inside the heating session, also create the matching equipment_usage
      // row so reports / fuel-stock ledgers see it. Keyed by
      // sourceHeatingSessionId for idempotent upsert. For link/none modes,
      // any previously mirrored row is removed.
      await tx.delete(equipmentUsage)
        .where(eq(equipmentUsage.sourceHeatingSessionId, saved.id));
      if (saved.dgMode === "inline" && saved.dgGeneratorName) {
        const [genEquip] = await tx.select().from(equipmentMaster)
          .where(eq(equipmentMaster.name, saved.dgGeneratorName))
          .limit(1);
        if (genEquip) {
          const hours = saved.dgHoursRun ?? null;
          const opening = saved.dgOpeningDiesel ?? null;
          const issued = saved.dgIssuedDiesel ?? 0;
          const closing = saved.dgClosingDiesel ?? null;
          const consumed = saved.dgDieselConsumed ?? null;
          const expected = (hours != null && genEquip.consumptionNorm != null)
            ? Math.round(hours * genEquip.consumptionNorm * 100) / 100
            : (consumed ?? null);
          await tx.insert(equipmentUsage).values({
            date: saved.date,
            equipmentId: genEquip.id,
            entryType: "time_meter",
            startTime: saved.dgStartTime || null,
            endTime: saved.dgEndTime || null,
            hoursOrKmRun: hours ?? 0,
            openingReading: saved.dgOpeningHourMeter ?? null,
            closingReading: saved.dgClosingHourMeter ?? null,
            openingDiesel: opening ?? 0,
            dieselIssued: issued ?? 0,
            closingDiesel: closing,
            expectedDiesel: expected,
            variance: (consumed != null && expected != null)
              ? Math.round((consumed - expected) * 100) / 100
              : null,
            plantName: saved.plantName,
            remarks: `Auto from heating session #${saved.id}`,
            sourceHeatingSessionId: saved.id,
          } as any);
        }
      }

      // LDO Boiler Meter sync: tag opening/closing flow-meter rows for this
      // session so the LDO Flow Meter ledger reflects boiler usage automatically.
      // Idempotent: drop any rows previously tagged for this session, then
      // re-insert opening/closing if values are present.
      await tx.delete(ldoFlowReadings)
        .where(eq(ldoFlowReadings.sourceHeatingSessionId, saved.id));
      const ldoRows: InsertLdoFlowReading[] = [];
      // startTime/endTime are stored as plain "HH:mm" text — use as-is.
      const startTimeStr = saved.startTime || null;
      const endTimeStr = saved.endTime || null;
      if (saved.ldoTank1OpeningMeter != null) {
        ldoRows.push({
          date: saved.date,
          time: startTimeStr,
          tankNumber: 1,
          meterReading: saved.ldoTank1OpeningMeter,
          readingType: "opening",
          notes: `Auto from heating session #${saved.id}`,
          plantName: saved.plantName,
          sourceHeatingSessionId: saved.id,
        });
      }
      if (saved.ldoTank1ClosingMeter != null) {
        ldoRows.push({
          date: saved.date,
          time: endTimeStr,
          tankNumber: 1,
          meterReading: saved.ldoTank1ClosingMeter,
          readingType: "closing",
          // Store the consumed amount here so the LDO Flow reconciliation page
          // can sum quantityLiters directly per row (opening rows carry no qty).
          quantityLiters: saved.ldoTank1Consumed ?? null,
          notes: `Auto from heating session #${saved.id}`,
          plantName: saved.plantName,
          sourceHeatingSessionId: saved.id,
        });
      }
      if (ldoRows.length > 0) {
        await tx.insert(ldoFlowReadings).values(ldoRows).onConflictDoNothing();
      }

      // LDO Dip sync: upsert opening/closing dip readings into ldo_dip_readings
      // keyed by sourceHeatingSessionId so they round-trip cleanly on edits.
      await tx.delete(ldoDipReadings)
        .where(eq(ldoDipReadings.sourceHeatingSessionId, saved.id));
      const dipRows: any[] = [];
      const pushDip = (tank: number, type: "opening" | "closing", depth: number | null | undefined, time: string | null) => {
        if (depth == null) return;
        const vol = getLdoVolumeAtDepth(tank, depth);
        const wt = vol * LDO_DENSITY_KG_PER_LITER;
        dipRows.push({
          date: saved.date,
          time,
          tankNumber: tank,
          depthCm: depth,
          volumeLiters: Math.round(vol),
          weightKg: Math.round(wt),
          readingType: type,
          notes: `AUTO from Heating Session #${saved.id}`,
          plantName: saved.plantName,
          sourceHeatingSessionId: saved.id,
        });
      };
      pushDip(1, "opening", saved.ldoTank1OpeningDip, startTimeStr);
      pushDip(1, "closing", saved.ldoTank1ClosingDip, endTimeStr);
      pushDip(2, "opening", saved.ldoTank2OpeningDip, startTimeStr);
      pushDip(2, "closing", saved.ldoTank2ClosingDip, endTimeStr);
      if (dipRows.length > 0) {
        await tx.insert(ldoDipReadings).values(dipRows).onConflictDoNothing();
      }

      return saved;
    });
  }

  async finalizeBitumenHeatingSession(id: number, finalizedBy: string): Promise<BitumenHeatingSession | undefined> {
    const [updated] = await db.update(bitumenHeatingSessions)
      .set({ isFinalized: 1, finalizedBy, finalizedAt: new Date(), updatedAt: new Date() })
      .where(eq(bitumenHeatingSessions.id, id))
      .returning();
    return updated;
  }

  async deleteBitumenHeatingSession(id: number): Promise<boolean> {
    return db.transaction(async (tx) => {
      await tx.delete(generatorLogs).where(eq(generatorLogs.sourceHeatingSessionId, id));
      await tx.delete(equipmentUsage).where(eq(equipmentUsage.sourceHeatingSessionId, id));
      await tx.delete(ldoFlowReadings).where(eq(ldoFlowReadings.sourceHeatingSessionId, id));
      await tx.delete(ldoDipReadings).where(eq(ldoDipReadings.sourceHeatingSessionId, id));
      await tx.delete(plantHeatingSessionVersions).where(eq(plantHeatingSessionVersions.sessionId, id));
      const result = await tx.delete(bitumenHeatingSessions).where(eq(bitumenHeatingSessions.id, id)).returning();
      return result.length > 0;
    });
  }

  async getHeatingTrends(filters: { dateFrom: string; dateTo: string; plantName?: string }): Promise<HeatingTrendsResult> {
    const plantName = filters.plantName || "Main Plant";
    const dateFrom = filters.dateFrom;
    const dateTo = filters.dateTo;
    const TARGET_L_PER_MT = 1.5;

    const sessions = await this.getBitumenHeatingSessions({ dateFrom, dateTo, plantName });
    const dispatches = await db.select().from(truckDispatches).where(and(
      gte(truckDispatches.date, dateFrom),
      lte(truckDispatches.date, dateTo),
      eq(truckDispatches.plantName, plantName),
    ));
    const shiftLogs = await db.select().from(plantShiftLogs).where(and(
      gte(plantShiftLogs.date, dateFrom),
      lte(plantShiftLogs.date, dateTo),
      eq(plantShiftLogs.plantName, plantName),
    ));
    // Fixed operational guard rails (inline constants, no admin tuning).
    // The previous admin-tunable threshold layer was removed in Task #248;
    // these defaults are the long-standing values used to flag suspect days
    // on the Heating Trends report and its Excel export. Centralized in
    // `shared/heating-trends-constants.ts` so the trends badge, the API
    // payload and the mismatch drill-down view (Task #238) stay in sync.
    const hotOilEndTempMinC = HEATING_TRENDS_HOT_OIL_END_TEMP_MIN_C;
    const hotOilDeltaMinC = HEATING_TRENDS_HOT_OIL_DELTA_MIN_C;
    const mismatchThresholdL = HEATING_TRENDS_MISMATCH_THRESHOLD_L;

    // Aggregate shift-meter Tank-1 L per day (closing − opening). When more
    // than one shift log exists for a date (multi-shift days), sum them so
    // the per-day total still represents the meter delta for the calendar
    // day. Days without an opening + closing reading stay null.
    const shiftMeterByDate = new Map<string, number | null>();
    for (const sh of shiftLogs) {
      const open = sh.ldoTank1OpeningMeter;
      const close = sh.ldoTank1ClosingMeter;
      if (open == null || close == null) continue;
      const consumed = Math.max(0, close - open);
      const prev = shiftMeterByDate.get(sh.date);
      shiftMeterByDate.set(sh.date, (prev ?? 0) + consumed);
    }

    const productionByDate = new Map<string, number>();
    for (const d of dispatches) {
      productionByDate.set(d.date, (productionByDate.get(d.date) || 0) + (d.loadWeight || 0));
    }

    const dateKeys = new Set<string>();
    for (const s of sessions) dateKeys.add(s.date);
    for (const d of productionByDate.keys()) dateKeys.add(d);

    // Walk every calendar day in range so the chart has a continuous x-axis.
    const start = new Date(`${dateFrom}T00:00:00`);
    const end = new Date(`${dateTo}T00:00:00`);
    for (let t = start.getTime(); t <= end.getTime(); t += 24 * 3600 * 1000) {
      dateKeys.add(new Date(t).toISOString().slice(0, 10));
    }

    const emptyBucket = (): HeatingTrendsBucket => ({
      count: 0, hours: 0, ldoT1L: 0, dgDieselL: 0, lPerHour: null, lPerMT: null,
    });
    const round = (n: number, p = 2) => Math.round(n * Math.pow(10, p)) / Math.pow(10, p);

    const rowMap = new Map<string, HeatingTrendsRow>();
    for (const dt of dateKeys) {
      rowMap.set(dt, {
        date: dt,
        productionMT: round(productionByDate.get(dt) || 0, 3),
        night: emptyBucket(),
        day: emptyBucket(),
        total: emptyBucket(),
        hotOilEndAvgC: null,
        hotOilEndMinC: null,
        hotOilEndMaxC: null,
        hotOilEndSampleCount: 0,
        hotOilEndBelowThreshold: false,
        hotOilSupplyAvgC: null,
        hotOilReturnAvgC: null,
        hotOilDeltaAvgC: null,
        hotOilDeltaSampleCount: 0,
        hotOilDeltaBelowThreshold: false,
        shiftMeterT1L: null,
        shiftMeterLPerMT: null,
        mismatchL: null,
        mismatchFlag: false,
      });
    }

    const hotOilByDate = new Map<string, number[]>();
    const hotOilSupplyByDate = new Map<string, number[]>();
    const hotOilReturnByDate = new Map<string, number[]>();
    const hotOilDeltaByDate = new Map<string, number[]>();
    for (const s of sessions) {
      const row = rowMap.get(s.date);
      if (!row) continue;
      const bucket = s.sessionType === "DAY_MAINTENANCE" ? row.day : row.night;
      bucket.count += 1;
      bucket.hours += s.durationHours || 0;
      bucket.ldoT1L += s.ldoTank1Consumed || 0;
      bucket.dgDieselL += s.dgDieselConsumed || 0;
      row.total.count += 1;
      row.total.hours += s.durationHours || 0;
      row.total.ldoT1L += s.ldoTank1Consumed || 0;
      row.total.dgDieselL += s.dgDieselConsumed || 0;
      if (s.hotOilTempEnd != null && !isNaN(s.hotOilTempEnd as number)) {
        const arr = hotOilByDate.get(s.date) || [];
        arr.push(s.hotOilTempEnd);
        hotOilByDate.set(s.date, arr);
      }
      const supply = s.hotOilSupplyTemp;
      const ret = s.hotOilReturnTemp;
      if (supply != null && !isNaN(supply)) {
        const arr = hotOilSupplyByDate.get(s.date) || [];
        arr.push(supply);
        hotOilSupplyByDate.set(s.date, arr);
      }
      if (ret != null && !isNaN(ret)) {
        const arr = hotOilReturnByDate.get(s.date) || [];
        arr.push(ret);
        hotOilReturnByDate.set(s.date, arr);
      }
      // Per-session delta only when both readings exist on the same session,
      // so we never average a supply from one session against a return from
      // another (which would produce a misleading delta if one of the two
      // sensors was missing for part of the day).
      if (
        supply != null && !isNaN(supply) &&
        ret != null && !isNaN(ret)
      ) {
        const arr = hotOilDeltaByDate.get(s.date) || [];
        arr.push(supply - ret);
        hotOilDeltaByDate.set(s.date, arr);
      }
    }
    for (const [dt, samples] of hotOilByDate.entries()) {
      const row = rowMap.get(dt);
      if (!row || samples.length === 0) continue;
      const sum = samples.reduce((a: number, b: number) => a + b, 0);
      const avg = sum / samples.length;
      row.hotOilEndAvgC = round(avg, 1);
      row.hotOilEndMinC = round(Math.min(...samples), 1);
      row.hotOilEndMaxC = round(Math.max(...samples), 1);
      row.hotOilEndSampleCount = samples.length;
      row.hotOilEndBelowThreshold = avg < hotOilEndTempMinC;
    }
    const avgOf = (samples: number[]): number | null => {
      if (samples.length === 0) return null;
      return samples.reduce((a, b) => a + b, 0) / samples.length;
    };
    for (const [dt, row] of rowMap.entries()) {
      const supplyAvg = avgOf(hotOilSupplyByDate.get(dt) || []);
      const returnAvg = avgOf(hotOilReturnByDate.get(dt) || []);
      const deltaSamples = hotOilDeltaByDate.get(dt) || [];
      const deltaAvg = avgOf(deltaSamples);
      row.hotOilSupplyAvgC = supplyAvg == null ? null : round(supplyAvg, 1);
      row.hotOilReturnAvgC = returnAvg == null ? null : round(returnAvg, 1);
      row.hotOilDeltaAvgC = deltaAvg == null ? null : round(deltaAvg, 1);
      row.hotOilDeltaSampleCount = deltaSamples.length;
      row.hotOilDeltaBelowThreshold =
        deltaAvg != null && deltaAvg < hotOilDeltaMinC;
    }

    const finalize = (b: HeatingTrendsBucket, mt: number) => {
      b.hours = round(b.hours, 2);
      b.ldoT1L = round(b.ldoT1L, 2);
      b.dgDieselL = round(b.dgDieselL, 2);
      b.lPerHour = b.hours > 0 ? round(b.ldoT1L / b.hours, 2) : null;
      b.lPerMT = mt > 0 && b.ldoT1L > 0 ? round(b.ldoT1L / mt, 3) : null;
    };

    const rows = Array.from(rowMap.values()).sort((a, b) => a.date.localeCompare(b.date));
    let sumHours = 0, sumLdo = 0, sumDg = 0, sumMT = 0, sumSessions = 0;
    let hotOilSampleSum = 0, hotOilSampleCount = 0;
    let hotOilOverallMin: number | null = null;
    let hotOilOverallMax: number | null = null;
    let hotOilFlaggedDays = 0;
    // Hot-oil supply / return / delta period summaries. Each is weighted by
    // the per-day sample count so days with more sessions contribute more.
    let hotOilSupplySum = 0, hotOilSupplyCount = 0;
    let hotOilReturnSum = 0, hotOilReturnCount = 0;
    let hotOilDeltaSum = 0, hotOilDeltaCount = 0;
    let hotOilDeltaOverallMin: number | null = null;
    let hotOilDeltaFlaggedDays = 0;
    let sumShiftMeter = 0, daysWithShiftMeter = 0, mismatchDays = 0;
    for (const r of rows) {
      finalize(r.night, r.productionMT);
      finalize(r.day, r.productionMT);
      finalize(r.total, r.productionMT);

      // Attach shift-meter Tank-1 reconciliation per Task #155.
      const shiftL = shiftMeterByDate.has(r.date) ? shiftMeterByDate.get(r.date)! : null;
      if (shiftL != null) {
        r.shiftMeterT1L = round(shiftL, 2);
        r.shiftMeterLPerMT = r.productionMT > 0 && shiftL > 0
          ? round(shiftL / r.productionMT, 3) : null;
        sumShiftMeter += shiftL;
        daysWithShiftMeter += 1;
        // Compute the delta whenever shift-meter exists, even when the day has
        // zero sessions — those are precisely the "operator forgot to log
        // sessions" days the trend report is meant to surface (Task #155).
        const diff = r.total.ldoT1L - shiftL;
        r.mismatchL = round(diff, 1);
        if (Math.abs(diff) > mismatchThresholdL) {
          r.mismatchFlag = true;
          mismatchDays += 1;
        }
      }

      sumHours += r.total.hours;
      sumLdo += r.total.ldoT1L;
      sumDg += r.total.dgDieselL;
      sumMT += r.productionMT;
      sumSessions += r.total.count;
      if (r.hotOilEndSampleCount > 0 && r.hotOilEndAvgC != null) {
        hotOilSampleSum += r.hotOilEndAvgC * r.hotOilEndSampleCount;
        hotOilSampleCount += r.hotOilEndSampleCount;
        if (r.hotOilEndMinC != null) {
          hotOilOverallMin = hotOilOverallMin == null ? r.hotOilEndMinC : Math.min(hotOilOverallMin, r.hotOilEndMinC);
        }
        if (r.hotOilEndMaxC != null) {
          hotOilOverallMax = hotOilOverallMax == null ? r.hotOilEndMaxC : Math.max(hotOilOverallMax, r.hotOilEndMaxC);
        }
      }
      if (r.hotOilEndBelowThreshold) hotOilFlaggedDays += 1;

      const supplySamples = (hotOilSupplyByDate.get(r.date) || []).length;
      if (r.hotOilSupplyAvgC != null && supplySamples > 0) {
        hotOilSupplySum += r.hotOilSupplyAvgC * supplySamples;
        hotOilSupplyCount += supplySamples;
      }
      const returnSamples = (hotOilReturnByDate.get(r.date) || []).length;
      if (r.hotOilReturnAvgC != null && returnSamples > 0) {
        hotOilReturnSum += r.hotOilReturnAvgC * returnSamples;
        hotOilReturnCount += returnSamples;
      }
      if (r.hotOilDeltaAvgC != null && r.hotOilDeltaSampleCount > 0) {
        hotOilDeltaSum += r.hotOilDeltaAvgC * r.hotOilDeltaSampleCount;
        hotOilDeltaCount += r.hotOilDeltaSampleCount;
        hotOilDeltaOverallMin = hotOilDeltaOverallMin == null
          ? r.hotOilDeltaAvgC
          : Math.min(hotOilDeltaOverallMin, r.hotOilDeltaAvgC);
      }
      if (r.hotOilDeltaBelowThreshold) hotOilDeltaFlaggedDays += 1;
    }

    return {
      dateFrom,
      dateTo,
      plantName,
      targetLPerMT: TARGET_L_PER_MT,
      hotOilEndTempMinC,
      hotOilDeltaMinC,
      mismatchThresholdL,
      rows,
      summary: {
        days: rows.length,
        sessionCount: sumSessions,
        totalHours: round(sumHours, 2),
        totalLdoT1L: round(sumLdo, 2),
        dgDieselL: round(sumDg, 2),
        totalProductionMT: round(sumMT, 3),
        lPerHour: sumHours > 0 ? round(sumLdo / sumHours, 2) : null,
        lPerMT: sumMT > 0 && sumLdo > 0 ? round(sumLdo / sumMT, 3) : null,
        hotOilEndAvgC: hotOilSampleCount > 0 ? round(hotOilSampleSum / hotOilSampleCount, 1) : null,
        hotOilEndMinC: hotOilOverallMin,
        hotOilEndMaxC: hotOilOverallMax,
        hotOilFlaggedDays,
        hotOilSupplyAvgC: hotOilSupplyCount > 0 ? round(hotOilSupplySum / hotOilSupplyCount, 1) : null,
        hotOilReturnAvgC: hotOilReturnCount > 0 ? round(hotOilReturnSum / hotOilReturnCount, 1) : null,
        hotOilDeltaAvgC: hotOilDeltaCount > 0 ? round(hotOilDeltaSum / hotOilDeltaCount, 1) : null,
        hotOilDeltaMinObservedC: hotOilDeltaOverallMin == null ? null : round(hotOilDeltaOverallMin, 1),
        hotOilDeltaFlaggedDays,
        totalShiftMeterT1L: round(sumShiftMeter, 2),
        shiftMeterLPerMT: sumMT > 0 && sumShiftMeter > 0
          ? round(sumShiftMeter / sumMT, 3) : null,
        mismatchDays,
        daysWithShiftMeter,
      },
    };
  }

  async getLatestLdoMeterReading(tank: number, beforeDateTime: string, plantName: string = "Main Plant"): Promise<{ value: number; date: string; time: string | null; source: string; sourceId: number } | null> {
    // Normalize to full "YYYY-MM-DDTHH:mm" so lexicographic comparisons against
    // candidate sortKeys (which always include time) are correct. A date-only
    // input is treated as end-of-day so all that day's readings are included.
    const cutoffDate = beforeDateTime.length >= 10 ? beforeDateTime.slice(0, 10) : beforeDateTime;
    const cutoffTime = beforeDateTime.length > 10 ? beforeDateTime.slice(11, 16) : "23:59";
    const cutoff = `${cutoffDate}T${cutoffTime}`;

    const candidates: { value: number; date: string; time: string | null; source: string; sourceId: number; sortKey: string }[] = [];

    if (tank === 1) {
      const sessions = await db.select().from(bitumenHeatingSessions)
        .where(and(eq(bitumenHeatingSessions.plantName, plantName), lte(bitumenHeatingSessions.date, cutoffDate)));
      for (const s of sessions) {
        if (s.ldoTank1ClosingMeter == null) continue;
        const t = s.endTime || "23:59";
        const sk = `${s.date}T${t}`;
        if (sk > cutoff) continue;
        candidates.push({ value: s.ldoTank1ClosingMeter, date: s.date, time: s.endTime, source: `Heating Session #${s.id}`, sourceId: s.id, sortKey: sk });
      }
    }

    const shifts = await db.select().from(plantShiftLogs)
      .where(and(eq(plantShiftLogs.plantName, plantName), lte(plantShiftLogs.date, cutoffDate)));
    for (const sh of shifts) {
      const closeVal = tank === 1 ? sh.ldoTank1ClosingMeter : sh.ldoTank2ClosingMeter;
      if (closeVal == null) continue;
      const t = sh.plantStopTime || "23:59";
      const sk = `${sh.date}T${t}`;
      if (sk > cutoff) continue;
      candidates.push({ value: closeVal, date: sh.date, time: sh.plantStopTime, source: `Plant Shift Log ${sh.date} (closing)`, sourceId: sh.id, sortKey: sk });
    }

    // For Tank-1 specifically, include same-day morning shift-log OPENING as a
    // candidate. Carry-forward precedence (per task spec): latest prior session
    // closing same-day → same-day shift-log opening → fall back to older-day
    // closings only if no same-day source exists.
    if (tank === 1) {
      for (const sh of shifts) {
        if (sh.date !== cutoffDate) continue;
        if (sh.ldoTank1OpeningMeter == null) continue;
        const sk = `${sh.date}T${sh.plantStartTime || "00:00"}`;
        if (sk > cutoff) continue;
        candidates.push({
          value: sh.ldoTank1OpeningMeter,
          date: sh.date,
          time: sh.plantStartTime,
          source: `Plant Shift Log ${sh.date} (opening)`,
          sourceId: sh.id,
          sortKey: sk,
        });
      }
    }

    if (!candidates.length) return null;

    // Strict precedence (Tank-1 carry-forward spec):
    //   1. Same-day prior heating-session closing (most recent)
    //   2. Same-day shift-log Tank-1 opening (most recent <= cutoff)
    //   3. Same-day shift-log Tank-1 closing (most recent <= cutoff)
    //   4. Older-day closings (most recent)
    // Within each tier, latest sortKey wins.
    const tierOf = (c: { source: string; date: string }): number => {
      if (c.date === cutoffDate && c.source.startsWith("Heating Session")) return 1;
      if (c.date === cutoffDate && c.source.includes("(opening)")) return 2;
      if (c.date === cutoffDate) return 3;
      return 4;
    };
    candidates.sort((a, b) => {
      const ta = tierOf(a), tb = tierOf(b);
      if (ta !== tb) return ta - tb;
      return b.sortKey.localeCompare(a.sortKey);
    });
    const top = candidates[0];
    return { value: top.value, date: top.date, time: top.time, source: top.source, sourceId: top.sourceId };
  }

  // Task #254 — find the most recent date strictly before `beforeDate` on
  // which this plant produced anything (sum of dispatched MT > 0). Used to
  // attribute pre-heat / overnight heating sessions to the next production
  // day. Returns null if there's no prior production for this plant.
  async getLastProductionDateBefore(plantName: string, beforeDate: string): Promise<string | null> {
    const rows = await db
      .select({ date: truckDispatches.date, mt: sql<number>`COALESCE(SUM(${truckDispatches.loadWeight}), 0)` })
      .from(truckDispatches)
      .where(and(eq(truckDispatches.plantName, plantName), lt(truckDispatches.date, beforeDate)))
      .groupBy(truckDispatches.date)
      .orderBy(desc(truckDispatches.date));
    for (const r of rows) {
      if ((r.mt || 0) > 0) return r.date as unknown as string;
    }
    return null;
  }

  // Task #254 — return the heating sessions whose run-date is attributed to
  // the production day `productionDate` for `plantName`. Attribution window is
  // (lastProductionDateBefore(productionDate), productionDate]. When there is
  // no prior production day for this plant, all sessions on or before
  // productionDate are returned (first-ever production).
  async getHeatingSessionsForProductionDay(plantName: string, productionDate: string) {
    const lastProd = await this.getLastProductionDateBefore(plantName, productionDate);
    const conditions = [
      eq(bitumenHeatingSessions.plantName, plantName),
      lte(bitumenHeatingSessions.date, productionDate),
    ];
    if (lastProd) conditions.push(gt(bitumenHeatingSessions.date, lastProd));
    return db.select().from(bitumenHeatingSessions)
      .where(and(...conditions))
      .orderBy(bitumenHeatingSessions.date, bitumenHeatingSessions.startTime);
  }

  private async _getBoilerHeatingSummary(
    date: string,
    plantName: string,
    shift: PlantShiftLogWithDetails | undefined,
    totalProductionMT: number,
    ldoConsumedT1Shift: number | null,
    ldoFlows?: LdoFlowReading[],
  ) {
    // Task #254 — Attribute sessions to the production day. On a production
    // day (totalProductionMT > 0) we roll up every session since the prior
    // production day so overnight / pre-heat LDO is counted in that day's
    // L/MT. On a no-production day we keep the legacy strict-by-date view so
    // the shift log still shows just that day's sessions.
    const isProductionDay = totalProductionMT > 0;
    const sessions = isProductionDay
      ? await this.getHeatingSessionsForProductionDay(plantName, date)
      : await this.getBitumenHeatingSessions({ date, plantName });
    const lastProductionDate = isProductionDay
      ? await this.getLastProductionDateBefore(plantName, date)
      : null;

    // Task #254 — boiler-during-production delta from the shift log (only when
    // operator toggled "Boiler runs during production" on). This is added on
    // top of the session-rolled LDO. Both inputs must be present and closing
    // must be > opening for a valid delta; otherwise we contribute zero.
    const boilerRunsDuringProduction = !!shift?.boilerRunsDuringProduction;
    const op = shift?.ldoTank1OpeningMeter ?? null;
    const cl = shift?.ldoTank1ClosingMeter ?? null;
    const boilerDuringProductionL = (boilerRunsDuringProduction && op != null && cl != null && cl > op)
      ? Math.round((cl - op) * 10) / 10
      : 0;

    const sessionCount = sessions.length;
    const totalHours = sessions.reduce((s, x) => s + (x.durationHours || 0), 0);
    const sessionsLdoT1L = sessions.reduce((s, x) => s + (x.ldoTank1Consumed || 0), 0);
    const dgDieselL = sessions.reduce((s, x) => s + (x.dgDieselConsumed || 0), 0);
    const totalBoilerLdoL = sessionsLdoT1L + boilerDuringProductionL;

    // Reconciliation mismatch compares the shift-log Tank-1 reading against
    // the LDO that's attributed to *this date's sessions only* (legacy
    // semantics) so the existing alert keeps the same meaning.
    const todaySessionsLdoT1L = sessions
      .filter(s => s.date === date)
      .reduce((s, x) => s + (x.ldoTank1Consumed || 0), 0);
    const mismatchL = (sessionCount > 0 && ldoConsumedT1Shift != null)
      ? Math.round((todaySessionsLdoT1L - ldoConsumedT1Shift) * 10) / 10
      : null;

    // Task #219 — three-way Boiler Meter reconciliation. In addition to the
    // legacy "sessions vs shift" check we also verify that the LDO Flow Meter
    // ledger (rows tagged sourceHeatingSessionId / sourceShiftLogId) still
    // agrees with both upstream sources. A mismatch here means the operator
    // edited the shift log or added a session after the ledger was synced
    // (or vice versa).
    const flowsForRecon = (ldoFlows ?? []).filter(r => r.tankNumber === 1);
    const ledgerSessionsT1L = computeLdoLedgerConsumedL(flowsForRecon, "session");
    const ledgerShiftT1L = computeLdoLedgerConsumedL(flowsForRecon, "shift");
    const reconciliation = buildBoilerMeterReconciliation({
      sessionsLdoT1L: sessionCount > 0 ? Math.round(todaySessionsLdoT1L * 10) / 10 : null,
      shiftLogT1L: ldoConsumedT1Shift,
      ledgerSessionsT1L,
      ledgerShiftT1L,
    });

    if (sessionCount === 0 && boilerDuringProductionL === 0) {
      return {
        sessionCount: 0,
        totalHours: 0,
        sessionsLdoT1L: 0,
        boilerDuringProductionL: 0,
        totalBoilerLdoL: 0,
        boilerRunsDuringProduction,
        lPerHour: null,
        lPerMT: null,
        dgDieselL: 0,
        shiftLogT1L: ldoConsumedT1Shift,
        mismatchL: null,
        sessionsLdoT1LToday: null,
        ledgerSessionsT1L,
        ledgerShiftT1L,
        reconciliation,
        primarySource: "shift_meter" as const,
        attributionFromDate: lastProductionDate,
        attributionToDate: date,
        sessions: [],
      };
    }

    // L/Hour uses session hours only (the shift-log boiler delta has no
    // dedicated hours input). L/MT divides the combined boiler litres by
    // production MT and is null on a no-production day.
    const lPerHour = totalHours > 0 ? Math.round((totalBoilerLdoL / totalHours) * 100) / 100 : null;
    const lPerMT = totalProductionMT > 0 && totalBoilerLdoL > 0
      ? Math.round((totalBoilerLdoL / totalProductionMT) * 1000) / 1000
      : null;
    return {
      sessionCount,
      totalHours: Math.round(totalHours * 100) / 100,
      sessionsLdoT1L: Math.round(sessionsLdoT1L * 10) / 10,
      boilerDuringProductionL,
      totalBoilerLdoL: Math.round(totalBoilerLdoL * 10) / 10,
      boilerRunsDuringProduction,
      lPerHour,
      lPerMT,
      dgDieselL: Math.round(dgDieselL * 10) / 10,
      shiftLogT1L: ldoConsumedT1Shift,
      mismatchL,
      sessionsLdoT1LToday: sessionCount > 0 ? Math.round(todaySessionsLdoT1L * 10) / 10 : null,
      ledgerSessionsT1L,
      ledgerShiftT1L,
      reconciliation,
      primarySource: sessionCount > 0 ? ("sessions" as const) : ("shift_meter" as const),
      attributionFromDate: lastProductionDate,
      attributionToDate: date,
      sessions: sessions.map(s => ({
        id: s.id,
        date: s.date,
        sessionType: s.sessionType,
        startTime: s.startTime,
        endTime: s.endTime,
        durationHours: s.durationHours,
        ldoTank1Consumed: s.ldoTank1Consumed,
        dgDieselConsumed: s.dgDieselConsumed,
        staffName: s.staffName,
        isFinalized: s.isFinalized,
      })),
    };
  }

  // Task #219 — Per-(date, plant) Boiler Meter reconciliation across the
  // three sources operators can edit independently:
  //   • heating sessions  (bitumen_heating_sessions.ldoTank1Consumed)
  //   • shift log meter   (plant_shift_logs.ldoTank1{Opening,Closing}Meter)
  //   • LDO flow ledger   (ldo_flow_readings tagged with the originating row)
  // Returns one row per (date, plantName) for any day where at least one
  // source has Tank-1 data, so the heating-sessions list and other UIs can
  // surface a warning when sources diverge beyond the inline 5L threshold.
  async getBoilerMeterReconciliation(filters: {
    dateFrom: string;
    dateTo: string;
    plantName?: string;
  }): Promise<Array<{
    date: string;
    plantName: string;
    sessionsLdoT1L: number | null;
    shiftLogT1L: number | null;
    ledgerSessionsT1L: number | null;
    ledgerShiftT1L: number | null;
    reconciliation: BoilerMeterReconciliationDetail;
  }>> {
    const conds: any[] = [
      gte(bitumenHeatingSessions.date, filters.dateFrom),
      lte(bitumenHeatingSessions.date, filters.dateTo),
    ];
    if (filters.plantName) conds.push(eq(bitumenHeatingSessions.plantName, filters.plantName));
    const sessionRows = await db.select().from(bitumenHeatingSessions).where(and(...conds));

    const shiftConds: any[] = [
      gte(plantShiftLogs.date, filters.dateFrom),
      lte(plantShiftLogs.date, filters.dateTo),
    ];
    if (filters.plantName) shiftConds.push(eq(plantShiftLogs.plantName, filters.plantName));
    const shiftRows = await db.select().from(plantShiftLogs).where(and(...shiftConds));

    const flowConds: any[] = [
      gte(ldoFlowReadings.date, filters.dateFrom),
      lte(ldoFlowReadings.date, filters.dateTo),
      eq(ldoFlowReadings.tankNumber, 1),
    ];
    if (filters.plantName) flowConds.push(eq(ldoFlowReadings.plantName, filters.plantName));
    const flowRows = await db.select().from(ldoFlowReadings).where(and(...flowConds));

    type Bucket = {
      sessionsL: number;
      sessionsCount: number;
      shiftL: number | null;
      flows: LdoFlowReading[];
    };
    const buckets = new Map<string, Bucket>();
    const keyOf = (date: string, plant: string) => `${date}||${plant}`;
    const ensure = (date: string, plant: string): Bucket => {
      const k = keyOf(date, plant);
      let b = buckets.get(k);
      if (!b) {
        b = { sessionsL: 0, sessionsCount: 0, shiftL: null, flows: [] };
        buckets.set(k, b);
      }
      return b;
    };
    for (const s of sessionRows) {
      const b = ensure(s.date, s.plantName);
      if (s.ldoTank1Consumed != null) b.sessionsL += s.ldoTank1Consumed;
      b.sessionsCount += 1;
    }
    for (const sh of shiftRows) {
      const b = ensure(sh.date, sh.plantName);
      if (sh.ldoTank1OpeningMeter != null && sh.ldoTank1ClosingMeter != null) {
        const consumed = Math.max(0, sh.ldoTank1ClosingMeter - sh.ldoTank1OpeningMeter);
        b.shiftL = (b.shiftL ?? 0) + consumed;
      }
    }
    for (const f of flowRows) {
      const b = ensure(f.date, f.plantName);
      b.flows.push(f);
    }

    const out: Array<{
      date: string;
      plantName: string;
      sessionsLdoT1L: number | null;
      shiftLogT1L: number | null;
      ledgerSessionsT1L: number | null;
      ledgerShiftT1L: number | null;
      reconciliation: BoilerMeterReconciliationDetail;
    }> = [];
    for (const [k, b] of buckets.entries()) {
      const [date, plant] = k.split("||");
      const sessionsLdoT1L = b.sessionsCount > 0 ? Math.round(b.sessionsL * 10) / 10 : null;
      const shiftLogT1L = b.shiftL == null ? null : Math.round(b.shiftL * 10) / 10;
      const ledgerSessionsT1L = computeLdoLedgerConsumedL(b.flows, "session");
      const ledgerShiftT1L = computeLdoLedgerConsumedL(b.flows, "shift");
      const reconciliation = buildBoilerMeterReconciliation({
        sessionsLdoT1L,
        shiftLogT1L,
        ledgerSessionsT1L,
        ledgerShiftT1L,
      });
      out.push({
        date,
        plantName: plant,
        sessionsLdoT1L,
        shiftLogT1L,
        ledgerSessionsT1L,
        ledgerShiftT1L,
        reconciliation,
      });
    }
    out.sort((a, b) => b.date.localeCompare(a.date) || a.plantName.localeCompare(b.plantName));
    return out;
  }

  // Task #300 — Cross-reference shift logs and heating sessions in a date
  // range for dryerFedFrom conflicts. Returns one entry per (date, plant) that
  // has at least one record on each side; only entries where the shift log value
  // disagrees with at least one heating session are flagged hasMismatch=true.
  // Task #333 — Also detects intra-day conflicts where heating sessions on the
  // same date disagree with each other. These are returned in intraSessionConflicts
  // and are included in hasMismatch even when no shift log is present.
  async getDryerSourceMismatches(filters: {
    dateFrom: string;
    dateTo: string;
    plantName?: string;
  }): Promise<Array<{
    date: string;
    plantName: string;
    shiftLogId: number | null;
    shiftLogValue: "TANK_1" | "TANK_2" | null;
    conflictingSessions: Array<{ id: number; dryerFedFrom: "TANK_1" | "TANK_2"; sessionType: string; startTime: string | null }>;
    intraSessionConflicts: Array<{ id: number; dryerFedFrom: "TANK_1" | "TANK_2"; sessionType: string; startTime: string | null }>;
    hasIntraSessionConflict: boolean;
    hasMismatch: boolean;
  }>> {
    const shiftConds: any[] = [
      gte(plantShiftLogs.date, filters.dateFrom),
      lte(plantShiftLogs.date, filters.dateTo),
    ];
    if (filters.plantName) shiftConds.push(eq(plantShiftLogs.plantName, filters.plantName));
    const shiftRows = await db.select({
      id: plantShiftLogs.id,
      date: plantShiftLogs.date,
      plantName: plantShiftLogs.plantName,
      dryerFedFrom: plantShiftLogs.dryerFedFrom,
    }).from(plantShiftLogs).where(and(...shiftConds));

    const sessConds: any[] = [
      gte(bitumenHeatingSessions.date, filters.dateFrom),
      lte(bitumenHeatingSessions.date, filters.dateTo),
    ];
    if (filters.plantName) sessConds.push(eq(bitumenHeatingSessions.plantName, filters.plantName));
    const sessRows = await db.select({
      id: bitumenHeatingSessions.id,
      date: bitumenHeatingSessions.date,
      plantName: bitumenHeatingSessions.plantName,
      dryerFedFrom: bitumenHeatingSessions.dryerFedFrom,
      sessionType: bitumenHeatingSessions.sessionType,
      startTime: bitumenHeatingSessions.startTime,
    }).from(bitumenHeatingSessions).where(and(...sessConds));

    // Build per-(date, plant) buckets
    type Bucket = {
      shiftLogId: number | null;
      shiftLogValue: "TANK_1" | "TANK_2" | null;
      sessions: Array<{ id: number; dryerFedFrom: "TANK_1" | "TANK_2"; sessionType: string; startTime: string | null }>;
    };
    const buckets = new Map<string, Bucket>();
    const keyOf = (date: string, plant: string) => `${date}||${plant}`;
    const ensure = (date: string, plant: string): Bucket => {
      const k = keyOf(date, plant);
      let b = buckets.get(k);
      if (!b) {
        b = { shiftLogId: null, shiftLogValue: null, sessions: [] };
        buckets.set(k, b);
      }
      return b;
    };

    for (const sh of shiftRows) {
      const b = ensure(sh.date, sh.plantName);
      b.shiftLogId = sh.id;
      // Keep null/unknown values as null — defaulting to TANK_2 would generate
      // spurious mismatches for records that pre-date the dryerFedFrom field.
      b.shiftLogValue = (sh.dryerFedFrom === "TANK_1" || sh.dryerFedFrom === "TANK_2") ? sh.dryerFedFrom : null;
    }
    for (const s of sessRows) {
      const b = ensure(s.date, s.plantName);
      // Skip sessions with no explicit dryer-source — they were created before
      // the operator had a UI to set the value and can't be meaningfully compared.
      if (s.dryerFedFrom !== "TANK_1" && s.dryerFedFrom !== "TANK_2") continue;
      b.sessions.push({ id: s.id, dryerFedFrom: s.dryerFedFrom, sessionType: s.sessionType, startTime: s.startTime });
    }

    const out: Array<{
      date: string;
      plantName: string;
      shiftLogId: number | null;
      shiftLogValue: "TANK_1" | "TANK_2" | null;
      conflictingSessions: Array<{ id: number; dryerFedFrom: "TANK_1" | "TANK_2"; sessionType: string; startTime: string | null }>;
      intraSessionConflicts: Array<{ id: number; dryerFedFrom: "TANK_1" | "TANK_2"; sessionType: string; startTime: string | null }>;
      hasIntraSessionConflict: boolean;
      hasMismatch: boolean;
    }> = [];

    for (const [k, b] of buckets.entries()) {
      const [date, plant] = k.split("||");

      // Shift-log vs sessions: only flag when we have a shift log with a known
      // value and at least one session. Skip null shift-log values — they
      // pre-date the field and can't be meaningfully compared.
      let conflicting: typeof b.sessions = [];
      const hasShiftLog = b.shiftLogId != null && b.shiftLogValue != null;
      if (hasShiftLog && b.sessions.length > 0) {
        conflicting = b.sessions.filter(s => s.dryerFedFrom !== b.shiftLogValue);
      }

      // Task #333 — Intra-session conflict: two or more sessions on the same
      // date disagree with each other. When any disagreement is detected ALL
      // sessions are included in intraSessionConflicts — we cannot determine
      // which side is "correct" from the data alone, so every session involved
      // in the day-level disagreement is flagged for the operator to review.
      let intraConflicts: typeof b.sessions = [];
      if (b.sessions.length > 1) {
        const t1Count = b.sessions.filter(s => s.dryerFedFrom === "TANK_1").length;
        const t2Count = b.sessions.length - t1Count;
        if (t1Count > 0 && t2Count > 0) {
          // Both values are present — every session participates in the conflict.
          intraConflicts = b.sessions.slice();
        }
      }

      // Skip buckets with no sessions and no shift log (nothing to report).
      if (b.sessions.length === 0 && !hasShiftLog) continue;
      // Skip session-only buckets where sessions all agree (nothing to report).
      if (!hasShiftLog && intraConflicts.length === 0) continue;

      out.push({
        date,
        plantName: plant,
        shiftLogId: b.shiftLogId,
        shiftLogValue: b.shiftLogValue,
        conflictingSessions: conflicting,
        intraSessionConflicts: intraConflicts,
        hasIntraSessionConflict: intraConflicts.length > 0,
        hasMismatch: conflicting.length > 0 || intraConflicts.length > 0,
      });
    }

    out.sort((a, b) => b.date.localeCompare(a.date) || a.plantName.localeCompare(b.plantName));
    return out;
  }

  // Task #332 — Bulk-align dryerFedFrom on a set of heating sessions in one
  // operation. Returns the number of rows actually updated.
  async alignDryerSourceForSessions(sessionIds: number[], targetValue: "TANK_1" | "TANK_2"): Promise<number> {
    if (sessionIds.length === 0) return 0;
    const result = await db
      .update(bitumenHeatingSessions)
      .set({ dryerFedFrom: targetValue })
      .where(inArray(bitumenHeatingSessions.id, sessionIds))
      .returning({ id: bitumenHeatingSessions.id });
    return result.length;
  }

  // Task #334 — Inline dryer-source fix. Updates just the dryerFedFrom field on
  // a single shift log so the mismatch toast can correct it without navigation.
  async patchShiftLogDryerSource(id: number, dryerFedFrom: "TANK_1" | "TANK_2"): Promise<boolean> {
    const result = await db
      .update(plantShiftLogs)
      .set({ dryerFedFrom })
      .where(eq(plantShiftLogs.id, id))
      .returning({ id: plantShiftLogs.id });
    return result.length > 0;
  }

  // Task #409 — Backfill historical dispatch ledger notes from old patterns like
  // "Aggregate dispatch (Party)", "Bitumen dispatch", "LDO dispatch" to the new
  // "MixName — DeliveryLocation" format introduced in Task #406.
  // Idempotent: rows that already carry the new format are left untouched because
  // they won't match the old LIKE patterns.
  async backfillDispatchNotes(): Promise<{ updated: number; skipped: number; errors: number }> {
    const oldStyleRows = await db
      .select({
        id: stockLedger.id,
        referenceId: stockLedger.referenceId,
        notes: stockLedger.notes,
      })
      .from(stockLedger)
      .where(
        and(
          eq(stockLedger.transactionType, 'dispatch'),
          isNotNull(stockLedger.referenceId),
          or(
            sql`${stockLedger.notes} LIKE 'Aggregate dispatch%'`,
            sql`${stockLedger.notes} LIKE 'Bitumen dispatch%'`,
            sql`${stockLedger.notes} LIKE 'LDO dispatch%'`,
          ),
        ),
      );

    let updated = 0;
    let skipped = 0;
    let errors = 0;

    for (const row of oldStyleRows) {
      try {
        const [dispatch] = await db
          .select({
            mixTemplateId: truckDispatches.mixTemplateId,
            deliveryLocation: truckDispatches.deliveryLocation,
          })
          .from(truckDispatches)
          .where(eq(truckDispatches.id, row.referenceId!))
          .limit(1);

        if (!dispatch) {
          skipped++;
          continue;
        }

        const [template] = await db
          .select({ name: mixTemplates.name })
          .from(mixTemplates)
          .where(eq(mixTemplates.id, dispatch.mixTemplateId))
          .limit(1);

        if (!template) {
          skipped++;
          continue;
        }

        const newNotes = [template.name, dispatch.deliveryLocation?.trim() || null]
          .filter(Boolean)
          .join(' — ');

        await db
          .update(stockLedger)
          .set({ notes: newNotes })
          .where(eq(stockLedger.id, row.id));

        updated++;
      } catch (err) {
        console.error(`[backfillDispatchNotes] Error updating ledger row ${row.id}:`, err);
        errors++;
      }
    }

    console.info(`[backfillDispatchNotes] done — updated: ${updated}, skipped: ${skipped}, errors: ${errors}`);
    return { updated, skipped, errors };
  }

  // One-time idempotent migration: fix the 6MM Down opening stock that was originally
  // entered as 9,450 CFT but should have been stored as 425.25 Ton (9450 × 0.045).
  // Safe to call on every startup — it checks the stale state before acting.
  async migrate6mmDownUomFix(): Promise<{ applied: boolean; message: string }> {
    // Identify the opening stock ledger entry for 6MM Down by checking if it still
    // carries the old CFT values.
    const [ledgerEntry] = await db.select().from(stockLedger)
      .where(and(
        eq(stockLedger.id, 19),
        eq(stockLedger.transactionType, "opening"),
        sql`${stockLedger.uom} = 'CFT'`,
        sql`${stockLedger.quantityIn} >= 9449`,  // ≈ 9450 CFT (the old incorrect value)
      )).limit(1);

    if (!ledgerEntry) {
      return { applied: false, message: "migrate6mmDownUomFix: already applied or entry not found, skipping." };
    }

    // Apply the fix inside a transaction
    await db.transaction(async (tx) => {
      // Fix stock_ledger opening entry
      await tx.update(stockLedger)
        .set({
          quantityIn: 425.25,
          uom: "Ton",
          notes: "Opening stock entry (9450 CFT converted to 425.25 Ton) [data migration fix]",
        })
        .where(eq(stockLedger.id, 19));

      // Fix material_opening_stocks record to reflect the converted unit
      await tx.update(materialOpeningStocks)
        .set({ quantity: 425.25, uom: "Ton" })
        .where(eq(materialOpeningStocks.id, 2));
    });

    // Reconcile stock_balances from the corrected ledger (updates balance totals + uom)
    await this.reconcileStockBalancesFromLedger();

    // Recompute balance_after on every stock_ledger row for 6MM Down so the
    // running-balance column reflects the corrected Ton values throughout.
    const recomputed = await this.recomputeBalanceAfterForMaterial(3);

    return {
      applied: true,
      message: `migrate6mmDownUomFix: corrected 9450 CFT → 425.25 Ton, reconciled stock balances, recomputed ${recomputed.updated} balance_after row(s).`,
    };
  }
}

export const storage = new DatabaseStorage();
