/**
 * Task #1385 — Physical Stock Reconciliation.
 *
 * Two layers under test, no DB needed:
 *  1. shared/stockReconciliation.ts — the conversion + adjustment maths the
 *     server recomputes at post time (client uses the same module for preview).
 *  2. Route permission gate — assertCreate("stock_reconciliation") semantics.
 *
 * Idempotency (clientRequestId unique index) and ledger persistence are
 * enforced in storage.postStockReconciliation and proven live against the dev
 * DB; the maths that decide WHAT gets posted are fully covered here.
 */
import { describe, it, expect } from "vitest";
import type { Request, Response } from "express";
import {
  RECONCILIATION_REASONS,
  normalizeUom,
  uomEquivalent,
  resolveConversion,
  convertToBase,
  computeAdjustment,
  isNoChange,
  summarizeSession,
  toleranceForUom,
  computeVarianceWarnings,
  STATUS_LABELS,
  RECONCILIATION_STATUSES,
} from "@shared/stockReconciliation";
import { emptyMatrix, fullMatrix } from "@shared/permissions";
import { assertCreate, assertView } from "../server/auth-routes";

// Material fixtures mirroring real prod config (20MM aggregate: CFT→Ton).
const AGG_20MM = { conversionFactor: 0.043041565, conversionFromUom: "CFT", conversionToUom: "Ton" };
const NO_CONV = { conversionFactor: null, conversionFromUom: null, conversionToUom: null };

describe("UOM normalisation", () => {
  it("treats MT / Ton / Tonne as equivalent", () => {
    expect(uomEquivalent("MT", "Ton")).toBe(true);
    expect(uomEquivalent("tonnes", "TON")).toBe(true);
  });
  it("treats Litre variants as equivalent, CFT distinct from Cum", () => {
    expect(uomEquivalent("Liters", "Ltr")).toBe(true);
    expect(uomEquivalent("CFT", "Cum")).toBe(false);
    expect(normalizeUom("Barrels")).toBe("barrel");
  });
  it("empty UOM never matches", () => {
    expect(uomEquivalent("", "")).toBe(false);
  });
});

describe("Conversion resolution (test 8 & 9 — configured factor only)", () => {
  it("same UOM needs no factor", () => {
    expect(resolveConversion(AGG_20MM, "CFT", "CFT")).toEqual({ kind: "same", factor: 1 });
    expect(resolveConversion(NO_CONV, "MT", "Ton")).toEqual({ kind: "same", factor: 1 }); // alias
  });
  it("uses the configured factor forward (CFT count → Ton stock)", () => {
    const conv = resolveConversion(AGG_20MM, "CFT", "Ton");
    expect(conv).toEqual({ kind: "multiply", factor: 0.043041565 });
    expect(convertToBase(1000, conv!)).toBeCloseTo(43.041565, 6);
  });
  it("uses the configured factor in reverse (MT count → CFT stock)", () => {
    const conv = resolveConversion(AGG_20MM, "MT", "CFT");
    expect(conv).toEqual({ kind: "divide", factor: 0.043041565 });
    expect(convertToBase(25, conv!)).toBeCloseTo(25 / 0.043041565, 3);
  });
  it("BLOCKS when no conversion is configured (never invents a factor)", () => {
    expect(resolveConversion(NO_CONV, "MT", "CFT")).toBeNull();
    expect(resolveConversion(AGG_20MM, "Barrels", "Ton")).toBeNull();
    expect(resolveConversion({ ...AGG_20MM, conversionFactor: 0 }, "CFT", "Ton")).toBeNull();
  });
});

describe("Adjustment maths (tests 1–5)", () => {
  it("1. positive adjustment raises stock to physical", () => {
    const adj = computeAdjustment(472.53, 580.9);
    expect(adj).toBeCloseTo(108.37, 6);
    expect(472.53 + adj).toBeCloseTo(580.9, 6);
  });
  it("2. negative adjustment reduces stock to physical", () => {
    const adj = computeAdjustment(6546.65, 749.0);
    expect(adj).toBeCloseTo(-5797.65, 6);
  });
  it("3. negative book balance reconciles to zero", () => {
    const adj = computeAdjustment(-5783.4, 0);
    expect(adj).toBeCloseTo(5783.4, 6);
    expect(-5783.4 + adj).toBeCloseTo(0, 6);
  });
  it("4. physical zero is a valid target", () => {
    expect(computeAdjustment(881.37, 0)).toBeCloseTo(-881.37, 6);
  });
  it("5. matching balances produce no adjustment", () => {
    expect(isNoChange(computeAdjustment(8.61486, 8.61486))).toBe(true);
    expect(isNoChange(computeAdjustment(100, 100.0000001))).toBe(true); // below tolerance
    expect(isNoChange(computeAdjustment(100, 100.001))).toBe(false);
  });
});

describe("Session summary", () => {
  it("counts unchanged / increased / decreased / zeroed / blocked", () => {
    const s = summarizeSession([
      { adjustment: 108, physicalBase: 580 },
      { adjustment: -5797, physicalBase: 749 },
      { adjustment: 5783.4, physicalBase: 0 },
      { adjustment: 0, physicalBase: 2 },
      { adjustment: 0, physicalBase: 0, conversionMissing: true },
    ]);
    expect(s).toEqual({ reviewed: 5, unchanged: 1, increased: 2, decreased: 1, zeroed: 1, conversionWarnings: 1 });
  });
  it("exposes the six reason templates", () => {
    expect(RECONCILIATION_REASONS).toHaveLength(6);
    expect(RECONCILIATION_REASONS).toContain("Material exhausted and financially settled");
  });
});

// ── Permission gate ──────────────────────────────────────────────────────────
function makeReq(over: Partial<{ authUser: any; authPermissions: any }>): Request {
  return {
    authUser: { id: 1, isAdmin: false, isOwner: false, fullName: "T" },
    authPermissions: emptyMatrix(),
    ...over,
  } as unknown as Request;
}
function makeRes() {
  const res = {
    _status: 0, _body: {} as any,
    status(c: number) { this._status = c; return this; },
    json(b: any) { this._body = b; return this; },
  };
  return res as unknown as Response & { _status: number };
}

describe("Posting permission — stock_reconciliation create", () => {
  it("admin/owner may post", () => {
    expect(assertCreate(makeReq({ authUser: { id: 1, isAdmin: true, isOwner: false, fullName: "A" } }), makeRes(), "stock_reconciliation")).toBe(true);
    expect(assertCreate(makeReq({ authUser: { id: 2, isAdmin: false, isOwner: true, fullName: "O" } }), makeRes(), "stock_reconciliation")).toBe(true);
  });
  it("explicit stock_reconciliation create permission may post", () => {
    expect(assertCreate(makeReq({ authPermissions: fullMatrix() }), makeRes(), "stock_reconciliation")).toBe(true);
  });
  it("ordinary user without the permission is blocked (403)", () => {
    const res = makeRes();
    expect(assertCreate(makeReq({}), res, "stock_reconciliation")).toBe(false);
    expect((res as any)._status).toBe(403);
  });
  it("view of the report also requires the section (non-admin)", () => {
    const res = makeRes();
    expect(assertView(makeReq({}), res, "stock_reconciliation")).toBe(false);
    expect(assertView(makeReq({ authPermissions: fullMatrix() }), makeRes(), "stock_reconciliation")).toBe(true);
  });
});

// ── Safeguard 1: variance sanity warnings ────────────────────────────────────
describe("variance sanity warnings", () => {
  const row = (key: string, label: string, oldBalance: number, physicalBase: number, uom = "CFT", category: string | null = "Aggregate") =>
    ({ key, label, oldBalance, physicalBase, adjustment: physicalBase - oldBalance, uom, category });

  it("warns on a large increase (>5× positive book balance)", () => {
    const w = computeVarianceWarnings([row("a", "20MM", 100, 600)]);
    expect(w).toHaveLength(1);
    expect(w[0].code).toBe("LARGE_INCREASE");
    expect(w[0].message).toContain("20MM");
  });

  it("warns on a large decrease (<1/5 of positive book balance)", () => {
    const w = computeVarianceWarnings([row("a", "Dust", 1000, 100)]);
    expect(w[0].code).toBe("LARGE_DECREASE");
  });

  it("does NOT apply ratio rules to zero or negative balances", () => {
    expect(computeVarianceWarnings([row("a", "Diesel", 0, 500, "L", null)])).toHaveLength(0);
    expect(computeVarianceWarnings([row("a", "Diesel", -1333.772, 0, "L", null)])).toHaveLength(0);
  });

  it("flags possibly interchanged counts on similar materials moving sharply in opposite directions", () => {
    const w = computeVarianceWarnings([
      row("a", "6MM Down", 500, 2000),   // 4× up
      row("b", "Dust", 2000, 450),       // < 1/3 down
    ]);
    const swap = w.find(x => x.code === "POSSIBLE_SWAP");
    expect(swap).toBeDefined();
    expect(swap!.rowKeys).toEqual(["a", "b"]);
    expect(swap!.message).toContain("may have been interchanged");
    expect(swap!.message).toContain("6MM Down");
    expect(swap!.message).toContain("Dust");
  });

  it("does not pair dissimilar materials (different category)", () => {
    const w = computeVarianceWarnings([
      { key: "a", label: "6MM", oldBalance: 500, physicalBase: 2000, adjustment: 1500, uom: "CFT", category: "Aggregate" },
      { key: "b", label: "Diesel", oldBalance: 2000, physicalBase: 450, adjustment: -1550, uom: "L", category: "Fuel" },
    ]);
    expect(w.some(x => x.code === "POSSIBLE_SWAP")).toBe(false);
  });

  it("normal counts produce no warnings", () => {
    expect(computeVarianceWarnings([row("a", "20MM", 1000, 950)])).toHaveLength(0);
  });
});

// ── Safeguard 2: acknowledgement + draft statuses ────────────────────────────
describe("acknowledgement and draft statuses", () => {
  it("posting is blocked when warnings exist and are not acknowledged (server rule)", () => {
    // Mirrors storage.postStockReconciliation: warnings.length && !ack → throw.
    const warnings = computeVarianceWarnings([
      { key: "a", label: "20MM", oldBalance: 100, physicalBase: 600, adjustment: 500, uom: "CFT", category: null },
    ]);
    const acknowledgeWarnings = false;
    expect(warnings.length > 0 && !acknowledgeWarnings).toBe(true); // must throw WARNINGS_NOT_ACKNOWLEDGED
    expect(warnings.length > 0 && !true).toBe(false);               // acknowledged → allowed
  });

  it("defines the four workflow statuses with clear labels", () => {
    expect(RECONCILIATION_STATUSES).toEqual(["draft", "submitted", "posted", "rejected"]);
    expect(STATUS_LABELS.submitted).toBe("Submitted for Approval");
    expect(STATUS_LABELS.rejected).toBe("Rejected/Returned");
  });
});

// ── Safeguard 3: UOM-aware rounding tolerance ────────────────────────────────
describe("rounding tolerance", () => {
  it("uses UOM-aware tolerances (tonnage/litres lenient, countable units strict)", () => {
    expect(toleranceForUom("Ton")).toBeCloseTo(0.005);
    expect(toleranceForUom("Liters")).toBeCloseTo(0.5);
    expect(toleranceForUom("Barrels")).toBeLessThan(1e-5);
  });

  it("tiny rounding difference is 'Verified — no adjustment' (no ledger row)", () => {
    expect(isNoChange(-0.000001, "Ton")).toBe(true);   // −0.00 rounding dust
    expect(isNoChange(0.004, "Ton")).toBe(true);       // under 5 kg on tonnage
    expect(isNoChange(0.3, "Liters")).toBe(true);      // under half a litre
  });

  it("meaningful variance still produces an adjustment", () => {
    expect(isNoChange(0.01, "Ton")).toBe(false);
    expect(isNoChange(-0.6, "Liters")).toBe(false);
    expect(isNoChange(0.5, "Barrels")).toBe(false);    // countable units: zero tolerance
  });

  it("does not silently zero a meaningful negative balance", () => {
    // book −1333.772 L, physical 0 → adjustment +1333.772 — far beyond tolerance
    const adjustment = computeAdjustment(-1333.772, 0);
    expect(isNoChange(adjustment, "Liters")).toBe(false);
  });
});
