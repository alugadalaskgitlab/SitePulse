import { describe, expect, it } from "vitest";
import {
  boqProgressQty,
  dprMeasurementSummary,
  resolveDprUnitConversion,
} from "../shared/dprGeometry";
import {
  computeItemAbstract,
  computeItemEntries,
  entryBoqCredit,
  entryConversionResolution,
  type ReportBoqItem,
  type ReportEntry,
} from "../shared/progressReport";
import { canonicalizeUnit } from "../shared/boqNormalise";

const item = (over: Partial<ReportBoqItem>): ReportBoqItem => ({
  id: 1, description: "Work", unit: "Sqm", boqQty: 10000, ...over,
});
const row = (over: Partial<ReportEntry>): ReportEntry => ({
  kind: "progress", entryId: 1, dprId: 1, dprDate: "2026-01-01",
  boqItemId: 1, quantity: 2400, uom: "SQM", ...over,
});

describe("task1479 authoritative BOQ progress units", () => {
  it.each([
    ["m³", "Cum"],
    ["m²", "Sqm"],
    ["m", "Rmt"],
  ])("canonicalises the actual structure UI option %s", (raw, canonical) => {
    expect(canonicalizeUnit(raw)).toBe(canonical);
  });

  it.each([
    ["m³", "Cum", 12, "CUM"],
    ["m²", "Sqm", 12, "SQM"],
    ["m", "Rmt", 12, "RMT"],
  ])("credits and summarizes structure quantity in UI unit %s", (source, canonicalTarget, quantity, displayUnit) => {
    const boq = item({ unit: source });
    const structure = row({ kind: "structure", uom: source, quantity });
    expect(entryBoqCredit(structure, boq)).toBe(quantity);
    const summary = dprMeasurementSummary(structure, boq);
    expect(summary.conversionValid).toBe(true);
    expect(summary.factor).toBe(1);
    expect(summary.measuredQty).toBe(quantity);
    expect(summary.measuredUom).toBe(displayUnit);
    expect(summary.boqQty).toBe(quantity);
    expect(summary.boqUom).toBe(canonicalTarget);
  });

  it("ignores stale .0001 for same-unit Sqm and emits an explicit warning", () => {
    const boq = item({ unit: "Sqm", dprConversionFactor: 0.0001 });
    const resolution = entryConversionResolution(row({ length: 1600, width: 1.5 }), boq);
    expect(resolution).toMatchObject({ sourceUom: "Sqm", targetUom: "Sqm", factor: 1, mode: "identity", valid: true });
    expect(resolution.warnings.join(" ")).toMatch(/Ignored stale conversion factor 0\.0001/);
    expect(entryBoqCredit(row({ length: 1600, width: 1.5 }), boq)).toBe(2400);
  });

  it("totals two 2400 Sqm rows without rounding and values at the contractual rate", () => {
    const boq = item({ unit: "SQ.M", dprConversionFactor: 0.0001, boqQty: 10000 });
    const computed = computeItemEntries([
      row({ entryId: 1, dprId: 1, length: 1600, width: 1.5 }),
      row({ entryId: 2, dprId: 2, length: 1600, width: 1.5 }),
    ], boq);
    const abstract = computeItemAbstract(computed, boq, "2026-01-01", "2026-01-31");
    expect(abstract.cumulativeQty).toBe(4800);
    expect(abstract.cumulativeQty * 4.04).toBe(19392);
  });

  it("converts genuine SQM→Ha exactly once even with method null", () => {
    const boq = item({ unit: "Hectare", dprConversionFactor: 0.0001, boqQty: 12 });
    expect(entryBoqCredit(row({ length: 1600, width: 1.5 }), boq)).toBeCloseTo(0.24, 12);
    expect(entryConversionResolution(row({ length: 1600, width: 1.5 }), boq).mode).toBe("dimensional");
  });

  it("supports reverse Ha→Sqm for physical non-geometry evidence", () => {
    const resolution = resolveDprUnitConversion({ kind: "structure", uom: "ha" }, { unit: "m2" });
    expect(resolution).toMatchObject({ sourceUom: "Ha", targetUom: "Sqm", factor: 10000, mode: "dimensional" });
  });

  it.each([
    ["square metre", "SQ.M", 1],
    ["m2", "Sqm", 1],
    ["CFT", "m3", 1 / 35.3146667215],
    ["KM", "running metre", 1000],
    ["KG", "tonne", 0.001],
    ["KL", "litre", 1000],
  ])("normalises/converts %s → %s", (source, target, factor) => {
    expect(resolveDprUnitConversion({ uom: source }, { unit: target }).factor).toBeCloseTo(factor, 10);
  });

  it("requires an explicit custom profile factor for CUM→MT", () => {
    const unresolved = resolveDprUnitConversion(
      { uom: "CUM", length: 10, width: 2, thickness: 1 },
      { unit: "MT", dprMeasurementMethod: "CUM_LWT" },
    );
    expect(unresolved).toMatchObject({ valid: false, factor: null, mode: "unresolved" });
    expect(unresolved.warnings.join(" ")).toMatch(/explicit Cum→MT conversion profile factor/);

    const custom = resolveDprUnitConversion(
      { uom: "CUM", length: 10, width: 2, thickness: 1 },
      { unit: "MT", dprMeasurementMethod: "CUM_LWT", dprConversionFactor: 2.35 },
    );
    expect(custom).toMatchObject({ valid: true, factor: 2.35, mode: "custom" });
  });

  it("does not fabricate credit for missing or invalid custom factors", () => {
    const boq = item({ unit: "MT", dprMeasurementMethod: "CUM_LWT", dprConversionFactor: 0 });
    const progress = row({ quantity: 20, uom: "CUM", length: 10, width: 2, thickness: 1 });
    expect(entryBoqCredit(progress, boq)).toBeNull();
    const computed = computeItemEntries([progress], boq)[0];
    expect(computed.reviewFlag).toMatch(/Review UOM/);
    expect(computed.runningCumulative).toBe(0);
  });

  it("honours a valid structure row custom override over the item factor", () => {
    const boq = item({ unit: "MT", dprMeasurementMethod: "CUM_LWT", dprConversionFactor: 2 });
    const structure = row({ kind: "structure", uom: "CUM", quantity: 10, rowConversionFactor: 2.4 });
    expect(entryBoqCredit(structure, boq)).toBe(24);
  });

  it("uses a structure row's explicit CFT source for known CFT→Cum conversion", () => {
    const boq = item({ unit: "Cum", dprConversionFactor: null });
    const structure = row({ kind: "structure", uom: "CFT", quantity: 35.3146667215 });
    expect(entryBoqCredit(structure, boq)).toBeCloseTo(1, 10);
  });

  it("measurement summary labels manual structure evidence with its resolved CFT source", () => {
    const summary = dprMeasurementSummary(
      { kind: "structure", uom: "CFT", quantity: 35.3146667215, quantitySource: "measured" },
      { unit: "Cum" },
    );
    expect(summary.measuredUom).toBe("CFT");
    expect(summary.boqUom).toBe("Cum");
    expect(summary.boqQty).toBeCloseTo(1, 10);
  });

  it("measurement summary honours a structure row conversion override", () => {
    const summary = dprMeasurementSummary(
      { kind: "structure", uom: "CUM", quantity: 10, rowConversionFactor: 2.4 },
      { unit: "MT", dprMeasurementMethod: "CUM_LWT", dprConversionFactor: 2 },
    );
    expect(summary.measuredUom).toBe("CUM");
    expect(summary.factor).toBe(2.4);
    expect(summary.boqQty).toBe(24);
  });

  it("rejects an arbitrary item-level Nos→MT multiplier without conversion provenance", () => {
    const resolution = resolveDprUnitConversion(
      { uom: "Nos", quantitySource: "measured" },
      { unit: "MT", dprConversionFactor: 2 },
    );
    expect(resolution).toMatchObject({ valid: false, factor: null, mode: "unresolved" });
  });

  it.each(["RMT", "Nos", "LS"])("keeps same-unit %s identity", (unit) => {
    const resolution = resolveDprUnitConversion({ uom: unit }, { unit, dprConversionFactor: 0.25 });
    expect(resolution.factor).toBe(1);
    expect(resolution.warnings).toHaveLength(1);
  });

  it("preserves physical evidence and flags a legacy UOM override as uncertain", () => {
    const physical = { quantity: 2400, uom: "Ha", length: 1600, width: 1.5 };
    const boq = { unit: "Ha", dprMeasurementMethod: "SQM_LW", dprConversionFactor: 0.0001 };
    const summary = dprMeasurementSummary(physical, boq);
    expect(summary.measuredQty).toBe(2400);
    expect(summary.measuredUom).toBe("SQM");
    expect(summary.boqQty).toBeCloseTo(0.24, 12);
    expect(summary.warnings.join(" ")).toMatch(/override is uncertain/);
  });

  it("does not reinterpret unknown conflicting legacy geometry/UOM evidence", () => {
    const resolution = resolveDprUnitConversion(
      { uom: "Ha", length: 1600, width: 1.5 },
      { unit: "Sqm", dprConversionFactor: 0.0001 },
    );
    expect(resolution).toMatchObject({ valid: false, factor: null, mode: "unresolved" });
    expect(resolution.warnings.join(" ")).toMatch(/legacy UOM and geometry evidence conflict/i);
  });

  it("flags the old UOM override note even when a manual source would skip geometry review", () => {
    const boq = item({ unit: "Sqm", dprConversionFactor: 0.0001 });
    const legacy = row({
      length: 1600,
      width: 1.5,
      quantitySource: "measured",
      quantitySourceNote: "UOM override Ha -> SQM (x0.0001): administrator correction",
    });
    const resolution = entryConversionResolution(legacy, boq);
    expect(resolution).toMatchObject({ valid: false, factor: null, mode: "unresolved" });
    expect(resolution.warnings.join(" ")).toMatch(/may already have been transformed/);
    const computed = computeItemEntries([legacy], boq)[0];
    expect(computed.boqCreditQty).toBeNull();
    expect(computed.reviewFlag).toMatch(/Review UOM/);
  });

  it("does not misclassify the new physical input normalization provenance", () => {
    const resolution = resolveDprUnitConversion(
      {
        uom: "Sqm",
        quantitySource: "measured",
        quantitySourceNote: "Physical input normalization Ha -> Sqm (x10000): surveyed in hectares",
      },
      { unit: "Sqm", dprConversionFactor: 0.0001 },
    );
    expect(resolution).toMatchObject({ valid: true, factor: 1, mode: "identity" });
  });

  it("warns for invalid configured factors even when identity or known dimensions resolve", () => {
    const identity = resolveDprUnitConversion({ uom: "Sqm" }, { unit: "Sqm", dprConversionFactor: 0 });
    expect(identity).toMatchObject({ valid: true, factor: 1, mode: "identity" });
    expect(identity.warnings.join(" ")).toMatch(/Invalid item conversion factor 0/);

    const dimensional = resolveDprUnitConversion({ uom: "Sqm" }, { unit: "Ha", dprConversionFactor: -1 });
    expect(dimensional).toMatchObject({ valid: true, factor: 0.0001, mode: "dimensional" });
    expect(dimensional.warnings.join(" ")).toMatch(/Invalid item conversion factor -1/);
  });

  it("does not fall back to an item factor when a custom row override is invalid", () => {
    const resolution = resolveDprUnitConversion(
      { uom: "CUM", length: 10, width: 2, thickness: 1 },
      { unit: "MT", dprMeasurementMethod: "CUM_LWT", dprConversionFactor: 2.35 },
      0,
    );
    expect(resolution).toMatchObject({ valid: false, factor: null, mode: "unresolved" });
    expect(resolution.warnings.join(" ")).toMatch(/Invalid row conversion factor 0/);
  });

  it("keeps the factor-only compatibility API while row-aware callers are authoritative", () => {
    expect(boqProgressQty(2400, { dprConversionFactor: 0.0001 })).toBeCloseTo(0.24);
    expect(boqProgressQty(2400, { unit: "Sqm", dprConversionFactor: 0.0001 }, { uom: "SQM" })).toBe(2400);
  });
});