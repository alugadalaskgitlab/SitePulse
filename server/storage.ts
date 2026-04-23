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
import { getVolumeAtDepth, BITUMEN_DENSITY_KG_PER_LITER } from "@shared/bitumen-dip-chart";
import {
  PLANT_ALERT_THRESHOLDS_KEY,
  PLANT_ALERT_THRESHOLD_DEFAULTS,
  plantAlertThresholdsSchema,
  type PlantAlertThresholds,
} from "@shared/schema";
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
} from "@shared/schema";
import { eq, desc, and, gte, lte, gt, lt, ne, notInArray, inArray, or, sql, asc, isNull, isNotNull, ilike } from "drizzle-orm";
import { format } from "date-fns";
import { canonicalizeMachineType } from "@shared/canonicalize";

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
  verifyPin(role: "manager" | "admin", pin: string): Promise<boolean>;
  
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
  
  getStockBalances(partyId?: number): Promise<StockBalance[]>;
  updateStockBalance(partyId: number | null, materialId: number, quantity: number, uom: string): Promise<StockBalance>;
  
  // Stock Ledger
  getStockLedger(filters?: { partyId?: number; materialId?: number; dateFrom?: string; dateTo?: string }): Promise<StockLedgerEntry[]>;
  getStockBalanceAsOf(date: string, filters?: { partyId?: number; materialId?: number }): Promise<{ materialId: number; partyId: number | null; uom: string; totalIn: number; totalOut: number }[]>;
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
  
  // Reconcile stock balances from ledger entries (excludes legacy equipment_issue)
  reconcileStockBalancesFromLedger(): Promise<{ updated: number; created: number; errors: number }>;

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

  // Admin: list shift-log workers tagged UNKNOWN CONTRACTOR / OTHER, grouped by name
  listShiftLogManpowerNeedingReview(opts?: { dateFrom?: string; dateTo?: string }): Promise<Array<{
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
  }>>;

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
  }): Promise<{ updated: number }>;

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
  createPushSubscription(data: InsertPushSubscription): Promise<PushSubscription>;
  deletePushSubscriptionByEndpoint(endpoint: string): Promise<void>;
  
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
  upsertPlantShiftLog(input: UpsertPlantShiftLogInput, editedBy?: string, authorizedRole?: "admin" | "manager" | null): Promise<PlantShiftLogWithDetails>;
  finalizePlantShiftLog(id: number, finalizedBy: string): Promise<PlantShiftLog | undefined>;
  deletePlantShiftLog(id: number): Promise<boolean>;
  getDailyPlantSummary(date: string, plantName?: string): Promise<unknown>;
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
    breakdown: Array<{ partyName: string; mixType: string; loads: number; mt: number }>;
  }>>;

  // Bitumen Heating Sessions
  getBitumenHeatingSessions(filters?: { dateFrom?: string; dateTo?: string; date?: string; plantName?: string }): Promise<BitumenHeatingSession[]>;
  getBitumenHeatingSession(id: number): Promise<BitumenHeatingSession | undefined>;
  upsertBitumenHeatingSession(input: UpsertBitumenHeatingSessionInput, editedBy?: string, authorizedRole?: "admin" | "manager" | null): Promise<BitumenHeatingSession>;
  finalizeBitumenHeatingSession(id: number, finalizedBy: string): Promise<BitumenHeatingSession | undefined>;
  deleteBitumenHeatingSession(id: number): Promise<boolean>;
  getHeatingTrends(filters: { dateFrom: string; dateTo: string; plantName?: string }): Promise<HeatingTrendsResult>;
  getLatestLdoMeterReading(tank: number, beforeDateTime: string, plantName?: string): Promise<{ value: number; date: string; time: string | null; source: string; sourceId: number } | null>;

  // Plant alert thresholds (stored in app_settings)
  getPlantAlertThresholds(): Promise<PlantAlertThresholds>;
  setPlantAlertThresholds(thresholds: PlantAlertThresholds): Promise<PlantAlertThresholds>;
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
};
export type HeatingTrendsResult = {
  dateFrom: string;
  dateTo: string;
  plantName: string;
  targetLPerMT: number;
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

  // Default PINs (used as fallback if not set in database)
  private readonly DEFAULT_MANAGER_PIN = "1234";
  private readonly DEFAULT_ADMIN_PIN = "5678";

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

  async verifyPin(role: "manager" | "admin", pin: string): Promise<boolean> {
    if (role === "manager") {
      const managerPin = await this.getSetting("manager_pin");
      return pin === (managerPin || this.DEFAULT_MANAGER_PIN);
    } else {
      const adminPin = await this.getSetting("admin_pin");
      return pin === (adminPin || this.DEFAULT_ADMIN_PIN);
    }
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
      
      // Calculate aggregate consumption from components (percent of total mix)
      const theoreticalAggregates: Record<number, number> = {};
      for (const comp of components) {
        const percent = (comp as any).percent || 0;
        // percent of loadWeight gives consumption in MT
        theoreticalAggregates[comp.materialId] = loadWeight * percent / 100;
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
      
      // Helper to deduct from a specific source and write ledger entry
      const deductFromSource = async (pId: number | null, matId: number, qty: number, uom: string, notes: string) => {
        const condition = pId === null 
          ? and(sql`${stockBalances.partyId} IS NULL`, eq(stockBalances.materialId, matId))
          : and(eq(stockBalances.partyId, pId), eq(stockBalances.materialId, matId));
        const [existing] = await tx.select().from(stockBalances).where(condition).limit(1);
        
        const newBalance = (existing?.balance || 0) - qty;
        
        if (existing) {
          await tx.update(stockBalances)
            .set({ balance: newBalance, lastUpdated: new Date() })
            .where(eq(stockBalances.id, existing.id));
        } else {
          await tx.insert(stockBalances).values({ partyId: pId, materialId: matId, balance: newBalance, uom });
        }
        
        await tx.insert(stockLedger).values({
          date: dispatchData.date,
          partyId: pId,
          materialId: matId,
          transactionType: "dispatch",
          quantityOut: qty,
          balanceAfter: newBalance,
          uom,
          notes,
        });
        
        return newBalance;
      };
      
      // Resolve materials we need
      const [bitumenMaterial] = await tx.select().from(plantMaterials)
        .where(sql`UPPER(${plantMaterials.name}) LIKE '%BITUMEN%'`)
        .limit(1);
      const [ldoMaterial] = await tx.select().from(plantMaterials)
        .where(sql`UPPER(${plantMaterials.name}) = 'LDO'`)
        .limit(1);
      
      // Build the consumption plan: list of {matId, qty, uom, label}
      type Plan = { matId: number; qty: number; uom: string; label: string };
      const plan: Plan[] = [];
      if (bitumenMaterial && theoreticalBitumenQty > 0) {
        plan.push({ matId: bitumenMaterial.id, qty: theoreticalBitumenQty, uom: "Ton", label: "Bitumen dispatch" });
      }
      if (ldoMaterial && theoreticalLdoQty > 0) {
        plan.push({ matId: ldoMaterial.id, qty: theoreticalLdoQty, uom: "Liters", label: "LDO dispatch" });
      }
      for (const [matIdStr, qty] of Object.entries(theoreticalAggregates)) {
        const matId = parseInt(matIdStr);
        if (qty > 0) plan.push({ matId, qty, uom: "Ton", label: "Aggregate dispatch" });
      }
      
      // Helper to read a single party balance
      const getBalance = async (pId: number | null, matId: number) => {
        const condition = pId === null 
          ? and(sql`${stockBalances.partyId} IS NULL`, eq(stockBalances.materialId, matId))
          : and(eq(stockBalances.partyId, pId), eq(stockBalances.materialId, matId));
        const [bal] = await tx.select().from(stockBalances).where(condition).limit(1);
        return bal?.balance || 0;
      };
      
      // PHASE 1: Compute shortages without writing anything
      const shortageDetails: { materialId: number; materialName: string; required: number; available: number; shortfall: number; uom: string }[] = [];
      const matIdsForLookup = Array.from(new Set(plan.map(p => p.matId)));
      const matRows = matIdsForLookup.length
        ? await tx.select().from(plantMaterials).where(inArray(plantMaterials.id, matIdsForLookup))
        : [];
      const matNameById = new Map(matRows.map(m => [m.id, m.name]));
      
      for (const item of plan) {
        const ownerBal = await getBalance(partyId, item.matId);
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
      for (const item of plan) {
        const ownerBal = await getBalance(partyId, item.matId);
        const fromOwner = Math.min(Math.max(ownerBal, 0), item.qty);
        if (fromOwner > 0) {
          await deductFromSource(partyId, item.matId, fromOwner, item.uom, `${item.label} (${ownerPartyName})`);
        }
        const remaining = +(item.qty - fromOwner).toFixed(9);
        if (remaining > 0) {
          // Borrowing branch — only reachable when allowHlcFallback === true.
          if (hlcPartyId && hlcPartyId !== partyId) {
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
              .set({ balance: data.balance, lastUpdated: new Date() })
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
        set: { p256dh: data.p256dh, auth: data.auth, label: data.label },
      })
      .returning();
    return sub;
  }

  async deletePushSubscriptionByEndpoint(endpoint: string): Promise<void> {
    await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint));
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
        
        await tx.insert(stockLedger).values({
          date: format(new Date(), "yyyy-MM-dd"),
          partyId: stockPartyId,
          materialId: issue.materialId,
          transactionType: "adjustment",
          referenceId: id,
          quantityIn: stockQuantity,
          balanceAfter: newBalance,
          uom: stockUom,
          notes: `Deleted issue #${id} reversal`,
        });
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

        await tx.insert(stockLedger).values({
          date: format(new Date(), "yyyy-MM-dd"),
          partyId: stockPartyId,
          materialId: ret.materialId,
          transactionType: "adjustment",
          referenceId: id,
          quantityOut: stockQuantity,
          balanceAfter: newBalance,
          uom: stockUom,
          notes: `Deleted return #${id} reversal`,
        });
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
      
      // Update stock balance
      const condition = stockPartyId === null 
        ? and(sql`${stockBalances.partyId} IS NULL`, eq(stockBalances.materialId, stock.materialId))
        : and(eq(stockBalances.partyId, stockPartyId!), eq(stockBalances.materialId, stock.materialId));
      
      const [existing] = await tx.select().from(stockBalances).where(condition).limit(1);
      const newBalance = (existing?.balance ?? 0) + stock.quantity;
      
      if (existing) {
        await tx.update(stockBalances)
          .set({ balance: newBalance, lastUpdated: new Date() })
          .where(eq(stockBalances.id, existing.id));
      } else {
        await tx.insert(stockBalances).values({
          partyId: stockPartyId,
          materialId: stock.materialId,
          balance: newBalance,
          uom: stock.uom,
        });
      }
      
      // Add ledger entry for opening stock
      await tx.insert(stockLedger).values({
        date: stock.date,
        partyId: stockPartyId,
        materialId: stock.materialId,
        transactionType: "opening",
        referenceId: result.id,
        quantityIn: stock.quantity,
        balanceAfter: newBalance,
        uom: stock.uom,
        notes: stock.notes ?? "Opening stock entry",
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
      
      // Reverse original stock balance
      const originalStockPartyId = original.isPlantCommon ? null : original.partyId;
      const origCondition = originalStockPartyId === null 
        ? and(sql`${stockBalances.partyId} IS NULL`, eq(stockBalances.materialId, original.materialId))
        : and(eq(stockBalances.partyId, originalStockPartyId), eq(stockBalances.materialId, original.materialId));
      
      const [origBal] = await tx.select().from(stockBalances).where(origCondition).limit(1);
      if (origBal) {
        await tx.update(stockBalances)
          .set({ balance: origBal.balance - original.quantity, lastUpdated: new Date() })
          .where(eq(stockBalances.id, origBal.id));
      }
      
      // Update the opening stock record
      const [result] = await tx.update(materialOpeningStocks)
        .set(updates)
        .where(eq(materialOpeningStocks.id, id))
        .returning();
      
      // Apply new stock balance
      const newStockPartyId = (updates.isPlantCommon ?? original.isPlantCommon) ? null : (updates.partyId ?? original.partyId);
      const newMaterialId = updates.materialId ?? original.materialId;
      const newQuantity = updates.quantity ?? original.quantity;
      const newUom = updates.uom ?? original.uom;
      
      const newCondition = newStockPartyId === null 
        ? and(sql`${stockBalances.partyId} IS NULL`, eq(stockBalances.materialId, newMaterialId))
        : and(eq(stockBalances.partyId, newStockPartyId), eq(stockBalances.materialId, newMaterialId));
      
      const [newBal] = await tx.select().from(stockBalances).where(newCondition).limit(1);
      const newBalance = (newBal?.balance ?? 0) + newQuantity;
      
      if (newBal) {
        await tx.update(stockBalances)
          .set({ balance: newBalance, lastUpdated: new Date() })
          .where(eq(stockBalances.id, newBal.id));
      } else {
        await tx.insert(stockBalances).values({
          partyId: newStockPartyId,
          materialId: newMaterialId,
          balance: newBalance,
          uom: newUom,
        });
      }
      
      // Delete old ledger entry and create new one
      await tx.delete(stockLedger).where(
        and(eq(stockLedger.transactionType, "opening"), eq(stockLedger.referenceId, id))
      );
      
      const newDate = updates.date ?? original.date;
      const newNotes = updates.notes ?? original.notes;
      
      await tx.insert(stockLedger).values({
        date: newDate,
        partyId: newStockPartyId,
        materialId: newMaterialId,
        transactionType: "opening",
        referenceId: result.id,
        quantityIn: newQuantity,
        balanceAfter: newBalance,
        uom: newUom,
        notes: newNotes ?? "Opening stock entry",
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
      
      // Reverse stock balance
      const stockPartyId = stock.isPlantCommon ? null : stock.partyId;
      const condition = stockPartyId === null 
        ? and(sql`${stockBalances.partyId} IS NULL`, eq(stockBalances.materialId, stock.materialId))
        : and(eq(stockBalances.partyId, stockPartyId), eq(stockBalances.materialId, stock.materialId));
      
      const [existing] = await tx.select().from(stockBalances).where(condition).limit(1);
      if (existing) {
        const newBalance = existing.balance - stock.quantity;
        await tx.update(stockBalances)
          .set({ balance: newBalance, lastUpdated: new Date() })
          .where(eq(stockBalances.id, existing.id));
        
        // Add reversal ledger entry
        await tx.insert(stockLedger).values({
          date: format(new Date(), "yyyy-MM-dd"),
          partyId: stockPartyId,
          materialId: stock.materialId,
          transactionType: "adjustment",
          referenceId: id,
          quantityOut: stock.quantity,
          balanceAfter: newBalance,
          uom: stock.uom,
          notes: `Deleted opening stock #${id} reversal`,
        });
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

  async getBitumenDipReadings(filters?: { tankNumber?: number; dateFrom?: string; dateTo?: string; readingType?: string }): Promise<BitumenDipReading[]> {
    let conditions = [];
    if (filters?.tankNumber !== undefined) conditions.push(eq(bitumenDipReadings.tankNumber, filters.tankNumber));
    if (filters?.readingType) conditions.push(eq(bitumenDipReadings.readingType, filters.readingType));
    if (filters?.dateFrom) conditions.push(gte(bitumenDipReadings.date, filters.dateFrom));
    if (filters?.dateTo) conditions.push(lte(bitumenDipReadings.date, filters.dateTo));

    return db.select().from(bitumenDipReadings)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(bitumenDipReadings.date), desc(bitumenDipReadings.time));
  }

  async createBitumenDipReading(reading: InsertBitumenDipReading): Promise<BitumenDipReading> {
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

  async getLdoFlowReadings(filters?: { tankNumber?: number; dateFrom?: string; dateTo?: string; readingType?: string }): Promise<LdoFlowReading[]> {
    let conditions = [];
    if (filters?.tankNumber) conditions.push(eq(ldoFlowReadings.tankNumber, filters.tankNumber));
    if (filters?.readingType) conditions.push(eq(ldoFlowReadings.readingType, filters.readingType));
    if (filters?.dateFrom) conditions.push(gte(ldoFlowReadings.date, filters.dateFrom));
    if (filters?.dateTo) conditions.push(lte(ldoFlowReadings.date, filters.dateTo));

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

  // ============================================
  // LDO DIP READINGS
  // ============================================

  async getLdoDipReadings(filters?: { tankNumber?: number; dateFrom?: string; dateTo?: string; readingType?: string }): Promise<LdoDipReading[]> {
    let conditions = [];
    if (filters?.tankNumber !== undefined) conditions.push(eq(ldoDipReadings.tankNumber, filters.tankNumber));
    if (filters?.readingType) conditions.push(eq(ldoDipReadings.readingType, filters.readingType));
    if (filters?.dateFrom) conditions.push(gte(ldoDipReadings.date, filters.dateFrom));
    if (filters?.dateTo) conditions.push(lte(ldoDipReadings.date, filters.dateTo));

    return db.select().from(ldoDipReadings)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(ldoDipReadings.date), desc(ldoDipReadings.time));
  }

  async createLdoDipReading(reading: InsertLdoDipReading): Promise<LdoDipReading> {
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

  async listShiftLogManpowerNeedingReview(opts?: { dateFrom?: string; dateTo?: string }): Promise<Array<{
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
  }>> {
    const conds: any[] = [
      or(
        eq(plantShiftLogManpower.contractorName, "UNKNOWN CONTRACTOR"),
        eq(plantShiftLogManpower.category, "OTHER"),
      )!,
    ];
    if (opts?.dateFrom) conds.push(gte(plantShiftLogs.date, opts.dateFrom));
    if (opts?.dateTo) conds.push(lte(plantShiftLogs.date, opts.dateTo));

    const rows = await db.select({
      id: plantShiftLogManpower.id,
      name: plantShiftLogManpower.name,
      role: plantShiftLogManpower.role,
      contractorName: plantShiftLogManpower.contractorName,
      category: plantShiftLogManpower.category,
      gender: plantShiftLogManpower.gender,
      date: plantShiftLogs.date,
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
      }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }

  async bulkRelabelShiftLogManpowerByName(input: {
    fromNames: string[];
    toName: string;
    contractorName: string;
    category: string;
    gender: string;
  }): Promise<{ updated: number }> {
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

    const allAliases = await db.select().from(vendorAliases);
    const aliasToCanonical = new Map<string, string>();
    for (const a of allAliases) {
      aliasToCanonical.set(a.alias.toUpperCase().trim(), a.canonicalName.toUpperCase().trim());
      aliasToCanonical.set(a.canonicalName.toUpperCase().trim(), a.canonicalName.toUpperCase().trim());
    }
    const upperContractor = contractorRaw.toUpperCase().replace(/\s+/g, " ");
    const canonicalContractor = aliasToCanonical.get(upperContractor) || upperContractor;

    return await db.transaction(async (tx) => {
      const result = await tx.update(plantShiftLogManpower)
        .set({
          name: toNameUpper,
          contractorName: canonicalContractor,
          category,
          gender,
        })
        .where(sql`UPPER(TRIM(${plantShiftLogManpower.name})) IN (${sql.join(fromNamesUpper.map(n => sql`${n}`), sql`, `)})`)
        .returning({ id: plantShiftLogManpower.id });
      return { updated: result.length };
    });
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
  private async _syncShiftLogReadings(tx: typeof db, log: PlantShiftLog): Promise<void> {
    await tx.delete(ldoFlowReadings).where(eq(ldoFlowReadings.sourceShiftLogId, log.id));
    await tx.delete(bitumenDipReadings).where(eq(bitumenDipReadings.sourceShiftLogId, log.id));

    const ldoRows: any[] = [];
    const pushLdo = (tank: number, type: "opening" | "closing", value: number | null | undefined, time: string | null) => {
      if (value === null || value === undefined) return;
      ldoRows.push({
        date: log.date,
        time,
        tankNumber: tank,
        meterReading: value,
        readingType: type,
        notes: `AUTO from Plant Shift Log #${log.id}`,
        sourceShiftLogId: log.id,
      });
    };
    pushLdo(1, "opening", log.ldoTank1OpeningMeter, log.plantStartTime);
    pushLdo(1, "closing", log.ldoTank1ClosingMeter, log.plantStopTime);
    pushLdo(2, "opening", log.ldoTank2OpeningMeter, log.plantStartTime);
    pushLdo(2, "closing", log.ldoTank2ClosingMeter, log.plantStopTime);
    if (ldoRows.length) await tx.insert(ldoFlowReadings).values(ldoRows);

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
        sourceShiftLogId: log.id,
      });
    };
    pushBitumen(1, "opening", log.bitumenTank1OpeningDip, log.plantStartTime);
    pushBitumen(1, "closing", log.bitumenTank1ClosingDip, log.plantStopTime);
    pushBitumen(2, "opening", log.bitumenTank2OpeningDip, log.plantStartTime);
    pushBitumen(2, "closing", log.bitumenTank2ClosingDip, log.plantStopTime);
    if (bitumenRows.length) await tx.insert(bitumenDipReadings).values(bitumenRows);
  }

  async upsertPlantShiftLog(input: UpsertPlantShiftLogInput, editedBy?: string, authorizedRole?: "admin" | "manager" | null): Promise<PlantShiftLogWithDetails> {
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

      await this._syncShiftLogReadings(tx, saved);

      const mp = await tx.select().from(plantShiftLogManpower).where(eq(plantShiftLogManpower.shiftLogId, saved.id));
      const ie = await tx.select().from(plantShiftLogIdle).where(eq(plantShiftLogIdle.shiftLogId, saved.id));
      return { ...saved, manpower: mp, idleEvents: ie };
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
    breakdown: Array<{ partyName: string; mixType: string; loads: number; mt: number }>;
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
      breakdown: Array<{ partyName: string; mixType: string; loads: number; mt: number }>;
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
          breakdown: [],
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
    }).from(plantShiftLogs)
      .where(and(dateRange(plantShiftLogs.date), plantEq(plantShiftLogs.plantName)));
    for (const r of slRows) {
      const row = get(r.date, r.plantName);
      row.hasShiftLog = true;
      if (r.isFinalized) row.shiftLogFinalized = true;
    }

    const hsRows = await db.select({
      date: bitumenHeatingSessions.date,
      plantName: bitumenHeatingSessions.plantName,
      cnt: sql<number>`COUNT(*)::int`,
    }).from(bitumenHeatingSessions)
      .where(and(dateRange(bitumenHeatingSessions.date), plantEq(bitumenHeatingSessions.plantName)))
      .groupBy(bitumenHeatingSessions.date, bitumenHeatingSessions.plantName);
    for (const r of hsRows) {
      const row = get(r.date, r.plantName);
      row.hasHeatingSessions = true;
      row.sessionsCount = Number(r.cnt) || 0;
    }

    // Bitumen dip readings & LDO flow readings have no plant_name column.
    // Attribute them to the requested plant filter, or "Main Plant" by default.
    const defaultPlant = plant ?? "Main Plant";
    const bdRows = await db.select({ date: bitumenDipReadings.date }).from(bitumenDipReadings)
      .where(dateRange(bitumenDipReadings.date))
      .groupBy(bitumenDipReadings.date);
    for (const r of bdRows) get(r.date, defaultPlant).hasBitumenDips = true;

    const ldoRows = await db.select({ date: ldoFlowReadings.date }).from(ldoFlowReadings)
      .where(dateRange(ldoFlowReadings.date))
      .groupBy(ldoFlowReadings.date);
    for (const r of ldoRows) get(r.date, defaultPlant).hasLdoMeter = true;

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
    // Plant-scoped fuel datasets: prefer linkage via the selected shift log
    // (sourceShiftLogId set by idempotent write-through). Falls back to
    // (date, plantName) for ldoDipReadings which doesn't carry a shift link.
    const ldoFlows = headerRow
      ? await db.select().from(ldoFlowReadings).where(and(eq(ldoFlowReadings.date, date), eq(ldoFlowReadings.sourceShiftLogId, headerRow.id)))
      : [];
    const bitumenDips = headerRow
      ? await db.select().from(bitumenDipReadings).where(and(eq(bitumenDipReadings.date, date), eq(bitumenDipReadings.sourceShiftLogId, headerRow.id)))
      : [];
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
    // When closingDiesel is null but the operator recorded a closing-tank dip
    // (dieselBalanceInTank), use the dip as the closing-tank value so DG days
    // with a dip-but-no-issue still show consumed and L/hr.
    const equipmentSummary = equipment.map(e => {
      const opening = e.openingDiesel ?? null;
      // Operator-recorded closing dip is the source of truth for actual
      // consumption — `closingDiesel` is computed from the norm at write time
      // (opening + issued − expected), so it must NOT win over a real dip.
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
      // Operator dip beats the norm-derived `closingDiesel` (which is computed
      // at write time from expected consumption) so DG actuals reflect reality.
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
      };
    });
    const generatorTotalDieselConsumed = generatorSummary.reduce((s, g) => s + (g.consumed || 0), 0);

    const boilerHeating = await this._getBoilerHeatingSummary(date, plantName, shift, totalProductionMT, ldoConsumedT1);

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
    const effectiveLPerHour = (runningHours && runningHours > 0 && effectiveTotalL > 0)
      ? Math.round((effectiveTotalL / runningHours) * 100) / 100 : null;
    const effectiveLPerMT = (totalProductionMT > 0 && effectiveTotalL > 0)
      ? Math.round((effectiveTotalL / totalProductionMT) * 1000) / 1000 : null;
    const effectiveBoilerLPerMT = (totalProductionMT > 0 && (effectiveT1L || 0) > 0)
      ? Math.round(((effectiveT1L as number) / totalProductionMT) * 1000) / 1000 : null;

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
      },
      bitumenDips,
      ldoFlows,
      ldoDips,
      equipment: equipmentEnriched,
      totalDieselIssued,
      generators: { items: generatorSummary, totalDieselConsumedL: generatorTotalDieselConsumed },
      manpower: shift?.manpower || [],
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
    const q = db.select().from(bitumenHeatingSessions);
    const rows = conds.length
      ? await q.where(and(...conds)).orderBy(desc(bitumenHeatingSessions.date), asc(bitumenHeatingSessions.startTime))
      : await q.orderBy(desc(bitumenHeatingSessions.date), asc(bitumenHeatingSessions.startTime));
    return rows;
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
    if (payload.ldoTank1OpeningMeter != null && payload.ldoTank1ClosingMeter != null) {
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
        || payload.dgIssuedDiesel != null;
      if (!hasAnyDgInput) {
        payload.dgMode = "none";
      } else {
        const dgHours = this._computeDurationHours(payload.dgStartTime, payload.dgEndTime);
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
      // Pull totals from the linked generator log so reports attribute DG diesel correctly
      payload.dgHoursRun = linked.hoursRun ?? null;
      payload.dgDieselConsumed = linked.dieselConsumed ?? null;
    } else {
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
          .values({ ...payload, createdBy: editedBy || "operator" })
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
          generatorName: saved.dgGeneratorName || "600 KVA",
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

      return saved;
    }).then(async (saved) => {
      // Fire-and-forget alert hook: never let notifications break a save.
      this._emitHeatingSessionAlerts(saved).catch((err) => {
        console.error("[HeatingAlerts] Failed to emit alerts:", err?.message || err);
      });
      return saved;
    });
  }

  // ============================================================
  // PLANT ALERT THRESHOLDS (admin-configurable)
  // ============================================================
  async getPlantAlertThresholds(): Promise<PlantAlertThresholds> {
    const raw = await this.getSetting(PLANT_ALERT_THRESHOLDS_KEY);
    if (!raw) return { ...PLANT_ALERT_THRESHOLD_DEFAULTS };
    try {
      const parsed = plantAlertThresholdsSchema.parse(JSON.parse(raw));
      return parsed;
    } catch {
      return { ...PLANT_ALERT_THRESHOLD_DEFAULTS };
    }
  }

  async setPlantAlertThresholds(thresholds: PlantAlertThresholds): Promise<PlantAlertThresholds> {
    const validated = plantAlertThresholdsSchema.parse(thresholds);
    await this.setSetting(PLANT_ALERT_THRESHOLDS_KEY, JSON.stringify(validated));
    return validated;
  }

  // Post-save hook: check thresholds against the just-saved heating session
  // and any related shift-meter data, then push + write inbox entries for
  // each violated threshold. Each alert is independent so multiple may fire
  // for a single save.
  private async _emitHeatingSessionAlerts(saved: BitumenHeatingSession): Promise<void> {
    const thresholds = await this.getPlantAlertThresholds();
    const url = `/plant/heating-sessions/${saved.date}`;
    const plantTag = saved.plantName ? ` [${saved.plantName}]` : "";
    const dateTag = saved.date ? ` ${saved.date}` : "";

    type Alert = { type: "warning" | "error"; title: string; message: string };
    const alerts: Alert[] = [];

    // 1. Hot-oil end temperature out of band (low end temp = boiler underperforming)
    if (saved.hotOilTempEnd != null && saved.hotOilTempEnd < thresholds.hotOilEndTempMinC) {
      alerts.push({
        type: "warning",
        title: "Hot-oil end temp below target",
        message: `Session #${saved.id}${plantTag}${dateTag}: end temp ${saved.hotOilTempEnd}°C < ${thresholds.hotOilEndTempMinC}°C target`,
      });
    }

    // 2. LDO L/Hour above limit (boiler burning too much fuel)
    if (saved.ldoTank1Consumed != null && saved.durationHours != null && saved.durationHours > 0) {
      const lPerHour = saved.ldoTank1Consumed / saved.durationHours;
      if (lPerHour > thresholds.ldoLitersPerHourMax) {
        alerts.push({
          type: "warning",
          title: "Boiler LDO L/hour above limit",
          message: `Session #${saved.id}${plantTag}${dateTag}: ${lPerHour.toFixed(1)} L/hr > ${thresholds.ldoLitersPerHourMax} L/hr limit (${saved.ldoTank1Consumed.toFixed(1)} L over ${saved.durationHours.toFixed(2)} hr)`,
        });
      }
    }

    // 3. Sessions vs shift-meter Tank-1 mismatch (totals across the day)
    try {
      const sameDaySessions = await this.getBitumenHeatingSessions({
        date: saved.date,
        plantName: saved.plantName,
      });
      const sessionsLdoT1L = sameDaySessions.reduce((s, x) => s + (x.ldoTank1Consumed || 0), 0);
      const shift = await this.getPlantShiftLogByDate(saved.date, undefined, saved.plantName);
      let shiftLdoT1L: number | null = null;
      if (shift?.ldoTank1OpeningMeter != null && shift?.ldoTank1ClosingMeter != null) {
        shiftLdoT1L = Math.max(0, shift.ldoTank1ClosingMeter - shift.ldoTank1OpeningMeter);
      }
      if (shiftLdoT1L != null && sessionsLdoT1L > 0) {
        const diff = sessionsLdoT1L - shiftLdoT1L;
        if (Math.abs(diff) > thresholds.sessionsVsShiftMismatchL) {
          alerts.push({
            type: "error",
            title: "Boiler LDO mismatch vs shift meter",
            message: `${saved.date}${plantTag}: heating sessions ${sessionsLdoT1L.toFixed(1)} L vs shift Tank-1 ${shiftLdoT1L.toFixed(1)} L (Δ ${diff >= 0 ? "+" : ""}${diff.toFixed(1)} L > ±${thresholds.sessionsVsShiftMismatchL} L)`,
          });
        }
      }
    } catch (err: any) {
      console.error("[HeatingAlerts] Mismatch check failed:", err?.message || err);
    }

    for (const a of alerts) {
      try {
        await this.createNotification({ type: a.type, title: a.title, message: a.message });
      } catch (err: any) {
        console.error("[HeatingAlerts] createNotification failed:", err?.message || err);
      }
      sendPushToAll(a.title, a.message, url).catch(() => {});
    }
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
      });
    }

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
    for (const r of rows) {
      finalize(r.night, r.productionMT);
      finalize(r.day, r.productionMT);
      finalize(r.total, r.productionMT);
      sumHours += r.total.hours;
      sumLdo += r.total.ldoT1L;
      sumDg += r.total.dgDieselL;
      sumMT += r.productionMT;
      sumSessions += r.total.count;
    }

    return {
      dateFrom,
      dateTo,
      plantName,
      targetLPerMT: TARGET_L_PER_MT,
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

  private async _getBoilerHeatingSummary(
    date: string,
    plantName: string,
    shift: PlantShiftLogWithDetails | undefined,
    totalProductionMT: number,
    ldoConsumedT1Shift: number | null,
  ) {
    const sessions = await this.getBitumenHeatingSessions({ date, plantName });
    const sessionCount = sessions.length;
    if (sessionCount === 0) {
      return {
        sessionCount: 0,
        totalHours: 0,
        sessionsLdoT1L: 0,
        lPerHour: null,
        lPerMT: null,
        dgDieselL: 0,
        shiftLogT1L: ldoConsumedT1Shift,
        mismatchL: null,
        primarySource: "shift_meter" as const,
      };
    }
    const totalHours = sessions.reduce((s, x) => s + (x.durationHours || 0), 0);
    const sessionsLdoT1L = sessions.reduce((s, x) => s + (x.ldoTank1Consumed || 0), 0);
    const dgDieselL = sessions.reduce((s, x) => s + (x.dgDieselConsumed || 0), 0);
    const lPerHour = totalHours > 0 ? Math.round((sessionsLdoT1L / totalHours) * 100) / 100 : null;
    const lPerMT = totalProductionMT > 0 ? Math.round((sessionsLdoT1L / totalProductionMT) * 1000) / 1000 : null;
    const mismatchL = (ldoConsumedT1Shift != null) ? Math.round((sessionsLdoT1L - ldoConsumedT1Shift) * 10) / 10 : null;
    return {
      sessionCount,
      totalHours: Math.round(totalHours * 100) / 100,
      sessionsLdoT1L: Math.round(sessionsLdoT1L * 10) / 10,
      lPerHour,
      lPerMT,
      dgDieselL: Math.round(dgDieselL * 10) / 10,
      shiftLogT1L: ldoConsumedT1Shift,
      mismatchL,
      primarySource: "sessions" as const,
      sessions: sessions.map(s => ({
        id: s.id,
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
}

export const storage = new DatabaseStorage();
