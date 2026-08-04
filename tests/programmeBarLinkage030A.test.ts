/**
 * Instruction 030A — Side/width-aware programme bars and direct DPR linkage.
 *
 * Coverage (spec acceptance A/B/D/E/J/L/N/O/P/Q):
 *  • shared/barSide unit tests — side compatibility matrix, chainage parsing,
 *    geometry applicability per layer type.
 *  • POST /api/dprs with linked progress fires the REAL route handler
 *    (registerRoutes + real validateProgressProgrammeLinks) with mocked storage:
 *    side incompatibility, missing/invalid chainage, containment + override
 *    reason, item mismatch, cross-project bar.
 *  • DELETE bar deletion protection — 409 when submitted progress linked,
 *    REASON_REQUIRED on the exceptional path, review-required marking + audit.
 *  • POST bulk-side — invalid side rejected, cross-project bars never touched.
 *  • POST split-by-side — preview (no writes), share validation, in-place
 *    transform of the original bar (links preserved) + new bars inserted.
 */
import { vi, describe, it, expect, beforeAll, beforeEach } from "vitest";
import express from "express";
import { createServer } from "http";
import request from "supertest";
import {
  isDprSideCompatible,
  parseChainageKm,
  formatChainageKm,
  geometryApplicability,
  isBarSide,
} from "../shared/barSide";

// ---------------------------------------------------------------------------
// Unit tests — pure shared helpers
// ---------------------------------------------------------------------------

describe("030A barSide — side compatibility matrix", () => {
  it("side-specific bar accepts only its own side", () => {
    expect(isDprSideCompatible("lhs", "lhs")).toBe(true);
    expect(isDprSideCompatible("lhs", "rhs")).toBe(false);
    expect(isDprSideCompatible("lhs", "full_width")).toBe(false);
    expect(isDprSideCompatible("rhs", "rhs")).toBe(true);
    expect(isDprSideCompatible("rhs", "lhs")).toBe(false);
  });
  it("full_width bar accepts Full Width, LHS and RHS", () => {
    expect(isDprSideCompatible("full_width", "full_width")).toBe(true);
    expect(isDprSideCompatible("full_width", "lhs")).toBe(true);
    expect(isDprSideCompatible("full_width", "rhs")).toBe(true);
  });
  it("both_sides bar requires an explicit executed side", () => {
    expect(isDprSideCompatible("both_sides", "lhs")).toBe(true);
    expect(isDprSideCompatible("both_sides", "rhs")).toBe(true);
    expect(isDprSideCompatible("both_sides", null)).toBe(false);
  });
  it("null planned side is unrestricted (legacy bars stay usable)", () => {
    expect(isDprSideCompatible(null, "lhs")).toBe(true);
    expect(isDprSideCompatible(null, null)).toBe(true);
  });
});

describe("030A barSide — chainage parsing", () => {
  it("parses decimal, +-notation and Km-prefixed strings", () => {
    expect(parseChainageKm("1.900")).toBeCloseTo(1.9, 6);
    expect(parseChainageKm("1+900")).toBeCloseTo(1.9, 6);
    expect(parseChainageKm("Km 1+900")).toBeCloseTo(1.9, 6);
    expect(parseChainageKm("KM 12.345")).toBeCloseTo(12.345, 6);
  });
  it("returns null for garbage / empty input", () => {
    expect(parseChainageKm("")).toBeNull();
    expect(parseChainageKm("abc")).toBeNull();
    expect(parseChainageKm(null as any)).toBeNull();
  });
  it("round-trips through formatChainageKm", () => {
    expect(formatChainageKm(parseChainageKm("1+900"))).toBe("1+900");
  });
});

describe("030A barSide — geometry applicability by layer type", () => {
  it("bituminous/granular: side+width+thickness+suggestQty", () => {
    for (const t of ["bituminous", "granular"]) {
      const g = geometryApplicability(t);
      expect(g).toMatchObject({ side: true, width: true, thickness: true, suggestQty: true });
    }
  });
  it("earthwork: side only; concrete: no qty suggestion; unknown: none", () => {
    expect(geometryApplicability("earthwork")).toMatchObject({ side: true, width: false, thickness: false, suggestQty: false });
    expect(geometryApplicability("concrete")).toMatchObject({ side: true, width: true, thickness: true, suggestQty: false });
    expect(geometryApplicability(null)).toMatchObject({ side: false, width: false, thickness: false, suggestQty: false });
  });
});

// ---------------------------------------------------------------------------
// Route-level tests — real handlers, mocked storage/auth/push
// ---------------------------------------------------------------------------

const PROJECT_ID = 830001;
const OTHER_PROJECT_ID = 830002;

const fx = {
  bars: [] as any[],
  submittedLinkCounts: new Map<number, number>(),
  allocationsForBar: [] as any[],
};

const calls = {
  updated: [] as Array<{ id: number; data: any }>,
  deleted: [] as number[],
  upserted: [] as any[],
  audits: [] as any[],
  reviewMarked: [] as number[],
  createdDprs: [] as any[],
};

vi.mock("../server/push", () => ({
  sendPushToSection: vi.fn().mockResolvedValue(undefined),
  sendTestPush: vi.fn().mockResolvedValue(undefined),
  sendPushToAudience: vi.fn().mockResolvedValue(undefined),
  initPush: vi.fn(),
}));

vi.mock("../server/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../server/auth")>();
  const fakeAdmin = { id: 1, username: "test-admin", isAdmin: true, isActive: true, sessionPolicy: "sticky" };
  const inject = (req: any, _res: any, next: any) => {
    req.authUser = fakeAdmin;
    req.authPermissions = {};
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

  methods.getWorkProgramBar = vi.fn(async (id: number) => fx.bars.find(b => b.id === id) ?? undefined);
  methods.getWorkProgramBars = vi.fn(async (projectId: number) => fx.bars.filter(b => b.boqProjectId === projectId));
  methods.getSubmittedProgressLinkCounts = vi.fn(async () => fx.submittedLinkCounts);
  methods.getActiveAllocationsForBar = vi.fn(async () => fx.allocationsForBar);
  methods.markProgressLinksReviewRequired = vi.fn(async (barId: number) => {
    calls.reviewMarked.push(barId);
    return [9001, 9002];
  });
  methods.updateWorkProgramBar = vi.fn(async (id: number, data: any) => {
    calls.updated.push({ id, data });
    return { id, ...data };
  });
  methods.deleteWorkProgramBar = vi.fn(async (id: number) => { calls.deleted.push(id); });
  methods.upsertWorkProgramBar = vi.fn(async (data: any) => {
    calls.upserted.push(data);
    return { id: 91000 + calls.upserted.length, ...data };
  });
  methods.logAudit = vi.fn(async (entry: any) => { calls.audits.push(entry); });
  methods.createDpr = vi.fn(async (input: any) => {
    calls.createdDprs.push(input);
    return { id: 5001, ...input };
  });
  methods.createNotification = vi.fn(async () => ({}));
  methods.getReportedQtyByBar = vi.fn(async () => new Map());
  methods.getArrangementProgrammeAllocationsForProject = vi.fn(async () => []);

  return { storage: storageProxy };
});

let app: express.Express;

beforeAll(async () => {
  const { registerRoutes } = await import("../server/routes");
  app = express();
  app.use(express.json());
  const httpServer = createServer(app);
  await registerRoutes(httpServer, app);
});

function roadBar(overrides: Record<string, unknown> = {}) {
  return {
    id: 7001,
    boqProjectId: PROJECT_ID,
    boqItemId: 601,
    reachLabel: "Reach 1",
    chainageFrom: 100,
    chainageTo: 110,
    plannedQty: 15000,
    source: "auto-sequence",
    side: null,
    scheduled: true,
    planningMode: null,
    ...overrides,
  };
}

function dprBody(progressOverrides: Record<string, unknown> = {}) {
  return {
    date: "2026-08-04",
    site: "Test Site",
    engineer: "Test Engineer",
    role: "engineer",
    workType: "road",
    boqProjectId: PROJECT_ID,
    progress: [{
      activity: "GSB LAYING",
      side: "LHS",
      chainageFrom: "100+000",
      chainageTo: "101+000",
      chainageFromKm: 100,
      chainageToKm: 101,
      length: 1000,
      width: 5.5,
      thickness: 0.2,
      quantity: 1100,
      uom: "CUM",
      noSiteWork: false,
      boqItemId: 601,
      programmeBarId: 7001,
      ...progressOverrides,
    }],
    equipment: [],
    labour: [],
    materials: [],
  };
}

function resetFx() {
  fx.bars = [roadBar()];
  fx.submittedLinkCounts = new Map();
  fx.allocationsForBar = [];
  calls.updated = [];
  calls.deleted = [];
  calls.upserted = [];
  calls.audits = [];
  calls.reviewMarked = [];
  calls.createdDprs = [];
}

beforeEach(resetFx);

describe("030A route — DPR programme link validation (POST /api/dprs)", () => {
  it("accepts a compatible link (LHS entry on an LHS bar) and creates the DPR", async () => {
    fx.bars = [roadBar({ side: "lhs" })];
    const res = await request(app).post("/api/dprs").send(dprBody());
    expect(res.status).toBeLessThan(300);
    expect(calls.createdDprs).toHaveLength(1);
  });

  it("blocks RHS work against an LHS-planned bar with PROGRAMME_LINK_INVALID", async () => {
    fx.bars = [roadBar({ side: "lhs" })];
    const res = await request(app).post("/api/dprs").send(dprBody({ side: "RHS" }));
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("PROGRAMME_LINK_INVALID");
    expect(calls.createdDprs).toHaveLength(0);
  });

  it("full_width bar accepts an LHS entry; both_sides bar demands an explicit side", async () => {
    fx.bars = [roadBar({ side: "full_width" })];
    let res = await request(app).post("/api/dprs").send(dprBody({ side: "LHS" }));
    expect(res.status).toBeLessThan(300);

    resetFx();
    fx.bars = [roadBar({ side: "both_sides" })];
    res = await request(app).post("/api/dprs").send(dprBody({ side: "" }));
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("PROGRAMME_LINK_INVALID");
  });

  it("legacy null-side bar is unrestricted — never silently treated as Full Width, but fully usable", async () => {
    const res = await request(app).post("/api/dprs").send(dprBody({ side: "RHS" }));
    expect(res.status).toBeLessThan(300);
  });

  it("requires chainage From/To for linear work and To > From", async () => {
    let res = await request(app).post("/api/dprs").send(
      dprBody({ chainageFrom: "", chainageTo: "", chainageFromKm: null, chainageToKm: null }),
    );
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("PROGRAMME_LINK_INVALID");

    res = await request(app).post("/api/dprs").send(
      dprBody({ chainageFromKm: 105, chainageToKm: 103 }),
    );
    expect(res.status).toBe(400);
  });

  it("blocks out-of-range chainage without a reason; allows it with chainageOverrideReason", async () => {
    let res = await request(app).post("/api/dprs").send(
      dprBody({ chainageFromKm: 111, chainageToKm: 112, chainageOverrideReason: "" }),
    );
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("PROGRAMME_LINK_INVALID");

    res = await request(app).post("/api/dprs").send(
      dprBody({ chainageFromKm: 111, chainageToKm: 112, chainageOverrideReason: "Client instructed extension beyond planned stretch" }),
    );
    expect(res.status).toBeLessThan(300);
    expect(calls.createdDprs).toHaveLength(1);
  });

  it("rejects BOQ-item mismatch and cross-project bars", async () => {
    let res = await request(app).post("/api/dprs").send(dprBody({ boqItemId: 999 }));
    expect(res.status).toBe(400);

    fx.bars = [roadBar({ boqProjectId: OTHER_PROJECT_ID })];
    res = await request(app).post("/api/dprs").send(dprBody());
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("PROGRAMME_LINK_INVALID");
  });

  it("unlinked progress entries are untouched by the validator", async () => {
    const res = await request(app).post("/api/dprs").send(dprBody({ programmeBarId: null, side: "" }));
    expect(res.status).toBeLessThan(300);
  });
});

describe("030A route — bar deletion protection (DELETE /api/boq/programme/bars/:id)", () => {
  it("deletes freely when no submitted progress is linked", async () => {
    const res = await request(app).delete("/api/boq/programme/bars/7001");
    expect(res.status).toBe(200);
    expect(calls.deleted).toEqual([7001]);
    expect(calls.reviewMarked).toHaveLength(0);
  });

  it("blocks ordinary deletion with 409 DPR_PROGRESS_LINKED when submitted progress exists", async () => {
    fx.submittedLinkCounts = new Map([[7001, 3]]);
    const res = await request(app).delete("/api/boq/programme/bars/7001");
    expect(res.status).toBe(409);
    expect(res.body.error).toBe("DPR_PROGRESS_LINKED");
    expect(res.body.linkedProgressCount).toBe(3);
    expect(calls.deleted).toHaveLength(0);
  });

  it("exceptional path requires a reason", async () => {
    fx.submittedLinkCounts = new Map([[7001, 1]]);
    const res = await request(app).delete("/api/boq/programme/bars/7001?force=true");
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("REASON_REQUIRED");
    expect(calls.deleted).toHaveLength(0);
  });

  it("exceptional deletion marks links review-required, deletes and audits", async () => {
    fx.submittedLinkCounts = new Map([[7001, 2]]);
    const res = await request(app)
      .delete("/api/boq/programme/bars/7001?force=true")
      .send({ reason: "Bar was created against the wrong item entirely" });
    expect(res.status).toBe(200);
    expect(res.body.exceptional).toBe(true);
    expect(res.body.affectedProgressEntryIds).toEqual([9001, 9002]);
    expect(calls.reviewMarked).toEqual([7001]);
    expect(calls.deleted).toEqual([7001]);
    const audit = calls.audits.find(a => a.module === "work_programme" && a.action === "delete");
    expect(audit).toBeTruthy();
    expect(audit.reason).toContain("wrong item");
  });
});

describe("030A route — bulk side confirmation", () => {
  it("rejects invalid sides", async () => {
    const res = await request(app)
      .post(`/api/boq/projects/${PROJECT_ID}/programme/bulk-side`)
      .send({ side: "median", barIds: [7001] });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("INVALID_SIDE");
  });

  it("updates only bars belonging to the project", async () => {
    fx.bars = [roadBar(), roadBar({ id: 7002, boqProjectId: OTHER_PROJECT_ID })];
    const res = await request(app)
      .post(`/api/boq/projects/${PROJECT_ID}/programme/bulk-side`)
      .send({ side: "full_width", barIds: [7001, 7002] });
    expect(res.status).toBe(200);
    expect(res.body.updated).toBe(1);
    expect(calls.updated).toEqual([{ id: 7001, data: { side: "full_width" } }]);
  });
});

describe("030A route — split bar by side", () => {
  it("requires at least two parts and shares summing to 100%", async () => {
    let res = await request(app)
      .post("/api/boq/programme/bars/7001/split-by-side")
      .send({ parts: [{ side: "lhs" }] });
    expect(res.status).toBe(400);

    res = await request(app)
      .post("/api/boq/programme/bars/7001/split-by-side")
      .send({ parts: [{ side: "lhs", qtyShare: 0.7 }, { side: "rhs", qtyShare: 0.7 }] });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("QTY_SHARES_INVALID");
  });

  it("preview returns allocation + linked context without any writes (never divides by 2 blindly — shares are explicit or equal)", async () => {
    fx.submittedLinkCounts = new Map([[7001, 4]]);
    fx.allocationsForBar = [{ arrangementId: 55 }];
    const res = await request(app)
      .post("/api/boq/programme/bars/7001/split-by-side")
      .send({ preview: true, parts: [{ side: "lhs", qtyShare: 0.6 }, { side: "rhs", qtyShare: 0.4 }] });
    expect(res.status).toBe(200);
    expect(res.body.preview).toBe(true);
    expect(res.body.allocation).toEqual([
      { side: "lhs", qty: 9000 },
      { side: "rhs", qty: 6000 },
    ]);
    expect(res.body.linkedDprProgressCount).toBe(4);
    expect(res.body.linkedArrangementIds).toEqual([55]);
    expect(calls.updated).toHaveLength(0);
    expect(calls.upserted).toHaveLength(0);
  });

  it("commit transforms the original bar in place (links preserved) and inserts the other side", async () => {
    const res = await request(app)
      .post("/api/boq/programme/bars/7001/split-by-side")
      .send({ parts: [{ side: "lhs" }, { side: "rhs" }] });
    expect(res.status).toBe(200);
    expect(res.body.updatedBarId).toBe(7001);
    // Original bar updated — never deleted — so DPR/arrangement links survive.
    expect(calls.deleted).toHaveLength(0);
    expect(calls.updated).toEqual([{ id: 7001, data: { side: "lhs", plannedQty: 7500 } }]);
    expect(calls.upserted).toHaveLength(1);
    expect(calls.upserted[0]).toMatchObject({ side: "rhs", plannedQty: 7500, source: "manual", boqItemId: 601 });
    expect(res.body.newBarIds).toHaveLength(1);
  });
});
