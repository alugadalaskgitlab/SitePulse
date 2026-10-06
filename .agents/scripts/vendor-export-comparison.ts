// Local, read-only rendering harness. Never connects to or writes a database.
import fs from "node:fs";
import ts from "typescript";
import express from "express";
import PDFDocument from "pdfkit";
import * as xlsx from "xlsx";
import { aggregateGstBreakdown, computeBillGstByCategory } from "../../shared/vendor-bill-gst";
import { normalizeVendorBillAdditionalAdjustments } from "../../shared/schema";
import { vendorBillVisibleToSites, vendorBillItemMatchesSite, siteMatchesPermitted } from "../../shared/siteName";

const { bill, sites } = JSON.parse(fs.readFileSync("/tmp/bill48-data.json", "utf8"));
const config = JSON.parse(fs.readFileSync("/tmp/bill48-config.json", "utf8"));
const source = fs.readFileSync("server/routes.ts", "utf8");
const ast = ts.createSourceFile("routes.ts", source, ts.ScriptTarget.Latest, true);
function find(predicate: (n: ts.Node) => boolean, tree = ast): ts.Node {
  let result: ts.Node | undefined;
  function walk(n: ts.Node) {
    if (result) return;
    if (predicate(n)) { result = n; return; }
    ts.forEachChild(n, walk);
  }
  walk(tree);
  if (!result) throw new Error("Source node not found");
  return result;
}
const helperNames = ["getPermittedSiteNames", "resolveVendorBillSite", "scopeVendorBillsToSiteAccess", "assertTripSiteAccess"];
const helpers = helperNames.map(name => find(n => ts.isFunctionDeclaration(n) && n.name?.text === name).getText(ast)).join("\n");
const authAst = ts.createSourceFile("auth.ts", fs.readFileSync("server/auth-routes.ts", "utf8"), ts.ScriptTarget.Latest, true);
const guard = find(n => ts.isFunctionDeclaration(n) && n.name?.text === "assertReportExport", authAst).getText(authAst).replace(/^export /, "");
const app = express();
app.use(express.json());
app.use((req: any, _res, next) => {
  req.authUser = { id: 999999, isAdmin: req.headers["x-report-role"] !== "denied", isOwner: false };
  req.authPermissions = {};
  next();
});
const storage = {
  getVendorBill: async () => bill,
  getVendorBills: async (filters: any) => [bill].filter(b =>
    (!filters.dateFrom || b.billDate >= filters.dateFrom) &&
    (!filters.dateTo || b.billDate <= filters.dateTo) &&
    (!filters.vendor || filters.vendor === b.vendorName) &&
    (!filters.status || filters.status === b.status)),
  getSites: async () => sites, getVendorNames: async () => [bill.vendorName],
  getUserPermittedSiteIds: async () => [],
};
const dependencies: Record<string, any> = {
  storage, PDFDocument, xlsx, aggregateGstBreakdown, computeBillGstByCategory,
  normalizeVendorBillAdditionalAdjustments, siteMatchesPermitted, vendorBillVisibleToSites, vendorBillItemMatchesSite,
  getCompanyConfig: async () => config,
  getCompanyLogoPath: () => fs.existsSync(`/tmp/bill48-logo`) ? "/tmp/bill48-logo" : null,
};
// The GST PDF renderer is optional until the authorized UI batch is implemented.
if (fs.existsSync("server/gstRegisterPdf.ts")) {
  dependencies.buildGstRegisterPdf = (await import("../../server/gstRegisterPdf")).buildGstRegisterPdf;
}
for (const path of ["/api/vendor-bills/export", "/api/vendor-bills/:id/pdf"]) {
  const node = find(n => ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) &&
    n.expression.expression.getText(ast) === "app" && n.expression.name.text === "get" &&
    ts.isStringLiteral(n.arguments[0]) && n.arguments[0].text === path) as ts.CallExpression;
  const text = `${helpers}\n${guard}\nreturn ${node.arguments[1].getText(ast)}`;
  const js = ts.transpile(text, { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS });
  app.get(path, new Function(...Object.keys(dependencies), js)(...Object.values(dependencies)));
}
app.get("/api/config", (_req, res) => res.json(config));
app.get("/api/auth/me", (_req, res) => res.json({
  user: { id: 999999, fullName: "Read-only comparison preview", isAdmin: true, isOwner: false,
    isActive: true, isFieldEngineer: true, setupComplete: true }, permissions: {},
}));
app.get("/api/vendor-bills", (_req, res) => res.json([bill]));
app.get("/api/vendor-bills/summary", (_req, res) => res.json({
  total: 1, totalAmount: bill.totalAmount, paid: 1, paidAmount: bill.totalAmount,
  draft: 0, draftAmount: 0, verified: 0, verifiedAmount: 0, approved: 0, approvedAmount: 0,
  gstByCategory: aggregateGstBreakdown([bill]),
}));
app.get("/api/vendor-bills/vendor-names", (_req, res) => res.json([bill.vendorName]));
app.get("/api/vendor-bills/company-accounts", (_req, res) => res.json([]));
app.get("/api/vendor-bills/:id", (_req, res) => res.json(bill));
app.get("/api/sites", (_req, res) => res.json(sites));
app.get("/api/notifications/unread-count", (_req, res) => res.json({ count: 0 }));
app.get("/api/edit-requests/check", (_req, res) => res.json({ hasPermission: false, request: null }));
app.use("/api", (_req, res) => res.json([]));
app.listen(3211, "127.0.0.1", () => console.log("Read-only snapshot renderer ready on 3211"));
