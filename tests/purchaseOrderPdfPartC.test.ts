import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { buildPurchaseOrderPdf, type PurchaseOrderDetails } from "../server/purchase-order-pdf";

const root = "reports/part-c";
const base: PurchaseOrderDetails = {
  companyName: "SYNTHETIC High Lane Constructions",
  indentNo: "PI-SYN-BULK",
  orderNo: "PO-SYN-01",
  vendor: "SYNTHETIC Supplier",
  description: "SYNTHETIC GSB aggregate",
  qty: 20,
  unit: "MT",
  rate: 735,
  expectedDelivery: "2026-09-29",
  paymentMode: "credit",
  destination: "SYNTHETIC Site A",
  linkedVendor: {
    id: 1, name: "SYNTHETIC Supplier", businessName: "SYNTHETIC Supplier Works",
    gstNumber: "SYN-GST", panNumber: "SYN-PAN", address: "SYNTHETIC Address",
    bankAccountName: "SYNTHETIC Beneficiary", bankAccountNumber: "SYN-ACC",
    bankIfsc: "SYN-IFSC", bankName: "SYNTHETIC Bank",
    contactPersonName: null, contactPhone: null, contactEmail: null,
    isActive: true, createdAt: new Date(), updatedAt: new Date(),
  },
  showBank: true,
};
describe("Part C real PDFKit documents", () => {
  it.each([
    ["bulk-linked", base, ["PI-SYN-BULK", "PO-SYN-01", "SYN-GST", "SYN-PAN", "SYN-ACC", "735"]],
    ["store-unlinked", { ...base, indentNo: "PI-SYN-STORE", orderNo: null, description: "SYNTHETIC bearing", qty: 4, unit: "Nos", linkedVendor: null, showBank: false }, ["PI-SYN-STORE", "SYNTHETIC bearing", "4 Nos"]],
    ["bulk-unlinked", { ...base, indentNo: "PI-SYN-BULK-UNLINKED", linkedVendor: null }, ["PI-SYN-BULK-UNLINKED", "SYNTHETIC GSB aggregate", "20 MT"]],
    ["store-linked", { ...base, indentNo: "PI-SYN-STORE-LINKED", description: "SYNTHETIC bearing", qty: 4, unit: "Nos" }, ["PI-SYN-STORE-LINKED", "SYNTHETIC bearing", "SYN-GST", "SYN-ACC"]],
  ] as const)("renders a one-page %s document", async (name, details, expected) => {
    mkdirSync(root, { recursive: true });
    const path = `${root}/${name}.pdf`;
    const pdf = await buildPurchaseOrderPdf(details);
    writeFileSync(path, pdf);
    expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
    const info = execFileSync("pdfinfo", [path], { encoding: "utf8" });
    expect(info).toMatch(/Pages:\s+1\b/);
    const text = execFileSync("pdftotext", [path, "-"], { encoding: "utf8" });
    for (const phrase of expected) expect(text).toContain(phrase);
    expect(text).toContain("Agreed rate");
    expect(text).not.toContain("Ex-Crusher");
    if (name === "store-unlinked" || name === "bulk-unlinked") {
      expect(text).not.toMatch(/GST:|PAN:|Account No:|IFSC:/);
      if (name === "store-unlinked") expect(text).not.toContain("PO / Order No:");
    }
  });
  it("does not render bank data when caller lacks Vendor Master bank access", async () => {
    const pdf = await buildPurchaseOrderPdf({ ...base, showBank: false });
    const path = `${root}/bulk-bank-restricted.pdf`;
    writeFileSync(path, pdf);
    const text = execFileSync("pdftotext", [path, "-"], { encoding: "utf8" });
    expect(text).toContain("SYN-GST");
    expect(text).not.toContain("SYN-ACC");
  });
  it("keeps unusually long supplier and item details to one page", async () => {
    const maxText = "SYNTHETIC value ".repeat(160);
    const pdf = await buildPurchaseOrderPdf({
      ...base,
      companyName: maxText,
      indentNo: maxText,
      orderNo: maxText,
      vendor: maxText,
      linkedVendor: {
        ...base.linkedVendor!, businessName: maxText, gstNumber: maxText, panNumber: maxText,
        address: maxText, bankAccountName: maxText, bankAccountNumber: maxText,
        bankIfsc: maxText, bankName: maxText,
      },
      description: maxText,
      spec: maxText,
      unit: maxText,
      expectedDelivery: maxText,
      paymentMode: maxText,
      destination: maxText,
    });
    const path = `${root}/long-fields.pdf`;
    writeFileSync(path, pdf);
    expect(execFileSync("pdfinfo", [path], { encoding: "utf8" })).toMatch(/Pages:\s+1\b/);
    // pdftotext bbox coordinates are points measured from the top of the
    // page; verify the footer never overlays the preceding content.
    const bbox = execFileSync("pdftotext", ["-bbox-layout", path, "-"], { encoding: "utf8" });
    const words = [...bbox.matchAll(/<word xMin="[^"]+" yMin="([^"]+)" xMax="[^"]+" yMax="([^"]+)">([^<]+)<\/word>/g)]
      .map(match => ({ top: Number(match[1]), bottom: Number(match[2]), text: match[3] }));
    const footerIndex = words.findIndex(word => word.text === "Generated");
    const footer = words[footerIndex];
    const destination = words.find(word => word.text === "destination:");
    expect(footer).toBeDefined();
    expect(destination).toBeDefined();
    const lastContentBottom = Math.max(...words.slice(0, footerIndex).map(word => word.bottom));
    expect(lastContentBottom).toBeLessThan(footer!.top);
    expect(footer!.bottom).toBeLessThan(800);
  });
});