import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
import express from "express";
import { createServer, type Server } from "http";
import request from "supertest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { asc } from "drizzle-orm";
import { auditLogs } from "@shared/schema";
import { emptyMatrix } from "@shared/permissions";

const { state } = vi.hoisted(() => ({
  state: {
    db: null as any,
    pool: null as any,
    pg: null as any,
    currentUser: null as any,
    permissions: null as any,
  },
}));

vi.mock("../server/db", () => ({
  get db() { return state.db; },
  get pool() { return state.pool; },
}));

vi.mock("../server/auth", () => {
  const inject = (req: any, res: any, next: any) => {
    if (!state.currentUser) return res.status(401).json({ message: "Authentication required" });
    req.authUser = state.currentUser;
    req.authPermissions = state.permissions;
    req.authFeatureAccess = { rolesConfigured: false, legacyPermissions: state.permissions };
    next();
  };
  return {
    requireAuth: inject,
    optionalAuth: inject,
    requireAdmin: inject,
    isPublicApiPath: () => false,
    isOptionalAuthPath: () => false,
    lookupSessionFromCookie: async () => null,
    loadUserPermissionsMatrix: async () => state.permissions,
  };
});

vi.mock("../server/storage", () => {
  class ErrorStub extends Error {}
  const proxy = new Proxy({} as Record<string, any>, {
    get(target, key: string) {
      if (key === "getBoqProject") return async (id: number) => id === 777001 ? { id, name: "Fund plan test", siteId: 9901 } : null;
      if (key === "getSites") return async () => [{ id: 9901, name: "Test Site" }];
      if (key === "getUserPermittedSiteIds") return async () => [9901];
      if (key === "logAudit") return async (entry: any, executor: any = state.db) => {
        const [row] = await executor.insert(auditLogs).values(entry).returning();
        return row;
      };
      if (!(key in target)) target[key] = async () => [];
      return target[key];
    },
  });
  return {
    storage: proxy,
    StockShortageError: ErrorStub,
    EquipmentIncomingConflictError: ErrorStub,
    InsufficientPlantStockError: ErrorStub,
    InvalidDieselPhysicalStockError: ErrorStub,
    InvalidStockTransferQuantityError: ErrorStub,
    InvalidDieselSourceError: ErrorStub,
    DieselReceiptExceedsRemainingError: ErrorStub,
    InvalidLinkedDieselRequirementError: ErrorStub,
    CutFillInsufficientAvailabilityError: ErrorStub,
    CutFillValidationError: ErrorStub,
    AttachmentReferenceError: ErrorStub,
    InitialScopeCorrectionBlockedError: ErrorStub,
    ScopeChangedDuringPlanningError: ErrorStub,
    DprProjectMismatchError: ErrorStub,
    PushSubscriptionOwnershipError: ErrorStub,
    PurchaseIndentRouteCorrectionConflictError: ErrorStub,
    assertValidDieselPhysicalStock: () => {},
    isRecipeManualOverrideError: () => false,
  };
});

vi.mock("../server/push", () => ({
  sendPushToAll: vi.fn().mockResolvedValue(undefined),
  sendTestPush: vi.fn().mockResolvedValue(undefined),
  sendPushToAudience: vi.fn().mockResolvedValue(undefined),
  initPush: vi.fn(),
}));

describe("fund plan persistence routes", () => {
  let pg: PGlite;
  let app: express.Express;
  let server: Server;

  beforeAll(async () => {
    pg = new PGlite();
    await pg.exec(`
      CREATE TABLE users (id integer PRIMARY KEY);
      CREATE TABLE boq_projects (id integer PRIMARY KEY, name text, site_id integer);
      CREATE TABLE audit_logs (
        id serial PRIMARY KEY, module text NOT NULL, transaction_id integer NOT NULL,
        action text NOT NULL, user_id integer, user_name text NOT NULL, user_role text,
        old_values jsonb, new_values jsonb, reason text, stock_impact text,
        created_at timestamp DEFAULT now()
      );
      CREATE TABLE fund_plans (
        id serial PRIMARY KEY, boq_project_id integer NOT NULL REFERENCES boq_projects(id) ON DELETE CASCADE,
        name text NOT NULL, data jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_by integer REFERENCES users(id) ON DELETE SET NULL,
        created_at timestamp NOT NULL DEFAULT now(), updated_at timestamp NOT NULL DEFAULT now()
      );
      CREATE INDEX fund_plans_project_idx ON fund_plans (boq_project_id);
      CREATE INDEX fund_plans_updated_idx ON fund_plans (boq_project_id, updated_at);
      INSERT INTO users (id) VALUES (88);
      INSERT INTO users (id) VALUES (89);
      INSERT INTO boq_projects (id, name, site_id) VALUES (777001, 'Fund plan test', 9901);
    `);
    state.pg = pg;
    state.db = drizzle(pg);
    state.pool = { query: vi.fn(), end: vi.fn() };
    state.currentUser = { id: 88, fullName: "Test Owner", isOwner: true, isAdmin: true, isActive: true };
    state.permissions = emptyMatrix();

    app = express();
    app.use(express.json());
    server = createServer(app);
    const { registerRoutes } = await import("../server/routes");
    await registerRoutes(server, app);
  }, 60_000);

  afterAll(async () => {
    await new Promise<void>(resolve => server?.close(() => resolve()));
    await pg?.close();
  });

  it("saves, reopens, creates a copy, updates and deletes plans with audit rows only", async () => {
    const first = await request(app).post("/api/boq/projects/777001/fund-plans").send({
      name: "Reach 1",
      data: { alreadyDone: "1500", works: { "51": { selected: true, quantity: "16.875" } }, suppliers: { "emulsion|mt": { priceA: "390" } } },
    });
    expect(first.status).toBe(201);
    expect(first.body.name).toBe("Reach 1");

    const reopened = await request(app).get("/api/boq/projects/777001/fund-plans");
    expect(reopened.status).toBe(200);
    expect(reopened.body.plans[0].data.works["51"].quantity).toBe("16.875");

    const updated = await request(app).put(`/api/boq/projects/777001/fund-plans/${first.body.id}`).send({
      name: "Reach 1 revised",
      data: { alreadyDone: "1500", works: { "51": { selected: true, quantity: "20" } } },
    });
    expect(updated.status).toBe(200);
    expect(updated.body.data.works["51"].quantity).toBe("20");

    const second = await request(app).post("/api/boq/projects/777001/fund-plans").send({
      name: "Reach 1 copy",
      data: { works: { "51": { selected: true, quantity: "20" } } },
    });
    expect(second.status).toBe(201);

    const deleted = await request(app).delete(`/api/boq/projects/777001/fund-plans/${first.body.id}`);
    expect(deleted.status).toBe(200);
    const finalList = await request(app).get("/api/boq/projects/777001/fund-plans");
    expect(finalList.body.plans).toHaveLength(1);

    state.currentUser = { id: 90, fullName: "Read Only", isOwner: false, isAdmin: false, isActive: true };
    state.permissions = emptyMatrix();
    const forbidden = await request(app).post("/api/boq/projects/777001/fund-plans").send({
      name: "Should not save",
      data: { works: {} },
    });
    expect(forbidden.status).toBe(403);
    const hiddenPlans = await request(app).get("/api/boq/projects/777001/fund-plans");
    expect(hiddenPlans.status).toBe(403);
    const hiddenPreview = await request(app).post("/api/boq/projects/777001/fund-plan-material-preview").send({ works: [] });
    expect(hiddenPreview.status).toBe(403);

    await pg.exec("INSERT INTO users (id) VALUES (90)");
    state.currentUser = { id: 89, fullName: "Programme Viewer", isOwner: false, isAdmin: false, isActive: true };
    state.permissions = emptyMatrix();
    state.permissions.work_programme.view = true;
    const oldWorkProgrammeGrant = await request(app).get("/api/boq/projects/777001/fund-plans");
    expect(oldWorkProgrammeGrant.status).toBe(403);
    const oldGrantCannotSave = await request(app).post("/api/boq/projects/777001/fund-plans").send({
      name: "Should not save from programme grant",
      data: { works: {} },
    });
    expect(oldGrantCannotSave.status).toBe(403);

    state.permissions.fund_planner.view = true;
    const viewOnlyPlans = await request(app).get("/api/boq/projects/777001/fund-plans");
    expect(viewOnlyPlans.status).toBe(200);
    const viewOnlyCannotSave = await request(app).post("/api/boq/projects/777001/fund-plans").send({
      name: "Should not save from view grant",
      data: { works: {} },
    });
    expect(viewOnlyCannotSave.status).toBe(403);
    const viewOnlyCannotUpdate = await request(app).put(`/api/boq/projects/777001/fund-plans/${second.body.id}`).send({
      name: "Should not update",
      data: { works: {} },
    });
    expect(viewOnlyCannotUpdate.status).toBe(403);
    const viewOnlyCannotDelete = await request(app).delete(`/api/boq/projects/777001/fund-plans/${second.body.id}`);
    expect(viewOnlyCannotDelete.status).toBe(403);

    state.permissions.fund_planner.edit = true;
    const editorSave = await request(app).post("/api/boq/projects/777001/fund-plans").send({
      name: "Editor plan",
      data: { works: {} },
    });
    expect(editorSave.status).toBe(201);

    const planCount = Number((await pg.query("SELECT count(*)::int AS count FROM fund_plans")).rows[0].count);
    const audits = await state.db.select().from(auditLogs).orderBy(asc(auditLogs.id));
    expect(planCount).toBe(2);
    expect(audits.map((row: any) => row.action)).toEqual(["create", "update", "create", "delete", "create"]);
    expect(audits.slice(0, 4).every((row: any) => row.module === "fund_plan" && row.userId === 88)).toBe(true);
    expect(audits[4].userId).toBe(89);
  });
});
