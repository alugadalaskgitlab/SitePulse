/**
 * Batch 06V — Incidental Progress Tests.
 *
 * Tests A/B/E/F/G/H/I/P/Q/S for the incidental progress tracking feature
 * covering:
 *  A — isIncidental default false, field presence in schema types
 *  B — entryBoqCredit returns numeric 0 for incidental (not null)
 *  E — incidental entries excluded from detectOverlaps
 *  F — normal entries still overlap with each other when incidental present
 *  G — isChainageGuardRow returns false for incidental candidate rows
 *  H — incidental priors excluded from findChainageOverlaps prior-DPR check
 *  I — incidental candidate excluded from same-DPR overlap check
 *  P — incidental rows do not contribute to running cumulative
 *  Q — incidental rows preserved in computeItemEntries (quantity still there)
 *  S — buildCoverageStrips: incidental spans appear as "incidental" state,
 *      not counted toward overlap depth; recorded wins over incidental where
 *      they coincide; incidental-only sub-range appears as "incidental"
 */

import { describe, it, expect } from "vitest";
import {
  type ReportEntry, type ReportBoqItem,
  entryBoqCredit, entryConversionFactor,
  computeItemEntries, detectOverlaps, buildCoverageStrips,
} from "../shared/progressReport";
import {
  isChainageGuardRow, findChainageOverlaps,
  type CandidateChainageRow, type PriorChainageEntry,
} from "../shared/chainageOverlap";
import { parseDprError } from "@/lib/dprErrors";
import { classifyReason, buildReason, OVERLAP_REASON_OPTIONS, OTHER_VALUE } from "@/lib/overlapReason";

// ── Fixtures ─────────────────────────────────────────────────────────────────

const wmm: ReportBoqItem = {
  id: 1, description: "WMM", unit: "Cum", boqQty: 5000,
  dprConversionFactor: null, dprMeasurementMethod: "CUM_LWT",
};

let _id = 1000;
function re(over: Partial<ReportEntry>): ReportEntry {
  return {
    kind: "progress",
    entryId: _id++,
    dprId: over.dprId ?? 10,
    dprDate: "2026-08-01",
    boqItemId: 1,
    quantity: 100,
    uom: "Cum",
    chainageFromKm: 2.0,
    chainageToKm: 2.5,
    side: "RHS",
    isIncidental: false,
    incidentalDescription: null,
    ...over,
  } as ReportEntry;
}

const row = (o: Partial<CandidateChainageRow> & { rowKey: string | number }): CandidateChainageRow => ({
  boqItemId: 1, side: "RHS", fromKm: 2.0, toKm: 2.2, ...o,
});
const prior = (o: Partial<PriorChainageEntry>): PriorChainageEntry => ({
  entryId: 900, dprId: 123, dprDate: "2026-08-08", boqItemId: 1,
  side: "RHS", fromKm: 2.15, toKm: 2.18, quantity: 35, uom: "Cum", ...o,
});

// ── A: isIncidental is a valid field with default false ──────────────────────

describe("A: isIncidental field presence and defaults", () => {
  it("ReportEntry accepts isIncidental/incidentalDescription fields", () => {
    const e = re({ isIncidental: true, incidentalDescription: "EMERGENCY REPAIR" });
    expect(e.isIncidental).toBe(true);
    expect(e.incidentalDescription).toBe("EMERGENCY REPAIR");
  });

  it("No Site Work activity and description survive schema validation and reload serialization", async () => {
    const { insertProgressSchema } = await import("../shared/schema");
    const saved = insertProgressSchema.parse({
      activity: "MACHINERY SHIFTING",
      noSiteWork: true,
      noSiteWorkDescription: "ACCESS BLOCKED BY FLOODING",
    });
    const reloaded = JSON.parse(JSON.stringify(saved));
    expect(reloaded.activity).toBe("MACHINERY SHIFTING");
    expect(reloaded.noSiteWork).toBe(true);
    expect(reloaded.noSiteWorkDescription).toBe("ACCESS BLOCKED BY FLOODING");
  });
  it("default isIncidental is false when not specified", () => {
    const e = re({});
    expect(e.isIncidental).toBe(false);
  });
  it("null isIncidental is treated as non-incidental", () => {
    const e = re({ isIncidental: null as any });
    // entryBoqCredit: null isIncidental is falsy — should NOT return 0
    expect(entryBoqCredit(e, wmm)).toBe(100); // factor 1, qty 100
  });
});

// ── B: entryBoqCredit returns numeric 0 for incidental ──────────────────────

describe("B: entryBoqCredit returns 0 for incidental entries", () => {
  it("incidental entry with quantity 100 → BOQ credit 0", () => {
    const e = re({ isIncidental: true, quantity: 100 });
    expect(entryBoqCredit(e, wmm)).toBe(0);
  });
  it("incidental entry credit is numeric 0, not null (quantity is preserved)", () => {
    const e = re({ isIncidental: true, quantity: 50 });
    const credit = entryBoqCredit(e, wmm);
    expect(credit).toBe(0);
    expect(typeof credit).toBe("number");
  });
  it("normal entry still earns full credit", () => {
    const e = re({ isIncidental: false, quantity: 100 });
    expect(entryBoqCredit(e, wmm)).toBe(100);
  });
  it("incidental with null quantity still has explicit zero credit", () => {
    const e = re({ isIncidental: true, quantity: null });
    expect(entryBoqCredit(e, wmm)).toBe(0);
  });
  it("No Site Work has zero credit even if a legacy row retained a quantity", () => {
    expect(entryBoqCredit(re({ noSiteWork: true, quantity: 100 }), wmm)).toBe(0);
  });
  it("conversion factor still applies to non-incidental rows", () => {
    const item: ReportBoqItem = { ...wmm, dprConversionFactor: 0.5 };
    const e = re({ isIncidental: false, quantity: 100 });
    expect(entryBoqCredit(e, item)).toBe(50);
  });
});

// ── E: incidental entries excluded from detectOverlaps ──────────────────────

describe("E: detectOverlaps excludes incidental entries", () => {
  it("incidental entry does not register an overlap with a normal entry at same chainage", () => {
    const normal = re({ entryId: 1, isIncidental: false, chainageFromKm: 2.0, chainageToKm: 2.5 });
    const incidental = re({ entryId: 2, isIncidental: true, chainageFromKm: 2.2, chainageToKm: 2.4 });
    const m = detectOverlaps([normal, incidental]);
    expect(m.size).toBe(0);
  });
  it("incidental vs incidental: no overlap warning either", () => {
    const a = re({ entryId: 3, isIncidental: true, chainageFromKm: 2.0, chainageToKm: 2.5 });
    const b = re({ entryId: 4, isIncidental: true, chainageFromKm: 2.2, chainageToKm: 2.4 });
    expect(detectOverlaps([a, b]).size).toBe(0);
  });
});

// ── F: normal entries still overlap with each other ─────────────────────────

describe("F: normal overlap detection still works when incidental entries present", () => {
  it("two normal entries that overlap still get flagged even with an incidental nearby", () => {
    const n1 = re({ entryId: 5, isIncidental: false, chainageFromKm: 2.0, chainageToKm: 2.5 });
    const n2 = re({ entryId: 6, isIncidental: false, chainageFromKm: 2.3, chainageToKm: 2.8, dprId: 11 });
    const inc = re({ entryId: 7, isIncidental: true, chainageFromKm: 2.1, chainageToKm: 2.9 });
    const m = detectOverlaps([n1, n2, inc]);
    expect(m.get(`progress:5`)).toHaveLength(1);
    expect(m.get(`progress:6`)).toHaveLength(1);
    expect(m.has(`progress:7`)).toBe(false);
  });
});

// ── G: isChainageGuardRow returns false for incidental rows ─────────────────

describe("G: isChainageGuardRow scope for incidental candidate rows", () => {
  it("incidental candidate row is not in scope", () => {
    const r = row({ rowKey: 0, isIncidental: true });
    expect(isChainageGuardRow(r)).toBe(false);
  });
  it("normal candidate row with valid chainage is in scope", () => {
    const r = row({ rowKey: 0 });
    expect(isChainageGuardRow(r)).toBe(true);
  });
  it("incidental overrides even if chainage and boqItemId are valid", () => {
    const r = row({ rowKey: 0, boqItemId: 1, fromKm: 2.0, toKm: 2.2, isIncidental: true });
    expect(isChainageGuardRow(r)).toBe(false);
  });
});

// ── H: incidental priors excluded from prior-DPR check ──────────────────────

describe("H: incidental prior entries are excluded from prior-DPR overlap guard", () => {
  it("incidental prior does not create a hit for a normal candidate", () => {
    const candidate = row({ rowKey: 0, fromKm: 2.15, toKm: 2.18 });
    const incidentalPrior = prior({ isIncidental: true });
    const hits = findChainageOverlaps([candidate], [incidentalPrior]);
    expect(hits.size).toBe(0);
  });
  it("normal prior still creates a hit for the same normal candidate", () => {
    const candidate = row({ rowKey: 0, fromKm: 2.15, toKm: 2.18 });
    const normalPrior = prior({ isIncidental: false });
    const hits = findChainageOverlaps([candidate], [normalPrior]);
    expect(hits.get(0)).toHaveLength(1);
    expect(hits.get(0)![0].source).toBe("prior_dpr");
  });
  it("undefined isIncidental on prior defaults to inclusion (not excluded)", () => {
    // A prior without isIncidental field should not be excluded
    const candidate = row({ rowKey: 0, fromKm: 2.15, toKm: 2.18 });
    const legacyPrior = prior({}); // no isIncidental field
    const hits = findChainageOverlaps([candidate], [legacyPrior]);
    expect(hits.get(0)).toHaveLength(1);
  });
});

// ── I: incidental candidate excluded from same-DPR overlap ─────────────────

describe("I: incidental candidate rows excluded from same-DPR overlap check", () => {
  it("incidental candidate and normal candidate at same chainage → no hit", () => {
    const normal = row({ rowKey: 0 });
    const incidental = row({ rowKey: 1, isIncidental: true });
    const hits = findChainageOverlaps([normal, incidental], []);
    expect(hits.size).toBe(0);
  });
  it("two normal candidates at same chainage still hit each other", () => {
    const a = row({ rowKey: 0 });
    const b = row({ rowKey: 1 });
    const hits = findChainageOverlaps([a, b], []);
    expect(hits.get(0)).toHaveLength(1);
    expect(hits.get(1)).toHaveLength(1);
  });
});

// ── P: incidental rows do not contribute to running cumulative ───────────────

describe("P: running cumulative unaffected by incidental entries", () => {
  it("incidental row with quantity 200 contributes 0 to the running cumulative", () => {
    const normal = re({ dprDate: "2026-08-01", quantity: 100, dprId: 1, isIncidental: false });
    const incidental = re({ dprDate: "2026-08-02", quantity: 200, dprId: 2, isIncidental: true });
    const computed = computeItemEntries([normal, incidental], wmm);
    // chron order: normal (Aug 01), incidental (Aug 02)
    expect(computed[0].runningCumulative).toBe(100);
    expect(computed[1].runningCumulative).toBe(100); // incidental adds 0
  });
  it("normal entries after an incidental still accumulate correctly", () => {
    const inc = re({ dprDate: "2026-08-01", quantity: 500, dprId: 1, isIncidental: true });
    const n1 = re({ dprDate: "2026-08-02", quantity: 50, dprId: 2, isIncidental: false });
    const n2 = re({ dprDate: "2026-08-03", quantity: 30, dprId: 3, isIncidental: false });
    const computed = computeItemEntries([inc, n1, n2], wmm);
    const cums = computed.map((e) => e.runningCumulative);
    // Inc: 0, n1: 50, n2: 80
    expect(cums).toEqual([0, 50, 80]);
  });
});

// ── Q: incidental rows preserved in output (quantity visible) ────────────────

describe("Q: incidental rows preserved in computeItemEntries output", () => {
  it("incidental entry appears in output with its physical quantity intact", () => {
    const inc = re({ dprDate: "2026-08-01", quantity: 150, dprId: 1, isIncidental: true,
                     incidentalDescription: "EMERGENCY PATCH" });
    const computed = computeItemEntries([inc], wmm);
    expect(computed).toHaveLength(1);
    expect(computed[0].quantity).toBe(150);
    expect(computed[0].boqCreditQty).toBe(0);
    expect(computed[0].isIncidental).toBe(true);
    expect(computed[0].incidentalDescription).toBe("EMERGENCY PATCH");
  });
});

// ── S: buildCoverageStrips — incidental state ────────────────────────────────

describe("S: buildCoverageStrips incidental state handling", () => {
  it("incidental-only span appears as 'incidental' state", () => {
    const inc = re({ isIncidental: true, chainageFromKm: 2.0, chainageToKm: 2.5, side: "RHS" });
    const strips = buildCoverageStrips([inc]);
    const rhs = strips.find((s) => s.label === "RHS");
    expect(rhs).toBeDefined();
    expect(rhs!.segments).toHaveLength(1);
    expect(rhs!.segments[0].state).toBe("incidental");
  });

  it("normal recorded span stays 'recorded'; incidental at different sub-range appears 'incidental'", () => {
    // Normal: 2.0–2.3; Incidental: 2.5–2.8 — separate, no overlap
    const normal = re({ isIncidental: false, chainageFromKm: 2.0, chainageToKm: 2.3, side: "RHS" });
    const inc = re({ isIncidental: true, chainageFromKm: 2.5, chainageToKm: 2.8, side: "RHS" });
    const strips = buildCoverageStrips([normal, inc]);
    const rhs = strips.find((s) => s.label === "RHS");
    expect(rhs).toBeDefined();
    const states = rhs!.segments.map((s) => s.state);
    expect(states).toContain("recorded");
    expect(states).toContain("incidental");
    // The recorded segment should be 2.0–2.3, incidental 2.5–2.8 (no overlap)
    const rec = rhs!.segments.find((s) => s.state === "recorded");
    const incSeg = rhs!.segments.find((s) => s.state === "incidental");
    expect(rec!.fromKm).toBeCloseTo(2.0, 6);
    expect(rec!.toKm).toBeCloseTo(2.3, 6);
    expect(incSeg!.fromKm).toBeCloseTo(2.5, 6);
    expect(incSeg!.toKm).toBeCloseTo(2.8, 6);
  });

  it("where normal and incidental overlap, recorded state wins; incidental only visible outside normal span", () => {
    // Normal: 2.0–2.3; Incidental: 2.2–2.6 — overlap at 2.2–2.3; incidental continues 2.3–2.6
    const normal = re({ isIncidental: false, chainageFromKm: 2.0, chainageToKm: 2.3, side: "RHS" });
    const inc = re({ isIncidental: true, chainageFromKm: 2.2, chainageToKm: 2.6, side: "RHS" });
    const strips = buildCoverageStrips([normal, inc]);
    const rhs = strips.find((s) => s.label === "RHS");
    expect(rhs).toBeDefined();
    const segs = rhs!.segments;
    // 2.0–2.2: recorded (normal only)
    // 2.2–2.3: recorded (normal wins over incidental)
    // 2.3–2.6: incidental (incidental only)
    // So we expect: recorded 2.0–2.3 (merged), incidental 2.3–2.6
    const rec = segs.filter((s) => s.state === "recorded");
    const incSegs = segs.filter((s) => s.state === "incidental");
    // No "overlap" state because there are NOT two normal entries
    expect(segs.some((s) => s.state === "overlap")).toBe(false);
    // Recorded covers the full normal range
    const recSpan = rec.reduce((acc, s) => acc + (s.toKm - s.fromKm), 0);
    expect(recSpan).toBeCloseTo(0.3, 6);
    // Incidental covers the extra range
    expect(incSegs.length).toBeGreaterThan(0);
    expect(incSegs[0].fromKm).toBeCloseTo(2.3, 6);
    expect(incSegs[0].toKm).toBeCloseTo(2.6, 6);
  });

  it("two normal entries at same chainage still produce 'overlap', incidental there doesn't affect depth", () => {
    const n1 = re({ isIncidental: false, chainageFromKm: 2.0, chainageToKm: 2.5, side: "RHS" });
    const n2 = re({ isIncidental: false, chainageFromKm: 2.0, chainageToKm: 2.5, side: "RHS" });
    const inc = re({ isIncidental: true, chainageFromKm: 2.0, chainageToKm: 2.5, side: "RHS" });
    const strips = buildCoverageStrips([n1, n2, inc]);
    const rhs = strips.find((s) => s.label === "RHS");
    // Full 2.0–2.5 range should be "overlap" (two normal entries)
    expect(rhs!.segments.every((s) => s.state === "overlap")).toBe(true);
  });

  it("incidental Full Width contributes to LHS and RHS strips", () => {
    const inc = re({ isIncidental: true, side: "Full Width", chainageFromKm: 1.0, chainageToKm: 2.0 });
    const strips = buildCoverageStrips([inc]);
    const labels = strips.map((s) => s.label).sort();
    expect(labels).toEqual(["LHS", "RHS"]);
    expect(strips.every((s) => s.segments[0].state === "incidental")).toBe(true);
  });

  it("no strip when only incidental with no chainage data", () => {
    const inc = re({ isIncidental: true, chainageFromKm: null, chainageToKm: null });
    expect(buildCoverageStrips([inc])).toEqual([]);
  });

  it("No Site Work never creates report coverage even when a legacy row has chainage", () => {
    const noWork = re({
      noSiteWork: true,
      chainageFromKm: 1.0,
      chainageToKm: 2.0,
      quantity: 500,
    });
    expect(buildCoverageStrips([noWork])).toEqual([]);
  });
});

describe("V: incidental classification reaches server and programme seams", () => {
  it("server Final Submit and Guided overlap candidates carry isIncidental", async () => {
    const fs = await import("node:fs/promises");
    const [routes, guided] = await Promise.all([
      fs.readFile("server/routes.ts", "utf8"),
      fs.readFile("client/src/pages/GuidedDpr.tsx", "utf8"),
    ]);
    const serverMapper = routes.slice(
      routes.indexOf("async function evaluateChainageOverlapIssues"),
      routes.indexOf("// Batch 06B — prior submitted chainage progress"),
    );
    expect(serverMapper).toContain("isIncidental: !!p?.isIncidental");
    const guidedMapper = guided.slice(
      guided.indexOf("const overlapRows: CandidateChainageRow[]"),
      guided.indexOf("const overlapHits"),
    );
    expect(guidedMapper).toContain("isIncidental: e.isIncidental");
  });

  it("programme totals, side coverage and plan execution all exclude incidental rows", async () => {
    const fs = await import("node:fs/promises");
    const storage = await fs.readFile("server/storage.ts", "utf8");
    const reported = storage.slice(storage.indexOf("async getReportedQtyByBar"), storage.indexOf("async getProgressSideEntriesByBar"));
    const sideCoverage = storage.slice(storage.indexOf("async getProgressSideEntriesByBar"), storage.indexOf("// ── Batch 06B: prior submitted"));
    const planActual = storage.slice(storage.indexOf("async getPlanVsActual"), storage.indexOf("// --- Site Requirements"));
    const planExecution = storage.slice(storage.indexOf("async getExecutedProgressForPlan"), storage.indexOf("async updateSiteRequirementItemStatus"));
    expect(reported).toContain("eq(progressEntries.isIncidental, false)");
    expect(sideCoverage).toContain("eq(progressEntries.isIncidental, false)");
    expect(planActual).toContain("AND pe.is_incidental = false");
    expect(planExecution).toContain("!r.isIncidental");
  });
});

// ── T: parseDprError normalises server errors ────────────────────────────────

describe("T: parseDprError — normalised error output", () => {
  const makeErr = (msg: string) => Object.assign(new Error(msg), {});

  it("DPR_NOT_READY with issues array extracts activity and description", () => {
    const body = JSON.stringify({
      error: "DPR_NOT_READY",
      issues: [
        { section: "progress", description: "Missing chainage", activity: "EARTHWORK" },
        { section: "equipment", description: "No equipment recorded", activity: null },
      ],
    });
    const err = makeErr(`422: ${body}`);
    const result = parseDprError(err);
    expect(result.title).toBe("DPR is not ready to submit");
    expect(result.lines).toHaveLength(2);
    expect(result.lines[0]).toContain("EARTHWORK");
    expect(result.lines[0]).toContain("Missing chainage");
    expect(result.highlightActivity).toBe("EARTHWORK");
  });

  it("DPR_NOT_READY with mandatory array uses label field for display", () => {
    const body = JSON.stringify({
      error: "DPR_NOT_READY",
      mandatory: [
        { section: "labour", label: "Labour required", activity: null },
      ],
    });
    const err = makeErr(`422: ${body}`);
    const result = parseDprError(err);
    expect(result.title).toBe("DPR is not ready to submit");
    expect(result.lines[0]).toBe("Labour required");
    expect(result.highlightActivity).toBeNull();
  });

  it("DPR_NOT_READY video response uses label as the activity target and message as plain text", () => {
    const body = JSON.stringify({
      message: "DPR is not ready to submit",
      error: "DPR_NOT_READY",
      mandatory: [
        {
          section: "activities",
          label: "Embankment - Excavated Earth",
          message: "needs an overlap reason before this can be saved — see Overlap Review below",
        },
      ],
    });
    const result = parseDprError(makeErr(`422: ${body}`));
    expect(result.highlightActivity).toBe("Embankment - Excavated Earth");
    expect(result.lines).toEqual([
      "Embankment - Excavated Earth — needs an overlap reason before this can be saved — see Overlap Review below",
    ]);
    expect(result.lines[0]).not.toContain("DPR_NOT_READY");
    expect(result.lines[0]).not.toContain("{");
  });

  it("DPR_NOT_READY with no issues falls back to generic message", () => {
    const body = JSON.stringify({ error: "DPR_NOT_READY" });
    const err = makeErr(`422: ${body}`);
    const result = parseDprError(err);
    expect(result.title).toBe("DPR is not ready to submit");
    expect(result.lines).toHaveLength(1);
    expect(result.highlightActivity).toBeNull();
  });

  it("PROGRAMME_LINK_INVALID maps to a meaningful title", () => {
    const body = JSON.stringify({ code: "PROGRAMME_LINK_INVALID", message: "Bar link outdated" });
    const err = makeErr(`400: ${body}`);
    const result = parseDprError(err);
    expect(result.title).toBe("Programme link invalid");
    expect(result.lines[0]).toBe("Bar link outdated");
  });

  it("OVERRIDE_REASON_REQUIRED maps to reason-required title", () => {
    const body = JSON.stringify({ code: "OVERRIDE_REASON_REQUIRED" });
    const err = makeErr(`400: ${body}`);
    const result = parseDprError(err);
    expect(result.title).toBe("Reason required");
    expect(result.lines).toHaveLength(1);
  });

  it("HTTP 400 without code shows 'Submission blocked'", () => {
    const body = JSON.stringify({ error: "Invalid chainage range" });
    const err = makeErr(`400: ${body}`);
    const result = parseDprError(err);
    expect(result.title).toBe("Submission blocked");
    expect(result.lines[0]).toBe("Invalid chainage range");
  });

  it("HTTP 403 shows permission denied", () => {
    const err = makeErr("403: Forbidden");
    const result = parseDprError(err);
    expect(result.title).toBe("Permission denied");
  });

  it("HTTP 409 shows conflict message", () => {
    const body = JSON.stringify({ error: "DPR for this date already submitted" });
    const err = makeErr(`409: ${body}`);
    const result = parseDprError(err);
    expect(result.title).toBe("Conflict");
    expect(result.lines[0]).toContain("DPR for this date");
  });

  it("non-HTTP error falls back to generic 'Failed to save'", () => {
    const err = new Error("Network request failed");
    const result = parseDprError(err);
    expect(result.title).toBe("Failed to save report");
    expect(result.lines[0]).toContain("Network request failed");
  });

  it("non-Error object falls back gracefully", () => {
    const result = parseDprError("something weird");
    expect(result.title).toBe("Failed to save report");
    expect(result.lines).toHaveLength(1);
  });

  it("never surfaces raw JSON in the title", () => {
    const body = JSON.stringify({ code: "SOME_CODE", error: "Human-readable message" });
    const err = makeErr(`422: ${body}`);
    const result = parseDprError(err);
    // The title must not contain JSON syntax (braces, quotes around codes, etc.)
    expect(result.title).not.toMatch(/\{.*\}/);
  });
});

// ── U: classifyReason and buildReason for pick-list overlap dialog ───────────

describe("U: classifyReason — classifying stored reason strings", () => {
  it("empty string → empty pick and elaboration", () => {
    expect(classifyReason("")).toEqual({ pick: "", elaboration: "" });
  });

  it("whitespace-only → empty pick", () => {
    expect(classifyReason("   ")).toEqual({ pick: "", elaboration: "" });
  });

  it("known pick value maps to itself with no elaboration", () => {
    expect(classifyReason("Vegetation regrowth / repeat clearing")).toEqual({
      pick: "Vegetation regrowth / repeat clearing", elaboration: "",
    });
    expect(classifyReason("Re-measurement after approved correction")).toEqual({
      pick: "Re-measurement after approved correction", elaboration: "",
    });
    expect(classifyReason("Genuine separately payable repeated operation")).toEqual({
      pick: "Genuine separately payable repeated operation", elaboration: "",
    });
  });

  it("custom free-text string → Other + elaboration", () => {
    const result = classifyReason("Second WMM layer — lift 3");
    expect(result.pick).toBe("Other");
    expect(result.elaboration).toBe("Second WMM layer — lift 3");
  });

  it("'Other' string itself → Other + elaboration 'Other'", () => {
    // The 'Other' key cannot be stored directly (buildReason never stores 'Other')
    // but if someone stores it manually, classify falls into the free-text path.
    const result = classifyReason("Other");
    // "Other" is in the pick list BUT is excluded from the direct match check
    // (because we never want to store "Other" as the reason), so it falls back
    // to elaboration.
    expect(result.pick).toBe("Other");
    expect(result.elaboration).toBe("Other");
  });
});

describe("U: buildReason — combining pick + elaboration", () => {
  it("empty pick → empty string", () => {
    expect(buildReason("", "")).toBe("");
    expect(buildReason("", "some text")).toBe("");
  });

  it("known pick → that pick value (not Other), ignores elaboration", () => {
    expect(buildReason("Vegetation regrowth / repeat clearing", "ignored")).toBe("Vegetation regrowth / repeat clearing");
    expect(buildReason("Re-measurement after approved correction", "")).toBe("Re-measurement after approved correction");
  });

  it("Other + elaboration → the elaboration text", () => {
    expect(buildReason("Other", "Second WMM layer")).toBe("Second WMM layer");
  });

  it("Other + empty elaboration → empty (user hasn't typed yet)", () => {
    expect(buildReason("Other", "")).toBe("");
  });

  it("Other + whitespace elaboration → empty", () => {
    expect(buildReason("Other", "   ")).toBe("");
  });

  it("round-trip: buildReason(classifyReason(x).pick, classifyReason(x).elaboration) === x", () => {
    const known = "Re-measurement after approved correction";
    const { pick, elaboration } = classifyReason(known);
    expect(buildReason(pick, elaboration)).toBe(known);
  });

  it("round-trip for custom free-text", () => {
    const custom = "Embankment lift 3 — approved by RE";
    const { pick, elaboration } = classifyReason(custom);
    expect(buildReason(pick, elaboration)).toBe(custom);
  });
});

describe("U: OVERLAP_REASON_OPTIONS structure", () => {
  it("has the three approved structured reasons plus Other", () => {
    expect(OVERLAP_REASON_OPTIONS).toHaveLength(4);
    expect(OVERLAP_REASON_OPTIONS.map((o) => o.value)).not.toContain("Different layer / lift");
  });
  it("last entry is Other", () => {
    expect(OVERLAP_REASON_OPTIONS[OVERLAP_REASON_OPTIONS.length - 1].value).toBe(OTHER_VALUE);
  });
  it("every entry has non-empty value and label", () => {
    for (const o of OVERLAP_REASON_OPTIONS) {
      expect(o.value.trim().length).toBeGreaterThan(0);
      expect(o.label.trim().length).toBeGreaterThan(0);
    }
  });
});
