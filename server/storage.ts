import { db } from "./db";
import {
  dprs,
  progressEntries,
  equipmentLogs,
  labourLogs,
  materialLogs,
  type CreateDprRequest,
  type Dpr,
  type DprWithDetails
} from "@shared/schema";
import { eq, desc, and, gte, lte } from "drizzle-orm";

export interface IStorage {
  // DPRs
  getDprs(filters?: { site?: string; engineer?: string; dateFrom?: string; dateTo?: string }): Promise<Dpr[]>;
  getDpr(id: number): Promise<DprWithDetails | undefined>;
  createDpr(dpr: CreateDprRequest): Promise<Dpr>;
}

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
}

export const storage = new DatabaseStorage();
