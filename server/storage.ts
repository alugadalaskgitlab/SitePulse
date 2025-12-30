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
  cloneDpr(id: number, editedBy: string): Promise<Dpr | undefined>;
  
  // Plant Reports
  getPlantReports(): Promise<PlantReport[]>;
  getPlantReport(id: number): Promise<PlantReportWithDetails | undefined>;
  createPlantReport(report: CreatePlantReportRequest): Promise<PlantReport>;
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

  async cloneDpr(id: number, editedBy: string): Promise<Dpr | undefined> {
    const original = await this.getDpr(id);
    if (!original) return undefined;

    return await db.transaction(async (tx) => {
      // Create a copy of the DPR
      const [newDpr] = await tx.insert(dprs).values({
        date: original.date,
        site: original.site,
        engineer: original.engineer + " (Edited by " + editedBy + ")",
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
}

export const storage = new DatabaseStorage();
