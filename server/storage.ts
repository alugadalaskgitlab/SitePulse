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
  type VendorAlias,
} from "@shared/schema";
import { eq, desc, and, gte, lte, gt, notInArray, inArray, or, sql, asc, isNull, ilike } from "drizzle-orm";
import { format } from "date-fns";

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
  createTruckDispatchWithStockDeduction(dispatch: InsertTruckDispatch): Promise<{ dispatch: TruckDispatch; shortages: { materialId: number; required: number; available: number }[] }>;
  
  // Recalculate all dispatch consumption from mix templates
  recalculateAllDispatchConsumption(): Promise<{ updated: number; errors: number; varianceFixed: number }>;
  
  // Create missing ledger entries for equipment usage diesel and clean up orphaned reversals
  reconcileEquipmentUsageLedger(): Promise<{ created: number; skipped: number; errors: number; cleaned: number }>;
  
  // Reconcile stock balances from ledger entries (excludes legacy equipment_issue)
  reconcileStockBalancesFromLedger(): Promise<{ updated: number; created: number; errors: number }>;

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

  // Daily Diesel Requirements
  getDieselRequirements(filters?: { dateFrom?: string; dateTo?: string; status?: string }): Promise<DieselRequirementWithItems[]>;
  getDieselRequirement(id: number): Promise<DieselRequirementWithItems | undefined>;
  createDieselRequirement(data: CreateDieselRequirementRequest): Promise<DieselRequirementWithItems>;
  approveDieselRequirement(id: number, approvedItems: { itemId: number; approvedQty: number }[], approvedBy: string): Promise<DieselRequirementWithItems | undefined>;
  rejectDieselRequirement(id: number, reason: string, rejectedBy: string): Promise<DieselRequirementWithItems | undefined>;
  updateDieselPurchase(id: number, purchaseData: { qtyPurchased?: number; supplier?: string; billNo?: string; rate?: number; amount?: number; purchasedAt?: string; purchaseRemarks?: string }): Promise<DieselRequirementWithItems | undefined>;
  getDieselComparisonReport(dateFrom: string, dateTo: string): Promise<{ date: string; totalPlanned: number; totalApproved: number; totalPurchased: number; totalActualIssued: number }[]>;

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

  discoverVendors(billType: string, periodFrom: string, periodTo: string): Promise<{
    vendorName: string;
    recordCount: number;
    categories: string[];
    existingBill: { id: number; billNo: string; status: string } | null;
  }[]>;
}

type PlantReportWithDetailsLocal = PlantReportWithDetails;

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
      
      // Calculate hours/km from meter readings or time entry (meter takes priority)
      // For hour_meter: result is hours; for odometer: result is km
      let hoursOrKmRun = 0;
      const isHourMeterEquip = equipment?.meterType === "hour_meter";
      const AVERAGE_SPEED_KMPH = 25; // km/hr typical for heavy vehicles/tankers
      
      if (usage.openingReading !== null && usage.openingReading !== undefined && 
          usage.closingReading !== null && usage.closingReading !== undefined) {
        // Meter readings: gives hours for hour_meter, km for odometer
        hoursOrKmRun = usage.closingReading - usage.openingReading;
      } else if (usage.startTime && usage.endTime) {
        // Calculate hours from time entry
        const [startHour, startMin] = usage.startTime.split(':').map(Number);
        const [endHour, endMin] = usage.endTime.split(':').map(Number);
        const startMins = startHour * 60 + startMin;
        const endMins = endHour * 60 + endMin;
        const diff = endMins - startMins;
        const hoursFromTime = diff > 0 ? diff / 60 : 0;
        
        // For hour_meter: time gives hours directly
        // For odometer: convert hours to estimated km using average speed
        if (isHourMeterEquip) {
          hoursOrKmRun = hoursFromTime;
        } else {
          hoursOrKmRun = hoursFromTime * AVERAGE_SPEED_KMPH; // hours × km/hr = km
        }
      }
      
      // Calculate total km from trip-based entry
      const numberOfTrips = usage.numberOfTrips || 0;
      const tripDistance = usage.tripDistance || 0;
      const tripBasedEntry = usage.tripBasedEntry === true;
      const totalKm = numberOfTrips * tripDistance * 2; // Round trip
      
      // Calculate expected diesel:
      // If tripBasedEntry is true, ALWAYS use trip-based calculation (even if meter/time exists)
      // For trip-based: convert L/hr norm to L/km using average speed
      const norm = equipment?.consumptionNorm || 0;
      const isHourMeter = equipment?.meterType === "hour_meter";
      
      let expectedDiesel = 0;
      if (tripBasedEntry) {
        // Trip-based: ALWAYS use trip calculation when flag is true (zero if no trip data)
        if (totalKm > 0) {
          const normPerKm = isHourMeter ? norm / AVERAGE_SPEED_KMPH : norm;
          expectedDiesel = totalKm * normPerKm;
        }
        // else expectedDiesel stays 0 - trip-based but no trip data
      } else if (hoursOrKmRun > 0) {
        // Meter/time based
        expectedDiesel = hoursOrKmRun * norm;
      }
      
      // Use user-provided opening diesel, or default to 0
      const openingDiesel = usage.openingDiesel ?? 0;
      const dieselIssued = usage.dieselIssued || 0;
      
      // Calculate closing diesel balance = opening + issued - consumed
      const closingDiesel = openingDiesel + dieselIssued - expectedDiesel;
      
      // Variance = Diesel Issued - Consumed (positive = savings, negative = wastage)
      const variance = dieselIssued - expectedDiesel;
      
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
      // Get existing record
      const [existing] = await tx.select().from(equipmentUsage).where(eq(equipmentUsage.id, id)).limit(1);
      if (!existing) return undefined;

      const equipmentId = usage.equipmentId ?? existing.equipmentId;
      const [equipment] = await tx.select().from(equipmentMaster).where(eq(equipmentMaster.id, equipmentId)).limit(1);
      
      const openingReading = usage.openingReading ?? existing.openingReading;
      const closingReading = usage.closingReading ?? existing.closingReading;
      const startTime = usage.startTime ?? (existing as any).startTime;
      const endTime = usage.endTime ?? (existing as any).endTime;
      const newDieselIssued = usage.dieselIssued ?? existing.dieselIssued ?? 0;
      const openingDiesel = usage.openingDiesel ?? existing.openingDiesel ?? 0;
      const oldDieselIssued = existing.dieselIssued || 0;
      
      // Trip-based fields - use persisted value from database if not in update
      const numberOfTrips = usage.numberOfTrips ?? (existing as any).numberOfTrips ?? 0;
      const tripDistance = usage.tripDistance ?? (existing as any).tripDistance ?? 0;
      // Use explicit tripBasedEntry flag - persisted in database
      const tripBasedEntry = usage.tripBasedEntry !== undefined 
        ? usage.tripBasedEntry === true 
        : (existing as any).tripBasedEntry === true;
      const totalKm = numberOfTrips * tripDistance * 2; // Round trip
      
      // Average speed assumption for converting L/hr to L/km (for trip-based calculation)
      const AVERAGE_SPEED_KMPH = 25; // km/hr typical for heavy vehicles/tankers
      const isHourMeterEquip = equipment?.meterType === "hour_meter";
      
      // Calculate hours/km from meter readings or time entry (meter takes priority)
      // For hour_meter: result is hours; for odometer: result is km
      let hoursOrKmRun = 0;
      
      if (openingReading !== null && openingReading !== undefined && 
          closingReading !== null && closingReading !== undefined) {
        // Meter readings: gives hours for hour_meter, km for odometer
        hoursOrKmRun = closingReading - openingReading;
      } else if (startTime && endTime) {
        // Calculate hours from time entry
        const [startHour, startMin] = startTime.split(':').map(Number);
        const [endHour, endMin] = endTime.split(':').map(Number);
        const startMins = startHour * 60 + startMin;
        const endMins = endHour * 60 + endMin;
        const diff = endMins - startMins;
        const hoursFromTime = diff > 0 ? diff / 60 : 0;
        
        // For hour_meter: time gives hours directly
        // For odometer: convert hours to estimated km using average speed
        if (isHourMeterEquip) {
          hoursOrKmRun = hoursFromTime;
        } else {
          hoursOrKmRun = hoursFromTime * AVERAGE_SPEED_KMPH; // hours × km/hr = km
        }
      }
      
      // Calculate expected diesel:
      // If tripBasedEntry is true, ALWAYS use trip-based calculation (even if meter/time exists)
      // For trip-based: convert L/hr norm to L/km using average speed
      const norm = equipment?.consumptionNorm || 0;
      const isHourMeter = equipment?.meterType === "hour_meter";
      
      let expectedDiesel = 0;
      if (tripBasedEntry) {
        // Trip-based: ALWAYS use trip calculation when flag is true (zero if no trip data)
        if (totalKm > 0) {
          const normPerKm = isHourMeter ? norm / AVERAGE_SPEED_KMPH : norm;
          expectedDiesel = totalKm * normPerKm;
        }
        // else expectedDiesel stays 0 - trip-based but no trip data
      } else if (hoursOrKmRun > 0) {
        // Meter/time based
        expectedDiesel = hoursOrKmRun * norm;
      }
      
      // Calculate closing diesel balance = opening + issued - consumed
      const closingDiesel = openingDiesel + newDieselIssued - expectedDiesel;
      
      // Variance = Diesel Issued - Consumed (positive = savings, negative = wastage)
      const variance = newDieselIssued - expectedDiesel;
      
      const [result] = await tx.update(equipmentUsage)
        .set({
          ...usage,
          hoursOrKmRun,
          numberOfTrips: numberOfTrips || null,
          tripDistance: tripDistance || null,
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
    
    if (existing) {
      const [result] = await db.update(stockBalances)
        .set({ 
          balance: existing.balance + quantity,
          lastUpdated: new Date()
        })
        .where(eq(stockBalances.id, existing.id))
        .returning();
      return result;
    } else {
      const [result] = await db.insert(stockBalances).values({
        partyId,
        materialId,
        balance: quantity,
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

  async addStockLedgerEntry(entry: InsertStockLedger): Promise<StockLedgerEntry> {
    const [result] = await db.insert(stockLedger).values(entry).returning();
    return result;
  }

  // Enhanced truck dispatch with automatic stock deduction
  async createTruckDispatchWithStockDeduction(dispatch: InsertTruckDispatch): Promise<{ dispatch: TruckDispatch; shortages: { materialId: number; required: number; available: number }[] }> {
    return db.transaction(async (tx) => {
      // Get mix template with components
      const [template] = await tx.select().from(mixTemplates).where(eq(mixTemplates.id, dispatch.mixTemplateId)).limit(1);
      const components = await tx.select().from(mixTemplateComponents).where(eq(mixTemplateComponents.templateId, dispatch.mixTemplateId));
      
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
      
      // Check stock availability and track shortages
      const shortages: { materialId: number; required: number; available: number }[] = [];
      const partyId = dispatch.partyId;
      
      // Helper to get stock balance
      const getBalance = async (pId: number | null, matId: number) => {
        const condition = pId === null 
          ? and(sql`${stockBalances.partyId} IS NULL`, eq(stockBalances.materialId, matId))
          : and(eq(stockBalances.partyId, pId), eq(stockBalances.materialId, matId));
        const [bal] = await tx.select().from(stockBalances).where(condition).limit(1);
        return bal?.balance || 0;
      };
      
      // Helper to deduct stock from a specific source
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
        
        // Add ledger entry
        await tx.insert(stockLedger).values({
          date: dispatch.date,
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
      
      // Find HLC party for fallback (never create null-party stock)
      const allPartiesList = await tx.select().from(parties).orderBy(parties.id);
      const hlcParty = allPartiesList.find(p => p.name?.toUpperCase() === 'HLC') || allPartiesList[0];
      const hlcPartyId = hlcParty?.id ?? null;

      // Helper to deduct stock with party-first (pooled), HLC fallback
      // Party stock is pooled at plant level - check ALL parties with stock, not just dispatch's party
      const deductStock = async (matId: number, requiredQty: number, uom: string, notes: string) => {
        // Get all party stocks for this material (pooled at plant level)
        const allPartyBalances = await tx.select().from(stockBalances)
          .where(and(
            eq(stockBalances.materialId, matId),
            sql`${stockBalances.partyId} IS NOT NULL`,
            sql`${stockBalances.balance} > 0`
          ))
          .orderBy(desc(stockBalances.balance)); // Deduct from largest stock first
        
        const totalPartyStock = allPartyBalances.reduce((sum, b) => sum + (b.balance || 0), 0);
        const totalAvailable = totalPartyStock;
        
        let shortage = false;
        if (totalAvailable < requiredQty) {
          shortage = true;
        }
        
        let remaining = requiredQty;
        
        // Deduct from party stocks (pooled - try all parties with stock)
        for (const bal of allPartyBalances) {
          if (remaining <= 0) break;
          const deductFromParty = Math.min(bal.balance, remaining);
          await deductFromSource(bal.partyId, matId, deductFromParty, uom, `${notes} (Party)`);
          remaining -= deductFromParty;
        }
        
        // Any remaining goes to HLC (never use null partyId)
        if (remaining > 0 && hlcPartyId) {
          await deductFromSource(hlcPartyId, matId, remaining, uom, `${notes} (HLC)`);
        }
        
        return { shortage, available: totalAvailable };
      };
      
      // Get bitumen material ID (look for material named BITUMEN)
      const [bitumenMaterial] = await tx.select().from(plantMaterials)
        .where(sql`UPPER(${plantMaterials.name}) LIKE '%BITUMEN%'`)
        .limit(1);
      
      // Get LDO material ID
      const [ldoMaterial] = await tx.select().from(plantMaterials)
        .where(sql`UPPER(${plantMaterials.name}) = 'LDO'`)
        .limit(1);
      
      // Check and deduct bitumen (party-first, then plant-common)
      if (bitumenMaterial && theoreticalBitumenQty > 0) {
        const result = await deductStock(bitumenMaterial.id, theoreticalBitumenQty, "Ton", "Bitumen dispatch");
        if (result.shortage) {
          shortages.push({ materialId: bitumenMaterial.id, required: theoreticalBitumenQty, available: result.available });
        }
      }
      
      // Check and deduct LDO (party-first, then plant-common)
      if (ldoMaterial && theoreticalLdoQty > 0) {
        const result = await deductStock(ldoMaterial.id, theoreticalLdoQty, "Liters", "LDO dispatch");
        if (result.shortage) {
          shortages.push({ materialId: ldoMaterial.id, required: theoreticalLdoQty, available: result.available });
        }
      }
      
      // Check and deduct aggregates (party-first, then plant-common)
      for (const [matIdStr, qty] of Object.entries(theoreticalAggregates)) {
        const matId = parseInt(matIdStr);
        if (qty > 0) {
          const result = await deductStock(matId, qty, "Ton", "Aggregate dispatch");
          if (result.shortage) {
            shortages.push({ materialId: matId, required: qty, available: result.available });
          }
        }
      }
      
      // Calculate actual values (use provided or default to theoretical)
      const actualBitumenPercent = dispatch.actualBitumenPercent ?? theoreticalBitumenPercent;
      const actualBitumenQty = dispatch.actualBitumenQty ?? theoreticalBitumenQty;
      const actualLdoQty = dispatch.actualLdoQty ?? theoreticalLdoQty;
      
      // Calculate variance percentages (if actual differs from theoretical)
      const bitumenVariancePercent = theoreticalBitumenQty > 0 
        ? ((actualBitumenQty - theoreticalBitumenQty) / theoreticalBitumenQty) * 100 
        : 0;
      const ldoVariancePercent = theoreticalLdoQty > 0 
        ? ((actualLdoQty - theoreticalLdoQty) / theoreticalLdoQty) * 100 
        : 0;
      
      // Check if user provided actual values different from theoretical
      const hasAdjustment = (dispatch.actualBitumenPercent !== undefined && dispatch.actualBitumenPercent !== null) ||
                           (dispatch.actualBitumenQty !== undefined && dispatch.actualBitumenQty !== null) ||
                           (dispatch.actualLdoQty !== undefined && dispatch.actualLdoQty !== null);
      
      // Create the dispatch record with variance tracking
      const [result] = await tx.insert(truckDispatches).values({
        ...dispatch,
        truckNumber: dispatch.truckNumber.toUpperCase(),
        deliveryLocation: dispatch.deliveryLocation?.toUpperCase(),
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
  async reconcileStockBalancesFromLedger(): Promise<{ updated: number; created: number; errors: number }> {
    let updated = 0;
    let created = 0;
    let errors = 0;

    try {
      // Get all ledger entries excluding legacy equipment_issue
      const ledgerEntries = await db.select().from(stockLedger)
        .where(sql`${stockLedger.transactionType} != 'equipment_issue'`);

      // Calculate balance for each material-party combination
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
    let conditions: any[] = [];
    
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
      submittedAt: dprs.submittedAt,
    })
    .from(sitePurchases)
    .innerJoin(dprs, eq(sitePurchases.dprId, dprs.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(dprs.date));
    
    // Deduplicate: only keep purchases from the latest version of each DPR
    const latestDprByKey = new Map<string, { dprId: number; timestamp: string }>();
    for (const row of results) {
      const baseSite = this.getBaseSiteName(row.site);
      const key = `${baseSite}|${row.date}`;
      const currentTimestamp = row.submittedAt || '';
      const existing = latestDprByKey.get(key);
      if (!existing || currentTimestamp > existing.timestamp) {
        latestDprByKey.set(key, { dprId: row.dprId, timestamp: currentTimestamp });
      }
    }
    
    const latestDprIds = new Set(Array.from(latestDprByKey.values()).map(v => v.dprId));
    
    let filtered = results
      .filter(r => latestDprIds.has(r.dprId))
      .map(({ submittedAt, ...rest }) => ({
        ...rest,
        site: this.getBaseSiteName(rest.site),
      }));
    
    // Apply site filter on base site name
    if (filters?.site) {
      const filterSite = filters.site.toUpperCase().trim();
      filtered = filtered.filter(r => r.site.toUpperCase().trim() === filterSite);
    }
    
    return filtered;
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

    if (existing.status === "paid") {
      throw new Error("Paid bills cannot be deleted");
    }

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
        default: return "HRS";
      }
    };

    const calcQty = (row: { hoursWorked?: number | null; startTime?: string | null; endTime?: string | null; numberOfTrips?: number | null; hoursOrKmRun?: number | null; entryType?: string | null }) => {
      const et = (row.entryType || "").toLowerCase();
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
      if (entryTypeFilter === "daily_hourly") return ["daily", "hourly", "time_meter"].includes(et);
      if (entryTypeFilter === "trip_based") return et === "trip_based";
      if (entryTypeFilter === "monthly") return et === "monthly";
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
            let desc = `${machineName} (SITE) - ${label} | ${hours} HRS`;
            if (dieselVal > 0) desc += ` | DIESEL: ${dieselVal}L`;
            items.push({
              date: typeof row.date === "string" ? row.date : (row.date as Date).toISOString().split("T")[0],
              category: "equipment",
              description: desc,
              qty,
              unit: entryTypeUnit(row.entryType),
              source: "auto",
              equipmentId: row.equipmentId,
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
            let desc = `${machineName} (PLANT) - ${label} | ${hours} HRS`;
            if (dieselVal > 0) desc += ` | DIESEL: ${dieselVal}L`;
            items.push({
              date: typeof row.date === "string" ? row.date : (row.date as Date).toISOString().split("T")[0],
              category: "equipment",
              description: desc,
              qty,
              unit: entryTypeUnit(et),
              source: "auto",
              equipmentId: row.equipmentId,
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
          let desc = `${(row.machine || "EQUIPMENT").toUpperCase()} (SITE-UNLINKED) - ${label} | ${hours} HRS`;
          if (dieselVal > 0) desc += ` | DIESEL: ${dieselVal}L`;
          items.push({
            date: typeof row.date === "string" ? row.date : (row.date as Date).toISOString().split("T")[0],
            category: "equipment",
            description: desc,
            qty,
            unit: entryTypeUnit(row.entryType),
            source: "auto",
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
          items.push({
            date: typeof row.date === "string" ? row.date : (row.date as Date).toISOString().split("T")[0],
            category: "material",
            description: `${(row.material || "MATERIAL").toUpperCase()} (SITE)`,
            qty: row.quantity,
            unit: row.uom || "NOS",
            source: "auto",
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
          });
        }
      }
    }

    if (bt === "transport" || bt === "all") {
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

    items.sort((a, b) => {
      const dateComp = (a.date || "").localeCompare(b.date || "");
      if (dateComp !== 0) return dateComp;
      const catOrder: Record<string, number> = { equipment: 1, material: 2, transport: 3 };
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

    const equipLogs = await db.select()
      .from(equipmentLogs)
      .where(and(
        gte(sql`(SELECT date FROM dprs WHERE dprs.id = ${equipmentLogs.dprId})`, dateFrom),
        lte(sql`(SELECT date FROM dprs WHERE dprs.id = ${equipmentLogs.dprId})`, dateTo),
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
      if (eLog.diesel && eLog.diesel > 0 && eLog.dprId) {
        const [dpr] = await db.select({ date: dprs.date }).from(dprs).where(eq(dprs.id, eLog.dprId)).limit(1);
        if (dpr) {
          const d = dpr.date;
          const existing = dateMap.get(d) || { totalPlanned: 0, totalApproved: 0, totalPurchased: 0, totalActualIssued: 0 };
          existing.totalActualIssued += eLog.diesel || 0;
          dateMap.set(d, existing);
        }
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

    const upsertRows = async (table: any, rows: any[], tableName: string) => {
      if (!rows || !Array.isArray(rows) || rows.length === 0) {
        skipped.push(tableName);
        return;
      }
      try {
        for (const row of rows) {
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

    return { imported, skipped, errors };
  }
}

export const storage = new DatabaseStorage();
