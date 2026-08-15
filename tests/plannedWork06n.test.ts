/**
 * Batch 06N — multiple planned activities in Tomorrow's Plan.
 *
 * Seam under test: shared/plannedWork.ts (the ONLY reader/writer of the
 * dual single-object / activities-array shape) plus the 06J carry-forward
 * interaction in shared/planOutcome.ts.
 */
import { describe, it, expect } from "vitest";
import {
  getPlannedActivities,
  buildPlannedWork,
  isMeaningfulActivity,
  applyCarryToPlannedWork,
} from "../shared/plannedWork";
import { buildCarryForwardPlan } from "../shared/planOutcome";

const actA = { activity: "WMM layer", boqItemId: 11, chainageFrom: 5, chainageTo: 5.5, plannedQty: "120", plannedUom: "Cum", side: "LHS", pwLength: 500, pwWidth: 7, pwThickness: 0.25, remarks: "left carriageway", programmeBarId: 42 };
const actB = { activity: "Shoulder earthwork", boqItemId: 22, chainageFrom: 6, chainageTo: 6.2, plannedQty: "40", plannedUom: "Cum", side: "RHS", pwLength: 200, pwWidth: 1.5, pwThickness: 0.15, remarks: "", programmeBarId: null };
const actC = { activity: "Kerb casting", boqItemId: null, chainageFrom: null, chainageTo: null, plannedQty: "60", plannedUom: "Rmt", side: "", pwLength: null, pwWidth: null, pwThickness: null, remarks: "precast", programmeBarId: null };

describe("isMeaningfulActivity", () => {
  it("A: rejects empty/blank rows", () => {
    expect(isMeaningfulActivity(null)).toBe(false);
    expect(isMeaningfulActivity({})).toBe(false);
    expect(isMeaningfulActivity({ activity: "  ", plannedQty: "" } as any)).toBe(false);
    expect(isMeaningfulActivity({ side: "LHS", plannedUom: "Cum" } as any)).toBe(false); // side/uom alone isn't content
  });
  it("B: accepts any real content field", () => {
    expect(isMeaningfulActivity({ activity: "WMM" })).toBe(true);
    expect(isMeaningfulActivity({ boqItemId: 3 })).toBe(true);
    expect(isMeaningfulActivity({ chainage: "5+000" })).toBe(true);
    expect(isMeaningfulActivity({ plannedQty: 10 })).toBe(true);
    expect(isMeaningfulActivity({ remarks: "note" })).toBe(true);
  });
});

describe("getPlannedActivities — reader", () => {
  it("C: legacy single-object plan reads as one activity (unchanged records keep working)", () => {
    const legacy = { activity: "GSB", boqItemId: 5, chainageFrom: 1, chainageTo: 2, plannedQty: "300" };
    const acts = getPlannedActivities(legacy);
    expect(acts).toHaveLength(1);
    expect(acts[0].activity).toBe("GSB");
  });
  it("D: very old legacy plan with only text `chainage` still reads", () => {
    const acts = getPlannedActivities({ chainage: "5+200 to 5+800" });
    expect(acts).toHaveLength(1);
    expect(acts[0].chainage).toBe("5+200 to 5+800");
  });
  it("E: null/empty plannedWork reads as no activities", () => {
    expect(getPlannedActivities(null)).toEqual([]);
    expect(getPlannedActivities(undefined)).toEqual([]);
    expect(getPlannedActivities({})).toEqual([]);
    expect(getPlannedActivities("junk")).toEqual([]);
  });
  it("F: activities array wins over top-level mirror, order preserved, empty rows dropped", () => {
    const pw = { ...actA, activities: [actA, {}, actB, actC] };
    const acts = getPlannedActivities(pw);
    expect(acts.map(a => a.activity)).toEqual(["WMM layer", "Shoulder earthwork", "Kerb casting"]);
  });
  it("G: empty activities array falls back to legacy top-level content", () => {
    const acts = getPlannedActivities({ activity: "GSB", activities: [] });
    expect(acts).toHaveLength(1);
    expect(acts[0].activity).toBe("GSB");
  });
});

describe("buildPlannedWork — writer", () => {
  it("H: no meaningful rows -> null (plan saved without planned work)", () => {
    expect(buildPlannedWork([])).toBeNull();
    expect(buildPlannedWork([{ side: "LHS" } as any])).toBeNull();
    expect(buildPlannedWork(null)).toBeNull();
  });
  it("I: single activity -> plain legacy-shaped object (no nested activities key)", () => {
    const pw = buildPlannedWork([actA]);
    expect(pw.activity).toBe("WMM layer");
    expect(pw.activities).toBeUndefined();
  });
  it("J: multiple activities -> first mirrored on top level + full array kept", () => {
    const pw = buildPlannedWork([actA, actB, actC]);
    // Mirror: every downstream consumer (06J comparison, fulfilment context,
    // routes reading boqItemId/programmeBarId) sees activity #1 unchanged.
    expect(pw.activity).toBe("WMM layer");
    expect(pw.boqItemId).toBe(11);
    expect(pw.programmeBarId).toBe(42);
    expect(pw.plannedQty).toBe("120");
    expect(pw.activities).toHaveLength(3);
    expect(pw.activities[1].activity).toBe("Shoulder earthwork");
    expect(pw.activities[2].plannedUom).toBe("Rmt");
  });
  it("K2: legacy free-text chainage survives a build round-trip verbatim", () => {
    // Edit flow: prefill keeps legacy `chainage` text out of numeric inputs and
    // re-emits it on save when no numeric endpoints were entered.
    const legacyAct = { activity: "GSB", chainage: "5+200 to 5+800", chainageFrom: null, chainageTo: null, plannedQty: "300" };
    const pw = buildPlannedWork([legacyAct as any]);
    expect(pw.chainage).toBe("5+200 to 5+800");
    expect(pw.chainageFrom).toBeNull();
    const back = getPlannedActivities(pw);
    expect(back[0].chainage).toBe("5+200 to 5+800");
  });
  it("K: writer output round-trips through the reader", () => {
    const acts = getPlannedActivities(buildPlannedWork([actA, actB, actC]));
    expect(acts).toHaveLength(3);
    expect(acts.map(a => a.boqItemId ?? null)).toEqual([11, 22, null]);
  });
});

describe("06J carry-forward with multiple activities", () => {
  const oldReq = {
    id: 77, date: "2026-08-14", siteId: 3,
    plannedWork: buildPlannedWork([actA, actB]),
    materials: [{ lineKey: "k1", materialName: "Aggregate", qty: "50" }],
    equipment: null, labour: null, immediateRequirements: null,
    allocationStatus: null,
  };
  it("L: carry preserves ALL activities and keeps the activity-#1 mirror in lockstep with carry qty", () => {
    const { create } = buildCarryForwardPlan(oldReq, { targetDate: "2026-08-15", carryQty: 45, createdByName: "PM" });
    const pw = create.plannedWork;
    expect(pw.plannedQty).toBe(45);                       // top-level mirror
    expect(pw.activities).toHaveLength(2);
    expect(pw.activities[0].plannedQty).toBe(45);         // mirror synced
    expect(pw.activities[0].carryForwardNote).toContain("#77");
    expect(pw.activities[1].plannedQty).toBe("40");       // activity 2 untouched
    // original object never mutated
    expect(oldReq.plannedWork.activities[0].plannedQty).toBe("120");
    expect(oldReq.plannedWork.plannedQty).toBe("120");
  });
  it("L2: applyCarryToPlannedWork tolerates malformed/empty activities arrays", () => {
    expect(applyCarryToPlannedWork(null, 5, "n")).toBeNull();
    const emptyArr = applyCarryToPlannedWork({ activity: "GSB", plannedQty: "10", activities: [] }, 5, "note");
    expect(emptyArr.plannedQty).toBe(5);
    expect(emptyArr.activities).toEqual([]);
    const notArr = applyCarryToPlannedWork({ activity: "GSB", plannedQty: "10", activities: "junk" }, 5, "note");
    expect(notArr.plannedQty).toBe(5); // top-level mirror still applied
  });
  it("M: carry of a legacy single-activity plan is unchanged behavior", () => {
    const legacyReq = { ...oldReq, plannedWork: buildPlannedWork([actA]) };
    const { create } = buildCarryForwardPlan(legacyReq, { targetDate: "2026-08-15", carryQty: 30, createdByName: "PM" });
    expect(create.plannedWork.plannedQty).toBe(30);
    expect(create.plannedWork.activities).toBeUndefined();
    // reader still shows the carried qty
    expect(getPlannedActivities(create.plannedWork)[0].plannedQty).toBe(30);
  });
});
