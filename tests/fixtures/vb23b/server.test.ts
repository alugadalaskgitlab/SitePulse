import { existsSync, rmSync } from "node:fs";
import express from "express";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { z } from "zod";

// Opt-in only: this test server deliberately waits for verify.mjs to drive the
// browser. Normal Vitest runs must skip it rather than waiting for a verifier.
// Full invocation:
//   VB23B_BROWSER_FIXTURE=1 npx vitest run tests/fixtures/vb23b/server.test.ts
// with the vb23b Vite/Chromium/verify.mjs processes running as documented by
// their default ports (4196/9346); the API server listens on 4197.
const browserFixtureEnabled = process.env.VB23B_BROWSER_FIXTURE === "1";

const fixture = vi.hoisted(() => ({
  row: {
    id: 2302,
    billNo: "VB23B-COMBINED-001",
    vendorName: "VB23B ISOLATED VENDOR",
    billType: "all",
    status: "approved",
    billDate: "2026-09-23",
    periodFrom: "2026-09-01",
    periodTo: "2026-09-23",
    totalAmount: 1000,
    netPayableAmount: 1000,
    amountPaid: 0,
    paymentMode: null,
    paidBy: null,
    paymentAccountKey: null,
    createdAt: "2026-09-23T09:00:00Z",
    verifiedAt: "2026-09-23T10:00:00Z",
    verifiedBy: "VB23B VERIFIER",
    approvedAt: "2026-09-23T11:00:00Z",
    approvedBy: "VB23B APPROVER",
    items: [],
    hireStatements: [],
    additionalAdjustments: [],
  } as any,
  selectIndex: 0,
  storageCalls: [] as any[],
  writes: [] as any[],
  httpRequests: [] as any[],
}));

function chain(rows: any[] = []) {
  const value: any = {
    from: () => value,
    where: () => value,
    limit: () => value,
    for: () => value,
    set: (update: any) => {
      fixture.writes.push({ ...update });
      Object.assign(fixture.row, update);
      return value;
    },
    then: (resolve: any, reject: any) => Promise.resolve(rows).then(resolve, reject),
  };
  return value;
}

const transaction = {
  select: vi.fn(() => {
    const rows = fixture.selectIndex++ === 0 ? [{ ...fixture.row }] : [];
    return chain(rows);
  }),
  update: vi.fn(() => chain()),
};
const database = {
  transaction: vi.fn(async (callback: any) => {
    fixture.selectIndex = 0;
    return callback(transaction);
  }),
};
vi.mock("../../../server/db", () => ({ db: database }));

let server: any;
let storage: any;
const stopFile = "tests/fixtures/vb23b/.stop";

beforeAll(async () => {
  if (!browserFixtureEnabled) return;
  rmSync(stopFile, { force: true });
  const { DatabaseStorage } = await import("../../../server/storage");
  storage = new DatabaseStorage();
  // Only readback and configured-account lookup are replaced. Both production
  // write methods execute unchanged against the transaction mock above.
  storage.getVendorBill = vi.fn(async (id: number) => id === fixture.row.id
    ? { ...fixture.row, items: [], hireStatements: [] }
    : undefined);
  storage.getVendorBillCompanyAccounts = vi.fn(async () => [
    { id: "hdfc-current", name: "HDFC CURRENT A/C", type: "bank" },
  ]);

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    fixture.httpRequests.push({ method: req.method, path: req.path, body: req.body });
    next();
  });
  app.get("/api/vendor-bills", (_req, res) => res.json([{ ...fixture.row, items: [], hireStatements: [] }]));
  app.get("/api/vendor-bills/summary", (_req, res) => res.json({
    total: 1, totalAmount: 1000, approved: fixture.row.status === "approved" ? 1 : 0,
    approvedAmount: fixture.row.status === "approved" ? 1000 : 0,
    paid: fixture.row.status === "paid" ? 1 : 0, paidAmount: fixture.row.status === "paid" ? 1000 : 0,
    gstByCategory: {}, totalGst: 0,
  }));
  app.get("/api/vendor-bills/company-accounts", async (_req, res) => res.json(await storage.getVendorBillCompanyAccounts()));
  app.get("/api/vendor-bills/:id", async (req, res) => res.json(await storage.getVendorBill(Number(req.params.id))));
  app.patch("/api/vendor-bills/:id/payment-details", async (req, res) => {
    try {
      const details = z.object({
        paymentMode: z.enum(["cash", "credit", "advance", "upi", "cheque", "rtgs"]).nullable().optional(),
        paidBy: z.string().max(120).nullable().optional(),
        amountPaid: z.number().finite().nonnegative().nullable().optional(),
        paymentAccountKey: z.string().max(120).nullable().optional(),
      }).parse(req.body);
      fixture.storageCalls.push({ method: "updateVendorBillPaymentDetails", id: Number(req.params.id), details });
      const bill = await storage.updateVendorBillPaymentDetails(Number(req.params.id), details);
      res.json(bill);
    } catch (error: any) {
      res.status(error?.code === "CONFLICT" ? 409 : 400).json({ message: error.message });
    }
  });
  app.patch("/api/vendor-bills/:id/status", async (req, res) => {
    try {
      const { status } = z.object({ status: z.enum(["draft", "verified", "approved", "paid"]) }).parse(req.body);
      fixture.storageCalls.push({ method: "updateVendorBillStatus", id: Number(req.params.id), status, actor: "VB23B ACCOUNTS USER" });
      const bill = await storage.updateVendorBillStatus(Number(req.params.id), status, "VB23B ACCOUNTS USER");
      res.json(bill);
    } catch (error: any) {
      res.status(error?.code === "CONFLICT" ? 409 : 400).json({ message: error.message });
    }
  });
  app.get("/api/vb23b/evidence", (_req, res) => res.json({
    row: fixture.row, writes: fixture.writes, storageCalls: fixture.storageCalls, httpRequests: fixture.httpRequests,
    isolation: "In-memory transaction mock for server/db; no live database connection or writes.",
  }));
  server = await new Promise<any>(resolve => {
    const listener = app.listen(4197, "127.0.0.1", () => resolve(listener));
  });
}, 30_000);

afterAll(() => {
  if (!browserFixtureEnabled) return;
  rmSync(stopFile, { force: true });
  server?.close();
});

(browserFixtureEnabled ? describe : describe.skip)("VB23B browser HTTP/storage server", () => {
  it("serves until isolated verifier finishes and records both real storage writes", async () => {
    for (let count = 0; count < 1200 && !existsSync(stopFile); count += 1) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    expect(existsSync(stopFile)).toBe(true);
    expect(fixture.storageCalls.map(call => call.method)).toEqual([
      "updateVendorBillPaymentDetails",
      "updateVendorBillStatus",
    ]);
    expect(fixture.row).toMatchObject({
      status: "paid",
      paidBy: "company",
      paymentAccountKey: "hdfc-current",
      amountPaid: 1000,
      paymentRecordedBy: "VB23B ACCOUNTS USER",
    });
    expect(fixture.row.paidAt).toEqual(expect.any(String));
  }, 125_000);
});