/**
 * DPR-07 Fix 2 — submitted-DPR version validation is scoped to semantic
 * progress changes, while fresh create keeps all-row validation.
 *
 * These tests register the real Express routes and use only mocked storage.
 * They deliberately include legacy-invalid rows so a labour-only version edit
 * proves that the untouched rows are carried through without being rechecked.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import { createServer } from "http";
import request from "supertest";

const PROJECT_ID = 970001;
const DPR_ID = 970101;
const VALID_BAR_ID = 970201;

const authState = vi.hoisted(() => ({ isAdmin: true }));

const fx = vi.hoisted(() => ({
  dprs: new Map<number, any>(),
  boqItems: new Map<number, any>(),
  bars: new Map<number, any>(),
  equipmentLifecycles: new Map<number, any>(),
  equipmentLifecycleCalls: [] as number[][],
  versions: [] as any[],
  created: [] as any[],
  recoveryProjectSite: "DPR-07 TEST SITE",
  scopeToken: "version-scope-token",
  changeScopeDuringValidation: false,
  scopeChanged: false,
  events: [] as string[],
}));

vi.mock("../server/push", () => ({
  sendPushToSection: vi.fn().mockResolvedValue(undefined),
  sendTestPush: vi.fn().mockResolvedValue(undefined),
  sendPushToAudience: vi.fn().mockResolvedValue(undefined),
  initPush: vi.fn(),
}));

vi.mock("../server/db", () => {
  const query: any = {
    from: () => query,
    innerJoin: () => query,
    where: () => query,
    limit: async () => [{ siteName: fx.recoveryProjectSite }],
  };
  return { db: { select: vi.fn(() => query), execute: vi.fn().mockResolvedValue({ rows: [] }) } };
});

vi.mock("../server/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../server/auth")>();
  const fakeAdmin = {
    id: 9701,
    username: "dpr07-test-admin",
    get isAdmin() { return authState.isAdmin; },
    isActive: true,
    get role() { return authState.isAdmin ? "admin" : "manager"; },
    sessionPolicy: "sticky",
  };
  const inject = (req: any, _res: any, next: any) => {
    req.authUser = fakeAdmin;
    req.authPermissions = authState.isAdmin
      ? {}
      : { site_dprs: { edit: true, create: true } };
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

  methods.getDprs = vi.fn(async () => [{ id: 1 }]);
  methods.getDpr = vi.fn(async (id: number) => fx.dprs.get(id));
  methods.getBoqItem = vi.fn(async (id: number) => fx.boqItems.get(id) ?? null);
  methods.getWorkProgramBar = vi.fn(async (id: number) => {
    fx.events.push("programme-validation");
    if (fx.changeScopeDuringValidation) fx.scopeChanged = true;
    return fx.bars.get(id);
  });
  methods.getUserPermittedSiteIds = vi.fn(async () => null);
  methods.getEquipmentUsageLifecycle = vi.fn(async (ids: number[]) => {
    fx.equipmentLifecycleCalls.push(ids.map(Number));
    return ids.map((id) => fx.equipmentLifecycles.get(Number(id))).filter(Boolean);
  });
  methods.getProjectScopeVersionToken = vi.fn(async () => {
    fx.events.push("scope-token");
    return fx.scopeToken;
  });
  methods.createVersionDpr = vi.fn(async (originalId: number, input: any, _editedBy: string, _timestamp: string, _audit: any, scopeVersionToken: string) => {
    if (scopeVersionToken === "scope-before-validation" && fx.scopeChanged) {
      const error = new Error("Project scope changed while this DPR version was being validated");
      (error as any).code = "SCOPE_CHANGED_DURING_PLANNING";
      throw error;
    }
    fx.versions.push({ originalId, input, scopeVersionToken });
    return { id: DPR_ID + fx.versions.length, ...input, dprStatus: "submitted" };
  });
  methods.createDpr = vi.fn(async (input: any) => {
    fx.created.push(input);
    return { id: DPR_ID + 100 + fx.created.length, ...input };
  });
  methods.createNotification = vi.fn(async () => ({}));

  return { storage: storageProxy };
});

let app: express.Express;

beforeAll(async () => {
  const { registerRoutes } = await import("../server/routes");
  app = express();
  app.use(express.json());
  await registerRoutes(createServer(app), app);
});

function sourceRow(id: number, overrides: Record<string, unknown> = {}) {
  return {
    id,
    dprId: DPR_ID,
    activity: `ACTIVITY ${id}`,
    chainageFrom: null,
    chainageTo: null,
    chainageFromKm: null,
    chainageToKm: null,
    side: null,
    length: null,
    width: null,
    thickness: null,
    quantity: null,
    uom: "MT",
    noSiteWork: false,
    noSiteWorkDescription: null,
    entryKey: `entry-${id}`,
    boqItemId: null,
    earthworkArrangementId: null,
    programmeBarId: null,
    quantitySource: null,
    quantitySourceNote: null,
    chainageOverrideReason: null,
    lengthOverrideReason: null,
    linkReviewRequired: false,
    chainageReviewStatus: null,
    scopeWarningType: null,
    scopeOverrideReason: null,
    scopeOverrideBy: null,
    scopeOverrideAt: null,
    executedBy: null,
    layerNo: null,
    isIncidental: false,
    incidentalDescription: null,
    materialOutcome: null,
    reusableQty: null,
    ...overrides,
  };
}

function payloadRow(source: any, overrides: Record<string, unknown> = {}) {
  const { id, dprId: _dprId, ...editable } = source;
  return {
    ...editable,
    persistedId: id,
    ...overrides,
  };
}

function header(overrides: Record<string, unknown> = {}) {
  return {
    date: "2026-09-10",
    site: "DPR-07 TEST SITE",
    engineer: "TEST ENGINEER",
    role: "manager",
    workType: "road",
    boqProjectId: PROJECT_ID,
    progress: [],
    equipment: [],
    labour: [],
    materials: [],
    sitePurchases: [],
    structureItems: [],
    ...overrides,
  };
}

function reset() {
  authState.isAdmin = true;
  fx.dprs.clear();
  fx.boqItems.clear();
  fx.bars.clear();
  fx.equipmentLifecycles.clear();
  fx.equipmentLifecycleCalls.length = 0;
  fx.versions.length = 0;
  fx.created.length = 0;
  fx.scopeToken = "version-scope-token";
  fx.changeScopeDuringValidation = false;
  fx.scopeChanged = false;
  fx.events.length = 0;
  fx.bars.set(VALID_BAR_ID, {
    id: VALID_BAR_ID,
    boqProjectId: PROJECT_ID,
    boqItemId: 3001,
    side: null,
    chainageFrom: null,
    chainageTo: null,
    scheduled: true,
    planningMode: "structure_location",
  });
}

beforeEach(reset);

function putVersionFixture(progress: any[], overrides: Record<string, unknown> = {}) {
  fx.dprs.set(DPR_ID, {
    ...header(),
    id: DPR_ID,
    dprStatus: "submitted",
    progress,
    ...overrides,
  });
}

function linkedEquipment(
  id: number,
  usageId: number,
  dieselSource: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    id,
    dprId: DPR_ID,
    machine: "FIXED ROLLER",
    operator: "FIXTURE OPERATOR",
    vehicleNo: "FIX-ROLLER-01",
    entryType: "time_meter",
    startTime: "08:00",
    endTime: "17:00",
    openingReading: 100,
    closingReading: 109,
    hoursWorked: 9,
    diesel: 20,
    dieselSource,
    equipmentId: 970301,
    plantUsageId: usageId,
    ...overrides,
  };
}

function payloadEquipment(source: any, overrides: Record<string, unknown> = {}) {
  const { id, dprId: _dprId, ...editable } = source;
  return {
    ...editable,
    persistedId: id,
    ...overrides,
  };
}

describe("DPR-07 Fix 2 — version validators use changed/new progress only", () => {
  it("F: accepts a labour-only edit and preserves untouched invalid rows and review facts", async () => {
    const invalidQuantity = sourceRow(101, {
      activity: "LEGACY INVALID QUANTITY SOURCE",
      quantity: 5,
      boqItemId: 1001,
      quantitySource: null,
      quantitySourceNote: null,
    });
    const invalidOutcome = sourceRow(102, {
      activity: "LEGACY INVALID MATERIAL OUTCOME",
      boqItemId: 1002,
      uom: "CUM",
      quantity: 5,
      materialOutcome: "unsuitable",
      reusableQty: 1,
      linkReviewRequired: true,
      chainageReviewStatus: "approved",
      scopeWarningType: "legacy_warning",
    });
    const invalidProgramme = sourceRow(103, {
      activity: "LEGACY INVALID PROGRAMME LINK",
      boqItemId: 1003,
      programmeBarId: 999999,
    });
    fx.boqItems.set(1001, { id: 1001, unit: "MT", dprMeasurementMethod: "MT_manual" });
    fx.boqItems.set(1002, { id: 1002, description: "GSB LAYING", unit: "CUM" });
    fx.boqItems.set(1003, { id: 1003, unit: "MT", dprMeasurementMethod: "MT_manual" });
    putVersionFixture([invalidQuantity, invalidOutcome, invalidProgramme]);

    const response = await request(app)
      .post(`/api/dprs/${DPR_ID}/version`)
      .send({
        data: {
          ...header({
            progress: [
              payloadRow(invalidQuantity),
              payloadRow(invalidOutcome, {
                // Incoming review facts are not trusted, even for an
                // otherwise untouched row.
                linkReviewRequired: false,
                chainageReviewStatus: null,
                scopeWarningType: null,
              }),
              payloadRow(invalidProgramme),
            ],
            labour: [{
              category: "Skilled",
              gender: "Male",
              count: 2,
              task: "CORRECTED LABOUR",
            }],
          }),
        },
        editedBy: "admin",
      })
      .set("Content-Type", "application/json");

    expect(response.status).toBe(201);
    expect(fx.versions).toHaveLength(1);
    const saved = fx.versions[0].input;
    expect(saved.labour[0].task).toBe("CORRECTED LABOUR");
    expect(saved.progress).toHaveLength(3);
    expect(saved.progress[0].quantitySource).toBeNull();
    expect(saved.progress[1]).toEqual(expect.objectContaining({
      linkReviewRequired: true,
      chainageReviewStatus: "approved",
      scopeWarningType: "legacy_warning",
    }));
    expect(saved.progress[2].programmeBarId).toBe(999999);
  });

  it("rechecks programme rows when the BOQ-project header changes context", async () => {
    const linked = sourceRow(104, {
      activity: "UNCHANGED LINKED ROW",
      boqItemId: 3004,
      programmeBarId: VALID_BAR_ID,
    });
    fx.boqItems.set(3004, { id: 3004, unit: "MT", dprMeasurementMethod: "MT_manual" });
    putVersionFixture([linked]);

    const response = await request(app)
      .post(`/api/dprs/${DPR_ID}/version`)
      .send({
        data: {
          ...header({
            boqProjectId: PROJECT_ID + 1,
            progress: [payloadRow(linked)],
          }),
        },
      })
      .set("Content-Type", "application/json");

    expect(response.status).toBe(400);
    expect(response.body.code).toBe("PROGRAMME_LINK_INVALID");
    expect(response.body.message).toContain("different BOQ project");
    expect(fx.versions).toHaveLength(0);
  });

  it("versions a confirmed saved-null source with a newly chosen target-project BOQ row", async () => {
    putVersionFixture([], { boqProjectId: null });
    fx.boqItems.set(3005, { id: 3005, boqProjectId: PROJECT_ID + 1, unit: "MT" });
    const { id: _id, dprId: _dprId, ...newProgress } = sourceRow(105, {
      activity: "NEW RECOVERED WORK",
      boqItemId: 3005,
      programmeBarId: null,
    });

    const response = await request(app)
      .post(`/api/dprs/${DPR_ID}/version`)
      .send({
        data: {
          ...header({
            boqProjectId: PROJECT_ID + 1,
            boqProjectRecoveryConfirmed: true,
            progress: [newProgress],
          }),
        },
      })
      .set("Content-Type", "application/json");

    expect(response.status).toBe(201);
    expect(fx.versions).toHaveLength(1);
    expect(fx.versions[0].input).toMatchObject({
      boqProjectId: PROJECT_ID + 1,
      boqProjectRecoveryConfirmed: true,
      progress: [expect.objectContaining({ boqItemId: 3005 })],
    });
    expect(fx.versions[0].scopeVersionToken).toBe("version-scope-token");
  });

  it("does not route a second version from a source already superseded by the first", async () => {
    putVersionFixture([], { isSuperseded: true });

    const response = await request(app)
      .post(`/api/dprs/${DPR_ID}/version`)
      .send({ data: header() })
      .set("Content-Type", "application/json");

    expect(response.status).toBe(409);
    expect(response.body.code).toBe("DPR_ALREADY_SUPERSEDED");
    expect(fx.versions).toHaveLength(0);
  });

  it("uses the pre-validation target scope token when a correction lands during programme validation", async () => {
    const linked = sourceRow(106, {
      activity: "SCOPE TOKEN RACE",
      boqItemId: 3006,
      programmeBarId: VALID_BAR_ID,
      side: "Full Width",
      chainageFrom: "0",
      chainageTo: "1",
      chainageFromKm: 0,
      chainageToKm: 1,
    });
    fx.boqItems.set(3006, { id: 3006, boqProjectId: PROJECT_ID, unit: "MT" });
    fx.bars.set(VALID_BAR_ID, {
      id: VALID_BAR_ID,
      boqProjectId: PROJECT_ID,
      boqItemId: 3006,
      side: null,
      chainageFrom: null,
      chainageTo: null,
      startDate: null,
      endDate: null,
      status: "planned",
    });
    putVersionFixture([linked]);
    fx.scopeToken = "scope-before-validation";
    fx.changeScopeDuringValidation = true;

    const response = await request(app)
      .post(`/api/dprs/${DPR_ID}/version`)
      .send({ data: header({ progress: [payloadRow(linked, { quantity: 1, quantitySource: "measured" })] }) })
      .set("Content-Type", "application/json");

    expect(response.status).toBe(409);
    expect(response.body.code).toBe("SCOPE_CHANGED_DURING_PLANNING");
    expect(fx.events.indexOf("scope-token")).toBeLessThan(fx.events.indexOf("programme-validation"));
    expect(fx.versions).toHaveLength(0);
  });

  it.each([
    { label: "A manager contractor", isAdmin: false, dieselSource: "contractor", diesel: 25, status: 201 },
    { label: "B manager direct purchase", isAdmin: false, dieselSource: "direct_purchase", diesel: 25, status: 201 },
    { label: "C manager plant stock", isAdmin: false, dieselSource: "plant_stock", diesel: 25, status: 403 },
    { label: "D admin plant stock", isAdmin: true, dieselSource: "plant_stock", diesel: 25, status: 201 },
  ])("$label linked equipment diesel edit follows source-aware admin guard", async ({
    isAdmin,
    dieselSource,
    diesel,
    status,
  }) => {
    const usageId = 970401;
    const original = linkedEquipment(970411, usageId, dieselSource);
    fx.equipmentLifecycles.set(usageId, {
      id: usageId,
      status: "open",
      successorId: null,
      dprId: null,
      sourceUsageId: null,
    });
    putVersionFixture([], { equipment: [original] });
    authState.isAdmin = isAdmin;

    const response = await request(app)
      .post(`/api/dprs/${DPR_ID}/version`)
      .send({
        data: {
          ...header({
            equipment: [payloadEquipment(original, { diesel })],
          }),
        },
        editedBy: isAdmin ? "admin" : "manager",
      })
      .set("Content-Type", "application/json");

    expect(response.status).toBe(status);
    if (status === 201) {
      expect(fx.versions).toHaveLength(1);
      expect(fx.versions[0].input.equipment[0].diesel).toBe(diesel);
      // Both post-guard lifecycle checks must run successfully for the
      // non-plant-stock manager cases and the admin plant-stock case.
      expect(fx.equipmentLifecycleCalls.length).toBeGreaterThanOrEqual(2);
    } else {
      expect(response.body.error).toBe("LINKED_EQUIPMENT_ADMIN_EDIT_REQUIRED");
      expect(fx.versions).toHaveLength(0);
    }
  });

  it.each([
    {
      name: "quantity source",
      code: "QUANTITY_SOURCE_INVALID",
      itemId: 2001,
      source: sourceRow(201, {
        activity: "CHANGED QUANTITY",
        boqItemId: 2001,
        quantity: 5,
        quantitySource: "measured",
      }),
      item: { id: 2001, unit: "MT", dprMeasurementMethod: "MT_manual" },
      change: { quantitySource: null },
      message: "pick how it was determined",
    },
    {
      name: "material outcome",
      code: "MATERIAL_OUTCOME_INVALID",
      itemId: 2002,
      source: sourceRow(202, {
        activity: "CHANGED OUTCOME",
        boqItemId: 2002,
        uom: "CUM",
        quantity: 5,
        quantitySource: "measured",
        materialOutcome: "unsuitable",
        reusableQty: 0,
      }),
      item: { id: 2002, description: "ROADWAY EXCAVATION", unit: "CUM" },
      // Enum comparison must be exact: this casing change is a genuinely
      // changed invalid value, not an untouched "unsuitable" row.
      change: { materialOutcome: "UNSUITABLE" },
      message: "Select a valid excavated material outcome",
    },
    {
      name: "programme link",
      code: "PROGRAMME_LINK_INVALID",
      itemId: 2003,
      source: sourceRow(203, { activity: "CHANGED PROGRAMME", boqItemId: 2003 }),
      item: { id: 2003, unit: "MT", dprMeasurementMethod: "MT_manual" },
      change: { programmeBarId: 999998 },
      message: "selected programme bar no longer exists",
    },
  ])("G: rejects genuinely changed invalid $name data with the existing response", async ({
    code,
    itemId: _itemId,
    source,
    item,
    change,
    message,
  }) => {
    fx.boqItems.set(Number(item.id), item);
    putVersionFixture([source]);
    const beforeVersions = fx.versions.length;

    const response = await request(app)
      .post(`/api/dprs/${DPR_ID}/version`)
      .send({
        data: {
          ...header({ progress: [payloadRow(source, change)] }),
        },
      })
      .set("Content-Type", "application/json");

    expect(response.status).toBe(400);
    expect(response.body.code).toBe(code);
    expect(response.body.message).toContain(message);
    expect(fx.versions).toHaveLength(beforeVersions);
  });
});

describe("DPR-07 Fix 2 — fresh create remains all-row strict", () => {
  it.each([
    {
      name: "programme links",
      code: "PROGRAMME_LINK_INVALID",
      item: { id: 3001, unit: "MT", dprMeasurementMethod: "MT_manual" },
      row: { activity: "FRESH BAD PROGRAMME", boqItemId: 3001, programmeBarId: 999997 },
      message: "selected programme bar no longer exists",
    },
    {
      name: "quantity sources",
      code: "QUANTITY_SOURCE_INVALID",
      item: { id: 3002, unit: "MT", dprMeasurementMethod: "MT_manual" },
      row: { activity: "FRESH BAD QUANTITY", boqItemId: 3002, quantity: 4, quantitySource: null },
      message: "pick how it was determined",
    },
    {
      name: "material outcomes",
      code: "MATERIAL_OUTCOME_INVALID",
      item: { id: 3003, description: "GSB LAYING", unit: "CUM" },
      row: { activity: "FRESH BAD OUTCOME", boqItemId: 3003, materialOutcome: "unsuitable" },
      message: "material outcome may only be recorded",
    },
  ])("H: applies all-row validation to fresh $name", async ({
    code,
    item,
    row,
    message,
  }) => {
    fx.boqItems.set(Number(item.id), item);
    const response = await request(app)
      .post("/api/dprs")
      .send(header({
        progress: [{
          ...sourceRow(400, row),
          id: undefined,
          entryKey: undefined,
          persistedId: undefined,
        }],
      }))
      .set("Content-Type", "application/json");

    expect(response.status).toBe(400);
    expect(response.body.code).toBe(code);
    expect(response.body.message).toContain(message);
    expect(fx.created).toHaveLength(0);
  });
});