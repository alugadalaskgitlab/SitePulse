import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { NextFunction, Request, Response } from "express";
import express from "express";
import { createServer } from "http";
import request from "supertest";
import {
  adoptOpenUsageIntoDprRow,
  linkedUsageIds,
  resolveOpenUsageRowMatch,
  shouldCreateDprEquipmentDieselLedger,
  unlinkedOpenUsages,
  usageToDprEquipmentRow,
  usageToGuidedRow,
  type OpenUsageLike,
} from "../shared/dprPlantLink";
import {
  normalizeSiteEditEquipmentPayload,
  normalizeSiteEditProgressPayload,
} from "../client/src/lib/siteEditPayload";

const {
  getDprSpy,
  getBoqItemSpy,
  getEquipmentUsageLifecycleSpy,
  getOpenEquipmentUsageForDateSpy,
  createVersionDprSpy,
  updateEquipmentUsageSpy,
  createEquipmentUsageSpy,
  authState,
} = vi.hoisted(() => ({
  getDprSpy: vi.fn(),
  getBoqItemSpy: vi.fn(),
  getEquipmentUsageLifecycleSpy: vi.fn(),
  getOpenEquipmentUsageForDateSpy: vi.fn(),
  createVersionDprSpy: vi.fn(),
  updateEquipmentUsageSpy: vi.fn(),
  createEquipmentUsageSpy: vi.fn(),
  authState: { isAdmin: true, isOwner: false },
}));

vi.mock("../server/storage", () => {
  const base: Record<string, ReturnType<typeof vi.fn>> = {
    getDpr: getDprSpy,
    getBoqItem: getBoqItemSpy,
    getEquipmentUsageLifecycle: getEquipmentUsageLifecycleSpy,
    getOpenEquipmentUsageForDate: getOpenEquipmentUsageForDateSpy,
    createVersionDpr: createVersionDprSpy,
    updateEquipmentUsage: updateEquipmentUsageSpy,
    createEquipmentUsage: createEquipmentUsageSpy,
  };
  const proxy = new Proxy(base, {
    get(target, prop: string) {
      if (!(prop in target)) target[prop] = vi.fn().mockResolvedValue([]);
      return target[prop];
    },
  });
  return {
    StockShortageError: class StockShortageError extends Error {
      constructor(message: string) {
        super(message);
        this.name = "StockShortageError";
      }
    },
    InvalidDieselSourceError: class InvalidDieselSourceError extends Error {
      constructor(message: string) {
        super(message);
        this.name = "InvalidDieselSourceError";
      }
    },
    EquipmentIncomingConflictError: class EquipmentIncomingConflictError extends Error {},
    InsufficientPlantStockError: class InsufficientPlantStockError extends Error {},
    InvalidStockTransferQuantityError: class InvalidStockTransferQuantityError extends Error {},
    DieselReceiptExceedsRemainingError: class DieselReceiptExceedsRemainingError extends Error {},
    CutFillInsufficientAvailabilityError: class CutFillInsufficientAvailabilityError extends Error {},
    CutFillValidationError: class CutFillValidationError extends Error {},
    AttachmentReferenceError: class AttachmentReferenceError extends Error {},
    InitialScopeCorrectionBlockedError: class InitialScopeCorrectionBlockedError extends Error {},
    ScopeChangedDuringPlanningError: class ScopeChangedDuringPlanningError extends Error {},
    DprProjectMismatchError: class DprProjectMismatchError extends Error {},
    PushSubscriptionOwnershipError: class PushSubscriptionOwnershipError extends Error {},
    storage: proxy,
  };
});

vi.mock("../server/push", () => ({
  sendPushToAll: vi.fn().mockResolvedValue(undefined),
  sendTestPush: vi.fn().mockResolvedValue(undefined),
  sendPushToAudience: vi.fn().mockResolvedValue(undefined),
  sendPushToSection: vi.fn().mockResolvedValue(undefined),
  initPush: vi.fn(),
}));

vi.mock("../server/auth", () => ({
  requireAuth: vi.fn((req: Request, _res: Response, next: NextFunction) => {
    (req as any).authUser = {
      id: 42,
      fullName: "Site Manager",
      role: "manager",
      isAdmin: authState.isAdmin,
      isOwner: authState.isOwner,
    };
    next();
  }),
  isPublicApiPath: vi.fn().mockReturnValue(false),
  isOptionalAuthPath: vi.fn().mockReturnValue(false),
  optionalAuth: vi.fn((_req: Request, _res: Response, next: NextFunction) => next()),
  parseCookie: vi.fn(),
  signToken: vi.fn(),
  verifySignedToken: vi.fn(),
  setSessionCookie: vi.fn(),
  clearSessionCookie: vi.fn(),
  setDeviceCookie: vi.fn(),
  clearDeviceCookie: vi.fn(),
  hashPassword: vi.fn(),
  verifyPassword: vi.fn(),
  loadUserPermissionsMatrix: vi.fn(),
  setUserPermissions: vi.fn(),
  userHasPermission: vi.fn(),
  toSafeUser: vi.fn(),
  getUserById: vi.fn(),
  getUserByEmail: vi.fn(),
  getUserByPhone: vi.fn(),
  ensureBootstrapAdmin: vi.fn(),
  backfillSplitPermissions: vi.fn(),
  migrateEmailPhoneSchema: vi.fn(),
  backfillPlantSubPermissions: vi.fn(),
}));

vi.mock("../server/auth-routes", () => ({
  registerAuthRoutes: vi.fn(),
  assertAdmin: vi.fn().mockReturnValue(true),
  assertEdit: vi.fn().mockReturnValue(true),
  assertView: vi.fn().mockReturnValue(true),
  assertAuthed: vi.fn().mockReturnValue({ id: 42, fullName: "Site Manager", role: "manager" }),
  assertCreate: vi.fn().mockReturnValue(true),
  currentUserName: vi.fn().mockReturnValue("Site Manager"),
  claimUnlockOrLockedRow: vi.fn().mockResolvedValue({ locked: false }),
  lockNewRow: vi.fn().mockResolvedValue(undefined),
  relockResource: vi.fn().mockResolvedValue(undefined),
  assertWritable: vi.fn().mockResolvedValue(true),
  LOCKABLE_TABLE_NAMES: {},
}));

import { registerRoutes } from "../server/routes";

const DATE = "2026-08-08";
const SITE = "TAKKADPALLY-SIRUR";
const OPEN_USAGE: OpenUsageLike & { destinationSite: string; status: string } = {
  id: 161,
  equipmentId: 47,
  entryType: "time_meter",
  openingReading: 2515.4,
  startTime: "08:10",
  dieselIssued: 20,
  dieselSource: "direct_purchase",
  fuelStation: "BPCL",
  billNumber: "HO431",
  amountPaid: 2092.2,
  destinationSite: SITE,
  status: "open",
};

describe("06X-HF6 SiteEdit dispatch discovery", () => {
  it("A: an existing DPR can discover and prefill a dispatch created later", () => {
    const existingDpr = {
      id: 266,
      date: DATE,
      site: SITE,
      equipment: [],
    };
    expect(existingDpr.equipment).toHaveLength(0);
    expect(unlinkedOpenUsages([OPEN_USAGE], existingDpr.equipment)).toEqual([OPEN_USAGE]);

    const row = usageToDprEquipmentRow(OPEN_USAGE, {
      name: "SOIL COMPACTOR",
      registrationNumber: "TS08JG4572",
    });
    expect(row).toMatchObject({
      machine: "SOIL COMPACTOR",
      vehicleNo: "TS08JG4572",
      equipmentId: 47,
      plantUsageId: 161,
      openingReading: 2515.4,
      startTime: "08:10",
      diesel: 20,
      dieselSource: "direct_purchase",
      fuelStation: "BPCL",
      billNumber: "HO431",
      amountPaid: 2092.2,
    });
  });

  it("preserves a missing diesel source for storage-boundary validation", () => {
    const row = usageToDprEquipmentRow({
      id: 162,
      equipmentId: 47,
      dieselIssued: 20,
      dieselSource: null,
    });
    expect(row.diesel).toBe(20);
    expect(row.dieselSource).toBeNull();
  });

  it("C/D: Guided keeps the same linkage and linked/closed usage is not offered again", () => {
    const guided = usageToGuidedRow(OPEN_USAGE, "SOIL COMPACTOR");
    expect(guided.passthrough).toMatchObject({
      equipmentId: 47,
      plantUsageId: 161,
      openingReading: 2515.4,
      startTime: "08:10",
      diesel: 20,
      dieselSource: "direct_purchase",
    });
    const editRow = usageToDprEquipmentRow(OPEN_USAGE, { name: "SOIL COMPACTOR" });
    expect(linkedUsageIds([editRow])).toEqual(new Set([161]));
    expect(unlinkedOpenUsages([OPEN_USAGE], [editRow])).toEqual([]);
    expect(unlinkedOpenUsages([], [editRow])).toEqual([]);
  });

  it("adopts a later dispatch into the one production-shaped existing row without duplicating it", () => {
    const existingRows = [{
      machine: "SOIL COMPACTOR",
      vehicleNo: "TS08JG4572",
      equipmentId: 47,
      plantUsageId: null,
      operator: "MANUAL OPERATOR",
      task: "COMPACTION",
      entryType: "time_meter",
      startTime: "",
      endTime: "17:00",
      openingReading: 2500,
      closingReading: 2521.6,
      diesel: null,
      dieselSource: "plant_stock",
      fuelStation: "",
      billNumber: "",
      amountPaid: null,
      numberOfTrips: null,
      tripDistance: null,
      totalKm: null,
      waterQuantity: null,
    }];
    const master = { name: "SOIL COMPACTOR", registrationNumber: "TS08JG4572" };
    expect(resolveOpenUsageRowMatch(OPEN_USAGE, existingRows, master)).toEqual({
      kind: "adopt",
      rowIndex: 0,
      matchedBy: "equipment_id",
    });

    const adopted = adoptOpenUsageIntoDprRow(existingRows[0], OPEN_USAGE, master);
    const finalRows = [adopted];
    expect(finalRows).toHaveLength(1);
    expect(adopted).toMatchObject({
      equipmentId: 47,
      plantUsageId: 161,
      openingReading: 2515.4,
      startTime: "08:10",
      diesel: 20,
      dieselSource: "direct_purchase",
      operator: "MANUAL OPERATOR",
      task: "COMPACTION",
      endTime: "17:00",
      closingReading: 2521.6,
    });
    expect(resolveOpenUsageRowMatch(OPEN_USAGE, finalRows, master).kind).toBe("already_linked");
  });

  it("uses registration only for an id-less legacy row and never fuzzy-matches a display name", () => {
    const master = { name: "SOIL COMPACTOR", registrationNumber: "TS08JG4572" };
    expect(resolveOpenUsageRowMatch(OPEN_USAGE, [{
      machine: "OLD LABEL",
      vehicleNo: "TS 08 JG 4572",
      equipmentId: null,
      plantUsageId: null,
    }], master)).toMatchObject({ kind: "adopt", rowIndex: 0, matchedBy: "registration" });
    expect(resolveOpenUsageRowMatch(OPEN_USAGE, [{
      machine: "SOIL COMPACTOR",
      vehicleNo: "",
      equipmentId: null,
      plantUsageId: null,
    }], master)).toEqual({ kind: "add" });
    expect(resolveOpenUsageRowMatch(OPEN_USAGE, [{
      machine: "SOIL COMPACTOR",
      vehicleNo: "TS08JG4572",
      equipmentId: 99,
      plantUsageId: null,
    }], master)).toEqual({ kind: "add" });
  });

  it("stops adoption on ambiguous canonical matches", () => {
    const rows = [
      { machine: "SOIL COMPACTOR", equipmentId: 47, plantUsageId: null },
      { machine: "SOIL COMPACTOR", equipmentId: 47, plantUsageId: null },
    ];
    expect(resolveOpenUsageRowMatch(OPEN_USAGE, rows)).toEqual({
      kind: "ambiguous",
      rowIndexes: [0, 1],
      matchedBy: "equipment_id",
    });
  });

  it("does not create a second diesel issue or purchase for a linked dispatch", () => {
    expect(shouldCreateDprEquipmentDieselLedger({
      diesel: 20,
      dieselSource: "plant_stock",
      plantUsageId: 161,
    })).toBe(false);
    expect(shouldCreateDprEquipmentDieselLedger({
      diesel: 20,
      dieselSource: "direct_purchase",
      plantUsageId: 161,
    })).toBe(false);
    expect(shouldCreateDprEquipmentDieselLedger({
      diesel: 20,
      dieselSource: "plant_stock",
      plantUsageId: null,
    })).toBe(true);
  });

  it("SiteEdit uses the shared endpoint/helper and preserves plantUsageId in form state", async () => {
    const fs = await import("node:fs/promises");
    const source = await fs.readFile("client/src/pages/SiteEdit.tsx", "utf8");
    expect(source).toContain("/api/plant-module/equipment-usage/open-today");
    expect(source).toContain("usageToDprEquipmentRow");
    expect(source).toContain("unlinkedOpenUsages(openUsages, equipment)");
    expect(source).toContain("resolveOpenUsageRowMatch");
    expect(source).toContain("adoptOpenUsageIntoDprRow");
    expect(source).toContain("plantUsageId: e.plantUsageId ?? null");
    expect(source).toContain("Use in this report");
  });
});

describe("06X-HF6 version-route closure", () => {
  let app: express.Express;

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    const httpServer = createServer(app);
    await registerRoutes(httpServer, app);
  });

  beforeEach(() => {
    authState.isAdmin = true;
    authState.isOwner = false;
    getDprSpy.mockReset();
    getBoqItemSpy.mockReset();
    getEquipmentUsageLifecycleSpy.mockReset();
    getEquipmentUsageLifecycleSpy.mockResolvedValue([]);
    getOpenEquipmentUsageForDateSpy.mockReset();
    createVersionDprSpy.mockReset();
    updateEquipmentUsageSpy.mockReset();
    createEquipmentUsageSpy.mockReset();

    getDprSpy
      .mockResolvedValueOnce({
        id: 266,
        date: DATE,
        site: SITE,
        engineer: "DINESH SINGH - FOREMAN",
        role: "manager",
        progress: [],
        equipment: [],
        dprStatus: "submitted",
      })
      .mockResolvedValueOnce({
        id: 400,
        date: DATE,
        site: `${SITE} – Edited by Manager – 2026-08-24 19:30:00`,
        equipment: [],
      });
    getOpenEquipmentUsageForDateSpy.mockResolvedValue([OPEN_USAGE]);
    createVersionDprSpy.mockResolvedValue({ id: 400, date: DATE, site: SITE });
    updateEquipmentUsageSpy.mockResolvedValue({ ...OPEN_USAGE, status: "closed", closedByDprId: 400 });
  });

  it("B: passes linked equipment and closure audit into the atomic version transaction", async () => {
    const response = await request(app)
      .post("/api/dprs/266/version")
      .send({
        editedBy: "manager",
        clientTimestamp: "2026-08-24 19:30:00",
        data: {
          date: DATE,
          site: SITE,
          engineer: "DINESH SINGH - FOREMAN",
          role: "manager",
          workType: "road",
          progress: [],
          equipment: [{
            machine: "SOIL COMPACTOR",
            vehicleNo: "TS08JG4572",
            operator: "OPERATOR",
            task: "COMPACTION",
            entryType: "time_meter",
            startTime: "08:10",
            endTime: "17:00",
            openingReading: 2515.4,
            closingReading: 2521.6,
            diesel: 20,
            equipmentId: 47,
            plantUsageId: 161,
            dieselSource: "direct_purchase",
            fuelStation: "BPCL",
            billNumber: "HO431",
            amountPaid: 2092.2,
          }],
          labour: [],
          materials: [],
          sitePurchases: [],
        },
      });

    expect(response.status).toBe(201);
    expect(createVersionDprSpy).toHaveBeenCalledTimes(1);
    expect(createVersionDprSpy).toHaveBeenCalledWith(
      266,
      expect.objectContaining({
        equipment: [expect.objectContaining({
          plantUsageId: 161,
          closingReading: 2521.6,
          endTime: "17:00",
        })],
      }),
      "admin",
      "2026-08-24 19:30:00",
      expect.objectContaining({ userId: 42 }),
      null,
    );
    expect(updateEquipmentUsageSpy).not.toHaveBeenCalled();
    expect(createEquipmentUsageSpy).not.toHaveBeenCalled();
  });

  it("parses a normalized restored legacy payload without weakening version guards", async () => {
    const original = {
      id: 26601,
      date: DATE,
      site: SITE,
      engineer: "DINESH SINGH - FOREMAN",
      role: "manager",
      dprStatus: "submitted",
      progress: [],
      equipment: [],
    };
    const legacyData = {
      date: DATE,
      site: SITE,
      engineer: "DINESH SINGH - FOREMAN",
      role: "manager",
      workType: "road",
      progress: [{
        entryKey: "legacy-no-site-work",
        activity: "LEGACY NO SITE WORK",
        side: null,
        chainageFrom: null,
        chainageTo: null,
        length: null,
        width: null,
        thickness: null,
        quantity: null,
        uom: "SQM",
        noSiteWork: true,
        noSiteWorkDescription: null,
        personnelIds: [],
        boqItemId: null,
        programmeBarId: null,
        earthworkArrangementId: null,
        quantitySource: null,
        quantitySourceNote: null,
        chainageOverrideReason: null,
        lengthOverrideReason: null,
        uomOverrideReason: null,
        executedBy: null,
        layerNo: null,
        isIncidental: false,
        incidentalDescription: null,
        materialOutcome: null,
        reusableQty: null,
      }],
      equipment: [{
        persistedId: null,
        machine: "ROLLER",
        operator: null,
        vehicleNo: null,
        entryType: "daily",
        startTime: null,
        endTime: null,
        openingReading: null,
        closingReading: null,
        hoursWorked: null,
        numberOfTrips: null,
        tripDistance: null,
        totalKm: null,
        diesel: null,
        dieselNorm: null,
        expectedDiesel: null,
        openingDiesel: null,
        dieselBalanceInTank: null,
        dieselBalanceConfirmed: null,
        task: null,
        equipmentId: null,
        dieselSource: null,
        fuelStation: null,
        billNumber: null,
        amountPaid: null,
        waterQuantity: null,
        boqItemId: null,
        structureId: null,
        plantUsageId: null,
        activitySegments: null,
        activityAllocations: null,
        breakdowns: null,
      }],
      labour: [],
      materials: [],
      sitePurchases: [],
      structureItems: [],
    };

    getDprSpy.mockReset().mockResolvedValueOnce(original);
    const raw = await request(app)
      .post("/api/dprs/26601/version")
      .send({ data: legacyData });
    expect(raw.status).toBe(400);
    expect(raw.body.field).toBe("data.progress.0.uomOverrideReason");
    expect(raw.body.message).toContain("Expected string");
    expect(createVersionDprSpy).not.toHaveBeenCalled();

    getDprSpy.mockReset().mockResolvedValueOnce(original);
    createVersionDprSpy.mockResolvedValueOnce({ id: 40101, date: DATE, site: SITE });
    const normalizedData = {
      ...legacyData,
      progress: [normalizeSiteEditProgressPayload(legacyData.progress[0])],
      equipment: [normalizeSiteEditEquipmentPayload(legacyData.equipment[0])],
    };
    const normalized = await request(app)
      .post("/api/dprs/26601/version")
      .send({ data: normalizedData });
    expect(normalized.status).toBe(201);
    expect(createVersionDprSpy).toHaveBeenCalledTimes(1);
    expect(createVersionDprSpy.mock.calls[0][1].progress[0]).not.toHaveProperty("uomOverrideReason");
    expect(createVersionDprSpy.mock.calls[0][1].equipment[0]).not.toHaveProperty("activitySegments");
  });

  it("admin saves activity, equipment, labour, and header edits while retaining lifecycle and review facts", async () => {
    const original = {
      id: 267,
      date: DATE,
      site: SITE,
      engineer: "DINESH SINGH - FOREMAN",
      remarks: "ORIGINAL HEADER",
      role: "manager",
      dprStatus: "submitted",
      progress: [{
        id: 17,
        entryKey: null,
        activity: "OLD ACTIVITY",
        noSiteWork: false,
        quantity: null,
        chainageReviewStatus: "review_required",
        scopeWarningType: "temporary_block",
        scopeOverrideReason: "approved historical exception",
      }],
      equipment: [{
        id: 18,
        machine: "SOIL COMPACTOR",
        vehicleNo: "TS08JG4572",
        operator: "OLD OPERATOR",
        task: "OLD TASK",
        entryType: "time_meter",
        startTime: "08:10",
        endTime: "17:00",
        openingReading: 2515.4,
        closingReading: 2521.6,
        diesel: 20,
        equipmentId: 47,
        plantUsageId: 161,
        dieselSource: "direct_purchase",
      }],
    };
    getDprSpy.mockReset().mockResolvedValueOnce(original);
    createVersionDprSpy.mockResolvedValueOnce({ id: 401, date: DATE, site: SITE });

    const response = await request(app)
      .post("/api/dprs/267/version")
      .send({
        editedBy: "manager",
        clientTimestamp: "2026-08-24 19:31:00",
        data: {
          date: DATE,
          site: SITE,
          engineer: "DINESH SINGH - FOREMAN",
          remarks: "ADMIN HEADER EDIT",
          role: "manager",
          workType: "road",
          progress: [{
            persistedId: 17,
            activity: "NEW ACTIVITY",
            noSiteWork: false,
            quantity: null,
            chainageReviewStatus: "approved",
            scopeWarningType: null,
            scopeOverrideReason: "forged approval",
            scopeOverrideBy: 999,
          }],
          equipment: [{
            machine: "SOIL COMPACTOR",
            vehicleNo: "TS08JG4572",
            operator: "NEW OPERATOR",
            task: "NEW TASK",
            entryType: "time_meter",
            startTime: "08:10",
            endTime: "17:30",
            openingReading: 2515.4,
            closingReading: 2527.2,
            diesel: 20,
            equipmentId: 47,
            plantUsageId: 161,
            dieselSource: "direct_purchase",
          }],
          labour: [{
            category: "Skilled",
            gender: "Male",
            count: 6,
            task: "NEW TASK",
            contractor: "NEW CONTRACTOR",
            boqItemId: null,
            structureId: null,
          }],
          materials: [],
          sitePurchases: [],
          structureItems: [],
        },
      });

    expect(response.status).toBe(201);
    const [originalId, edited, actor, timestamp, audit] = createVersionDprSpy.mock.calls[0];
    expect(originalId).toBe(267);
    expect(actor).toBe("admin");
    expect(timestamp).toBe("2026-08-24 19:31:00");
    expect(audit).toEqual(expect.objectContaining({ userId: 42 }));
    expect(edited.remarks).toBe("ADMIN HEADER EDIT");
    expect(edited.progress[0]).toEqual(expect.objectContaining({
      activity: "NEW ACTIVITY",
      chainageReviewStatus: "review_required",
      scopeWarningType: "temporary_block",
      scopeOverrideReason: "approved historical exception",
    }));
    expect(edited.equipment[0]).toEqual(expect.objectContaining({
      operator: "NEW OPERATOR",
      endTime: "17:30",
      closingReading: 2527.2,
      equipmentId: 47,
      plantUsageId: 161,
    }));
    expect(edited.labour[0]).toEqual(expect.objectContaining({
      count: 6,
      task: "NEW TASK",
      contractor: "NEW CONTRACTOR",
    }));
    expect(original.remarks).toBe("ORIGINAL HEADER");
    expect(original.equipment[0].plantUsageId).toBe(161);
  });

  it("rejects a non-admin linked opening-meter correction before version persistence", async () => {
    authState.isAdmin = false;
    authState.isOwner = true;
    const original = {
      id: 268,
      date: DATE,
      site: SITE,
      engineer: "DINESH SINGH - FOREMAN",
      role: "manager",
      dprStatus: "submitted",
      progress: [],
      equipment: [{
        machine: "SOIL COMPACTOR",
        entryType: "time_meter",
        openingReading: 2515.4,
        closingReading: 2521.6,
        startTime: "08:10",
        endTime: "17:00",
        diesel: 20,
        equipmentId: 47,
        plantUsageId: 161,
        dieselSource: "direct_purchase",
      }],
    };
    getDprSpy.mockReset().mockResolvedValueOnce(original);

    const response = await request(app)
      .post("/api/dprs/268/version")
      .send({
        editedBy: "admin",
        data: {
          date: DATE,
          site: SITE,
          engineer: "DINESH SINGH - FOREMAN",
          role: "manager",
          workType: "road",
          progress: [],
          equipment: [{
            machine: "SOIL COMPACTOR",
            entryType: "time_meter",
            openingReading: 9999,
            closingReading: 2521.6,
            startTime: "08:10",
            endTime: "17:00",
            diesel: 20,
            equipmentId: 47,
            plantUsageId: 161,
            dieselSource: "direct_purchase",
          }],
          labour: [],
          materials: [],
          sitePurchases: [],
          structureItems: [],
        },
      });

    expect(response.status).toBe(403);
    expect(response.body.error).toBe("LINKED_EQUIPMENT_ADMIN_EDIT_REQUIRED");
    expect(createVersionDprSpy).not.toHaveBeenCalled();
  });

  it("lets an authenticated admin correct an unowned closed usage in the atomic version audit", async () => {
    const original = {
      id: 2681,
      date: DATE,
      site: SITE,
      engineer: "DINESH SINGH - FOREMAN",
      role: "manager",
      dprStatus: "submitted",
      progress: [],
      equipment: [{
        machine: "SOIL COMPACTOR",
        entryType: "time_meter",
        openingReading: 2515.4,
        closingReading: 2521.6,
        startTime: "08:10",
        endTime: "17:00",
        diesel: 20,
        equipmentId: 47,
        plantUsageId: 171,
        dieselSource: "direct_purchase",
      }],
    };
    getDprSpy.mockReset().mockResolvedValueOnce(original);
    getEquipmentUsageLifecycleSpy.mockResolvedValue([{
      id: 171,
      status: "closed",
      dprId: null,
      sourceUsageId: null,
      successorId: null,
    }]);
    createVersionDprSpy.mockResolvedValueOnce({ id: 403, date: DATE, site: SITE });

    const response = await request(app)
      .post("/api/dprs/2681/version")
      .send({
        data: {
          date: DATE,
          site: SITE,
          engineer: "DINESH SINGH - FOREMAN",
          role: "manager",
          workType: "road",
          progress: [],
          equipment: [{
            machine: "SOIL COMPACTOR",
            entryType: "time_meter",
            openingReading: 9999,
            closingReading: 2521.6,
            startTime: "08:10",
            endTime: "17:00",
            diesel: 20,
            equipmentId: 47,
            plantUsageId: 171,
            dieselSource: "direct_purchase",
          }],
          labour: [],
          materials: [],
          sitePurchases: [],
          structureItems: [],
        },
      });

    expect(response.status).toBe(201);
    expect(createVersionDprSpy.mock.calls[0][4]).toEqual(expect.objectContaining({
      allowUnownedLinkedCorrectionIds: [171],
    }));
  });

  it("passes only materially changed unowned usage ids to canonical finalization", async () => {
    const original = {
      id: 26811,
      date: DATE,
      site: SITE,
      engineer: "DINESH SINGH - FOREMAN",
      role: "manager",
      dprStatus: "submitted",
      progress: [],
      equipment: [
        {
          machine: "SOIL COMPACTOR",
          entryType: "time_meter",
          openingReading: 2515.4,
          closingReading: 2521.6,
          startTime: "08:10",
          endTime: "17:00",
          diesel: 20,
          equipmentId: 47,
          plantUsageId: 171,
          dieselSource: "direct_purchase",
        },
        {
          machine: "WATER TANKER",
          entryType: "time_meter",
          openingReading: 100,
          closingReading: 108,
          startTime: "08:10",
          endTime: "17:00",
          diesel: 10,
          equipmentId: 48,
          plantUsageId: 173,
          dieselSource: "direct_purchase",
        },
      ],
    };
    getDprSpy.mockReset().mockResolvedValueOnce(original);
    getEquipmentUsageLifecycleSpy.mockResolvedValue([
      { id: 171, status: "closed", dprId: null, sourceUsageId: null, successorId: null },
      { id: 173, status: "closed", dprId: null, sourceUsageId: null, successorId: null },
    ]);
    createVersionDprSpy.mockResolvedValueOnce({ id: 406, date: DATE, site: SITE });

    const response = await request(app)
      .post("/api/dprs/26811/version")
      .send({
        data: {
          date: DATE,
          site: SITE,
          engineer: "DINESH SINGH - FOREMAN",
          role: "manager",
          workType: "road",
          progress: [],
          equipment: [
            { ...original.equipment[0], openingReading: 9999 },
            { ...original.equipment[1] },
          ],
          labour: [],
          materials: [],
          sitePurchases: [],
          structureItems: [],
        },
      });

    expect(response.status).toBe(201);
    expect(createVersionDprSpy.mock.calls[0][4]).toEqual(expect.objectContaining({
      allowUnownedLinkedCorrectionIds: [171],
    }));
  });

  it("allows an administrator to correct a moved report copy without mutating its canonical predecessor", async () => {
    const original = {
      id: 2682,
      date: DATE,
      site: SITE,
      engineer: "DINESH SINGH - FOREMAN",
      role: "manager",
      dprStatus: "submitted",
      progress: [],
      equipment: [{
        machine: "SOIL COMPACTOR",
        entryType: "time_meter",
        openingReading: 2515.4,
        closingReading: 2521.6,
        startTime: "08:10",
        endTime: "17:00",
        diesel: 20,
        equipmentId: 47,
        plantUsageId: 172,
        dieselSource: "direct_purchase",
      }],
    };
    getDprSpy.mockReset().mockResolvedValueOnce(original);
    getEquipmentUsageLifecycleSpy.mockResolvedValue([{
      id: 172,
      status: "closed",
      dprId: 500,
      sourceUsageId: null,
      successorId: 501,
    }]);
    createVersionDprSpy.mockResolvedValueOnce({ id: 404, date: DATE, site: SITE });

    const response = await request(app)
      .post("/api/dprs/2682/version")
      .send({
        data: {
          date: DATE,
          site: SITE,
          engineer: "DINESH SINGH - FOREMAN",
          role: "manager",
          workType: "road",
          progress: [],
          equipment: [{
            machine: "SOIL COMPACTOR",
            entryType: "time_meter",
            openingReading: 9999,
            closingReading: 2521.6,
            startTime: "08:10",
            endTime: "17:00",
            diesel: 20,
            equipmentId: 47,
            plantUsageId: 172,
            dieselSource: "direct_purchase",
          }],
          labour: [],
          materials: [],
          sitePurchases: [],
          structureItems: [],
        },
      });

    expect(response.status).toBe(201);
    expect(createVersionDprSpy.mock.calls[0][4]).toEqual(expect.objectContaining({
      allowMovedSourceCorrection: true,
    }));
  });

  it("enforces administrator-only physical length overrides with a persisted reason", async () => {
    authState.isAdmin = false;
    authState.isOwner = true;
    const original = {
      id: 2683,
      date: DATE,
      site: SITE,
      engineer: "DINESH SINGH - FOREMAN",
      role: "manager",
      dprStatus: "submitted",
      progress: [],
      equipment: [],
    };
    getDprSpy.mockReset().mockResolvedValueOnce(original);
    const payload = {
      date: DATE,
      site: SITE,
      engineer: "DINESH SINGH - FOREMAN",
      role: "manager",
      workType: "road",
      progress: [{
        activity: "GSB LAYING",
        side: "LHS",
        chainageFrom: "1+000",
        chainageTo: "1+100",
        length: 999,
        width: 2,
        thickness: null,
        quantity: null,
        noSiteWork: false,
      }],
      equipment: [],
      labour: [],
      materials: [],
      sitePurchases: [],
      structureItems: [],
    };
    const blocked = await request(app).post("/api/dprs/2683/version").send({ data: payload });
    expect(blocked.status).toBe(400);
    expect(blocked.body.code).toBe("DPR_GEOMETRY_INVALID");
    expect(createVersionDprSpy).not.toHaveBeenCalled();

    authState.isAdmin = true;
    getDprSpy.mockReset().mockResolvedValueOnce(original);
    createVersionDprSpy.mockResolvedValueOnce({ id: 405, date: DATE, site: SITE });
    const allowed = await request(app).post("/api/dprs/2683/version").send({
      data: {
        ...payload,
        progress: [{ ...payload.progress[0], lengthOverrideReason: "survey measured curve" }],
      },
    });
    expect(allowed.status).toBe(201);
    expect(createVersionDprSpy.mock.calls[0][1].progress[0]).toEqual(expect.objectContaining({
      length: 999,
      lengthOverrideReason: "survey measured curve",
    }));
  });

  it("rejects an explicit length when chainage is invalid unless an admin documents the correction", async () => {
    authState.isAdmin = false;
    authState.isOwner = true;
    const original = {
      id: 2684,
      date: DATE,
      site: SITE,
      engineer: "DINESH SINGH - FOREMAN",
      role: "manager",
      dprStatus: "submitted",
      progress: [],
      equipment: [],
    };
    const payload = {
      date: DATE,
      site: SITE,
      engineer: "DINESH SINGH - FOREMAN",
      role: "manager",
      workType: "road",
      progress: [{
        activity: "INVALID CHAINAGE",
        chainageFrom: "not-a-chainage",
        chainageTo: "",
        length: 42,
        width: 2,
        thickness: null,
        quantity: 84,
        quantitySource: "calculated",
        quantitySourceNote: "",
        noSiteWork: false,
      }],
      equipment: [],
      labour: [],
      materials: [],
      sitePurchases: [],
      structureItems: [],
    };
    getDprSpy.mockReset().mockResolvedValueOnce(original);
    const blocked = await request(app).post("/api/dprs/2684/version").send({ data: payload });
    expect(blocked.status).toBe(400);
    expect(blocked.body.code).toBe("DPR_GEOMETRY_INVALID");
    expect(createVersionDprSpy).not.toHaveBeenCalled();

    authState.isAdmin = true;
    getDprSpy.mockReset().mockResolvedValueOnce(original);
    createVersionDprSpy.mockResolvedValueOnce({ id: 407, date: DATE, site: SITE });
    const allowed = await request(app).post("/api/dprs/2684/version").send({
      data: {
        ...payload,
        progress: [{ ...payload.progress[0], lengthOverrideReason: "survey measured curve" }],
      },
    });
    expect(allowed.status).toBe(201);
    expect(createVersionDprSpy.mock.calls[0][1].progress[0]).toEqual(expect.objectContaining({
      length: 42,
      lengthOverrideReason: "survey measured curve",
    }));
  });

  it("resets approval facts when a validated progress row changes its chainage", async () => {
    const original = {
      id: 26841,
      date: DATE,
      site: SITE,
      engineer: "DINESH SINGH - FOREMAN",
      role: "manager",
      dprStatus: "submitted",
      progress: [{
        id: 56,
        entryKey: "legacy-row",
        activity: "GSB LAYING",
        side: "LHS",
        chainageFrom: "1+000",
        chainageTo: "1+100",
        length: 100,
        width: 2,
        quantity: 200,
        quantitySource: "calculated",
        uom: "SQM",
        chainageReviewStatus: "approved",
        scopeWarningType: null,
        scopeOverrideReason: "old approval",
        noSiteWork: false,
      }],
      equipment: [],
    };
    getDprSpy.mockReset().mockResolvedValueOnce(original);
    createVersionDprSpy.mockResolvedValueOnce({ id: 411, date: DATE, site: SITE });
    const response = await request(app)
      .post("/api/dprs/26841/version")
      .send({
        data: {
          date: DATE,
          site: SITE,
          engineer: "DINESH SINGH - FOREMAN",
          role: "manager",
          workType: "road",
          progress: [{
            persistedId: 56,
            entryKey: "legacy-row",
            activity: "GSB LAYING",
            side: "LHS",
            chainageFrom: "1+000",
            chainageTo: "1+200",
            width: 2,
            quantity: 400,
            quantitySource: "calculated",
            uom: "SQM",
            chainageReviewStatus: "approved",
            scopeOverrideReason: "forged approval",
            noSiteWork: false,
          }],
          equipment: [],
          labour: [],
          materials: [],
          sitePurchases: [],
          structureItems: [],
        },
      });

    expect(response.status).toBe(201);
    expect(createVersionDprSpy.mock.calls[0][1].progress[0]).toEqual(expect.objectContaining({
      chainageReviewStatus: null,
      scopeWarningType: null,
      scopeOverrideReason: null,
    }));
  });

  it("rejects duplicate and conflicting progress identity claims before preserving facts", async () => {
    const original = {
      id: 26842,
      date: DATE,
      site: SITE,
      engineer: "DINESH SINGH - FOREMAN",
      role: "manager",
      dprStatus: "submitted",
      progress: [
        { id: 60, entryKey: "row-a", activity: "A", noSiteWork: false, chainageReviewStatus: "approved" },
        { id: 61, entryKey: "row-b", activity: "B", noSiteWork: false, chainageReviewStatus: "review_required" },
      ],
      equipment: [],
    };
    const baseData = {
      date: DATE,
      site: SITE,
      engineer: "DINESH SINGH - FOREMAN",
      role: "manager",
      workType: "road",
      equipment: [],
      labour: [],
      materials: [],
      sitePurchases: [],
      structureItems: [],
    };
    const attempts = [
      [{ persistedId: 60, activity: "A" }, { persistedId: 60, activity: "A copy" }],
      [{ entryKey: "new-row", activity: "A" }, { entryKey: "new-row", activity: "B" }],
      [{ persistedId: 60, entryKey: "row-b", activity: "A" }],
    ];
    for (const progress of attempts) {
      getDprSpy.mockReset().mockResolvedValueOnce(original);
      const response = await request(app)
        .post("/api/dprs/26842/version")
        .send({ data: { ...baseData, progress } });
      expect(response.status).toBe(400);
      expect(response.body.code).toBe("DPR_PROGRESS_IDENTITY_INVALID");
      expect(createVersionDprSpy).not.toHaveBeenCalled();
    }
  });

  it("treats legacy null Km fields and null/false incidental flags as unchanged", async () => {
    const original = {
      id: 26843,
      date: DATE,
      site: SITE,
      engineer: "DINESH SINGH - FOREMAN",
      role: "manager",
      dprStatus: "submitted",
      progress: [{
        id: 57,
        entryKey: "legacy-km",
        activity: "GSB LAYING",
        side: "LHS",
        chainageFrom: "1+000",
        chainageTo: "1+100",
        chainageFromKm: null,
        chainageToKm: null,
        length: 100,
        width: 2,
        quantity: 200,
        quantitySource: "calculated",
        uom: "SQM",
        noSiteWork: false,
        isIncidental: null,
        chainageReviewStatus: "approved",
      }],
      equipment: [],
    };
    getDprSpy.mockReset().mockResolvedValueOnce(original);
    createVersionDprSpy.mockResolvedValueOnce({ id: 412, date: DATE, site: SITE });
    const response = await request(app)
      .post("/api/dprs/26843/version")
      .send({
        data: {
          date: DATE,
          site: SITE,
          engineer: "DINESH SINGH - FOREMAN",
          role: "manager",
          workType: "road",
          progress: [{
            persistedId: 57,
            entryKey: "legacy-km",
            activity: "GSB LAYING",
            side: "LHS",
            chainageFrom: "1+000",
            chainageTo: "1+100",
            chainageFromKm: 1,
            chainageToKm: 1.1,
            length: 100,
            width: 2,
            quantity: 200,
            quantitySource: "calculated",
            uom: "SQM",
          }],
          equipment: [],
          labour: [],
          materials: [],
          sitePurchases: [],
          structureItems: [],
        },
      });

    expect(response.status).toBe(201);
    expect(createVersionDprSpy.mock.calls[0][1].progress[0].chainageReviewStatus).toBe("approved");
  });

  it("preserves an unchanged legacy length when old chainage fields are absent", async () => {
    const original = {
      id: 2685,
      date: DATE,
      site: SITE,
      engineer: "DINESH SINGH - FOREMAN",
      role: "manager",
      dprStatus: "submitted",
      progress: [{
        id: 55,
        entryKey: null,
        activity: "LEGACY MEASURED",
        length: 42,
        quantity: 84,
        quantitySource: "measured",
        quantitySourceNote: "legacy tape measurement",
        noSiteWork: false,
      }],
      equipment: [],
    };
    getDprSpy.mockReset().mockResolvedValueOnce(original);
    createVersionDprSpy.mockResolvedValueOnce({ id: 408, date: DATE, site: SITE });
    const response = await request(app)
      .post("/api/dprs/2685/version")
      .send({
        data: {
          date: DATE,
          site: SITE,
          engineer: "DINESH SINGH - FOREMAN",
          role: "manager",
          workType: "road",
          progress: [{
            persistedId: 55,
            activity: "LEGACY MEASURED EDIT",
            quantity: 84,
            quantitySource: "measured",
            quantitySourceNote: "legacy tape measurement",
            noSiteWork: false,
          }],
          equipment: [],
          labour: [],
          materials: [],
          sitePurchases: [],
          structureItems: [],
        },
      });

    expect(response.status).toBe(201);
    expect(createVersionDprSpy.mock.calls[0][1].progress[0]).toEqual(expect.objectContaining({
      length: 42,
      persistedId: 55,
    }));
  });

  it("normalizes a physical UOM alias instead of rejecting an administrator save", async () => {
    getBoqItemSpy.mockResolvedValue({
      id: 77,
      unit: "Sq.m",
      dprMeasurementMethod: "SQM_LW",
      dprConversionFactor: null,
    });
    const original = {
      id: 2686,
      date: DATE,
      site: SITE,
      engineer: "DINESH SINGH - FOREMAN",
      role: "manager",
      dprStatus: "submitted",
      progress: [],
      equipment: [],
    };
    getDprSpy.mockReset().mockResolvedValueOnce(original);
    createVersionDprSpy.mockResolvedValueOnce({ id: 409, date: DATE, site: SITE });
    const response = await request(app)
      .post("/api/dprs/2686/version")
      .send({
        data: {
          date: DATE,
          site: SITE,
          engineer: "DINESH SINGH - FOREMAN",
          role: "manager",
          workType: "road",
          progress: [{
            activity: "GSB LAYING",
            side: "LHS",
            chainageFrom: "1+000",
            chainageTo: "1+100",
            length: 100,
            width: 2,
            quantity: 200,
            quantitySource: "calculated",
            uom: "m2",
            boqItemId: 77,
            noSiteWork: false,
          }],
          equipment: [],
          labour: [],
          materials: [],
          sitePurchases: [],
          structureItems: [],
        },
      });

    expect(response.status).toBe(201);
    expect(createVersionDprSpy.mock.calls[0][1].progress[0].uom).toBe("SQM");
  });

  it("requires reasoned conversion metadata for a true administrator UOM override", async () => {
    getBoqItemSpy.mockResolvedValue({
      id: 78,
      unit: "MT",
      dprMeasurementMethod: "MT_manual",
      dprConversionFactor: 0.5,
    });
    const original = {
      id: 2687,
      date: DATE,
      site: SITE,
      engineer: "DINESH SINGH - FOREMAN",
      role: "manager",
      dprStatus: "submitted",
      progress: [],
      equipment: [],
    };
    getDprSpy.mockReset().mockResolvedValueOnce(original);
    createVersionDprSpy.mockResolvedValueOnce({ id: 410, date: DATE, site: SITE });
    const response = await request(app)
      .post("/api/dprs/2687/version")
      .send({
        data: {
          date: DATE,
          site: SITE,
          engineer: "DINESH SINGH - FOREMAN",
          role: "manager",
          workType: "road",
          progress: [{
            activity: "AGGREGATE",
            quantity: 10,
            quantitySource: "measured",
            quantitySourceNote: "weighbridge",
            uom: "CUM",
            uomOverrideReason: "approved density conversion",
            boqItemId: 78,
            noSiteWork: false,
          }],
          equipment: [],
          labour: [],
          materials: [],
          sitePurchases: [],
          structureItems: [],
        },
      });

    expect(response.status).toBe(201);
    expect(createVersionDprSpy.mock.calls[0][1].progress[0]).toEqual(expect.objectContaining({
      uom: "MT",
      quantity: 5,
    }));
    expect(createVersionDprSpy.mock.calls[0][1].progress[0].quantitySourceNote).toContain("approved density conversion");
  });

  it("allows an admin to remove a linked DPR row without reassigning its lifecycle identity", async () => {
    const original = {
      id: 269,
      date: DATE,
      site: SITE,
      engineer: "DINESH SINGH - FOREMAN",
      role: "manager",
      dprStatus: "submitted",
      progress: [],
      equipment: [{
        machine: "SOIL COMPACTOR",
        entryType: "time_meter",
        openingReading: 2515.4,
        closingReading: 2521.6,
        startTime: "08:10",
        endTime: "17:00",
        diesel: 20,
        equipmentId: 47,
        plantUsageId: 161,
        dieselSource: "direct_purchase",
      }],
    };
    getDprSpy.mockReset().mockResolvedValueOnce(original);
    getEquipmentUsageLifecycleSpy.mockResolvedValue([{
      id: 161,
      status: "closed",
      dprId: 500,
      sourceUsageId: null,
      successorId: 501,
    }]);
    createVersionDprSpy.mockResolvedValueOnce({ id: 402, date: DATE, site: SITE });

    const response = await request(app)
      .post("/api/dprs/269/version")
      .send({
        data: {
          date: DATE,
          site: SITE,
          engineer: "DINESH SINGH - FOREMAN",
          role: "manager",
          workType: "road",
          progress: [],
          equipment: [],
          labour: [],
          materials: [],
          sitePurchases: [],
          structureItems: [],
        },
      });

    expect(response.status).toBe(201);
    expect(createVersionDprSpy).toHaveBeenCalledTimes(1);
    expect(createVersionDprSpy.mock.calls[0][1].equipment).toEqual([]);
  });
});