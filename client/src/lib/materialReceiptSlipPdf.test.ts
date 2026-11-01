import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

const { loadLogo } = vi.hoisted(() => ({ loadLogo: vi.fn() }));
vi.mock("@/components/vendor-bills/pdfExportStyle", () => ({
  loadPdfLogoDataUrl: loadLogo,
}));

import { buildMaterialReceiptSlipPdf } from "./materialReceiptSlipPdf";

const logoFileDataUrl = `data:image/jpeg;base64,${readFileSync(new URL("../../public/hlc-logo.jpg", import.meta.url)).toString("base64")}`;
const receipt = {
  kind: "plant" as const,
  id: 64,
  date: "2026-11-01",
  time: "09:30",
  materialName: "20MM Aggregate",
  quantity: 17,
  uom: "CUM",
  plantName: "Main Plant",
  partyName: "HLC",
  vehicleNumber: "KA01AB1234",
  driverName: "Ravi",
  receiptNo: "RECV/AGG 26/27 0064",
  conversionFactor: 1.5,
  conversionFromUom: "CUM",
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

    const pdf = await buildMaterialReceiptSlipPdf(receipt, "Highlane Constructions", "company/logo.png");

    expect(loadLogo).toHaveBeenCalledWith("company/logo.png");
    expect(pdf.type).toBe("application/pdf");
    expect(pdf.size).toBeGreaterThan(500);
    expect(await pdf.text()).toContain("/Subtype /Image");
  });

  it("still produces a slip with the HLC fallback mark when the logo cannot load", async () => {
    loadLogo.mockResolvedValue(null);

    const pdf = await buildMaterialReceiptSlipPdf(receipt, "Highlane Constructions", null);

    expect(pdf.type).toBe("application/pdf");
    expect(pdf.size).toBeGreaterThan(500);
    expect(await pdf.text()).not.toContain("/Subtype /Image");
  });
});
