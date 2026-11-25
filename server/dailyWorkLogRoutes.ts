import type { Express, Request, Response } from "express";
import { and, asc, eq, inArray, isNull, or } from "drizzle-orm";
import {
  dailyWorkEntries,
  dprSiteActivities,
  dprSiteActivityStaff,
  dprs,
  officeVisits,
  personnel,
  sites,
} from "@shared/schema";
import { businessToday } from "@shared/planOutcome";
import { db } from "./db";
import { storage } from "./storage";
import { assertCreate, assertDelete, assertEdit, assertView, currentUserName, hasSectionAccess } from "./auth-routes";

const SECTION = "daily_work_log" as const;
const WORK_PLACES = ["Site office", "Plant office", "Head office"] as const;
const WORK_TYPES = [
  "MB entry", "RA bill preparation", "Drawings / cross sections", "Reports",
  "Letters / correspondence", "Stores / records", "Accounts", "Purchase", "Other",
] as const;
const VISIT_PLACES = ["HLC plant", "Head office"] as const;
const VISIT_PURPOSES = ["Inspection", "Meeting", "Audit", "Other"] as const;
const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024;

function sendError(res: Response, error: any) {
  const status = Number(error?.status);
  return res.status(status >= 400 && status < 600 ? status : 500)
    .json({ message: error?.message || "The daily record could not be saved." });
}

function isDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function yesterdayOf(date: string) {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() - 1);
  return value.toISOString().slice(0, 10);
}

function mayCreateDate(date: string) {
  const today = businessToday();
  return date === today || date === yesterdayOf(today);
}

function cleanText(value: unknown, max: number, required = false): string | null {
  if (typeof value !== "string") {
    if (required) throw Object.assign(new Error("Complete the required text field."), { status: 422 });
    return null;
  }
  const trimmed = value.trim();
  if (required && !trimmed) throw Object.assign(new Error("Complete the required text field."), { status: 422 });
  if (trimmed.length > max) throw Object.assign(new Error(`Text must be no more than ${max} characters.`), { status: 422 });
  return trimmed || null;
}

function validateAttachment(value: any) {
  if (value == null) return { fileName: null, objectPath: null, mimeType: null, fileSize: null };
  const mimeType = typeof value.mimeType === "string" ? value.mimeType.toLowerCase() : "";
  const fileName = cleanText(value.fileName, 255, true);
  const objectPath = typeof value.objectPath === "string" ? value.objectPath : "";
  const fileSize = value.fileSize == null ? null : Number(value.fileSize);
  if (!objectPath.startsWith("/objects/") ||
      (!mimeType.startsWith("image/") && mimeType !== "application/pdf") ||
      (fileSize != null && (!Number.isInteger(fileSize) || fileSize < 0 || fileSize > MAX_ATTACHMENT_BYTES))) {
    throw Object.assign(new Error("Choose an image or PDF up to 15 MB."), { status: 422 });
  }
  return { fileName, objectPath, mimeType, fileSize };
}

function validateWorkBody(body: any) {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw Object.assign(new Error("Invalid work entry."), { status: 422 });
  if (!isDate(body.workDate)) throw Object.assign(new Error("Choose a valid date."), { status: 422 });
  if (!WORK_PLACES.includes(body.place)) throw Object.assign(new Error("Choose where the work was done."), { status: 422 });
  if (!WORK_TYPES.includes(body.workType)) throw Object.assign(new Error("Choose a work type."), { status: 422 });
  const durationMinutes = body.durationMinutes == null || body.durationMinutes === ""
    ? null : Number(body.durationMinutes);
  if (durationMinutes != null && (!Number.isInteger(durationMinutes) || durationMinutes < 1 || durationMinutes > 1440)) {
    throw Object.assign(new Error("Duration must be between 0:01 and 24:00."), { status: 422 });
  }
  const siteId = body.siteId == null || body.siteId === "" ? null : Number(body.siteId);
  if (siteId != null && (!Number.isInteger(siteId) || siteId <= 0)) {
    throw Object.assign(new Error("Choose a valid site."), { status: 422 });
  }
  return {
    workDate: body.workDate,
    place: body.place,
    workType: body.workType,
    siteId,
    durationMinutes,
    details: cleanText(body.details, 1000, true)!,
  };
}

function validateVisitBody(body: any) {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw Object.assign(new Error("Invalid visit record."), { status: 422 });
  if (!isDate(body.visitDate)) throw Object.assign(new Error("Choose a valid date."), { status: 422 });
  if (!VISIT_PLACES.includes(body.place)) throw Object.assign(new Error("Site visits are recorded in the DPR, not here."), { status: 422 });
  if (!VISIT_PURPOSES.includes(body.purpose)) throw Object.assign(new Error("Choose a visit purpose."), { status: 422 });
  return {
    visitDate: body.visitDate,
    place: body.place,
    visitorName: cleanText(body.visitorName, 160, true)!,
    visitorDesignation: cleanText(body.visitorDesignation, 160),
    organisation: cleanText(body.organisation, 160),
    purpose: body.purpose,
    pointsDiscussed: cleanText(body.pointsDiscussed, 2000, true)!,
    ...validateAttachment(body.attachment),
  };
}

function normalizeName(value: unknown) {
  return String(value ?? "").trim().replace(/\s+/g, " ").toLocaleUpperCase("en");
}

function dprActivityTitle(row: any) {
  return row.testName || row.officeWork || row.levelsKind || row.visitorName ||
    row.note || row.activityType;
}

function dprActivityDetails(row: any) {
  const parts: string[] = [];
  if (row.chainageFrom != null || row.chainageTo != null) {
    parts.push(`Chainage ${row.chainageFrom ?? "—"}${row.chainageTo != null ? ` to ${row.chainageTo}` : ""}`);
  }
  if (row.layer) parts.push(row.layer);
  if (row.side) parts.push(row.side);
  if (row.resultValue || row.requiredValue) parts.push(`Result ${row.resultValue ?? "—"} · Required ${row.requiredValue ?? "—"}`);
  if (row.deptPerson) parts.push(`Department person: ${row.deptPerson}`);
  if (row.visitorDesignation) parts.push(row.visitorDesignation);
  if (row.note) parts.push(row.note);
  return parts.join(" · ");
}

export function registerDailyWorkLogRoutes(
  app: Express,
  dependencies: { db?: any; storage?: any } = {},
) {
  const database = (dependencies.db ?? db) as typeof db;
  const persistence = dependencies.storage ?? storage;
  async function assertAllowedSite(req: Request, siteId: number | null) {
    if (siteId == null) return;
    const allowedIds = await persistence.getUserPermittedSiteIds(
      req.authUser!.id,
      !!req.authFeatureAccess?.rolesConfigured,
    );
    if (allowedIds !== null && !allowedIds.includes(siteId)) {
      throw Object.assign(new Error("You do not have access to the selected site."), { status: 403 });
    }
    const [site] = await database.select({ id: sites.id }).from(sites).where(eq(sites.id, siteId)).limit(1);
    if (!site) throw Object.assign(new Error("The selected site no longer exists."), { status: 422 });
  }

  async function canSeeTeam(req: Request) {
    return !!req.authUser?.isOwner || hasSectionAccess(req, [SECTION], "view_reports");
  }

  app.get("/api/daily-work-log/context", async (req, res) => {
    if (!assertView(req, res, SECTION)) return;
    const user = req.authUser!;
    if (!user.personnelId) {
      return res.json({ linked: false, teamViewAllowed: await canSeeTeam(req), sites: [] });
    }
    try {
      const permitted = await persistence.getUserPermittedSiteIds(user.id, !!req.authFeatureAccess?.rolesConfigured);
      const siteRows = await database.select({ id: sites.id, name: sites.name })
        .from(sites).where(eq(sites.isActive, 1)).orderBy(asc(sites.name));
      const visibleSites = permitted === null ? siteRows : siteRows.filter(site => permitted.includes(site.id));
      const [person] = await database.select({ name: personnel.name }).from(personnel)
        .where(eq(personnel.id, user.personnelId)).limit(1);
      return res.json({
        linked: !!person,
        personName: person?.name ?? null,
        teamViewAllowed: await canSeeTeam(req),
        sites: visibleSites,
      });
    } catch (error) {
      return sendError(res, error);
    }
  });

  app.get("/api/daily-work-log", async (req, res) => {
    if (!assertView(req, res, SECTION)) return;
    const user = req.authUser!;
    const date = req.query.date;
    if (!isDate(date)) return res.status(400).json({ message: "Choose a valid date." });
    const team = req.query.view === "team";
    if (team && !(await canSeeTeam(req))) return res.status(403).json({ message: "You do not have permission to see everyone’s day." });
    if (!user.personnelId && !team) {
      return res.status(409).json({
        message: "Your login is not linked to a person in the Personnel master — ask the Owner",
        linked: false,
      });
    }
    const requestedPersonId = req.query.personnelId == null || req.query.personnelId === ""
      ? null : Number(req.query.personnelId);
    if (requestedPersonId != null && (!team || !Number.isInteger(requestedPersonId) || requestedPersonId <= 0)) {
      return res.status(400).json({ message: "Choose a valid person filter." });
    }
    try {
      const workConditions = [eq(dailyWorkEntries.workDate, date)];
      const visitConditions = [eq(officeVisits.visitDate, date)];
      if (!team) {
        workConditions.push(eq(dailyWorkEntries.createdByUserId, user.id));
        visitConditions.push(eq(officeVisits.recordedByUserId, user.id));
      } else if (requestedPersonId != null) {
        workConditions.push(eq(dailyWorkEntries.personnelId, requestedPersonId));
        visitConditions.push(eq(officeVisits.recordedByPersonnelId, requestedPersonId));
      }
      const [workRows, visitRows] = await Promise.all([
        user.personnelId ? database.select({
          id: dailyWorkEntries.id, personnelId: dailyWorkEntries.personnelId,
          personName: personnel.name, createdByUserId: dailyWorkEntries.createdByUserId,
          workDate: dailyWorkEntries.workDate, place: dailyWorkEntries.place,
          workType: dailyWorkEntries.workType, siteId: dailyWorkEntries.siteId,
          siteName: sites.name, durationMinutes: dailyWorkEntries.durationMinutes,
          details: dailyWorkEntries.details, updatedAt: dailyWorkEntries.updatedAt,
        }).from(dailyWorkEntries)
          .innerJoin(personnel, eq(personnel.id, dailyWorkEntries.personnelId))
          .leftJoin(sites, eq(sites.id, dailyWorkEntries.siteId))
          .where(and(...workConditions)).orderBy(asc(dailyWorkEntries.createdAt), asc(dailyWorkEntries.id))
          : Promise.resolve([]),
        database.select({
          id: officeVisits.id, recordedByPersonnelId: officeVisits.recordedByPersonnelId,
          personName: personnel.name, recordedByUserId: officeVisits.recordedByUserId,
          visitDate: officeVisits.visitDate, place: officeVisits.place,
          visitorName: officeVisits.visitorName, visitorDesignation: officeVisits.visitorDesignation,
          organisation: officeVisits.organisation, purpose: officeVisits.purpose,
          pointsDiscussed: officeVisits.pointsDiscussed, fileName: officeVisits.fileName,
          objectPath: officeVisits.objectPath, mimeType: officeVisits.mimeType,
          fileSize: officeVisits.fileSize, updatedAt: officeVisits.updatedAt,
        }).from(officeVisits).innerJoin(personnel, eq(personnel.id, officeVisits.recordedByPersonnelId))
          .where(and(...visitConditions)).orderBy(asc(officeVisits.createdAt), asc(officeVisits.id)),
      ]);
      const permittedForWork = await persistence.getUserPermittedSiteIds(
        user.id,
        !!req.authFeatureAccess?.rolesConfigured,
      );
      const scopedWorkRows = permittedForWork === null
        ? workRows
        : workRows.filter(row => row.siteId == null || permittedForWork.includes(row.siteId));

      const personIds = team
        ? Array.from(new Set([...scopedWorkRows.map(row => row.personnelId), ...visitRows.map(row => row.recordedByPersonnelId)]))
        : user.personnelId ? [Number(user.personnelId)] : [];
      let dprRows: any[] = [];
      if (team || personIds.length) {
        const permitted = permittedForWork;
        const allowedSiteNames = permitted === null ? null : await database.select({ name: sites.name })
          .from(sites).where(inArray(sites.id, permitted));
        const siteNameSet = allowedSiteNames === null ? null : new Set(allowedSiteNames.map(site => normalizeName(site.name)));
        const dprConditions = [
          eq(dprs.date, date),
          eq(dprs.dprStatus, "submitted"),
          or(eq(dprs.isDeleted, false), isNull(dprs.isDeleted))!,
          or(eq(dprs.isCancelled, false), isNull(dprs.isCancelled))!,
          or(eq(dprs.isSuperseded, false), isNull(dprs.isSuperseded))!,
        ];
        if (!team) dprConditions.push(eq(dprSiteActivityStaff.personnelId, Number(user.personnelId)));
        else if (requestedPersonId != null) dprConditions.push(eq(dprSiteActivityStaff.personnelId, requestedPersonId));
        const raw = permitted !== null && permitted.length === 0 ? [] : await database.select({
          dprId: dprs.id, date: dprs.date, site: dprs.site, activityId: dprSiteActivities.id,
          activityType: dprSiteActivities.activityType, chainageFrom: dprSiteActivities.chainageFrom,
          chainageTo: dprSiteActivities.chainageTo, side: dprSiteActivities.side,
          layer: dprSiteActivities.layer, levelsKind: dprSiteActivities.levelsKind,
          deptPerson: dprSiteActivities.deptPerson, testName: dprSiteActivities.testName,
          testPlace: dprSiteActivities.testPlace, resultValue: dprSiteActivities.resultValue,
          requiredValue: dprSiteActivities.requiredValue, resultPass: dprSiteActivities.resultPass,
          officeWork: dprSiteActivities.officeWork, visitorName: dprSiteActivities.visitorName,
          visitorDesignation: dprSiteActivities.visitorDesignation, note: dprSiteActivities.note,
          staffPersonnelId: dprSiteActivityStaff.personnelId, personName: personnel.name,
        }).from(dprSiteActivityStaff)
          .innerJoin(dprSiteActivities, eq(dprSiteActivities.id, dprSiteActivityStaff.siteActivityId))
          .innerJoin(personnel, eq(personnel.id, dprSiteActivityStaff.personnelId))
          .innerJoin(dprs, eq(dprs.id, dprSiteActivities.dprId))
          .where(and(...dprConditions))
          .orderBy(asc(dprs.site), asc(dprSiteActivities.sortOrder), asc(dprSiteActivities.id));
        dprRows = raw.filter(row => siteNameSet === null || siteNameSet.has(normalizeName(row.site)))
          .map(row => ({
            id: row.activityId, dprId: row.dprId, date: row.date, site: row.site,
            personnelId: row.staffPersonnelId, personName: row.personName, type: row.activityType,
            title: dprActivityTitle(row), details: dprActivityDetails(row),
            resultPass: row.resultPass, href: `/site/edit/${row.dprId}`,
            place: `Site: ${row.site}`,
          }));
      }
      const visibleWork = workRows.filter(row =>
        (permittedForWork === null || row.siteId == null || permittedForWork.includes(row.siteId)) &&
        (!team || requestedPersonId == null || row.personnelId === requestedPersonId) &&
        (!team || !req.query.place || req.query.place === row.place),
      );
      const visibleVisits = visitRows.filter(row =>
        (!team || requestedPersonId == null || row.recordedByPersonnelId === requestedPersonId) &&
        (!team || !req.query.place || req.query.place === row.place),
      );
      const visibleDprActivities = dprRows.filter(row => !team || !req.query.place || req.query.place === row.place);
      const personName = scopedWorkRows[0]?.personName ?? visitRows[0]?.personName ?? null;
      const formattedVisits = visibleVisits.map(row => ({
        ...row,
        unlinked: false,
        attachment: row.objectPath ? {
          fileName: row.fileName, objectPath: row.objectPath,
          mimeType: row.mimeType, fileSize: row.fileSize,
        } : null,
      }));
      return res.json({
        date, view: team ? "team" : "personal", personName,
        workEntries: visibleWork,
        visits: formattedVisits,
        dprActivities: visibleDprActivities,
        totalDurationMinutes: visibleWork.reduce((sum, row) => sum + (row.durationMinutes ?? 0), 0),
      });
    } catch (error) {
      return sendError(res, error);
    }
  });

  app.post("/api/daily-work-log/entries", async (req, res) => {
    if (!assertCreate(req, res, SECTION)) return;
    const user = req.authUser!;
    if (!user.personnelId) return res.status(409).json({ message: "Your login is not linked to a person in the Personnel master — ask the Owner" });
    try {
      const values = validateWorkBody(req.body);
      if (!mayCreateDate(values.workDate)) return res.status(403).json({ message: "You can add entries only for today or yesterday." });
      await assertAllowedSite(req, values.siteId);
      const row = await database.transaction(async tx => {
        const [created] = await tx.insert(dailyWorkEntries).values({
          ...values, personnelId: user.personnelId!, createdByUserId: user.id,
        }).returning();
        await persistence.logAudit({
          module: "daily_work_log", transactionId: created.id, action: "create",
          userId: user.id, userName: currentUserName(req), userRole: user.isOwner ? "owner" : user.businessRole ?? null,
          newValues: values,
        }, tx);
        return created;
      });
      return res.status(201).json(row);
    } catch (error) { return sendError(res, error); }
  });

  app.patch("/api/daily-work-log/entries/:id", async (req, res) => {
    if (!assertEdit(req, res, SECTION)) return;
    const user = req.authUser!;
    if (!user.personnelId) return res.status(409).json({ message: "Your login is not linked to a person in the Personnel master — ask the Owner" });
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ message: "Invalid work entry." });
    try {
      const values = validateWorkBody(req.body);
      await assertAllowedSite(req, values.siteId);
      const [existing] = await database.select().from(dailyWorkEntries).where(eq(dailyWorkEntries.id, id)).limit(1);
      if (!existing) return res.status(404).json({ message: "Work entry not found." });
      await assertAllowedSite(req, existing.siteId);
      const updated = await database.transaction(async tx => {
        const [old] = await tx.select().from(dailyWorkEntries).where(eq(dailyWorkEntries.id, id)).limit(1);
        if (!old) throw Object.assign(new Error("Work entry not found."), { status: 404 });
        if (old.siteId !== existing.siteId) {
          throw Object.assign(new Error("Work entry changed while you were editing it. Reload and try again."), { status: 409 });
        }
        const owns = old.createdByUserId === user.id;
        if (!user.isOwner && (!owns || !mayCreateDate(old.workDate) || !mayCreateDate(values.workDate))) {
          throw Object.assign(new Error("You can edit your own entries for today or yesterday only."), { status: 403 });
        }
        const [row] = await tx.update(dailyWorkEntries).set({ ...values, updatedAt: new Date() })
          .where(eq(dailyWorkEntries.id, id)).returning();
        if (!row) throw Object.assign(new Error("Work entry could not be updated."), { status: 409 });
        await persistence.logAudit({
          module: "daily_work_log", transactionId: id, action: "edit",
          userId: user.id, userName: currentUserName(req), userRole: user.isOwner ? "owner" : user.businessRole ?? null,
          oldValues: old, newValues: values,
        }, tx);
        return row;
      });
      return res.json(updated);
    } catch (error) { return sendError(res, error); }
  });

  app.delete("/api/daily-work-log/entries/:id", async (req, res) => {
    if (!assertDelete(req, res, SECTION)) return;
    const user = req.authUser!;
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ message: "Invalid work entry." });
    try {
      const [existing] = await database.select().from(dailyWorkEntries).where(eq(dailyWorkEntries.id, id)).limit(1);
      if (!existing) return res.status(404).json({ message: "Work entry not found." });
      await assertAllowedSite(req, existing.siteId);
      const deleted = await database.transaction(async tx => {
        const [old] = await tx.select().from(dailyWorkEntries).where(eq(dailyWorkEntries.id, id)).limit(1);
        if (!old) throw Object.assign(new Error("Work entry not found."), { status: 404 });
        if (old.siteId !== existing.siteId) {
          throw Object.assign(new Error("Work entry changed while you were editing it. Reload and try again."), { status: 409 });
        }
        if (!user.isOwner && (old.createdByUserId !== user.id || !mayCreateDate(old.workDate))) {
          throw Object.assign(new Error("You can delete your own entries for today or yesterday only."), { status: 403 });
        }
        const [row] = await tx.delete(dailyWorkEntries).where(eq(dailyWorkEntries.id, id)).returning();
        await persistence.logAudit({
          module: "daily_work_log", transactionId: id, action: "delete",
          userId: user.id, userName: currentUserName(req), userRole: user.isOwner ? "owner" : user.businessRole ?? null,
          oldValues: old, newValues: null,
        }, tx);
        return row;
      });
      return res.json({ ok: true, id: deleted?.id });
    } catch (error) { return sendError(res, error); }
  });

  app.post("/api/daily-work-log/visits", async (req, res) => {
    if (!assertCreate(req, res, SECTION)) return;
    const user = req.authUser!;
    if (!user.personnelId) return res.status(409).json({ message: "Your login is not linked to a person in the Personnel master — ask the Owner" });
    try {
      const values = validateVisitBody(req.body);
      if (!mayCreateDate(values.visitDate)) return res.status(403).json({ message: "You can add visits only for today or yesterday." });
      const row = await database.transaction(async tx => {
        const [created] = await tx.insert(officeVisits).values({
          ...values, recordedByPersonnelId: user.personnelId!, recordedByUserId: user.id,
        }).returning();
        await persistence.logAudit({
          module: "office_visit", transactionId: created.id, action: "create",
          userId: user.id, userName: currentUserName(req), userRole: user.isOwner ? "owner" : user.businessRole ?? null,
          newValues: values,
        }, tx);
        return created;
      });
      return res.status(201).json(row);
    } catch (error) { return sendError(res, error); }
  });

  app.patch("/api/daily-work-log/visits/:id", async (req, res) => {
    if (!assertEdit(req, res, SECTION)) return;
    const user = req.authUser!;
    if (!user.personnelId) return res.status(403).json({ message: "A Personnel link is required to edit visits." });
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ message: "Invalid visit." });
    try {
      const values = validateVisitBody(req.body);
      const row = await database.transaction(async tx => {
        const [old] = await tx.select().from(officeVisits).where(eq(officeVisits.id, id)).limit(1);
        if (!old) throw Object.assign(new Error("Visit not found."), { status: 404 });
        if (!user.isOwner && (old.recordedByUserId !== user.id || !mayCreateDate(old.visitDate) || !mayCreateDate(values.visitDate))) {
          throw Object.assign(new Error("You can edit visits you recorded for today or yesterday only."), { status: 403 });
        }
        const [updated] = await tx.update(officeVisits).set({ ...values, updatedAt: new Date() })
          .where(eq(officeVisits.id, id)).returning();
        if (!updated) throw Object.assign(new Error("Visit could not be updated."), { status: 409 });
        await persistence.logAudit({
          module: "office_visit", transactionId: id, action: "edit",
          userId: user.id, userName: currentUserName(req), userRole: user.isOwner ? "owner" : user.businessRole ?? null,
          oldValues: old, newValues: values,
        }, tx);
        return updated;
      });
      return res.json(row);
    } catch (error) { return sendError(res, error); }
  });

  app.delete("/api/daily-work-log/visits/:id", async (req, res) => {
    if (!assertDelete(req, res, SECTION)) return;
    const user = req.authUser!;
    if (!user.personnelId) return res.status(403).json({ message: "A Personnel link is required to delete visits." });
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ message: "Invalid visit." });
    try {
      await database.transaction(async tx => {
        const [old] = await tx.select().from(officeVisits).where(eq(officeVisits.id, id)).limit(1);
        if (!old) throw Object.assign(new Error("Visit not found."), { status: 404 });
        if (!user.isOwner && (old.recordedByUserId !== user.id || !mayCreateDate(old.visitDate))) {
          throw Object.assign(new Error("You can delete visits you recorded for today or yesterday only."), { status: 403 });
        }
        await tx.delete(officeVisits).where(eq(officeVisits.id, id));
        await persistence.logAudit({
          module: "office_visit", transactionId: id, action: "delete",
          userId: user.id, userName: currentUserName(req), userRole: user.isOwner ? "owner" : user.businessRole ?? null,
          oldValues: old, newValues: null,
        }, tx);
      });
      return res.json({ ok: true, id });
    } catch (error) { return sendError(res, error); }
  });
}
