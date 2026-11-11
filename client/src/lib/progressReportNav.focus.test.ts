import { describe, expect, it } from "vitest";
import { resolveDprCompletionReturnTo, withDprFocus } from "./progressReportNav";

describe("returning to a DPR card after submit or correction", () => {
  it("adds focus to the DPR register while preserving its current filters", () => {
    expect(withDprFocus("/site/dashboard?site=ALLADURG&dateFrom=2026-08-15", 402))
      .toBe("/site/dashboard?site=ALLADURG&dateFrom=2026-08-15&focusDpr=402");
  });
  it("leaves other originating pages unchanged", () => {
    expect(withDprFocus("/reports/progress?projectId=2&tab=chainage", 402))
      .toBe("/reports/progress?projectId=2&tab=chainage");
    expect(withDprFocus("https://example.com", 402)).toBe("https://example.com");
  });
  it("uses the original destination when a combined editor has its own back route", () => {
    const search = `?returnTo=${encodeURIComponent("/site/work/405?returnTo=%2Fsite%2Fdashboard")}&submitReturnTo=${encodeURIComponent("/site/dashboard?site=ALLADURG")}`;
    expect(resolveDprCompletionReturnTo(search)).toBe("/site/dashboard?site=ALLADURG");
  });
});
