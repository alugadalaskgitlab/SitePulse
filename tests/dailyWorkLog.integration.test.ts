import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { getTableConfig, PgDialect, PgTable } from "drizzle-orm/pg-core";
import { is, SQL } from "drizzle-orm";
import express from "express";
import request from "supertest";
import * as schema from "../shared/schema";
import { businessToday } from "../shared/planOutcome";
import { fullMatrix, permissionActionLabel, PERMISSION_GROUPS } from "../shared/permissions";

const state = vi.hoisted(() => ({
  db: null as any,
  storage: null as any,
  user: null as any,
  permissions: null as any,
  permittedSiteIds: null as number[] | null,
}));

vi.mock("../server/db", () => ({ get db() { return state.db; }, pool: {} }));
vi.mock("../server/storage", () => ({ get storage() { return state.storage; } }));
vi.mock("../server/auth-routes", () => {
  const allowed = (req: any, action: string) =>
    !!req.authUser?.isOwner || !!req.authPermissions?.daily_work_log?.[action];
  const assert = (action: string) => (req: any, res: any, section: string) => {
    if (allowed(req, action)) return true;
    res.status(req.authUser ? 403 : 401).json({ error: "forbidden", section, action });
    return false;
  };
  return {
    assertView: assert("view"),
    assertCreate: assert("create"),
    assertEdit: assert("edit"),
    assertDelete: assert("delete"),
    hasSectionAccess: (req: any, _sections: string[], action: string) => allowed(req, action),
    currentUserName: (req: any) => req.authUser?.fullName ?? "Fixture user",
  };
});

let pg: PGlite;
let app: express.Express;
let dailyRoutes: typeof import("../server/dailyWorkLogRoutes").registerDailyWorkLogRoutes;
let today: string;
let yesterday: string;
let older: string;
let siteId: number;
let personnelA: number;
let personnelB: number;
let activityId: number;
let dprId: number;

async function createFixtureTable(table: PgTable, dialect: PgDialect) {
  const config = getTableConfig(table);
  const columns = config.columns.map(column => {
    let definition = `"${column.name}" ${column.getSQLType()}`;
    if (column.primary) definition += " PRIMARY KEY";
    else if (column.isUnique) definition += " UNIQUE";
    if (column.notNull) definition += " NOT NULL";
    if (column.default !== undefined) {
      const value = column.default;
      definition += " DEFAULT " + (is(value, SQL) ? dialect.sqlToQuery(value).sql
        : Array.isArray(value) && column.getSQLType().endsWith("[]") ? "'{}'"
        : typeof value === "string" ? `'${value.replace(/'/g, "''")}'`
        : typeof value === "object" ? `'${JSON.stringify(value)}'`
        : String(value));
    }
    return definition;
  });
  await pg.exec(`CREATE TABLE "${config.name}" (${columns.join(", ")})`);
}

const grants = (overrides: Record<string, boolean> = {}) => ({
  view: true, create: true, edit: true, delete: true, view_reports: false, ...overrides,
});

beforeAll(async () => {
  today = businessToday();
  const y = new Date(`${today}T00:00:00.000Z`);
  y.setUTCDate(y.getUTCDate() - 1);
  yesterday = y.toISOString().slice(0, 10);
  y.setUTCDate(y.getUTCDate() - 8);
  older = y.toISOString().slice(0, 10);

  pg = new PGlite();
  const dialect = new PgDialect();
  for (const table of [
    schema.personnel, schema.users, schema.sites, schema.dprs, schema.dprSiteActivities,
    schema.dprSiteActivityStaff, schema.auditLogs,
  ]) await createFixtureTable(table, dialect);
  await pg.exec(readFileSync(new URL("../migrations/0069_daily_work_log_and_visits.sql", import.meta.url), "utf8"));
  state.db = drizzle(pg, { schema });
  state.storage = {
    getUserPermittedSiteIds: async () => state.permittedSiteIds,
    logAudit: async (entry: any, executor: any) => {
      const [row] = await executor.insert(schema.auditLogs).values(entry).returning();
      return row;
    },
  };
  const [personA] = await state.db.insert(schema.personnel).values({ name: "ALPHA ENGINEER", role: "Engineer", isActive: 1 }).returning();
  const [personB] = await state.db.insert(schema.personnel).values({ name: "BETA ENGINEER", role: "Engineer", isActive: 1 }).returning();
  personnelA = personA.id;
  personnelB = personB.id;
  await state.db.insert(schema.users).values([
    { id: 1, fullName: "ALPHA USER", email: "alpha@example.test", passwordHash: "fixture", personnelId: personnelA },
    { id: 2, fullName: "BETA USER", email: "beta@example.test", passwordHash: "fixture", personnelId: personnelB },
    { id: 3, fullName: "UNLINKED USER", email: "unlinked@example.test", passwordHash: "fixture" },
  ]);
  const [site] = await state.db.insert(schema.sites).values({ name: "FIXTURE SITE", isActive: 1 }).returning();
  siteId = site.id;
  const [dpr] = await state.db.insert(schema.dprs as any).values({
    date: today, site: "FIXTURE SITE", engineer: "BETA ENGINEER",
    dprStatus: "submitted", isDeleted: false, isCancelled: false, isSuperseded: false,
  }).returning();
  dprId = dpr.id;
  const [activity] = await state.db.insert(schema.dprSiteActivities).values({
    dprId, activityType: "test", sortOrder: 0, testName: "Field density",
    resultValue: "97.8", requiredValue: "97", resultPass: true,
  }).returning();
  activityId = activity.id;
  await state.db.insert(schema.dprSiteActivityStaff).values({ siteActivityId: activityId, personnelId: personnelB });

  const { registerDailyWorkLogRoutes } = await import("../server/dailyWorkLogRoutes");
  dailyRoutes = registerDailyWorkLogRoutes;
  app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    req.authUser = state.user;
    req.authPermissions = { daily_work_log: state.permissions };
    req.authFeatureAccess = { rolesConfigured: true };
    next();
  });
  dailyRoutes(app, { db: state.db, storage: state.storage });
}, 60_000);

afterAll(async () => { await pg?.close(); });

beforeEach(() => {
  state.user = {
    id: 1, fullName: "ALPHA USER", isOwner: false, isAdmin: false,
    personnelId: personnelA, businessRole: "Engineer",
  };
  state.permissions = grants();
  state.permittedSiteIds = [siteId];
});

describe("DAY-01 daily work log and visits", () => {
  it("keeps the new screen and team view off in default permission matrices", () => {
    expect(Object.values(fullMatrix().daily_work_log).some(Boolean)).toBe(false);
    expect(permissionActionLabel("daily_work_log", "view_reports")).toBe("See everyone’s day");
    expect(PERMISSION_GROUPS.find(group => group.id === "site")?.sections).toContain("daily_work_log");
  });

  it("links the signed-in person, saves/edits/deletes own entries and audits every change", async () => {
    const context = await request(app).get("/api/daily-work-log/context").expect(200);
    expect(context.body).toMatchObject({ linked: true, personName: "ALPHA ENGINEER" });

    const created = await request(app).post("/api/daily-work-log/entries").send({
      workDate: today, place: "Site office", workType: "MB entry", siteId,
      durationMinutes: 90, details: "Updated the synthetic measurement book.",
    }).expect(201);
    const id = created.body.id;
    expect(created.body.personnelId).toBe(personnelA);
    expect((await request(app).get(`/api/daily-work-log?date=${today}`)).body.workEntries).toHaveLength(1);

    await request(app).patch(`/api/daily-work-log/entries/${id}`).send({
      workDate: today, place: "Site office", workType: "Reports", siteId,
      durationMinutes: 60, details: "Edited fixture entry.",
    }).expect(200);
    const audit = await state.db.select().from(schema.auditLogs);
    expect(audit.map((row: any) => row.action)).toEqual(["create", "edit"]);

    await request(app).delete(`/api/daily-work-log/entries/${id}`).expect(200);
    expect((await state.db.select().from(schema.dailyWorkEntries)).length).toBe(0);
    expect((await state.db.select().from(schema.auditLogs)).map((row: any) => row.action))
      .toEqual(["create", "edit", "delete"]);
  }, 30_000);

  it("allows yesterday, blocks older self-edits, rejects site visits, and accepts an attached plant visit", async () => {
    const yesterdayRow = await request(app).post("/api/daily-work-log/entries").send({
      workDate: yesterday, place: "Head office", workType: "Accounts", details: "Prior-day fixture.",
    }).expect(201);
    await request(app).post("/api/daily-work-log/entries").send({
      workDate: older, place: "Head office", workType: "Accounts", details: "Too old.",
    }).expect(403);
    await request(app).patch(`/api/daily-work-log/entries/${yesterdayRow.body.id}`).send({
      workDate: older, place: "Head office", workType: "Accounts", details: "Moved old.",
    }).expect(403);

    await request(app).post("/api/daily-work-log/visits").send({
      visitDate: today, place: "Site visit", visitorName: "VISITOR",
      purpose: "Inspection", pointsDiscussed: "Not allowed here.",
    }).expect(422);

    const visit = await request(app).post("/api/daily-work-log/visits").send({
      visitDate: today, place: "HLC plant", visitorName: "VISITOR NAME",
      visitorDesignation: "Engineer", organisation: "Test department",
      purpose: "Inspection", pointsDiscussed: "Checked the mixer.",
      attachment: {
        fileName: "visit-sheet.pdf", objectPath: "/objects/uploads/fixture-visit",
        mimeType: "application/pdf", fileSize: 2048,
      },
    }).expect(201);
    expect(visit.body.recordedByPersonnelId).toBe(personnelA);
    const saved = await request(app).get(`/api/daily-work-log?date=${today}`).expect(200);
    expect(saved.body.visits[0].attachment.fileName).toBe("visit-sheet.pdf");
    await request(app).patch(`/api/daily-work-log/visits/${visit.body.id}`).send({
      visitDate: today, place: "HLC plant", visitorName: "VISITOR NAME",
      visitorDesignation: "Engineer", organisation: "Test department",
      purpose: "Meeting", pointsDiscussed: "Updated the meeting record.",
      attachment: {
        fileName: visit.body.fileName, objectPath: visit.body.objectPath,
        mimeType: visit.body.mimeType, fileSize: visit.body.fileSize,
      },
    }).expect(200);
    await request(app).delete(`/api/daily-work-log/visits/${visit.body.id}`).expect(200);
    const visitAudit = (await state.db.select().from(schema.auditLogs))
      .filter((row: any) => row.module === "office_visit" && row.transactionId === visit.body.id);
    expect(visitAudit.map((row: any) => row.action)).toEqual(["create", "edit", "delete"]);
  }, 30_000);

  it("shows staff-linked DPR activity read-only and gates team records separately", async () => {
    await state.db.insert(schema.dailyWorkEntries).values({
      personnelId: personnelB, createdByUserId: 2, workDate: today, place: "Plant office",
      workType: "Other", durationMinutes: 120, details: "BETA team fixture",
    });
    const own = await request(app).get(`/api/daily-work-log?date=${today}`).expect(200);
    expect(own.body.workEntries).toHaveLength(0);
    expect(own.body.dprActivities).toHaveLength(0);

    await request(app).get(`/api/daily-work-log?date=${today}&view=team`).expect(403);
    state.permissions = grants({ view_reports: true });
    const team = await request(app).get(`/api/daily-work-log?date=${today}&view=team`).expect(200);
    expect(team.body.workEntries).toHaveLength(1);
    expect(team.body.workEntries[0].personName).toBe("BETA ENGINEER");
    expect(team.body.dprActivities).toMatchObject([{
      id: activityId, dprId, personName: "BETA ENGINEER", title: "Field density", resultPass: true,
    }]);
    expect(team.body.dprActivities[0].href).toBe(`/site/edit/${dprId}`);
    const filtered = await request(app)
      .get(`/api/daily-work-log?date=${today}&view=team&personnelId=${personnelA}`).expect(200);
    expect(filtered.body.dprActivities).toEqual([]);
    expect(filtered.body.workEntries).toEqual([]);
  }, 30_000);

  it("keeps site-linked work records inside the user's current site access", async () => {
    const [row] = await state.db.insert(schema.dailyWorkEntries).values({
      personnelId: personnelA, createdByUserId: 1, workDate: today, place: "Site office",
      workType: "Reports", siteId, details: "Site-scoped fixture.",
    }).returning();
    state.permittedSiteIds = [];
    const own = await request(app).get(`/api/daily-work-log?date=${today}`).expect(200);
    expect(own.body.workEntries.some((entry: any) => entry.id === row.id)).toBe(false);
    await request(app).patch(`/api/daily-work-log/entries/${row.id}`).send({
      workDate: today, place: "Site office", workType: "Reports", siteId, details: "Should be blocked.",
    }).expect(403);
    await request(app).delete(`/api/daily-work-log/entries/${row.id}`).expect(403);
    expect((await state.db.select().from(schema.dailyWorkEntries))
      .some((entry: any) => entry.id === row.id && entry.details === "Site-scoped fixture.")).toBe(true);
  }, 30_000);

  it("does not allow an unlinked login to use work actions or an ungranted user to open the API", async () => {
    state.user = { id: 3, fullName: "UNLINKED USER", isOwner: false, isAdmin: false, personnelId: null };
    const context = await request(app).get("/api/daily-work-log/context").expect(200);
    expect(context.body.linked).toBe(false);
    await request(app).post("/api/daily-work-log/entries").send({
      workDate: today, place: "Head office", workType: "Reports", details: "Must not save.",
    }).expect(409);
    state.user = { ...state.user, personnelId: personnelA };
    state.permissions = grants({ view: false, create: false, edit: false, delete: false });
    await request(app).get(`/api/daily-work-log?date=${today}`).expect(403);
    const saved = await state.db.select().from(schema.dailyWorkEntries);
    expect(saved.some((row: any) => row.details === "Must not save.")).toBe(false);
  }, 30_000);

  it("lets an Owner correct and remove an older entry without changing the linked person", async () => {
    const [oldEntry] = await state.db.insert(schema.dailyWorkEntries).values({
      personnelId: personnelB, createdByUserId: 2, workDate: older, place: "Head office",
      workType: "Reports", details: "Old fixture record.",
    }).returning();
    state.user = { id: 1, fullName: "OWNER FIXTURE", isOwner: true, isAdmin: true, personnelId: personnelA };
    const changed = await request(app).patch(`/api/daily-work-log/entries/${oldEntry.id}`).send({
      workDate: older, place: "Head office", workType: "Reports", details: "Owner corrected old record.",
    }).expect(200);
    expect(changed.body.personnelId).toBe(personnelB);
    expect(changed.body.createdByUserId).toBe(2);
    await request(app).delete(`/api/daily-work-log/entries/${oldEntry.id}`).expect(200);
    expect((await state.db.select().from(schema.dailyWorkEntries))
      .some((row: any) => row.id === oldEntry.id)).toBe(false);

    const [oldVisit] = await state.db.insert(schema.officeVisits).values({
      recordedByPersonnelId: personnelB, recordedByUserId: 2, visitDate: older,
      place: "Head office", visitorName: "OLD VISITOR", purpose: "Audit",
      pointsDiscussed: "Old visit fixture.",
    }).returning();
    const changedVisit = await request(app).patch(`/api/daily-work-log/visits/${oldVisit.id}`).send({
      visitDate: older, place: "Head office", visitorName: "OLD VISITOR",
      purpose: "Audit", pointsDiscussed: "Owner corrected visit.",
    }).expect(200);
    expect(changedVisit.body.recordedByPersonnelId).toBe(personnelB);
    await request(app).delete(`/api/daily-work-log/visits/${oldVisit.id}`).expect(200);
  }, 30_000);
});
