import { beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import ts from "typescript";
import express from "express";
import request from "supertest";
import { siteMatchesPermitted, vendorBillVisibleToSites, vendorBillItemMatchesSite } from "../shared/siteName";
import { aggregateGstBreakdown, computeBillGstByCategory } from "../shared/vendor-bill-gst";
import PDFDocument from "pdfkit";
import { buildGstRegisterPdf } from "../server/gstRegisterPdf";
import * as xlsx from "xlsx";
import archiver from "archiver";
import { normalizeVendorBillAdditionalAdjustments } from "../shared/schema";

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
const storage = {
  getUserPermittedSiteIds: vi.fn(async () => permittedIds),
  getSites: vi.fn(async () => [{ id: 1, name: "SITE A" }, { id: 2, name: "SITE B" }]),
  listPlantSettings: vi.fn(async () => [{ plantName: "Plant A", siteName: "SITE A" }, { plantName: "Plant B", siteName: "SITE B" }]),
  getVendorBill: vi.fn(async () => ({ id: 2, siteId: 2, status: "approved" })),
  getInternalRequisition: vi.fn(async () => ({ id: 2, siteId: 2, status: "approved" })),
  getVendorBills: vi.fn(async () => [1, 2].map(id => ({
    id, siteId: id, billNo: `BILL-${id}`, vendorName: `VENDOR-${id}`, billDate: "2026-10-01",
    billType: "material", totalAmount: id * 100, gstPercent: 0, items: [], status: "approved",
  }))),
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
app.use((req: any, _res, next) => { req.authUser = { id: 7 }; req.authPermissions = permissions; next(); });
const dependencies = { storage, siteMatchesPermitted, vendorBillVisibleToSites, vendorBillItemMatchesSite,
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
beforeEach(() => { permissions = {}; permittedIds = [1]; vi.clearAllMocks(); });

describe("GST Register PDF parity and authorization", () => {
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