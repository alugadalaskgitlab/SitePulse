/**
 * Batch 06A — Progress Report navigation/state helpers.
 * Covers spec tests: D (DPR link carries return context), E (Back resolves to
 * /reports/progress), F/G/H (filters, tab, item/view/sort preserved),
 * I/J (other entry contexts keep their original destination).
 *
 * Batch 06V additions:
 *  - overlapAnchor round-trips through URL
 *  - editActivityLink carries progressEntryId + returnTo with overlapAnchor
 */
import { describe, it, expect } from "vitest";
import {
  DEFAULT_STATE, parseReportState, buildReportSearch, progressReportUrl,
  dprLinkWithReturn, resolveReturnTo, editActivityLink,
  isOverlapReviewOpen, overlapReviewTargetId, type ProgressReportState,
  DPR_REGISTER_PATH, withReturnTo,
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

describe("shared DPR navigation context", () => {
  it("uses the routed DPR register as the single fallback", () => {
    expect(DPR_REGISTER_PATH).toBe("/site/dashboard");
    expect(resolveReturnTo("", DPR_REGISTER_PATH)).toBe(DPR_REGISTER_PATH);
    expect(resolveReturnTo("?returnTo=https%3A%2F%2Fevil.example", DPR_REGISTER_PATH))
      .toBe(DPR_REGISTER_PATH);
  });

  it("encodes the complete origin URL, including filters and tabs", () => {
    const origin = "/site/dashboard?origin=portal&site=North%20Reach&status=draft&tab=reports";
    const href = withReturnTo("/site/report/42?view=compact", origin);
    expect(href).toContain("view=compact&returnTo=");
    expect(resolveReturnTo(`?${href.split("?")[1]}`, DPR_REGISTER_PATH)).toBe(origin);
  });

  it("supports nested report/edit returns without dropping register state", () => {
    const register = "/site/dashboard?site=North%20Reach&status=submitted&tab=reports";
    const report = withReturnTo("/site/report/42", register);
    const edit = withReturnTo("/site/edit/42", report);
    expect(resolveReturnTo(`?${edit.split("?")[1]}`, DPR_REGISTER_PATH)).toBe(report);
    expect(resolveReturnTo(`?${report.split("?")[1]}`, DPR_REGISTER_PATH)).toBe(register);
  });
});

// ── Batch 06V: overlapAnchor + editActivityLink ───────────────────────────────

describe("overlapAnchor round-trips through URL (06V)", () => {
  it("overlapAnchor defaults to empty string", () => {
    expect(DEFAULT_STATE.overlapAnchor).toBe("");
    expect(buildReportSearch(DEFAULT_STATE)).toBe("");
  });

  it("non-empty overlapAnchor is serialised into the URL", () => {
    const s = state({ projectId: "2", item: "31", overlapAnchor: "open" });
    const url = progressReportUrl(s);
    expect(url).toContain("overlapAnchor=open");
    expect(parseReportState(url.split("?")[1] ?? "").overlapAnchor).toBe("open");
  });

  it("overlapAnchor pair key round-trips without corruption", () => {
    const s = state({ projectId: "2", item: "31", overlapAnchor: "101:202" });
    const parsed = parseReportState(buildReportSearch(s));
    expect(parsed.overlapAnchor).toBe("101:202");
  });

  it("clearing overlapAnchor to '' drops it from the URL", () => {
    const s = state({ projectId: "2", item: "31", overlapAnchor: "" });
    expect(buildReportSearch(s)).not.toContain("overlapAnchor");
  });
});

describe("editActivityLink — deep-link to SiteEdit (06V)", () => {
  it("builds /site/edit/:dprId?progressEntryId=...&returnTo=...", () => {
    const s = state({ projectId: "2", tab: "item", item: "31", overlapAnchor: "open" });
    const link = editActivityLink(42, 101, s);
    expect(link.startsWith("/site/edit/42?")).toBe(true);
    expect(link).toContain("progressEntryId=101");
    expect(link).toContain("returnTo=");
  });

  it("returnTo in editActivityLink encodes full current report URL including overlapAnchor", () => {
    const s = state({ projectId: "2", tab: "item", item: "31", overlapAnchor: "open" });
    const link = editActivityLink(42, 101, s);
    const rtRaw = new URLSearchParams(link.split("?")[1]).get("returnTo");
    expect(rtRaw).toBeTruthy();
    const rt = decodeURIComponent(rtRaw!);
    expect(rt.startsWith("/reports/progress")).toBe(true);
    expect(rt).toContain("overlapAnchor=open");
    expect(rt).toContain("item=31");
  });

  it("returnTo in editActivityLink is a valid in-app path (resolveReturnTo accepts it)", () => {
    const s = state({ projectId: "2", item: "31", overlapAnchor: "open" });
    const link = editActivityLink(42, 101, s);
    const search = "?" + link.split("?")[1];
    const resolved = resolveReturnTo(search, "/site/dashboard");
    expect(resolved.startsWith("/reports/progress")).toBe(true);
  });
});

describe("overlap review return anchors (06V)", () => {
  it("opens for both the generic anchor and an exact pair key", () => {
    expect(isOverlapReviewOpen("open")).toBe(true);
    expect(isOverlapReviewOpen("101:202")).toBe(true);
    expect(isOverlapReviewOpen("")).toBe(false);
  });

  it("targets only a safe numeric pair id and otherwise falls back to the panel", () => {
    expect(overlapReviewTargetId("101:202")).toBe("overlap-pair-101:202");
    expect(overlapReviewTargetId("open")).toBeNull();
    expect(overlapReviewTargetId("../../evil")).toBeNull();
  });

  it("the exact pair survives SiteEdit returnTo round-trip and remains open", () => {
    const s = state({ projectId: "2", item: "31", overlapAnchor: "101:202" });
    const link = editActivityLink(42, 101, s);
    const returned = resolveReturnTo(`?${link.split("?")[1]}`, "/site/dashboard");
    const restored = parseReportState(returned.split("?")[1] ?? "");
    expect(restored.overlapAnchor).toBe("101:202");
    expect(isOverlapReviewOpen(restored.overlapAnchor)).toBe(true);
    expect(overlapReviewTargetId(restored.overlapAnchor)).toBe("overlap-pair-101:202");
  });
});
