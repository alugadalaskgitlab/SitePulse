/**
 * Batch 06P — Multi-layer / lift execution tracking.
 *
 * A. same chainage/side/boqItem, DIFFERENT layerNo → no overlap hit.
 * B. same chainage/side/boqItem, SAME layerNo → overlap exactly as today.
 * C. one or both layerNo null → overlap exactly as today (null ≠ any layer).
 * D. different boqItemId / non-overlapping side or chainage → unaffected.
 * E. blank layerNo behaves identically to pre-batch (readiness rule).
 * F. cumulative/BOQ-credit unchanged — sum of all entries regardless of layer.
 * G. layerBreakdown: single-layer item → [] (renders as today); 2+ layers →
 *    correct split that sums to the existing total.
 * I/J. schema: progress_entries gained exactly ONE new column (layerNo);
 *    dpr_structure_items untouched; no layerLabel anywhere.
 */
import { describe, it, expect } from "vitest";
import {
  findChainageOverlaps,
  chainageOverlapReadinessIssues,
  layersDistinct,
  type CandidateChainageRow,
  type PriorChainageEntry,
} from "../shared/chainageOverlap";
import { computeItemEntries, layerBreakdown, type ReportEntry } from "../shared/progressReport";
import { layerWord, layerFieldLabel, layerDisplayName } from "../shared/layerDisplay";
import { progressEntries, dprStructureItems } from "../shared/schema";
import { getTableColumns } from "drizzle-orm";
import { readFileSync } from "fs";

const row = (o: Partial<CandidateChainageRow> = {}): CandidateChainageRow => ({
  rowKey: o.rowKey ?? 0,
  boqItemId: 10,
  side: "LHS",
  fromKm: 1.0,
  toKm: 2.0,
  ...o,
});

const prior = (o: Partial<PriorChainageEntry> = {}): PriorChainageEntry => ({
  entryId: 900,
  dprId: 50,
  dprDate: "2026-08-01",
  boqItemId: 10,
  side: "LHS",
  fromKm: 1.0,
  toKm: 2.0,
  quantity: 100,
  uom: "Cum",
  ...o,
});

describe("06P §3 — layersDistinct pre-check", () => {
  it("true only when BOTH non-null AND different", () => {
    expect(layersDistinct(1, 2)).toBe(true);
    expect(layersDistinct(2, 1)).toBe(true);
    expect(layersDistinct(1, 1)).toBe(false);
    expect(layersDistinct(null, 2)).toBe(false);
    expect(layersDistinct(1, null)).toBe(false);
    expect(layersDistinct(null, null)).toBe(false);
    expect(layersDistinct(undefined, 1)).toBe(false);
  });
  it("null is never coerced to 1 — null vs layer 1 is NOT distinct", () => {
    expect(layersDistinct(null, 1)).toBe(false);
    expect(layersDistinct(1, null)).toBe(false);
  });
});

describe("06P Test A — different layers = valid separate work", () => {
  it("same-DPR pair with layer 1 vs 2 produces no hit and no readiness issue", () => {
    const rows = [row({ rowKey: 0, layerNo: 1 }), row({ rowKey: 1, layerNo: 2 })];
    expect(findChainageOverlaps(rows, []).size).toBe(0);
    expect(chainageOverlapReadinessIssues(rows, [])).toHaveLength(0);
  });
  it("prior-DPR pair with different layers produces no hit", () => {
    const hits = findChainageOverlaps([row({ layerNo: 2 })], [prior({ layerNo: 1 })]);
    expect(hits.size).toBe(0);
  });
});

describe("06P Test B — same layer = overlap exactly as today", () => {
  it("same-DPR same layerNo still hits and requires a reason", () => {
    const rows = [row({ rowKey: 0, layerNo: 1 }), row({ rowKey: 1, layerNo: 1 })];
    const hits = findChainageOverlaps(rows, []);
    expect(hits.get(0)).toHaveLength(1);
    expect(hits.get(1)).toHaveLength(1);
    expect(chainageOverlapReadinessIssues(rows, [])).toHaveLength(2);
  });
  it("prior-DPR same layerNo still hits; reason clears readiness", () => {
    const r = row({ layerNo: 3 });
    expect(findChainageOverlaps([r], [prior({ layerNo: 3 })]).get(0)).toHaveLength(1);
    expect(chainageOverlapReadinessIssues([{ ...r, chainageOverrideReason: "second pass rework" }], [prior({ layerNo: 3 })])).toHaveLength(0);
  });
});

describe("06P Test C — null layerNo keeps legacy behavior", () => {
  it("both null → hit exactly as today", () => {
    const rows = [row({ rowKey: 0 }), row({ rowKey: 1 })];
    expect(findChainageOverlaps(rows, []).get(0)).toHaveLength(1);
  });
  it("one null vs a numbered layer → still a hit (null never 'different')", () => {
    expect(findChainageOverlaps([row({ layerNo: null })], [prior({ layerNo: 2 })]).get(0)).toHaveLength(1);
    expect(findChainageOverlaps([row({ layerNo: 2 })], [prior({ layerNo: null })]).get(0)).toHaveLength(1);
    expect(findChainageOverlaps([row({ layerNo: 1 })], [prior()]).get(0)).toHaveLength(1); // prior has no layerNo at all (legacy)
  });
});

describe("06P Test D — existing rules still apply first", () => {
  it("different boqItemId never compared, layers or not", () => {
    const rows = [row({ rowKey: 0, layerNo: 1 }), row({ rowKey: 1, boqItemId: 11, layerNo: 1 })];
    expect(findChainageOverlaps(rows, []).size).toBe(0);
  });
  it("distinct sides / non-overlapping chainage stay clean even with same layer", () => {
    expect(findChainageOverlaps([row({ layerNo: 1, side: "LHS" })], [prior({ layerNo: 1, side: "RHS" })]).size).toBe(0);
    expect(findChainageOverlaps([row({ layerNo: 1, fromKm: 2.0, toKm: 3.0 })], [prior({ layerNo: 1 })]).size).toBe(0);
  });
});

describe("06P Test E — blank layerNo is byte-identical to pre-batch", () => {
  it("rows without the field behave exactly as legacy rows", () => {
    const legacy = [row({ rowKey: 0 }), row({ rowKey: 1 })];
    const withNull = [row({ rowKey: 0, layerNo: null }), row({ rowKey: 1, layerNo: null })];
    expect(JSON.stringify([...findChainageOverlaps(legacy, [prior()]).entries()]))
      .toBe(JSON.stringify([...findChainageOverlaps(withNull, [prior()]).entries()]));
  });
});

const rpt = (o: Partial<ReportEntry>): ReportEntry => ({
  kind: "progress",
  entryId: o.entryId ?? 1,
  dprId: o.dprId ?? 1,
  dprDate: o.dprDate ?? "2026-08-01",
  boqItemId: 10,
  quantity: o.quantity ?? 0,
  uom: "Cum",
  ...o,
});

const item = { id: 10, itemCode: null, description: "WMM", displayName: null, itemName: null, unit: "Cum", boqQty: 1000, dprConversionFactor: null, dprMeasurementMethod: null, sortOrder: null } as any;

describe("06P Test F — credit/cumulative formula unchanged by layers", () => {
  it("2-layer item cumulative = plain sum of all entries", () => {
    const entries = [
      rpt({ entryId: 1, dprDate: "2026-08-01", quantity: 480, layerNo: 1 }),
      rpt({ entryId: 2, dprDate: "2026-08-02", quantity: 490, layerNo: 2 }),
    ];
    const computed = computeItemEntries(entries, item);
    expect(computed[computed.length - 1].runningCumulative).toBe(970);
  });
});

describe("06P Test G — layer breakdown is display-only", () => {
  it("no layers / single layer → empty breakdown (renders as today)", () => {
    expect(layerBreakdown(computeItemEntries([rpt({ entryId: 1, quantity: 100 })], item))).toEqual([]);
    expect(layerBreakdown(computeItemEntries([
      rpt({ entryId: 1, quantity: 100, layerNo: 1 }),
      rpt({ entryId: 2, quantity: 50, layerNo: 1 }),
    ], item))).toEqual([]);
  });
  it("2+ layers → split sums to existing total, sorted, null last as its own row", () => {
    const computed = computeItemEntries([
      rpt({ entryId: 1, dprDate: "2026-08-01", quantity: 480, layerNo: 1 }),
      rpt({ entryId: 2, dprDate: "2026-08-02", quantity: 490, layerNo: 2 }),
      rpt({ entryId: 3, dprDate: "2026-08-03", quantity: 30 }), // legacy, no layer
    ], item);
    const rows = layerBreakdown(computed);
    expect(rows.map((r) => r.layerNo)).toEqual([1, 2, null]);
    expect(rows.reduce((s, r) => s + r.qty, 0)).toBe(computed[computed.length - 1].runningCumulative);
  });
  it("structure rows are never grouped by layer", () => {
    const computed = computeItemEntries([
      rpt({ entryId: 1, quantity: 480, layerNo: 1 }),
      rpt({ entryId: 2, quantity: 490, layerNo: 2 }),
      { ...rpt({ entryId: 3, quantity: 10 }), kind: "structure" as const },
    ], item);
    const rows = layerBreakdown(computed);
    expect(rows.map((r) => r.layerNo)).toEqual([1, 2]);
  });
});

describe("06P §4 — display words are client-side only", () => {
  it("Embankment → Lift; everything else → Layer", () => {
    expect(layerWord("EMBANKMENT WITH APPROVED MATERIAL")).toBe("Lift");
    expect(layerWord("WMM")).toBe("Layer");
    expect(layerFieldLabel("Embankment")).toBe("Lift / Layer");
    expect(layerFieldLabel("GSB")).toBe("Layer / Lift");
    expect(layerDisplayName("WMM", 2)).toBe("Layer 2");
    expect(layerDisplayName("Embankment", 1)).toBe("Lift 1");
  });
});

describe("06P Tests I/J — schema surface", () => {
  it("progress_entries gained exactly one new column: layerNo (integer, nullable)", () => {
    const cols = getTableColumns(progressEntries);
    expect(cols.layerNo).toBeDefined();
    expect((cols.layerNo as any).notNull).toBe(false);
    expect((cols.layerNo as any).hasDefault).toBe(false);
    expect((cols as any).layerLabel).toBeUndefined();
  });
  it("dpr_structure_items untouched — no layer column of any kind", () => {
    const cols = getTableColumns(dprStructureItems);
    expect(Object.keys(cols).filter((k) => k.toLowerCase().includes("layer"))).toEqual([]);
  });
  it("no layerLabel / layer free-text anywhere in schema.ts", () => {
    const src = readFileSync("shared/schema.ts", "utf8");
    expect(src).not.toMatch(/layerLabel|layer_label/);
    expect((src.match(/layer_no/g) ?? []).length).toBe(1); // only progress_entries
  });
});
