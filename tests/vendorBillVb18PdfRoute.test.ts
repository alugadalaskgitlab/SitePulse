import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import { createServer } from "http";
import request from "supertest";
import type { NextFunction, Request, Response } from "express";

const fx = vi.hoisted(() => ({
  pdfText: [] as string[],
  pdfEnd: undefined as (() => void) | undefined,
  getVendorBill: vi.fn(),
  getSetting: vi.fn(),
}));

// Exercise the real route and real row-building control flow while capturing
// the strings handed to PDFKit. This keeps the test deterministic without
// fabricating a PDF fixture or writing to a database.
vi.mock("pdfkit", () => {
  class CapturingPdfDocument {
    y = 50;
    on(event: string, handler: (...args: any[]) => void) {
      if (event === "end") fx.pdfEnd = handler;
      return this;
    }
    text(value: unknown) {
      fx.pdfText.push(String(value));
      return this;
    }
    heightOfString() { return 10; }
    bufferedPageRange() { return { start: 0, count: 1 }; }
    switchToPage() { return this; }
    end() { fx.pdfEnd?.(); return this; }
    addPage() { return this; }
    image() { return this; }
    moveDown() { return this; }
    moveTo() { return this; }
    lineTo() { return this; }
    strokeColor() { return this; }
    lineWidth() { return this; }
    stroke() { return this; }
    fillColor() { return this; }
    rect() { return this; }
    fill() { return this; }
    fontSize() { return this; }
    font() { return this; }
  }
  return { default: CapturingPdfDocument };
});

vi.mock("../server/storage", () => ({
  storage: new Proxy({
    getVendorBill: fx.getVendorBill,
    getSetting: fx.getSetting,
  }, {
    get(target: Record<string, any>, key: string) {
      return key in target ? target[key] : (target[key] = vi.fn().mockResolvedValue([]));
    },
  }),
}));

vi.mock("../server/push", () => ({
  sendPushToAll: vi.fn(),
  sendPushToAudience: vi.fn(),
  sendPushToSection: vi.fn().mockResolvedValue(undefined),
  sendTestPush: vi.fn(),
}));

vi.mock("../server/auth", () => ({
  requireAuth: (req: Request, _res: Response, next: NextFunction) => {
    (req as any).authUser = { id: 7, username: "pdf-test", isAdmin: true, isActive: true };
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
  currentUserName: () => "pdf-test",
}));

let app: express.Express;

beforeAll(async () => {
  const { registerRoutes } = await import("../server/routes");
  app = express();
  app.use(express.json());
  await registerRoutes(createServer(app), app);
});

beforeEach(() => {
  fx.pdfText.length = 0;
  fx.pdfEnd = undefined;
  fx.getSetting.mockImplementation(async (key: string) => key === "licensed_modules" ? "[]" : null);
  fx.getVendorBill.mockResolvedValue({
    id: 18,
    billNo: "VB-18-PDF",
    billDate: "2026-09-17",
    billType: "equipment",
    vendorName: "PDF TEST VENDOR",
    status: "approved",
    totalAmount: 1000,
    gstRateEquipment: 18,
    tdsRate: 2,
    adjustmentLabel: "DIESEL RECOVERY",
    adjustmentAmount: -100,
    additionalAdjustments: [
      { label: "CASH ADVANCE", amount: -200 },
      { label: "ZERO-HOLD / CREDIT", amount: 0 },
    ],
    items: [{
      date: "2026-09-17",
      category: "equipment",
      description: "JCB HIRE",
      qty: 1,
      unit: "DAY",
      rate: 1000,
      amount: 1000,
    }],
  });
});

describe("VB18 real vendor-bill PDF route", () => {
  it("renders primary, additional, and labeled-zero rows separately and computes net", async () => {
    const response = await request(app).get("/api/vendor-bills/18/pdf");

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toMatch(/application\/pdf/);
    expect(fx.pdfText).toContain("DIESEL RECOVERY");
    expect(fx.pdfText).toContain("CASH ADVANCE");
    expect(fx.pdfText).toContain("ZERO-HOLD / CREDIT");
    expect(fx.pdfText.filter((value) => value === "NET TOTAL")).toHaveLength(1);
    // 1,000 + 180 GST - 100 primary - 200 additional - 20 TDS.
    expect(fx.pdfText).toContain("Rs. 860.00");
    expect(fx.pdfText).toContain("Rs. -100.00");
    expect(fx.pdfText).toContain("Rs. -200.00");
    expect(fx.pdfText).toContain("Rs. 0.00");
  });
});