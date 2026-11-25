import type { Express, Request, Response } from "express";
import { and, asc, eq, inArray } from "drizzle-orm";
import {
  auditLogs, boqItems, boqProjects, levelSheetDesignRows, levelSheetSiteSettings,
  levelSheets, levelSheetStaff, levelSheetTbms, personnel, sites,
} from "@shared/schema";
import { boqItemDisplayText } from "@shared/boqItemName";
import { assertApprove, assertCreate, assertEdit, assertView, currentUserName } from "./auth-routes";
import { db } from "./db";
import { storage } from "./storage";
import {
  deriveDesignRowsFromFrl,
  LEVEL_SHEET_FALLBACK_LAYERS,
  normalizeDesignImportRows,
  normalizeTbmImport, repeatedTbmNames,
  consultantLayoutLayers,
  quantitiesBetweenSheets, storedLevelSheetInput, levelSheetBasisLabel,
  type BookChainageSystem,
  type DesignLevelRow,
  type ReadingMode,
  type ReadingRow,
} from "@shared/levelSheets";

const SECTION = "level_sheets" as const;
const MAX_READINGS = 500;
const MAX_POINTS_PER_ROW = 80;

function fail(message: string, status = 400): never {
  throw Object.assign(new Error(message), { status });
}

function numberValue(value: unknown, label: string, options: { nullable?: boolean; min?: number; max?: number } = {}) {
  if (value == null || value === "") {
    if (options.nullable) return null;
    fail(`${label} is required.`);
  }
  const number = typeof value === "number" ? value : Number(String(value).replace(",", "."));
  if (!Number.isFinite(number) || (options.min != null && number < options.min) || (options.max != null && number > options.max)) {
    fail(`${label} must be a valid number${options.min != null ? ` from ${options.min}` : ""}${options.max != null ? ` to ${options.max}` : ""}.`);
  }
  return number;
}

function positiveId(value: unknown, label: string, optional = false): number | null {
  if (value == null || value === "") {
    if (optional) return null;
    fail(`Choose ${label}.`);
  }
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) fail(`Choose a valid ${label}.`);
  return id;
}

function safeAttachment(input: any) {
  if (input == null) return { fileName: null, objectPath: null, mimeType: null, fileSize: null };
  if (typeof input.fileName !== "string" || !input.fileName.trim()
      || typeof input.objectPath !== "string" || !input.objectPath.startsWith("/objects/")
      || (input.mimeType && !String(input.mimeType).startsWith("image/") && input.mimeType !== "application/pdf")
      || (input.fileSize != null && (!Number.isSafeInteger(input.fileSize) || input.fileSize < 0 || input.fileSize > 15 * 1024 * 1024))) {
    fail("Choose an image or PDF up to 15 MB.", 422);
  }
  return {
    fileName: input.fileName.trim(), objectPath: input.objectPath,
    mimeType: input.mimeType || null, fileSize: input.fileSize ?? null,
  };
}

function validateDesignRow(input: any, source: "EXCEL" | "TYPED"): Omit<DesignLevelRow, "id"> {
  return {
    chainageOursKm: numberValue(input?.chainageOursKm, "Chainage", { min: -1000, max: 10000 }) as number,
    centreLevel: numberValue(input?.centreLevel, "Level at centre", { min: -1000, max: 10000 }) as number,
    crossfallLeftPct: numberValue(input?.crossfallLeftPct, "Cross-fall left", { min: -100, max: 100 }) as number,
    crossfallRightPct: numberValue(input?.crossfallRightPct, "Cross-fall right", { min: -100, max: 100 }) as number,
    topWidthLeftM: numberValue(input?.topWidthLeftM, "Top width left", { min: 0, max: 1000 }) as number,
    topWidthRightM: numberValue(input?.topWidthRightM, "Top width right", { min: 0, max: 1000 }) as number,
    source,
  };
}

function validateReadings(value: unknown): ReadingRow[] {
  if (!Array.isArray(value) || value.length > MAX_READINGS) fail("Readings must be a list of 500 chainages or fewer.");
  const rows = value.map((raw: any) => {
    const chainageOursKm = numberValue(raw?.chainageOursKm, "Chainage", { min: -1000, max: 10000 }) as number;
    if (!Array.isArray(raw?.points) || raw.points.length > MAX_POINTS_PER_ROW) fail("A chainage row has too many point columns.");
    const pointKeys = new Set<string>();
    const points = raw.points.map((point: any) => {
      if (!["L", "CL", "R"].includes(point?.side)) fail("Every point needs Left, centre line or Right.");
      const distanceM = numberValue(point?.distanceM, "Point distance", { nullable: true, min: 0, max: 1000 }) as number | null;
      if (point.side === "CL" && distanceM != null && distanceM !== 0) fail("The centre line distance must be 0.");
      if (point.side !== "CL" && distanceM === 0) fail("Left and right distances must be greater than 0 m.");
      const key = `${point.side}:${distanceM}`;
      if (distanceM != null && pointKeys.has(key)) fail(`${point.side} ${distanceM} m is already there.`);
      if (distanceM != null) pointKeys.add(key);
      const remark = point.remark == null || point.remark === "" ? null : String(point.remark).trim();
      if (remark && remark.length > 120) fail("Point remarks must be 120 characters or fewer.");
      const reading = numberValue(point.value, "Reading", { nullable: true, min: -10000, max: 10000 });
      const columnKey = point.columnKey == null ? null : String(point.columnKey).slice(0, 80);
      return { side: point.side as "L" | "CL" | "R", distanceM, value: reading, remark, columnKey };
    });
    let shift: ReadingRow["shift"] = null;
    if (raw?.shift != null) {
      shift = {
        foresight: numberValue(raw.shift.foresight, "Change-point foresight", { nullable: true, min: 0, max: 10000 }),
        backsight: numberValue(raw.shift.backsight, "New back sight", { nullable: true, min: 0, max: 10000 }),
      };
    }
    return { chainageOursKm, shift, points };
  });
  const sorted = rows.slice().sort((a, b) => a.chainageOursKm - b.chainageOursKm);
  for (let i = 1; i < sorted.length; i++) {
    if (Math.abs(sorted[i].chainageOursKm - sorted[i - 1].chainageOursKm) < 1e-9) {
      fail("Two reading rows cannot use the same chainage.");
    }
  }
  return rows;
}

function validateDate(value: unknown, label: string): string {
  const date = String(value ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) fail(`Choose a valid ${label}.`);
  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) fail(`Choose a valid ${label}.`);
  return date;
}

function actorRole(req: Request) {
  return req.authUser?.isOwner ? "owner" : req.authUser?.isAdmin ? "admin" : req.authUser?.businessRole ?? "user";
}

function errorResponse(res: Response, error: any) {
  const status = Number(error?.status);
  return res.status(status >= 400 && status < 600 ? status : 500).json({ message: error?.message || "Could not save level sheet data." });
}

export function registerLevelSheetRoutes(app: Express, dependencies: { db?: any; storage?: any } = {}) {
  const database = dependencies.db ?? db;
  const persistence = dependencies.storage ?? storage;

  async function assertSiteAllowed(req: Request, siteId: number) {
    const allowedIds = await persistence.getUserPermittedSiteIds(
      req.authUser!.id,
      !!req.authFeatureAccess?.rolesConfigured,
    );
    if (allowedIds !== null && !allowedIds.includes(siteId)) fail("You do not have access to this site.", 403);
    const [site] = await database.select({ id: sites.id }).from(sites).where(eq(sites.id, siteId)).limit(1);
    if (!site) fail("The selected site does not exist.", 404);
  }

  async function audit(tx: any, req: Request, transactionId: number, action: string, oldValues: unknown, newValues: unknown, reason?: string) {
    await tx.insert(auditLogs).values({
      module: "level_sheet",
      transactionId,
      action,
      userId: req.authUser!.id,
      userName: currentUserName(req),
      userRole: actorRole(req),
      oldValues: oldValues ?? null,
      newValues: newValues ?? null,
      reason: reason ?? null,
    });
  }

  async function loadStaff(sheetId: number) {
    return database.select({
      id: personnel.id, name: personnel.name, isActive: personnel.isActive,
    }).from(levelSheetStaff)
      .innerJoin(personnel, eq(personnel.id, levelSheetStaff.personnelId))
      .where(eq(levelSheetStaff.levelSheetId, sheetId))
      .orderBy(asc(personnel.name));
  }

  async function loadSheet(id: number) {
    const [row] = await database.select({
      sheet: levelSheets,
      siteName: sites.name,
      itemCode: boqItems.itemCode,
      displayName: boqItems.displayName,
      itemName: boqItems.itemName,
      itemDescription: boqItems.description,
      projectName: boqProjects.name,
    }).from(levelSheets)
      .innerJoin(sites, eq(sites.id, levelSheets.siteId))
      .leftJoin(boqItems, eq(boqItems.id, levelSheets.boqItemId))
      .leftJoin(boqProjects, eq(boqProjects.id, levelSheets.boqProjectId))
      .where(eq(levelSheets.id, id)).limit(1);
    if (!row) return null;
    return {
      ...row.sheet,
      siteName: row.siteName,
      projectName: row.projectName,
      itemLabel: row.sheet.boqItemId == null ? null : boqItemDisplayText({
        displayName: row.displayName, itemName: row.itemName, description: row.itemDescription,
      }),
      staff: await loadStaff(id),
    };
  }

  async function validateSheetPayload(input: any, current?: any) {
    if (!input || typeof input !== "object" || Array.isArray(input)) fail("Level sheet details are required.");
    const siteId = positiveId(input?.siteId, "site", false) as number;
    const layerName = String(input?.layerName ?? "").trim();
    if (!layerName || layerName.length > 120) fail("Enter a layer name (120 characters or fewer).");
    const sheetDate = validateDate(input?.sheetDate, "date");
    const boqItemId = positiveId(input?.boqItemId, "BOQ item", true);
    const requestedProjectId = positiveId(input?.boqProjectId, "BOQ project", true);
    let boqProjectId = requestedProjectId;
    if (boqItemId != null) {
      const [item] = await database.select({
        id: boqItems.id, projectId: boqItems.boqProjectId, siteId: boqProjects.siteId,
      }).from(boqItems).innerJoin(boqProjects, eq(boqProjects.id, boqItems.boqProjectId))
        .where(eq(boqItems.id, boqItemId)).limit(1);
      if (!item || Number(item.siteId) !== siteId || (requestedProjectId != null && Number(item.projectId) !== requestedProjectId)) {
        fail("The BOQ item must belong to a project at the selected site.", 422);
      }
      boqProjectId = Number(item.projectId);
    } else if (requestedProjectId != null) {
      const [project] = await database.select({ id: boqProjects.id, siteId: boqProjects.siteId })
        .from(boqProjects).where(eq(boqProjects.id, requestedProjectId)).limit(1);
      if (!project || Number(project.siteId) !== siteId) fail("The BOQ project must belong to the selected site.", 422);
    }
    if (!["rl", "staff"].includes(input?.readingMode)) fail("Choose Enter RLs or Enter staff readings.");
    const readingMode = input.readingMode as ReadingMode;
    const readings = validateReadings(input.readings);
    const status = input.status ?? "draft";
    const basis = input.basis === undefined ? current?.basis ?? null : input.basis;
    if (basis != null && !["own", "consultant", "assumed"].includes(basis)) fail("Choose a valid basis.");
    if (!["draft", "saved"].includes(status)) fail("Choose Save draft or Save levels.");
    const staffIdsRaw = input.personnelIds ?? current?.personnelIds ?? [];
    if (!Array.isArray(staffIdsRaw) || staffIdsRaw.length > 50) fail("Choose up to 50 staff members.");
    const personnelIds = [...new Set(staffIdsRaw.map((id: unknown) => positiveId(id, "staff member", false) as number))];
    if (personnelIds.length !== staffIdsRaw.length) fail("A staff member is selected more than once.");
    const currentStaff = new Set<number>(current?.personnelIds ?? []);
    if (personnelIds.length) {
      const people = await database.select({ id: personnel.id, isActive: personnel.isActive })
        .from(personnel).where(inArray(personnel.id, personnelIds));
      if (people.length !== personnelIds.length) fail("One or more selected staff members do not exist.", 422);
      for (const person of people) {
        if (Number(person.isActive) !== 1 && !currentStaff.has(Number(person.id))) {
          fail("Only active Personnel can be added to a new level sheet.", 422);
        }
      }
    }
    const attachment = Object.hasOwn(input, "attachment")
      ? safeAttachment(input.attachment)
      : {
          fileName: current?.fileName ?? null, objectPath: current?.objectPath ?? null,
          mimeType: current?.mimeType ?? null, fileSize: current?.fileSize ?? null,
        };
    return {
      siteId, boqProjectId, boqItemId, layerName, sheetDate, basis,
      instrument: String(input.instrument ?? "").trim().slice(0, 200) || null,
      toleranceAboveMm: numberValue(input.toleranceAboveMm, "Tolerance above", { min: 0, max: 10000 }) as number,
      toleranceBelowMm: numberValue(input.toleranceBelowMm, "Tolerance below", { min: 0, max: 10000 }) as number,
      allowedClosingErrorMm: numberValue(input.allowedClosingErrorMm, "Allowed closing error", { min: 0, max: 10000 }) as number,
      readingMode,
      tbmName: String(input.tbmName ?? "").trim().slice(0, 120) || null,
      tbmRl: numberValue(input.tbmRl, "TBM level", { nullable: true, min: -1000, max: 10000 }),
      initialBackSight: numberValue(input.initialBackSight, "Back sight", { nullable: true, min: 0, max: 10000 }),
      closingForeSight: numberValue(input.closingForeSight, "Closing fore sight", { nullable: true, min: 0, max: 10000 }),
      closingTbmName: String(input.closingTbmName ?? current?.closingTbmName ?? "").trim().slice(0, 120) || null,
      closingTbmRl: numberValue(input.closingTbmRl === undefined ? current?.closingTbmRl : input.closingTbmRl, "Closing TBM RL", { nullable: true, min: -1000, max: 10000 }),
      readings, status, personnelIds, attachment,
    };
  }

  function validateTbm(input: any) {
    const name = String(input?.name ?? "").trim();
    if (!name || name.length > 120) fail("Enter a TBM name (120 characters or fewer).");
    return {
      name,
      chainageOursKm: numberValue(input.chainageOursKm, "Chainage", { min: -1000, max: 10000 }) as number,
      rl: numberValue(input.rl, "RL", { min: -1000, max: 10000 }) as number,
      easting: numberValue(input.easting, "Easting", { nullable: true }),
      northing: numberValue(input.northing, "Northing", { nullable: true }),
      description: String(input.description ?? "").trim().slice(0, 2000) || null,
      active: input.active !== false,
    };
  }

  app.get("/api/level-sheets/tbms", async (req: any, res) => {
    if (!assertView(req, res, SECTION)) return;
    try {
      const siteId = positiveId(req.query.siteId, "site") as number;
      await assertSiteAllowed(req, siteId);
      res.json(await database.select().from(levelSheetTbms).where(eq(levelSheetTbms.siteId, siteId)).orderBy(asc(levelSheetTbms.chainageOursKm)));
    } catch (error) { return errorResponse(res, error); }
  });

  app.post("/api/level-sheets/tbms", async (req: any, res) => {
    if (!assertCreate(req, res, SECTION)) return;
    try {
      const siteId = positiveId(req.body?.siteId, "site") as number;
      await assertSiteAllowed(req, siteId);
      const values = validateTbm(req.body);
      const saved = await database.transaction(async (tx: any) => {
        const [row] = await tx.insert(levelSheetTbms).values({ ...values, siteId, createdByUserId: req.authUser.id, updatedByUserId: req.authUser.id }).returning();
        await audit(tx, req, row.id, "tbm_create", null, row);
        return row;
      });
      res.status(201).json(saved);
    } catch (error: any) {
      if (String(error?.code ?? error?.cause?.code) === "23505") return res.status(409).json({ message: "A TBM with this name already exists at this site." });
      return errorResponse(res, error);
    }
  });

  app.post("/api/level-sheets/tbms/import", async (req: any, res) => {
    if (!assertCreate(req, res, SECTION)) return;
    try {
      const siteId = positiveId(req.body?.siteId, "site") as number;
      await assertSiteAllowed(req, siteId);
      if (!Array.isArray(req.body.rows) || !req.body.rows.length || req.body.rows.length > 5000) fail("Choose 1 to 5,000 TBM rows.");
      const [settings] = await database.select().from(levelSheetSiteSettings).where(eq(levelSheetSiteSettings.siteId, siteId));
      const normalized = normalizeTbmImport(req.body.rows, req.body.mapping, settings?.bookChainageSystem ?? "ours", Number(settings?.consultantOffsetM ?? 0));
      const edits = req.body.names;
      const values = normalized.map((row, index) => validateTbm({ ...row, name: Array.isArray(edits) ? edits[index] : row.name }));
      const existing = await database.select({ name: levelSheetTbms.name }).from(levelSheetTbms).where(eq(levelSheetTbms.siteId, siteId));
      if (repeatedTbmNames([...existing.map((row: any) => row.name), ...values.map(row => row.name)]).some(Boolean)) fail("Repeated name — rename before import.", 422);
      const saved = await database.transaction(async (tx: any) => {
        const result = [];
        for (const value of values) {
          const [row] = await tx.insert(levelSheetTbms).values({ ...value, siteId, createdByUserId: req.authUser.id, updatedByUserId: req.authUser.id }).returning();
          await audit(tx, req, row.id, "tbm_import", null, row);
          result.push(row);
        }
        return result;
      });
      res.status(201).json(saved);
    } catch (error) { return errorResponse(res, error); }
  });

  app.patch("/api/level-sheets/tbms/:id", async (req: any, res) => {
    if (!assertEdit(req, res, SECTION)) return;
    try {
      const id = positiveId(req.params.id, "TBM") as number;
      const [current] = await database.select().from(levelSheetTbms).where(eq(levelSheetTbms.id, id));
      if (!current) fail("TBM not found.", 404);
      await assertSiteAllowed(req, Number(current.siteId));
      const values = validateTbm({ ...current, ...req.body });
      const saved = await database.transaction(async (tx: any) => {
        const [row] = await tx.update(levelSheetTbms).set({ ...values, updatedByUserId: req.authUser.id, updatedAt: new Date() }).where(eq(levelSheetTbms.id, id)).returning();
        await audit(tx, req, id, "tbm_edit", current, row);
        return row;
      });
      res.json(saved);
    } catch (error) { return errorResponse(res, error); }
  });

  app.get("/api/level-sheets/quantities", async (req: any, res) => {
    if (!assertView(req, res, SECTION)) return;
    try {
      const lowerId = positiveId(req.query.lowerId, "lower sheet") as number;
      const upperId = positiveId(req.query.upperId, "upper sheet") as number;
      if (lowerId === upperId) fail("Choose two different level sheets.");
      const rows = await database.select().from(levelSheets).where(inArray(levelSheets.id, [lowerId, upperId]));
      const lower = rows.find((row: any) => Number(row.id) === lowerId);
      const upper = rows.find((row: any) => Number(row.id) === upperId);
      if (!lower || !upper) fail("Level sheet not found.", 404);
      await assertSiteAllowed(req, Number(lower.siteId));
      await assertSiteAllowed(req, Number(upper.siteId));
      if (Number(lower.siteId) !== Number(upper.siteId)) fail("Both sheets must be from the same site.");
      if (lower.status !== "saved" || upper.status !== "saved") fail("Choose saved sheets.");
      const fromKm = numberValue(req.query.fromKm, "From chainage", { nullable: true });
      const toKm = numberValue(req.query.toKm, "To chainage", { nullable: true });
      if (fromKm != null && toKm != null && fromKm > toKm) fail("From chainage must not exceed To chainage.");
      const summary = (row: any) => ({ id: row.id, layerName: row.layerName, sheetDate: row.sheetDate, basis: levelSheetBasisLabel(row) });
      res.json({
        ...quantitiesBetweenSheets(storedLevelSheetInput(lower), storedLevelSheetInput(upper), fromKm, toKm),
        lower: summary(lower), upper: summary(upper),
      });
    } catch (error) { return errorResponse(res, error); }
  });

  app.get("/api/level-sheets/bootstrap", async (req: any, res) => {
    if (!assertView(req, res, SECTION)) return;
    try {
      const allowedIds = await persistence.getUserPermittedSiteIds(
        req.authUser.id, !!req.authFeatureAccess?.rolesConfigured,
      );
      const siteCondition = allowedIds === null ? undefined
        : allowedIds.length ? inArray(sites.id, allowedIds) : null;
      const sitesQuery = database.select({ id: sites.id, name: sites.name }).from(sites);
      const siteRows = siteCondition === null ? [] : await sitesQuery
        .where(siteCondition ? and(eq(sites.isActive, 1), siteCondition) : eq(sites.isActive, 1))
        .orderBy(asc(sites.name));
      const requestedSiteId = Number(req.query.siteId);
      const siteId = Number.isSafeInteger(requestedSiteId) && siteRows.some((site: any) => Number(site.id) === requestedSiteId)
        ? requestedSiteId : Number(siteRows[0]?.id ?? 0) || null;
      const projects = siteRows.length
        ? await database.select({ id: boqProjects.id, name: boqProjects.name, siteId: boqProjects.siteId, status: boqProjects.status })
          .from(boqProjects).where(and(
            siteId ? eq(boqProjects.siteId, siteId) : inArray(boqProjects.siteId, siteRows.map((site: any) => site.id)),
          )).orderBy(asc(boqProjects.name))
        : [];
      const requestedProjectId = Number(req.query.boqProjectId);
      const projectId = projects.some((project: any) => Number(project.id) === requestedProjectId)
        ? requestedProjectId : Number(projects.find((project: any) => Number(project.siteId) === siteId)?.id ?? 0) || null;
      const items = projectId ? await database.select({
        id: boqItems.id, itemCode: boqItems.itemCode, itemName: boqItems.itemName,
        displayName: boqItems.displayName, description: boqItems.description, unit: boqItems.unit, layerConfig: boqItems.layerConfig,
      }).from(boqItems).where(eq(boqItems.boqProjectId, projectId))
        .orderBy(asc(boqItems.sortOrder), asc(boqItems.id)) : [];
      const staff = await database.select({
        id: personnel.id, name: personnel.name, role: personnel.role, isActive: personnel.isActive,
      }).from(personnel).where(eq(personnel.isActive, 1)).orderBy(asc(personnel.name));
      const [settings] = siteId ? await database.select().from(levelSheetSiteSettings)
        .where(eq(levelSheetSiteSettings.siteId, siteId)).limit(1) : [];
      const configuredLayers = items.flatMap((item: any) => {
        const cfg = item.layerConfig && typeof item.layerConfig === "object" ? item.layerConfig : {};
        const raw = cfg.dprLayers ?? cfg.layers ?? [];
        return Array.isArray(raw) ? raw.map((layer: any) =>
          typeof layer === "string" ? layer : String(layer?.name ?? layer?.label ?? layer?.layer ?? ""),
        ).filter(Boolean) : [];
      });
      const existingLayers = siteId ? await database.select({ layerName: levelSheetDesignRows.layerName })
        .from(levelSheetDesignRows).where(eq(levelSheetDesignRows.siteId, siteId)) : [];
      const layerOptions = [...new Set([
        ...configuredLayers, ...existingLayers.map((row: any) => row.layerName),
        ...LEVEL_SHEET_FALLBACK_LAYERS,
      ])];
      res.json({
        sites: siteRows, siteId, projects, boqProjectId: projectId, items, personnel: staff,
        layerOptions,
        settings: settings ?? { siteId, bookChainageSystem: "ours", consultantOffsetM: 0 },
      });
    } catch (error) { return errorResponse(res, error); }
  });

  app.get("/api/level-sheets/design", async (req: any, res) => {
    if (!assertView(req, res, SECTION)) return;
    try {
      const siteId = positiveId(req.query.siteId, "site", false) as number;
      const layerName = String(req.query.layerName ?? "").trim();
      if (!layerName) return res.status(400).json({ message: "Choose a layer." });
      await assertSiteAllowed(req, siteId);
      const [settings] = await database.select().from(levelSheetSiteSettings)
        .where(eq(levelSheetSiteSettings.siteId, siteId)).limit(1);
      const rows = await database.select().from(levelSheetDesignRows).where(and(
        eq(levelSheetDesignRows.siteId, siteId), eq(levelSheetDesignRows.layerName, layerName),
      )).orderBy(asc(levelSheetDesignRows.chainageOursKm), asc(levelSheetDesignRows.id));
      res.json({ settings: settings ?? { siteId, bookChainageSystem: "ours", consultantOffsetM: 0 }, rows });
    } catch (error) { return errorResponse(res, error); }
  });

  app.get("/api/level-sheets", async (req: any, res) => {
    if (!assertView(req, res, SECTION)) return;
    try {
      const siteId = positiveId(req.query.siteId, "site", false) as number;
      await assertSiteAllowed(req, siteId);
      const rows = await database.select({
        sheet: levelSheets,
        siteName: sites.name,
        itemCode: boqItems.itemCode, itemName: boqItems.itemName, itemDescription: boqItems.description,
        displayName: boqItems.displayName,
      }).from(levelSheets).innerJoin(sites, eq(sites.id, levelSheets.siteId))
        .leftJoin(boqItems, eq(boqItems.id, levelSheets.boqItemId))
        .where(eq(levelSheets.siteId, siteId))
        .orderBy(asc(levelSheets.sheetDate), asc(levelSheets.id));
      const ids = rows.map((row: any) => Number(row.sheet.id));
      const staffRows = ids.length ? await database.select({
        sheetId: levelSheetStaff.levelSheetId, name: personnel.name, isActive: personnel.isActive,
      }).from(levelSheetStaff).innerJoin(personnel, eq(personnel.id, levelSheetStaff.personnelId))
        .where(inArray(levelSheetStaff.levelSheetId, ids)).orderBy(asc(personnel.name)) : [];
      const staffBySheet = new Map<number, any[]>();
      for (const row of staffRows) staffBySheet.set(Number(row.sheetId), [...(staffBySheet.get(Number(row.sheetId)) ?? []), row]);
      res.json(rows.map((row: any) => ({
        ...row.sheet,
        siteName: row.siteName,
        itemLabel: row.sheet.boqItemId == null ? null : boqItemDisplayText({
          displayName: row.displayName, itemName: row.itemName, description: row.itemDescription,
        }),
        staff: staffBySheet.get(Number(row.sheet.id)) ?? [],
      })));
    } catch (error) { return errorResponse(res, error); }
  });

  app.put("/api/level-sheets/site-settings", async (req: any, res) => {
    if (!assertEdit(req, res, SECTION)) return;
    try {
      const siteId = positiveId(req.body?.siteId, "site", false) as number;
      await assertSiteAllowed(req, siteId);
      const system = req.body?.bookChainageSystem;
      if (!["ours", "consultant"].includes(system)) fail("Choose Ours or Consultant chainage.");
      const consultantOffsetM = numberValue(req.body?.consultantOffsetM, "Consultant offset", { min: -100000, max: 100000 }) as number;
      const saved = await database.transaction(async (tx: any) => {
        const [old] = await tx.select().from(levelSheetSiteSettings).where(eq(levelSheetSiteSettings.siteId, siteId)).limit(1);
        const values = { siteId, bookChainageSystem: system as BookChainageSystem, consultantOffsetM, updatedByUserId: req.authUser.id, updatedAt: new Date() };
        const [row] = old
          ? await tx.update(levelSheetSiteSettings).set(values).where(eq(levelSheetSiteSettings.siteId, siteId)).returning()
          : await tx.insert(levelSheetSiteSettings).values(values).returning();
        if (!row) fail("Site chainage setting was not saved.", 500);
        await audit(tx, req, siteId, old ? "site_setting_edit" : "site_setting_create", old, row);
        return row;
      });
      res.json(saved);
    } catch (error) { return errorResponse(res, error); }
  });

  app.post("/api/level-sheets/design/rows", async (req: any, res) => {
    if (!assertCreate(req, res, SECTION)) return;
    try {
      const siteId = positiveId(req.body?.siteId, "site", false) as number;
      const layerName = String(req.body?.layerName ?? "").trim();
      if (!layerName || layerName.length > 120) fail("Enter a layer name.");
      await assertSiteAllowed(req, siteId);
      const row = validateDesignRow(req.body, "TYPED");
      const saved = await database.transaction(async (tx: any) => {
        const [created] = await tx.insert(levelSheetDesignRows).values({
          ...row, siteId, layerName, createdByUserId: req.authUser.id, updatedByUserId: req.authUser.id,
        }).returning();
        if (!created) fail("Design row was not saved.", 500);
        await audit(tx, req, created.id, "design_row_create", null, created);
        return created;
      });
      res.status(201).json(saved);
    } catch (error) { return errorResponse(res, error); }
  });

  app.patch("/api/level-sheets/design/rows/:id", async (req: any, res) => {
    if (!assertEdit(req, res, SECTION)) return;
    try {
      const id = positiveId(req.params.id, "design row", false) as number;
      const [current] = await database.select().from(levelSheetDesignRows).where(eq(levelSheetDesignRows.id, id)).limit(1);
      if (!current) return res.status(404).json({ message: "Design row not found." });
      await assertSiteAllowed(req, Number(current.siteId));
      const next = validateDesignRow(req.body, current.source as "EXCEL" | "TYPED");
      const saved = await database.transaction(async (tx: any) => {
        const [row] = await tx.update(levelSheetDesignRows).set({
          ...next, updatedByUserId: req.authUser.id, updatedAt: new Date(),
        }).where(eq(levelSheetDesignRows.id, id)).returning();
        if (!row) fail("Design row was not updated.", 409);
        await audit(tx, req, id, "design_row_edit", current, row);
        return row;
      });
      res.json(saved);
    } catch (error) { return errorResponse(res, error); }
  });

  app.delete("/api/level-sheets/design/rows/:id", async (req: any, res) => {
    if (!assertEdit(req, res, SECTION)) return;
    try {
      const id = positiveId(req.params.id, "design row", false) as number;
      const [current] = await database.select().from(levelSheetDesignRows).where(eq(levelSheetDesignRows.id, id)).limit(1);
      if (!current) return res.status(404).json({ message: "Design row not found." });
      await assertSiteAllowed(req, Number(current.siteId));
      await database.transaction(async (tx: any) => {
        await tx.delete(levelSheetDesignRows).where(eq(levelSheetDesignRows.id, id));
        await audit(tx, req, id, "design_row_delete", current, null);
      });
      res.json({ ok: true, id });
    } catch (error) { return errorResponse(res, error); }
  });

  app.post("/api/level-sheets/design/import-layers", async (req: any, res) => {
    if (!assertCreate(req, res, SECTION)) return;
    try {
      const siteId = positiveId(req.body?.siteId, "site") as number;
      await assertSiteAllowed(req, siteId);
      if (!Array.isArray(req.body.matrix) || req.body.matrix.length > 5002 || req.body.matrix.some((row: any) => !Array.isArray(row) || row.length > 200)) fail("Choose an Excel sheet with up to 5,000 data rows and 200 columns.");
      const [settings] = await database.select().from(levelSheetSiteSettings).where(eq(levelSheetSiteSettings.siteId, siteId));
      const detected = consultantLayoutLayers(req.body.matrix, settings?.bookChainageSystem ?? "ours", Number(settings?.consultantOffsetM ?? 0));
      const picks = req.body.layers;
      if (!Array.isArray(picks) || !picks.length || picks.length > 100) fail("Tick at least one layer.");
      const chosen = picks.map((pick: any) => {
        const found = detected.find(layer => layer.key === String(pick.key));
        const layerName = String(pick.layerName ?? "").trim();
        if (!found || !layerName || layerName.length > 120 || !found.rows.length) fail("Choose a layer with rows and a valid name.");
        const rows = found.rows.map(row => validateDesignRow(row, "EXCEL"));
        if (new Set(rows.map(row => row.chainageOursKm)).size !== rows.length) fail(`Duplicate chainages in ${layerName}.`);
        return { layerName, rows };
      });
      if (new Set(chosen.map(row => row.layerName.toLowerCase())).size !== chosen.length) fail("Each selected layer needs a unique name.");
      const replace = req.body.replace === true;
      if (replace && !assertEdit(req, res, SECTION)) return;
      if (!replace) {
        for (const layer of chosen) {
          const old = await database.select().from(levelSheetDesignRows).where(and(eq(levelSheetDesignRows.siteId, siteId), eq(levelSheetDesignRows.layerName, layer.layerName)));
          if (old.some((candidate: any) => candidate.source !== "TYPED" && layer.rows.some(row => Math.abs(row.chainageOursKm - Number(candidate.chainageOursKm)) < 1e-9))
              && !assertEdit(req, res, SECTION)) return;
        }
      }
      const result = await database.transaction(async (tx: any) => {
        let imported = 0;
        let skipped = 0;
        for (const layer of chosen) {
          const oldRows = await tx.select().from(levelSheetDesignRows).where(and(eq(levelSheetDesignRows.siteId, siteId), eq(levelSheetDesignRows.layerName, layer.layerName)));
          if (replace) for (const old of oldRows) {
            await tx.delete(levelSheetDesignRows).where(eq(levelSheetDesignRows.id, old.id));
            await audit(tx, req, old.id, "design_import_replace_delete", old, null);
          }
          for (const row of layer.rows) {
            const old = replace ? null : oldRows.find((old: any) => Math.abs(Number(old.chainageOursKm) - row.chainageOursKm) < 1e-9);
            if (old?.source === "TYPED") { skipped++; continue; }
            const [saved] = old
              ? await tx.update(levelSheetDesignRows).set({ ...row, updatedByUserId: req.authUser.id, updatedAt: new Date() }).where(eq(levelSheetDesignRows.id, old.id)).returning()
              : await tx.insert(levelSheetDesignRows).values({ ...row, siteId, layerName: layer.layerName, createdByUserId: req.authUser.id, updatedByUserId: req.authUser.id }).returning();
            if (!saved) fail("A design row could not be saved.", 409);
            await audit(tx, req, saved.id, old ? "design_import_update" : "design_import_add", old ?? null, saved);
            imported++;
          }
        }
        return { imported, skipped };
      });
      res.json(result);
    } catch (error) { return errorResponse(res, error); }
  });

  app.post("/api/level-sheets/design/import", async (req: any, res) => {
    if (!assertCreate(req, res, SECTION)) return;
    try {
      const siteId = positiveId(req.body?.siteId, "site", false) as number;
      const layerName = String(req.body?.layerName ?? "").trim();
      if (!layerName || layerName.length > 120) fail("Enter a layer name.");
      await assertSiteAllowed(req, siteId);
      const [settings] = await database.select().from(levelSheetSiteSettings).where(eq(levelSheetSiteSettings.siteId, siteId)).limit(1);
      const system = (settings?.bookChainageSystem ?? "ours") as BookChainageSystem;
      const offset = Number(settings?.consultantOffsetM ?? 0);
      const rawRows = req.body?.rows;
      if (!Array.isArray(rawRows) || rawRows.length < 1 || rawRows.length > 5000) fail("Choose an Excel sheet with 1 to 5,000 rows.");
      const columns = req.body?.columns;
      if (!columns || ["chainage", "centreLevel", "crossfallLeft", "crossfallRight", "topWidthLeft", "topWidthRight"]
        .some(key => typeof columns[key] !== "string" || !columns[key])) {
        fail("Map chainage, centre level, both cross-falls and both top widths.");
      }
      const normalized = normalizeDesignImportRows(rawRows, columns, system, offset)
        .map(row => validateDesignRow(row, "EXCEL"));
      const normalizedChainages = normalized.map(row => row.chainageOursKm).sort((a, b) => a - b);
      for (let i = 1; i < normalizedChainages.length; i++) {
        if (Math.abs(normalizedChainages[i] - normalizedChainages[i - 1]) < 1e-9) fail("The Excel file has duplicate chainages.");
      }
      const replace = req.body?.replace === true;
      if (replace && !assertEdit(req, res, SECTION)) return;
      const result = await database.transaction(async (tx: any) => {
        const oldRows = await tx.select().from(levelSheetDesignRows).where(and(
          eq(levelSheetDesignRows.siteId, siteId), eq(levelSheetDesignRows.layerName, layerName),
        )).orderBy(asc(levelSheetDesignRows.chainageOursKm));
        if (replace) {
          for (const old of oldRows) {
            await tx.delete(levelSheetDesignRows).where(eq(levelSheetDesignRows.id, old.id));
            await audit(tx, req, old.id, "design_import_replace_delete", old, null);
          }
        }
        const imported: any[] = [];
        const skipped: number[] = [];
        for (const row of normalized) {
          const existing = replace ? null : oldRows.find((candidate: any) =>
            Math.abs(Number(candidate.chainageOursKm) - row.chainageOursKm) < 1e-9,
          );
          if (existing?.source === "TYPED") {
            skipped.push(row.chainageOursKm);
            continue;
          }
          const [saved] = existing
            ? await tx.update(levelSheetDesignRows).set({
                ...row, updatedByUserId: req.authUser.id, updatedAt: new Date(),
              }).where(eq(levelSheetDesignRows.id, existing.id)).returning()
            : await tx.insert(levelSheetDesignRows).values({
                ...row, siteId, layerName, createdByUserId: req.authUser.id, updatedByUserId: req.authUser.id,
              }).returning();
          if (!saved) fail(`Excel row at ${row.chainageOursKm} was not saved.`, 409);
          imported.push(saved);
          await audit(tx, req, saved.id, existing ? "design_import_update" : "design_import_add", existing ?? null, saved);
        }
        return { imported, skipped };
      });
      res.json(result);
    } catch (error) { return errorResponse(res, error); }
  });

  app.post("/api/level-sheets/design/derive", async (req: any, res) => {
    if (!assertCreate(req, res, SECTION)) return;
    try {
      const siteId = positiveId(req.body?.siteId, "site", false) as number;
      const sourceLayer = String(req.body?.sourceLayer ?? "").trim();
      const targetLayer = String(req.body?.targetLayer ?? "").trim();
      if (!sourceLayer || !targetLayer || sourceLayer === targetLayer) fail("Choose a source FRL layer and a different target layer.");
      await assertSiteAllowed(req, siteId);
      const depthM = numberValue(req.body?.depthM, "Depth", { min: 0, max: 20 }) as number;
      const replace = req.body?.replace === true;
      if (replace && !assertEdit(req, res, SECTION)) return;
      const sourceRows = await database.select().from(levelSheetDesignRows).where(and(
        eq(levelSheetDesignRows.siteId, siteId), eq(levelSheetDesignRows.layerName, sourceLayer),
      )).orderBy(asc(levelSheetDesignRows.chainageOursKm));
      if (!sourceRows.length) fail("No FRL design rows are saved for the selected layer.", 404);
      const derived = deriveDesignRowsFromFrl(sourceRows as DesignLevelRow[], depthM);
      const result = await database.transaction(async (tx: any) => {
        const oldRows = await tx.select().from(levelSheetDesignRows).where(and(
          eq(levelSheetDesignRows.siteId, siteId), eq(levelSheetDesignRows.layerName, targetLayer),
        ));
        if (oldRows.length && !replace) fail("The target layer already has design rows. Tick Replace target design first.", 409);
        for (const old of oldRows) {
          await tx.delete(levelSheetDesignRows).where(eq(levelSheetDesignRows.id, old.id));
          await audit(tx, req, old.id, "derive_replace_delete", old, null);
        }
        const created: any[] = [];
        for (const row of derived) {
          const { id: _ignoredId, ...derivedRow } = row;
          const [saved] = await tx.insert(levelSheetDesignRows).values({
            ...derivedRow, siteId, layerName: targetLayer,
            createdByUserId: req.authUser.id, updatedByUserId: req.authUser.id,
          }).returning();
          if (!saved) fail(`Derived design at ${row.chainageOursKm} was not saved.`, 409);
          created.push(saved);
          await audit(tx, req, saved.id, "design_derive_from_frl", null, saved, `Depth ${depthM} m from ${sourceLayer}`);
        }
        return { created };
      });
      res.json(result);
    } catch (error) { return errorResponse(res, error); }
  });

  app.post("/api/level-sheets", async (req: any, res) => {
    if (!assertCreate(req, res, SECTION)) return;
    try {
      const payload = await validateSheetPayload(req.body);
      await assertSiteAllowed(req, payload.siteId);
      const saved = await database.transaction(async (tx: any) => {
        const [row] = await tx.insert(levelSheets).values({
          siteId: payload.siteId, boqProjectId: payload.boqProjectId, boqItemId: payload.boqItemId,
          layerName: payload.layerName, sheetDate: payload.sheetDate, instrument: payload.instrument,
          basis: payload.basis,
          toleranceAboveMm: payload.toleranceAboveMm, toleranceBelowMm: payload.toleranceBelowMm,
          allowedClosingErrorMm: payload.allowedClosingErrorMm, readingMode: payload.readingMode,
          tbmName: payload.tbmName, tbmRl: payload.tbmRl, initialBackSight: payload.initialBackSight,
          closingForeSight: payload.closingForeSight, readings: payload.readings,
          closingTbmName: payload.closingTbmName, closingTbmRl: payload.closingTbmRl,
          status: payload.status, ...payload.attachment,
          createdByUserId: req.authUser.id, updatedByUserId: req.authUser.id,
        }).returning();
        if (!row) fail("Level sheet was not saved.", 500);
        if (payload.personnelIds.length) {
          await tx.insert(levelSheetStaff).values(payload.personnelIds.map((personnelId: number) => ({
            levelSheetId: row.id, personnelId,
          })));
        }
        await audit(tx, req, row.id, "create", null, { ...row, personnelIds: payload.personnelIds });
        return row;
      });
      res.status(201).json(await loadSheet(Number(saved.id)));
    } catch (error) { return errorResponse(res, error); }
  });

  app.patch("/api/level-sheets/site-settings", async (_req, res) => res.status(405).json({ message: "Use PUT to save site chainage settings." }));

  app.get("/api/level-sheets/:id", async (req: any, res) => {
    if (!assertView(req, res, SECTION)) return;
    try {
      const id = positiveId(req.params.id, "level sheet", false) as number;
      const row = await loadSheet(id);
      if (!row) return res.status(404).json({ message: "Level sheet not found." });
      await assertSiteAllowed(req, Number(row.siteId));
      res.json({ ...row, personnelIds: row.staff.map((person: any) => Number(person.id)) });
    } catch (error) { return errorResponse(res, error); }
  });

  app.patch("/api/level-sheets/:id", async (req: any, res) => {
    if (!assertEdit(req, res, SECTION)) return;
    try {
      const id = positiveId(req.params.id, "level sheet", false) as number;
      const current = await loadSheet(id);
      if (!current) return res.status(404).json({ message: "Level sheet not found." });
      await assertSiteAllowed(req, Number(current.siteId));
      const currentWithPeople = { ...current, personnelIds: current.staff.map((person: any) => Number(person.id)) };
      const payload = await validateSheetPayload(req.body, currentWithPeople);
      await assertSiteAllowed(req, payload.siteId);
      const saved = await database.transaction(async (tx: any) => {
        const [old] = await tx.select().from(levelSheets).where(eq(levelSheets.id, id)).for("update").limit(1);
        if (!old) fail("Level sheet no longer exists.", 404);
        const [row] = await tx.update(levelSheets).set({
          siteId: payload.siteId, boqProjectId: payload.boqProjectId, boqItemId: payload.boqItemId,
          layerName: payload.layerName, sheetDate: payload.sheetDate, instrument: payload.instrument,
          basis: payload.basis,
          toleranceAboveMm: payload.toleranceAboveMm, toleranceBelowMm: payload.toleranceBelowMm,
          allowedClosingErrorMm: payload.allowedClosingErrorMm, readingMode: payload.readingMode,
          tbmName: payload.tbmName, tbmRl: payload.tbmRl, initialBackSight: payload.initialBackSight,
          closingForeSight: payload.closingForeSight, readings: payload.readings, status: payload.status,
          closingTbmName: payload.closingTbmName, closingTbmRl: payload.closingTbmRl,
          ...payload.attachment, updatedByUserId: req.authUser.id, updatedAt: new Date(),
        }).where(eq(levelSheets.id, id)).returning();
        if (!row) fail("Level sheet was not updated.", 409);
        await tx.delete(levelSheetStaff).where(eq(levelSheetStaff.levelSheetId, id));
        if (payload.personnelIds.length) await tx.insert(levelSheetStaff).values(payload.personnelIds.map((personnelId: number) => ({
          levelSheetId: id, personnelId,
        })));
        await audit(tx, req, id, "edit", old, { ...row, personnelIds: payload.personnelIds });
        return row;
      });
      res.json(await loadSheet(Number(saved.id)));
    } catch (error) { return errorResponse(res, error); }
  });

  app.patch("/api/level-sheets/:id/check", async (req: any, res) => {
    if (!assertApprove(req, res, SECTION)) return;
    try {
      const id = positiveId(req.params.id, "level sheet", false) as number;
      const current = await loadSheet(id);
      if (!current) return res.status(404).json({ message: "Level sheet not found." });
      await assertSiteAllowed(req, Number(current.siteId));
      const checkedByType = req.body?.checkedByType;
      if (!["not_checked", "department", "consultant"].includes(checkedByType)) fail("Choose who checked the level sheet.");
      const unchecked = checkedByType === "not_checked";
      const checkedByName = unchecked ? null : String(req.body?.checkedByName ?? "").trim().slice(0, 160) || null;
      if (!unchecked && !checkedByName) fail("Enter the checker name.");
      const checkedByDesignation = unchecked ? null : String(req.body?.checkedByDesignation ?? "").trim().slice(0, 160) || null;
      const checkedDate = unchecked ? null : validateDate(req.body?.checkedDate, "check date");
      const rawCheckedPoints = unchecked ? [] : req.body?.checkedPoints;
      if (!Array.isArray(rawCheckedPoints) || rawCheckedPoints.length > MAX_READINGS * MAX_POINTS_PER_ROW) {
        fail("Check points must be a valid list.");
      }
      const validPoints = new Set<string>();
      for (const reading of current.readings ?? []) {
        for (const point of reading.points ?? []) {
          if (point.columnKey) validPoints.add(`${Number(reading.chainageOursKm)}|${String(point.columnKey)}`);
        }
      }
      const seenPoints = new Set<string>();
      const checkedPoints = rawCheckedPoints.map((point: any) => {
        const chainageOursKm = numberValue(point?.chainageOursKm, "Check point chainage", { min: -100, max: 1000 });
        const columnKey = String(point?.columnKey ?? "").trim().slice(0, 100);
        const identity = `${chainageOursKm}|${columnKey}`;
        if (!columnKey || !validPoints.has(identity)) fail("A checked point does not match this sheet's readings.");
        if (seenPoints.has(identity)) fail("A checked point was listed more than once.");
        seenPoints.add(identity);
        if (typeof point?.checked !== "boolean") fail("Each check point must say whether it was checked.");
        const checkedRl = numberValue(point?.checkedRl, "Checked RL", { nullable: true, min: -10000, max: 10000 });
        return { chainageOursKm, columnKey, checked: point.checked, checkedRl };
      });
      const attachment = Object.hasOwn(req.body, "attachment") ? safeAttachment(req.body.attachment) : {
        fileName: current.fileName, objectPath: current.objectPath, mimeType: current.mimeType, fileSize: current.fileSize,
      };
      const saved = await database.transaction(async (tx: any) => {
        const [row] = await tx.update(levelSheets).set({
          checkedByType, checkedByName, checkedByDesignation, checkedDate, checkedPoints,
          ...attachment, updatedByUserId: req.authUser.id, updatedAt: new Date(),
        }).where(eq(levelSheets.id, id)).returning();
        if (!row) fail("Check details were not saved.", 409);
        await audit(tx, req, id, "check_and_sign", current, row);
        return row;
      });
      res.json(await loadSheet(Number(saved.id)));
    } catch (error) { return errorResponse(res, error); }
  });
}
