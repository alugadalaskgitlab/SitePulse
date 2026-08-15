/**
 * 06J-HF — route-level regression tests for the plan-outcome endpoints.
 *
 * supertest fires against the REAL registered Express handlers
 * (registerRoutes); `storage` is mocked with controllable fixtures, auth is
 * stubbed to inject a session. Verifies what the seam tests cannot:
 *  - GET execution-summary propagates creditApplied=false → non-comparable
 *    even when raw uom text matches planned uom;
 *  - GET reports credited BOQ-unit quantities (not raw physical);
 *  - POST outcome enforces plan-date-passed using the IST business day;
 *  - POST maps duplicate carry to 409 ALREADY_CARRIED_FORWARD;
 *  - role gating (engineer 403).
 */
import { vi, describe, it, expect, beforeAll } from "vitest";
import express from "express";
import { createServer } from "http";
import request from "supertest";
import { businessToday } from "../shared/planOutcome";

const fx: {
  plan: any;
  executed: { dprExists: boolean; executedByUom: any[]; creditApplied: boolean };
  role: string;
  recordResult: any;
} = {
  plan: null,
  executed: { dprExists: false, executedByUom: [], creditApplied: true },
  role: "manager",
  recordResult: null,
};

vi.mock("../server/push", () => ({
  sendPushToAll: vi.fn().mockResolvedValue(undefined),
  sendTestPush: vi.fn().mockResolvedValue(undefined),
  sendPushToAudience: vi.fn().mockResolvedValue(undefined),
  initPush: vi.fn(),
}));

vi.mock("../server/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../server/auth")>();
  const inject = (req: any, _res: any, next: any) => {
    req.authUser = { id: 9, username: "test-pm", isAdmin: fx.role === "admin", isActive: true };
    req.authPermissions = {};
    req.session = { role: fx.role, username: "test-pm", userId: 9 };
    next();
  };
  return { ...actual, requireAuth: inject, optionalAuth: inject };
});

vi.mock("../server/storage", () => {
  const methods: Record<string, ReturnType<typeof vi.fn>> = {};
  const storageProxy = new Proxy(methods, {
    get(target, prop: string) {
      if (!(prop in target)) target[prop] = vi.fn().mockResolvedValue([]);
      return target[prop];
    },
  });
  methods.getSiteRequirement = vi.fn(async (id: number) => (fx.plan?.id === id ? fx.plan : undefined));
  methods.getSites = vi.fn(async () => [{ id: 7, name: "NH-44 Site" }]);
  methods.getExecutedProgressForPlan = vi.fn(async () => fx.executed);
  methods.recordSiteRequirementOutcome = vi.fn(async () => fx.recordResult);
  return {
    StockShortageError: class StockShortageError extends Error {},
    storage: storageProxy,
  };
});

import { registerRoutes } from "../server/routes";
import { storage } from "../server/storage";

let agent: request.SuperTest<request.Test>;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  const httpServer = createServer(app);
  await registerRoutes(httpServer, app);
  agent = request(app) as any;
});

const basePlan = () => ({
  id: 501,
  date: "2026-08-10", // safely in the past for any tz
  siteId: 7,
  status: "arranged",
  plannedWork: { boqItemId: 11, programmeBarId: null, plannedQty: 350, plannedUom: "Cum" },
  materials: [],
  allocationStatus: {},
});

describe("GET /api/site-requirements/:id/execution-summary", () => {
  it("propagates creditApplied=false → non-comparable even with matching uom text", async () => {
    fx.role = "manager";
    fx.plan = basePlan();
    fx.executed = { dprExists: true, executedByUom: [{ uom: "Cum", qty: 250, entryCount: 2 }], creditApplied: false };
    const res = await agent.get("/api/site-requirements/501/execution-summary");
    expect(res.status).toBe(200);
    expect(res.body.comparable).toBe(false);
    expect(res.body.suggestedBalance).toBeNull();
  });
  it("credited BOQ-unit quantities produce the suggested balance", async () => {
    fx.plan = basePlan();
    fx.executed = { dprExists: true, executedByUom: [{ uom: "Cum", qty: 250, entryCount: 2 }], creditApplied: true };
    const res = await agent.get("/api/site-requirements/501/execution-summary");
    expect(res.status).toBe(200);
    expect(res.body.comparable).toBe(true);
    expect(res.body.executedQty).toBe(250);
    expect(res.body.suggestedBalance).toBe(100);
  });
  it("engineer role is rejected", async () => {
    fx.role = "engineer";
    fx.plan = basePlan();
    const res = await agent.get("/api/site-requirements/501/execution-summary");
    expect(res.status).toBe(403);
  });
});

describe("POST /api/site-requirements/:id/outcome", () => {
  it("rejects when the plan's business date has not passed (IST today)", async () => {
    fx.role = "manager";
    fx.plan = { ...basePlan(), date: businessToday() }; // today in IST
    const res = await agent.post("/api/site-requirements/501/outcome").send({ outcome: "deferred", reason: "Rain / weather" });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("PLAN_DATE_NOT_PASSED");
  });
  it("records a past-date outcome via the atomic storage method", async () => {
    fx.plan = basePlan();
    fx.recordResult = { ok: true, updated: { id: 501 }, newPlan: null };
    const res = await agent.post("/api/site-requirements/501/outcome").send({ outcome: "deferred", reason: "Rain / weather", carryForward: { mode: "none" } });
    expect(res.status).toBe(200);
    expect((storage as any).recordSiteRequirementOutcome).toHaveBeenCalled();
  });
  it("maps duplicate carry-forward to 409 ALREADY_CARRIED_FORWARD", async () => {
    fx.plan = basePlan();
    fx.recordResult = { ok: false, code: "ALREADY_CARRIED_FORWARD", link: { requirementId: 600, date: "2026-08-12" } };
    const res = await agent.post("/api/site-requirements/501/outcome").send({ outcome: "deferred", reason: "Rain / weather", carryForward: { mode: "tomorrow" } });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("ALREADY_CARRIED_FORWARD");
    expect(res.body.link.date).toBe("2026-08-12");
  });
  it("engineer role is rejected", async () => {
    fx.role = "engineer";
    fx.plan = basePlan();
    const res = await agent.post("/api/site-requirements/501/outcome").send({ outcome: "executed" });
    expect(res.status).toBe(403);
  });
});
