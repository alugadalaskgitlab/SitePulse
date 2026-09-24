import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { buildPurchaseOrderPdf, type PurchaseOrderDetails } from "../server/purchase-order-pdf";

const root = "reports/part-c";
const base: PurchaseOrderDetails = {
  companyName: "SYNTHETIC High Lane Constructions",
  indentNo: "PI-SYN-BULK", orderNo: "PO-SYN-01",
  orderDate: new Date("2026-09-30T12:00:00Z"),
  vendor: "SYNTHETIC Supplier", vendorBusinessName: "SYNTHETIC Supplier Works",
  vendorGst: "SYN-GST", vendorPan: "SYN-PAN", vendorAddress: "SYNTHETIC Address",
  description: "SYNTHETIC GSB aggregate", qty: 20, unit: "MT", rate: 735,
  expectedDelivery: "2026-10-01", paymentTerms: "credit", destination: "SYNTHETIC Site A",
  raisedBy: "Ramesh Kumar", raisedAt: new Date("2026-09-28T12:00:00Z"),
  approvedBy: "Suresh Reddy", approvedAt: new Date("2026-09-30T12:00:00Z"),
};
describe("approved PO PDFKit document", () => {
  it.each([
    ["bulk-linked", base, ["PI-SYN-BULK", "PO-SYN-01", "SYN-GST", "SYN-PAN", "735"]],
    ["store-unlinked", { ...base, indentNo: "PI-SYN-STORE", orderNo: "PO-SYN-STORE", description: "SYNTHETIC bearing", qty: 4, unit: "Nos", vendorBusinessName: null, vendorGst: null, vendorPan: null, vendorAddress: null }, ["PI-SYN-STORE", "SYNTHETIC bearing", "Nos"]],
  ] as const)("renders one-page %s with genuine actors and no totals/signature", async (name, details, expected) => {
    mkdirSync(root, { recursive: true });
    const path = `${root}/${name}.pdf`;
    const pdf = await buildPurchaseOrderPdf(details);
    writeFileSync(path, pdf);
    expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
    expect(execFileSync("pdfinfo", [path], { encoding: "utf8" })).toMatch(/Pages:\s+1\b/);
    const text = execFileSync("pdftotext", [path, "-"], { encoding: "utf8" });
    for (const phrase of ["PURCHASE ORDER", "VENDOR", "DELIVER TO", "DESCRIPTION", "QTY", "UNIT", "RATE", "DELIVERY", "PAYMENT", "Raised by: Ramesh Kumar", "Approved by: Suresh Reddy", ...expected]) expect(text).toContain(phrase);
    expect(text).not.toMatch(/sub.?total|total amount|signature/i);
    expect(text).not.toMatch(/Bank|SYN-ACC/);
    if (name === "store-unlinked") expect(text).not.toMatch(/SYN-GST|SYN-PAN/);
  });
  it("bounds long arbitrary snapshot fields to a single page", async () => {
    const long = "SYNTHETIC value ".repeat(160);
    const path = `${root}/long-fields.pdf`;
    writeFileSync(path, await buildPurchaseOrderPdf({
      ...base, companyName: long, indentNo: long, orderNo: long, vendor: long,
      vendorBusinessName: long, vendorGst: long, vendorPan: long, vendorAddress: long,
      description: long, spec: long, unit: long, expectedDelivery: long,
      paymentTerms: long, destination: long, raisedBy: long, approvedBy: long,
    }));
    expect(execFileSync("pdfinfo", [path], { encoding: "utf8" })).toMatch(/Pages:\s+1\b/);
  });
});