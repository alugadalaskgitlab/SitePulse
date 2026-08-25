import { describe, expect, it } from "vitest";
import {
  cutFillAvailability,
  insufficientCutFillMessage,
  validateExcavationMaterialOutcome,
  cutFillCapacityExceeded,
} from "../shared/cutFillReconciliation";
import { planCutFillSourceRemap } from "../server/storage";
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

describe("route outcome lifecycle regression", () => {
  const routes = readFileSync("server/routes.ts", "utf8");
  it("keeps drafts tuple-lenient but validates submitted excavation before accepting it", () => {
    const start = routes.indexOf("async function validateProgressMaterialOutcomes");
    const end = routes.indexOf("/**", start + 20);
    const block = routes.slice(start, end);
    expect(block).toContain("if (opts.draft) continue");
    expect(block.indexOf("if (opts.draft) continue")).toBeLessThan(block.indexOf("validateExcavationMaterialOutcome"));
    expect(block).not.toContain("p?.quantity == null");
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