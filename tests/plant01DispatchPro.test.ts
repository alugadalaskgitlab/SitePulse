import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import { createServer } from "http";
import request from "supertest";

const dbState = vi.hoisted(() => ({
  updateValues: [] as any[],
  dispatch: {
    id: 23,
    dispatchProStatus: null as string | null,
    dispatchProChallanNo: null as string | null,
    dispatchProArrivedAt: null as Date | null,
    dispatchProArrivedByName: null as string | null,
    dispatchProLeftAt: null as Date | null,
    dispatchProLeftByName: null as string | null,
  },
}));
vi.mock("../server/db", () => ({
  db: {
    select: vi.fn(() => ({
      from: () => ({
        where: () => ({
          limit: async () => [dbState.dispatch],
        }),
      }),
    })),
    update: vi.fn(() => ({
      set: (value: any) => {
        dbState.updateValues.push(value);
        return {
          where: () => ({
            returning: async () => {
              Object.assign(dbState.dispatch, value);
              return [dbState.dispatch];
            },
          }),
        };
      },
    })),
  },
  pool: { connect: vi.fn() },
}));

import {
  dispatchProKeyMatches,
  getDispatchProSites,
  sendDispatchProOutboxRow,
} from "../server/dispatchProOutbox";
import { registerRoutes } from "../server/routes";

const app = express();
app.use(express.json());
const server = createServer(app);
const routesReady = registerRoutes(server, app);

describe("PLANT-01 DispatchPro integration", () => {
  const originalSecret = process.env.SITEPULSE_SHARED_SECRET;
  const originalBaseUrl = process.env.DISPATCHPRO_BASE_URL;

  beforeEach(() => {
    dbState.updateValues.length = 0;
    Object.assign(dbState.dispatch, {
      dispatchProStatus: null,
      dispatchProChallanNo: null,
      dispatchProArrivedAt: null,
      dispatchProArrivedByName: null,
      dispatchProLeftAt: null,
      dispatchProLeftByName: null,
    });
    process.env.SITEPULSE_SHARED_SECRET = "test-only-sitepulse-key";
    process.env.DISPATCHPRO_BASE_URL = "https://dispatchpro.example.test";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    if (originalSecret === undefined) delete process.env.SITEPULSE_SHARED_SECRET;
    else process.env.SITEPULSE_SHARED_SECRET = originalSecret;
    if (originalBaseUrl === undefined) delete process.env.DISPATCHPRO_BASE_URL;
    else process.env.DISPATCHPRO_BASE_URL = originalBaseUrl;
  });

  it("validates the shared integration key without accepting near matches", () => {
    expect(dispatchProKeyMatches("test-only-sitepulse-key")).toBe(true);
    expect(dispatchProKeyMatches("test-only-sitepulse-key ")).toBe(false);
    expect(dispatchProKeyMatches(undefined)).toBe(false);
  });

  it("loads linked site choices using the shared-key header", async () => {
    const fetchMock = vi.fn(async (_url: string | URL, init?: RequestInit) => {
      expect(new Headers(init?.headers).get("X-SitePulse-Key")).toBe("test-only-sitepulse-key");
      return new Response(JSON.stringify({ sites: [{ id: 12, name: "Alladurg PWD Road" }, { id: "13", name: "Plant Yard" }] }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(getDispatchProSites()).resolves.toEqual([
      { id: "12", name: "Alladurg PWD Road" },
      { id: "13", name: "Plant Yard" },
    ]);
    expect(String(fetchMock.mock.calls[0][0])).toContain("/api/integrations/sitepulse/sites");
  });

  it("stores a successful create response and challan against the dispatch", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      JSON.stringify({ id: "dp-22", challanNo: "DP/2026/22", status: "CREATED" }),
      { status: 201 },
    )));

    await sendDispatchProOutboxRow({
      id: 1,
      dispatch_id: 22,
      external_ref: "SP-22",
      operation: "create",
      payload: { externalRef: "SP-22", siteId: "12", vehicleNo: "TG12UH4799", loadMT: 18.5, mixType: "BC" },
      attempt_count: 1,
      created_at: new Date(),
    });

    expect(dbState.updateValues).toContainEqual(expect.objectContaining({
      dispatchProSyncStatus: "sent",
      dispatchProId: "dp-22",
      dispatchProChallanNo: "DP/2026/22",
      dispatchProStatus: "CREATED",
    }));
  });

  it("keeps a local edit and marks a rejected remote patch as not updated", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      JSON.stringify({ message: "Dispatch already unloaded." }),
      { status: 409 },
    )));

    await sendDispatchProOutboxRow({
      id: 2,
      dispatch_id: 23,
      external_ref: "SP-23",
      operation: "patch",
      payload: { externalRef: "SP-23", vehicleNo: "TG12UH4799", loadMT: 19 },
      attempt_count: 1,
      created_at: new Date(),
    });

    expect(dbState.updateValues).toContainEqual(expect.objectContaining({
      dispatchProSyncStatus: "not_updated",
      dispatchProLastError: "Dispatch already unloaded.",
    }));
  });

  it("retries temporary DispatchPro failures with backoff", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      JSON.stringify({ message: "Temporary outage." }),
      { status: 503 },
    )));

    await sendDispatchProOutboxRow({
      id: 3,
      dispatch_id: 24,
      external_ref: "SP-24",
      operation: "create",
      payload: { externalRef: "SP-24", siteId: "12", vehicleNo: "TG12UH4799", loadMT: 18.5, mixType: "BC" },
      attempt_count: 2,
      created_at: new Date(),
    });

    const retry = dbState.updateValues.find(value => value.status === "retry");
    expect(retry?.lastError).toBe("Temporary outage.");
    expect(retry?.nextAttemptAt.getTime()).toBeGreaterThan(Date.now());
    expect(dbState.updateValues).toContainEqual(expect.objectContaining({
      dispatchProSyncStatus: "waiting",
      dispatchProLastError: "Temporary outage.",
    }));
  });

  it("accepts unauthenticated, keyed, idempotent status callbacks", async () => {
    await routesReady;
    const response = await request(app)
      .post("/api/integrations/dispatchpro/status")
      .set("X-SitePulse-Key", "test-only-sitepulse-key")
      .send({
        externalRef: "SP-23",
        challanNo: "DP/2026/23",
        status: "LEFT",
        at: "2026-11-10T12:30:00.000Z",
        byName: "Plant operator",
      });

    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(response.body.success).toBe(true);
    expect(dbState.updateValues.at(-1)).toEqual(expect.objectContaining({
      dispatchProStatus: "LEFT",
      dispatchProChallanNo: "DP/2026/23",
    }));

    const duplicate = await request(app)
      .post("/api/integrations/dispatchpro/status")
      .set("X-SitePulse-Key", "test-only-sitepulse-key")
      .send({
        externalRef: "SP-23",
        challanNo: "DP/2026/23",
        status: "ARRIVED",
        at: "2026-11-10T12:31:00.000Z",
        byName: "Plant operator",
      });
    expect(duplicate.status).toBe(200);
    expect(dbState.updateValues.at(-1).dispatchProStatus).toBe("LEFT");

    const unauthorized = await request(app)
      .post("/api/integrations/dispatchpro/status")
      .set("X-SitePulse-Key", "wrong-key")
      .send({
        externalRef: "SP-23",
        challanNo: "DP/2026/23",
        status: "ARRIVED",
        at: "2026-11-10T12:31:00.000Z",
        byName: "Plant operator",
      });
    expect(unauthorized.status).toBe(401);
  });
});
