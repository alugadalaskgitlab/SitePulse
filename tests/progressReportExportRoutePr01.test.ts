import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { NextFunction, Request, Response } from "express";
import express from "express";
import { createServer } from "node:http";
import request from "supertest";
import * as XLSX from "xlsx";

const fx = vi.hoisted(() => ({
  getBoqProject: vi.fn(),
  getBoqItems: vi.fn(),
  getProgressReportEntries: vi.fn(),
  getSites: vi.fn(),
}));

vi.mock("../server/storage", () => {
  const ErrorClass = class extends Error {};
  const base: Record<string, any> = {
    getBoqProject: fx.getBoqProject,
    getBoqItems: fx.getBoqItems,
    getProgressReportEntries: fx.getProgressReportEntries,
    getSites: fx.getSites,
  };
  return {
    storage: new Proxy(base, {
      get(target, key: string) {
        return key in target ? target[key] : (target[key] = vi.fn().mockResolvedValue([]));
      },
    }),
    StockShortageError: ErrorClass,
    EquipmentIncomingConflictError: ErrorClass,
    InsufficientPlantStockError: ErrorClass,
    InvalidStockTransferQuantityError: ErrorClass,
    InvalidDieselSourceError: ErrorClass,
    DieselReceiptExceedsRemainingError: ErrorClass,
    CutFillInsufficientAvailabilityError: ErrorClass,
    CutFillValidationError: ErrorClass,
    AttachmentReferenceError: ErrorClass,
    InvalidDieselPhysicalStockError: ErrorClass,
    assertValidDieselPhysicalStock: vi.fn(),
  };
});

vi.mock("../server/push", () => ({
  sendPushToAll: vi.fn(),
  sendPushToAudience: vi.fn(),
  sendPushToSection: vi.fn(),
  sendPushToRaiser: vi.fn(),
  sendTestPush: vi.fn(),
}));

vi.mock("../server/auth", () => ({
  requireAuth: (req: Request, _res: Response, next: NextFunction) => {
    (req as any).authUser = { id: 701, username: "pr01-export", isAdmin: true, isActive: true };
    next();
  },
  isPublicApiPath: () => false,
  isOptionalAuthPath: () => false,
  optionalAuth: (_req: Request, _res: Response, next: NextFunction) => next(),
  lookupSessionFromCookie: vi.fn(),
  loadUserPermissionsMatrix: vi.fn(),
}));

vi.mock("../server/auth-routes", () => ({
  registerAuthRoutes: vi.fn(),
  assertCreate: () => true,
  assertEdit: () => true,
  assertAdmin: () => true,
  assertView: () => true,
  assertViewEither: () => true,
  assertAuthed: () => true,
  assertCreateOrEdit: () => true,
  assertCreateEither: () => true,
  assertApprove: () => true,
  assertDeleteOrCancel: () => true,
  currentUserName: () => "pr01-export",
}));

let app: express.Express;

beforeAll(async () => {
  const { registerRoutes } = await import("../server/routes");
  app = express();
  app.use(express.json());
  await registerRoutes(createServer(app), app);
});

beforeEach(() => {
  vi.clearAllMocks();
  fx.getBoqProject.mockResolvedValue({
    id: 7001,
    name: "PR-01 Route Fixture",
    startDate: "2026-09-01",
    siteId: null,
  });
  fx.getBoqItems.mockResolvedValue([{
    id: 701,
    itemCode: "PR01-DBM",
    description: "Dense Bituminous Macadam",
    unit: "Cum",
    boqQty: 500,
    dprMeasurementMethod: "CUM_LWT",
  }]);
  fx.getProgressReportEntries.mockResolvedValue([
    {
      kind: "progress",
      entryId: 11,
      dprId: 1011,
      dprDate: "2026-09-01",
      site: "Site Alpha – Edited by Admin – 2026-09-16 05:43:09",
      engineer: "A. Engineer",
      boqItemId: 701,
      chainageFrom: "1+000",
      chainageTo: "1+100",
      chainageFromKm: 1,
      chainageToKm: 1.1,
      side: "LHS",
      quantity: 10,
      uom: "Cum",
      remarks: "Previous-period row",
    },
    {
      kind: "progress",
      entryId: 12,
      dprId: 1012,
      dprDate: "2026-09-03",
      site: "Site Alpha - Copy by Engineer - 2026-09-17 06:00:00",
      engineer: "A. Engineer",
      boqItemId: 701,
      chainageFrom: "2+000",
      chainageTo: "2+100",
      chainageFromKm: 2,
      chainageToKm: 2.1,
      side: "LHS",
      quantity: 30,
      uom: "Cum",
      remarks: "Current-period row",
    },
  ]);
  fx.getSites.mockResolvedValue([]);
});

describe("PR-01 real registered Progress Report export route", () => {
  it("builds the real XLSX with unified headers and unchanged report values", async () => {
    const response = await request(app)
      .get("/api/reports/progress/export")
      .query({ projectId: 7001, site: "Site Alpha", from: "2026-09-02", to: "2026-09-30" })
      .buffer(true)
      .parse((res, callback) => {
        const chunks: Buffer[] = [];
        res.on("data", chunk => chunks.push(Buffer.from(chunk)));
        res.on("end", () => callback(null, Buffer.concat(chunks)));
      });

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toMatch(/spreadsheetml/);
    expect(fx.getProgressReportEntries).toHaveBeenCalledWith(7001);

    const workbook = XLSX.read(response.body, { type: "buffer" });
    const summary = XLSX.utils.sheet_to_json(workbook.Sheets["Summary"], { header: 1 }) as unknown[][];
    const detail = XLSX.utils.sheet_to_json(workbook.Sheets["Measurement Details"], { header: 1 }) as unknown[][];

    expect(summary[6]).toEqual([
      "Sl.", "BOQ Item", "UoM", "BOQ Qty", "Previous", "This Period",
      "Cumulative", "Balance", "% Complete", "DPR Count",
    ]);
    expect(detail[0]).toEqual([
      "Date", "Item", "Side", "From", "To", "L", "W", "T",
      "Measured Qty", "Measured UoM", "BOQ Qty", "BOQ UoM", "Cumulative",
      "DPR No.", "Prepared By", "Remarks", "Possible Overlap", "Incidental (no BOQ credit)",
    ]);

    // Real route calculation and filtering: 10 previous + 30 this period = 40.
    expect(summary[7].slice(0, 10)).toEqual([
      1, "Dense Bituminous Macadam", "Cum", 500, 10, 30, 40, 460, 8, 1,
    ]);
    expect(detail).toHaveLength(2);
    expect(detail[1][0]).toBe("2026-09-03");
    expect(detail[1][10]).toBe(30);
    expect(detail[1][12]).toBe(40);
    expect(detail[1][13]).toBe("DPR-1012");
  });
});