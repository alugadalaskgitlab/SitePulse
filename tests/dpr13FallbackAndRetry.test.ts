import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { createDprSectionSaveAttempt } from "../client/src/lib/dprSectionSaveAttempt";

describe("DPR13 deliberate fallbacks and exact retry identity", () => {
  it("keeps gated sections default while restoring gated combined editors", () => {
    const source = readFileSync("client/src/App.tsx", "utf8");
    for (const path of ["/site/new", "/site/guided"]) {
      expect(source).toContain(`path="${path}" component={gated(DprSections, "site_dprs")}`);
    }
    expect(source).toContain('path="/site/combined" component={gated(SiteEntry, "site_dprs")}');
    expect(source).toContain('path="/site/guided/combined" component={gated(GuidedDpr, "site_dprs")}');
    expect(source).toContain('path="/site/edit/:id" component={gated(DprEditEntry, "site_dprs")}');
  });
  it("reuses a key only for the exact section, payload and baseline", () => {
    let key = 0;
    const attempt = createDprSectionSaveAttempt(() => `synthetic-attempt-${++key}`);
    const body = { dprId: 1301, headerToken: "h0", sectionToken: "e0", data: { equipment: [{ openingReading: 100 }] } };
    const original = attempt(body, "equipment");
    expect(attempt(structuredClone(body), "equipment").clientKey).toBe(original.clientKey);
    const changed = attempt({ ...body, data: { equipment: [{ openingReading: 101 }] } }, "equipment");
    expect(changed.clientKey).not.toBe(original.clientKey);
    expect(changed.headerToken).toBe("h0");
    expect(changed.sectionToken).toBe("e0");
    const rebased = attempt({ ...body, sectionToken: "e1" }, "equipment");
    expect(rebased.clientKey).not.toBe(changed.clientKey);
    expect(attempt({ ...body, sectionToken: "e1" }, "labour").clientKey).not.toBe(rebased.clientKey);
  });
  it("keeps combined mode on photo retry and Detailed-to-Guided switches", () => {
    const entry = readFileSync("client/src/pages/SiteEntry.tsx", "utf8");
    expect(entry).toContain("`/site/edit/${data.id}?draft&combined=1&returnTo=");
    expect(entry).toContain("`/site/edit/${data.id}?draft&combined=1`");
    const edit = readFileSync("client/src/pages/SiteEdit.tsx", "utf8");
    expect(edit).toContain("`/site/guided/combined?draftId=${id}");
  });
  it("retains personnel on both Guided row kinds and unedited manual geometry", () => {
    const guided = readFileSync("client/src/pages/GuidedDpr.tsx", "utf8");
    expect(guided).toContain("personnelIds: [...(p.personnelIds ?? [])]");
    expect(guided.match(/personnelIds: e.personnelIds \?\? \[\]/g)).toHaveLength(2);
    expect(guided).not.toContain("personnelIds: [] as number[]");
    expect(guided).toContain("e.savedGeometry.from === e.chainageFrom && e.savedGeometry.to === e.chainageTo");
    expect(guided).toContain("lengthOverrideReason: e.lengthOverrideReason ?? null");
    expect(guided).toContain('if (urlDraftDpr?.workType === "structure")');
  });
});