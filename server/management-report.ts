/**
 * Cross-site Management Report — aggregation endpoints.
 * Pure reporting layer: read-only, no business logic.
 *
 * Auth: each route explicitly runs requireAuth before assertView,
 * so it is safe regardless of where registerManagementReportRoutes
 * is called relative to the global app.use("/api", requireAuth) block.
 */
import type { Express, Request, Response, NextFunction } from "express";
import { db } from "./db";
import {
  eq, and, gte, lte, inArray, isNull, or, sum, count, sql,
} from "drizzle-orm";
import {
  storeGrns, storeGrnItems, storeIssues, storeIssueItems, storeItems,
  materialIssues, plantMaterials,
  truckDispatches, rmcBatchRecords, plantSettings,
  labourLogs, dprs,
  purchaseIndents, purchaseIndentItems,
  vendorBills, vendorBillItems,
  sites as sitesTable,
  ldoLogs,
  dieselRequirements,
} from "@shared/schema";
import { storage } from "./storage";
import { assertView } from "./auth-routes";
import { requireAuth } from "./auth";

/**
 * Permission check: grants access when the user has view permission on
 * the `reports` section OR the `admin_settings` section (or is admin).
 * Returns true and does NOT send a response when access is granted.
 * Returns false and sends a 401/403 response when access is denied.
 */
function assertViewReportOrAdmin(req: Request, res: Response): boolean {
  if (!req.authUser) {
    res.status(401).json({ error: "not_authenticated" });
    return false;
  }
  if (req.authUser.isAdmin) return true;
  const m = req.authPermissions;
  if (m?.["reports"]?.view || m?.["admin_settings"]?.view) return true;
  res.status(403).json({ error: "forbidden" });
  return false;
}

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
  const rows = await db.select({ id: sitesTable.id, name: sitesTable.name })
    .from(sitesTable).where(inArray(sitesTable.id, ids));
  return rows.map((r) => r.name);
}

function cond(arr: any[]) {
  return arr.length ? and(...arr) : undefined;
}

/** Wraps requireAuth as a promise so we can await it inline in route handlers. */
function authMiddleware(req: Request, res: Response): Promise<boolean> {
  return new Promise((resolve) => {
    requireAuth(req, res, () => resolve(true));
    // If requireAuth calls res.status().json() it ends the response; resolve false.
    res.on("finish", () => resolve(false));
  });
}

// ── Route registration ───────────────────────────────────────────────────────

export function registerManagementReportRoutes(app: Express) {

  // Shared auth middleware applied to every management report route.
  // This is explicit per-route auth so the endpoints are safe regardless
  // of where this function is called relative to the global requireAuth block.
  const mgmtAuth = [
    (req: Request, res: Response, next: NextFunction) => requireAuth(req, res, next),
  ];

  // ── 0. Accessible sites (for site selector — scope-aware) ────────────────
  // Allows reports OR admin_settings permission; directly checks authPermissions
  // so we never send two responses.
  app.get("/api/admin/management-report/accessible-sites", ...mgmtAuth, async (req, res) => {
    try {
      if (!req.authUser) {
        return res.status(401).json({ error: "not_authenticated" });
      }
      const { isAdmin } = req.authUser;
      const perms = req.authPermissions;
      const canView = isAdmin || perms?.["reports"]?.view || perms?.["admin_settings"]?.view;
      if (!canView) {
        return res.status(403).json({ error: "forbidden" });
      }

      const allSites = await db.select({
        id: sitesTable.id, name: sitesTable.name, isActive: sitesTable.isActive,
      }).from(sitesTable);

      // Non-admin users: return only their permitted sites.
      // getUserPermittedSiteIds() returns null when the user has no site restrictions
      // (all sites visible) — must guard against calling .includes() on null.
      if (!isAdmin) {
        const permittedIds = await storage.getUserPermittedSiteIds(req.authUser.id);
        if (permittedIds === null) {
          // Unrestricted non-admin (e.g., manager with reports permission but no per-site lock)
          return res.json(allSites);
        }
        return res.json(allSites.filter((s) => permittedIds.includes(s.id)));
      }
      res.json(allSites);
    } catch (err) {
      console.error("management-report/accessible-sites:", err);
      res.status(500).json({ error: "Failed to fetch accessible sites" });
    }
  });

  // ── 1. Materials Consumption ─────────────────────────────────────────────
  app.get("/api/admin/management-report/materials", ...mgmtAuth, async (req, res) => {
    try {
      if (!assertViewReportOrAdmin(req, res)) return;

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

      // Lookup maps
      const allSites = await db.select({ id: sitesTable.id, name: sitesTable.name }).from(sitesTable);
      const siteMap  = new Map(allSites.map((s) => [s.id, s.name]));
      const allItems = await db.select({ id: storeItems.id, name: storeItems.name, category: storeItems.category, uom: storeItems.uom }).from(storeItems);
      const itemMap  = new Map(allItems.map((i) => [i.id, i]));

      type Row = { siteId: number | null; siteName: string; itemName: string; category: string; uom: string; qtyReceived: number; qtyIssued: number };
      const rowMap = new Map<string, Row>();

      const getOrCreate = (siteId: number | null, itemId: number): Row => {
        const k = `${siteId}-${itemId}`;
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

      // Plant material issues: material_issues.issuedTo is a free-text site name.
      // Filter by permitted site names; use plant_materials for item details.
      const permittedSiteNamesForMat = await siteIdsToNames(effectiveIds);
      const miConds: any[] = [];
      if (dateFrom) miConds.push(gte(materialIssues.date, dateFrom));
      if (dateTo)   miConds.push(lte(materialIssues.date, dateTo));
      if (permittedSiteNamesForMat !== null) {
        if (permittedSiteNamesForMat.length === 0) {
          // no permitted sites — skip
        } else {
          miConds.push(inArray(materialIssues.issuedTo, permittedSiteNamesForMat));
        }
      }

      const miRows = permittedSiteNamesForMat?.length === 0 ? [] : await db.select({
        issuedTo: materialIssues.issuedTo,
        materialId: materialIssues.materialId,
        qty:      sum(materialIssues.quantity),
        uom:      materialIssues.uom,
      })
      .from(materialIssues)
      .where(cond(miConds))
      .groupBy(materialIssues.issuedTo, materialIssues.materialId, materialIssues.uom);

      // Lookup map for plant materials
      const allPlantMats = await db.select({ id: plantMaterials.id, name: plantMaterials.name, category: plantMaterials.category, defaultUom: plantMaterials.defaultUom }).from(plantMaterials);
      const plantMatMap = new Map(allPlantMats.map((m) => [m.id, m]));
      // Reverse site name→id lookup
      const siteNameToId = new Map(allSites.map((s) => [s.name, s.id]));

      for (const r of miRows) {
        const sn = r.issuedTo || "Unassigned";
        // Resolve siteId from name; fall back to null
        const sid = siteNameToId.get(sn) ?? null;
        const mat = plantMatMap.get(r.materialId);
        // Use a namespace prefix to avoid key collision with store items
        const k = `plant-${sid ?? sn}-${r.materialId}`;
        if (!rowMap.has(k)) {
          rowMap.set(k, {
            siteId:      sid,
            siteName:    sn,
            itemName:    mat?.name ?? `Plant Material #${r.materialId}`,
            category:    mat?.category ?? "Plant",
            uom:         r.uom ?? mat?.defaultUom ?? "",
            qtyReceived: 0,
            qtyIssued:   0,
          });
        }
        rowMap.get(k)!.qtyIssued += Number(r.qty) || 0;
      }

      const result = Array.from(rowMap.values())
        .sort((a, b) => a.siteName.localeCompare(b.siteName) || a.itemName.localeCompare(b.itemName));
      res.json(result);
    } catch (err) {
      console.error("management-report/materials:", err);
      res.status(500).json({ error: "Failed to fetch materials report" });
    }
  });

  // ── 2. Plant Production ──────────────────────────────────────────────────
  app.get("/api/admin/management-report/production", ...mgmtAuth, async (req, res) => {
    try {
      if (!assertViewReportOrAdmin(req, res)) return;

      const selectedIds = parseSiteIds(req.query.siteIds);
      const effectiveIds = await getEffectiveSiteIds(req, selectedIds);
      if (effectiveIds !== null && effectiveIds.length === 0) return res.json([]);

      const dateFrom = req.query.dateFrom as string | undefined;
      const dateTo   = req.query.dateTo   as string | undefined;

      const psRows = await db.select({ plantName: plantSettings.plantName, siteId: plantSettings.siteId, plantType: plantSettings.plantType }).from(plantSettings);
      const allSites = await db.select({ id: sitesTable.id, name: sitesTable.name }).from(sitesTable);
      const siteMap = new Map(allSites.map((s) => [s.id, s.name]));
      const plantToSiteId = new Map(psRows.map((p) => [p.plantName, p.siteId]));

      const permittedPlantNames = effectiveIds !== null
        ? psRows.filter((p) => p.siteId !== null && effectiveIds.includes(p.siteId)).map((p) => p.plantName)
        : null;

      const hmpConds: any[] = [];
      if (dateFrom) hmpConds.push(gte(truckDispatches.date, dateFrom));
      if (dateTo)   hmpConds.push(lte(truckDispatches.date, dateTo));
      if (permittedPlantNames !== null && permittedPlantNames.length > 0)
        hmpConds.push(inArray(truckDispatches.plantName, permittedPlantNames));

      const hmpRows = permittedPlantNames?.length === 0 ? [] : await db.select({
        plantName:     truckDispatches.plantName,
        mtProduced:    sum(truckDispatches.loadWeight),
        dispatchCount: count(truckDispatches.id),
      })
      .from(truckDispatches)
      .where(cond(hmpConds))
      .groupBy(truckDispatches.plantName);

      const rmcConds: any[] = [];
      if (dateFrom) rmcConds.push(gte(rmcBatchRecords.date, dateFrom));
      if (dateTo)   rmcConds.push(lte(rmcBatchRecords.date, dateTo));
      if (permittedPlantNames !== null && permittedPlantNames.length > 0)
        rmcConds.push(inArray(rmcBatchRecords.plantName, permittedPlantNames));

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
        result.push({ siteName: siteId ? (siteMap.get(siteId) ?? r.plantName) : r.plantName, plantName: r.plantName, type: "HMP", mtProduced: Number(r.mtProduced) || 0, dispatchCount: Number(r.dispatchCount) || 0, unit: "MT" });
      }
      for (const r of rmcRows) {
        const siteId = plantToSiteId.get(r.plantName) ?? null;
        result.push({ siteName: siteId ? (siteMap.get(siteId) ?? r.plantName) : r.plantName, plantName: r.plantName, type: "RMC", mtProduced: Number(r.volumeM3) || 0, dispatchCount: Number(r.dispatchCount) || 0, unit: "m³" });
      }

      result.sort((a, b) => a.siteName.localeCompare(b.siteName) || a.plantName.localeCompare(b.plantName));
      res.json(result);
    } catch (err) {
      console.error("management-report/production:", err);
      res.status(500).json({ error: "Failed to fetch production report" });
    }
  });

  // ── 3. Fuel & LDO ───────────────────────────────────────────────────────
  app.get("/api/admin/management-report/fuel", ...mgmtAuth, async (req, res) => {
    try {
      if (!assertViewReportOrAdmin(req, res)) return;

      const selectedIds = parseSiteIds(req.query.siteIds);
      const effectiveIds = await getEffectiveSiteIds(req, selectedIds);
      if (effectiveIds !== null && effectiveIds.length === 0) {
        return res.json({ plants: [], summary: { ldoReceivedL: 0, ldoConsumedL: 0, dieselCost: 0 } });
      }

      const dateFrom = req.query.dateFrom as string | undefined;
      const dateTo   = req.query.dateTo   as string | undefined;

      // Plant ↔ site mapping
      const psRows = await db.select({ plantName: plantSettings.plantName, siteId: plantSettings.siteId }).from(plantSettings);
      const allSites = await db.select({ id: sitesTable.id, name: sitesTable.name }).from(sitesTable);
      const siteMap = new Map(allSites.map((s) => [s.id, s.name]));
      const plantToSiteId = new Map(psRows.map((p) => [p.plantName, p.siteId]));

      const permittedPlantNames = effectiveIds !== null
        ? psRows.filter((p) => p.siteId !== null && effectiveIds.includes(p.siteId)).map((p) => p.plantName)
        : null;

      // Per-plant LDO consumed from dispatches
      const hmpConds: any[] = [];
      if (dateFrom) hmpConds.push(gte(truckDispatches.date, dateFrom));
      if (dateTo)   hmpConds.push(lte(truckDispatches.date, dateTo));
      if (permittedPlantNames !== null && permittedPlantNames.length > 0)
        hmpConds.push(inArray(truckDispatches.plantName, permittedPlantNames));

      const fuelRows = permittedPlantNames?.length === 0 ? [] : await db.select({
        plantName:   truckDispatches.plantName,
        ldoConsumed: sum(sql<number>`COALESCE(${truckDispatches.actualLdoQty}, ${truckDispatches.theoreticalLdoQty})`),
        mtProduced:  sum(truckDispatches.loadWeight),
      })
      .from(truckDispatches)
      .where(cond(hmpConds))
      .groupBy(truckDispatches.plantName);

      type PlantRow = { siteName: string; plantName: string; ldoConsumedL: number; mtProduced: number; lPerMt: number | null };
      const plants: PlantRow[] = fuelRows.map((r) => {
        const siteId   = plantToSiteId.get(r.plantName) ?? null;
        const siteName = siteId ? (siteMap.get(siteId) ?? r.plantName) : r.plantName;
        const ldo  = Number(r.ldoConsumed)  || 0;
        const mt   = Number(r.mtProduced)   || 0;
        return { siteName, plantName: r.plantName, ldoConsumedL: ldo, mtProduced: mt, lPerMt: mt > 0 ? Math.round((ldo / mt) * 100) / 100 : null };
      });
      plants.sort((a, b) => a.siteName.localeCompare(b.siteName));

      // Aggregate LDO from ldo_logs — scope by site via partyId bridge:
      // truckDispatches links plantName (→ permittedPlantNames) and partyId (→ ldoLogs.partyId).
      // Collect distinct partyIds that dispatched from permitted plants within the date range.
      const bridgeConds: any[] = [];
      if (dateFrom) bridgeConds.push(gte(truckDispatches.date, dateFrom));
      if (dateTo)   bridgeConds.push(lte(truckDispatches.date, dateTo));
      if (permittedPlantNames !== null && permittedPlantNames.length > 0)
        bridgeConds.push(inArray(truckDispatches.plantName, permittedPlantNames));

      const partyIdRows = permittedPlantNames?.length === 0 ? [] : await db
        .selectDistinct({ partyId: truckDispatches.partyId })
        .from(truckDispatches)
        .where(cond(bridgeConds));

      const permittedPartyIds = partyIdRows
        .map((r) => r.partyId)
        .filter((id): id is number => id !== null);

      const ldoConds: any[] = [];
      if (dateFrom) ldoConds.push(gte(ldoLogs.date, dateFrom));
      if (dateTo)   ldoConds.push(lte(ldoLogs.date, dateTo));
      // Site-scope: only include ldo_logs entries for parties linked to permitted plants
      if (permittedPartyIds.length > 0)
        ldoConds.push(inArray(ldoLogs.partyId, permittedPartyIds));
      else if (permittedPlantNames !== null)
        ldoConds.push(sql`false`); // no permitted parties found — return zero totals

      const [ldoTotals] = await db.select({
        received: sum(ldoLogs.ldoReceived),
        consumed: sum(ldoLogs.ldoConsumed),
      })
      .from(ldoLogs)
      .where(cond(ldoConds));

      // Filter diesel requirements by siteId when effectiveIds is set.
      // Rows with siteId = null are unassigned and only appear in global (no-filter) view.
      const drConds: any[] = [];
      if (dateFrom) drConds.push(gte(dieselRequirements.date, dateFrom));
      if (dateTo)   drConds.push(lte(dieselRequirements.date, dateTo));
      if (effectiveIds) drConds.push(inArray(dieselRequirements.siteId, effectiveIds));
      const [drTotals] = await db.select({ cost: sum(dieselRequirements.amount) })
        .from(dieselRequirements)
        .where(cond(drConds));
      const dieselCost = Number(drTotals?.cost) || 0;

      res.json({
        plants,
        summary: {
          ldoReceivedL: Number(ldoTotals?.received) || 0,
          ldoConsumedL: Number(ldoTotals?.consumed) || 0,
          dieselCost,
        },
      });
    } catch (err) {
      console.error("management-report/fuel:", err);
      res.status(500).json({ error: "Failed to fetch fuel report" });
    }
  });

  // ── 4. Labour / Mandays ──────────────────────────────────────────────────
  app.get("/api/admin/management-report/labour", ...mgmtAuth, async (req, res) => {
    try {
      if (!assertViewReportOrAdmin(req, res)) return;

      const selectedIds = parseSiteIds(req.query.siteIds);
      const effectiveIds = await getEffectiveSiteIds(req, selectedIds);
      if (effectiveIds !== null && effectiveIds.length === 0) return res.json([]);

      const dateFrom = req.query.dateFrom as string | undefined;
      const dateTo   = req.query.dateTo   as string | undefined;

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
  app.get("/api/admin/management-report/financials", ...mgmtAuth, async (req, res) => {
    try {
      if (!assertViewReportOrAdmin(req, res)) return;

      const selectedIds = parseSiteIds(req.query.siteIds);
      const effectiveIds = await getEffectiveSiteIds(req, selectedIds);
      if (effectiveIds !== null && effectiveIds.length === 0) {
        return res.json({ bills: [], indents: { count: 0, value: 0 } });
      }

      const dateFrom = req.query.dateFrom as string | undefined;
      const dateTo   = req.query.dateTo   as string | undefined;

      const permittedSiteNames = await siteIdsToNames(effectiveIds);

      const billConds: any[] = [];
      if (dateFrom) billConds.push(gte(vendorBills.billDate, dateFrom));
      if (dateTo)   billConds.push(lte(vendorBills.billDate, dateTo));

      const billRows = await db.select({
        siteName: vendorBillItems.siteName,
        billId:   vendorBills.id,
        amount:   vendorBillItems.amount,
        status:   vendorBills.status,
      })
      .from(vendorBills)
      .innerJoin(vendorBillItems, eq(vendorBillItems.billId, vendorBills.id))
      .where(cond(billConds));

      // Aggregate bills by site name.
      // Track both per-bill status (billId → status) and per-item amounts so
      // statusBreakdown is counted ONCE per distinct bill, not per item row.
      type BillEntry = {
        siteName: string;
        billCount: number;
        billValue: number;
        statusBreakdown: { draft: number; pending: number; approved: number; paid: number; other: number };
      };
      const billMap = new Map<string, BillEntry>();
      // site → { billId → status } — used to deduplicate status counts
      const billStatusBySite = new Map<string, Map<number, string>>();

      for (const r of billRows) {
        const sn = r.siteName || "Unassigned";
        // For site-scoped users: exclude ANY bill whose site is not in their permitted list,
        // including "Unassigned" rows (no site on the bill = cannot confirm they are permitted).
        if (permittedSiteNames !== null && !permittedSiteNames.includes(sn)) continue;
        if (!billMap.has(sn)) {
          billMap.set(sn, { siteName: sn, billCount: 0, billValue: 0,
            statusBreakdown: { draft: 0, pending: 0, approved: 0, paid: 0, other: 0 } });
          billStatusBySite.set(sn, new Map());
        }
        const entry = billMap.get(sn)!;
        // Accumulate item amounts (each row is one item)
        entry.billValue += Number(r.amount) || 0;
        // Record bill status once per distinct bill — last write wins (all items share the same status)
        billStatusBySite.get(sn)!.set(r.billId, (r.status || "draft").toLowerCase());
      }
      // Finalise per-site bill counts and status breakdowns using distinct bills
      for (const [sn, billStatuses] of billStatusBySite) {
        const entry = billMap.get(sn)!;
        entry.billCount = billStatuses.size;
        for (const s of billStatuses.values()) {
          if (s === "draft")         entry.statusBreakdown.draft++;
          else if (s === "pending")  entry.statusBreakdown.pending++;
          else if (s === "approved") entry.statusBreakdown.approved++;
          else if (s === "paid")     entry.statusBreakdown.paid++;
          else                        entry.statusBreakdown.other++;
        }
      }

      // Filter purchase indents by siteId when effectiveIds is set.
      // Rows with siteId = null are unassigned and only appear in global (no-filter) view.
      const indentConds: any[] = [];
      if (dateFrom) indentConds.push(gte(purchaseIndents.date, dateFrom));
      if (dateTo)   indentConds.push(lte(purchaseIndents.date, dateTo));
      if (effectiveIds) indentConds.push(inArray(purchaseIndents.siteId, effectiveIds));
      const [indentTotals] = await db.select({
        cnt:   sql<number>`count(distinct ${purchaseIndents.id})`,
        value: sum(purchaseIndentItems.estAmount),
      })
      .from(purchaseIndents)
      .leftJoin(purchaseIndentItems, eq(purchaseIndentItems.indentId, purchaseIndents.id))
      .where(cond(indentConds));
      const indents = {
        count: Number(indentTotals?.cnt)   || 0,
        value: Number(indentTotals?.value) || 0,
      };

      res.json({
        bills: Array.from(billMap.values())
          .sort((a, b) => a.siteName.localeCompare(b.siteName)),
        indents,
      });
    } catch (err) {
      console.error("management-report/financials:", err);
      res.status(500).json({ error: "Failed to fetch financials report" });
    }
  });
}
