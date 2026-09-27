import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { getTableConfig, PgDialect, PgTable } from "drizzle-orm/pg-core";
import { is, SQL, eq } from "drizzle-orm";
import * as schema from "../shared/schema";
import { saveDprSection, readSectionAggregate, sectionSnapshot, findSectionDrafts, DprSectionConflict, assertSectionTokens } from "../server/dprSections";
import { normalizeDprSectionContext, pickDprSectionPayload } from "../shared/dprSections";
import express from "express";
import request from "supertest";
import { createServer } from "node:http";

const state = vi.hoisted(() => ({ db: null as any, admin: true, permissions: {} as any }));
vi.mock("../server/db", () => ({ get db() { return state.db; }, pool: {} }));
vi.mock("../server/push", () => ({ sendPushToAll: vi.fn(), sendPushToSection: vi.fn().mockResolvedValue(undefined), sendPushToAudience: vi.fn(), sendTestPush: vi.fn() }));
vi.mock("../server/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../server/auth")>();
  const inject = (req: any, _res: any, next: any) => {
    req.authUser = { id: 7, fullName: "SYNTHETIC ENGINEER", isAdmin: state.admin, isOwner: false };
    req.authPermissions = state.permissions;
    next();
  };
  return { ...actual, requireAuth: inject, optionalAuth: inject };
});
let pg: PGlite;
let storage: any;
let app: express.Express;
const context = normalizeDprSectionContext({ site: " SYNTHETIC  DPR13 SITE ", date: "2026-09-18", workType: "road", boqProjectId: null });
const validate = vi.fn(async () => {});
const save = (section: string, data: any, snapshot?: any, ctx = context) => saveDprSection(state.db, storage, {
  section, context: ctx, data: { engineer: "SYNTHETIC ENGINEER", ...data }, dprId: snapshot?.dpr.id,
  sectionToken: snapshot?.sectionTokens[section], headerToken: snapshot?.headerToken,
}, 7, validate);
const fresh = async (id: number) => sectionSnapshot(await readSectionAggregate(state.db, id));

beforeAll(async () => {
  pg = new PGlite();
  const dialect = new PgDialect();
  // Isolated in-memory SQL fixture built from actual Drizzle column metadata.
  // Only test DDL: no application database or migration is touched.
  const tables = Object.values(schema).filter(value => is(value, PgTable)) as PgTable[];
  for (const table of tables) {
    const config = getTableConfig(table);
    const columns = config.columns.map(column => {
      let definition = `"${column.name}" ${column.getSQLType()}`;
      if (column.primary) definition += " PRIMARY KEY";
      else if (column.isUnique) definition += " UNIQUE";
      if (column.notNull) definition += " NOT NULL";
      if (column.default !== undefined) {
        const value = column.default;
        definition += " DEFAULT " + (is(value, SQL) ? dialect.sqlToQuery(value).sql
          : Array.isArray(value) && column.getSQLType().endsWith("[]") ? `'{}'`
          : typeof value === "string" ? `'${value.replace(/'/g, "''")}'`
            : typeof value === "object" ? `'${JSON.stringify(value)}'` : String(value));
      }
      return definition;
    });
    await pg.exec(`CREATE TABLE "${config.name}" (${columns.join(",")})`);
  }
  for (const table of [schema.equipmentActivitySegments, schema.equipmentActivityAllocations, schema.equipmentActivitySegmentBoqItems, schema.activityPersonnel]) {
    const config = getTableConfig(table);
    for (const fk of config.foreignKeys) {
      const reference = fk.reference();
      await pg.exec(`ALTER TABLE "${config.name}" ADD FOREIGN KEY (${reference.columns.map(c => `"${c.name}"`).join(",")})
        REFERENCES "${getTableConfig(reference.foreignTable).name}" (${reference.foreignColumns.map(c => `"${c.name}"`).join(",")}) ON DELETE ${fk.onDelete ?? "NO ACTION"}`);
    }
  }
  state.db = drizzle(pg, { schema });
  ({ storage } = await import("../server/storage"));
  const { registerRoutes } = await import("../server/routes");
  app = express();
  app.use(express.json());
  await registerRoutes(createServer(app), app);
}, 120_000);
afterAll(async () => { await pg?.close(); });

describe("DPR-13 normalized SQL section transactions", () => {
  it("resolves without creating, equipment first creates one shell, sibling writes retain rows and tokens", async () => {
    expect(await findSectionDrafts(state.db, context)).toHaveLength(0);
    const first = await save("equipment", { equipment: [{ machine: "SYNTHETIC ROLLER", openingReading: 10 }] });
    expect(first.sections.equipment.state).toBe("incomplete");
    expect(first.sections.activity.state).toBe("empty");
    const equipmentId = first.dpr.equipment[0].id;
    expect(await findSectionDrafts(state.db, { ...context, site: "synthetic dpr13 site" })).toHaveLength(1);
    const labour = await save("labour", { labour: [{ category: "Unskilled", count: 4, gender: "Male" }] }, first);
    expect(labour.dpr.id).toBe(first.dpr.id);
    expect(labour.dpr.equipment[0].id).toBe(equipmentId);
    expect(labour.sectionTokens.equipment).toBe(first.sectionTokens.equipment);
    expect(labour.headerToken).toBe(first.headerToken);
    const activity = await save("activity", { progress: [{ activity: "NO WORK", noSiteWork: true, noSiteWorkDescription: "RAIN", entryKey: "synthetic-key" }] }, first);
    expect(activity.dpr.labour[0].id).toBe(labour.dpr.labour[0].id);
    expect(activity.dpr.equipment[0].id).toBe(equipmentId);
    expect(activity.dpr.lastEditedAt).toBeTruthy();
    const revised = await save("activity", { progress: activity.dpr.progress.map((r: any) => ({ ...r, noSiteWorkDescription: "MORE RAIN" })) }, activity);
    expect(revised.dpr.progress[0].id).toBe(activity.dpr.progress[0].id);
    expect(revised.dpr.progress[0].entryKey).toBe("synthetic-key");
    expect((await state.db.select().from(schema.equipmentUsage))).toHaveLength(0);
    expect((await state.db.select().from(schema.equipmentMaintenanceLogs))).toHaveLength(0);
    expect((await state.db.select().from(schema.stockLedger))).toHaveLength(0);
  });

  it("rejects stale same-section edits, but independent sibling writes remain valid", async () => {
    const [header] = await findSectionDrafts(state.db, context);
    const initial = await fresh(header.id);
    const next = await save("labour", { labour: [{ category: "Unskilled", count: 6, gender: "Male", persistedId: initial.dpr.labour[0].id }] }, initial);
    await expect(save("labour", { labour: [] }, initial)).rejects.toBeInstanceOf(DprSectionConflict);
    const equipment = await save("equipment", { equipment: initial.dpr.equipment.map((r: any) => ({ ...r, closingReading: 12 })) }, initial);
    expect(equipment.dpr.labour[0].count).toBe(6);
    expect(equipment.dpr.labour[0].id).toBe(next.dpr.labour[0].id);
  });

  it("serializes simultaneous first saves and rejects ambiguous same-section retry", async () => {
    const ctx = { ...context, date: "2026-09-19" };
    const settled = await Promise.allSettled([
      save("labour", { labour: [{ category: "Unskilled", count: 2, gender: "Male" }] }, undefined, ctx),
      save("labour", { labour: [{ category: "Unskilled", count: 9, gender: "Male" }] }, undefined, ctx),
    ]);
    expect(settled.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(settled.filter(result => result.status === "rejected")).toHaveLength(1);
    expect(await findSectionDrafts(state.db, ctx)).toHaveLength(1);
  });

  it("does not cross work type/project and requires explicit choice among legacy duplicates", async () => {
    expect(await findSectionDrafts(state.db, { ...context, workType: "structure" })).toHaveLength(0);
    expect(await findSectionDrafts(state.db, { ...context, boqProjectId: 99 })).toHaveLength(0);
    const ctx = { ...context, date: "2026-09-20" };
    await state.db.insert(schema.dprs).values([1, 2].map(n => ({ ...ctx, engineer: `SYNTHETIC ${n}`, dprStatus: "draft" })));
    await expect(save("labour", { labour: [] }, undefined, ctx)).rejects.toThrow(/Multiple drafts/);
  });

  it("rolls back a newly created shell when draft validation fails", async () => {
    const ctx = { ...context, date: "2026-09-21" };
    validate.mockRejectedValueOnce(new Error("SYNTHETIC validation failure"));
    await expect(save("labour", { labour: [] }, undefined, ctx)).rejects.toThrow("SYNTHETIC validation failure");
    expect(await findSectionDrafts(state.db, ctx)).toHaveLength(0);
  });

  it("checks tokens inside the real submit transaction; stale submit cannot replace siblings", async () => {
    const ctx = { ...context, date: "2026-09-22" };
    const initial = await save("labour", { labour: [{ category: "Unskilled", count: 1, gender: "Male" }] }, undefined, ctx);
    const changed = await save("materials", { materials: [] }, initial, ctx);
    const latest = await save("labour", { labour: [{ category: "Unskilled", count: 3, gender: "Male", persistedId: initial.dpr.labour[0].id }] }, changed, ctx);
    await expect(storage.submitDraftDpr(initial.dpr.id, initial.dpr, undefined, { userId: 7 }, null, false,
      { ...initial, stored: true, validate: async (input: any) => input })).rejects.toBeInstanceOf(DprSectionConflict);
    expect((await fresh(initial.dpr.id)).dpr.labour[0].count).toBe(3);
    const outputs = await Promise.all([
      storage.submitDraftDpr(latest.dpr.id, latest.dpr, undefined, { userId: 7 }, null, false, { ...latest, stored: true, validate: async (input: any) => input }),
      storage.submitDraftDpr(latest.dpr.id, latest.dpr, undefined, { userId: 7 }, null, false, { ...latest, stored: true, validate: async (input: any) => input }),
    ]);
    expect(outputs.filter(Boolean)).toHaveLength(1);
    const final = await fresh(latest.dpr.id);
    expect(final.dpr.dprStatus).toBe("submitted");
    expect(final.dpr.labour[0].id).toBe(latest.dpr.labour[0].id);
    await expect(save("labour", { labour: [] }, latest, ctx)).rejects.toBeInstanceOf(DprSectionConflict);
  });

  it("requires full token handshake for whole-body writes and excludes sibling fields in picker", async () => {
    const [header] = await findSectionDrafts(state.db, context);
    const snapshot = await fresh(header.id);
    expect(() => assertSectionTokens(snapshot, {})).toThrow(DprSectionConflict);
    expect(pickDprSectionPayload("labour", { equipment: [1], labour: [2], engineer: "x" })).toEqual({ labour: [2] });
    await state.db.update(schema.dprs).set({ engineer: "CHANGED HEADER" }).where(eq(schema.dprs.id, header.id));
    await expect(save("materials", { materials: [] }, snapshot)).rejects.toBeInstanceOf(DprSectionConflict);
  });

  it("preserves explicit normalized segment/link identities through equipment edits and sibling saves", async () => {
    const [site] = await state.db.insert(schema.sites).values({ name: "SYNTHETIC DPR13 PROJECT SITE" }).returning();
    const [project] = await state.db.insert(schema.boqProjects).values({ name: "SYNTHETIC PROJECT", siteId: site.id }).returning();
    const [item] = await state.db.insert(schema.boqItems).values({ boqProjectId: project.id, description: "SYNTHETIC WORK", unit: "CUM" }).returning();
    const ctx = { ...context, site: "synthetic dpr13 project site", boqProjectId: project.id };
    const first = await save("equipment", { equipment: [{
      machine: "SYNTHETIC EQUIPMENT", startTime: "08:00", endTime: "10:00",
      activitySegments: [{ startTime: "08:00", endTime: "10:00", boqItems: [{ boqItemId: item.id }] }],
    }] }, undefined, ctx);
    const next = await save("equipment", { equipment: first.dpr.equipment.map((row: any) => ({ ...row, operator: "SYNTHETIC OPERATOR" })) }, first, ctx);
    expect(next.dpr.equipment[0].id).toBe(first.dpr.equipment[0].id);
    expect(next.dpr.equipment[0].activitySegments[0].id).toBe(first.dpr.equipment[0].activitySegments[0].id);
    expect(next.dpr.equipment[0].activitySegments[0].boqItems[0].id).toBe(first.dpr.equipment[0].activitySegments[0].boqItems[0].id);
    const sibling = await save("labour", { labour: [] }, next, ctx);
    expect(sibling.sectionTokens.equipment).toBe(next.sectionTokens.equipment);
    await expect(save("equipment", { equipment: [] }, undefined, { ...ctx, site: context.site })).rejects.toThrow(/does not belong/);
  });

  it("enforces permissions, ownership fields, persisted readiness and legacy token handshake through HTTP", async () => {
    const ctx = { ...context, date: "2026-09-23" };
    state.admin = false;
    state.permissions = {};
    expect((await request(app).post("/api/dpr-sections/resolve").send({ context: ctx })).status).toBe(403);
    expect((await request(app).put("/api/dpr-sections/labour").send({ context: ctx, data: {} })).status).toBe(403);
    state.admin = true;
    expect((await request(app).post("/api/dpr-sections/resolve").send({ context: ctx })).body.kind).toBe("new");
    expect((await request(app).put("/api/dpr-sections/labour").send({
      context: ctx, data: { engineer: "SYNTHETIC", equipment: [] },
    })).status).toBe(400);
    const saved = await request(app).put("/api/dpr-sections/equipment").send({
      context: ctx, data: { engineer: "SYNTHETIC", equipment: [{ machine: "SYNTHETIC ROLLER", openingReading: 10 }] },
    });
    expect(saved.status).toBe(200);
    const snapshot = saved.body;
    const fetched = await request(app).get(`/api/dpr-sections/${snapshot.dpr.id}`);
    expect(fetched.body.sectionTokens).toEqual(snapshot.sectionTokens);
    const submit = await request(app).post(`/api/dpr-sections/${snapshot.dpr.id}/submit`).send({
      headerToken: snapshot.headerToken, sectionTokens: snapshot.sectionTokens,
    });
    expect(submit.status).toBe(422);
    expect(submit.body.code).toBe("DPR_NOT_READY");
    const legacy = await request(app).patch(`/api/dprs/${snapshot.dpr.id}/draft`).send(snapshot.dpr);
    expect(legacy.status).toBe(409);
    const legacyRead = await request(app).get(`/api/dprs/${snapshot.dpr.id}`);
    expect(legacyRead.body.headerToken).toBe(snapshot.headerToken);
    const resolved = await request(app).post("/api/dpr-sections/resolve").send({ context: ctx });
    expect(resolved.body.snapshot.dpr.id).toBe(snapshot.dpr.id);
    state.admin = false;
    state.permissions = { site_dprs: { view: true, create: true } };
    const permitted = vi.spyOn(storage, "getUserPermittedSiteIds").mockResolvedValue([]);
    expect((await request(app).get(`/api/dpr-sections/${snapshot.dpr.id}`)).status).toBe(403);
    expect((await request(app).post("/api/dpr-sections/resolve").send({ context: ctx })).status).toBe(403);
    expect((await request(app).post(`/api/dpr-sections/${snapshot.dpr.id}/submit`).send(snapshot)).status).toBe(403);
    expect((await request(app).put("/api/dpr-sections/equipment").send({
      dprId: snapshot.dpr.id, context: ctx, data: { equipment: [] }, sectionToken: snapshot.sectionTokens.equipment, headerToken: snapshot.headerToken,
    })).status).toBe(403);
    permitted.mockRestore();
    state.admin = true;
  });

  it("defers real diesel ledger/canonical usage until exactly one explicit HTTP submit", async () => {
    await state.db.insert(schema.plantMaterials).values({ name: "DIESEL", defaultUom: "L" });
    const [master] = await state.db.insert(schema.equipmentMaster).values({ name: "SYNTHETIC DIESEL ROLLER", meterType: "hour_meter" }).returning();
    const ctx = { ...context, date: "2026-09-24" };
    const first = await request(app).put("/api/dpr-sections/equipment").send({
      context: ctx, data: { engineer: "SYNTHETIC", equipment: [{
        machine: master.name, equipmentId: master.id, openingReading: 100, closingReading: 102,
        diesel: 12, dieselSource: "direct_purchase", fuelStation: "SYNTHETIC STATION",
      }] },
    });
    expect(first.status).toBe(200);
    const snapshot = first.body;
    expect(await state.db.select().from(schema.stockLedger)).toHaveLength(0);
    expect(await state.db.select().from(schema.equipmentUsage)).toHaveLength(0);
    const endpoint = `/api/dpr-sections/${snapshot.dpr.id}/submit`;
    const body = { sectionTokens: snapshot.sectionTokens, headerToken: snapshot.headerToken };
    const responses = await Promise.all([request(app).post(endpoint).send(body), request(app).post(endpoint).send(body)]);
    expect(responses.filter(response => response.status === 200)).toHaveLength(1);
    const logs = await state.db.select().from(schema.stockLedger);
    const usages = await state.db.select().from(schema.equipmentUsage);
    expect(logs).toHaveLength(1);
    expect(Number(logs[0].quantityIn)).toBe(12);
    expect(Number(logs[0].quantityOut)).toBe(12);
    expect(usages).toHaveLength(1);
    expect(usages[0].dprId).toBe(snapshot.dpr.id);
    expect((await fresh(snapshot.dpr.id)).dpr.equipment[0].id).toBe(snapshot.dpr.equipment[0].id);
  });

  it("recovers a saved null project only with same-site BOQ evidence and preserves sibling identities", async () => {
    const [site] = await state.db.insert(schema.sites).values({ name: "SYNTHETIC RECOVERY SITE" }).returning();
    const [project] = await state.db.insert(schema.boqProjects).values({ name: "SYNTHETIC RECOVERY PROJECT", siteId: site.id }).returning();
    const [item] = await state.db.insert(schema.boqItems).values({ boqProjectId: project.id, description: "SYNTHETIC WORK", unit: "CUM" }).returning();
    const ctx = { ...context, site: "synthetic recovery site", date: "2026-09-25" };
    const initial = await save("equipment", { equipment: [{ machine: "SYNTHETIC RECOVERY ROLLER", openingReading: 4 }] }, undefined, ctx);
    const target = { ...ctx, boqProjectId: project.id };
    await expect(save("labour", { labour: [{ category: "Unskilled", count: 1, gender: "Male" }] }, initial, target)).rejects.toThrow(/context cannot be changed/);
    const recovered = await save("activity", { progress: [{ activity: "SYNTHETIC WORK", boqItemId: item.id, entryKey: "recovered-activity" }] }, initial, target);
    expect(recovered.dpr.id).toBe(initial.dpr.id);
    expect(recovered.dpr.equipment[0].id).toBe(initial.dpr.equipment[0].id);
    expect(recovered.dpr.boqProjectId).toBe(project.id);
    expect(recovered.headerToken).not.toBe(initial.headerToken);
    expect(recovered.sectionTokens.equipment).toBe(initial.sectionTokens.equipment);
    await expect(save("equipment", { equipment: [] }, initial, ctx)).rejects.toBeInstanceOf(DprSectionConflict);
    const [other] = await state.db.insert(schema.boqProjects).values({ name: "SYNTHETIC OTHER PROJECT", siteId: site.id }).returning();
    await expect(save("activity", { progress: [] }, recovered, { ...ctx, boqProjectId: other.id })).rejects.toThrow(/context cannot be changed/);
    await expect(save("activity", { progress: [] }, recovered, { ...target, site: context.site })).rejects.toThrow(/does not belong/);
  });

  it("rejects null-project recovery with ambiguous same-name sites or a competing target draft", async () => {
    const [site] = await state.db.insert(schema.sites).values({ name: "SYNTHETIC AMBIGUOUS SITE" }).returning();
    const [project] = await state.db.insert(schema.boqProjects).values({ name: "SYNTHETIC AMBIGUOUS PROJECT", siteId: site.id }).returning();
    const [item] = await state.db.insert(schema.boqItems).values({ boqProjectId: project.id, description: "SYNTHETIC", unit: "CUM" }).returning();
    const ctx = { ...context, site: "synthetic ambiguous site", date: "2026-09-26" };
    const initial = await save("equipment", { equipment: [{ machine: "SYNTHETIC", openingReading: 1 }] }, undefined, ctx);
    const target = { ...ctx, boqProjectId: project.id };
    const competing = await save("labour", { labour: [{ category: "Unskilled", count: 1, gender: "Male" }] }, undefined, target);
    await expect(save("activity", { progress: [{ activity: "SYNTHETIC", boqItemId: item.id }] }, initial, target)).rejects.toThrow(/Another draft/);
    await state.db.update(schema.dprs).set({ isCancelled: true }).where(eq(schema.dprs.id, competing.dpr.id));
    await state.db.insert(schema.sites).values({ name: " synthetic  ambiguous site " });
    await expect(save("activity", { progress: [{ activity: "SYNTHETIC", boqItemId: item.id }] }, initial, target)).rejects.toThrow(/unambiguous matching site/);
    expect((await fresh(initial.dpr.id)).dpr.boqProjectId).toBeNull();
  });

  it("owns site purchases in Materials with validation, status, stable ids and independent tokens", async () => {
    const ctx = { ...context, date: "2026-09-27" };
    const first = await save("materials", { sitePurchases: [{ itemDescription: "SYNTHETIC TOOLS", quantity: 2, amount: 100, uom: "NOS" }] }, undefined, ctx);
    expect(first.sections.materials.state).toBe("ready");
    expect(first.dpr.materials).toHaveLength(0);
    const edited = await save("materials", { sitePurchases: first.dpr.sitePurchases.map((row: any) => ({ ...row, amount: 150 })) }, first, ctx);
    expect(edited.dpr.sitePurchases[0].id).toBe(first.dpr.sitePurchases[0].id);
    expect(edited.sectionTokens.materials).not.toBe(first.sectionTokens.materials);
    const sibling = await save("labour", { labour: [{ category: "Unskilled", count: 1, gender: "Male" }] }, first, ctx);
    expect(sibling.sectionTokens.materials).toBe(edited.sectionTokens.materials);
    expect(sibling.dpr.sitePurchases[0].amount).toBe(150);
    await expect(save("materials", { sitePurchases: [] }, first, ctx)).rejects.toBeInstanceOf(DprSectionConflict);
    await expect(save("materials", { sitePurchases: [{ itemDescription: "SYNTHETIC", quantity: "INVALID" }] }, sibling, ctx)).rejects.toThrow();
    expect(pickDprSectionPayload("materials", sibling.dpr).sitePurchases).toHaveLength(1);
  });

  it("returns create tokens and accepts a token-bearing legacy PATCH without allowing stale overwrite", async () => {
    const ctx = { ...context, date: "2026-09-28" };
    const created = await request(app).post("/api/dprs").send({ ...ctx, engineer: "SYNTHETIC", dprStatus: "draft",
      labour: [{ category: "Unskilled", count: 1, gender: "Male" }] });
    expect(created.status).toBe(201);
    expect(created.body.headerToken).toBeTruthy();
    const payload = { ...ctx, engineer: "SYNTHETIC", dprStatus: "draft", labour: [{ category: "Unskilled", count: 2, gender: "Male" }],
      headerToken: created.body.headerToken, sectionTokens: created.body.sectionTokens };
    const saved = await request(app).patch(`/api/dprs/${created.body.id}/draft`).send(payload);
    expect(saved.status).toBe(200);
    expect(saved.body.labour[0].count).toBe(2);
    expect(saved.body.sectionTokens.labour).not.toBe(created.body.sectionTokens.labour);
    expect((await request(app).patch(`/api/dprs/${created.body.id}/draft`).send(payload)).status).toBe(409);
  });

  it("explicitly rejects unsupported stoppage staging atomically instead of dropping draft fields", async () => {
    const ctx = { ...context, date: "2026-09-29" };
    const response = await request(app).put("/api/dpr-sections/equipment").send({
      context: ctx, data: { engineer: "SYNTHETIC", equipment: [{
        machine: "SYNTHETIC", equipmentId: 1, openingReading: 1,
        breakdowns: [{ clientKey: "SYNTHETIC-STOPPAGE", description: "SYNTHETIC STAGED STOPPAGE", fromTime: "08:00", toTime: "09:00" }],
      }] },
    });
    expect(response.status).toBe(422);
    expect(response.body.message).toMatch(/cannot stage maintenance/);
    expect(await findSectionDrafts(state.db, ctx)).toHaveLength(0);
    expect(await state.db.select().from(schema.equipmentMaintenanceLogs)).toHaveLength(0);
  });
});