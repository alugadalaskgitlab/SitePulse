import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import { createServer } from "http";
import request from "supertest";
import { readFileSync } from "node:fs";
import { recordChange } from "../shared/recordChange";
import { projectVendorLedger, projectVendorPayables } from "../shared/vendorPayables";

const fx: { role: string; permissions: any; allSitesAccess: boolean } = {
  role: "admin",
  permissions: {},
  allSitesAccess: true,
};

vi.mock("../server/push", () => ({
  sendPushToAll: vi.fn().mockResolvedValue(undefined),
  sendPushToSection: vi.fn().mockResolvedValue(undefined),
  sendTestPush: vi.fn().mockResolvedValue(undefined),
  sendPushToAudience: vi.fn().mockResolvedValue(undefined),
  initPush: vi.fn(),
}));

vi.mock("../server/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../server/auth")>();
  const inject = (req: any, _res: any, next: any) => {
    req.authUser = {
      id: 9,
      username: "audit-user",
      fullName: "Audit User",
      role: fx.role,
      isAdmin: fx.role === "admin",
      isOwner: fx.role === "owner",
      isActive: true,
      allSitesAccess: fx.allSitesAccess,
    };
    req.authPermissions = fx.permissions;
    req.session = { role: fx.role, username: "audit-user", userId: 9 };
    next();
  };
  return { ...actual, requireAuth: inject, optionalAuth: inject };
});

vi.mock("../server/storage", () => {
  const methods: Record<string, any> = {};
  const storageProxy = new Proxy(methods, {
    get(target, prop: string) {
      if (!(prop in target)) target[prop] = vi.fn().mockResolvedValue([]);
      return target[prop];
    },
  });
  methods.getVendorBill = vi.fn().mockResolvedValue(undefined);
  methods.getAuditLogs = vi.fn().mockResolvedValue([]);
  methods.getSites = vi.fn().mockResolvedValue([]);
  methods.getUserSiteAccess = vi.fn().mockResolvedValue([]);
  methods.getUserPermittedSiteIds = vi.fn().mockResolvedValue([]);
  methods.logAudit = vi.fn(async (entry: any) => entry);
  methods.createVendorBill = vi.fn().mockResolvedValue(undefined);
  methods.updateVendorBill = vi.fn().mockResolvedValue(undefined);
  methods.updateVendorBillDate = vi.fn().mockResolvedValue(undefined);
  methods.updateVendorBillPaymentDetails = vi.fn().mockResolvedValue(undefined);
  methods.updateVendorBillStatus = vi.fn().mockResolvedValue(undefined);
  methods.voidVendorBill = vi.fn().mockResolvedValue(undefined);
  methods.deleteVendorBill = vi.fn().mockResolvedValue(false);
  return { storage: storageProxy };
});

let app: express.Express;
let storage: any;

function makeBill(overrides: Record<string, any> = {}) {
  return {
    id: 7,
    billNo: "VB-007",
    billDate: "2026-10-01",
    billType: "material",
    vendorName: "ACME",
    vendorId: 4,
    siteId: 1,
    status: "approved",
    totalAmount: 100,
    netPayableAmount: 100,
    amountPaid: 40,
    isCancelled: false,
    items: [{ id: 70, billId: 7, amount: 100, siteName: "Site A" }],
    hireStatements: [],
    ...overrides,
  };
}

const billPayload = {
  billDate: "2026-10-01",
  billNo: "VB-007",
  billType: "material",
  vendorName: "ACME",
  status: "draft",
  totalAmount: 100,
  items: [],
};

beforeAll(async () => {
  ({ storage } = await import("../server/storage"));
  const { registerRoutes } = await import("../server/routes");
  app = express();
  app.use(express.json({ limit: "5mb" }));
  await registerRoutes(createServer(app), app);
});

beforeEach(() => {
  vi.clearAllMocks();
  fx.role = "admin";
  fx.permissions = {};
  fx.allSitesAccess = true;
  storage.getVendorBill.mockResolvedValue(undefined);
  storage.getAuditLogs.mockResolvedValue([]);
  storage.getSites.mockResolvedValue([]);
  storage.getUserSiteAccess.mockResolvedValue([]);
  storage.getUserPermittedSiteIds.mockResolvedValue([]);
  storage.logAudit.mockImplementation(async (entry: any) => entry);
  storage.createVendorBill.mockResolvedValue(undefined);
  storage.updateVendorBill.mockResolvedValue(undefined);
  storage.updateVendorBillDate.mockResolvedValue(undefined);
  storage.updateVendorBillPaymentDetails.mockResolvedValue(undefined);
  storage.updateVendorBillStatus.mockResolvedValue(undefined);
  storage.voidVendorBill.mockResolvedValue(undefined);
  storage.deleteVendorBill.mockResolvedValue(false);
});

describe("AUDIT-01 vendor-bill history", () => {
  it("changes only a valid bill date, preserves approved bill facts, and records one date audit", async () => {
    const hireSnapshot = { calculationSnapshot: { grossAmount: 56130, netAmount: 5013.69, frozen: true } };
    const before = makeBill({
      billNo: "HLC/VB/2026/0055",
      billType: "equipment",
      status: "approved",
      billDate: "2026-10-09",
      totalAmount: 56130,
      netPayableAmount: 5013.69,
      amountPaid: 0,
      periodFrom: "2026-08-01",
      periodTo: "2026-08-31",
      verifiedBy: "VERIFIER",
      verifiedAt: "2026-09-30 08:00:00",
      approvedBy: "APPROVER",
      approvedAt: "2026-10-01 09:30:00",
      paidAt: null,
      paymentRecordedBy: null,
      paidBy: null,
      hireStatements: [{ id: 11, status: "approved", ...hireSnapshot }],
      items: [{ id: 70, billId: 7, amount: 56130, siteName: "Site A" }],
    });
    const after = { id: before.id, billDate: "2026-08-31" };
    storage.getVendorBill.mockResolvedValue(before);
    storage.updateVendorBillDate.mockResolvedValue(after);

    const response = await request(app).patch("/api/vendor-bills/7/bill-date")
      .send({ billDate: "2026-08-31", reason: "  Correcting the accounting date  " });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ id: 7, billDate: "2026-08-31" });
    expect(storage.updateVendorBillDate).toHaveBeenCalledWith(7, "2026-08-31", "approved");
    expect(storage.updateVendorBill).not.toHaveBeenCalled();
    expect(storage.updateVendorBillStatus).not.toHaveBeenCalled();
    expect(storage.logAudit).toHaveBeenCalledTimes(1);
    expect(storage.logAudit).toHaveBeenCalledWith(expect.objectContaining({
      module: "vendor_bills",
      transactionId: 7,
      action: "bill_date_changed",
      oldValues: { billDate: "2026-10-09" },
      newValues: { billDate: "2026-08-31" },
      userId: 9,
      userName: "Audit User",
      reason: "Correcting the accounting date",
    }));
    expect(before).toMatchObject({
      status: "approved",
      totalAmount: 56130,
      netPayableAmount: 5013.69,
      amountPaid: 0,
      periodFrom: "2026-08-01",
      periodTo: "2026-08-31",
      verifiedBy: "VERIFIER",
      approvedBy: "APPROVER",
      hireStatements: [{ id: 11, status: "approved", ...hireSnapshot }],
      items: [{ id: 70, amount: 56130 }],
    });
  });

  it("refuses voided bills, malformed dates, and non-admin date changes to approved bills", async () => {
    storage.getVendorBill.mockResolvedValue(makeBill({ isCancelled: true }));
    const voidResponse = await request(app).patch("/api/vendor-bills/7/bill-date").send({ billDate: "2026-10-02" });
    expect(voidResponse.status).toBe(409);
    expect(storage.updateVendorBillDate).not.toHaveBeenCalled();

    storage.getVendorBill.mockResolvedValue(makeBill());
    for (const billDate of ["", "2026-02-29", "2026-13-01", "not-a-date", "2026-1-01"]) {
      const response = await request(app).patch("/api/vendor-bills/7/bill-date").send({ billDate });
      expect(response.status).toBe(400);
    }
    expect(storage.updateVendorBillDate).not.toHaveBeenCalled();

    fx.role = "manager";
    fx.permissions = { vendor_bills: { edit: true } };
    storage.getSites.mockResolvedValue([{ id: 1, name: "Site A" }]);
    storage.getUserPermittedSiteIds.mockResolvedValue([1]);
    const forbidden = await request(app).patch("/api/vendor-bills/7/bill-date").send({ billDate: "2026-10-02" });
    expect(forbidden.status).toBe(403);
    expect(storage.updateVendorBillDate).not.toHaveBeenCalled();
  });

  it("lets ordinary bill editors change a draft date without changing status", async () => {
    fx.role = "manager";
    fx.permissions = { vendor_bills: { edit: true } };
    storage.getSites.mockResolvedValue([{ id: 1, name: "Site A" }]);
    storage.getUserPermittedSiteIds.mockResolvedValue([1]);
    const before = makeBill({ status: "draft", billDate: "2026-10-01" });
    storage.getVendorBill.mockResolvedValue(before);
    storage.updateVendorBillDate.mockResolvedValue({ id: 7, billDate: "2026-10-02" });
    const response = await request(app).patch("/api/vendor-bills/7/bill-date").send({ billDate: "2026-10-02" });
    expect(response.status).toBe(200);
    expect(storage.updateVendorBillDate).toHaveBeenCalledWith(7, "2026-10-02", "draft");
    expect(storage.logAudit).toHaveBeenCalledWith(expect.objectContaining({
      action: "bill_date_changed", reason: null,
      oldValues: { billDate: "2026-10-01" }, newValues: { billDate: "2026-10-02" },
    }));
  });

  it("stores full snapshots and the normalized actor/reason through the shared helper", async () => {
    const before = makeBill();
    const after = makeBill({ status: "paid" });
    const writer = { logAudit: vi.fn(async (entry: any) => entry) };

    await recordChange(
      { authUser: { id: 9, fullName: "Audit User", username: "audit-user", role: "manager" } },
      writer,
      { module: "vendor_bills", transactionId: 7, action: "update", before, after, reason: "  reviewed  " },
    );

    expect(writer.logAudit).toHaveBeenCalledWith(expect.objectContaining({
      module: "vendor_bills",
      transactionId: 7,
      action: "update",
      userId: 9,
      userName: "Audit User",
      userRole: "manager",
      oldValues: before,
      newValues: after,
      reason: "reviewed",
    }));
    await expect(recordChange(
      { authUser: { id: 9 } },
      writer,
      { module: "vendor_bills", transactionId: 7, action: "delete", before },
    )).rejects.toThrow(/reason is required/i);
  });

  it("keeps voided bills visible in the vendor ledger without changing its running balance or payable totals", () => {
    const liveBefore = makeBill({ id: 1, billNo: "VB-001", amountPaid: 40 });
    const voided = makeBill({
      id: 2,
      billNo: "VB-002",
      billDate: "2026-10-02",
      totalAmount: 200,
      netPayableAmount: 200,
      amountPaid: 0,
      isCancelled: true,
      items: [{ id: 20, billId: 2, amount: 200, siteName: "Site A" }],
    });
    const liveAfter = makeBill({
      id: 3,
      billNo: "VB-003",
      billDate: "2026-10-03",
      totalAmount: 300,
      netPayableAmount: 300,
      amountPaid: 0,
      items: [{ id: 30, billId: 3, amount: 300, siteName: "Site A" }],
    });

    const report = projectVendorPayables([liveBefore, voided, liveAfter]);
    const ledger = projectVendorLedger(liveBefore, [liveBefore, voided, liveAfter]);

    expect(report.filteredBills.map(bill => bill.id)).toEqual([1, 3]);
    expect(report.totals.billed).toBe(400);
    expect(ledger.map(line => line.bill.id)).toEqual([1, 2, 3]);
    expect(ledger.map(line => line.runningBalance)).toEqual([60, 60, 360]);
  });

  it("audits ordinary bill creation, edits, payment-detail changes, and status transitions", async () => {
    const created = makeBill({ id: 21, status: "draft", items: [] });
    storage.createVendorBill.mockResolvedValue(created);
    const createResponse = await request(app).post("/api/vendor-bills").send(billPayload);
    expect(createResponse.status).toBe(201);
    expect(storage.logAudit).toHaveBeenLastCalledWith(expect.objectContaining({
      module: "vendor_bills", transactionId: 21, action: "create", oldValues: null, newValues: created,
    }));

    const before = makeBill({ status: "draft" });
    const edited = makeBill({ status: "draft", totalAmount: 125 });
    storage.getVendorBill.mockResolvedValue(before);
    storage.getSites.mockResolvedValue([{ id: 1, name: "Site A" }]);
    storage.updateVendorBill.mockResolvedValue(edited);
    const editResponse = await request(app).put("/api/vendor-bills/7").send({
      ...billPayload, totalAmount: 125, reason: "  corrected quantity  ",
    });
    expect(editResponse.status).toBe(200);
    expect(storage.logAudit).toHaveBeenLastCalledWith(expect.objectContaining({
      transactionId: 7, action: "update", oldValues: before, newValues: edited, reason: "corrected quantity",
    }));

    const approvedBefore = makeBill({ status: "approved" });
    const approvedAfter = makeBill({ billDate: "2026-10-05", status: "draft" });
    storage.getVendorBill.mockResolvedValue(approvedBefore);
    storage.updateVendorBill.mockResolvedValue(approvedAfter);
    const approvedEditResponse = await request(app).put("/api/vendor-bills/7").send({
      ...billPayload, billDate: "2026-10-05",
    });
    expect(approvedEditResponse.status).toBe(200);
    expect(approvedEditResponse.body.billDate).toBe("2026-10-05");
    expect(approvedEditResponse.body.status).toBe("draft");
    expect(storage.updateVendorBill).toHaveBeenLastCalledWith(7, expect.objectContaining({ status: "draft" }));
    for (const field of ["totalAmount", "netPayableAmount", "amountPaid"]) {
      expect(approvedAfter[field]).toBe(approvedBefore[field]);
    }
    expect(storage.logAudit).toHaveBeenNthCalledWith(3, expect.objectContaining({
      module: "vendor_bills", transactionId: 7, action: "update",
      oldValues: approvedBefore, newValues: approvedAfter,
    }));
    expect(storage.logAudit).toHaveBeenNthCalledWith(4, expect.objectContaining({
      module: "vendor_bills", transactionId: 7, action: "status_reset",
      oldValues: { status: "approved" }, newValues: { status: "draft" }, userId: 9,
    }));

    storage.getVendorBill.mockResolvedValue(before);
    const paidDetails = makeBill({ ...before, paymentMode: "upi", paidBy: "company" });
    storage.updateVendorBillPaymentDetails.mockResolvedValue(paidDetails);
    const paymentResponse = await request(app).patch("/api/vendor-bills/7/payment-details")
      .send({ paymentMode: "upi", paidBy: "company" });
    expect(paymentResponse.status).toBe(200);
    expect(storage.logAudit).toHaveBeenLastCalledWith(expect.objectContaining({
      transactionId: 7, action: "update", oldValues: before, newValues: paidDetails,
    }));

    const verified = makeBill({ ...before, status: "verified" });
    storage.updateVendorBillStatus.mockResolvedValue(verified);
    const statusResponse = await request(app).patch("/api/vendor-bills/7/status").send({ status: "verified" });
    expect(statusResponse.status).toBe(200);
    expect(storage.logAudit).toHaveBeenLastCalledWith(expect.objectContaining({
      transactionId: 7, action: "update", oldValues: before, newValues: verified,
    }));
  });

  it("audits void before completion and requires an Owner plus a reason for permanent deletion", async () => {
    const bill = makeBill();
    const events: string[] = [];
    storage.voidVendorBill.mockImplementation(async (_id: number, _userId: number, reason: string, onChange: Function) => {
      const after = makeBill({ isCancelled: true, cancellationReason: reason });
      await onChange(bill, after, {});
      events.push("void-complete");
      return after;
    });
    storage.logAudit.mockImplementation(async (entry: any) => {
      events.push(`audit:${entry.action}`);
      return entry;
    });
    const adminVoidResponse = await request(app).post("/api/vendor-bills/7/void").send({ reason: "duplicate" });
    expect(adminVoidResponse.status).toBe(403);
    expect(storage.voidVendorBill).not.toHaveBeenCalled();

    fx.role = "owner";
    const voidResponse = await request(app).post("/api/vendor-bills/7/void").send({ reason: "duplicate" });
    expect(voidResponse.status).toBe(200);
    expect(events).toEqual(["audit:void", "void-complete"]);

    storage.getVendorBill.mockResolvedValue(bill);
    storage.deleteVendorBill.mockImplementation(async (_id: number, onBeforeDelete: Function) => {
      await onBeforeDelete(bill, {});
      events.push("delete-complete");
      return true;
    });
    fx.role = "admin";
    const adminDelete = await request(app).delete("/api/vendor-bills/7").send({ reason: "duplicate" });
    expect(adminDelete.status).toBe(403);
    expect(storage.deleteVendorBill).not.toHaveBeenCalled();

    fx.role = "owner";
    const missingReason = await request(app).delete("/api/vendor-bills/7").send({});
    expect(missingReason.status).toBe(400);
    expect(storage.deleteVendorBill).not.toHaveBeenCalled();

    const deleteResponse = await request(app).delete("/api/vendor-bills/7").send({ reason: "duplicate entry" });
    expect(deleteResponse.status).toBe(200);
    expect(events.slice(-2)).toEqual(["audit:delete", "delete-complete"]);
    expect(storage.logAudit).toHaveBeenLastCalledWith(expect.objectContaining({
      module: "vendor_bills", transactionId: 7, action: "delete", reason: "duplicate entry", oldValues: bill,
    }), {});
  });

  it("requires module view permission and site scope, and redacts snapshots without View Vendor Financials", async () => {
    const bill = makeBill();
    const logs = [{
      id: 1,
      module: "vendor_bills",
      transactionId: 7,
      action: "update",
      oldValues: { ...bill, totalAmount: 90 },
      newValues: bill,
      reason: "corrected",
    }];
    storage.getVendorBill.mockResolvedValue(bill);
    storage.getAuditLogs.mockResolvedValue(logs);

    fx.role = "viewer";
    fx.permissions = {};
    let response = await request(app).get("/api/audit-logs?module=vendor_bills&transactionId=7");
    expect(response.status).toBe(403);

    fx.role = "admin";
    fx.permissions = {};
    response = await request(app).get("/api/audit-logs?module=vendor_bills&transactionId=7");
    expect(response.status).toBe(200);
    expect(response.headers["cache-control"]).toBe("private, no-store");
    expect(response.body[0]).toMatchObject({ oldValues: null, newValues: null, reason: "corrected" });

    fx.role = "owner";
    response = await request(app).get("/api/audit-logs?module=vendor_bills&transactionId=7");
    expect(response.status).toBe(200);
    expect(response.body[0].oldValues.totalAmount).toBe(90);

    fx.role = "viewer";
    fx.allSitesAccess = false;
    fx.permissions = { vendor_bills: { view: true } };
    storage.getUserSiteAccess.mockResolvedValue([{ siteId: 2 }]);
    storage.getUserPermittedSiteIds.mockResolvedValue([2]);
    storage.getSites.mockResolvedValue([{ id: 1, name: "Site A" }, { id: 2, name: "Site B" }]);
    response = await request(app).get("/api/audit-logs?module=vendor_bills&transactionId=7");
    expect(response.status).toBe(403);
  });

  it("refuses audit history for non-admins across all six supported modules", async () => {
    fx.role = "viewer";
    fx.permissions = {};
    const modules = [
      "dprs",
      "site_material_trips",
      "site_purchases",
      "material_receipts",
      "equipment_maintenance_logs",
      "vendor_bills",
    ];

    for (const module of modules) {
      const response = await request(app)
        .get(`/api/audit-logs?module=${module}&transactionId=7`);
      expect(response.status).toBe(403);
      expect(response.body).toEqual({ error: "admin_required" });
    }
    expect(storage.getAuditLogs).not.toHaveBeenCalled();
  });

  it("audits the integrated hire-statement bill creation path too", () => {
    const source = readFileSync("server/routes.ts", "utf8");
    const start = source.indexOf('app.post("/api/equipment-hire/statements/:id/create-vendor-bill"');
    const end = source.indexOf('app.get("/api/plant-module/equipment"', start);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(source.slice(start, end)).toContain("recordChange(req, storage");
  });

  it("keeps the approved-bill edit permission check and records status reset as a separate history action", () => {
    const routes = readFileSync("server/routes.ts", "utf8");
    const editStart = routes.indexOf('app.put("/api/vendor-bills/:id"');
    const editEnd = routes.indexOf('app.patch("/api/vendor-bills/:id/payment-details"', editStart);
    const editRoute = routes.slice(editStart, editEnd);
    expect(editRoute).toContain('if (existing.status === "verified" || existing.status === "approved" || existing.status === "paid")');
    expect(editRoute).toContain("if (!assertAdmin(req, res)) return;");
    expect(editRoute).toContain('action: "status_reset"');
    const history = readFileSync("client/src/components/HistoryDialog.tsx", "utf8");
    expect(history).toContain('status_reset: "Status reset"');
  });

  it("keeps bill-date persistence restricted to the billDate column", () => {
    const storageSource = readFileSync("server/storage.ts", "utf8");
    const start = storageSource.indexOf("async updateVendorBillDate(");
    const end = storageSource.indexOf("private async generateVendorBillNo()", start);
    const method = storageSource.slice(start, end);
    expect(method).toContain(".set({ billDate })");
    expect(method).toContain("vendorBills.status");
    expect(method).toContain("vendorBills.isCancelled");
    expect(method).not.toContain("periodFrom");
    expect(method).not.toContain("totalAmount");
    expect(method).not.toContain("hireStatements");
  });

  it("resolves the bill author by user id on detail only and leaves the stored author id untouched", async () => {
    const { db } = await import("../server/db");
    const where = vi.fn().mockResolvedValue([{ fullName: "Original Author", username: "author" }]);
    const select = vi.spyOn(db, "select").mockReturnValue({
      from: vi.fn().mockReturnValue({ where }),
    } as any);
    const bill = makeBill({ authorUserId: 44 });
    storage.getVendorBill.mockResolvedValue(bill);

    const detail = await request(app).get("/api/vendor-bills/7");
    expect(detail.status).toBe(200);
    expect(detail.body.authorName).toBe("Original Author");
    expect(where).toHaveBeenCalledTimes(1);
    expect(bill.authorUserId).toBe(44);

    const selectCountAfterDetail = select.mock.calls.length;
    storage.getVendorBills.mockResolvedValue([bill]);
    const list = await request(app).get("/api/vendor-bills");
    expect(list.status).toBe(200);
    expect(select).toHaveBeenCalledTimes(selectCountAfterDetail);
    select.mockRestore();
  });
});
