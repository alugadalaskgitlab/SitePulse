/**
 * Gantt Month Boundaries & Shoulder Dependency Sequencing.
 *
 * Part B — shoulder sub-classification by actual construction layer.
 * Part C — each sub-type staged relative to its true predecessor.
 * Part D — Reach+Side isolation preserved after reclassification.
 * Part A/G — month boundary lines darkened with header/body kept consistent.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import {
  isShoulderDesc,
  classifyShoulderLayer,
  SHOULDER_DEPENDENCY_NOTES,
} from "../shared/workTypeRecipes";
import {
  generateSequencedProgramme,
  SHOULDER_STAGE,
  SHOULDER_REVIEW_REASON,
  type SeqInputItem,
} from "../shared/programmeSequencer";

// ─── Part B: classification ──────────────────────────────────────────────────

describe("Shoulder sub-classification (Part B)", () => {
  it("detects shoulder descriptions", () => {
    expect(isShoulderDesc("Construction of earthen shoulder with approved material")).toBe(true);
    expect(isShoulderDesc("Providing GSB in shoulders")).toBe(true);
    expect(isShoulderDesc("WMM base course over prepared subgrade")).toBe(false);
  });
  it("earth/soil/gravel shoulder → earth", () => {
    expect(classifyShoulderLayer("Construction of earthen shoulder")).toBe("earth");
    expect(classifyShoulderLayer("Shoulder with selected soil in layers")).toBe("earth");
    expect(classifyShoulderLayer("Gravel shoulder construction")).toBe("earth");
  });
  it("GSB shoulder → gsb", () => {
    expect(classifyShoulderLayer("Granular Sub-Base in shoulder portion")).toBe("gsb");
    expect(classifyShoulderLayer("Providing GSB Grading-I in shoulders")).toBe("gsb");
  });
  it("WMM shoulder → wmm", () => {
    expect(classifyShoulderLayer("Wet Mix Macadam in hard shoulder portion")).toBe("wmm");
    expect(classifyShoulderLayer("WMM in shoulders 75mm compacted")).toBe("wmm");
  });
  it("DBM shoulder → dbm", () => {
    expect(classifyShoulderLayer("Dense Bituminous Macadam in paved shoulder")).toBe("dbm");
    expect(classifyShoulderLayer("DBM 50mm over shoulder")).toBe("dbm");
  });
  it("BC shoulder → bc", () => {
    expect(classifyShoulderLayer("Bituminous Concrete in shoulder 30mm")).toBe("bc");
    expect(classifyShoulderLayer("BC wearing course on paved shoulder")).toBe("bc");
  });
  it("complete/paved shoulder with no single layer named → paved", () => {
    expect(classifyShoulderLayer("Construction of paved shoulder")).toBe("paved");
    expect(classifyShoulderLayer("Hard shoulder construction complete")).toBe("paved");
  });
  it("undeterminable layer → unclassified (never a silent earthwork default)", () => {
    expect(classifyShoulderLayer("Shoulder treatment as per drawing")).toBe("unclassified");
  });
  it("every class has a plain-language dependency note", () => {
    expect(SHOULDER_DEPENDENCY_NOTES.unclassified).toMatch(/review required/i);
    expect(SHOULDER_DEPENDENCY_NOTES.dbm).toMatch(/after carriageway DBM/);
    expect(SHOULDER_DEPENDENCY_NOTES.bc).toMatch(/after carriageway BC/);
  });
});

// ─── Part C: staging in the sequencer ────────────────────────────────────────

const mk = (id: number, description: string, over: Partial<SeqInputItem> = {}): SeqInputItem => ({
  boqItemId: id,
  description,
  unit: "CUM",
  totalQty: 1000,
  fullDurationMonths: 1,
  planningWorkType: "road",
  workCategory: null,
  ...over,
});

const OPTS = { roadLengthKm: 10, fronts: 1, lagMonths: 0.25, staggerMonths: 1, chainageStartKm: 0 };

/** Map boqItemId → bar for a single-front run. */
function barsById(items: SeqInputItem[], opts: any = OPTS) {
  const res = generateSequencedProgramme(items, opts as any);
  const m = new Map<number, { startMonth: number; endMonth: number }>();
  for (const b of res.bars) m.set(b.boqItemId, b);
  return { m, res };
}

const CREW = [
  mk(1, "Construction of embankment/subgrade with approved material"),
  mk(2, "Providing Granular Sub-Base Grading-I"),
  mk(3, "Wet Mix Macadam base course"),
  mk(4, "Dense Bituminous Macadam Gr-II", { unit: "MT", workCategory: "BITUMINOUS" }),
  mk(5, "Bituminous Concrete wearing course", { unit: "MT", workCategory: "BITUMINOUS" }),
];

describe("Shoulder stage assignment (Part C)", () => {
  it("earth shoulder stays with subgrade (stage 3) — not pushed to bituminous", () => {
    const { m } = barsById([...CREW, mk(10, "Construction of earthen shoulder")]);
    expect(m.get(10)!.startMonth).toBe(m.get(1)!.startMonth);
    expect(SHOULDER_STAGE.earth).toBe(3);
  });
  it("GSB shoulder never starts before subgrade; runs with/after GSB", () => {
    const { m } = barsById([...CREW, mk(11, "GSB in shoulder portion")]);
    expect(m.get(11)!.startMonth).toBeGreaterThanOrEqual(m.get(1)!.endMonth);
    expect(m.get(11)!.startMonth).toBe(m.get(2)!.startMonth);
  });
  it("WMM shoulder never starts before its GSB/subgrade prerequisite", () => {
    const { m } = barsById([...CREW, mk(12, "WMM in hard shoulder portion")]);
    expect(m.get(12)!.startMonth).toBeGreaterThanOrEqual(m.get(2)!.endMonth);
    expect(m.get(12)!.startMonth).toBe(m.get(3)!.startMonth);
  });
  it("DBM shoulder never starts before carriageway DBM", () => {
    const { m } = barsById([...CREW, mk(13, "DBM 50mm in paved shoulder", { unit: "MT" })]);
    expect(m.get(13)!.startMonth).toBeGreaterThanOrEqual(m.get(4)!.endMonth);
  });
  it("BC shoulder never starts before carriageway BC", () => {
    const { m } = barsById([...CREW, mk(14, "BC 30mm in shoulder", { unit: "MT" })]);
    expect(m.get(14)!.startMonth).toBeGreaterThanOrEqual(m.get(5)!.endMonth);
  });
  it("complete paved shoulder (no layer split) follows carriageway BC", () => {
    const { m } = barsById([...CREW, mk(15, "Construction of paved shoulder complete")]);
    expect(m.get(15)!.startMonth).toBeGreaterThanOrEqual(m.get(5)!.endMonth);
  });
  it("planner-confirmed shoulderLayerClass overrides the description guess and is remembered", () => {
    // description alone is ambiguous → planner confirmed "wmm"
    const { m, res } = barsById([...CREW, mk(16, "Shoulder treatment as per drawing", { shoulderLayerClass: "wmm" })]);
    expect(res.unclassifiedItemIds).not.toContain(16);
    expect(m.get(16)!.startMonth).toBe(m.get(3)!.startMonth);
  });
  it("unclassifiable shoulder is flagged for review — no bar, no earthwork default", () => {
    const { m, res } = barsById([...CREW, mk(17, "Shoulder treatment as per drawing")]);
    expect(m.has(17)).toBe(false);
    expect(res.unclassifiedItemIds).toContain(17);
    const u = res.unclassifiedItems.find(x => x.boqItemId === 17)!;
    expect(u.skipReason).toBe(SHOULDER_REVIEW_REASON);
  });
  it("regression: ordinary crust sequence order unchanged", () => {
    const { m } = barsById(CREW);
    expect(m.get(1)!.startMonth).toBeLessThan(m.get(2)!.startMonth);
    expect(m.get(2)!.startMonth).toBeLessThan(m.get(3)!.startMonth);
    expect(m.get(3)!.startMonth).toBeLessThan(m.get(4)!.startMonth);
    expect(m.get(4)!.startMonth).toBeLessThan(m.get(5)!.startMonth);
  });
});

// ─── Part D: Reach+Side isolation ────────────────────────────────────────────

describe("Reach+Side isolation (Part D)", () => {
  const items = [...CREW, mk(20, "BC 30mm in shoulder", { unit: "MT" })];
  const lhsOnly = {
    ...OPTS,
    stretches: [{ label: "R1 LHS", chainageFrom: 0, chainageTo: 10, priority: 1, side: "lhs" }],
  };
  const withRhs = {
    ...OPTS,
    stretches: [
      { label: "R1 LHS", chainageFrom: 0, chainageTo: 10, priority: 1, side: "lhs" },
      { label: "R1 RHS", chainageFrom: 0, chainageTo: 10, priority: 1, side: "rhs" },
    ],
  };
  it("an LHS shoulder's schedule is unaffected by an unrelated RHS stretch", () => {
    const a = generateSequencedProgramme(items, lhsOnly as any);
    const b = generateSequencedProgramme(items, withRhs as any);
    const lhsA = a.bars.find(x => x.boqItemId === 20 && x.reachLabel === "R1 LHS")!;
    const lhsB = b.bars.find(x => x.boqItemId === 20 && x.reachLabel === "R1 LHS")!;
    expect(lhsB.startMonth).toBe(lhsA.startMonth);
    expect(lhsB.endMonth).toBe(lhsA.endMonth);
  });
  it("each side's shoulder follows that side's own BC, independently", () => {
    const b = generateSequencedProgramme(items, withRhs as any);
    for (const side of ["R1 LHS", "R1 RHS"]) {
      const bc = b.bars.find(x => x.boqItemId === 5 && x.reachLabel === side)!;
      const sh = b.bars.find(x => x.boqItemId === 20 && x.reachLabel === side)!;
      expect(sh.startMonth).toBeGreaterThanOrEqual(bc.endMonth);
    }
  });
});

// ─── Part A: month boundary line visibility + header/body consistency ────────

describe("Gantt month boundary lines (Part A)", () => {
  const src = readFileSync("client/src/pages/WorkProgramme.tsx", "utf8");
  it("body grid lines are darkened and slightly thickened (no new day/week grid)", () => {
    expect(src).toContain('border-r-2 border-slate-300 dark:border-slate-600"\n            style={{ left: i * colW, width: colW }}');
    expect(src).not.toContain("border-r border-slate-100 dark:border-slate-800\"\n            style={{ left: i * colW");
  });
  it("header month cells use the same 2px right border so header/body stay pixel-aligned", () => {
    expect(src).toMatch(/border-r-2 border-teal-300\/80 flex-shrink-0 select-none overflow-hidden/);
  });
  it("positions still derive from the shared colW multiplier (i * colW) — dates/bars untouched", () => {
    expect(src.match(/style=\{\{ left: i \* colW, width: colW \}\}/g)!.length).toBeGreaterThanOrEqual(2);
  });
});
