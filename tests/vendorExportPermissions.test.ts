import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import fs from "node:fs";
import ts from "typescript";
import express from "express";
import request from "supertest";
import { getBaseSiteName, siteMatchesPermitted, vendorBillVisibleToSites, vendorBillItemMatchesSite } from "../shared/siteName";
import { aggregateGstBreakdown, computeBillGstByCategory } from "../shared/vendor-bill-gst";
import PDFDocument from "pdfkit";
import { buildGstRegisterPdf } from "../server/gstRegisterPdf";
import { financialSites, vendorFinancialGuard } from "../server/vendorFinancialAccess";
import { recordedVendorTds } from "../shared/vendorFinancialAccess";
import { filterFinancialBills, getBillFinancialTotals } from "../shared/vendorBillFinancialReport";
import { buildVendorFinancialWorkbook } from "../server/vendorFinancialWorkbook";
import * as xlsx from "xlsx";
import archiver from "archiver";
import { normalizeVendorBillAdditionalAdjustments } from "../shared/schema";
import { projectBillHireReviews, hireReviewTable, MONTHLY_BILL_HEADERS } from "../shared/vendorBillLayout";
import { buildSavedBillPresentationRows } from "../shared/vendorBillPresentation";
import { buildVendorBillExport } from "../shared/vendorBillExport";
import { buildVendorBillCompleteWorkbook } from "../server/vendorBillCompleteWorkbook";

// Execute the actual checked-in route callbacks and their authorization helpers,
// with isolated storage. Do not start the application's migrations or touch a DB.
const source = fs.readFileSync("server/routes.ts", "utf8");
const ast = ts.createSourceFile("routes.ts", source, ts.ScriptTarget.Latest, true);
function find(predicate: (n: ts.Node) => boolean, root: ts.Node = ast): ts.Node {
  let found: ts.Node | undefined;
  function walk(node: ts.Node) {
    if (found) return;
    if (predicate(node)) { found = node; return; }
    ts.forEachChild(node, walk);
  }
  walk(root);
  if (!found) throw new Error("Missing production node");
  return found;
}
const helpers = ["getPermittedSiteNames", "permittedReportPlants", "assertReportPlant",
  "resolveVendorBillSite", "scopeVendorBillsToSiteAccess", "assertTripSiteAccess", "resolveTrendsRange"];
const helperText = helpers.map(name => find(n => ts.isFunctionDeclaration(n) && n.name?.text === name).getText(ast)).join("\n");
const authSource = fs.readFileSync("server/auth-routes.ts", "utf8");
const authAst = ts.createSourceFile("auth.ts", authSource, ts.ScriptTarget.Latest, true);
const exportGuard = find(n => ts.isFunctionDeclaration(n) && n.name?.text === "assertReportExport", authAst)
  .getText(authAst).replace(/^export /, "");
const endpoints = [
  ["get", "/api/vendor-bills/export", "vendor_bills"],
  ["get", "/api/vendor-bills/:id/pdf", "vendor_bills_view"],
  ["get", "/api/plant-module/daily-reports-export", "plant_daily_reports"],
  ["post", "/api/plant-module/daily-reports/bulk-zip", "plant_daily_reports"],
  ["get", "/api/plant-module/daily-reports/:date/pdf", "plant_daily_reports"],
  ["get", "/api/plant-module/heating-trends/excel", "plant_heating_trends"],
  ["get", "/api/irn/:id/issue-voucher", "irn_view"],
] as const;
let permissions: Record<string, any>;
let permittedIds: number[];
let authUser: Record<string, any>;
const storage = {
  getUserSiteAccess: vi.fn(async () => permittedIds.map(siteId => ({ siteId }))),
  getUserPermittedSiteIds: vi.fn(async () => permittedIds),
  getSites: vi.fn(async () => [{ id: 1, name: "SITE A" }, { id: 2, name: "SITE B" }]),
  listPlantSettings: vi.fn(async () => [{ plantName: "Plant A", siteName: "SITE A" }, { plantName: "Plant B", siteName: "SITE B" }]),
  getVendorBill: vi.fn(async () => ({ id: 2, siteId: 2, status: "approved" })),
  getInternalRequisition: vi.fn(async () => ({ id: 2, siteId: 2, status: "approved" })),
  getVendorBills: vi.fn(async () => [1, 2].map(id => ({
    id, siteId: id, billNo: `BILL-${id}`, vendorName: `VENDOR-${id}`, billDate: "2026-10-01",
    billType: "material", totalAmount: id * 100, gstPercent: 0, items: [], status: "approved",
  }))),
  getVendorNamesByIds: vi.fn(async (ids: number[]) => ids.map(id => ({ id, name: `MASTER-${id}` }))),
  getVendorBillCompanyAccounts: vi.fn(async () => [
    { id: "bank-main", name: "Bank of Baroda - OD", type: "OD", source: "own" },
  ]),
  getVendorNames: vi.fn(async () => ["VENDOR-1", "VENDOR-2", "SECRET VENDOR"]),
  getDailyPlantReportIndex: vi.fn(async () => ["A", "B"].map(letter => ({
    date: "2026-10-01", plantName: `Plant ${letter}`, totalLoads: 1, totalProductionMt: 10,
    sessionsCount: 1, hasDispatches: true, breakdown: [],
  }))),
  getDailyPlantSummary: vi.fn(), getHeatingTrends: vi.fn(),
  getIrnIssueVouchers: vi.fn(async () => []),
  getStoreIssue: vi.fn(async () => ({ id: 99, items: [] })),
};
const app = express();
app.use(express.json());
app.use((req: any, _res, next) => { req.authUser = authUser; req.authPermissions = permissions; next(); });
app.use(vendorFinancialGuard(storage));
const dependencies = { storage, siteMatchesPermitted, vendorBillVisibleToSites, vendorBillItemMatchesSite,
  getBaseSiteName, getBillFinancialTotals, buildSavedBillPresentationRows,
  projectBillHireReviews, hireReviewTable, MONTHLY_BILL_HEADERS,
  financialSites, recordedVendorTds, filterFinancialBills, buildVendorFinancialWorkbook,
  buildVendorBillExport, buildVendorBillCompleteWorkbook,
  aggregateGstBreakdown, computeBillGstByCategory, normalizeVendorBillAdditionalAdjustments, PDFDocument, xlsx, archiver, buildGstRegisterPdf,
  getCompanyLogoPath: () => null,
  // Report layout is not under test here; preserve actual PDF/ZIP streaming.
  renderDailyPlantPdfBody: async (doc: any, _date: string, summary: any) => doc.text(summary.plantName),
  buildBulkZipCoverSheetPdf: vi.fn(async (entries: any[]) => Buffer.from(JSON.stringify(entries))),
  buildDailyPlantReportPdfBuffer: vi.fn(async (_date: string, plant: string) => Buffer.from(plant)),
  getCompanyConfig: async () => ({ companyName: "TEST" }) };
for (const [method, path] of endpoints) {
  const node = find(n => ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression)
    && n.expression.expression.getText(ast) === "app" && n.expression.name.text === method
    && ts.isStringLiteral(n.arguments[0]) && n.arguments[0].text === path) as ts.CallExpression;
  const body = `${helperText}\n${exportGuard}\nconst ISO_DATE_RE=/^\\d{4}-\\d{2}-\\d{2}$/;\nreturn (${node.arguments[1].getText(ast)});`;
  const compiled = ts.transpile(body, { target: ts.ScriptTarget.ES2022 });
  app[method](path, new Function(...Object.keys(dependencies), compiled)(...Object.values(dependencies)));
}
beforeEach(() => {
  permissions = { vendor_financials: { view: true } };
  permittedIds = [1];
  authUser = { id: 7 };
  vi.clearAllMocks();
});

describe("GST Register PDF parity and authorization", () => {
  it("exports the exact financially scoped selection to three sheets", async () => {
    permissions.vendor_bills = { export: true };
    const response = await request(app).get("/api/vendor-bills/export?report=financial-summary&scope=unpaid&billIds=1")
      .buffer(true).parse((res, done) => {
        const chunks: Buffer[] = [];
        res.on("data", c => chunks.push(c)); res.on("end", () => done(null, Buffer.concat(chunks)));
      });
    expect(response.status).toBe(200);
    expect(response.headers["cache-control"]).toContain("no-store");
    const book = xlsx.read(response.body, { type: "buffer" });
    expect(book.SheetNames).toEqual(["Vendor Bills", "GST Register", "TDS (IT) Register"]);
    for (const name of book.SheetNames) {
      const rows = xlsx.utils.sheet_to_json(book.Sheets[name], { header: 1 }) as any[][];
      expect(rows.filter(r => typeof r[0] === "number").map(r => r[0])).toEqual([1]);
      expect(JSON.stringify(rows)).not.toContain("VENDOR-2");
    }
  });
  it.each(["1,2", "2", "1,1", "bad"])("rejects stale, unauthorised or malformed export selection %s", async ids => {
    permissions.vendor_bills = { export: true };
    expect((await request(app).get(`/api/vendor-bills/export?report=financial-summary&billIds=${ids}`)).status).toBe(409);
  });
  it("financial workbook cannot bypass the saved financial permission", async () => {
    permissions.vendor_bills = { export: true };
    permissions.vendor_financials = { view: false };
    expect((await request(app).get("/api/vendor-bills/export?report=financial-summary&scope=all&billIds=1")).status).toBe(403);
  });
  it("blocks old export URLs despite ordinary export permission when financial access is off", async () => {
    permissions.vendor_financials = { view: false };
    permissions.vendor_bills = { export: true };
    for (const format of ["pdf", "xlsx", "csv"]) {
      expect((await request(app).get(`/api/vendor-bills/export?format=${format}`)).status).toBe(403);
    }
    expect(storage.getVendorBills).not.toHaveBeenCalled();
  });
  it("exports recorded TDS in the existing Excel action without inventing missing deductions", async () => {
    permissions.vendor_bills = { export: true };
    storage.getVendorBills.mockResolvedValueOnce([
      { id: 1, siteId: 1, billNo: "TDS-SAVED", billDate: "2026-10-01", vendorName: "VENDOR",
        billType: "equipment", totalAmount: 1000, tdsRate: 2, items: [],
        hireStatements: [{ calculationSnapshot: { financials: { tdsAmount: 17 } } }] },
      { id: 2, siteId: 1, billNo: "TDS-MISSING", billDate: "2026-10-01", vendorName: "VENDOR",
        billType: "material", totalAmount: 1000, tdsRate: 2, items: [] },
    ] as any);
    const response = await request(app).get("/api/vendor-bills/export?format=xlsx&report=financial-summary&scope=all&billIds=1,2")
      .buffer(true).parse((res, callback) => {
        const chunks: Buffer[] = [];
        res.on("data", chunk => chunks.push(chunk));
        res.on("end", () => callback(null, Buffer.concat(chunks)));
      });
    expect(response.status).toBe(200);
    const workbook = xlsx.read(response.body, { type: "buffer" });
    expect(workbook.SheetNames).toEqual(["Vendor Bills", "GST Register", "TDS (IT) Register"]);
    const rows = xlsx.utils.sheet_to_json(workbook.Sheets["TDS (IT) Register"], { header: 1 }) as any[][];
    expect(rows.find(row => row[1] === "TDS-SAVED")?.[9]).toBe(17);
    expect(rows.find(row => row[1] === "TDS-MISSING")?.[9]).toBe("Not established");
  });
  it("requires the same report permission as Excel", async () => {
    const response = await request(app).get("/api/vendor-bills/export?format=pdf");
    expect(response.status).toBe(403);
    expect(storage.getVendorBills).not.toHaveBeenCalled();
  });
  it("retains site scope and the same per-bill values", async () => {
    permissions.vendor_bills = { export: true };
    const response = await request(app).get("/api/vendor-bills/export?format=pdf&status=approved&category=material&dateFrom=2026-10-01&dateTo=2026-10-01");
    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toContain("application/pdf");
    const pdf = response.body.toString("latin1");
    for (const value of ["TEST", "BILL-1", "100.00", "Bills in range: 1", "Status filter: approved", "Category filter: material", "GST by Category", "Bill Detail"]) {
      expect(pdf).toContain(value);
    }
    expect(pdf).not.toContain("BILL-2");
    expect(pdf).not.toContain("SECRET VENDOR");
  });
  it("paginates a long register with repeated detail headings", () => {
    const pdf = buildGstRegisterPdf({
      company: "Company", title: "Register", metadata: ["Bills in range: 100"],
      categories: [["MATERIAL", 100, "100.00", "18.00"]],
      details: Array.from({ length: 100 }, (_, i) => [`BILL-${i}`, "2026-10-01", "A long vendor name that must wrap without clipping ".repeat(3), "material", "1.00", "0.18", "1.18"]),
    }).toString("latin1");
    expect(pdf).toContain("BILL-99");
    expect((pdf.match(/Bill No/g) || []).length).toBeGreaterThan(1);
  });
});
const url = (path: string) => path.replace(":id", "2").replace(":date", "2026-10-01");
describe("VB-EXPORT-01 actual export route callbacks", () => {
  it("requires View Vendor Financials before reading bills", async () => {
    permissions.vendor_financials = { view: false };
    authUser = { id: 7, isAdmin: true };
    expect((await request(app).get("/api/vendor-bills/export?format=json")).status).toBe(403);
    expect(storage.getVendorBills).not.toHaveBeenCalled();
  });
  it("requires Administrator or Owner even when financial viewing is granted", async () => {
    authUser = { id: 7 };
    permissions.vendor_bills = { export: true };
    expect((await request(app).get("/api/vendor-bills/export?format=json")).status).toBe(403);
    expect(storage.getVendorBills).not.toHaveBeenCalled();
  });
  it("returns complete JSON and XLSX from the same assembly contract, within admin site scope", async () => {
    authUser = { id: 7, isAdmin: true, fullName: "Site Administrator" };
    storage.getVendorBills.mockResolvedValueOnce([
      {
        id: 1, siteId: 1, billNo: "BILL-LIVE", billDate: "2026-10-01", vendorName: "Recorded Vendor",
        vendorId: 11, billType: "material", status: "approved", totalAmount: 100, netPayableAmount: 90,
        adjustmentLabel: "Advance", adjustmentAmount: -10,
        amountPaid: 25, paymentMode: "Bank", paidBy: "Finance", paymentRecordedBy: "Approver",
        paymentRemarks: "UTR 123", paymentAccountKey: "bank-main", items: [
          { id: 21, description: "Stone", qty: 2, unit: "MT", rate: 50, amount: 100, suppliedTo: "Site A", boqReference: "BOQ-4" },
        ],
        hireStatements: [{
          id: 31, periodFrom: "2026-09-01", periodTo: "2026-09-30", status: "approved",
          grossAmount: 100, deductionAmount: 10, netAmount: 90,
          calculationSnapshot: { financials: { grossHire: 100 }, adjustments: { breakdownDeduction: 10, breakdownDeductionReason: "Fuel" } },
        }],
      },
      {
        id: 2, siteId: 2, billNo: "BILL-OTHER-SITE", billDate: "2026-10-01", vendorName: "Other Vendor",
        billType: "material", status: "approved", totalAmount: 500, items: [],
      },
      {
        id: 3, siteId: 1, billNo: "BILL-VOID", billDate: "2026-09-30", vendorName: "Legacy Name",
        billType: "material", status: "cancelled", totalAmount: 30, items: [], isCancelled: true,
        cancellationReason: "Duplicate", cancelledBy: "Owner", cancelledAt: "2026-10-02T00:00:00Z",
      },
    ] as any);

    const jsonResponse = await request(app).get("/api/vendor-bills/export?format=json");
    expect(jsonResponse.status).toBe(200);
    expect(jsonResponse.body.header).toMatchObject({
      billCount: 2,
      generatedBy: "Site Administrator",
      siteScope: "Permitted sites: SITE A",
      filters: { vendor: "none", billType: "none", status: "none", dateFrom: "none", dateTo: "none", site: "none" },
    });
    expect(jsonResponse.body.bills.map((bill: any) => bill.identity.billNumber)).toEqual(["BILL-LIVE", "BILL-VOID"]);
    const live = jsonResponse.body.bills.find((bill: any) => bill.identity.billNumber === "BILL-LIVE");
    expect(live.vendor).toMatchObject({ recordedName: "Recorded Vendor", linkedVendorMasterId: 11, linkedVendorMasterName: "MASTER-11" });
    expect(live.payments[0]).toMatchObject({
      recordType: "Bill-level cumulative total; no per-payment transaction record is stored",
      paymentDate: "Not recorded", amount: 25, mode: "Bank", account: "Bank of Baroda - OD",
      accountKey: "bank-main", accountSource: "own", reference: "UTR 123",
    });
    expect(live.money).toMatchObject({
      advanceAdjustment: -10,
      amountPaid: 25,
    });
    expect(jsonResponse.body.totals).toMatchObject({
      advanceAdjustments: -10,
      advanceAdjustmentNotIncludedInPaid: true,
      paidKnownSubtotal: 25,
    });
    expect(live.lineItems[0]).toMatchObject({ description: "Stone", quantity: 2, unit: "MT", rate: 50, amount: 100, boqReference: "BOQ-4" });
    expect(live.hireStatements[0].calculationSnapshot.financials.grossHire).toBe(100);
    const voided = jsonResponse.body.bills.find((bill: any) => bill.identity.billNumber === "BILL-VOID");
    expect(voided.status).toMatchObject({ voided: true, voidReason: "Duplicate", voidedBy: "Owner" });
    expect(voided.money.amountPaid).toBe("Unknown");
    expect(voided.money.balance).toBe("Unknown");
    expect(jsonResponse.body.totals).toMatchObject({
      paid: "Unknown", paidKnownSubtotal: 25, knownPaidBillCount: 1, unknownPaidBillCount: 1,
      balance: "Unknown", balanceKnownSubtotal: 65, knownBalanceBillCount: 1, unknownBalanceBillCount: 1,
    });

    storage.getVendorBills.mockResolvedValueOnce([
      {
        id: 1, siteId: 1, billNo: "BILL-LIVE", billDate: "2026-10-01", vendorName: "Recorded Vendor",
        vendorId: 11, billType: "material", status: "approved", totalAmount: 100, netPayableAmount: 90,
        adjustmentLabel: "Advance", adjustmentAmount: -10,
        amountPaid: 25, paymentMode: "Bank", paidBy: "Finance", paymentRecordedBy: "Approver",
        paymentRemarks: "UTR 123", paymentAccountKey: "bank-main", items: [
          { id: 21, description: "Stone", qty: 2, unit: "MT", rate: 50, amount: 100, suppliedTo: "Site A", boqReference: "BOQ-4" },
        ], hireStatements: [],
      },
      { id: 2, siteId: 2, billNo: "BILL-OTHER-SITE", billDate: "2026-10-01", vendorName: "Other Vendor", billType: "material", status: "approved", totalAmount: 500, items: [] },
      {
        id: 3, siteId: 1, billNo: "BILL-VOID", billDate: "2026-09-30", vendorName: "Legacy Name",
        billType: "material", status: "cancelled", totalAmount: 30, items: [], isCancelled: true,
        cancellationReason: "Duplicate", cancelledBy: "Owner", cancelledAt: "2026-10-02T00:00:00Z",
      },
    ] as any);
    const xlsxResponse = await request(app).get("/api/vendor-bills/export?format=xlsx").buffer(true).parse((res, done) => {
      const chunks: Buffer[] = [];
      res.on("data", chunk => chunks.push(chunk));
      res.on("end", () => done(null, Buffer.concat(chunks)));
    });
    expect(xlsxResponse.status).toBe(200);
    const workbook = xlsx.read(xlsxResponse.body, { type: "buffer" });
    expect(workbook.SheetNames).toEqual(["Vendor Bills", "Line Items", "Payments"]);
    const billRows = xlsx.utils.sheet_to_json(workbook.Sheets["Vendor Bills"], { header: 1 }) as any[][];
    const headerIndex = billRows.findIndex(row => row[0] === "Bill ID");
    const columns = billRows[headerIndex];
    const exportedLive = billRows.find(row => row[columns.indexOf("Bill Number")] === "BILL-LIVE")!;
    expect(exportedLive[columns.indexOf("Net")]).toBe(live.money.net);
    expect(exportedLive[columns.indexOf("Gross")]).toBe(live.money.gross);
    expect(exportedLive[columns.indexOf("Payables Basis Gross")]).toBe(live.money.payablesBasisGross);
    expect(exportedLive[columns.indexOf("Amount Paid")]).toBe(live.money.amountPaid);
    expect(exportedLive[columns.indexOf("Balance")]).toBe(live.money.balance);
    const exportedVoid = billRows.find(row => row[columns.indexOf("Bill Number")] === "BILL-VOID")!;
    expect(exportedVoid[columns.indexOf("Amount Paid")]).toBe("Unknown");
    expect(exportedVoid[columns.indexOf("Balance")]).toBe("Unknown");
    const paymentRows = xlsx.utils.sheet_to_json(workbook.Sheets.Payments, { header: 1 }) as any[][];
    expect(paymentRows.some(row => row.includes("BILL-LIVE") && row.includes("UTR 123"))).toBe(true);
    expect(paymentRows.some(row => row.includes("Bank of Baroda - OD") && row.includes("bank-main") && row.includes("own"))).toBe(true);
  });

  it("downloads all 57 bills without oversized cells and keeps funding-source JSON stable", async () => {
    permissions.vendor_bills = { export: true };
    authUser = { id: 7, isAdmin: true, fullName: "Site Administrator" };
    const originalGetVendorBills = storage.getVendorBills.getMockImplementation();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-18T00:00:00.000Z"));

    const bills = Array.from({ length: 57 }, (_, index) => ({
      id: index + 1,
      siteId: 1,
      billNo: `BILL-${String(index + 1).padStart(2, "0")}`,
      billDate: "2026-10-01",
      vendorName: "Recorded Vendor",
      billType: "equipment",
      status: "approved",
      totalAmount: 100,
      netPayableAmount: 90,
      amountPaid: 25,
      items: [],
      hireStatements: [{
        id: 1000 + index,
        periodFrom: "2026-09-01",
        periodTo: "2026-09-30",
        status: "approved",
        grossAmount: 100,
        deductionAmount: 10,
        netAmount: 90,
        calculationSnapshot: {
          financials: { grossHire: 100 },
          sourceEvidence: { snapshotPayload: index === 0 ? `RAW-SNAPSHOT-${"x".repeat(40_000)}` : "small" },
        },
      }],
      ...(index === 0
        ? { additionalAdjustments: [{ label: "Long adjustment ".repeat(2_500), amount: 42 }] }
        : {}),
    })) as any[];
    storage.getVendorBills.mockResolvedValue(bills);

    const rawParser = (response: any, done: (error: any, body?: Buffer) => void) => {
      const chunks: Buffer[] = [];
      response.on("data", (chunk: Buffer | string) =>
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)),
      );
      response.on("end", () => done(null, Buffer.concat(chunks)));
    };

    try {
      const jsonBefore = await request(app)
        .get("/api/vendor-bills/export?format=json")
        .buffer(true)
        .parse(rawParser);
      expect(jsonBefore.status).toBe(200);
      const jsonBeforeBytes = jsonBefore.body as Buffer;
      const jsonBeforeBody = JSON.parse(jsonBeforeBytes.toString("utf8"));
      expect(jsonBeforeBody.header.billCount).toBe(57);
      expect(jsonBeforeBody.bills[0].hireStatements[0].calculationSnapshot.sourceEvidence.snapshotPayload)
        .toHaveLength(40_013);
      expect(jsonBeforeBody.bills[0].payments[0]).toMatchObject({
        account: "Not recorded",
        accountKey: "Not recorded",
        accountSource: "Not recorded",
      });
      expect(createHash("sha256").update(jsonBeforeBytes).digest("hex"))
        .toBe("996545a18e113468ba9a83c8ba408b24971d6291624fd86cc9c4c579a5cb558c");

      const xlsxResponse = await request(app)
        .get("/api/vendor-bills/export?format=xlsx")
        .buffer(true)
        .parse(rawParser);
      expect(xlsxResponse.status).toBe(200);
      expect(xlsxResponse.headers["content-type"]).toContain("spreadsheetml");
      expect(xlsxResponse.headers["content-disposition"]).toContain("vendor-bills-complete.xlsx");

      const workbook = xlsx.read(xlsxResponse.body as Buffer, { type: "buffer" });
      const vendorBillsSheet = workbook.Sheets["Vendor Bills"];
      const billRows = xlsx.utils.sheet_to_json(vendorBillsSheet, { header: 1 }) as any[][];
      const headerIndex = billRows.findIndex(row => row[0] === "Bill ID");
      const columns = billRows[headerIndex];
      const dataRows = billRows.slice(headerIndex + 1).filter(row => row?.[0] != null);
      expect(dataRows).toHaveLength(57);
      expect(new Set(dataRows.map(row => row[columns.indexOf("Bill Number")])).size).toBe(57);

      const firstBill = dataRows[0];
      const hireSummary = firstBill[columns.indexOf("Hire Statements (Summary)")];
      expect(hireSummary).toContain("1 statement");
      expect(hireSummary).toContain("2026-09-01 to 2026-09-30");
      expect(hireSummary).toContain("gross 100");
      expect(hireSummary).toContain("net 90");
      expect(hireSummary).not.toContain("RAW-SNAPSHOT-");

      const adjustmentSummary = firstBill[columns.indexOf("Adjustment Details (Summary)")];
      expect(adjustmentSummary).toHaveLength(32_767);
      expect(adjustmentSummary).toMatch(/…\[truncated\]$/);

      for (const sheetName of workbook.SheetNames) {
        for (const [address, cell] of Object.entries(workbook.Sheets[sheetName])) {
          if (address.startsWith("!")) continue;
          const value = (cell as any)?.v;
          if (typeof value === "string") {
            expect(value.length, `${sheetName}!${address}`).toBeLessThanOrEqual(32_767);
            expect(value).not.toContain("RAW-SNAPSHOT-");
          }
        }
      }

      const jsonAfter = await request(app)
        .get("/api/vendor-bills/export?format=json")
        .buffer(true)
        .parse(rawParser);
      expect(jsonAfter.status).toBe(200);
      const jsonAfterBytes = jsonAfter.body as Buffer;
      expect(jsonAfterBytes.equals(jsonBeforeBytes)).toBe(true);
      expect(createHash("sha256").update(jsonAfterBytes).digest("hex"))
        .toBe("996545a18e113468ba9a83c8ba408b24971d6291624fd86cc9c4c579a5cb558c");
    } finally {
      vi.useRealTimers();
      storage.getVendorBills.mockReset();
      if (originalGetVendorBills) storage.getVendorBills.mockImplementation(originalGetVendorBills);
    }
  });

  for (const [method, path, key] of endpoints) {
    it(`${method.toUpperCase()} ${path}: Reports without Export returns 403`, async () => {
      permissions[key] = { view: true, export: false, view_reports: true };
      expect((await request(app)[method](url(path)).send({ entries: [{ date: "2026-10-01", plant: "Plant B" }] })).status).toBe(403);
      expect(storage.getVendorBills).not.toHaveBeenCalled();
      expect(storage.getDailyPlantSummary).not.toHaveBeenCalled();
    });
    it(`${method.toUpperCase()} ${path}: other-site request returns 403`, async () => {
      permissions[key] = { view: true, export: true };
      const response = await request(app)[method](url(path))
        .query(path.includes("vendor-bills/export") ? { siteId: 2 } : { plant: "Plant B" })
        .send({ entries: [{ date: "2026-10-01", plant: "Plant B" }] });
      expect(response.status).toBe(403);
      expect(storage.getDailyPlantSummary).not.toHaveBeenCalled();
      expect(storage.getHeatingTrends).not.toHaveBeenCalled();
    });
  }
  it("vendor CSV contains only permitted bills and vendor names", async () => {
    permissions.vendor_bills_view = { export: true };
    const response = await request(app).get("/api/vendor-bills/export?format=csv");
    expect(response.status).toBe(200);
    expect(response.text).toContain("BILL-1");
    expect(response.text).not.toContain("BILL-2");
    expect(response.text).not.toContain("VENDOR-2");
    expect(response.text).not.toContain("SECRET VENDOR");
  });
  it("daily report CSV contains only plants linked to permitted sites", async () => {
    permissions.plant_daily_reports = { export: true };
    const response = await request(app).get("/api/plant-module/daily-reports-export?format=csv");
    expect(response.status).toBe(200);
    expect(response.text).toContain("Plant A");
    expect(response.text).not.toContain("Plant B");
  });
  it("no site grants exports no plant rows", async () => {
    permissions.plant_daily_reports = { export: true };
    permittedIds = [];
    const response = await request(app).get("/api/plant-module/daily-reports-export?format=csv");
    expect(response.status).toBe(200);
    expect(response.text).not.toContain("Plant A");
    expect(response.text).not.toContain("Plant B");
  });
  it("permitted daily PDF requests only the permitted plant", async () => {
    permissions.plant_daily_reports = { export: true };
    storage.getDailyPlantSummary.mockResolvedValue({ plantName: "Plant A" });
    const response = await request(app).get("/api/plant-module/daily-reports/2026-10-01/pdf?plant=Plant%20A");
    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toContain("application/pdf");
    expect(storage.getDailyPlantSummary).toHaveBeenCalledExactlyOnceWith("2026-10-01", "Plant A");
  });
  it("permitted heating Excel requests only the permitted plant", async () => {
    permissions.plant_heating = { export: true };
    storage.getHeatingTrends.mockResolvedValue({ rows: [], summary: {}, plantName: "Plant A" });
    const response = await request(app).get("/api/plant-module/heating-trends/excel?plant=Plant%20A&dateFrom=2026-10-01&dateTo=2026-10-02");
    expect(response.status).toBe(200);
    expect(storage.getHeatingTrends).toHaveBeenCalledExactlyOnceWith({ dateFrom: "2026-10-01", dateTo: "2026-10-02", plantName: "Plant A" });
  });
  it("permitted bill PDF returns only the requested permitted bill", async () => {
    permissions.vendor_bills = { export: true };
    storage.getVendorBill.mockResolvedValueOnce({ id: 2, siteId: 1, status: "approved", billNo: "BILL-A", billType: "material", items: [], vendorName: "VENDOR-A" } as any);
    const response = await request(app).get("/api/vendor-bills/2/pdf");
    expect(response.status).toBe(200);
    expect(response.headers["content-disposition"]).toContain("BILL-A");
    expect(storage.getVendorBill).toHaveBeenCalledExactlyOnceWith(2);
  });
  it("permitted IRN voucher returns only the requested permitted IRN", async () => {
    permissions.irn_raise = { export: true };
    storage.getInternalRequisition.mockResolvedValueOnce({ id: 2, siteId: 1, status: "approved", irnNo: "IRN-A", items: [{ material: "Test", issueQty: 1, qty: 1, uom: "No" }] } as any);
    const response = await request(app).get("/api/irn/2/issue-voucher");
    expect(response.status).toBe(200);
    expect(response.headers["content-disposition"]).toContain("IRN-A");
    expect(storage.getIrnIssueVouchers).toHaveBeenCalledExactlyOnceWith(2);
  });
  it("rejects an unrelated voucher ID even when the IRN is permitted", async () => {
    permissions.irn_view = { export: true };
    storage.getInternalRequisition.mockResolvedValueOnce({ id: 2, siteId: 1, status: "approved" });
    expect((await request(app).get("/api/irn/2/issue-voucher?voucherId=99")).status).toBe(403);
  });
  it("permitted ZIP builds only the requested permitted plant", async () => {
    permissions.plant_daily_reports = { export: true };
    const entries = [{ date: "2026-10-01", plant: "Plant A" }];
    const response = await request(app).post("/api/plant-module/daily-reports/bulk-zip").send({ entries });
    expect(response.status).toBe(200);
    expect(dependencies.buildDailyPlantReportPdfBuffer).toHaveBeenCalledExactlyOnceWith("2026-10-01", "Plant A");
    expect(dependencies.buildBulkZipCoverSheetPdf.mock.calls[0][0]).toEqual(entries);
  });
});

describe("estimator guide independent authentication", () => {
  const estimator = express();
  const route = find(n => ts.isCallExpression(n) && n.arguments[0] &&
    ts.isStringLiteral(n.arguments[0]) && n.arguments[0].text === "/api/admin/estimator-guide.pdf") as ts.CallExpression;
  const render = vi.fn(async (res: any) => res.send("guide"));
  // The role verifier is the authentication boundary; exercise every result.
  let role: string | null = null;
  const callback = new Function("parseCookie", "ESTIMATOR_COOKIE", "verifyRoleCookie", "getCompanyConfig", "pipeEstimatorGuidePdf",
    ts.transpile(`return (${route.arguments[1].getText(ast)});`, { target: ts.ScriptTarget.ES2022 }))(
    () => undefined, "estimator-role", () => role, dependencies.getCompanyConfig, render);
  estimator.get("/api/admin/estimator-guide.pdf", callback);
  it.each([null, "manager"])("rejects estimator role %s with the existing 401 contract", async deniedRole => {
    role = deniedRole;
    expect((await request(estimator).get("/api/admin/estimator-guide.pdf")).status).toBe(401);
    expect(render).not.toHaveBeenCalled();
  });
  it("accepts verified estimator admin independently of main-app permissions", async () => {
    role = "admin";
    expect((await request(estimator).get("/api/admin/estimator-guide.pdf")).status).toBe(200);
  });
});