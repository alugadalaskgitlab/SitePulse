import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

const { loadLogo } = vi.hoisted(() => ({ loadLogo: vi.fn() }));
vi.mock("@/components/vendor-bills/pdfExportStyle", () => ({
  loadPdfLogoDataUrl: loadLogo,
}));

import { buildMaterialReceiptSlipPdf, materialReceiptSlipCaption } from "./materialReceiptSlipPdf";

const logoFileDataUrl = `data:image/jpeg;base64,${readFileSync(new URL("../../public/hlc-logo.jpg", import.meta.url)).toString("base64")}`;
const company = { name: "High Lane Constructions Pvt Ltd", address: "", gstin: "", phone: "" };
const receipt = {
  kind: "plant" as const,
  id: 64,
  date: "2026-11-01",
  time: "10:42",
  materialName: "20MM Aggregate",
  quantity: 100,
  uom: "CFT",
  plantName: "Main Plant",
  partyName: "HLC",
  vehicleNumber: "KA01AB1234",
  driverName: "praveen",
  receivedByName: "sunil kumar",
  supplier: "NORTH SUPPLIER",
  receiptNo: "RECV/AGG 26/27 0064",
  conversionFactor: 0.0425,
  conversionFromUom: "CFT",
  conversionToUom: "MT",
  bulkDensity: 1.5,
};

afterEach(() => {
  vi.restoreAllMocks();
  loadLogo.mockReset();
});

describe("material receipt slip PDF logo handling", () => {
  it("uses the configured bill-PDF logo loader and embeds the returned image", async () => {
    loadLogo.mockResolvedValue(logoFileDataUrl);

    const pdf = await buildMaterialReceiptSlipPdf(receipt, company, "company/logo.png");

    expect(loadLogo).toHaveBeenCalledWith("company/logo.png");
    expect(pdf.type).toBe("application/pdf");
    expect(pdf.size).toBeGreaterThan(500);
    expect(await pdf.text()).toContain("/Subtype /Image");
  });

  it("still produces a slip with the HLC fallback mark when the logo cannot load", async () => {
    loadLogo.mockResolvedValue(null);

    const pdf = await buildMaterialReceiptSlipPdf(receipt, company, null);

    expect(pdf.type).toBe("application/pdf");
    expect(pdf.size).toBeGreaterThan(500);
    expect(await pdf.text()).not.toContain("/Subtype /Image");
  });

  it("uses a fitted portrait page, 12-hour time, and approximate CFT-to-MT text", async () => {
    loadLogo.mockResolvedValue(null);
    const pdf = await buildMaterialReceiptSlipPdf(receipt, company, null);
    const text = await pdf.text();
    const mediaBox = /\/MediaBox \[0 0 [\d.]+ ([\d.]+)\]/.exec(text);

    expect(mediaBox).not.toBeNull();
    const heightMm = Number(mediaBox?.[1]) / (72 / 25.4);
    expect(heightMm).toBeGreaterThanOrEqual(150);
    expect(heightMm).toBeLessThan(200);
    expect(text).toContain("10:42 AM");
    expect(text).toContain("MATERIAL RECEIPT");
    expect(text).toContain("DATE");
    expect(text).toContain("TIME");
    expect(text).toContain("RECEIVED AT");
    expect(text).toContain("MATERIAL");
    expect(text).toContain("STOCK OF");
    expect(text).toContain("QUANTITY RECEIVED");
    expect(text).toContain("Approx.");
    expect(text).toContain("4.25 MT");
    expect(text).not.toContain("GSTIN");
    expect(text).not.toContain("Ph ");
  });

  it("formats people, uses Supplier/Vendor and prints the requested signature captions", async () => {
    loadLogo.mockResolvedValue(null);
    const pdf = await buildMaterialReceiptSlipPdf(receipt, company, null);
    const text = await pdf.text();

    expect(text).toContain("Supplier/Vendor");
    expect(text).toContain("DELIVERY DETAILS");
    expect(text).toContain("Praveen");
    expect(text).toContain("Sunil Kumar");
    expect(text).toContain("Received by");
    expect(text).toContain("for High Lane Constructions Pvt Ltd");
    expect(text.indexOf("(Sunil Kumar) Tj")).toBeLessThan(text.indexOf("(Received by) Tj"));
    expect(text.indexOf("(Received by) Tj")).toBeLessThan(text.indexOf("(for High Lane Constructions Pvt Ltd) Tj"));
    expect(text).toContain("Driver");
    expect(text).not.toContain("Received in good order");
    expect(materialReceiptSlipCaption(receipt)).toContain("Driver: Praveen");
    expect(materialReceiptSlipCaption(receipt)).toContain("Received by: Sunil Kumar");
    expect(materialReceiptSlipCaption(receipt)).toContain("*HLC · Material Receipt*");
  });

  it("keeps old null names blank without printing null or undefined", async () => {
    loadLogo.mockResolvedValue(null);
    const pdf = await buildMaterialReceiptSlipPdf({
      ...receipt,
      driverName: null,
      receivedByName: null,
    }, company, null);
    const text = await pdf.text();

    expect(text).toContain("Received by");
    expect(text).toContain("for High Lane Constructions Pvt Ltd");
    expect(text).toContain("Driver");
    expect(text).not.toContain("(null) Tj");
    expect(text).not.toContain("(undefined) Tj");
    expect(text).not.toContain("Praveen");
    expect(text).not.toContain("Sunil Kumar");
  });

  it("shows the received-by name for a site trip without exposing audit attribution", async () => {
    loadLogo.mockResolvedValue(null);
    const pdf = await buildMaterialReceiptSlipPdf({
      kind: "site",
      id: 12,
      date: "2026-11-01",
      time: "10:42",
      materialName: "WMM",
      quantity: 90,
      uom: "MT",
      site: "Road Site",
      enteredBy: "staff name",
      receivedByName: "staff name",
    }, company, null);

    const text = await pdf.text();
    expect(text).not.toContain("Entered by");
    expect(text).toContain("Staff Name");
    expect(materialReceiptSlipCaption({
      kind: "site",
      id: 12,
      date: "2026-11-01",
      time: "10:42",
      materialName: "WMM",
      quantity: 90,
      uom: "MT",
      site: "Road Site",
      enteredBy: "staff name",
    })).toContain("Received by: Staff Name");
    expect(materialReceiptSlipCaption({
      kind: "site",
      id: 12,
      date: "2026-11-01",
      time: "10:42",
      materialName: "WMM",
      quantity: 90,
      uom: "MT",
    })).toContain("*HLC · Site Material Receipt*");
  });

  it("uses Supplier/Vendor for site vendors and retains Source for own-source trips", async () => {
    loadLogo.mockResolvedValue(null);
    const vendorPdf = await buildMaterialReceiptSlipPdf({
      kind: "site",
      id: 20,
      date: "2026-11-01",
      materialName: "WMM",
      quantity: 90,
      uom: "MT",
      site: "Road Site",
      materialSourceType: "vendor",
      materialSourceSupplier: "Aggregate Supplier",
    }, company, null);
    const ownSourcePdf = await buildMaterialReceiptSlipPdf({
      kind: "site",
      id: 21,
      date: "2026-11-01",
      materialName: "Soil",
      quantity: 90,
      uom: "CFT",
      site: "Road Site",
      materialSourceType: "own_source",
      materialSourceLabel: "Borrow pit",
    }, company, null);

    expect(await vendorPdf.text()).toContain("Supplier/Vendor");
    expect(await vendorPdf.text()).toContain("SITE MATERIAL RECEIPT");
    expect(await ownSourcePdf.text()).toContain("(Source) Tj");
    expect(await ownSourcePdf.text()).not.toContain("Supplier/Vendor");
  });

  it("labels an edited receipt as a revised copy", async () => {
    loadLogo.mockResolvedValue(null);
    const pdf = await buildMaterialReceiptSlipPdf({
      ...receipt,
      materialName: "Bitumen VG-30",
      quantity: 18,
      uom: "MT",
      latestEditAt: "2026-11-01T06:15:00.000Z",
    }, company, null);

    expect(await pdf.text()).toContain("Revised copy");
    expect(await pdf.text()).toContain("replaces earlier copy");
    expect(materialReceiptSlipCaption({
      ...receipt,
      latestEditAt: "2026-11-01T06:15:00.000Z",
    })).toContain(" · Revised");
  });
});
