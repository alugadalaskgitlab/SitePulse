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
  DEFAULT_LDO_NORM
} from "@shared/schema";
import { eq, desc, and, gte, lte, notInArray, sql, asc } from "drizzle-orm";
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
  
  // Enhanced dispatch with stock deduction
  createTruckDispatchWithStockDeduction(dispatch: InsertTruckDispatch): Promise<{ dispatch: TruckDispatch; shortages: { materialId: number; required: number; available: number }[] }>;
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
      
      // Note: For simplicity, we don't recalculate stock on update
      // To change quantity/material, delete and recreate the receipt
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
    
    const uppercased = {
      ...dispatch,
      truckNumber: dispatch.truckNumber.toUpperCase(),
      deliveryLocation: dispatch.deliveryLocation?.toUpperCase(),
      theoreticalBitumenPercent,
      theoreticalBitumenQty,
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
    // Get equipment to calculate expected diesel
    const [equipment] = await db.select().from(equipmentMaster).where(eq(equipmentMaster.id, usage.equipmentId)).limit(1);
    
    const hoursOrKmRun = usage.closingReading - usage.openingReading;
    const expectedDiesel = hoursOrKmRun * (equipment?.consumptionNorm || 0);
    const variance = expectedDiesel - (usage.dieselIssued || 0);
    
    const [result] = await db.insert(equipmentUsage).values({
      ...usage,
      hoursOrKmRun,
      expectedDiesel,
      variance,
    }).returning();
    
    return result;
  }

  async updateEquipmentUsage(id: number, usage: Partial<InsertEquipmentUsage>): Promise<EquipmentUsage | undefined> {
    // Get equipment to recalculate expected diesel if readings changed
    const [existing] = await db.select().from(equipmentUsage).where(eq(equipmentUsage.id, id)).limit(1);
    if (!existing) return undefined;

    const equipmentId = usage.equipmentId ?? existing.equipmentId;
    const [equipment] = await db.select().from(equipmentMaster).where(eq(equipmentMaster.id, equipmentId)).limit(1);
    
    const openingReading = usage.openingReading ?? existing.openingReading;
    const closingReading = usage.closingReading ?? existing.closingReading;
    const dieselIssued = usage.dieselIssued ?? existing.dieselIssued;
    
    const hoursOrKmRun = closingReading - openingReading;
    const expectedDiesel = hoursOrKmRun * (equipment?.consumptionNorm || 0);
    const variance = expectedDiesel - (dieselIssued || 0);
    
    const [result] = await db.update(equipmentUsage)
      .set({
        ...usage,
        hoursOrKmRun,
        expectedDiesel,
        variance,
        remarks: usage.remarks?.toUpperCase(),
      })
      .where(eq(equipmentUsage.id, id))
      .returning();
    return result;
  }

  async deleteEquipmentUsage(id: number): Promise<boolean> {
    const result = await db.delete(equipmentUsage).where(eq(equipmentUsage.id, id)).returning();
    return result.length > 0;
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
      
      // Helper to deduct stock with party-first, plant-common fallback
      const deductStock = async (matId: number, requiredQty: number, uom: string, notes: string) => {
        const partyStock = await getBalance(partyId, matId);
        const plantCommonStock = await getBalance(null, matId);
        const totalAvailable = partyStock + plantCommonStock;
        
        let shortage = false;
        if (totalAvailable < requiredQty) {
          shortage = true;
        }
        
        let remaining = requiredQty;
        
        // First deduct from party stock
        if (partyStock > 0 && remaining > 0) {
          const deductFromParty = Math.min(partyStock, remaining);
          await deductFromSource(partyId, matId, deductFromParty, uom, `${notes} (Party)`);
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
      
      // Create the dispatch record
      const [result] = await tx.insert(truckDispatches).values({
        ...dispatch,
        truckNumber: dispatch.truckNumber.toUpperCase(),
        deliveryLocation: dispatch.deliveryLocation?.toUpperCase(),
        theoreticalBitumenPercent,
        theoreticalBitumenQty,
        theoreticalLdoQty,
        theoreticalAggregates: JSON.stringify(theoreticalAggregates),
        stockDeducted: 1,
        shortageWarning: shortages.length ? JSON.stringify(shortages) : null,
      }).returning();
      
      return { dispatch: result, shortages };
    });
  }
}

export const storage = new DatabaseStorage();
