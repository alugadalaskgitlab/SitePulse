/**
 * Cross-site Management Report — aggregation endpoints.
 * Pure reporting layer: read-only, no business logic.
 */
import type { Express } from "express";
import { db } from "./db";
import {
  eq, and, gte, lte, inArray, isNull, or, sum, count, sql,
} from "drizzle-orm";
import {
  storeGrns, storeGrnItems, storeIssues, storeIssueItems, storeItems,
  truckDispatches, rmcBatchRecords, plantSettings,
  labourLogs, dprs,
  purchaseIndents, purchaseIndentItems,
  vendorBills, vendorBillItems,
  sites as sitesTable,
} from "@shared/schema";
import { storage } from "./storage";
import { assertView } from "./auth-routes";

// ── Helpers ─────────────────────────────────────────────────────────────────

function parseSiteIds(raw: unknown): number[] | null {
  if (!raw) return null;
  const ids = String(raw).split(",").map(Number).filter((n) => !isNaN(n) && n > 0);
  return ids.length ? ids : null;
}

async function getEffectiveSiteIds(req: any, selectedIds: number[] | null): Promise<number[] | null> {
  const permittedIds =
    req.authUser && !req.authUser.isAdmin
      ? await storage.getUserPermittedSiteIds(req.authUser.id)
      : null;
  if (selectedIds !== null && permittedIds !== null) {
    return selectedIds.filter((id) => permittedIds.includes(id));
  }
  return selectedIds ?? permittedIds;
}

async function siteIdsToNames(ids: number[] | null): Promise<string[] | null> {
  if (ids === null) return null;
  if (ids.length === 0) return [];
  const rows = await db.select({ id: sitesTable.id, name: sitesTable.name }).from(sitesTable).where(inArray(sitesTable.id, ids));
  return rows.map((r) => r.name);
}

async function plantNamesForSiteIds(ids: number[] | null): Promise<string[] | null> {
  if (ids === null) return null;
  if (ids.length === 0) return [];
  const rows = await db.select({ plantName: plantSettings.plantName })
    .from(plantSettings)
    .where(and(
      inArray(plantSettings.siteId, ids),
    ));
  return rows.map((r) => r.plantName);
}

function cond(arr: any[]) {
  return arr.length ? and(...arr) : undefined;
}

// ── Route registration ───────────────────────────────────────────────────────

export function registerManagementReportRoutes(app: Express) {

  // ── 1. Materials Consumption ─────────────────────────────────────────────
  app.get("/api/admin/management-report/materials", async (req, res) => {
    try {
      if (!assertView(req, res, "reports")) return;

      const selectedIds = parseSiteIds(req.query.siteIds);
      const effectiveIds = await getEffectiveSiteIds(req, selectedIds);
      if (effectiveIds !== null && effectiveIds.length === 0) return res.json([]);

      const dateFrom = req.query.dateFrom as string | undefined;
      const dateTo   = req.query.dateTo   as string | undefined;

      // GRN items
      const grnConds: any[] = [];
      if (dateFrom) grnConds.push(gte(storeGrns.date, dateFrom));
      if (dateTo)   grnConds.push(lte(storeGrns.date, dateTo));
      if (effectiveIds) grnConds.push(inArray(storeGrns.siteId, effectiveIds));

      const grnRows = await db.select({
        siteId:  storeGrns.siteId,
        itemId:  storeGrnItems.itemId,
        qty:     sum(storeGrnItems.qty),
      })
      .from(storeGrns)
      .innerJoin(storeGrnItems, eq(storeGrnItems.grnId, storeGrns.id))
      .where(cond(grnConds))
      .groupBy(storeGrns.siteId, storeGrnItems.itemId);

      // Issue items
      const issConds: any[] = [];
      if (dateFrom) issConds.push(gte(storeIssues.date, dateFrom));
      if (dateTo)   issConds.push(lte(storeIssues.date, dateTo));
      if (effectiveIds) issConds.push(inArray(storeIssues.siteId, effectiveIds));

      const issRows = await db.select({
        siteId:  storeIssues.siteId,
        itemId:  storeIssueItems.itemId,
        qty:     sum(storeIssueItems.qty),
      })
      .from(storeIssues)
      .innerJoin(storeIssueItems, eq(storeIssueItems.issueId, storeIssues.id))
      .where(cond(issConds))
      .groupBy(storeIssues.siteId, storeIssueItems.itemId);

      // Fetch lookup maps
      const allSites = await db.select({ id: sitesTable.id, name: sitesTable.name }).from(sitesTable);
      const siteMap  = new Map(allSites.map((s) => [s.id, s.name]));

      const allItems = await db.select({ id: storeItems.id, name: storeItems.name, category: storeItems.category, uom: storeItems.uom }).from(storeItems);
      const itemMap  = new Map(allItems.map((i) => [i.id, i]));

      type Row = { siteId: number | null; siteName: string; itemName: string; category: string; uom: string; qtyReceived: number; qtyIssued: number };
      const key = (sId: number | null, iId: number) => `${sId}-${iId}`;
      const rowMap = new Map<string, Row>();

      const getOrCreate = (siteId: number | null, itemId: number): Row => {
        const k = key(siteId, itemId);
        if (!rowMap.has(k)) {
          const item = itemMap.get(itemId);
          rowMap.set(k, {
            siteId,
            siteName:    siteId ? (siteMap.get(siteId) ?? `Site ${siteId}`) : "Unassigned",
            itemName:    item?.name ?? `Item #${itemId}`,
            category:    item?.category ?? "",
            uom:         item?.uom ?? "",
            qtyReceived: 0,
            qtyIssued:   0,
          });
        }
        return rowMap.get(k)!;
      };

      for (const r of grnRows) getOrCreate(r.siteId, r.itemId).qtyReceived += Number(r.qty) || 0;
      for (const r of issRows) getOrCreate(r.siteId, r.itemId).qtyIssued   += Number(r.qty) || 0;

      const result = Array.from(rowMap.values())
        .sort((a, b) => a.siteName.localeCompare(b.siteName) || a.itemName.localeCompare(b.itemName));

      res.json(result);
    } catch (err) {
      console.error("management-report/materials:", err);
      res.status(500).json({ error: "Failed to fetch materials report" });
    }
  });

  // ── 2. Plant Production ──────────────────────────────────────────────────
  app.get("/api/admin/management-report/production", async (req, res) => {
    try {
      if (!assertView(req, res, "reports")) return;

      const selectedIds = parseSiteIds(req.query.siteIds);
      const effectiveIds = await getEffectiveSiteIds(req, selectedIds);
      if (effectiveIds !== null && effectiveIds.length === 0) return res.json([]);

      const dateFrom = req.query.dateFrom as string | undefined;
      const dateTo   = req.query.dateTo   as string | undefined;

      // plantName ↔ site mapping
      const psRows = await db.select({ plantName: plantSettings.plantName, siteId: plantSettings.siteId, plantType: plantSettings.plantType }).from(plantSettings);
      const allSites = await db.select({ id: sitesTable.id, name: sitesTable.name }).from(sitesTable);
      const siteMap = new Map(allSites.map((s) => [s.id, s.name]));
      const plantToSiteId = new Map(psRows.map((p) => [p.plantName, p.siteId]));
      const plantToType   = new Map(psRows.map((p) => [p.plantName, p.plantType]));

      const permittedPlantNames = effectiveIds !== null
        ? psRows.filter((p) => p.siteId !== null && effectiveIds.includes(p.siteId)).map((p) => p.plantName)
        : null;

      // HMP dispatches
      const hmpConds: any[] = [];
      if (dateFrom) hmpConds.push(gte(truckDispatches.date, dateFrom));
      if (dateTo)   hmpConds.push(lte(truckDispatches.date, dateTo));
      if (permittedPlantNames !== null) {
        if (permittedPlantNames.length === 0) {
          // no permitted HMP plants
        } else {
          hmpConds.push(inArray(truckDispatches.plantName, permittedPlantNames));
        }
      }

      const hmpRows = permittedPlantNames?.length === 0 ? [] : await db.select({
        plantName:     truckDispatches.plantName,
        mtProduced:    sum(truckDispatches.loadWeight),
        dispatchCount: count(truckDispatches.id),
      })
      .from(truckDispatches)
      .where(cond(hmpConds))
      .groupBy(truckDispatches.plantName);

      // RMC batches
      const rmcConds: any[] = [];
      if (dateFrom) rmcConds.push(gte(rmcBatchRecords.date, dateFrom));
      if (dateTo)   rmcConds.push(lte(rmcBatchRecords.date, dateTo));
      if (permittedPlantNames !== null) {
        if (permittedPlantNames.length === 0) {
          // no permitted RMC plants
        } else {
          rmcConds.push(inArray(rmcBatchRecords.plantName, permittedPlantNames));
        }
      }

      const rmcRows = permittedPlantNames?.length === 0 ? [] : await db.select({
        plantName:     rmcBatchRecords.plantName,
        volumeM3:      sum(rmcBatchRecords.totalVolumeM3),
        dispatchCount: count(rmcBatchRecords.id),
      })
      .from(rmcBatchRecords)
      .where(cond(rmcConds))
      .groupBy(rmcBatchRecords.plantName);

      type Row = { siteName: string; plantName: string; type: string; mtProduced: number; dispatchCount: number; unit: string };
      const result: Row[] = [];

      for (const r of hmpRows) {
        const siteId = plantToSiteId.get(r.plantName) ?? null;
        const siteName = siteId ? (siteMap.get(siteId) ?? r.plantName) : r.plantName;
        result.push({ siteName, plantName: r.plantName, type: "HMP", mtProduced: Number(r.mtProduced) || 0, dispatchCount: Number(r.dispatchCount) || 0, unit: "MT" });
      }
      for (const r of rmcRows) {
        const siteId = plantToSiteId.get(r.plantName) ?? null;
        const siteName = siteId ? (siteMap.get(siteId) ?? r.plantName) : r.plantName;
        result.push({ siteName, plantName: r.plantName, type: "RMC", mtProduced: Number(r.volumeM3) || 0, dispatchCount: Number(r.dispatchCount) || 0, unit: "m³" });
      }

      result.sort((a, b) => a.siteName.localeCompare(b.siteName) || a.plantName.localeCompare(b.plantName));
      res.json(result);
    } catch (err) {
      console.error("management-report/production:", err);
      res.status(500).json({ error: "Failed to fetch production report" });
    }
  });

  // ── 3. Fuel & LDO ───────────────────────────────────────────────────────
  app.get("/api/admin/management-report/fuel", async (req, res) => {
    try {
      if (!assertView(req, res, "reports")) return;

      const selectedIds = parseSiteIds(req.query.siteIds);
      const effectiveIds = await getEffectiveSiteIds(req, selectedIds);
      if (effectiveIds !== null && effectiveIds.length === 0) return res.json([]);

      const dateFrom = req.query.dateFrom as string | undefined;
      const dateTo   = req.query.dateTo   as string | undefined;

      const psRows = await db.select({ plantName: plantSettings.plantName, siteId: plantSettings.siteId }).from(plantSettings);
      const allSites = await db.select({ id: sitesTable.id, name: sitesTable.name }).from(sitesTable);
      const siteMap = new Map(allSites.map((s) => [s.id, s.name]));
      const plantToSiteId = new Map(psRows.map((p) => [p.plantName, p.siteId]));

      const permittedPlantNames = effectiveIds !== null
        ? psRows.filter((p) => p.siteId !== null && effectiveIds.includes(p.siteId)).map((p) => p.plantName)
        : null;

      const hmpConds: any[] = [];
      if (dateFrom) hmpConds.push(gte(truckDispatches.date, dateFrom));
      if (dateTo)   hmpConds.push(lte(truckDispatches.date, dateTo));
      if (permittedPlantNames !== null && permittedPlantNames.length > 0) {
        hmpConds.push(inArray(truckDispatches.plantName, permittedPlantNames));
      }

      const fuelRows = permittedPlantNames?.length === 0 ? [] : await db.select({
        plantName:   truckDispatches.plantName,
        ldoConsumed: sum(sql<number>`COALESCE(${truckDispatches.actualLdoQty}, ${truckDispatches.theoreticalLdoQty})`),
        mtProduced:  sum(truckDispatches.loadWeight),
      })
      .from(truckDispatches)
      .where(cond(hmpConds))
      .groupBy(truckDispatches.plantName);

      type Row = { siteName: string; plantName: string; ldoConsumedL: number; mtProduced: number; lPerMt: number | null };
      const result: Row[] = fuelRows.map((r) => {
        const siteId   = plantToSiteId.get(r.plantName) ?? null;
        const siteName = siteId ? (siteMap.get(siteId) ?? r.plantName) : r.plantName;
        const ldo  = Number(r.ldoConsumed)  || 0;
        const mt   = Number(r.mtProduced)   || 0;
        return { siteName, plantName: r.plantName, ldoConsumedL: ldo, mtProduced: mt, lPerMt: mt > 0 ? Math.round((ldo / mt) * 100) / 100 : null };
      });

      result.sort((a, b) => a.siteName.localeCompare(b.siteName));
      res.json(result);
    } catch (err) {
      console.error("management-report/fuel:", err);
      res.status(500).json({ error: "Failed to fetch fuel report" });
    }
  });

  // ── 4. Labour / Mandays ──────────────────────────────────────────────────
  app.get("/api/admin/management-report/labour", async (req, res) => {
    try {
      if (!assertView(req, res, "reports")) return;

      const selectedIds = parseSiteIds(req.query.siteIds);
      const effectiveIds = await getEffectiveSiteIds(req, selectedIds);
      if (effectiveIds !== null && effectiveIds.length === 0) return res.json([]);

      const dateFrom = req.query.dateFrom as string | undefined;
      const dateTo   = req.query.dateTo   as string | undefined;

      // Convert siteIds → site names for DPR text-field filtering
      const permittedSiteNames = await siteIdsToNames(effectiveIds);
      if (permittedSiteNames !== null && permittedSiteNames.length === 0) return res.json([]);

      const dprConds: any[] = [or(eq(dprs.isSuperseded, false), isNull(dprs.isSuperseded))];
      if (dateFrom) dprConds.push(gte(dprs.date, dateFrom));
      if (dateTo)   dprConds.push(lte(dprs.date, dateTo));
      if (permittedSiteNames !== null) dprConds.push(inArray(dprs.site, permittedSiteNames));

      const rows = await db.select({
        site:        dprs.site,
        contractor:  labourLogs.contractor,
        category:    labourLogs.category,
        mandays:     sum(labourLogs.count),
      })
      .from(labourLogs)
      .innerJoin(dprs, eq(labourLogs.dprId, dprs.id))
      .where(cond(dprConds))
      .groupBy(dprs.site, labourLogs.contractor, labourLogs.category)
      .orderBy(dprs.site);

      const result = rows.map((r) => ({
        siteName:    r.site,
        contractor:  r.contractor ?? "Direct",
        category:    r.category,
        totalMandays: Number(r.mandays) || 0,
      }));

      res.json(result);
    } catch (err) {
      console.error("management-report/labour:", err);
      res.status(500).json({ error: "Failed to fetch labour report" });
    }
  });

  // ── 5. Financials ────────────────────────────────────────────────────────
  app.get("/api/admin/management-report/financials", async (req, res) => {
    try {
      if (!assertView(req, res, "reports")) return;

      const selectedIds = parseSiteIds(req.query.siteIds);
      const effectiveIds = await getEffectiveSiteIds(req, selectedIds);
      if (effectiveIds !== null && effectiveIds.length === 0) return res.json({ bills: [], indents: { count: 0, value: 0 } });

      const dateFrom = req.query.dateFrom as string | undefined;
      const dateTo   = req.query.dateTo   as string | undefined;

      // Vendor bills grouped by siteName from items
      const permittedSiteNames = await siteIdsToNames(effectiveIds);

      const billConds: any[] = [];
      if (dateFrom) billConds.push(gte(vendorBills.billDate, dateFrom));
      if (dateTo)   billConds.push(lte(vendorBills.billDate, dateTo));

      const billRows = await db.select({
        siteName:  vendorBillItems.siteName,
        billId:    vendorBills.id,
        amount:    vendorBillItems.amount,
        status:    vendorBills.status,
      })
      .from(vendorBills)
      .innerJoin(vendorBillItems, eq(vendorBillItems.billId, vendorBills.id))
      .where(cond(billConds));

      // Aggregate bills by site name (filter by permitted sites)
      type BillRow = { siteName: string; billCount: number; billValue: number; statuses: Record<string, number> };
      const billMap = new Map<string, BillRow>();
      for (const r of billRows) {
        const sn = r.siteName || "Unassigned";
        if (permittedSiteNames !== null && !permittedSiteNames.includes(sn) && sn !== "Unassigned") continue;
        if (!billMap.has(sn)) {
          billMap.set(sn, { siteName: sn, billCount: 0, billValue: 0, statuses: {} });
        }
        const entry = billMap.get(sn)!;
        entry.billValue += Number(r.amount) || 0;
        const status = r.status || "draft";
        entry.statuses[status] = (entry.statuses[status] || 0) + 1;
      }
      // Count distinct bills per site
      const billIdBySite = new Map<string, Set<number>>();
      for (const r of billRows) {
        const sn = r.siteName || "Unassigned";
        if (!billIdBySite.has(sn)) billIdBySite.set(sn, new Set());
        billIdBySite.get(sn)!.add(r.billId);
      }
      for (const [sn, ids] of billIdBySite) {
        const entry = billMap.get(sn);
        if (entry) entry.billCount = ids.size;
      }

      // Purchase indents (no siteId — date-filtered total only)
      const indentConds: any[] = [];
      if (dateFrom) indentConds.push(gte(purchaseIndents.date, dateFrom));
      if (dateTo)   indentConds.push(lte(purchaseIndents.date, dateTo));

      const [indentTotals] = await db.select({
        cnt:   count(purchaseIndents.id),
        value: sum(purchaseIndentItems.estAmount),
      })
      .from(purchaseIndents)
      .leftJoin(purchaseIndentItems, eq(purchaseIndentItems.indentId, purchaseIndents.id))
      .where(cond(indentConds));

      res.json({
        bills:   Array.from(billMap.values()).sort((a, b) => a.siteName.localeCompare(b.siteName)),
        indents: {
          count: Number(indentTotals?.cnt) || 0,
          value: Number(indentTotals?.value) || 0,
        },
      });
    } catch (err) {
      console.error("management-report/financials:", err);
      res.status(500).json({ error: "Failed to fetch financials report" });
    }
  });
}
