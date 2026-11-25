import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { getTableConfig, PgDialect, PgTable } from "drizzle-orm/pg-core";
import { eq, is, SQL } from "drizzle-orm";
import express from "express";
import request from "supertest";
import * as schema from "../shared/schema";
import { fullMatrix } from "../shared/permissions";

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
  const allowed = (req: any, action: string) => !!req.authUser?.isOwner || !!req.authPermissions?.level_sheets?.[action];
  const gate = (action: string) => (req: any, res: any, section: string) => {
    if (allowed(req, action)) return true;
    res.status(req.authUser ? 403 : 401).json({ error: "forbidden", section, action });
    return false;
  };
  return {
    assertView: gate("view"),
    assertCreate: gate("create"),
    assertEdit: gate("edit"),
    assertApprove: gate("approve"),
    currentUserName: (req: any) => req.authUser?.fullName ?? "Fixture owner",
  };
});

let pg: PGlite;
let app: express.Express;
let siteId: number;
let otherSiteId: number;
let projectId: number;
let itemId: number;
let activeStaffId: number;
let inactiveStaffId: number;
let registerRoutes: typeof import("../server/levelSheetRoutes").registerLevelSheetRoutes;

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
  await pg.exec(`CREATE TABLE "${config.name}" (${columns.join(",")})`);
}

const grants = (overrides: Record<string, boolean> = {}) => ({
  view: true, create: true, edit: true, delete: false, view_reports: false, approve: false, ...overrides,
});

const sheetPayload = (overrides: Record<string, unknown> = {}) => ({
  siteId, boqProjectId: projectId, boqItemId: itemId, layerName: "GSB", sheetDate: "2026-11-22",
  instrument: "Auto level", toleranceAboveMm: 20, toleranceBelowMm: 25, allowedClosingErrorMm: 10,
  readingMode: "rl", tbmName: "TBM-1", tbmRl: 100, initialBackSight: 1.25, closingForeSight: 1.2,
  readings: [{ chainageOursKm: 2.6, points: [{ columnKey: "cl", side: "CL", distanceM: 0, value: 101, remark: null }] }],
  personnelIds: [activeStaffId], status: "draft",
  attachment: { fileName: "fixture-levels.pdf", objectPath: "/objects/level-fixtures/levels.pdf", mimeType: "application/pdf", fileSize: 3210 },
  ...overrides,
});

beforeAll(async () => {
  pg = new PGlite();
  const dialect = new PgDialect();
  const neededTables = new Set(["users", "sites", "boq_projects", "boq_items", "personnel", "audit_logs"]);
  const tables = Object.values(schema).filter((value): value is PgTable =>
    is(value, PgTable) && neededTables.has(getTableConfig(value).name),
  );
  for (const table of tables) await createFixtureTable(table, dialect);
  await pg.exec(readFileSync(new URL("../migrations/0071_level_sheets.sql", import.meta.url), "utf8"));
  state.db = drizzle(pg, { schema });
  state.storage = { getUserPermittedSiteIds: async () => state.permittedSiteIds };

  const [owner] = await state.db.insert(schema.users).values({
    id: 1, fullName: "LEVEL SHEET OWNER", email: "level-owner@example.test", passwordHash: "fixture",
  }).returning();
  expect(owner.id).toBe(1);
  const [site] = await state.db.insert(schema.sites).values({ name: "LEVEL FIXTURE SITE", isActive: 1 }).returning();
  const [otherSite] = await state.db.insert(schema.sites).values({ name: "OTHER FIXTURE SITE", isActive: 1 }).returning();
  siteId = site.id;
  otherSiteId = otherSite.id;
  const [project] = await state.db.insert(schema.boqProjects).values({
    siteId, name: "LEVEL FIXTURE PROJECT", status: "active",
  }).returning();
  projectId = project.id;
  const [item] = await state.db.insert(schema.boqItems).values({
    boqProjectId: projectId, itemCode: "GSB-01", itemName: "GSB layer", description: "Granular sub-base",
    unit: "cum", sortOrder: 1,
  }).returning();
  itemId = item.id;
  const [active] = await state.db.insert(schema.personnel).values({ name: "ACTIVE SURVEYOR", role: "Surveyor", isActive: 1 }).returning();
  const [inactive] = await state.db.insert(schema.personnel).values({ name: "INACTIVE SURVEYOR", role: "Surveyor", isActive: 0 }).returning();
  activeStaffId = active.id;
  inactiveStaffId = inactive.id;

  const { registerLevelSheetRoutes } = await import("../server/levelSheetRoutes");
  registerRoutes = registerLevelSheetRoutes;
  app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    req.authUser = state.user;
    req.authPermissions = { level_sheets: state.permissions };
    req.authFeatureAccess = { rolesConfigured: true };
    next();
  });
  registerRoutes(app, { db: state.db, storage: state.storage });
}, 60_000);

afterAll(async () => { await pg?.close(); });

beforeEach(async () => {
  await state.db.delete(schema.levelSheetStaff);
  await state.db.delete(schema.levelSheets);
  await state.db.delete(schema.levelSheetDesignRows);
  await state.db.delete(schema.levelSheetSiteSettings);
  await state.db.delete(schema.auditLogs);
  state.user = { id: 1, fullName: "LEVEL SHEET OWNER", isOwner: true, isAdmin: false, businessRole: "Owner" };
  state.permissions = grants();
  state.permittedSiteIds = [siteId];
});

describe("LEVELS-01 level-sheet routes", () => {
  it("keeps level sheets disabled in default permission matrices", () => {
    expect(Object.values(fullMatrix().level_sheets).some(Boolean)).toBe(false);
  });

  it("saves site chainage settings, typed design rows, mapped Excel and FRL-derived rows with audit history", async () => {
    const settings = await request(app).put("/api/level-sheets/site-settings").send({
      siteId, bookChainageSystem: "consultant", consultantOffsetM: 750,
    }).expect(200);
    expect(settings.body).toMatchObject({ bookChainageSystem: "consultant", consultantOffsetM: 750 });

    const typed = await request(app).post("/api/level-sheets/design/rows").send({
      siteId, layerName: "FRL", chainageOursKm: 2.6, centreLevel: 100, crossfallLeftPct: 2,
      crossfallRightPct: 2, topWidthLeftM: 3, topWidthRightM: 3,
    }).expect(201);
    expect(typed.body.source).toBe("TYPED");

    const imported = await request(app).post("/api/level-sheets/design/import").send({
      siteId, layerName: "FRL", replace: false,
      columns: { chainage: "Ch", centreLevel: "Centre", crossfallLeft: "Left", crossfallRight: "Right", topWidthLeft: "WL", topWidthRight: "WR" },
      rows: [
        { Ch: "3+350", Centre: "101,5", Left: "2", Right: "2", WL: "3", WR: "3" },
        { Ch: "3+450", Centre: "99", Left: "1", Right: "1", WL: "2", WR: "2" },
      ],
    }).expect(200);
    expect(imported.body.imported).toHaveLength(1);
    expect(imported.body.skipped).toEqual([2.6]);
    const rows = await request(app).get(`/api/level-sheets/design?siteId=${siteId}&layerName=FRL`).expect(200);
    expect(rows.body.rows.map((row: any) => row.chainageOursKm)).toEqual([2.6, 2.7]);
    expect(rows.body.rows.find((row: any) => row.chainageOursKm === 2.6).source).toBe("TYPED");

    const derived = await request(app).post("/api/level-sheets/design/derive").send({
      siteId, sourceLayer: "FRL", targetLayer: "GSB", depthM: 0.25, replace: false,
    }).expect(200);
    expect(derived.body.created).toHaveLength(2);
    expect(derived.body.created[0]).toMatchObject({ centreLevel: 99.75, source: "TYPED" });
    const audit = await state.db.select().from(schema.auditLogs);
    expect(audit.map((row: any) => row.action)).toContain("design_import_add");
    expect(audit.map((row: any) => row.action)).toContain("design_derive_from_frl");
  });

  it("saves, restores and edits readings, staff links and attachments without losing inactive legacy staff", async () => {
    const created = await request(app).post("/api/level-sheets").send(sheetPayload()).expect(201);
    const id = created.body.id;
    expect(created.body).toMatchObject({
      siteId, boqProjectId: projectId, boqItemId: itemId, status: "draft",
      objectPath: "/objects/level-fixtures/levels.pdf",
      readings: [{ chainageOursKm: 2.6, points: [{ columnKey: "cl", value: 101 }] }],
    });
    expect(created.body.staff.map((person: any) => person.id)).toContain(activeStaffId);

    const inactiveLegacy = await state.db.insert(schema.levelSheetStaff).values({
      levelSheetId: id, personnelId: inactiveStaffId,
    }).returning();
    expect(inactiveLegacy).toHaveLength(1);
    const restored = await request(app).get(`/api/level-sheets/${id}`).expect(200);
    expect(restored.body.personnelIds).toEqual(expect.arrayContaining([activeStaffId, inactiveStaffId]));
    expect(restored.body.staff.find((person: any) => person.id === inactiveStaffId).isActive).toBe(0);

    const editPayload: any = sheetPayload({
      personnelIds: [activeStaffId, inactiveStaffId], status: "saved",
      readings: [{ chainageOursKm: 2.61, points: [{ columnKey: "cl", side: "CL", distanceM: 0, value: 101.2 }] }],
    });
    delete editPayload.attachment;
    const edited = await request(app).patch(`/api/level-sheets/${id}`).send(editPayload).expect(200);
    expect(edited.body.status).toBe("saved");
    expect(edited.body.readings[0].chainageOursKm).toBeCloseTo(2.61);
    expect(edited.body.objectPath).toBe("/objects/level-fixtures/levels.pdf");
    expect(edited.body.staff.map((person: any) => person.id)).toEqual(expect.arrayContaining([activeStaffId, inactiveStaffId]));

    const rejected = await request(app).post("/api/level-sheets").send(sheetPayload({ personnelIds: [inactiveStaffId] })).expect(422);
    expect(rejected.body.message).toMatch(/Only active Personnel/);
    const audit = await state.db.select().from(schema.auditLogs).where(eq(schema.auditLogs.module, "level_sheet"));
    expect(audit.map((row: any) => row.action)).toEqual(["create", "edit"]);
  });

  it("blocks missing permission and site access and rejects a BOQ item from a different site", async () => {
    state.user = { id: 2, fullName: "LIMITED USER", isOwner: false, isAdmin: false, businessRole: "Engineer" };
    state.permissions = grants({ view: false, create: false, edit: false });
    await request(app).get("/api/level-sheets/bootstrap").expect(403);

    state.permissions = grants({ view: true });
    state.permittedSiteIds = [];
    await request(app).get(`/api/level-sheets?siteId=${siteId}`).expect(403);

    state.user = { id: 1, fullName: "LEVEL SHEET OWNER", isOwner: true, isAdmin: false, businessRole: "Owner" };
    state.permittedSiteIds = [siteId];
    const [otherProject] = await state.db.insert(schema.boqProjects).values({
      siteId: otherSiteId, name: "OTHER SITE PROJECT", status: "active",
    }).returning();
    const [otherItem] = await state.db.insert(schema.boqItems).values({
      boqProjectId: otherProject.id, itemCode: "OTHER-1", itemName: "Other site item",
      description: "Other site item", unit: "m", sortOrder: 1,
    }).returning();
    await request(app).post("/api/level-sheets").send(sheetPayload({ boqProjectId: otherProject.id, boqItemId: otherItem.id })).expect(422);
  });
});
