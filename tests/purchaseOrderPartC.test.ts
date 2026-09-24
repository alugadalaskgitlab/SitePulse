import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import { createServer } from "http";
import request from "supertest";
import type { NextFunction, Request, Response } from "express";
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { buildPurchaseOrderPdf } from "../server/purchase-order-pdf";

const fx = vi.hoisted(() => ({
  indent: null as any,
  user: { id: 7, isAdmin: true, isOwner: false } as any,
  allowed: null as number[] | null,
  masterView: true,
  vendor: { id: 3, name: "SYNTHETIC Master", businessName: "SYNTHETIC Works", gstNumber: "GST-SYN", panNumber: "PAN-SYN", address: "SYNTHETIC Road", bankName: "SYNTHETIC Bank", bankAccountNumber: "SYN-123" } as any,
  built: vi.fn().mockResolvedValue(Buffer.from("%PDF-1.4")),
  purchaserAction: vi.fn().mockResolvedValue({ txnIdsByItemId: {}, grnIdsByItemId: {}, routeWarnings: [] }),
}));
vi.mock("../server/purchase-order-pdf", () => ({ buildPurchaseOrderPdf: fx.built }));
vi.mock("../server/db", () => ({ db: { select: () => ({ from: () => ({ where: () => ({ limit: async () => [fx.vendor] }) }) }) } }));
vi.mock("../server/storage", () => ({ storage: new Proxy({
  getPurchaseIndent: async () => fx.indent,
  getSites: async () => [{ id: 1, name: "SYNTHETIC Site A" }, { id: 2, name: "SYNTHETIC Site B" }],
  getUserPermittedSiteIds: async () => fx.allowed,
  getSetting: async (key: string) => key === "licensed_modules" ? "[]" : null,
  submitPurchaserAction: fx.purchaserAction,
}, { get(target: any, key: string) { return key in target ? target[key] : vi.fn().mockResolvedValue([]); } }) }));
vi.mock("../server/push", () => ({ sendPushToAll: vi.fn(), sendPushToAudience: vi.fn(), sendPushToSection: vi.fn(), sendTestPush: vi.fn() }));
vi.mock("../server/auth", () => ({
  requireAuth: (req: Request, _res: Response, next: NextFunction) => { (req as any).authUser = fx.user; (req as any).authPermissions = { purchase_indents_view: { view: true }, master_parties: { view: fx.masterView } }; next(); },
  isPublicApiPath: () => false, isOptionalAuthPath: () => false,
  optionalAuth: (_req: Request, _res: Response, next: NextFunction) => next(),
  lookupSessionFromCookie: vi.fn(), loadUserPermissionsMatrix: vi.fn(),
}));
vi.mock("../server/auth-routes", () => ({
  registerAuthRoutes: vi.fn(), assertCreate: () => true, assertEdit: () => true,
  assertAdmin: () => true, assertView: (req: any, res: any, key: string) => {
    if (!req.authUser) { res.status(401).end(); return false; }
    if (req.authUser.isAdmin || req.authUser.isOwner || req.authPermissions?.[key]?.view) return true;
    res.status(403).end(); return false;
  },
  assertViewEither: () => true, assertAuthed: () => true, assertCreateOrEdit: () => true,
  assertCreateEither: () => true, assertApprove: () => true, assertDeleteOrCancel: () => true,
  currentUserName: () => "SYNTHETIC Test",
}));

let app: express.Express;
const url = "/api/purchase-indents/1/items/10/purchase-order.pdf";
const item = { id: 10, description: "SYNTHETIC GSB", spec: null, purchaseStatus: "ORDERED", vendor: "SYNTHETIC Vendor", vendorId: 3, orderNo: "PO-SYN", orderedQty: 12, qty: 15, uom: "MT", rate: 320, expectedDelivery: "2026-09-29", paymentMode: "credit", receivingLocation: "site", receivingSiteId: 1 };
beforeAll(async () => {
  const { registerRoutes } = await import("../server/routes");
  app = express();
  app.use(express.json());
  await registerRoutes(createServer(app), app);
});
beforeEach(() => {
  fx.built.mockClear();
  fx.purchaserAction.mockClear();
  fx.indent = { id: 1, indentNo: "PI-SYN", siteId: 1, raisedFrom: "SYNTHETIC Site A", items: [{ ...item }] };
  fx.user = { id: 7, isAdmin: true, isOwner: false };
  fx.allowed = null;
  fx.masterView = true;
});

describe("Part C real export handler", () => {
  it("renders ordered bulk and store items; inline preview and attachment are read-only", async () => {
    for (const type of ["material", "stores"]) {
      fx.indent.piType = type;
      const preview = await request(app).get(`${url}?preview=1`);
      expect(preview.status).toBe(200);
      expect(preview.headers["content-disposition"]).toMatch(/^inline/);
      expect(fx.built).toHaveBeenLastCalledWith(expect.objectContaining({ indentNo: "PI-SYN", orderNo: "PO-SYN", qty: 12, destination: "SYNTHETIC Site A", rate: 320 }));
      const download = await request(app).get(url);
      expect(download.status).toBe(200);
      expect(download.headers["content-disposition"]).toMatch(/^attachment/);
    }
    expect(fx.indent.items[0].purchaseStatus).toBe("ORDERED");
  });
  it("uses only reviewed vendor links, masks bank for non-admin and hides master when not permitted", async () => {
    fx.user = { id: 7, isAdmin: false };
    fx.allowed = [1];
    expect((await request(app).get(url)).status).toBe(200);
    expect(fx.built).toHaveBeenLastCalledWith(expect.objectContaining({ linkedVendor: fx.vendor, showBank: false }));
    fx.indent.items[0].vendorId = null;
    expect((await request(app).get(url)).status).toBe(200);
    expect(fx.built).toHaveBeenLastCalledWith(expect.objectContaining({ linkedVendor: null }));
    fx.indent.items[0].vendorId = 3;
    fx.masterView = false;
    expect((await request(app).get(url)).status).toBe(200);
    expect(fx.built).toHaveBeenLastCalledWith(expect.objectContaining({ linkedVendor: null }));
  });
  it("omits linked business, GST and PAN in the actual PDF when master_parties.view is denied", async () => {
    const real = await vi.importActual<typeof import("../server/purchase-order-pdf")>("../server/purchase-order-pdf");
    fx.user = { id: 7, isAdmin: false };
    fx.allowed = [1];
    fx.masterView = false;
    fx.built.mockImplementationOnce(real.buildPurchaseOrderPdf);
    const response = await request(app).get(url).buffer(true);
    expect(response.status).toBe(200);
    expect(fx.built).toHaveBeenLastCalledWith(expect.objectContaining({ linkedVendor: null, vendor: "SYNTHETIC Vendor" }));
    const file = "reports/part-c/master-view-denied.pdf";
    writeFileSync(file, response.body as Buffer);
    const text = execFileSync("pdftotext", [file, "-"], { encoding: "utf8" });
    expect(text).toContain("SYNTHETIC Vendor");
    expect(text).not.toMatch(/SYNTHETIC Works|GST-SYN|PAN-SYN|SYN-123/);
  });
  it("exports legacy bulk orders recorded at indent level", async () => {
    fx.indent.piType = "material";
    fx.indent.status = "ordered";
    fx.indent.items[0].purchaseStatus = null;
    expect((await request(app).get(url)).status).toBe(200);
  });
  it("submits both bulk and store orders without generating or requiring a PDF", async () => {
    for (const type of ["material", "stores"]) {
      fx.indent.piType = type;
      const response = await request(app).post("/api/purchase-indents/1/purchaser-action")
        .send({ items: [{ itemId: 10, purchaseActionType: "ordered", qty: 12, rate: 320, expectedDeliveryDate: "2026-09-29", vendor: "SYNTHETIC Vendor", ...(type === "material" ? { receivingLocation: "site", receivingSiteId: 1 } : {}) }] });
      expect(response.status).toBe(200);
    }
    expect(fx.purchaserAction).toHaveBeenCalledTimes(2);
    expect(fx.built).not.toHaveBeenCalled();
  });
  it("denies unauthorized PI/site/destination and non-ordered export without generating PDFs", async () => {
    fx.user = null;
    expect((await request(app).get(url)).status).toBe(401);
    fx.user = { id: 7, isAdmin: false };
    fx.allowed = [2];
    expect((await request(app).get(url)).status).toBe(403);
    fx.allowed = [1];
    fx.indent.items[0].receivingSiteId = 2;
    expect((await request(app).get(url)).status).toBe(403);
    fx.indent.items[0].receivingSiteId = 1;
    fx.indent.items[0].purchaseStatus = "approved";
    expect((await request(app).get(url)).status).toBe(409);
    expect((await request(app).get("/api/purchase-indents/1/items/99/purchase-order.pdf")).status).toBe(404);
    expect(fx.built).not.toHaveBeenCalled();
  });
});

it("offers optional review and export on the ordered item panel, not the mark-ordered submit", () => {
  const ui = readFileSync("client/src/pages/PurchaseIndents.tsx", "utf8");
  const orderedPanel = ui.slice(ui.indexOf("if (isOrdered) {"), ui.indexOf("Record Delivery expandable panel", ui.indexOf("if (isOrdered) {")));
  expect(orderedPanel).toContain("button-po-preview-");
  expect(orderedPanel).not.toContain("link-po-export-");
  expect(ui).toContain('data-testid="po-pdf-preview"');
  expect(ui).toContain('data-testid="button-po-download"');
  expect(ui).not.toContain("link-po-export-");
  const markOrdered = ui.slice(ui.indexOf("button-mark-ordered-") - 250, ui.indexOf("button-mark-ordered-") + 100);
  expect(markOrdered).not.toMatch(/poPreview|purchase-order/);
});