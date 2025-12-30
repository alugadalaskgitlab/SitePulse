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
  type CreateDprRequest,
  type Dpr,
  type DprWithDetails,
  type PlantReport,
  type CreatePlantReportRequest,
  type PlantReportWithDetails
} from "@shared/schema";
import { eq, desc, and, gte, lte } from "drizzle-orm";

export interface IStorage {
  // DPRs
  getDprs(filters?: { site?: string; engineer?: string; dateFrom?: string; dateTo?: string }): Promise<Dpr[]>;
  getDpr(id: number): Promise<DprWithDetails | undefined>;
  createDpr(dpr: CreateDprRequest): Promise<Dpr>;
  updateDpr(id: number, dpr: CreateDprRequest): Promise<Dpr | undefined>;
  cloneDpr(id: number, editedBy: string): Promise<Dpr | undefined>;
  createVersionDpr(originalId: number, dprData: CreateDprRequest, editedBy: string): Promise<Dpr>;
  deleteDpr(id: number): Promise<boolean>;
  
  // Plant Reports
  getPlantReports(): Promise<PlantReport[]>;
  getPlantReport(id: number): Promise<PlantReportWithDetails | undefined>;
  createPlantReport(report: CreatePlantReportRequest): Promise<PlantReport>;
  clonePlantReport(id: number, editedBy: string): Promise<PlantReport | undefined>;
  updatePlantReport(id: number, report: CreatePlantReportRequest): Promise<PlantReport | undefined>;
  deletePlantReport(id: number): Promise<boolean>;
}

type PlantReportWithDetailsLocal = PlantReportWithDetails;

export class DatabaseStorage implements IStorage {
  async getDprs(filters?: { site?: string; engineer?: string; dateFrom?: string; dateTo?: string }): Promise<Dpr[]> {
    let conditions = [];
    
    if (filters?.site) conditions.push(eq(dprs.site, filters.site));
    if (filters?.engineer) conditions.push(eq(dprs.engineer, filters.engineer));
    if (filters?.dateFrom) conditions.push(gte(dprs.date, filters.dateFrom));
    if (filters?.dateTo) conditions.push(lte(dprs.date, filters.dateTo));

    return await db.select()
      .from(dprs)
      .where(and(...conditions))
      .orderBy(desc(dprs.date));
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

  async createDpr(dprData: CreateDprRequest): Promise<Dpr> {
    // Transaction to insert DPR and all related nested data
    return await db.transaction(async (tx) => {
      // 1. Insert DPR Header
      const [newDpr] = await tx.insert(dprs).values({
        date: dprData.date,
        site: dprData.site,
        engineer: dprData.engineer
      }).returning();

      const dprId = newDpr.id;

      // 2. Insert Progress Entries
      if (dprData.progress?.length) {
        await tx.insert(progressEntries).values(
          dprData.progress.map(p => ({ ...p, dprId }))
        );
      }

      // 3. Insert Equipment Logs
      if (dprData.equipment?.length) {
        await tx.insert(equipmentLogs).values(
          dprData.equipment.map(e => ({ ...e, dprId }))
        );
      }

      // 4. Insert Labour Logs
      if (dprData.labour?.length) {
        await tx.insert(labourLogs).values(
          dprData.labour.map(l => ({ ...l, dprId }))
        );
      }

      // 5. Insert Material Logs
      if (dprData.materials?.length) {
        await tx.insert(materialLogs).values(
          dprData.materials.map(m => ({ ...m, dprId }))
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

  async cloneDpr(id: number, editedBy: string): Promise<Dpr | undefined> {
    const original = await this.getDpr(id);
    if (!original) return undefined;

    const now = new Date();
    const dateTime = now.toISOString().replace('T', ' ').substring(0, 19);
    const roleName = editedBy === "manager" ? "Manager" : "Admin";

    return await db.transaction(async (tx) => {
      // Create a copy of the DPR with timestamp and role tag
      const [newDpr] = await tx.insert(dprs).values({
        date: original.date,
        site: `${original.site} – Copy by ${roleName} – ${dateTime}`,
        engineer: original.engineer,
        role: editedBy,
      }).returning();

      const dprId = newDpr.id;

      // Copy progress entries
      if (original.progress?.length) {
        await tx.insert(progressEntries).values(
          original.progress.map(p => ({
            dprId,
            activity: p.activity,
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

      // Copy equipment logs
      if (original.equipment?.length) {
        await tx.insert(equipmentLogs).values(
          original.equipment.map(e => ({
            dprId,
            machine: e.machine,
            operator: e.operator,
            startTime: e.startTime,
            endTime: e.endTime,
            diesel: e.diesel,
            task: e.task,
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

      // Copy material logs
      if (original.materials?.length) {
        await tx.insert(materialLogs).values(
          original.materials.map(m => ({
            dprId,
            type: m.type,
            material: m.material,
            supplier: m.supplier,
            quantity: m.quantity,
            uom: m.uom,
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

  async createVersionDpr(originalId: number, dprData: CreateDprRequest, editedBy: string): Promise<Dpr> {
    const now = new Date();
    const dateTime = now.toISOString().replace('T', ' ').substring(0, 19);
    const roleName = editedBy === "manager" ? "Manager" : "Admin";

    return await db.transaction(async (tx) => {
      // Create new DPR with edited data and timestamp
      const [newDpr] = await tx.insert(dprs).values({
        date: dprData.date,
        site: `${dprData.site} – Edited by ${roleName} – ${dateTime}`,
        engineer: dprData.engineer,
        role: editedBy,
      }).returning();

      const dprId = newDpr.id;

      // Insert edited progress entries
      if (dprData.progress?.length) {
        await tx.insert(progressEntries).values(
          dprData.progress.map(p => ({ ...p, dprId }))
        );
      }

      // Insert edited equipment logs
      if (dprData.equipment?.length) {
        await tx.insert(equipmentLogs).values(
          dprData.equipment.map(e => ({ ...e, dprId }))
        );
      }

      // Insert edited labour logs
      if (dprData.labour?.length) {
        await tx.insert(labourLogs).values(
          dprData.labour.map(l => ({ ...l, dprId }))
        );
      }

      // Insert edited material logs
      if (dprData.materials?.length) {
        await tx.insert(materialLogs).values(
          dprData.materials.map(m => ({ ...m, dprId }))
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
}

export const storage = new DatabaseStorage();
