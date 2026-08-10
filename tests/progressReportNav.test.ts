/**
 * Batch 06A — Progress Report navigation/state helpers.
 * Covers spec tests: D (DPR link carries return context), E (Back resolves to
 * /reports/progress), F/G/H (filters, tab, item/view/sort preserved),
 * I/J (other entry contexts keep their original destination).
 */
import { describe, it, expect } from "vitest";
import {
  DEFAULT_STATE, parseReportState, buildReportSearch, progressReportUrl,
  dprLinkWithReturn, resolveReturnTo, type ProgressReportState,
} from "../client/src/lib/progressReportNav";

const state = (p: Partial<ProgressReportState> = {}): ProgressReportState => ({ ...DEFAULT_STATE, ...p });

describe("parse/build round-trip (F, G, H)", () => {
  it("defaults produce an empty query and parse back to defaults", () => {
    expect(buildReportSearch(DEFAULT_STATE)).toBe("");
    expect(parseReportState("")).toEqual(DEFAULT_STATE);
  });

  it("round-trips project/site/date filters (F)", () => {
    const s = state({ projectId: "2", site: "THAKADPALLY - SIRUR", from: "2026-06-01", to: "2026-08-01" });
    const parsed = parseReportState(buildReportSearch(s));
    expect(parsed).toEqual(s);
  });

  it("round-trips tab (G) and item/view/sort (H)", () => {
    const s = state({ projectId: "2", tab: "item", item: "31", view: "abstract", sort: "date_chainage" });
    expect(parseReportState(buildReportSearch(s))).toEqual(s);
  });

  it("round-trips chainage-wise inputs", () => {
    const s = state({ projectId: "2", tab: "chainage", chFrom: "2+000", chTo: "3+500", chSide: "LHS" });
    expect(parseReportState(buildReportSearch(s))).toEqual(s);
  });

  it("rejects invalid tab/view/sort values, falling back to defaults", () => {
    const parsed = parseReportState("?tab=evil&view=nope&sort=bad");
    expect(parsed.tab).toBe("item");
    expect(parsed.view).toBe("measurement");
    expect(parsed.sort).toBe("chainage_date");
  });

  it("accepts search strings with or without a leading '?'", () => {
    expect(parseReportState("projectId=5").projectId).toBe("5");
    expect(parseReportState("?projectId=5").projectId).toBe("5");
  });
});

describe("DPR drill-down carries return context (D)", () => {
  it("links to the DPR with an encoded returnTo of the exact report URL", () => {
    const s = state({ projectId: "2", tab: "item", item: "31", sort: "date_chainage" });
    const link = dprLinkWithReturn(266, s);
    expect(link.startsWith("/site/report/266?returnTo=")).toBe(true);
    const rt = decodeURIComponent(link.split("returnTo=")[1]);
    expect(rt).toBe(progressReportUrl(s));
    expect(rt.startsWith("/reports/progress?")).toBe(true);
  });
});

describe("Back from DPR resolves the originating context (E, I, J)", () => {
  it("returns to /reports/progress with full state when opened from Progress Report (E)", () => {
    const s = state({ projectId: "2", site: "SITE-A", from: "2026-06-01", tab: "item", item: "31", view: "measurement", sort: "chainage_date" });
    const link = dprLinkWithReturn(266, s);
    const search = link.split("?")[1];
    const back = resolveReturnTo(`?${search}`, "/site/dashboard");
    expect(back).toBe(progressReportUrl(s));
    // and the restored state matches exactly (F, G, H)
    expect(parseReportState(back.split("?")[1] ?? "")).toEqual(s);
  });

  it("keeps the existing default when no returnTo present (I, J)", () => {
    expect(resolveReturnTo("", "/site/dashboard")).toBe("/site/dashboard");
    expect(resolveReturnTo("?foo=1", "/site/dashboard?origin=portal")).toBe("/site/dashboard?origin=portal");
  });

  it("honours returnTo from any other origin context (I)", () => {
    expect(resolveReturnTo(`?returnTo=${encodeURIComponent("/site/hub?tab=x")}`, "/site/dashboard")).toBe("/site/hub?tab=x");
  });

  it("rejects external and protocol-relative returnTo values", () => {
    expect(resolveReturnTo("?returnTo=https%3A%2F%2Fevil.example", "/site/dashboard")).toBe("/site/dashboard");
    expect(resolveReturnTo("?returnTo=%2F%2Fevil.example", "/site/dashboard")).toBe("/site/dashboard");
  });

  it("rejects backslash / mixed-slash and scheme-bearing returnTo values", () => {
    expect(resolveReturnTo("?returnTo=%2F%5Cevil.example", "/site/dashboard")).toBe("/site/dashboard"); // "/\evil.example"
    expect(resolveReturnTo("?returnTo=%2F%5C%2Fevil.example", "/site/dashboard")).toBe("/site/dashboard"); // "/\/evil.example"
    expect(resolveReturnTo("?returnTo=%2Fjavascript%3Aalert(1)", "/site/dashboard")).toBe("/site/dashboard"); // "/javascript:alert(1)"
  });
});
