import { describe, expect, it } from "vitest";
import { buildWholeBillPdf } from "./wholeBillExport";
import type { WholeBillSnapshot } from "./wholeBillSnapshot";

describe("whole bill PDF layout", () => {
  it("starts with the signed abstract and puts daily activity on the next page without a blank page", () => {
    const snapshot: WholeBillSnapshot = {
      companyName: "High Lane Constructions",
      vendorName: "Vendor",
      billNo: "HLC/VB/2026/0053",
      billDate: "2026-10-01",
      periodFrom: "2026-09-01",
      periodTo: "2026-09-30",
      site: "Road Site",
      equipmentType: "Excavator",
      billType: "equipment",
      billTypeLabel: "Equipment",
      saved: true,
      status: "approved",
      generatedAt: "2026-10-01",
      sections: [],
      calendars: [{
        equipmentName: "Excavator 1",
        equipmentType: "Excavator",
        periodFrom: "2026-09-01",
        periodTo: "2026-09-30",
        rows: [],
        unavailableReason: "No frozen daily activity was saved for this bill.",
      }],
      hireReviews: [],
      financialRows: [
        { label: "Gross", amount: 60_000 },
        { label: "NET PAYABLE", amount: 56_840 },
      ],
      totals: {
        subtotal: 60_000,
        gst: [],
        totalGst: 0,
        adjustments: [],
        tds: { label: "TDS", amount: 0 },
        netPayable: 56_840,
      },
    };
    const pdf = buildWholeBillPdf(snapshot);
    const pages = (pdf as any).internal.pages as string[][];

    expect(pdf.getNumberOfPages()).toBe(2);
    expect(pages[1].join("")).toContain("BILL SUMMARY / ADJUSTMENTS");
    expect(pages[1].join("")).toContain("Equipment type: Excavator");
    expect(pages[1].join("")).toContain("Authorized Signatory");
    expect(pages[2].join("")).toContain("DAILY ACTIVITY");
  });
});
