/**
 * Instruction 028B — Real route-level regression tests for bituminous procurement.
 *
 * Strategy
 * --------
 * • supertest fires GET /api/boq/projects/:id/shortage-check against the REAL
 *   registered Express handler (registerRoutes), with the REAL calculateBomDemand
 *   and computeShortageRow — no route logic is mirrored in this file.
 * • `storage` is mocked with controllable fixtures (per-project data below).
 * • `server/auth` requireAuth/optionalAuth are stubbed to inject a fake admin
 *   session so the request reaches the handler (the auth middleware itself is
 *   covered by tests/write-endpoints-auth.test.ts).
 * • `server/push` is mocked to avoid the VAPID key requirement.
 *
 * Scenarios (per spec):
 *   B — fully outsourced DBM: zero company actionable, agency split serialized;
 *   C — mapping warning when a responsibility has no matching recipe resource;
 *   D — earthwork regression: legacy earthwork fields + behaviour unchanged;
 *   E — draft bituminous arrangement: context surfaces, demand NOT excluded.
 *
 * Mutation check (done during development, not committed): reverting the route
 * gate to `isEarthworkBulkRequirement`-only makes the Part B assertions on
 * workCategory / arrangementAgencyQty / companyActionableQty fail.
 */
import { vi, describe, it, expect, beforeAll } from "vitest";
import express from "express";
import { createServer } from "http";
import request from "supertest";

// ---------------------------------------------------------------------------
// Fixtures — mutable so each describe block can point the mocked storage at a
// different project scenario without re-registering routes.
// ---------------------------------------------------------------------------

const PROJECT_ID = 777001;

const project = {
  id: PROJECT_ID,
  name: "028B Route Test Project",
  startDate: "2026-01-01",
  status: "active",
};

/** DBM item — layerConfig drives IRC-default bituminous derivation (no mix template needed). */
function dbmBoqItem() {
  return {
    id: 501,
    projectId: PROJECT_ID,
    itemCode: "5.4",
    itemName: null,
    description:
      "Providing and laying Dense Bituminous Macadam with VG-40 bitumen as per MoRTH 505",
    unit: "MT",
    canonicalUnit: "MT",
    currentQty: 10000,
    includedInPlanning: true,
    layerConfig: { layerType: "bituminous", mixType: "DBM" },
    materials: [],
    equipment: [],
    labour: [],
  };
}

/** Earthwork embankment item — legacy earthwork arrangement path. */
function embankmentBoqItem() {
  return {
    id: 502,
    projectId: PROJECT_ID,
    itemCode: "3.1",
    itemName: null,
    description:
      "Construction of embankment with approved borrow earth compacted as per MoRTH 305",
    unit: "Cum",
    canonicalUnit: "Cum",
    currentQty: 50000,
    includedInPlanning: true,
    layerConfig: null,
    materials: [],
    equipment: [],
    labour: [],
  };
}

function barsFor(items: Array<{ id: number; currentQty: number }>) {
  return items.map((it, i) => ({
    id: 9100 + i,
    projectId: PROJECT_ID,
    boqItemId: it.id,
    chainageFrom: null,
    chainageTo: null,
    startMonth: 1,
    endMonth: 6,
    plannedQty: it.currentQty,
    isQtyOverride: false,
  }));
}

function bituminousArrangement(overrides: Record<string, unknown> = {}) {
  return {
    id: 8001,
    projectId: PROJECT_ID,
    boqItemId: 501,
    boqItemAllocations: null,
    workCategory: "bituminous",
    bituminousItemType: "dbm",
    arrangementType: "complete_supply_and_lay",
    status: "approved",
    allocatedQty: 10000,
    uom: "MT",
    materialLabel: "DBM complete outsourcing",
    agencyName: "M/s BlackTop Infra",
    components: {
      binder_bitumen: "agency",
      coarse_aggregates: "agency",
      fine_aggregates: "agency",
      filler: "agency",
      hot_mix_plant: "agency",
      paver: "agency",
      rollers: "agency",
      tippers_transport: "agency",
      crew: "agency",
      fuel: "agency",
    },
    sharedComponentSplits: null,
    sourceExcavationBoqItemId: null,
    ...overrides,
  };
}

function earthworkArrangement(overrides: Record<string, unknown> = {}) {
  return {
    id: 8002,
    projectId: PROJECT_ID,
    boqItemId: 502,
    boqItemAllocations: null,
    workCategory: null, // legacy earthwork rows have null workCategory
    bituminousItemType: null,
    arrangementType: "fully_outsourced_composite",
    status: "approved",
    allocatedQty: 50000,
    uom: "Cum",
    materialLabel: "Borrow Earth",
    agencyName: "M/s EarthMovers",
    components: {
      material_source: "agency",
      excavation: "agency",
      loading: "agency",
      transport: "agency",
      spreading: "hlc",
      compaction: "hlc",
    },
    sharedComponentSplits: null,
    sourceExcavationBoqItemId: null,
    ...overrides,
  };
}

/** Per-scenario mutable state consumed by the storage mock. */
const fx = {
  boqItems: [] as any[],
  bars: [] as any[],
  arrangements: [] as any[],
  barAllocations: [] as any[],
};

// ---------------------------------------------------------------------------
// Mocks — hoisted before importing server/routes
// ---------------------------------------------------------------------------

vi.mock("../server/push", () => ({
  sendPushToAll: vi.fn().mockResolvedValue(undefined),
  sendTestPush: vi.fn().mockResolvedValue(undefined),
  sendPushToAudience: vi.fn().mockResolvedValue(undefined),
  initPush: vi.fn(),
}));

vi.mock("../server/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../server/auth")>();
  const fakeAdmin = {
    id: 1,
    username: "test-admin",
    isAdmin: true,
    isActive: true,
    sessionPolicy: "sticky",
  };
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
      if (!(prop in target)) {
        target[prop] = vi.fn().mockResolvedValue([]);
      }
      return target[prop];
    },
  });

  // Scenario-aware overrides (read the mutable `fx` at call time).
  methods.getBoqProject = vi.fn(async (id: number) =>
    id === PROJECT_ID ? project : undefined,
  );
  methods.getBoqItemsWithRecipes = vi.fn(async () => fx.boqItems);
  methods.getWorkProgramBars = vi.fn(async () => fx.bars);
  methods.getEarthworkArrangements = vi.fn(async () => fx.arrangements);
  methods.getArrangementProgrammeAllocationsForProject = vi.fn(
    async () => fx.barAllocations,
  );
  // Everything else (stock, PIs, IRNs, mappings, plant materials, mix links,
  // templates, RMC designs, UOM conversions, allocations, …) → [] via proxy.

  return {
    StockShortageError: class StockShortageError extends Error {
      constructor(msg: string) {
        super(msg);
        this.name = "StockShortageError";
      }
    },
    storage: storageProxy,
  };
});

import { registerRoutes } from "../server/routes";

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

let app: express.Express;

beforeAll(async () => {
  app = express();
  app.use(express.json());
  const httpServer = createServer(app);
  await registerRoutes(httpServer, app);
});

async function shortageCheck() {
  const res = await request(app).get(
    `/api/boq/projects/${PROJECT_ID}/shortage-check?horizonMode=entire_programme`,
  );
  expect(res.status).toBe(200);
  return res.body as {
    rows: any[];
    mappingWarnings?: any[];
  };
}

const rowByName = (rows: any[], re: RegExp) =>
  rows.find((r) => re.test(String(r.materialName)));

// ---------------------------------------------------------------------------
// PART B — fully outsourced DBM through the real route
// ---------------------------------------------------------------------------

describe("028B Part B — fully outsourced DBM via real shortage-check route", () => {
  it("serializes bituminous arrangement context with zero company actionable", async () => {
    fx.boqItems = [dbmBoqItem()];
    fx.bars = barsFor(fx.boqItems);
    fx.arrangements = [bituminousArrangement()];
    fx.barAllocations = [];

    const body = await shortageCheck();
    expect(Array.isArray(body.rows)).toBe(true);

    const binder = rowByName(body.rows, /bitumen\s*vg-?40/i);
    expect(binder, "Bitumen VG-40 row must exist").toBeTruthy();

    // Generic bituminous arrangement context — these assertions fail if the
    // route gate is reverted to isEarthworkBulkRequirement-only.
    expect(binder.workCategory).toBe("bituminous");
    expect(Array.isArray(binder.executionArrangements)).toBe(true);
    expect(binder.executionArrangements.map((a: any) => a.id)).toContain(8001);
    expect(binder.executionArrangements[0].status).toBe("approved");

    // Physical demand stays represented; agency covers all of it.
    expect(binder.totalDemand).toBeGreaterThan(0);
    expect(binder.arrangementAgencyQty).toBeCloseTo(binder.totalDemand, 1);
    expect(binder.arrangementOutsourcedQty).toBeCloseTo(binder.totalDemand, 1);
    expect(binder.arrangementCompanyQty).toBeCloseTo(0, 3);
    expect(binder.arrangementHlcQty).toBeCloseTo(0, 3);
    expect(binder.arrangementCompanyFraction).toBeCloseTo(0, 4);

    // Company-facing quantities are zero — the route must NOT return the
    // original full actionable bitumen shortfall.
    expect(binder.companyActionableQty).toBeCloseTo(0, 3);
    expect(binder.actionableShortfall).toBeCloseTo(0, 3);
    expect(typeof binder.procurementStatus).toBe("string");

    // Aggregates too — full outsourcing covers every material of the item.
    const agg = rowByName(body.rows, /aggregate/i);
    expect(agg, "aggregate row must exist").toBeTruthy();
    expect(agg.workCategory).toBe("bituminous");
    expect(agg.actionableShortfall).toBeCloseTo(0, 3);
  });

  it("without any arrangement the same DBM item yields full actionable shortfall", async () => {
    fx.boqItems = [dbmBoqItem()];
    fx.bars = barsFor(fx.boqItems);
    fx.arrangements = [];
    fx.barAllocations = [];

    const body = await shortageCheck();
    const binder = rowByName(body.rows, /bitumen\s*vg-?40/i);
    expect(binder).toBeTruthy();
    expect(binder.workCategory).toBeUndefined();
    expect(binder.executionArrangements ?? undefined).toBeUndefined();
    expect(binder.actionableShortfall).toBeGreaterThan(0);
    expect(binder.actionableShortfall).toBeCloseTo(binder.totalDemand, 1);
  });
});

// ---------------------------------------------------------------------------
// PART C — mapping warning when responsibility has no matching recipe resource
// ---------------------------------------------------------------------------

describe("028B Part C — mapping warnings via real route", () => {
  it("responsibility with no matching recipe resource warns and excludes nothing extra", async () => {
    // DBM item WITHOUT equipment in the recipe; arrangement assigns paver to
    // agency → DEMAND_COMPONENT_MAPPING_MISSING, and nothing is excluded for it.
    fx.boqItems = [dbmBoqItem()];
    fx.bars = barsFor(fx.boqItems);
    fx.arrangements = [
      bituminousArrangement({
        components: {
          binder_bitumen: "hlc",
          coarse_aggregates: "hlc",
          fine_aggregates: "hlc",
          filler: "hlc",
          hot_mix_plant: "hlc",
          paver: "agency", // recipe has no paver equipment → warning
          rollers: "hlc",
          tippers_transport: "hlc",
          crew: "hlc",
          fuel: "hlc",
        },
      }),
    ];

    const body = await shortageCheck();

    // Top-level warning reaches the API, identifying item + component.
    const warnings = body.mappingWarnings ?? [];
    const paverWarning = warnings.find(
      (w: any) =>
        w.code === "DEMAND_COMPONENT_MAPPING_MISSING" &&
        w.componentKey === "paver" &&
        w.boqItemId === 501,
    );
    expect(paverWarning, "paver mapping warning must surface").toBeTruthy();

    // Row-level: everything material-side is company-retained → full demand
    // kept; the missing paver resource excluded NOTHING.
    const binder = rowByName(body.rows, /bitumen\s*vg-?40/i);
    expect(binder).toBeTruthy();
    expect(binder.workCategory).toBe("bituminous");
    // Nothing was excluded for the missing paver resource: the full physical
    // demand remains company-actionable (no agency split fields fabricated).
    expect(binder.actionableShortfall).toBeGreaterThan(0);
    expect(binder.actionableShortfall).toBeCloseTo(binder.totalDemand, 1);
    expect(Array.isArray(binder.rowMappingWarnings)).toBe(true);
    expect(
      binder.rowMappingWarnings.some((w: any) => w.componentKey === "paver"),
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// PART D — earthwork regression through the same harness
// ---------------------------------------------------------------------------

describe("028B Part D — earthwork arrangement behaviour unchanged", () => {
  it("earthwork bulk row keeps legacy split fields and reduced actionable", async () => {
    fx.boqItems = [embankmentBoqItem()];
    fx.bars = barsFor(fx.boqItems);
    fx.arrangements = [earthworkArrangement()];
    fx.barAllocations = [
      { arrangementId: 8002, programmeBarId: 9100, boqItemId: 502, allocatedQty: 50000 },
    ];

    const body = await shortageCheck();
    const earth = rowByName(body.rows, /earth|borrow|soil/i);
    expect(earth, "earthwork bulk material row must exist").toBeTruthy();

    // Legacy earthwork context fields still present.
    expect(earth.isEarthworkBulkRequirement).toBe(true);
    expect(Array.isArray(earth.earthworkArrangements)).toBe(true);
    expect(earth.earthworkArrangements.map((a: any) => a.id)).toContain(8002);

    // Legacy earthwork split fields exposed for the UI…
    expect(earth.arrangementOutsourcedQty).toBeCloseTo(50000, 1);
    expect(earth.arrangementHlcQty).toBeCloseTo(0, 3);
    // …but 028A's company-fraction scaling must NEVER be applied to earthwork
    // rows: actionable stays the physical quantity (v2 behaviour, unchanged),
    // and no fraction field is serialized.
    expect(earth.actionableShortfall).toBeCloseTo(earth.totalDemand, 1);
    expect(earth.arrangementCompanyFraction ?? undefined).toBeUndefined();
    expect(earth.procurementStatus).toBe("earthwork_arrangement_required");
    // The bituminous generic marker must not mislabel earthwork rows.
    expect(earth.workCategory).not.toBe("bituminous");
  });
});

// ---------------------------------------------------------------------------
// PART E — draft bituminous arrangement: context without demand effect
// ---------------------------------------------------------------------------

describe("028B Part E — draft arrangement surfaces context, demand untouched", () => {
  it("draft arrangement: full actionable shortfall, context attached, no fraction applied", async () => {
    fx.boqItems = [dbmBoqItem()];
    fx.bars = barsFor(fx.boqItems);
    fx.arrangements = [bituminousArrangement({ id: 8003, status: "draft" })];
    fx.barAllocations = [];

    const body = await shortageCheck();
    const binder = rowByName(body.rows, /bitumen\s*vg-?40/i);
    expect(binder).toBeTruthy();

    // Context appears (proposed arrangements must be visible in Procurement)…
    expect(binder.workCategory).toBe("bituminous");
    expect(binder.executionArrangements.map((a: any) => a.id)).toContain(8003);
    expect(binder.executionArrangements[0].status).toBe("draft");

    // …but demand is NOT excluded and no company fraction is applied.
    expect(binder.actionableShortfall).toBeGreaterThan(0);
    expect(binder.actionableShortfall).toBeCloseTo(binder.totalDemand, 1);
    expect(binder.arrangementCompanyFraction ?? undefined).toBeUndefined();
  });
});
