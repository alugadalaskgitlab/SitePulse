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
  for (const table of [schema.dprDraftStoppages, schema.equipmentActivitySegments, schema.equipmentActivityAllocations, schema.equipmentActivitySegmentBoqItems, schema.activityPersonnel]) {
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

  it("stages, reopens, edits and submits stoppages with evidence atomically and exactly once", async () => {
    const ctx = { ...context, date: "2026-09-29" };
    const attachment = { fileName: "synthetic.pdf", objectPath: "/objects/synthetic-stoppage.pdf", mimeType: "application/pdf", fileSize: 123 };
    const response = await request(app).put("/api/dpr-sections/equipment").send({
      context: ctx, data: { engineer: "SYNTHETIC", equipment: [{
        machine: "SYNTHETIC", equipmentId: 1, openingReading: 1, closingReading: 3,
        breakdowns: [{ clientKey: "SYNTHETIC-STOPPAGE", description: "SYNTHETIC STAGED STOPPAGE", fromTime: "08:00", toTime: "09:00",
          responsibility: "vendor", repairScope: "hlc", debitableToVendor: true, remarks: "SYNTHETIC REMARK", attachment }],
      }] },
    });
    expect(response.status).toBe(200);
    expect(await state.db.select().from(schema.equipmentMaintenanceLogs)).toHaveLength(0);
    expect(await state.db.select().from(schema.attachments)).toHaveLength(0);
    const reopened = await request(app).get(`/api/dpr-sections/${response.body.dpr.id}`);
    expect(reopened.body.dpr.equipment[0].breakdowns[0].attachment).toEqual(attachment);
    const snap = reopened.body;
    const edited = await request(app).put("/api/dpr-sections/equipment").send({
      context: ctx, dprId: snap.dpr.id, sectionToken: snap.sectionTokens.equipment, headerToken: snap.headerToken,
      data: { equipment: snap.dpr.equipment.map((e: any) => ({ ...e, breakdowns: e.breakdowns.map((b: any) => ({ ...b, toTime: "09:30" })) })) },
    });
    expect(edited.status).toBe(200);
    expect((await state.db.select().from(schema.dprDraftStoppages))[0].toTime).toBe("09:30");
    expect((await request(app).put("/api/dpr-sections/equipment").send({
      context: ctx, dprId: snap.dpr.id, sectionToken: snap.sectionTokens.equipment, headerToken: snap.headerToken,
      data: { equipment: [] },
    })).status).toBe(409);
    // Force failure AFTER maintenance/attachment insert and staging deletion.
    const finalize = vi.spyOn(storage, "finalizeDprEquipmentUsageTx").mockRejectedValueOnce(new Error("SYNTHETIC FINALIZE FAILURE"));
    const endpoint = `/api/dpr-sections/${snap.dpr.id}/submit`;
    const tokenBody = { sectionTokens: edited.body.sectionTokens, headerToken: edited.body.headerToken };
    expect((await request(app).post(endpoint).send(tokenBody)).status).toBe(500);
    finalize.mockRestore();
    expect((await fresh(snap.dpr.id)).dpr.dprStatus).toBe("draft");
    expect(await state.db.select().from(schema.dprDraftStoppages)).toHaveLength(1);
    expect(await state.db.select().from(schema.equipmentMaintenanceLogs)).toHaveLength(0);
    expect(await state.db.select().from(schema.attachments)).toHaveLength(0);
    const results = await Promise.all([request(app).post(endpoint).send(tokenBody), request(app).post(endpoint).send(tokenBody)]);
    expect(results.filter(r => r.status === 200)).toHaveLength(1);
    const [maintenance] = await state.db.select().from(schema.equipmentMaintenanceLogs);
    expect(maintenance).toMatchObject({ description: "SYNTHETIC STAGED STOPPAGE", fromTime: "08:00", toTime: "09:30",
      downtimeHours: 1.5, responsibility: "vendor", repairScope: "hlc", debitableToVendor: true, remarks: "SYNTHETIC REMARK",
      sourceType: "dpr_log", sourceRecordId: snap.dpr.equipment[0].id, status: "open" });
    const evidence = await state.db.select().from(schema.attachments);
    expect(evidence).toHaveLength(1);
    expect(evidence[0]).toMatchObject({ ...attachment, moduleType: "equipment_breakdown", linkedRecordId: maintenance.id });
    expect(await state.db.select().from(schema.dprDraftStoppages)).toHaveLength(0);
  });

  it("preserves staging through legacy omitted nested PATCH, removes explicitly and cascades equipment deletion", async () => {
    const ctx = { ...context, date: "2026-09-30" };
    const created = await request(app).post("/api/dprs").send({ ...ctx, engineer: "SYNTHETIC", dprStatus: "draft",
      equipment: [{ machine: "SYNTHETIC", equipmentId: 1, openingReading: 5, closingReading: 6,
        breakdowns: [{ clientKey: "legacy-stage", description: "SYNTHETIC", fromTime: "10:00", toTime: "11:00" }] }] });
    expect(created.status).toBe(201);
    expect(created.body.equipment[0].breakdowns).toHaveLength(1);
    const { breakdowns, ...withoutNested } = created.body.equipment[0];
    const patched = await request(app).patch(`/api/dprs/${created.body.id}/draft`).send({
      ...created.body, equipment: [withoutNested],
    });
    expect(patched.status).toBe(200);
    expect(patched.body.equipment[0].breakdowns).toEqual(breakdowns);
    const fetched = await request(app).get(`/api/dprs/${created.body.id}`);
    expect(fetched.body.equipment[0].breakdowns).toEqual(breakdowns);
    const initial = await fresh(created.body.id);
    const cleared = await save("equipment", { equipment: initial.dpr.equipment.map((e: any) => ({ ...e, breakdowns: [] })) }, initial, ctx);
    expect(await state.db.select().from(schema.dprDraftStoppages)).toHaveLength(0);
    const restaged = await save("equipment", { equipment: cleared.dpr.equipment.map((e: any) => ({ ...e, breakdowns })) }, cleared, ctx);
    await save("equipment", { equipment: [] }, restaged, ctx);
    expect(await state.db.select().from(schema.dprDraftStoppages)).toHaveLength(0);
  });

  it("rejects incomplete staged stoppages at submit without losing draft data", async () => {
    const ctx = { ...context, date: "2026-10-01" };
    const initial = await save("equipment", { equipment: [{ machine: "SYNTHETIC", equipmentId: 1, openingReading: 1, closingReading: 2,
      breakdowns: [{ clientKey: "incomplete", description: "SYNTHETIC" }] }] }, undefined, ctx);
    const result = await request(app).post(`/api/dpr-sections/${initial.dpr.id}/submit`).send({
      sectionTokens: initial.sectionTokens, headerToken: initial.headerToken,
    });
    expect(result.status).toBe(422);
    expect((await fresh(initial.dpr.id)).dpr.equipment[0].breakdowns[0].clientKey).toBe("incomplete");
    await save("equipment", { equipment: [] }, initial, ctx);
  });

  it("legacy submit uses saved staged evidence and ignores unsaved client replacements", async () => {
    const ctx = { ...context, date: "2026-10-02" };
    const first = await save("equipment", { equipment: [{ machine: "SYNTHETIC", equipmentId: 1, openingReading: 1, closingReading: 2,
      breakdowns: [{ clientKey: "legacy-submit", description: "SAVED LEGACY EVIDENCE", fromTime: "12:00", toTime: "13:00" }] }] }, undefined, ctx);
    const missingIdentity = await request(app).patch(`/api/dprs/${first.dpr.id}/draft`).send({
      ...ctx, engineer: "SYNTHETIC", dprStatus: "draft", headerToken: first.headerToken, sectionTokens: first.sectionTokens,
      equipment: [{ machine: "SYNTHETIC", equipmentId: 1, openingReading: 1, closingReading: 2 }],
    });
    expect(missingIdentity.status, JSON.stringify(missingIdentity.body)).toBe(409);
    const response = await request(app).post(`/api/dprs/${first.dpr.id}/submit`).send({
      headerToken: first.headerToken, sectionTokens: first.sectionTokens, equipment: [],
    });
    expect(response.status).toBe(200);
    expect(await state.db.select().from(schema.dprDraftStoppages)).toHaveLength(0);
    const rows = await state.db.select().from(schema.equipmentMaintenanceLogs)
      .where(eq(schema.equipmentMaintenanceLogs.sourceRecordId, first.dpr.equipment[0].id));
    expect(rows).toHaveLength(1);
    expect(rows[0].description).toBe("SAVED LEGACY EVIDENCE");
  });

  it("rejects forged maintenance ownership and invalid evidence without changing saved staging", async () => {
    const ctx = { ...context, date: "2026-10-03" };
    const initial = await save("equipment", { equipment: [{ machine: "SYNTHETIC", equipmentId: 1, openingReading: 1,
      breakdowns: [{ clientKey: "protected", description: "SYNTHETIC" }] }] }, undefined, ctx);
    await expect(save("equipment", { equipment: initial.dpr.equipment.map((e: any) => ({ ...e,
      breakdowns: [{ clientKey: "forged", maintenanceLogId: 1, description: "SYNTHETIC" }] })) }, initial, ctx)).rejects.toBeInstanceOf(DprSectionConflict);
    await expect(save("equipment", { equipment: initial.dpr.equipment.map((e: any) => ({ ...e,
      breakdowns: [{ clientKey: "invalid", attachment: { fileName: "bad.pdf", objectPath: "https://invalid.example/evidence" } }] })) }, initial, ctx)).rejects.toThrow(/Invalid breakdown attachment/);
    expect((await fresh(initial.dpr.id)).sectionTokens.equipment).toBe(initial.sectionTokens.equipment);
    await save("equipment", { equipment: [] }, initial, ctx);
  });

  it("stages an owned maintenance reference without changing the operational record until submit", async () => {
    const ctx = { ...context, date: "2026-10-04" };
    const initial = await save("equipment", { equipment: [{ machine: "SYNTHETIC", equipmentId: 1, openingReading: 1, closingReading: 2 }] }, undefined, ctx);
    const [existing] = await state.db.insert(schema.equipmentMaintenanceLogs).values({
      equipmentId: 1, date: ctx.date, eventType: "breakdown", status: "resolved", description: "ORIGINAL",
      fromTime: "14:00", toTime: "15:00", downtimeHours: 1, sourceType: "dpr_log", sourceRecordId: initial.dpr.equipment[0].id,
    }).returning();
    const snapshot = await fresh(initial.dpr.id);
    const edited = await save("equipment", { equipment: snapshot.dpr.equipment.map((e: any) => ({
      ...e, breakdowns: e.breakdowns.map((b: any) => ({ ...b, description: "STAGED EDIT" })),
    })) }, snapshot, ctx);
    expect((await state.db.select().from(schema.equipmentMaintenanceLogs).where(eq(schema.equipmentMaintenanceLogs.id, existing.id)))[0].description).toBe("ORIGINAL");
    const legacy = await request(app).patch(`/api/dprs/${initial.dpr.id}/draft`).send({
      ...ctx, engineer: "SYNTHETIC", dprStatus: "draft", equipment: edited.dpr.equipment,
      headerToken: edited.headerToken, sectionTokens: edited.sectionTokens,
    });
    expect(legacy.status).toBe(200);
    expect(legacy.body.equipment[0].id).toBe(initial.dpr.equipment[0].id);
    expect((await state.db.select().from(schema.equipmentMaintenanceLogs).where(eq(schema.equipmentMaintenanceLogs.id, existing.id)))[0].description).toBe("ORIGINAL");
    const beforeRemoval = await fresh(initial.dpr.id);
    const removal = await request(app).patch(`/api/dprs/${initial.dpr.id}/draft`).send({
      ...ctx, engineer: "MUST ROLLBACK", dprStatus: "draft",
      equipment: beforeRemoval.dpr.equipment.map((e: any) => ({ ...e, operator: "MUST ROLLBACK", breakdowns: [] })),
      headerToken: beforeRemoval.headerToken, sectionTokens: beforeRemoval.sectionTokens,
    });
    expect(removal.status).toBe(409);
    expect(removal.body.message).toMatch(/operational maintenance cannot be removed/);
    expect(await fresh(initial.dpr.id)).toEqual(beforeRemoval);
    await expect(save("equipment", { equipment: beforeRemoval.dpr.equipment.map((e: any) => ({ ...e, breakdowns: [] })) },
      beforeRemoval, ctx)).rejects.toThrow(/operational maintenance cannot be removed/);
    expect(await fresh(initial.dpr.id)).toEqual(beforeRemoval);
    expect((await request(app).post(`/api/dpr-sections/${initial.dpr.id}/submit`).send({
      headerToken: legacy.body.headerToken, sectionTokens: legacy.body.sectionTokens,
    })).status).toBe(200);
    const updated = await state.db.select().from(schema.equipmentMaintenanceLogs).where(eq(schema.equipmentMaintenanceLogs.sourceRecordId, initial.dpr.equipment[0].id));
    expect(updated).toHaveLength(1);
    expect(updated[0]).toMatchObject({ id: existing.id, description: "STAGED EDIT", status: "resolved" });
    expect(await state.db.select().from(schema.dprDraftStoppages)).toHaveLength(0);
  });

  it("legacy PATCH preserves omitted and edited allocation, segment and BOQ-link identities", async () => {
    const [site] = await state.db.insert(schema.sites).values({ name: "SYNTHETIC LEGACY ASSIGNMENTS SITE" }).returning();
    const [project] = await state.db.insert(schema.boqProjects).values({ name: "SYNTHETIC ASSIGNMENTS", siteId: site.id }).returning();
    const items = await state.db.insert(schema.boqItems).values([1, 2].map(n => ({
      boqProjectId: project.id, description: `SYNTHETIC WORK ${n}`, unit: "CUM",
    }))).returning();
    const ctx = { ...context, site: "synthetic legacy assignments site", date: "2026-10-05", boqProjectId: project.id };
    const first = await save("equipment", { equipment: [
      { machine: "SYNTHETIC SEGMENT", startTime: "08:00", endTime: "10:00",
        activitySegments: [{ startTime: "08:00", endTime: "10:00", boqItems: [{ boqItemId: items[0].id }] }] },
      { machine: "SYNTHETIC ALLOCATION", startTime: "08:00", endTime: "10:00",
        activityAllocations: [{ startTime: "08:00", endTime: "10:00", boqItemId: items[0].id }] },
    ] }, undefined, ctx);
    const patch = (snap: any, equipment: any[]) => request(app).patch(`/api/dprs/${first.dpr.id}/draft`).send({
      ...ctx, engineer: "SYNTHETIC", dprStatus: "draft", equipment,
      headerToken: snap.headerToken, sectionTokens: snap.sectionTokens,
    });
    const omitted = await patch(first, first.dpr.equipment.map((row: any) => {
      const { activitySegments, activityAllocations, ...fields } = row;
      return { ...fields, operator: "SYNTHETIC OPERATOR" };
    }));
    expect(omitted.status, JSON.stringify(omitted.body)).toBe(200);
    const next = await fresh(first.dpr.id);
    expect(next.dpr.equipment[0].activitySegments).toEqual(first.dpr.equipment[0].activitySegments);
    expect(next.dpr.equipment[1].activityAllocations).toEqual(first.dpr.equipment[1].activityAllocations);
    const edited = await patch(next, next.dpr.equipment.map((e: any) => ({
      ...e, startTime: "09:00", endTime: "11:00",
      ...(e.activitySegments ? { activitySegments: e.activitySegments.map((s: any) => ({
        ...s, startTime: "09:00", endTime: "11:00",
        boqItems: s.boqItems.map((b: any) => ({ ...b, boqItemId: items[1].id })),
      })) } : {}),
      ...(e.activityAllocations ? { activityAllocations: e.activityAllocations.map((a: any) => ({
        ...a, startTime: "09:00", endTime: "11:00", boqItemId: items[1].id,
      })) } : {}),
    })));
    expect(edited.status, JSON.stringify(edited.body)).toBe(200);
    const final = await fresh(first.dpr.id);
    expect(final.dpr.equipment[0].activitySegments).toHaveLength(1);
    expect(final.dpr.equipment[0].activitySegments[0]).toMatchObject({
      id: first.dpr.equipment[0].activitySegments[0].id, startTime: "09:00", endTime: "11:00",
    });
    expect(final.dpr.equipment[0].activitySegments[0].boqItems).toHaveLength(1);
    expect(final.dpr.equipment[0].activitySegments[0].boqItems[0]).toMatchObject({
      id: first.dpr.equipment[0].activitySegments[0].boqItems[0].id, boqItemId: items[1].id,
    });
    expect(final.dpr.equipment[1].activityAllocations).toHaveLength(1);
    expect(final.dpr.equipment[1].activityAllocations[0]).toMatchObject({
      id: first.dpr.equipment[1].activityAllocations[0].id, startTime: "09:00", endTime: "11:00", boqItemId: items[1].id,
    });
  });

  it("makes exact keyed concurrent saves and lost-response retries no-ops without returning stale sibling state", async () => {
    const ctx = { ...context, date: "2026-10-06" };
    const body = {
      context: ctx, clientKey: "synthetic-network-attempt-1",
      data: { engineer: "SYNTHETIC", equipment: [{ machine: "SYNTHETIC RETRY", openingReading: 1 }] },
    };
    const responses = await Promise.all([
      request(app).put("/api/dpr-sections/equipment").send(body),
      request(app).put("/api/dpr-sections/equipment").send(body),
    ]);
    expect(responses.map(r => r.status)).toEqual([200, 200]);
    expect(responses[0].body).toEqual(responses[1].body);
    expect(await findSectionDrafts(state.db, ctx)).toHaveLength(1);
    const first = responses[0].body;
    const sibling = await save("labour", { labour: [{ category: "Unskilled", count: 8, gender: "Male" }] }, first, ctx);
    // Client never received the successful first response; retry exact body
    // after another section changed. Do not replay the old response snapshot.
    const replay = await request(app).put("/api/dpr-sections/equipment").send(body);
    expect(replay.status).toBe(200);
    expect(replay.body.sectionTokens).toEqual(sibling.sectionTokens);
    expect(replay.body.dpr.labour[0].count).toBe(8);
    expect(replay.body.dpr.equipment).toHaveLength(1);
    expect(replay.body.dpr.equipment[0].id).toBe(first.dpr.equipment[0].id);
    expect(replay.body.dpr.lastEditedAt).toBe(sibling.dpr.lastEditedAt.toISOString());
    const mismatch = await request(app).put("/api/dpr-sections/equipment").send({
      ...body, data: { ...body.data, equipment: [{ machine: "DIFFERENT", openingReading: 9 }] },
    });
    expect(mismatch.status).toBe(409);
    expect(mismatch.body.message).toMatch(/save key was already used/);
    const editBody = {
      context: ctx, dprId: first.dpr.id, clientKey: "synthetic-network-attempt-2",
      headerToken: replay.body.headerToken, sectionToken: replay.body.sectionTokens.equipment,
      data: { equipment: replay.body.dpr.equipment.map((e: any) => ({ ...e, closingReading: 2 })) },
    };
    const edit = await request(app).put("/api/dpr-sections/equipment").send(editBody);
    expect(edit.status).toBe(200);
    const stale = await request(app).put("/api/dpr-sections/equipment").send({
      ...editBody, clientKey: "synthetic-genuine-stale-edit",
      data: { equipment: replay.body.dpr.equipment.map((e: any) => ({ ...e, closingReading: 3 })) },
    });
    expect(stale.status).toBe(409);
    expect((await request(app).put("/api/dpr-sections/equipment").send(editBody)).status).toBe(200);
    // Even an old successful first-save retry after a later SAME-section edit
    // acknowledges the prior operation while returning the latest aggregate.
    const oldRetry = await request(app).put("/api/dpr-sections/equipment").send(body);
    expect(oldRetry.status).toBe(200);
    expect(oldRetry.body.dpr.equipment[0].closingReading).toBe(2);
    expect(oldRetry.body.sectionTokens).toEqual(edit.body.sectionTokens);
    const receipts = await state.db.select().from(schema.auditLogs).where(eq(schema.auditLogs.transactionId, first.dpr.id));
    expect(receipts.filter((r: any) => r.newValues?.sectionSaveReceipt)).toHaveLength(2);
  });
});