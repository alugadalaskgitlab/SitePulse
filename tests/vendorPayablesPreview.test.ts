import { describe, expect, it, vi, beforeEach } from "vitest";
import fs from "node:fs";
import ts from "typescript";
import express from "express";
import request from "supertest";
import { z } from "zod";
import * as XLSX from "xlsx";
import { buildVendorPayablesPreview, type PayablesPreviewReader } from "../server/vendorPayablesPreview";
import { authoritativeHireDieselPeriod, calculateEquipmentHireFinancials, calculateHireGroup } from "../shared/hireBilling";
import { buildPayablesPreviewWorkbook, buildPayablesPreviewPdf } from "../client/src/components/vendor-bills/payablesPreviewExport";
import { vendorBillItemMatchesSite, siteMatchesPermitted } from "../shared/siteName";

const input = { vendorName: "KAVERI WORKS", periodFrom: "2026-06-01", periodTo: "2026-06-30" };
const fullScope = { permittedSiteNames: null, siteId: null, siteName: null };
const equipment = { id: 7, name: "Excavator KA05", hireBillingBasis: "monthly", hireRate: 87300,
  hireStartDate: "2026-06-01", hireEndDate: null, hireMonthlyDivisorType: "30",
  hireDieselResponsibility: "vendor", hireBreakdownDeductionEnabled: true, meterType: "hour_meter" };
let records: any[], activities: any[], bills: any[], statements: any[], cards: any[];
let matches: any[], permitted: number[], permissions: any, fieldEngineer: boolean;
const write = vi.fn(() => { throw new Error("Business write attempted"); });
const reader = {
  getVendorBillAutoItems: vi.fn(async () => records), getVendorBillHireActivities: vi.fn(async () => activities),
  getVendorRateCards: vi.fn(async () => cards), getVendorBills: vi.fn(async () => bills),
  getHireStatements: vi.fn(async () => statements), resolveVendorAliases: vi.fn(async () => ["KAVERI WORKS", "KAVERI"]),
  getSites: vi.fn(async () => [{ id: 1, name: "SITE A" }, { id: 2, name: "SITE B" }]),
  checkDuplicateBilledItems: vi.fn(async () => matches),
  getUserPermittedSiteIds: vi.fn(async () => permitted),
  createVendorBill: write, upsertVendorRateCard: write, createHireStatement: write,
  updateEquipmentUsage: write, createStoreIssue: write, updateVendorBillStatus: write,
} as unknown as PayablesPreviewReader & Record<string, any>;
beforeEach(() => {
  vi.clearAllMocks();
  records = [
    { date: "2026-06-04", category: "material", description: "AGGREGATE", qty: 17.4, unit: "MT", rate: 913.5, source: "auto", sourceId: "material:3", siteName: "SITE: SITE A" },
    { date: "2026-06-05", category: "labour", description: "LABOUR SKILLED MALE - SITE A", qty: 6, unit: "HEAD-DAY", rate: 847, source: "auto", siteName: "SITE: SITE A" },
    { date: "2026-06-06", category: "transport", description: "TRANSPORT", qty: 2, unit: "TRIP", rate: 74.5, leadDistance: 18.3, source: "auto", siteName: "SITE: SITE B" },
  ];
  activities = [
    { source: "equipment_default", equipmentId: 7, sourceId: 7, businessDate: "2026-06-01", equipment },
    { source: "dpr_log", equipmentId: 7, sourceId: 71, businessDate: "2026-06-04", hoursOrKmRun: 6.5, site: "SITE A", equipment },
    { source: "plant_usage", equipmentId: 7, sourceId: 72, businessDate: "2026-06-05", hoursOrKmRun: 3.8, site: "SITE B", equipment },
    { source: "maintenance", equipmentId: 7, sourceId: 73, businessDate: "2026-06-07", eventType: "breakdown", downtimeHours: 4, description: "Hydraulic hose", equipment },
  ];
  bills = []; statements = []; cards = []; matches = [];
  permitted = [1]; permissions = {}; fieldEngineer = false;
});
describe("VB-EXPORT-01 Part B canonical read-only service", () => {
  it("uses exactly the hire engine and financial sequence once across split sites", async () => {
    const preview = await buildVendorPayablesPreview(reader, input, fullScope);
    const expected = calculateHireGroup({
      terms: { billingBasis: "monthly", rate: 87300, hireStartDate: "2026-06-01", hireEndDate: null, monthlyDivisorType: "30",
        breakdownDeductionEnabled: true, automaticMonthlyBreakdownDeductions: true, breakdownGraceDays: 0, dieselResponsibility: "vendor" },
      periodFrom: input.periodFrom, periodTo: input.periodTo,
      activities: activities.filter(row => ["dpr_log", "plant_usage"].includes(row.source)),
      maintenance: [{ id: 73, date: "2026-06-07", eventType: "breakdown", description: "Hydraulic hose", downtimeHours: 4 }], dieselPurchases: [],
      dieselNormOverride: undefined, dieselNormBasisOverride: "L/hr",
      authoritativeDieselPeriod: authoritativeHireDieselPeriod(activities.filter(row => ["dpr_log", "plant_usage"].includes(row.source)), equipment, input.periodFrom, input.periodTo),
    });
    expect(preview.hireGroups).toHaveLength(1);
    expect(preview.hireGroups[0].result).toEqual(expected);
    const financials = calculateEquipmentHireFinancials({ grossHire: expected.grossAmount, breakdownDeduction: expected.deductionAmount, hsdRecovery: expected.diesel.finalRecoveryAmount });
    expect(preview.unallocatedTotal.preTax).toBe(financials.taxableAmount);
    expect(preview.hireGroups[0].result.workingSheet).toHaveLength(30);
    expect(preview.siteTotal.preTax).toBe(23703.6);
    expect(preview.grandTotal.preTax).toBe(108093.6);
  });
  it("site-restricted totals contain only authorized facts; unknown monthly availability cannot bypass scope", async () => {
    const preview = await buildVendorPayablesPreview(reader, input, { permittedSiteNames: ["SITE A"], siteId: null, siteName: null });
    expect(preview.grandTotal.preTax).toBe(20976.9);
    expect(preview.hireGroups).toEqual([]);
    expect(preview.unallocatedTotal.preTax).toBe(0);
    expect(JSON.stringify(preview)).not.toMatch(/SITE B|87300|Hydraulic hose|Excavator/);
    expect(preview.warnings.join(" ")).toContain("withheld");
  });
  it("owner optional site subtotal excludes unallocated charges while vendor grand total includes them once", async () => {
    const preview = await buildVendorPayablesPreview(reader, input, { permittedSiteNames: null, siteId: 1, siteName: "SITE A" });
    expect(preview.siteTotal.preTax).toBe(20976.9);
    expect(preview.grandTotal.preTax).toBe(105366.9);
    expect(preview.categories[0].items[0].unallocatedReason).toContain("without site proration");
  });
  it("excludes canonical saved-bill matches including draft and overlapping monthly segments", async () => {
    matches = [{ index: 0, billNo: "VB/26/17", billStatus: "draft" }];
    bills = [{ id: 33, vendorName: "KAVERI", billDate: "2026-06-12", billType: "equipment", items: [] }];
    statements = [{ equipmentId: 7, vendorBillId: 33, periodFrom: "2026-06-01", periodTo: "2026-06-30", status: "draft" }];
    const preview = await buildVendorPayablesPreview(reader, input, fullScope);
    expect(preview.excludedCount).toBe(2);
    expect(preview.hireGroups).toHaveLength(0);
    expect(preview.categories[1].items).toHaveLength(0);
    expect(reader.checkDuplicateBilledItems).toHaveBeenCalledWith("KAVERI WORKS", expect.arrayContaining([expect.objectContaining({ source: "auto:material:3" })]));
  });
  it("saved nonmonthly hire-statement coverage excludes raw activity even without an ordinary duplicate match", async () => {
    const eq = { ...equipment, hireBillingBasis: "daily" };
    activities = [{ source: "equipment_default", equipmentId: 7, equipment: eq },
      { source: "dpr_log", sourceId: 71, equipmentId: 7, businessDate: "2026-06-04", site: "SITE A", hoursOrKmRun: 3 }];
    records = [{ date: "2026-06-04", category: "equipment", equipmentId: 7, description: "Excavator", qty: 1,
      unit: "DAYS", rate: 1, source: "auto", sourceId: "dpr_equipment:71", siteName: "SITE A" }];
    bills = [{ id: 33, vendorName: "KAVERI", billDate: "2026-06-12", billType: "equipment", items: [] }];
    statements = [{ equipmentId: 7, vendorBillId: 33, periodFrom: "2026-06-01", periodTo: "2026-06-30" }];
    const preview = await buildVendorPayablesPreview(reader, input, fullScope);
    expect(preview.excludedCount).toBe(1);
    expect(preview.hireGroups).toHaveLength(0);
    expect(preview.categories[0].items).toHaveLength(0);
  });
  it("GST missing remains null; accessible latest category zero is suggested and no inaccessible rate leaks", async () => {
    bills = [
      { id: 10, vendorName: "KAVERI", billDate: "2026-06-12", billType: "material", gstRateMaterial: 28, siteId: 2, items: [{ category: "material", siteName: "SITE B" }] },
      { id: 9, vendorName: "KAVERI WORKS", billDate: "2026-06-11", billType: "material", gstRateMaterial: 0, siteId: 1, items: [{ category: "material", siteName: "SITE A" }] },
    ];
    const preview = await buildVendorPayablesPreview(reader, input, { permittedSiteNames: ["SITE A"], siteId: null, siteName: null });
    expect(preview.gstRates.material).toBe(0);
    expect(preview.gstSources.material).toBe("from last bill — check");
    expect(preview.gstRates.labour).toBeNull();
    expect(preview.grandTotal.gst).toBeNull();
    expect(preview.grandTotal.withGst).toBeNull();
    const entered = await buildVendorPayablesPreview(reader, { ...input, gstRates: { material: 5, labour: 0 } }, { permittedSiteNames: ["SITE A"], siteId: null, siteName: null });
    expect(entered.grandTotal.gst).toBe(794.74);
    expect(entered.grandTotal.withGst).toBe(21771.64);
  });
  it("unpriced items remain unknown rather than zero and reuse rate-card matching", async () => {
    records = [{ ...records[0], rate: 0 }];
    activities = [];
    let preview = await buildVendorPayablesPreview(reader, input, fullScope);
    expect(preview.unpricedCount).toBe(1); expect(preview.grandTotal.preTax).toBeNull();
    cards = [{ vendorName: "KAVERI WORKS", category: "material", itemKey: "MAT_AGGREGATE_MT", unit: "MT", rate: 913.5, updatedAt: null }];
    preview = await buildVendorPayablesPreview(reader, input, fullScope);
    expect(preview.grandTotal.preTax).toBe(15894.9);
  });
  it("Other missing stays blank; explicit positive Other GST is unsupported, not silently zeroed", async () => {
    records = [{ ...records[0], category: "other" }]; activities = [];
    const missing = await buildVendorPayablesPreview(reader, input, fullScope);
    expect(missing.gstRates.other).toBeNull(); expect(missing.grandTotal.gst).toBeNull();
    const positive = await buildVendorPayablesPreview(reader, { ...input, gstRates: { other: 12 } }, fullScope);
    expect(positive.gstRates.other).toBe(12); expect(positive.grandTotal.gst).toBeNull();
    expect(positive.warnings.join(" ")).toContain("not supported");
    const zero = await buildVendorPayablesPreview(reader, { ...input, gstRates: { other: 0 } }, fullScope);
    expect(zero.grandTotal.gst).toBe(0); expect(zero.grandTotal.withGst).toBe(zero.grandTotal.preTax);
  });
  it.each(["hireStartDate", "hireRate", "hireMonthlyDivisor"])("invalid monthly %s produces unavailable amount, not a complete vendor total", async field => {
    const eq = { ...equipment, [field]: null, ...(field === "hireMonthlyDivisor" ? { hireMonthlyDivisorType: "custom" } : {}) };
    activities[0] = { ...activities[0], equipment: eq };
    records.push({ date: "2026-06-04", category: "equipment", equipmentId: 7, description: "Excavator raw log", qty: 1, unit: "DAYS", rate: 100, source: "auto", siteName: "SITE A" });
    const preview = await buildVendorPayablesPreview(reader, input, fullScope);
    expect(preview.grandTotal.preTax).toBeNull(); expect(preview.unpricedCount).toBe(1);
    expect(preview.categories[0].items).toHaveLength(1);
    expect(preview.categories[0].items[0].amount).toBeNull();
  });
  it.each(["daily", "hourly", "trip"] as const)("configured %s hire uses master engine/financials, not raw ratecard math; excludes billed calendar identities", async basis => {
    const eq = { ...equipment, hireBillingBasis: basis, hireRate: 873.5, consumptionNorm: 2, hireDieselResponsibility: "hlc" };
    const row = { source: "dpr_log" as const, equipmentId: 7, sourceId: 71, businessDate: "2026-06-04",
      entryType: basis === "trip" ? "trip_based" : basis, hoursOrKmRun: 6.5, numberOfTrips: 3, actualDiesel: 20,
      dieselSource: "plant_stock", openingDiesel: 10, closingDiesel: 4, site: "SITE A", equipment: eq };
    const maintenance = { id: 73, date: "2026-06-07", eventType: "breakdown", description: "Hydraulic hose", downtimeHours: 4 };
    activities = [{ source: "equipment_default", equipmentId: 7, sourceId: 7, businessDate: input.periodFrom, equipment: eq },
      row, { ...row, sourceId: 72, businessDate: "2026-06-05", task: "ALREADY BILLED WORK" },
      { source: "maintenance", equipmentId: 7, sourceId: 73, businessDate: maintenance.date, ...maintenance, equipment: eq }];
    records = [71, 72].map((id, index) => ({ date: index ? "2026-06-05" : "2026-06-04", category: "equipment", equipmentId: 7,
      description: "Excavator", qty: 99, unit: "HRS", rate: 991, source: "auto", sourceId: `dpr_equipment:${id}`, siteName: "SITE: SITE A" }));
    matches = [{ index: 1, billNo: "VB/26/4", billStatus: "approved" }];
    const preview = await buildVendorPayablesPreview(reader, input, fullScope);
    const expected = calculateHireGroup({
      terms: { billingBasis: basis, rate: 873.5, hireStartDate: eq.hireStartDate, hireEndDate: null, dieselResponsibility: "hlc",
        breakdownDeductionEnabled: true, breakdownGraceDays: 0 }, periodFrom: input.periodFrom, periodTo: input.periodTo,
      activities: [row], maintenance: [maintenance], dieselPurchases: [], dieselNormOverride: 2, dieselNormBasisOverride: "L/hr",
      authoritativeDieselPeriod: authoritativeHireDieselPeriod([row], eq, input.periodFrom, input.periodTo),
    });
    expected.workingSheet = expected.workingSheet.filter(day => ["2026-06-04", "2026-06-07"].includes(day.date));
    expect(preview.hireGroups).toHaveLength(1); expect(preview.hireGroups[0].result).toEqual(expected);
    expect(preview.hireGroups[0].financials).toEqual(calculateEquipmentHireFinancials({ grossHire: expected.grossAmount, breakdownDeduction: expected.deductionAmount, hsdRecovery: expected.diesel.finalRecoveryAmount }));
    expect(preview.categories[0].items).toHaveLength(1);
    expect(preview.categories[0].items[0].amount).toBe(expected.netAmount);
    expect(preview.hireGroups[0].result.workingSheet.map(day => day.date)).not.toContain("2026-06-05");
    expect(XLSX.utils.sheet_to_csv(buildPayablesPreviewWorkbook(preview).Sheets["Equipment hire"])).not.toContain("ALREADY BILLED WORK");
  });
  it("preview and both export builders perform no business writes and leave source rows unchanged", async () => {
    const before = JSON.stringify({ records, activities, bills, statements, cards });
    const preview = await buildVendorPayablesPreview(reader, input, fullScope, () => new Date("2026-06-30T10:11:12Z"));
    const wb = buildPayablesPreviewWorkbook(preview);
    const bytes = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    const pdf = buildPayablesPreviewPdf(preview).output("arraybuffer");
    expect(bytes.length).toBeGreaterThan(1000); expect(pdf.byteLength).toBeGreaterThan(1000);
    expect(write).not.toHaveBeenCalled();
    expect(JSON.stringify({ records, activities, bills, statements, cards })).toBe(before);
  });
  it("Excel contains all six requested sheets, timestamp, incomplete GST, allocation reasons and machine-day calendar", async () => {
    const preview = await buildVendorPayablesPreview(reader, input, fullScope);
    const wb = buildPayablesPreviewWorkbook(preview);
    expect(wb.SheetNames).toEqual(["Summary", "Equipment hire", "Materials", "Transport", "Labour", "Other"]);
    for (const name of wb.SheetNames) {
      const content = XLSX.utils.sheet_to_csv(wb.Sheets[name]);
      expect(content).toContain(preview.label); expect(content).toContain(preview.generatedAt);
    }
    const hire = XLSX.utils.sheet_to_csv(wb.Sheets["Equipment hire"]);
    expect(hire).toContain("Opening Meter"); expect(hire).toContain("Hydraulic hose"); expect(hire).toContain("2026-06-30");
    expect(XLSX.utils.sheet_to_csv(wb.Sheets.Summary)).toContain("Incomplete");
  });
  it("PDF carries vendor header, generated time, summary and detail rather than an issued bill", async () => {
    const preview = await buildVendorPayablesPreview(reader, input, fullScope);
    const pdf = buildPayablesPreviewPdf(preview).output();
    expect(pdf).toContain("Preview - not a saved bill");
    expect(pdf).toContain("KAVERI WORKS"); expect(pdf).toContain(preview.generatedAt);
    expect(pdf).toContain("Vendor grand total"); expect(pdf).toContain("AGGREGATE");
  });
});

// Execute the checked-in endpoint/authorization helpers with mocked reads only.
const source = fs.readFileSync("server/routes.ts", "utf8");
function productionNode(sourceText: string, predicate: (node: ts.Node) => boolean) {
  const ast = ts.createSourceFile("source.ts", sourceText, ts.ScriptTarget.Latest, true);
  let result: ts.Node | undefined;
  const walk = (node: ts.Node) => { if (predicate(node)) result = node; if (!result) ts.forEachChild(node, walk); };
  walk(ast); if (!result) throw new Error("Production callback not found");
  return result.getText(ast);
}
const fn = (name: string) => productionNode(source, n => ts.isFunctionDeclaration(n) && n.name?.text === name);
const guard = productionNode(fs.readFileSync("server/auth-routes.ts", "utf8"), n => ts.isFunctionDeclaration(n) && n.name?.text === "assertReportExport").replace(/^export /, "");
const route = productionNode(source, n => ts.isCallExpression(n) && n.expression.getText().startsWith("app.get") && n.arguments[0]?.getText() === '"/api/vendor-bills/payables-preview"');
const app = express();
app.use((req: any, _res, next) => { req.authUser = { id: 5, isFieldEngineer: fieldEngineer }; req.authPermissions = permissions; next(); });
const dependencies = { app, storage: reader, z, buildVendorPayablesPreview, vendorBillItemMatchesSite, siteMatchesPermitted };
const compiled = ts.transpile(`${guard}\n${["getPermittedSiteNames", "assertTripSiteAccess", "resolveVendorBillSite"].map(fn).join("\n")}\n${route}`, { target: ts.ScriptTarget.ES2022 });
new Function(...Object.keys(dependencies), compiled)(...Object.values(dependencies));
describe("VB-EXPORT-01 Part B actual endpoint permission and site gates", () => {
  it("keeps Reports independent from Export during download revalidation", async () => {
    permissions = { vendor_bills_view: { view_reports: true, export: false } };
    expect((await request(app).get("/api/vendor-bills/payables-preview").query({ ...input, export: "1" })).status).toBe(403);
    expect(reader.getVendorBillAutoItems).not.toHaveBeenCalled();
  });
  it("permits explicit Export without using the Reports grant", async () => {
    permissions = { vendor_bills_view: { view_reports: false, export: true } };
    expect((await request(app).get("/api/vendor-bills/payables-preview").query({ ...input, export: "1" })).status).toBe(200);
  });
  it("returns 403 without view_reports before source reads", async () => {
    permissions = { vendor_bills: { view: true, export: true } };
    const res = await request(app).get("/api/vendor-bills/payables-preview").query(input);
    expect(res.status).toBe(403); expect(reader.getVendorBillAutoItems).not.toHaveBeenCalled();
  });
  it("returns 403 for a field engineer even with report permission", async () => {
    permissions = { vendor_bills_view: { view_reports: true } }; fieldEngineer = true;
    expect((await request(app).get("/api/vendor-bills/payables-preview").query(input)).status).toBe(403);
    expect(reader.getVendorBillAutoItems).not.toHaveBeenCalled();
  });
  it("rejects an explicit other-site request before pulling candidates", async () => {
    permissions = { vendor_bills: { view_reports: true } };
    expect((await request(app).get("/api/vendor-bills/payables-preview").query({ ...input, siteId: 2 })).status).toBe(403);
    expect(reader.getVendorBillAutoItems).not.toHaveBeenCalled();
  });
  it("returns only authorized data; cache is no-store and no mutations run", async () => {
    permissions = { vendor_bills_view: { view_reports: true } };
    const res = await request(app).get("/api/vendor-bills/payables-preview").query(input);
    expect(res.status).toBe(200); expect(res.headers["cache-control"]).toBe("no-store");
    expect(JSON.stringify(res.body)).not.toContain("SITE B"); expect(write).not.toHaveBeenCalled();
  });
  it.each([{ periodFrom: "2026-02-30" }, { periodTo: "2025-01-01" }, { gstRates: '{"material":-1}' }, { gstRates: "broken" }])("rejects invalid dates/rates before data reads: %j", async override => {
    permissions = { vendor_bills: { view_reports: true } };
    expect((await request(app).get("/api/vendor-bills/payables-preview").query({ ...input, ...override })).status).toBe(400);
    expect(reader.getVendorBillAutoItems).not.toHaveBeenCalled();
  });
  it("is registered before /:id; export client revalidates via same protected endpoint first", () => {
    expect(source.indexOf('app.get("/api/vendor-bills/payables-preview"')).toBeLessThan(source.indexOf('app.get("/api/vendor-bills/:id"'));
    const ui = fs.readFileSync("client/src/components/vendor-bills/PayablesPreviewPanel.tsx", "utf8");
    expect(ui.indexOf("await requestPayablesPreview(request, true)")).toBeGreaterThan(-1);
    expect(ui.indexOf("await requestPayablesPreview(request, true)")).toBeLessThan(ui.indexOf("exportPayablesPreview(fresh, format)"));
    expect(fs.readFileSync("client/src/pages/VendorBills.tsx", "utf8")).toContain('sectionCan("vendor_bills", "view_reports")');
  });
});