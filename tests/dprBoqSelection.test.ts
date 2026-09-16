import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  dprBoqItemDisplayName,
  dprSelectableBoqItems,
  normalizeDprSiteName,
  resolveDprSiteId,
  resolveDprBoqProjectId,
  hasDprBoqReferences,
  isConfirmedDprNullProjectRecovery,
} from "../shared/dprBoqSelection";
import { emptySuggestionsReason } from "../shared/dprProgrammeLink";
import { creditExecutedEntries } from "../shared/planOutcome";

describe("shared DPR BOQ selection", () => {
  it("normalizes harmless site formatting but refuses ambiguous exact matches", () => {
    expect(normalizeDprSiteName("  Takkadpally   Sirur ")).toBe("takkadpally sirur");
    expect(resolveDprSiteId(
      [{ id: 7, name: "Takkadpally Sirur" }, { id: 8, name: "Other Site" }],
      " takkadpally   sirur ",
    )).toBe(7);
    expect(resolveDprSiteId(
      [{ id: 7, name: "Takkadpally Sirur" }, { id: 8, name: "TAKKADPALLY SIRUR" }],
      "Takkadpally Sirur",
    )).toBeNull();
    expect(resolveDprSiteId(
      [{ id: 7, name: "Takkadpally Sirur" }],
      "Takkadpally Sirur East",
    )).toBeNull();
  });

  it("finds nested BOQ references used by equipment and allocation rows", () => {
    expect(hasDprBoqReferences({
      passthrough: { boqItemId: 17 },
    })).toBe(true);
    expect(hasDprBoqReferences({
      segments: [{ allocations: [{ boqItemId: 23 }] }],
    })).toBe(true);
    expect(hasDprBoqReferences({
      passthrough: { boqItemId: null },
      allocations: [],
    })).toBe(false);
  });

  it("uses one project rule and lets Edit preserve the DPR's saved project", () => {
    const projects = [
      { id: 30, status: "draft", barCount: 12 },
      { id: 20, status: "active", barCount: 0 },
      { id: 10, status: "active", barCount: 4 },
    ];

    expect(resolveDprBoqProjectId(projects)).toBe(10);
    expect(resolveDprBoqProjectId(projects, 20)).toBe(20);
    expect(resolveDprBoqProjectId(projects, 999)).toBe(10);
  });

  it("permits null-project recovery only after an explicit, same-site, unlinked confirmation", () => {
    expect(isConfirmedDprNullProjectRecovery({
      savedProjectId: null,
      requestedProjectId: 2,
      confirmed: true,
      sameSite: true,
      hasBoqReferences: false,
    })).toBe(true);

    for (const rejected of [
      { savedProjectId: 7, requestedProjectId: 2, confirmed: true, sameSite: true, hasBoqReferences: false },
      { savedProjectId: null, requestedProjectId: 2, confirmed: false, sameSite: true, hasBoqReferences: false },
      { savedProjectId: null, requestedProjectId: 2, confirmed: true, sameSite: false, hasBoqReferences: false },
      { savedProjectId: null, requestedProjectId: 2, confirmed: true, sameSite: true, hasBoqReferences: true },
      { savedProjectId: null, requestedProjectId: null, confirmed: true, sameSite: true, hasBoqReferences: false },
    ]) {
      expect(isConfirmedDprNullProjectRecovery(rejected)).toBe(false);
    }
  });

  it("preserves API ordering and excludes only explicit DPR opt-outs", () => {
    const apiItems = [
      { id: 41, includeInDpr: true },
      { id: 17, includeInDpr: false },
      { id: 29, includeInDpr: null },
      { id: 8 },
    ];

    expect(dprSelectableBoqItems(apiItems).map((item) => item.id)).toEqual([41, 29, 8]);
  });

  it("keeps a selected-project BOQ item available when no bar is scheduled", () => {
    const projectItems = [
      { id: 41, includeInDpr: true, description: "Valid item" },
      { id: 17, includeInDpr: false, description: "Explicit DPR opt-out" },
    ];
    const futureBars = [{
      id: 501,
      startDate: "2026-10-01",
      endDate: "2026-10-31",
    }];

    expect(emptySuggestionsReason([], "2026-09-15")).toBe("no_programme");
    expect(emptySuggestionsReason(futureBars, "2026-09-15")).toBe("no_date_coverage");
    expect(dprSelectableBoqItems(projectItems).map((item) => item.id)).toEqual([41]);
  });

  it("credits a real BOQ row without requiring a programme-bar link", () => {
    const result = creditExecutedEntries(
      [{ quantity: 10, uom: "SQM", rowConversionFactor: null }],
      { id: 41, unit: "SQM", dprConversionFactor: 0.5 },
    );

    expect(result.creditApplied).toBe(true);
    expect(result.executedByUom).toEqual([{ uom: "SQM", qty: 5, entryCount: 1 }]);
  });

  it("shows only BOQ-owned saved names, never canonical/SNL labels", () => {
    expect(dprBoqItemDisplayName({
      id: 1,
      displayName: "Clearing and grubbing",
      itemName: "Older BOQ name",
      description: "Full BOQ description",
      canonicalDisplayName: "SNL replacement",
      snlShortLabel: "SDB replacement",
    })).toBe("Clearing and grubbing");
  });

  it("routes all three DPR activity selectors through the same hook and picker", () => {
    for (const page of ["GuidedDpr", "SiteEntry", "SiteEdit"]) {
      const source = readFileSync(`client/src/pages/${page}.tsx`, "utf8");
      expect(source, page).toContain("useDprBoqItems");
      expect(source, page).toContain("<DprBoqStatus");
      expect(source, page).toContain("<BillItemPicker");
      expect(source, page).toContain("dprBoqItemDisplayName");
      expect(source, page).toContain("dprSelectableBoqItems");
    }
    for (const page of ["GuidedDpr", "SiteEntry"]) {
      const source = readFileSync(`client/src/pages/${page}.tsx`, "utf8");
      expect(source, page).toContain("hasDprBoqReferences");
      expect(source, page).toContain("BOQ references are already in use");
    }
    const siteEdit = readFileSync("client/src/pages/SiteEdit.tsx", "utf8");
    expect(siteEdit).toContain("const hasSavedDpr = dpr != null");
    expect(siteEdit).toContain("if (nextSite !== header.site && hasSavedDpr)");
    expect(siteEdit).toContain("onProjectChange={handleBoqProjectChange}");
    expect(siteEdit).toContain("projectRecoveryRequired=");
  });

  it("keeps every saved DPR on its server-owned site and resets recovery on permitted corrections", () => {
    const siteEdit = readFileSync("client/src/pages/SiteEdit.tsx", "utf8");
    expect(siteEdit).toContain("A saved DPR remains tied to its original site.");
    expect(siteEdit).toContain("setBoqProjectPreference({ resolved: false, projectId: null });");
    expect(siteEdit).toContain("setBoqProjectRecoveryConfirmed(false);");
    expect(siteEdit).toContain("setPendingBoqProjectId(null);");
  });

  it("keeps a positive pin immutable while giving an unlinked saved-null DPR a confirmed recovery path", () => {
    const guided = readFileSync("client/src/pages/GuidedDpr.tsx", "utf8");
    const status = readFileSync("client/src/components/DprBoqStatus.tsx", "utf8");
    const routes = readFileSync("server/routes.ts", "utf8");
    const storage = readFileSync("server/storage.ts", "utf8");

    expect(guided).toContain("serverBoqProjectPinRef.current === null && !guidedHasBoqReferences");
    expect(guided).toContain("boqProjectRecoveryConfirmed: true");
    expect(status).toContain("Attach this DPR to a BOQ project?");
    expect(status).toContain("button-confirm-boq-project-recovery");
    expect(routes).toContain("DPR_PROJECT_RECOVERY_CONFIRMATION_REQUIRED");
    expect(routes).toContain("confirmedNullProjectRecovery");
    expect(storage).toContain("allowConfirmedNullProjectRecovery");
  });
});
