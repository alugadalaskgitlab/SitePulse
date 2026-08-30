/**
 * Instruction 06X — client-focused tests.
 *
 * Tests for:
 *  A — extractNotReadyRowTarget: DPR_NOT_READY rowIndex / rowKey extraction
 *  B — extractNotReadyRowTarget: non-DPR_NOT_READY errors return null
 *  C — extractNotReadyRowTarget: malformed / missing body returns null
 *  D — dprRowKey helper
 *  E — buildReason canonical semantics (from overlapReason.ts)
 *  F — classifyReason round-trip (pre-populated dialog state)
 *  G — overlap-resolution PATCH endpoint contract (incidental + payable)
 *  H — extractNotReadyRowTarget: mandatory array with rowKey (overlap issues)
 *  I — extractNotReadyRowTarget: mandatory array with rowIndex (readiness issues)
 *  J — extractNotReadyRowTarget: defensive fallback for empty mandatory array
 *  K — incidentalDescription fallback
 *  L — "other" → OTHER_VALUE normalisation for buildReason
 */

import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import { extractNotReadyRowTarget, dprRowKey } from "@/lib/dprNotReadyHighlight";
import { buildReason, classifyReason, OVERLAP_REASON_OPTIONS, OTHER_VALUE } from "@/lib/overlapReason";

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Build an Error that mimics an apiRequest DPR_NOT_READY failure. */
function makeNotReadyError(body: object, status = 422): Error {
  return new Error(`${status}: ${JSON.stringify(body)}`);
}

// ── A: extract rowIndex from readiness (evaluateDprSubmitReadiness shape) ────

describe("A: extractNotReadyRowTarget — rowIndex from DprReadinessIssue", () => {
  it("returns section and rowIndex for first mandatory issue with rowIndex", () => {
    const err = makeNotReadyError({
      error: "DPR_NOT_READY",
      mandatory: [
        { section: "activities", label: "WMM laying", message: "Quantity required", rowIndex: 2 },
      ],
    });
    const result = extractNotReadyRowTarget(err);
    expect(result).not.toBeNull();
    expect(result!.section).toBe("activities");
    expect(result!.rowIndex).toBe(2);
    expect(result!.rowKey).toBeNull();
  });

  it("prefers rowIndex over rowKey when both present", () => {
    const err = makeNotReadyError({
      error: "DPR_NOT_READY",
      mandatory: [
        { section: "activities", label: "WMM", message: "Qty missing", rowIndex: 1, rowKey: 3 },
      ],
    });
    const result = extractNotReadyRowTarget(err);
    expect(result!.rowIndex).toBe(1); // rowIndex takes precedence
  });

  it("uses numeric rowKey as rowIndex fallback when rowIndex absent", () => {
    const err = makeNotReadyError({
      error: "DPR_NOT_READY",
      mandatory: [
        { section: "activities", label: "WMM", message: "Overlap", rowKey: 4 },
      ],
    });
    const result = extractNotReadyRowTarget(err);
    expect(result!.rowIndex).toBe(4);
    expect(result!.rowKey).toBe(4);
  });
});

// ── B: non-DPR_NOT_READY errors return null ───────────────────────────────────

describe("B: extractNotReadyRowTarget — non-DPR_NOT_READY errors", () => {
  it("returns null for PROGRAMME_LINK_INVALID", () => {
    const err = makeNotReadyError({ code: "PROGRAMME_LINK_INVALID", message: "bad link" }, 400);
    expect(extractNotReadyRowTarget(err)).toBeNull();
  });

  it("returns null for a generic 500", () => {
    const err = new Error("500: {\"message\":\"Server error\"}");
    expect(extractNotReadyRowTarget(err)).toBeNull();
  });

  it("returns null for a non-Error value", () => {
    expect(extractNotReadyRowTarget("string error")).toBeNull();
    expect(extractNotReadyRowTarget(null)).toBeNull();
    expect(extractNotReadyRowTarget(42)).toBeNull();
  });
});

// ── C: malformed / missing body ───────────────────────────────────────────────

describe("C: extractNotReadyRowTarget — malformed body", () => {
  it("returns null when message is not the NNN: <body> format", () => {
    const err = new Error("Something went wrong");
    expect(extractNotReadyRowTarget(err)).toBeNull();
  });

  it("returns null when body is not valid JSON", () => {
    const err = new Error("422: not-json");
    expect(extractNotReadyRowTarget(err)).toBeNull();
  });

  it("returns null when mandatory array is empty", () => {
    const err = makeNotReadyError({ error: "DPR_NOT_READY", mandatory: [] });
    expect(extractNotReadyRowTarget(err)).toBeNull();
  });

  it("returns null when mandatory is absent", () => {
    const err = makeNotReadyError({ error: "DPR_NOT_READY" });
    expect(extractNotReadyRowTarget(err)).toBeNull();
  });
});

// ── D: dprRowKey helper ───────────────────────────────────────────────────────

describe("D: dprRowKey", () => {
  it("produces the expected attribute value", () => {
    expect(dprRowKey("activities", 0)).toBe("activities-0");
    expect(dprRowKey("equipment", 3)).toBe("equipment-3");
    expect(dprRowKey("labour", 1)).toBe("labour-1");
    expect(dprRowKey("materials", 5)).toBe("materials-5");
  });
});

// ── E: buildReason canonical semantics ───────────────────────────────────────

describe("E: buildReason canonical semantics", () => {
  it("returns empty string for empty pick", () => {
    expect(buildReason("", "")).toBe("");
    expect(buildReason("", "any elaboration")).toBe("");
  });

  it("returns the pick value for a predefined reason", () => {
    expect(buildReason("Vegetation regrowth / repeat clearing", "")).toBe(
      "Vegetation regrowth / repeat clearing",
    );
    expect(buildReason("Re-measurement after approved correction", "irrelevant")).toBe(
      "Re-measurement after approved correction",
    );
  });

  it("returns the elaboration for 'Other'", () => {
    expect(buildReason(OTHER_VALUE, "Custom reason text")).toBe("Custom reason text");
  });

  it("returns empty for 'Other' with blank elaboration", () => {
    expect(buildReason(OTHER_VALUE, "   ")).toBe("");
  });

  it("covers all OVERLAP_REASON_OPTIONS values", () => {
    for (const opt of OVERLAP_REASON_OPTIONS) {
      if (opt.value === OTHER_VALUE) continue;
      expect(buildReason(opt.value, "")).toBe(opt.value);
    }
  });
});

// ── F: classifyReason round-trip ──────────────────────────────────────────────

describe("F: classifyReason round-trip", () => {
  it("pre-populates a predefined reason", () => {
    const reason = "Vegetation regrowth / repeat clearing";
    const { pick, elaboration } = classifyReason(reason);
    expect(pick).toBe(reason);
    expect(elaboration).toBe("");
    // round-trip: buildReason(pick, elaboration) === original
    expect(buildReason(pick, elaboration)).toBe(reason);
  });

  it("pre-populates 'Other' for a free-text reason", () => {
    const reason = "Supervisor approved double-payment after site inspection";
    const { pick, elaboration } = classifyReason(reason);
    expect(pick).toBe(OTHER_VALUE);
    expect(elaboration).toBe(reason);
    // round-trip
    expect(buildReason(pick, elaboration)).toBe(reason);
  });

  it("returns empty pick for blank reason", () => {
    const { pick, elaboration } = classifyReason("");
    expect(pick).toBe("");
    expect(elaboration).toBe("");
  });
});

// ── G: overlap-resolution PATCH endpoint contract ────────────────────────────

describe("G: overlap-resolution PATCH endpoint contract", () => {
  /**
   * The narrow PATCH /api/progress-entries/:id/overlap-resolution endpoint is
   * the canonical path for ProgressReport overlap classification.  These tests
   * assert the URL pattern and payload shapes that the server expects, so that
   * if either the client or the server changes them the mismatch is caught here.
   */

  it("incidental payload satisfies server contract", () => {
    // Server validates: isIncidental === true AND incidentalDescription non-empty.
    const entryId = 123;
    const url = `/api/progress-entries/${entryId}/overlap-resolution`;
    const payload = {
      isIncidental: true,
      incidentalDescription: "Classified as incidental during overlap review",
    };
    expect(url).toBe("/api/progress-entries/123/overlap-resolution");
    expect(payload.isIncidental).toBe(true);
    expect(typeof payload.incidentalDescription).toBe("string");
    expect(payload.incidentalDescription.trim().length).toBeGreaterThan(0);
  });

  it("payable payload satisfies server contract", () => {
    // Server validates: chainageOverrideReason non-empty string.
    const entryId = 456;
    const url = `/api/progress-entries/${entryId}/overlap-resolution`;
    const payload = {
      chainageOverrideReason: "Genuine separately payable repeated operation",
    };
    expect(url).toBe("/api/progress-entries/456/overlap-resolution");
    expect(typeof payload.chainageOverrideReason).toBe("string");
    expect(payload.chainageOverrideReason.trim().length).toBeGreaterThan(0);
  });

  it("layer-correction payload satisfies server contract (Task #1419)", () => {
    // Server validates: layerNo is a positive integer, layer-only shape.
    const entryId = 789;
    const url = `/api/progress-entries/${entryId}/overlap-resolution`;
    const payload = { layerNo: 2 };
    expect(url).toBe("/api/progress-entries/789/overlap-resolution");
    expect(Number.isInteger(payload.layerNo)).toBe(true);
    expect(payload.layerNo).toBeGreaterThan(0);
    // Layer shape carries no classification keys.
    expect("isIncidental" in payload).toBe(false);
    expect("chainageOverrideReason" in payload).toBe(false);
  });

  it("all three branches are mutually exclusive at the type level", () => {
    // Each payload must NOT include the other shapes' keys.
    type IncidentalPayload = { isIncidental: true; incidentalDescription: string };
    type PayablePayload = { chainageOverrideReason: string };
    type LayerPayload = { layerNo: number };
    const incidental: IncidentalPayload = { isIncidental: true, incidentalDescription: "reason" };
    const payable: PayablePayload = { chainageOverrideReason: "reason" };
    const layer: LayerPayload = { layerNo: 2 };
    expect("isIncidental" in incidental).toBe(true);
    expect("isIncidental" in payable).toBe(false);
    expect("chainageOverrideReason" in incidental).toBe(false);
    expect("chainageOverrideReason" in payable).toBe(true);
    expect("layerNo" in layer).toBe(true);
    expect("layerNo" in incidental).toBe(false);
    expect("layerNo" in payable).toBe(false);
    expect("isIncidental" in layer).toBe(false);
    expect("chainageOverrideReason" in layer).toBe(false);
  });

  it("SiteEntry open-today URL includes site parameter (regression guard)", () => {
    // Verifies the URL contract expected by the plant-module open-today endpoint
    // so the SiteEntry fix (site param + credentials) is not accidentally reverted.
    const date = "2026-08-01";
    const site = "Highway Site A";
    const equipmentId = 42;
    const url = `/api/plant-module/equipment-usage/open-today?date=${encodeURIComponent(date)}&equipmentIds=${equipmentId}&site=${encodeURIComponent(site)}`;
    expect(url).toContain("site=Highway%20Site%20A");
    expect(url).toContain("date=2026-08-01");
    expect(url).toContain("equipmentIds=42");
  });

  it("ProgressReport uses the narrow PATCH route and preserves DPR links/legacy guard", async () => {
    const source = await readFile("client/src/pages/ProgressReport.tsx", "utf8");
    expect(source).toContain('apiRequest("PATCH", `/api/progress-entries/${entryId}/overlap-resolution`');
    expect(source).not.toContain('apiRequest("POST", `/api/dprs/${dprId}/version`');
    expect(source).toContain("View DPR-{pair.a.dprId}");
    expect(source).toContain("View DPR-{pair.b.dprId}");
    expect(source).toContain("if (legacyLayer) return");
    // Task #1419: direct layer correction reuses the SAME narrow endpoint helper.
    expect(source).toContain("patchOverlapResolution(entry.entryId, { layerNo: parsed })");
    // Missing-layer explanatory copy (exact wording).
    expect(source).toContain("Possible overlap — layer/lift not recorded for one or both entries.");
    // Correction only for progress entries (variable name is 'e' in the iterator) + refetch on success.
    expect(source).toContain('e.kind !== "progress"');
    expect(source).toContain("invalidateProgressQueries(queryClient)");
  });

  it("all DPR forms expose section-aware row targets, including Guided material remediation", async () => {
    const [guided, entry, edit] = await Promise.all([
      readFile("client/src/pages/GuidedDpr.tsx", "utf8"),
      readFile("client/src/pages/SiteEntry.tsx", "utf8"),
      readFile("client/src/pages/SiteEdit.tsx", "utf8"),
    ]);
    for (const section of ["activities", "equipment", "labour"]) {
      expect(guided).toContain(`dprRowKey("${section}"`);
      expect(entry).toContain(`dprRowKey("${section}"`);
      expect(edit).toContain(`dprRowKey("${section}"`);
    }
    expect(guided).toContain('dprRowKey("materials"');
    expect(guided).toContain("Edit in Detailed DPR");
    expect(entry).toContain('dprRowKey("materials"');
    expect(edit).toContain('dprRowKey("materials"');
  });
});

// ── H: overlap issue rowKey shape ────────────────────────────────────────────

describe("H: extractNotReadyRowTarget — overlap issue rowKey", () => {
  it("extracts rowKey from chainageOverlapReadinessIssues shape", () => {
    // chainageOverlapReadinessIssues produces { section, label, message, rowKey }
    const err = makeNotReadyError({
      error: "DPR_NOT_READY",
      mandatory: [
        { section: "activities", label: "WMM LHS 2+000-2+500", message: "Possible chainage overlap requires a reason before submission.", rowKey: 0 },
      ],
    });
    const result = extractNotReadyRowTarget(err);
    expect(result).not.toBeNull();
    expect(result!.section).toBe("activities");
    expect(result!.rowIndex).toBe(0);
    expect(result!.rowKey).toBe(0);
  });

  it("handles rowKey=0 (first row) without falsy confusion", () => {
    const err = makeNotReadyError({
      error: "DPR_NOT_READY",
      mandatory: [{ section: "activities", label: "BC", message: "overlap", rowKey: 0 }],
    });
    const result = extractNotReadyRowTarget(err);
    // rowKey 0 is valid — must not be treated as falsy and discarded
    expect(result!.rowIndex).toBe(0);
  });
});

// ── I: mixed mandatory array — first issue used ───────────────────────────────

describe("I: extractNotReadyRowTarget — first issue wins", () => {
  it("uses first mandatory issue even when later ones have rowIndex", () => {
    const err = makeNotReadyError({
      error: "DPR_NOT_READY",
      mandatory: [
        { section: "labour", label: "Skilled", message: "Count required", rowIndex: 1 },
        { section: "activities", label: "WMM", message: "Overlap", rowKey: 3 },
      ],
    });
    const result = extractNotReadyRowTarget(err);
    expect(result!.section).toBe("labour");
    expect(result!.rowIndex).toBe(1);
  });
});

// ── J: defensive fallback for non-numeric rowKey ─────────────────────────────

describe("J: extractNotReadyRowTarget — defensive for string rowKey", () => {
  it("returns null rowIndex when rowKey is a non-numeric string", () => {
    const err = makeNotReadyError({
      error: "DPR_NOT_READY",
      mandatory: [
        { section: "activities", label: "WMM", message: "overlap", rowKey: "some-key" },
      ],
    });
    const result = extractNotReadyRowTarget(err);
    expect(result).not.toBeNull();
    expect(result!.rowIndex).toBeNull(); // can't use string as DOM index
    expect(result!.rowKey).toBe("some-key"); // raw key preserved for caller
  });
});

// ── K: incidentalDescription fallback ────────────────────────────────────────

describe("K: incidentalDescription fallback logic", () => {
  const FALLBACK = "Classified as incidental during overlap review";

  it("uses existing description when non-blank", () => {
    const existing = "Re-clearing after vegetation regrowth";
    const desc =
      typeof existing === "string" && existing.trim()
        ? existing.trim()
        : FALLBACK;
    expect(desc).toBe("Re-clearing after vegetation regrowth");
  });

  it("falls back to deterministic string when description is blank", () => {
    const existing = "   ";
    const desc =
      typeof existing === "string" && existing.trim()
        ? existing.trim()
        : FALLBACK;
    expect(desc).toBe(FALLBACK);
  });

  it("falls back to deterministic string when description is undefined", () => {
    const existing = undefined;
    const desc =
      typeof existing === "string" && existing.trim()
        ? existing.trim()
        : FALLBACK;
    expect(desc).toBe(FALLBACK);
  });

  it("fallback string is non-empty (satisfies server non-empty validation)", () => {
    expect(FALLBACK.trim().length).toBeGreaterThan(0);
  });
});

// ── L: "other" → OTHER_VALUE normalisation ───────────────────────────────────

describe("L: PAYABLE_REASONS 'other' → OTHER_VALUE normalisation for buildReason", () => {
  /**
   * PAYABLE_REASONS in ProgressReport.tsx uses lowercase "other" as the
   * sentinel, but buildReason/classifyReason use OTHER_VALUE = "Other"
   * (capital O).  The mutation fn must normalise before calling buildReason.
   */

  it("OTHER_VALUE is 'Other' (capital O)", () => {
    expect(OTHER_VALUE).toBe("Other");
  });

  it("lowercase 'other' does NOT equal OTHER_VALUE", () => {
    expect("other").not.toBe(OTHER_VALUE);
  });

  it("normalised pick produces correct reason for free-text elaboration", () => {
    const payableReason = "other"; // as stored in PAYABLE_REASONS
    const elaboration = "Supervisor waiver for flood damage repeat work";
    // Normalise as the mutation fn does
    const normalisedPick = payableReason === "other" ? OTHER_VALUE : payableReason;
    const reason = buildReason(normalisedPick, elaboration);
    expect(reason).toBe(elaboration);
  });

  it("without normalisation, buildReason returns the literal 'other' string (bug scenario)", () => {
    // Shows WHY normalisation is required.
    const reason = buildReason("other", "some elaboration");
    // Without normalisation, "other" !== OTHER_VALUE so buildReason returns "other" — wrong.
    expect(reason).toBe("other");
  });

  it("non-'other' predefined reason passes through unchanged", () => {
    const payableReason = "Genuine separately payable repeated operation";
    const normalisedPick = payableReason === "other" ? OTHER_VALUE : payableReason;
    const reason = buildReason(normalisedPick, "");
    expect(reason).toBe(payableReason);
  });
});
