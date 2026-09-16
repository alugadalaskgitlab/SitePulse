import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  dprBoqItemDisplayName,
  dprSelectableBoqItems,
  normalizeDprSiteName,
  resolveDprSiteId,
  resolveDprBoqProjectId,
  resolveDprBoqProjectIdByEvidence,
  collectDprBoqItemIds,
  hasDprBoqReferences,
  hasDprMeaningfulNonBoqWork,
  isConfirmedDprNullProjectRecovery,
  isEvidenceBasedDprNullProjectRecovery,
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

  it("distinguishes untouched placeholders from meaningful special-only work", () => {
    expect(hasDprMeaningfulNonBoqWork([
      {
        entryKey: "blank",
        activity: "",
        noSiteWork: false,
        isIncidental: false,
        quantity: null,
        chainageFrom: "",
        chainageTo: "",
      },
      {
        category: "Skilled",
        gender: "Male",
        count: 0,
        task: "",
        contractor: "",
      },
      {
        structureType: "Culvert",
        structureSubType: "Pipe Culvert",
        structureName: "",
        stage: "Excavation",
        itemOfWork: "Excavation",
        quantity: null,
        uom: "m³",
        remarks: "",
      },
    ])).toBe(false);
    expect(hasDprMeaningfulNonBoqWork([
      { noSiteWork: true, activity: "", noSiteWorkDescription: "" },
      { activity: "", noSiteWork: false, isIncidental: false },
    ])).toBe(true);
    expect(hasDprMeaningfulNonBoqWork([
      { isIncidental: true, activity: "", incidentalDescription: "" },
      { activity: "", noSiteWork: false, isIncidental: false },
    ])).toBe(true);
    expect(hasDprMeaningfulNonBoqWork([{ activity: "CLEARING VEGETATION" }])).toBe(true);
    expect(hasDprMeaningfulNonBoqWork([
      { itemDescription: "DIESEL", vendor: "", amount: null, quantity: null },
    ])).toBe(true);
  });

  it("collects live nested evidence ids and resolves only an unambiguous owner", () => {
    expect(collectDprBoqItemIds({
      progress: [{ boqItemId: "23" }],
      equipment: [{ passthrough: { allocations: [{ boqItemId: 41 }] } }],
    })).toEqual([23, 41]);

    const projects = [{ id: 10 }, { id: 20 }, { id: 30 }];
    expect(resolveDprBoqProjectIdByEvidence(
      projects,
      [41],
      new Map([[10, [{ id: 7 }]], [20, [{ id: 41 }]], [30, [{ id: 9 }]]]),
    )).toBe(20);
    expect(resolveDprBoqProjectIdByEvidence(
      projects,
      [41],
      new Map([[10, [{ id: 41 }]], [20, [{ id: 41 }]]]),
    )).toBeNull();
    expect(resolveDprBoqProjectIdByEvidence(
      projects,
      [41, 99],
      new Map([[20, [{ id: 41 }]], [30, [{ id: 99 }]]]),
    )).toBeNull();
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

  it("recognises only evidence-bearing same-site null-project recovery", () => {
    expect(isEvidenceBasedDprNullProjectRecovery({
      savedProjectId: null,
      requestedProjectId: 2,
      sameSite: true,
      hasBoqReferences: true,
    })).toBe(true);
    expect(isEvidenceBasedDprNullProjectRecovery({
      savedProjectId: null,
      requestedProjectId: 2,
      sameSite: true,
      hasBoqReferences: false,
    })).toBe(false);
    expect(isEvidenceBasedDprNullProjectRecovery({
      savedProjectId: 7,
      requestedProjectId: 2,
      sameSite: true,
      hasBoqReferences: true,
    })).toBe(false);
    expect(isEvidenceBasedDprNullProjectRecovery({
      savedProjectId: null,
      requestedProjectId: 2,
      sameSite: false,
      hasBoqReferences: true,
    })).toBe(false);
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
      expect(source, page).not.toContain("<DprBoqStatus");
      expect(source, page).not.toContain('from "@/components/DprBoqStatus"');
      expect(source, page).toContain("<BillItemPicker");
      expect(source, page).toContain("dprBoqItemDisplayName");
      expect(source, page).toContain("dprSelectableBoqItems");
      expect(source, page).toContain("hasDprMeaningfulNonBoqWork");
      expect(source, page).toContain("catalogueItems");
    }
    expect(readFileSync("client/src/pages/SiteEntry.tsx", "utf8"))
      .toContain("materials, sitePurchases");
    expect(readFileSync("client/src/pages/SiteEdit.tsx", "utf8"))
      .toContain("materials, sitePurchases");
    for (const page of ["GuidedDpr", "SiteEntry"]) {
      const source = readFileSync(`client/src/pages/${page}.tsx`, "utf8");
      expect(source, page).toContain("hasDprBoqReferences");
      expect(source, page).toContain("BOQ references are already in use");
    }
    const siteEdit = readFileSync("client/src/pages/SiteEdit.tsx", "utf8");
    expect(siteEdit).toContain("const hasSavedDpr = dpr != null");
    expect(siteEdit).toContain("if (nextSite !== header.site && hasSavedDpr)");
    expect(siteEdit).not.toContain("handleBoqProjectChange");
    expect(siteEdit).not.toContain("projectRecoveryRequired");
  });

  it("keeps every saved DPR on its server-owned site and resets recovery on permitted corrections", () => {
    const siteEdit = readFileSync("client/src/pages/SiteEdit.tsx", "utf8");
    expect(siteEdit).toContain("A saved DPR remains tied to its original site.");
    expect(siteEdit).toContain("setBoqProjectPreference({ resolved: false, projectId: null });");
    expect(siteEdit).toContain('Object.prototype.hasOwnProperty.call(dpr, "boqProjectId")');
  });

  it("keeps positive and null pins immutable without a visible recovery path", () => {
    const guided = readFileSync("client/src/pages/GuidedDpr.tsx", "utf8");
    const routes = readFileSync("server/routes.ts", "utf8");
    const storage = readFileSync("server/storage.ts", "utf8");

    expect(guided).toContain("serverBoqProjectPinRef.current !== undefined");
    expect(guided).not.toContain("boqProjectRecoveryConfirmed");
    expect(guided).not.toContain("<DprBoqStatus");
    // The server derives recovery from live/persisted BOQ evidence. The
    // legacy confirmation field remains parse-compatible but is not trusted.
    expect(routes).toContain("automaticNullProjectRecovery");
    expect(routes).toContain("isEvidenceBasedDprNullProjectRecovery");
    expect(storage).toContain("evidenceBasedNullProjectRecovery");
    expect(storage).not.toContain("(dprData as any).boqProjectRecoveryConfirmed === true");
  });
});
