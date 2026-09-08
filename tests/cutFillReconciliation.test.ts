import { describe, expect, it } from "vitest";
import {
  cutFillAvailability,
  excavationMaterialOutcomeIssue,
  insufficientCutFillMessage,
  normalizeExcavationMaterialOutcome,
  validateExcavationMaterialOutcome,
  cutFillCapacityExceeded,
} from "../shared/cutFillReconciliation";
import {
  planLegacyReusedExcavatedDestinationRelink,
  planCutFillSourceRemap,
  shouldClearLegacyCutFillArrangementSource,
} from "../server/storage";
import { readFileSync } from "fs";

describe("cut/fill outcome validation", () => {
  it("keeps reusable material separate from credited excavation quantity", () => {
    expect(validateExcavationMaterialOutcome(100, "fully_reusable", 100)).toBeNull();
    expect(validateExcavationMaterialOutcome(100, "partly_reusable", 40)).toBeNull();
    expect(validateExcavationMaterialOutcome(100, "unsuitable", 0)).toBeNull();
  });

  it("rejects outcome/quantity combinations that would overstate reusable material", () => {
    expect(validateExcavationMaterialOutcome(100, "fully_reusable", 90)).toContain("equal");
    expect(validateExcavationMaterialOutcome(100, "partly_reusable", 100)).toContain("less");
    expect(validateExcavationMaterialOutcome(100, "unsuitable", 1)).toContain("zero");
    expect(validateExcavationMaterialOutcome(100, "partly_reusable", 101)).toContain("between");
  });

  it("does not coerce missing submitted quantities to zero", () => {
    for (const outcome of ["fully_reusable", "partly_reusable", "unsuitable"]) {
      expect(validateExcavationMaterialOutcome(null, outcome, 0)).toContain("progress quantity");
      expect(validateExcavationMaterialOutcome(undefined, outcome, 0)).toContain("progress quantity");
    }
    expect(validateExcavationMaterialOutcome(0, "unsuitable", null)).toContain("reusableQty is required");
  });
});

describe("editable excavation outcome normalization", () => {
  it("keeps fully reusable quantity equal to the current excavation quantity", () => {
    expect(normalizeExcavationMaterialOutcome(100, "fully_reusable", null)).toEqual({
      materialOutcome: "fully_reusable",
      reusableQty: 100,
    });
    expect(normalizeExcavationMaterialOutcome(375, "fully_reusable", 100)).toEqual({
      materialOutcome: "fully_reusable",
      reusableQty: 375,
    });
    expect(normalizeExcavationMaterialOutcome(null, "fully_reusable", 100)).toEqual({
      materialOutcome: "fully_reusable",
      reusableQty: null,
    });
  });

  it("keeps unsuitable at zero and clears stale reusable quantity when no outcome is selected", () => {
    expect(normalizeExcavationMaterialOutcome(100, "unsuitable", 40)).toEqual({
      materialOutcome: "unsuitable",
      reusableQty: 0,
    });
    expect(normalizeExcavationMaterialOutcome(100, null, 40)).toEqual({
      materialOutcome: null,
      reusableQty: null,
    });
  });

  it("preserves partly reusable user input and never invents a partial quantity", () => {
    expect(normalizeExcavationMaterialOutcome(100, "partly_reusable", 40)).toEqual({
      materialOutcome: "partly_reusable",
      reusableQty: 40,
    });
    expect(normalizeExcavationMaterialOutcome(100, "partly_reusable", null)).toEqual({
      materialOutcome: "partly_reusable",
      reusableQty: null,
    });
    expect(normalizeExcavationMaterialOutcome(30, "partly_reusable", 40)).toEqual({
      materialOutcome: "partly_reusable",
      reusableQty: 40,
    });
  });

  it("uses focused user-facing wording backed by strict tuple validation", () => {
    expect(excavationMaterialOutcomeIssue(375, "partly_reusable", null, "Cum"))
      .toBe("Enter reusable excavation quantity between 0 and 375 CUM.");
    expect(excavationMaterialOutcomeIssue(30, "partly_reusable", 40, "Cum"))
      .toBe("Enter reusable excavation quantity between 0 and 30 CUM.");
    expect(excavationMaterialOutcomeIssue(100, "fully_reusable", 100, "Cum")).toBeNull();
  });
});

describe("authoritative source capacity evaluator", () => {
  it("rejects a reduced reusable quantity below pre-existing external use", () => {
    expect(cutFillCapacityExceeded(40, 60)).toEqual({ exceeded: true, availableQty: 0, usedQty: 60 });
  });
  it("accepts equal usage and preserves available math", () => {
    expect(cutFillCapacityExceeded(100, 60)).toEqual({ exceeded: false, availableQty: 40, usedQty: 60 });
  });
});

describe("storage source-link lifecycle regression", () => {
  const storage = readFileSync("server/storage.ts", "utf8");
  it("deletes/reinserts external links instead of producing an invalid null source", () => {
    expect(storage).not.toContain("set({ sourceProgressEntryId: null })");
    expect(storage).toContain("await tx.delete(cutFillConsumptions)");
    expect(storage).toContain("planCutFillSourceRemap(oldProgressRows, insertedProgress, externalSourceLinks)");
  });
  it("remaps source references in clone and version paths", () => {
    expect(storage).toContain("remapDprSourceLinksTx(tx, original.progress, insertedProgress)");
    expect(storage).toContain("remapDprSourceLinksTx(tx, originalProgressForRemap, insertedProgress)");
  });
  it("makes newly inserted same-DPR rows authoritative over superseded stable-key duplicates", () => {
    expect(storage).toContain("const priorSourceKeys = sourceKeys.filter(key => !byKey.has(key))");
    expect(storage).toMatch(/for \(const \[key, row\] of Array\.from\(byKey\.entries\(\)\)\) sourceByKey\.set\(key,/);
    expect(storage).toContain("AND COALESCE(d.is_superseded,false)=false");
  });
});

describe("legacy arrangement source repair", () => {
  it("clears a destination item stored as its own source", () => {
    expect(shouldClearLegacyCutFillArrangementSource({
      arrangementProjectId: 1,
      sourceProjectId: 1,
      sourceDescription: "Roadway Excavation in Ordinary Soil",
      sourceUnit: "CUM",
      isDestinationReference: true,
    })).toBe(true);
  });

  it("clears the production-shaped embankment item stored as a source", () => {
    expect(shouldClearLegacyCutFillArrangementSource({
      arrangementProjectId: 1,
      sourceProjectId: 1,
      sourceDescription: "Forming embankment with excavated earth obtained from roadway excavation for Embankment by mechanical means",
      sourceUnit: "CUM",
      isDestinationReference: false,
    })).toBe(true);
  });

  it("preserves a genuine roadway-excavation source from the same project", () => {
    expect(shouldClearLegacyCutFillArrangementSource({
      arrangementProjectId: 1,
      sourceProjectId: 1,
      sourceDescription: "Earthwork excavation in road way soils upto SDR by mechanical means",
      sourceUnit: "CUM",
      isDestinationReference: false,
    })).toBe(false);
  });
});

describe("legacy reused-excavated destination repair", () => {
  const arrangement = {
    projectId: 1,
    arrangementType: "reused_excavated",
    sourceExcavationBoqItemId: null,
    destinationBoqItemId: 3,
    destinationDescription: "Earthwork excavation  in road way  soils upto SDR by mechanical means",
    destinationUnit: "Cum",
    allocatedQty: 2280,
  };
  const productionCandidates = [
    {
      id: 3,
      projectId: 1,
      description: arrangement.destinationDescription,
      unit: "Cum",
      currentQty: 2280,
      hasActiveArrangement: true,
    },
    {
      id: 4,
      projectId: 1,
      description: "Forming embankment with excavated earth obtained from roadway excavation for Embankment by mechanical means upto SDR",
      unit: "Cum",
      currentQty: 2280,
      hasActiveArrangement: false,
    },
    {
      id: 5,
      projectId: 1,
      description: "Construction of Embankment with material obtained from borrowed useful earth",
      unit: "Cum",
      currentQty: 10185.14,
      hasActiveArrangement: true,
    },
  ];

  it("relinks the production-shaped legacy row to the unique matching cut-to-fill embankment", () => {
    expect(planLegacyReusedExcavatedDestinationRelink(arrangement, productionCandidates)).toBe(4);
  });

  it("does not guess when more than one eligible destination matches", () => {
    expect(planLegacyReusedExcavatedDestinationRelink(arrangement, [
      ...productionCandidates,
      { ...productionCandidates[1], id: 44 },
    ])).toBeNull();
  });

  it("does not alter a correctly classified fill destination", () => {
    expect(planLegacyReusedExcavatedDestinationRelink({
      ...arrangement,
      destinationBoqItemId: 4,
      destinationDescription: productionCandidates[1].description,
    }, productionCandidates)).toBeNull();
  });
});

describe("route outcome lifecycle regression", () => {
  const routes = readFileSync("server/routes.ts", "utf8");
  it("keeps drafts tuple-lenient but validates submitted excavation before accepting it", () => {
    const start = routes.indexOf("async function validateProgressMaterialOutcomes");
    const end = routes.indexOf("/**", start + 20);
    const block = routes.slice(start, end);
    expect(block).toContain("if (opts.draft) continue");
    expect(block.indexOf("if (opts.draft) continue")).toBeLessThan(block.indexOf("excavationMaterialOutcomeIssue"));
    expect(block).not.toContain("p?.quantity == null");
  });
});

describe("editable DPR cut/fill wiring regression", () => {
  const guided = readFileSync("client/src/pages/GuidedDpr.tsx", "utf8");
  const detailed = readFileSync("client/src/pages/SiteEntry.tsx", "utf8");
  const edit = readFileSync("client/src/pages/SiteEdit.tsx", "utf8");
  const controls = readFileSync("client/src/components/CutFillOutcomeControls.tsx", "utf8");
  const submittedView = readFileSync("client/src/pages/DprDetails.tsx", "utf8");

  it("normalizes autosave/draft/edit hydration without mutating submitted history views", () => {
    expect(guided.match(/normalizeExcavationMaterialOutcome/g)?.length).toBeGreaterThanOrEqual(5);
    expect(detailed).toContain("setProgress(data.progress.map");
    expect(detailed).toContain("normalizeExcavationMaterialOutcome(row.quantity");
    expect(edit.match(/normalizeExcavationMaterialOutcome/g)?.length).toBeGreaterThanOrEqual(4);
    expect(submittedView).not.toContain("normalizeExcavationMaterialOutcome");
  });

  it("keeps forced outcomes synchronized after quantity changes in every editable flow", () => {
    expect(controls).toContain("useEffect");
    expect(controls).toContain("normalizeExcavationMaterialOutcome(quantity, outcome, reusableQty)");
    expect(guided).toContain("normalizeExcavationMaterialOutcome(changed.quantity");
    expect(detailed).toContain("normalizeExcavationMaterialOutcome(entry.quantity");
    expect(edit).toContain("normalizeExcavationMaterialOutcome(entry.quantity");
  });

  it("feeds explicit BOQ classification into shared readiness and shows partial-range errors inline", () => {
    for (const source of [guided, detailed, edit]) {
      expect(source).toContain("withCutFillReadinessContext");
    }
    expect(guided).toContain("cutFillOutcomeReadinessIssue");
    expect(controls).toContain("text-reusable-qty-error");
    expect(controls).toContain("aria-invalid");
  });
});

describe("cut/fill availability", () => {
  it("calculates physical availability without changing BOQ progress", () => {
    expect(cutFillAvailability(120, 45)).toEqual({
      reusableQty: 120, consumedQty: 45, availableQty: 75,
    });
  });

  it("uses the required over-consumption language and math", () => {
    expect(insufficientCutFillMessage(75, 45))
      .toBe("Only 75 Cum of this excavated material is still available — another report has already used 45 Cum of it.");
  });
});

describe("stable source remapping", () => {
  it("remaps external fill links by entryKey, independent of insertion order", () => {
    const plan = planCutFillSourceRemap(
      [{ id: 10, entryKey: "cut-a" }, { id: 11, entryKey: "cut-b" }],
      [{ id: 102, entryKey: "cut-b" }, { id: 101, entryKey: "cut-a" }],
      [{ id: 90, sourceProgressEntryId: 10 }, { id: 91, sourceProgressEntryId: 11 }],
    );
    expect(plan.missingKeys).toEqual([]);
    expect(plan.remaps).toEqual([
      { consumptionId: 90, sourceProgressEntryId: 101 },
      { consumptionId: 91, sourceProgressEntryId: 102 },
    ]);
  });

  it("refuses a replacement that removes an externally consumed source key", () => {
    expect(planCutFillSourceRemap(
      [{ id: 10, entryKey: "cut-a" }], [], [{ id: 90, sourceProgressEntryId: 10 }],
    ).missingKeys).toEqual(["cut-a"]);
  });
});