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
  await pg.exec(readFileSync(new URL("../migrations/0074_level_sheet_tbms.sql", import.meta.url), "utf8"));
  await pg.exec(readFileSync(new URL("../migrations/0075_level_sheet_basis.sql", import.meta.url), "utf8"));
  await pg.exec(readFileSync(new URL("../migrations/0076_level_sheet_layer_defaults.sql", import.meta.url), "utf8"));
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
  app.use(express.json({ limit: "10mb" }));
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
  await state.db.delete(schema.levelSheetLayerDefaults);
  await state.db.delete(schema.levelSheetTbms);
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
  it("fills typed rows from site/layer defaults, allows a row override and does not change saved rows", async () => {
    await request(app).post("/api/level-sheets/design/defaults").send({
      siteId, layerName: "WMM", crossfallLeftPct: 2.5, crossfallRightPct: 3, topWidthLeftM: 4, topWidthRightM: 5,
    }).expect(200);
    const first = await request(app).post("/api/level-sheets/design/rows").send({ siteId, layerName: "WMM", chainageOursKm: 1, centreLevel: 100 }).expect(201);
    expect(first.body).toMatchObject({ crossfallLeftPct: 2.5, crossfallRightPct: 3, topWidthLeftM: 4, topWidthRightM: 5 });
    const second = await request(app).post("/api/level-sheets/design/rows").send({ siteId, layerName: "WMM", chainageOursKm: 1.01, centreLevel: 101, crossfallLeftPct: 0 }).expect(201);
    expect(second.body.crossfallLeftPct).toBe(0);
    await request(app).post("/api/level-sheets/design/defaults").send({
      siteId, layerName: "WMM", crossfallLeftPct: 1, crossfallRightPct: 1, topWidthLeftM: 2, topWidthRightM: 2,
    }).expect(200);
    const result = await request(app).get(`/api/level-sheets/design?siteId=${siteId}&layerName=WMM`).expect(200);
    expect(result.body.rows[0].topWidthLeftM).toBe(4);
    expect(result.body.defaults.topWidthLeftM).toBe(2);
    const layers = await request(app).get(`/api/level-sheets/design/layers?siteId=${siteId}`).expect(200);
    expect(layers.body[0]).toMatchObject({ layerName: "WMM", count: 2, fromKm: 1 });
  });
  it("imports 6,000 rows in one request with one layer audit in under 20 seconds", async () => {
    const start = Date.now();
    const result = await request(app).post("/api/level-sheets/design/import-layers").send({
      siteId, fileName: "fixture-6000.xlsx",
      matrix: [["", "WMM", "", ""], ["Chainage", -5, 0, 5], ...Array.from({ length: 6000 }, (_, i) => [i * 10, 99.9, 100, 99.9])],
      layers: [{ key: "1", layerName: "WMM" }],
    }).expect(200);
    expect(result.body.imported).toBe(6000);
    expect(Date.now() - start).toBeLessThan(20000);
    const audit = await state.db.select().from(schema.auditLogs);
    expect(audit).toHaveLength(1);
    expect(audit[0].action).toBe("design_layer_import");
    expect(audit[0].newValues).toMatchObject({ count: 6000, fileName: "fixture-6000.xlsx", fromKm: 0, toKm: 59.99 });
    expect((await state.db.select().from(schema.levelSheetDesignRows))).toHaveLength(6000);
  }, 30000);
  it("skips repeated chainages by default and applies only the row explicitly chosen", async () => {
    const payload = { siteId, layerName: "WMM", columns: { chainage: "ch", centreLevel: "rl", crossfallLeft: "l", crossfallRight: "r", topWidthLeft: "wl", topWidthRight: "wr" },
      rows: [
        { ch: "0+750", rl: 100, l: 2, r: 2, wl: 5, wr: 5 },
        { ch: "0+750", rl: 101, l: 3, r: 3, wl: 6, wr: 6 },
        { ch: "0+760", rl: 102, l: 4, r: 4, wl: 7, wr: 7 },
      ] };
    const skipped = await request(app).post("/api/level-sheets/design/import").send(payload).expect(200);
    expect(skipped.body.imported).toHaveLength(1);
    const chosen = await request(app).post("/api/level-sheets/design/import").send({ ...payload, duplicateChoices: { single: { "0.75": 1 } } }).expect(200);
    expect(chosen.body.imported).toHaveLength(2);
    expect(chosen.body.imported.find((row: any) => row.chainageOursKm === 0.75).centreLevel).toBe(101);
  });
  it("refuses a second same-site import while the first is saving, then unlocks", async () => {
    const payload = { siteId, layerName: "WMM", columns: { chainage: "ch", centreLevel: "rl", crossfallLeft: "l", crossfallRight: "r", topWidthLeft: "wl", topWidthRight: "wr" },
      rows: [{ ch: 1, rl: 100, l: 2, r: 2, wl: 5, wr: 5 }] };
    let ready!: () => void; let release!: () => void;
    const entered = new Promise<void>(resolve => { ready = resolve; });
    const gate = new Promise<void>(resolve => { release = resolve; });
    const original = state.db.transaction.bind(state.db);
    const pause = vi.spyOn(state.db, "transaction").mockImplementationOnce(async (callback: any) => { ready(); await gate; return original(callback); });
    const first = request(app).post("/api/level-sheets/design/import").send(payload).then(response => response);
    try {
      await entered;
      const refused = await request(app).post("/api/level-sheets/design/import").send(payload).expect(409);
      expect(refused.body.message).toContain("already running");
    } finally { release(); pause.mockRestore(); }
    expect((await first).status).toBe(200);
    await request(app).post("/api/level-sheets/design/import").send(payload).expect(200);
  });
  it("compares saved sheets read-only, reports basis, enforces site access and changes no sheets", async () => {
    const readings = (value: number) => [0, 0.01].map(chainageOursKm => ({ chainageOursKm, points: [
      { side: "L", distanceM: 5, value }, { side: "R", distanceM: 5, value },
    ] }));
    const bottom = await request(app).post("/api/level-sheets").send(sheetPayload({ layerName: "OGL", readings: readings(100), status: "saved" })).expect(201);
    const top = await request(app).post("/api/level-sheets").send(sheetPayload({ layerName: "WMM", readings: readings(100.3), status: "saved", basis: "assumed" })).expect(201);
    const before = await state.db.select().from(schema.levelSheets);
    const auditBefore = await state.db.select().from(schema.auditLogs);
    const result = await request(app).get(`/api/level-sheets/quantities?lowerId=${bottom.body.id}&upperId=${top.body.id}`).expect(200);
    expect(result.body.fillCum).toBeCloseTo(30, 2);
    expect(result.body.lower.basis).toBe("Own levels");
    expect(result.body.upper.basis).toBe("Assumed or agreed");
    expect(await state.db.select().from(schema.levelSheets)).toEqual(before);
    expect(await state.db.select().from(schema.auditLogs)).toEqual(auditBefore);
    state.permittedSiteIds = [otherSiteId];
    await request(app).get(`/api/level-sheets/quantities?lowerId=${bottom.body.id}&upperId=${top.body.id}`).expect(403);
  });
  it("imports ticked consultant layers atomically and preserves typed rows unless replace is chosen", async () => {
    const payload = {
      siteId, matrix: [
        ["", "", "WMM Top", "", ""],
        ["Chainage", "OGL", -7, 0, 7],
        [750, 535, 536.072, 536.247, 536.072],
        [760, 535.1, 536.172, 536.347, 536.172],
      ], layers: [{ key: "1", layerName: "OGL" }, { key: "2", layerName: "WMM top" }],
    };
    await request(app).post("/api/level-sheets/design/rows").send({
      siteId, layerName: "OGL", chainageOursKm: 0.75, centreLevel: 500,
      crossfallLeftPct: 0, crossfallRightPct: 0, topWidthLeftM: 0, topWidthRightM: 0,
    }).expect(201);
    const first = await request(app).post("/api/level-sheets/design/import-layers").send(payload).expect(200);
    expect(first.body).toMatchObject({ imported: 3, skipped: 1 });
    const ogl = await request(app).get(`/api/level-sheets/design?siteId=${siteId}&layerName=OGL`).expect(200);
    expect(ogl.body.rows[0].centreLevel).toBe(500);
    const replaced = await request(app).post("/api/level-sheets/design/import-layers").send({ ...payload, replace: true }).expect(200);
    expect(replaced.body).toMatchObject({ imported: 4, skipped: 0 });
    const wmm = await request(app).get(`/api/level-sheets/design?siteId=${siteId}&layerName=WMM%20top`).expect(200);
    expect(wmm.body.rows[0].topWidthLeftM).toBe(7);
    expect(wmm.body.rows[0].crossfallLeftPct).toBeCloseTo(2.5, 5);
  });
  it("creates, imports, edits and deactivates site TBMs with audits and blocks duplicate names and other sites", async () => {
    const created = await request(app).post("/api/level-sheets/tbms").send({ siteId, name: "TBM1", chainageOursKm: 0.75, rl: 100 }).expect(201);
    await request(app).post("/api/level-sheets/tbms/import").send({
      siteId, rows: [["TBM3", "0/750", 101], ["TBM3", "1/010", 102]],
      mapping: { name: 0, chainage: 1, rl: 2, easting: -1, northing: -1, description: -1 },
    }).expect(422);
    await request(app).post("/api/level-sheets/tbms/import").send({
      siteId, rows: [["TBM3", "0/750", 101], ["TBM3", "1/010", 102]], names: ["TBM3", "TBM4"],
      mapping: { name: 0, chainage: 1, rl: 2, easting: -1, northing: -1, description: -1 },
    }).expect(201);
    await request(app).patch(`/api/level-sheets/tbms/${created.body.id}`).send({ active: false }).expect(200);
    const listed = await request(app).get(`/api/level-sheets/tbms?siteId=${siteId}`).expect(200);
    expect(listed.body).toHaveLength(3);
    expect(listed.body.find((row: any) => row.id === created.body.id).active).toBe(false);
    expect((await state.db.select().from(schema.auditLogs)).map((row: any) => row.action)).toContain("tbm_edit");
    await request(app).get(`/api/level-sheets/tbms?siteId=${otherSiteId}`).expect(403);
    const saved = await request(app).post("/api/level-sheets").send(sheetPayload({ closingTbmName: "TBM4", closingTbmRl: 102 })).expect(201);
    expect(saved.body.closingTbmRl).toBe(102);
  });
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
    expect(audit.map((row: any) => row.action)).toContain("design_layer_import");
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

    const checked = await request(app).patch(`/api/level-sheets/${id}/check`).send({
      checkedByType: "department",
      checkedByName: "Department Engineer",
      checkedByDesignation: "Assistant Engineer",
      checkedDate: "2026-11-10",
      checkedPoints: [{ chainageOursKm: 2.61, columnKey: "cl", checked: true, checkedRl: 101.25 }],
    }).expect(200);
    expect(checked.body).toMatchObject({
      checkedByType: "department",
      checkedByName: "Department Engineer",
      checkedByDesignation: "Assistant Engineer",
      checkedDate: "2026-11-10",
      checkedPoints: [{ chainageOursKm: 2.61, columnKey: "cl", checked: true, checkedRl: 101.25 }],
    });

    const rejected = await request(app).post("/api/level-sheets").send(sheetPayload({ personnelIds: [inactiveStaffId] })).expect(422);
    expect(rejected.body.message).toMatch(/Only active Personnel/);
    const audit = await state.db.select().from(schema.auditLogs).where(eq(schema.auditLogs.module, "level_sheet"));
    expect(audit.map((row: any) => row.action)).toEqual(["create", "edit", "check_and_sign"]);
  });

  it("blocks missing permission and site access and rejects a BOQ item from a different site", async () => {
    state.user = { id: 2, fullName: "LIMITED USER", isOwner: false, isAdmin: false, businessRole: "Engineer" };
    state.permissions = grants({ view: false, create: false, edit: false });
    await request(app).get("/api/level-sheets/bootstrap").expect(403);
    await request(app).patch("/api/level-sheets/1/check").send({ checkedByType: "department" }).expect(403);

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
