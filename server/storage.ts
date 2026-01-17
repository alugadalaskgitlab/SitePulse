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
  adminNotifications,
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
  type MaterialOpeningStock,
  type InsertMaterialOpeningStock,
  materialOpeningStocks,
  type AdminNotification,
  type InsertAdminNotification,
  DEFAULT_LDO_NORM
} from "@shared/schema";
import { eq, desc, and, gte, lte, notInArray, sql, asc, isNull } from "drizzle-orm";
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
  
  getMixTemplates(): Promise<MixTemplate[]>;
  getAllMixTemplateComponents(): Promise<MixTemplateComponent[]>;
  getMixTemplateWithComponents(id: number): Promise<{ template: MixTemplate; components: MixTemplateComponent[] } | undefined>;
  createMixTemplate(template: InsertMixTemplate, components?: InsertMixTemplateComponent[]): Promise<MixTemplate>;
  updateMixTemplate(id: number, template: Partial<InsertMixTemplate>, components?: InsertMixTemplateComponent[]): Promise<MixTemplate | undefined>;
  deleteMixTemplate(id: number): Promise<boolean>;
  
  getEquipmentMaster(): Promise<EquipmentMasterType[]>;
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
  updateTruckDispatch(id: number, dispatch: Partial<InsertTruckDispatch>): Promise<TruckDispatch | undefined>;
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
  
  // Material Opening Stocks
  getMaterialOpeningStocks(filters?: { materialId?: number; partyId?: number }): Promise<MaterialOpeningStock[]>;
  getMaterialOpeningStock(id: number): Promise<MaterialOpeningStock | undefined>;
  createMaterialOpeningStock(stock: InsertMaterialOpeningStock): Promise<MaterialOpeningStock>;
  updateMaterialOpeningStock(id: number, stock: Partial<InsertMaterialOpeningStock>): Promise<MaterialOpeningStock | undefined>;
  deleteMaterialOpeningStock(id: number): Promise<boolean>;
  
  // Enhanced dispatch with stock deduction
  createTruckDispatchWithStockDeduction(dispatch: InsertTruckDispatch): Promise<{ dispatch: TruckDispatch; shortages: { materialId: number; required: number; available: number }[] }>;
  
  // Recalculate all dispatch consumption from mix templates
  recalculateAllDispatchConsumption(): Promise<{ updated: number; errors: number }>;
  
  // Create missing ledger entries for equipment usage diesel and clean up orphaned reversals
  reconcileEquipmentUsageLedger(): Promise<{ created: number; skipped: number; errors: number; cleaned: number }>;
  
  // Reconcile stock balances from ledger entries (excludes legacy equipment_issue)
  reconcileStockBalancesFromLedger(): Promise<{ updated: number; created: number; errors: number }>;
  
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
}

type PlantReportWithDetailsLocal = PlantReportWithDetails;

export class DatabaseStorage implements IStorage {
  async getDprs(filters?: { site?: string; engineer?: string; dateFrom?: string; dateTo?: string }): Promise<Dpr[]> {
    let conditions = [];
    
    if (filters?.site) conditions.push(eq(dprs.site, filters.site));
    if (filters?.engineer) conditions.push(eq(dprs.engineer, filters.engineer));
    if (filters?.dateFrom) conditions.push(gte(dprs.date, filters.dateFrom));
    if (filters?.dateTo) conditions.push(lte(dprs.date, filters.dateTo));

    const allDprs = await db.select()
      .from(dprs)
      .where(and(...conditions))
      .orderBy(desc(dprs.date));
    
    // Deduplicate by base site name + date, keeping only the latest version
    const latestByKey = new Map<string, Dpr>();
    for (const dpr of allDprs) {
      const baseSite = this.getBaseSiteName(dpr.site);
      const key = `${baseSite}|${dpr.date}`;
      const existing = latestByKey.get(key);
      if (!existing) {
        latestByKey.set(key, dpr);
      } else {
        const existingTime = this.getEffectiveTimestamp(existing);
        const currentTime = this.getEffectiveTimestamp(dpr);
        if (currentTime > existingTime) {
          latestByKey.set(key, dpr);
        }
      }
    }
    
    return Array.from(latestByKey.values()).sort((a, b) => 
      new Date(b.date).getTime() - new Date(a.date).getTime()
    );
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
    // Get all DPRs with their details
    const allDprs = await db.query.dprs.findMany({
      with: {
        progress: true,
        equipment: true,
        labour: true,
        materials: true,
      },
      orderBy: desc(dprs.date),
    });
    
    // Deduplicate by base site name + date, keeping only the latest version
    const latestByKey = new Map<string, DprWithDetails>();
    for (const dpr of allDprs) {
      const baseSite = this.getBaseSiteName(dpr.site);
      const key = `${baseSite}|${dpr.date}`;
      const existing = latestByKey.get(key);
      if (!existing) {
        latestByKey.set(key, dpr);
      } else {
        // Compare timestamps, keep the latest
        const existingTime = this.getEffectiveTimestamp(existing);
        const currentTime = this.getEffectiveTimestamp(dpr);
        if (currentTime > existingTime) {
          latestByKey.set(key, dpr);
        }
      }
    }
    
    // Return deduplicated results sorted by date descending
    return Array.from(latestByKey.values()).sort((a, b) => 
      new Date(b.date).getTime() - new Date(a.date).getTime()
    );
  }

  async getDpr(id: number): Promise<DprWithDetails | undefined> {
    const dpr = await db.query.dprs.findFirst({
      where: eq(dprs.id, id),
      with: {
        progress: true,
        equipment: true,
        labour: true,
        materials: true,
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
        await tx.insert(progressEntries).values(
          dprData.progress.map(p => ({ 
            ...p, 
            dprId,
            activity: p.activity?.toUpperCase() || p.activity,
          }))
        );
      }

      // 3. Insert Equipment Logs with uppercase text fields
      if (dprData.equipment?.length) {
        await tx.insert(equipmentLogs).values(
          dprData.equipment.map(e => ({ 
            ...e, 
            dprId,
            machine: e.machine?.toUpperCase() || e.machine,
            operator: e.operator?.toUpperCase() || e.operator,
            task: e.task?.toUpperCase() || e.task,
          }))
        );
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

      // Delete old entries and insert new ones
      await tx.delete(progressEntries).where(eq(progressEntries.dprId, id));
      await tx.delete(equipmentLogs).where(eq(equipmentLogs.dprId, id));
      await tx.delete(labourLogs).where(eq(labourLogs.dprId, id));
      await tx.delete(materialLogs).where(eq(materialLogs.dprId, id));

      if (dprData.progress?.length) {
        await tx.insert(progressEntries).values(
          dprData.progress.map(p => ({ ...p, dprId: id }))
        );
      }

      if (dprData.equipment?.length) {
        await tx.insert(equipmentLogs).values(
          dprData.equipment.map(e => ({ ...e, dprId: id }))
        );
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

      return updated;
    });
  }

  async cloneDpr(id: number, editedBy: string, clientTimestamp?: string): Promise<Dpr | undefined> {
    const original = await this.getDpr(id);
    if (!original) return undefined;

    // Use client-provided timestamp for accurate local time, fall back to server time
    const dateTime = clientTimestamp || format(new Date(), "yyyy-MM-dd HH:mm:ss");
    const roleName = editedBy === "manager" ? "Manager" : "Admin";
    
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

      // Copy progress entries with uppercase
      if (original.progress?.length) {
        await tx.insert(progressEntries).values(
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
          }))
        );
      }

      // Copy equipment logs with uppercase
      if (original.equipment?.length) {
        await tx.insert(equipmentLogs).values(
          original.equipment.map(e => ({
            dprId,
            machine: e.machine?.toUpperCase() || e.machine,
            operator: e.operator?.toUpperCase() || e.operator,
            startTime: e.startTime,
            endTime: e.endTime,
            diesel: e.diesel,
            task: e.task?.toUpperCase() || e.task,
          }))
        );
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
    const roleName = editedBy === "manager" ? "Manager" : "Admin";
    
    // Strip any existing suffix and get base site name, then add new suffix
    const baseSite = this.getBaseSiteName(dprData.site);
    const newSiteName = `${baseSite.toUpperCase()} – Edited by ${roleName} – ${dateTime}`;

    return await db.transaction(async (tx) => {
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
        await tx.insert(equipmentLogs).values(
          dprData.equipment.map(e => ({ 
            ...e, 
            dprId,
            machine: e.machine?.toUpperCase() || e.machine,
            operator: e.operator?.toUpperCase() || e.operator,
            task: e.task?.toUpperCase() || e.task,
          }))
        );
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

      // Record version history
      await tx.insert(dprVersions).values({
        originalDprId: originalId,
        dprId: newDpr.id,
        editedBy,
      });

      return newDpr;
    });
  }

  async deleteDpr(id: number): Promise<boolean> {
    return await db.transaction(async (tx) => {
      await tx.delete(progressEntries).where(eq(progressEntries.dprId, id));
      await tx.delete(equipmentLogs).where(eq(equipmentLogs.dprId, id));
      await tx.delete(labourLogs).where(eq(labourLogs.dprId, id));
      await tx.delete(materialLogs).where(eq(materialLogs.dprId, id));
      await tx.delete(dprVersions).where(eq(dprVersions.dprId, id));
      const result = await tx.delete(dprs).where(eq(dprs.id, id));
      return true;
    });
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
    const roleName = editedBy === "manager" ? "Manager" : "Admin";

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
  async getEquipmentMaster(): Promise<EquipmentMasterType[]> {
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

  async updateTruckDispatch(id: number, dispatch: Partial<InsertTruckDispatch>): Promise<TruckDispatch | undefined> {
    // Get current dispatch to always recompute theoretical values from latest template data
    const [currentDispatch] = await db.select().from(truckDispatches).where(eq(truckDispatches.id, id)).limit(1);
    if (!currentDispatch) return undefined;

    const uppercased: any = {
      ...dispatch,
      truckNumber: dispatch.truckNumber?.toUpperCase(),
      deliveryLocation: dispatch.deliveryLocation?.toUpperCase(),
    };

    // Always recompute theoretical values from the mix template (use new values if provided, otherwise current)
    const mixTemplateId = dispatch.mixTemplateId ?? currentDispatch.mixTemplateId;
    const loadWeight = dispatch.loadWeight ?? currentDispatch.loadWeight;

    if (mixTemplateId && loadWeight) {
      const [template] = await db.select().from(mixTemplates).where(eq(mixTemplates.id, mixTemplateId)).limit(1);
      if (template) {
        const bitumenPercent = template.bitumenPercent || 0;
        const ldoNorm = template.ldoNorm || 6;
        // Always set these computed values on every update
        uppercased.theoreticalBitumenPercent = bitumenPercent;
        uppercased.theoreticalBitumenQty = (loadWeight * bitumenPercent) / 100;
        uppercased.theoreticalLdoQty = loadWeight * ldoNorm;
      }
    }
    
    const [result] = await db.update(truckDispatches)
      .set(uppercased)
      .where(eq(truckDispatches.id, id))
      .returning();
    return result;
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
      
      // Calculate hours from meter readings or time entry (meter takes priority)
      let hoursOrKmRun = 0;
      
      if (usage.openingReading !== null && usage.openingReading !== undefined && 
          usage.closingReading !== null && usage.closingReading !== undefined) {
        hoursOrKmRun = usage.closingReading - usage.openingReading;
      } else if (usage.startTime && usage.endTime) {
        // Calculate hours from time entry
        const [startHour, startMin] = usage.startTime.split(':').map(Number);
        const [endHour, endMin] = usage.endTime.split(':').map(Number);
        const startMins = startHour * 60 + startMin;
        const endMins = endHour * 60 + endMin;
        const diff = endMins - startMins;
        hoursOrKmRun = diff > 0 ? diff / 60 : 0;
      }
      
      // Calculate total km from trip-based entry
      const numberOfTrips = usage.numberOfTrips || 0;
      const tripDistance = usage.tripDistance || 0;
      const tripBasedEntry = usage.tripBasedEntry === true;
      const totalKm = numberOfTrips * tripDistance * 2; // Round trip
      
      // Average speed assumption for converting L/hr to L/km (for trip-based calculation)
      const AVERAGE_SPEED_KMPH = 25; // km/hr typical for heavy vehicles/tankers
      
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
      
      // AUTO STOCK DEDUCTION: If diesel was issued AND not contractor-provided, create ledger entry and deduct from HLC stock
      const dieselIncluded = usage.dieselIncluded === true;
      if (dieselIssued > 0 && !dieselIncluded) {
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
          
          // Create ledger entry for equipment diesel issue
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
      
      // Calculate hours from meter readings or time entry (meter takes priority)
      let hoursOrKmRun = 0;
      
      if (openingReading !== null && openingReading !== undefined && 
          closingReading !== null && closingReading !== undefined) {
        hoursOrKmRun = closingReading - openingReading;
      } else if (startTime && endTime) {
        // Calculate hours from time entry
        const [startHour, startMin] = startTime.split(':').map(Number);
        const [endHour, endMin] = endTime.split(':').map(Number);
        const startMins = startHour * 60 + startMin;
        const endMins = endHour * 60 + endMin;
        const diff = endMins - startMins;
        hoursOrKmRun = diff > 0 ? diff / 60 : 0;
      }
      
      // Average speed assumption for converting L/hr to L/km (for trip-based calculation)
      const AVERAGE_SPEED_KMPH = 25; // km/hr typical for heavy vehicles/tankers
      
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
      // Skip if diesel is provided by contractor (no stock impact)
      const oldDieselIncluded = (existing as any).dieselIncluded === true;
      const newDieselIncluded = usage.dieselIncluded !== undefined ? usage.dieselIncluded === true : oldDieselIncluded;
      
      // Need to update ledger if dieselIssued changes OR if date/equipment changes
      const dieselDiff = newDieselIssued - oldDieselIssued;
      const dateChanged = usage.date !== undefined && usage.date !== existing.date;
      const equipmentChanged = usage.equipmentId !== undefined && usage.equipmentId !== existing.equipmentId;
      const dieselIncludedChanged = usage.dieselIncluded !== undefined && usage.dieselIncluded !== oldDieselIncluded;
      
      // Skip all stock operations if new state is dieselIncluded
      if (newDieselIncluded) {
        // Always clean up any existing ledger entry when dieselIncluded is true (handles legacy data)
        await tx.delete(stockLedger).where(
          and(eq(stockLedger.transactionType, "equipment_usage"), eq(stockLedger.referenceId, id))
        );
        
        // If changing FROM non-included TO included, need to restore stock
        if (!oldDieselIncluded && oldDieselIssued > 0) {
          const [dieselMaterial] = await tx.select().from(plantMaterials)
            .where(sql`LOWER(${plantMaterials.name}) = 'diesel'`)
            .limit(1);
          const [hlcParty] = await tx.select().from(parties)
            .where(sql`UPPER(TRIM(${parties.name})) = 'HLC'`)
            .limit(1);
          const hlcPartyId = hlcParty?.id || null;
          
          if (dieselMaterial) {
            // Restore stock (create balance if it doesn't exist)
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
            } else {
              // Create balance if it doesn't exist
              await tx.insert(stockBalances).values({
                partyId: hlcPartyId,
                materialId: dieselMaterial.id,
                balance: newBalance,
                uom: dieselMaterial.defaultUom || 'Liters',
              });
            }
          }
        }
        return result;
      }
      
      const needsLedgerUpdate = dieselDiff !== 0 || dieselIncludedChanged || ((dateChanged || equipmentChanged) && (oldDieselIssued > 0 || newDieselIssued > 0));
      
      if (needsLedgerUpdate || dieselDiff !== 0) {
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
          // Update HLC stock if diesel quantity changed
          if (dieselDiff !== 0) {
            const [existingBalance] = await tx.select().from(stockBalances)
              .where(and(
                hlcPartyId ? eq(stockBalances.partyId, hlcPartyId) : sql`${stockBalances.partyId} IS NULL`,
                eq(stockBalances.materialId, dieselMaterial.id)
              ))
              .limit(1);
            
            // dieselDiff > 0 means more diesel issued (deduct more)
            // dieselDiff < 0 means less diesel issued (restore some)
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
          
          // Get current balance for ledger entry
          const [currentBalance] = await tx.select().from(stockBalances)
            .where(and(
              hlcPartyId ? eq(stockBalances.partyId, hlcPartyId) : sql`${stockBalances.partyId} IS NULL`,
              eq(stockBalances.materialId, dieselMaterial.id)
            ))
            .limit(1);
          
          // Delete old ledger entry
          await tx.delete(stockLedger).where(
            and(eq(stockLedger.transactionType, "equipment_usage"), eq(stockLedger.referenceId, id))
          );
          
          // Create new ledger entry if there's diesel issued
          if (newDieselIssued > 0) {
            const usageDate = usage.date ?? existing.date;
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
      
      // Always delete any existing ledger entry (cleanup for any state)
      await tx.delete(stockLedger).where(
        and(eq(stockLedger.transactionType, "equipment_usage"), eq(stockLedger.referenceId, id))
      );
      
      // AUTO STOCK RESTORATION: If diesel was issued AND not contractor-provided, restore to HLC stock
      if (dieselIssued > 0 && !dieselIncluded) {
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
      
      // Helper to deduct stock with party-first (pooled), plant-common fallback
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
        
        const plantCommonStock = await getBalance(null, matId);
        const totalPartyStock = allPartyBalances.reduce((sum, b) => sum + (b.balance || 0), 0);
        const totalAvailable = totalPartyStock + plantCommonStock;
        
        let shortage = false;
        if (totalAvailable < requiredQty) {
          shortage = true;
        }
        
        let remaining = requiredQty;
        
        // First deduct from party stocks (pooled - try all parties with stock)
        for (const bal of allPartyBalances) {
          if (remaining <= 0) break;
          const deductFromParty = Math.min(bal.balance, remaining);
          await deductFromSource(bal.partyId, matId, deductFromParty, uom, `${notes} (Party)`);
          remaining -= deductFromParty;
        }
        
        // Then deduct from plant common if needed
        if (remaining > 0) {
          await deductFromSource(null, matId, remaining, uom, `${notes} (Plant Common)`);
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
      
      // Create the dispatch record with actual = theoretical by default
      const [result] = await tx.insert(truckDispatches).values({
        ...dispatch,
        truckNumber: dispatch.truckNumber.toUpperCase(),
        deliveryLocation: dispatch.deliveryLocation?.toUpperCase(),
        theoreticalBitumenPercent,
        theoreticalBitumenQty,
        theoreticalLdoQty,
        theoreticalAggregates: JSON.stringify(theoreticalAggregates),
        // Set actual = theoretical by default (user can override later)
        actualBitumenPercent: dispatch.actualBitumenPercent ?? theoreticalBitumenPercent,
        actualBitumenQty: dispatch.actualBitumenQty ?? theoreticalBitumenQty,
        actualLdoQty: dispatch.actualLdoQty ?? theoreticalLdoQty,
        stockDeducted: 1,
        shortageWarning: shortages.length ? JSON.stringify(shortages) : null,
      }).returning();
      
      return { dispatch: result, shortages };
    });
  }

  async recalculateAllDispatchConsumption(): Promise<{ updated: number; errors: number }> {
    let updated = 0;
    let errors = 0;
    
    // Get all dispatches
    const allDispatches = await db.select().from(truckDispatches);
    
    // Get all mix templates for lookup
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
        
        // Only update actual values if they are null/undefined/0 (don't overwrite user-entered data)
        const updateData: any = {
          theoreticalBitumenPercent,
          theoreticalBitumenQty,
          theoreticalLdoQty,
        };
        
        // Only backfill actual values if missing (null, undefined, or 0)
        if (!dispatch.actualBitumenPercent) {
          updateData.actualBitumenPercent = theoreticalBitumenPercent;
        }
        if (!dispatch.actualBitumenQty) {
          updateData.actualBitumenQty = theoreticalBitumenQty;
        }
        if (!dispatch.actualLdoQty) {
          updateData.actualLdoQty = theoreticalLdoQty;
        }
        
        await db.update(truckDispatches)
          .set(updateData)
          .where(eq(truckDispatches.id, dispatch.id));
        
        updated++;
      } catch (err) {
        console.error(`Error updating dispatch ${dispatch.id}:`, err);
        errors++;
      }
    }
    
    return { updated, errors };
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
      
      // Update stock balance (reduce)
      const condition = stockPartyId === null 
        ? and(sql`${stockBalances.partyId} IS NULL`, eq(stockBalances.materialId, issue.materialId))
        : and(eq(stockBalances.partyId, stockPartyId!), eq(stockBalances.materialId, issue.materialId));
      
      const [existing] = await tx.select().from(stockBalances).where(condition).limit(1);
      const newBalance = (existing?.balance || 0) - issue.quantity;
      
      if (existing) {
        await tx.update(stockBalances)
          .set({ balance: newBalance, lastUpdated: new Date() })
          .where(eq(stockBalances.id, existing.id));
      } else {
        await tx.insert(stockBalances).values({
          partyId: stockPartyId,
          materialId: issue.materialId,
          balance: newBalance,
          uom: issue.uom,
        });
      }
      
      // Add ledger entry
      await tx.insert(stockLedger).values({
        date: issue.date,
        partyId: stockPartyId,
        materialId: issue.materialId,
        transactionType: "issue",
        referenceId: result.id,
        quantityOut: issue.quantity,
        balanceAfter: newBalance,
        uom: issue.uom,
        notes: `Issue to ${issue.issuedTo}${issue.purpose ? ` - ${issue.purpose}` : ''}`,
      });
      
      return result;
    });
  }

  async updateMaterialIssue(id: number, issue: Partial<InsertMaterialIssue>): Promise<MaterialIssue | undefined> {
    return db.transaction(async (tx) => {
      // Get original issue
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
      
      // Reverse original stock impact
      const originalStockPartyId = original.isPlantCommon ? null : original.partyId;
      const origCondition = originalStockPartyId === null 
        ? and(sql`${stockBalances.partyId} IS NULL`, eq(stockBalances.materialId, original.materialId))
        : and(eq(stockBalances.partyId, originalStockPartyId), eq(stockBalances.materialId, original.materialId));
      
      const [origBal] = await tx.select().from(stockBalances).where(origCondition).limit(1);
      if (origBal) {
        await tx.update(stockBalances)
          .set({ balance: origBal.balance + original.quantity, lastUpdated: new Date() })
          .where(eq(stockBalances.id, origBal.id));
      }
      
      // Update the issue record
      const [result] = await tx.update(materialIssues).set(updates).where(eq(materialIssues.id, id)).returning();
      
      // Apply new stock impact
      const newStockPartyId = (updates.isPlantCommon ?? original.isPlantCommon) ? null : (updates.partyId ?? original.partyId);
      const newMaterialId = updates.materialId ?? original.materialId;
      const newQuantity = updates.quantity ?? original.quantity;
      const newUom = updates.uom ?? original.uom;
      
      const newCondition = newStockPartyId === null 
        ? and(sql`${stockBalances.partyId} IS NULL`, eq(stockBalances.materialId, newMaterialId))
        : and(eq(stockBalances.partyId, newStockPartyId), eq(stockBalances.materialId, newMaterialId));
      
      const [newBal] = await tx.select().from(stockBalances).where(newCondition).limit(1);
      const newBalance = (newBal?.balance || 0) - newQuantity;
      
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
      
      // Delete old ledger entry and insert new one
      await tx.delete(stockLedger).where(
        and(eq(stockLedger.transactionType, "issue"), eq(stockLedger.referenceId, id))
      );
      
      const newDate = updates.date ?? original.date;
      const newIssuedTo = updates.issuedTo ?? original.issuedTo;
      const newPurpose = updates.purpose ?? original.purpose;
      
      await tx.insert(stockLedger).values({
        date: newDate,
        partyId: newStockPartyId,
        materialId: newMaterialId,
        transactionType: "issue",
        referenceId: result.id,
        quantityOut: newQuantity,
        balanceAfter: newBalance,
        uom: newUom,
        notes: `Issue to ${newIssuedTo}${newPurpose ? ` - ${newPurpose}` : ''}`,
      });
      
      return result;
    });
  }

  async deleteMaterialIssue(id: number): Promise<boolean> {
    return db.transaction(async (tx) => {
      const [issue] = await tx.select().from(materialIssues).where(eq(materialIssues.id, id)).limit(1);
      if (!issue) return false;
      
      // Reverse stock balance
      const stockPartyId = issue.isPlantCommon ? null : issue.partyId;
      const condition = stockPartyId === null 
        ? and(sql`${stockBalances.partyId} IS NULL`, eq(stockBalances.materialId, issue.materialId))
        : and(eq(stockBalances.partyId, stockPartyId), eq(stockBalances.materialId, issue.materialId));
      
      const [existing] = await tx.select().from(stockBalances).where(condition).limit(1);
      if (existing) {
        const newBalance = existing.balance + issue.quantity;
        await tx.update(stockBalances)
          .set({ balance: newBalance, lastUpdated: new Date() })
          .where(eq(stockBalances.id, existing.id));
        
        // Add reversal ledger entry
        await tx.insert(stockLedger).values({
          date: format(new Date(), "yyyy-MM-dd"),
          partyId: stockPartyId,
          materialId: issue.materialId,
          transactionType: "adjustment",
          referenceId: id,
          quantityIn: issue.quantity,
          balanceAfter: newBalance,
          uom: issue.uom,
          notes: `Deleted issue #${id} reversal`,
        });
      }
      
      // Delete ledger entries for this issue
      await tx.delete(stockLedger).where(
        and(eq(stockLedger.transactionType, "issue"), eq(stockLedger.referenceId, id))
      );
      
      // Delete the issue
      await tx.delete(materialIssues).where(eq(materialIssues.id, id));
      
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
}

export const storage = new DatabaseStorage();
