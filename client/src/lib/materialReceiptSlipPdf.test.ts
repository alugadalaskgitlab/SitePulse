import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

const { loadLogo } = vi.hoisted(() => ({ loadLogo: vi.fn() }));
vi.mock("@/components/vendor-bills/pdfExportStyle", () => ({
  loadPdfLogoDataUrl: loadLogo,
}));

import { buildMaterialReceiptSlipPdf } from "./materialReceiptSlipPdf";

const logoFileDataUrl = `data:image/jpeg;base64,${readFileSync(new URL("../../public/hlc-logo.jpg", import.meta.url)).toString("base64")}`;
const company = { name: "Highlane Constructions", address: "", gstin: "", phone: "" };
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
  driverName: "Ravi",
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
    expect(text).toContain("Approx.");
    expect(text).toContain("4.25 MT");
    expect(text).not.toContain("GSTIN");
    expect(text).not.toContain("Ph ");
  });

  it("does not print staff attribution on a site trip slip", async () => {
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
      enteredBy: "Staff Name",
    }, company, null);

    expect(await pdf.text()).not.toContain("Entered by");
    expect(await pdf.text()).not.toContain("Staff Name");
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

    expect(await pdf.text()).toContain("REVISED COPY");
    expect(await pdf.text()).toContain("replaces earlier copy");
  });
});
