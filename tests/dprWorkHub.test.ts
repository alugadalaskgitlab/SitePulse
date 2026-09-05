import { describe, expect, it } from "vitest";
import fs from "node:fs";
import {
  dprSectionCounts,
  dprWorkSectionHref,
  resolveExistingSiteDpr,
  resolveFieldSitePriority,
} from "../client/src/lib/dprWorkHub";

describe("DPR work hub navigation", () => {
  it("keeps the same draft id through every section and returns materials to the hub", () => {
    const draftId = 418;
    for (const section of ["activities", "equipment", "labour", "materials", "review"] as const) {
      expect(dprWorkSectionHref(draftId, section)).toContain(section === "materials" ? `/site/edit/${draftId}` : `draftId=${draftId}`);
      expect(dprWorkSectionHref(draftId, section)).toContain(encodeURIComponent(`/site/work/${draftId}`));
    }
  });

  it("derives summaries without introducing persisted workflow statuses", () => {
    expect(dprSectionCounts({ progress: [{}, {}], equipment: [{}], labour: [], materials: [{}, {}, {}] }))
      .toEqual({ activities: 2, equipment: 1, labour: 0, materials: 3 });
  });

  it("keeps unmanaged detailed sections in the guided draft payload", () => {
    const source = fs.readFileSync("client/src/pages/GuidedDpr.tsx", "utf8");
    expect(source).toContain("materials: unmanagedSectionsRef.current.materials");
    expect(source).toContain("sitePurchases: unmanagedSectionsRef.current.sitePurchases");
    expect(source).toContain("structureItems: unmanagedSectionsRef.current.structureItems");
    expect(source).toContain("rowSection=materials&rowIndex=${idx}&returnTo=");
  });

  it("resolves two authorised users to the same existing site/date draft id", () => {
    const siteDprs = [{
      id: 418,
      date: "2026-09-01",
      site: "North Reach",
      engineer: "FIRST ENGINEER",
      dprStatus: "draft",
    }];

    expect(resolveExistingSiteDpr(siteDprs, "First Engineer")).toMatchObject({
      activeDpr: { id: 418 },
      phase: "draft-own",
    });
    expect(resolveExistingSiteDpr(siteDprs, "Second Engineer")).toMatchObject({
      activeDpr: { id: 418 },
      phase: "draft-own",
    });
  });

  it("uses the transactional resume-existing start path and enforces requested-site scope", () => {
    const fieldHome = fs.readFileSync("client/src/pages/FieldHome.tsx", "utf8");
    const routes = fs.readFileSync("server/routes.ts", "utf8");
    expect(fieldHome).toContain('"/api/dprs?resumeExisting=1"');
    expect(routes).toContain('{ reuseExistingDraft: req.query.resumeExisting === "1" }');
    expect(routes).toContain("!siteMatchesPermitted(input.site, permittedSiteNames)");
  });
});

describe("Field site priority", () => {
  const sites = [{ id: 1, name: "North Reach" }, { id: 2, name: "River Works" }];
  const base = { today: "2026-08-05" };

  it("honours an explicit choice even when later DPR data prefers another site", () => {
    expect(resolveFieldSitePriority(sites, { ...base, explicitSiteId: 1, todayDprs: [{ date: base.today, site: "River Works" }] })).toBe(1);
  });

  it("uses last choice, today's DPR, active programme, then stable fallback", () => {
    expect(resolveFieldSitePriority(sites, { ...base, lastSiteId: 2 })).toBe(2);
    expect(resolveFieldSitePriority(sites, { ...base, todayDprs: [{ date: base.today, site: "River Works" }] })).toBe(2);
    expect(resolveFieldSitePriority(sites, { ...base, programmeSites: [{ siteId: 2, activeToday: true }] })).toBe(2);
    expect(resolveFieldSitePriority(sites, base)).toBe(1);
  });
});