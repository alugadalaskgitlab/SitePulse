// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import * as XLSX from "xlsx";
import HireMonthlyReview from "./HireMonthlyReview";
import { projectHireReview } from "@shared/vendorBillLayout";
import { buildWholeBillPdf, buildWholeBillWorkbook } from "./wholeBillExport";
import type { WholeBillSnapshot } from "./wholeBillSnapshot";
afterEach(cleanup);
const review = projectHireReview({
  equipmentName: "Tipper AB 1234", billingBasis: "monthly", rate: 1000,
  grossAmount: 2000, deductionAmount: 0,
  periodFrom: "2026-08-01", periodTo: "2026-09-30",
  calculationSnapshot: { terms: { monthlyDivisorType: "calendar" }, workingSheet: [
    { date: "2026-08-02", activity: "worked" }, { date: "2026-09-02", activity: "idle" },
    { date: "2026-09-03", activity: "operator_unavailable" },
  ] },
});
describe("approved month review presentation", () => {
  it("has independent month disclosures, exact labels and per-month recorded categories", () => {
    const { container } = render(<HireMonthlyReview review={review} />);
    const calendars = container.querySelectorAll("details");
    expect(calendars).toHaveLength(2);
    calendars[0].open = true;
    expect(calendars[1].open).toBe(false);
    expect(screen.getByText("Idle Days (Work Not Available)")).toBeTruthy();
    expect(screen.getByText("Breakdown Days")).toBeTruthy();
    expect(screen.getByText("Operator / Driver Unavailable Days")).toBeTruthy();
    expect(review.months.map(m => [m.worked, m.idle, m.breakdown, m.operatorUnavailable])).toEqual([[1, 0, 0, 0], [0, 1, 0, 1]]);
    expect(container.textContent).not.toContain("Recorded evidence only. Missing activity is not Idle or Breakdown.");
  });
  it("keeps the factual review sentence prominent without the removed activity calendar or boilerplate", () => {
    const { container } = render(<HireMonthlyReview review={review} calendars={false} />);
    expect(container.querySelectorAll("details")).toHaveLength(0);
    const requiredDays = review.months.filter(month => month.unknown > 0)
      .map(month => `${month.label}: ${month.unknown} dates require review.`);
    expect(screen.getAllByTestId("hire-review-required-days").map(node => node.textContent)).toEqual(requiredDays);
    expect(container.textContent).not.toContain("Days Billed follows the hire terms");
    expect(container.textContent).not.toContain("Recorded evidence only");
  });
  it("carries identical month rows and stored totals to Excel and PDF", () => {
    const snapshot: WholeBillSnapshot = {
      companyName: "HLC", vendorName: "Vendor", billNo: "VB-1", billDate: "2026-10-01",
      periodFrom: review.from, periodTo: review.to, site: "Site", billType: "equipment",
      billTypeLabel: "Equipment Hire", saved: true, status: "approved", generatedAt: "2026-10-01",
      sections: [], calendars: [], hireReviews: [review],
      totals: { subtotal: 2000, gst: [], totalGst: 0, adjustments: [{ label: "Advance", amount: -3000 }], tds: { label: "TDS (IT)", amount: -40 }, netPayable: -1040 },
    };
    const before = JSON.stringify(snapshot);
    const workbook = buildWholeBillWorkbook(snapshot);
    const rows: any[][] = XLSX.utils.sheet_to_json(workbook.Sheets["Monthly Billing Summary"], { header: 1 });
    expect(rows.some(row => String(row[1]).includes("August 2026") && row[8] === 1000)).toBe(true);
    expect(rows.some(row => String(row[1]).includes("September 2026") && row[8] === 1000)).toBe(true);
    const pdf = buildWholeBillPdf(snapshot).output();
    expect(pdf).toContain("Monthly Billing Summary");
    expect(pdf).toContain("August 2026");
    expect(pdf).toContain("September 2026");
    const pdfText = Array.from(pdf.matchAll(/\((.*?)\) Tj/g), match => match[1]).join(" ");
    expect(pdfText).toMatch(/August 2026: 30 dates\s+require review\./);
    expect(pdf).not.toContain("Days Billed follows the hire terms");
    expect(pdf).not.toContain("Recorded evidence only");
    expect(rows.some(row => String(row[0]).includes("dates require review"))).toBe(true);
    expect(JSON.stringify(snapshot)).toBe(before);
  });
});
