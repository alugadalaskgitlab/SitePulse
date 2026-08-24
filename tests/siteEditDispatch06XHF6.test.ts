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

const {
  getDprSpy,
  getOpenEquipmentUsageForDateSpy,
  createVersionDprSpy,
  updateEquipmentUsageSpy,
  createEquipmentUsageSpy,
} = vi.hoisted(() => ({
  getDprSpy: vi.fn(),
  getOpenEquipmentUsageForDateSpy: vi.fn(),
  createVersionDprSpy: vi.fn(),
  updateEquipmentUsageSpy: vi.fn(),
  createEquipmentUsageSpy: vi.fn(),
}));

vi.mock("../server/storage", () => {
  const base: Record<string, ReturnType<typeof vi.fn>> = {
    getDpr: getDprSpy,
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
      isAdmin: true,
      isOwner: false,
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
    getDprSpy.mockReset();
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

  it("B: completing from Edit Report closes the original usage id without creating a duplicate", async () => {
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
    expect(updateEquipmentUsageSpy).toHaveBeenCalledTimes(1);
    expect(updateEquipmentUsageSpy).toHaveBeenCalledWith(161, expect.objectContaining({
      closingReading: 2521.6,
      endTime: "17:00",
      status: "closed",
      closedByDprId: 400,
      closedByUserId: 42,
    }));
    expect(createEquipmentUsageSpy).not.toHaveBeenCalled();
  });
});