/**
 * Batch 06X — backend/shared contract tests (tightened post-integration review).
 *
 * Covers:
 *  A  — DprReadinessIssue has optional rowIndex
 *  B  — evaluateDprSubmitReadiness populates rowIndex in every mandatory push
 *       (activities, equipment, labour, materials)
 *  C  — rowIndex absent on advisories (not required)
 *  D  — chainageOverlapReadinessIssues preserves rowKey in its return type
 *  E  — rowIndex is zero-based and tracks the original array position
 *  F  — multiple issues on different rows carry correct independent rowIndex
 *  G  — ChainageOverlapIssue carries rowKey but no rowIndex
 *  H  — overlap-resolution payload validation: exact one-shape, cross-
 *        contamination rejection, empty-string rejection, isIncidental=false
 *  I  — open-today: strict destinationSite-only filter (no siteName fallback)
 *        — sourced from the actual route code via fs.readFile so the test
 *        stays honest about what the handler does, not a duplicate reimpl.
 *  J  — closePlantUsage: destinationSite primary, siteName legacy fallback
 *        documented and tested; both-null allows close (fail-open for legacy)
 *  K  — existing submit-readiness rules are preserved (regression)
 */

import { describe, it, expect } from "vitest";
import {
  evaluateDprSubmitReadiness,
  type DprReadinessIssue,
} from "../shared/dprSubmitReadiness";
import {
  chainageOverlapReadinessIssues,
  type CandidateChainageRow,
  type PriorChainageEntry,
} from "../shared/chainageOverlap";

// ── A: DprReadinessIssue has optional rowIndex ──────────────────────────────

describe("A: DprReadinessIssue type contract — rowIndex is optional", () => {
  it("issue without rowIndex is valid (rowIndex is optional)", () => {
    const issue: DprReadinessIssue = {
      section: "activities",
      label: "Embankment",
      message: "quantity missing",
    };
    expect(issue.rowIndex).toBeUndefined();
  });

  it("issue with rowIndex carries the correct value", () => {
    const issue: DprReadinessIssue = {
      section: "equipment",
      label: "JCB",
      message: "closing meter reading required",
      rowIndex: 2,
    };
    expect(issue.rowIndex).toBe(2);
  });

  it("rowIndex 0 is valid (first row)", () => {
    const issue: DprReadinessIssue = {
      section: "labour",
      label: "Skilled",
      message: "labour count must be a positive number",
      rowIndex: 0,
    };
    expect(issue.rowIndex).toBe(0);
  });
});

// ── B: evaluateDprSubmitReadiness populates rowIndex in every mandatory push ─

describe("B: evaluateDprSubmitReadiness populates rowIndex on mandatory issues", () => {
  it("activities: quantity missing carries rowIndex 0", () => {
    const r = evaluateDprSubmitReadiness({
      progress: [{ activity: "Embankment", quantity: null }],
    });
    const issue = r.mandatory.find((m) => m.message.includes("quantity"));
    expect(issue).toBeDefined();
    expect(issue!.rowIndex).toBe(0);
  });

  it("activities: noSiteWork without description carries rowIndex", () => {
    const r = evaluateDprSubmitReadiness({
      progress: [{ activity: "NSWork", noSiteWork: true, noSiteWorkDescription: "" }],
    });
    const issue = r.mandatory.find((m) => m.message.includes("No Site Work"));
    expect(issue).toBeDefined();
    expect(issue!.rowIndex).toBe(0);
  });

  it("activities: incidental without description carries rowIndex", () => {
    const r = evaluateDprSubmitReadiness({
      progress: [{ activity: "Patch", isIncidental: true, incidentalDescription: "", quantity: 10 }],
    });
    const issue = r.mandatory.find((m) => m.message.includes("description required"));
    expect(issue).toBeDefined();
    expect(issue!.rowIndex).toBe(0);
  });

  it("activities: chainage incomplete carries rowIndex", () => {
    const r = evaluateDprSubmitReadiness({
      progress: [{ activity: "GSB", chainageFrom: "1+000", chainageTo: "", quantity: 50 }],
    });
    const issue = r.mandatory.find((m) => m.message.includes("chainage is incomplete"));
    expect(issue).toBeDefined();
    expect(issue!.rowIndex).toBe(0);
  });

  it("equipment: closing meter reading required carries rowIndex", () => {
    const r = evaluateDprSubmitReadiness({
      equipment: [{ machine: "JCB", openingReading: 1234.5 }],
    });
    const issue = r.mandatory.find((m) => m.message.includes("closing meter"));
    expect(issue).toBeDefined();
    expect(issue!.rowIndex).toBe(0);
  });

  it("equipment: opening meter reading missing carries rowIndex", () => {
    const r = evaluateDprSubmitReadiness({
      equipment: [{ machine: "Roller", closingReading: 500 }],
    });
    const issue = r.mandatory.find((m) => m.message.includes("opening meter"));
    expect(issue).toBeDefined();
    expect(issue!.rowIndex).toBe(0);
  });

  it("equipment: end time required carries rowIndex", () => {
    const r = evaluateDprSubmitReadiness({
      equipment: [{ machine: "Grader", startTime: "08:00" }],
    });
    const issue = r.mandatory.find((m) => m.message.includes("end time"));
    expect(issue).toBeDefined();
    expect(issue!.rowIndex).toBe(0);
  });

  it("equipment: start time missing carries rowIndex", () => {
    const r = evaluateDprSubmitReadiness({
      equipment: [{ machine: "Grader", endTime: "17:00" }],
    });
    const issue = r.mandatory.find((m) => m.message.includes("start time"));
    expect(issue).toBeDefined();
    expect(issue!.rowIndex).toBe(0);
  });

  it("equipment: trip entry incomplete carries rowIndex", () => {
    const r = evaluateDprSubmitReadiness({
      equipment: [{ machine: "Water Tanker", entryType: "trip_based", numberOfTrips: 5 }],
    });
    const issue = r.mandatory.find((m) => m.message.includes("trip entry incomplete"));
    expect(issue).toBeDefined();
    expect(issue!.rowIndex).toBe(0);
  });

  it("labour: category missing carries rowIndex", () => {
    const r = evaluateDprSubmitReadiness({ labour: [{ count: 5 }] });
    const issue = r.mandatory.find((m) => m.message.includes("labour category missing"));
    expect(issue).toBeDefined();
    expect(issue!.rowIndex).toBe(0);
  });

  it("labour: count missing carries rowIndex", () => {
    const r = evaluateDprSubmitReadiness({ labour: [{ category: "Unskilled", count: null }] });
    const issue = r.mandatory.find((m) => m.message.includes("labour count"));
    expect(issue).toBeDefined();
    expect(issue!.rowIndex).toBe(0);
  });

  it("materials: quantity missing carries rowIndex", () => {
    const r = evaluateDprSubmitReadiness({
      materials: [{ material: "GSB Material", quantity: null, uom: "Cum" }],
    });
    const issue = r.mandatory.find((m) => m.message.includes("material quantity missing"));
    expect(issue).toBeDefined();
    expect(issue!.rowIndex).toBe(0);
  });
});

// ── C: advisories do NOT carry rowIndex ─────────────────────────────────────

describe("C: advisories do not carry rowIndex", () => {
  it("equipment advisory (no usage) has no rowIndex", () => {
    const r = evaluateDprSubmitReadiness({ equipment: [{ machine: "Grader" }] });
    expect(r.ready).toBe(true);
    expect(r.advisories.length).toBeGreaterThan(0);
    expect(r.advisories[0].rowIndex).toBeUndefined();
  });

  it("material UOM advisory has no rowIndex", () => {
    const r = evaluateDprSubmitReadiness({
      materials: [{ material: "Bitumen", quantity: 10, uom: "" }],
    });
    const adv = r.advisories.find((a) => a.message.includes("UOM"));
    expect(adv).toBeDefined();
    expect(adv!.rowIndex).toBeUndefined();
  });
});

// ── D: chainageOverlapReadinessIssues preserves rowKey ──────────────────────

describe("D: chainageOverlapReadinessIssues preserves rowKey in return value", () => {
  const rows: CandidateChainageRow[] = [
    { rowKey: "r-0", boqItemId: 1, side: "RHS", fromKm: 2.0, toKm: 2.5 },
    { rowKey: "r-1", boqItemId: 1, side: "RHS", fromKm: 2.3, toKm: 2.8 },
  ];

  it("rowKey is present on every returned issue", () => {
    const issues = chainageOverlapReadinessIssues(rows, []);
    expect(issues.length).toBe(2);
    const keys = issues.map((i) => i.rowKey);
    expect(keys).toContain("r-0");
    expect(keys).toContain("r-1");
  });

  it("issue section is always 'activities'", () => {
    const issues = chainageOverlapReadinessIssues(rows, []);
    expect(issues.every((i) => i.section === "activities")).toBe(true);
  });

  it("prior-DPR overlap also carries rowKey", () => {
    const candidate: CandidateChainageRow[] = [
      { rowKey: 42, boqItemId: 1, side: "RHS", fromKm: 2.15, toKm: 2.18 },
    ];
    const prior: PriorChainageEntry[] = [
      {
        entryId: 900, dprId: 123, dprDate: "2026-08-08", boqItemId: 1,
        side: "RHS", fromKm: 2.0, toKm: 2.3, quantity: 100, uom: "Cum",
      },
    ];
    const issues = chainageOverlapReadinessIssues(candidate, prior);
    expect(issues.length).toBe(1);
    expect(issues[0].rowKey).toBe(42);
  });

  it("row with chainageOverrideReason suppresses its issue", () => {
    const rowsWithReason: CandidateChainageRow[] = [
      { rowKey: "r-0", boqItemId: 1, side: "RHS", fromKm: 2.0, toKm: 2.5, chainageOverrideReason: "Vegetation regrowth" },
      { rowKey: "r-1", boqItemId: 1, side: "RHS", fromKm: 2.3, toKm: 2.8 },
    ];
    const issues = chainageOverlapReadinessIssues(rowsWithReason, []);
    expect(issues.length).toBe(1);
    expect(issues[0].rowKey).toBe("r-1");
  });
});

// ── E: rowIndex is zero-based and tracks original array position ─────────────

describe("E: rowIndex is zero-based and tracks the original array position", () => {
  it("issue on the third activity row has rowIndex 2", () => {
    const r = evaluateDprSubmitReadiness({
      progress: [
        { activity: "GSB", quantity: 100, chainageFrom: "0+000", chainageTo: "0+200" },
        { activity: "WMM", quantity: 50, chainageFrom: "0+000", chainageTo: "0+100" },
        { activity: "DBM", quantity: null }, // index 2
      ],
    });
    const issue = r.mandatory.find((m) => m.label === "DBM" && m.message.includes("quantity"));
    expect(issue).toBeDefined();
    expect(issue!.rowIndex).toBe(2);
  });

  it("blank placeholder skipped; following real row retains its original index", () => {
    const r = evaluateDprSubmitReadiness({
      progress: [
        { activity: "", quantity: null },    // blank — ignored, index 0
        { activity: "SDBC", quantity: null }, // real issue, index 1
      ],
    });
    const issue = r.mandatory.find((m) => m.label === "SDBC");
    expect(issue).toBeDefined();
    expect(issue!.rowIndex).toBe(1);
  });

  it("issue on the second equipment row has rowIndex 1", () => {
    const r = evaluateDprSubmitReadiness({
      equipment: [
        { machine: "JCB", openingReading: 100, closingReading: 200 }, // ok
        { machine: "Roller", openingReading: 500 },                   // index 1
      ],
    });
    const issue = r.mandatory.find((m) => m.label === "Roller");
    expect(issue).toBeDefined();
    expect(issue!.rowIndex).toBe(1);
  });
});

// ── F: multiple issues carry correct independent rowIndex values ─────────────

describe("F: multiple issues carry correct independent rowIndex values", () => {
  it("two activity issues on rows 0 and 2 carry 0 and 2 respectively", () => {
    const r = evaluateDprSubmitReadiness({
      progress: [
        { activity: "Scarify", quantity: null },       // index 0
        { activity: "Prime", quantity: 100, chainageFrom: "0+000", chainageTo: "0+500" }, // ok
        { activity: "BC", quantity: null },            // index 2
      ],
    });
    const issues = r.mandatory.filter((m) => m.message.includes("quantity"));
    expect(issues.length).toBe(2);
    expect(issues.find((m) => m.label === "Scarify")!.rowIndex).toBe(0);
    expect(issues.find((m) => m.label === "BC")!.rowIndex).toBe(2);
  });

  it("labour issues on separate rows carry their own indices", () => {
    const r = evaluateDprSubmitReadiness({
      labour: [
        { count: 5 },                          // missing category, index 0
        { category: "Skilled", count: null },  // missing count, index 1
        {},                                    // blank — ignored
      ],
    });
    const catIssue = r.mandatory.find((m) => m.message.includes("category"));
    const cntIssue = r.mandatory.find((m) => m.message.includes("count"));
    expect(catIssue!.rowIndex).toBe(0);
    expect(cntIssue!.rowIndex).toBe(1);
  });
});

// ── G: ChainageOverlapIssue carries rowKey but NOT rowIndex ──────────────────

describe("G: chainageOverlapReadinessIssues issues carry rowKey but not rowIndex", () => {
  it("overlap issues have rowKey; rowIndex is not a field on this type", () => {
    const rows: CandidateChainageRow[] = [
      { rowKey: "x0", boqItemId: 1, side: "LHS", fromKm: 1.0, toKm: 2.0 },
      { rowKey: "x1", boqItemId: 1, side: "LHS", fromKm: 1.5, toKm: 2.5 },
    ];
    const issues = chainageOverlapReadinessIssues(rows, []);
    expect(issues.length).toBe(2);
    for (const issue of issues) {
      expect(issue.rowKey).toBeDefined();
      // rowIndex is not a field of ChainageOverlapIssue — must be absent
      expect((issue as any).rowIndex).toBeUndefined();
    }
  });
});

// ── H: overlap-resolution payload validation (exact shapes) ──────────────────
//
// This reimplements the route's validation logic as a pure helper so the
// test is self-contained. The corresponding source code in routes.ts is also
// verified below (I-source-guard) to confirm the route text implements the
// same rules.

describe("H: overlap-resolution payload — strict one-shape validation", () => {
  /**
   * Mirrors the exact validation branches in the PATCH route.
   * Returns null when valid; an error string when invalid.
   */
  function validateOverlapResolutionPayload(body: any): string | null {
    if (body == null || typeof body !== "object" || Array.isArray(body)) return "object required";
    const bodyKeys = Object.keys(body);
    const hasIncidentalKey =
      Object.prototype.hasOwnProperty.call(body, "isIncidental");
    const hasOverrideKey =
      Object.prototype.hasOwnProperty.call(body, "chainageOverrideReason");
    const hasLayerKey =
      Object.prototype.hasOwnProperty.call(body, "layerNo");

    const shapeCount =
      (hasIncidentalKey ? 1 : 0) + (hasOverrideKey ? 1 : 0) + (hasLayerKey ? 1 : 0);
    // More than one shape → cross-contamination → reject
    if (shapeCount > 1) return "mutually exclusive";
    // No shape → reject
    if (shapeCount === 0) return "neither provided";

    // Shape A: isIncidental must be true and incidentalDescription non-empty
    if (hasIncidentalKey) {
      if (body.isIncidental !== true) return "isIncidental must be true";
      const desc =
        typeof body.incidentalDescription === "string"
          ? body.incidentalDescription.trim()
          : "";
      if (!desc) return "incidentalDescription required";
      const allowed = new Set(["isIncidental", "incidentalDescription"]);
      if (bodyKeys.length !== 2 || bodyKeys.some((key) => !allowed.has(key))) return "unexpected incidental fields";
    }

    // Shape B: chainageOverrideReason must be a non-empty string
    if (hasOverrideKey) {
      const hasOverrideReason =
        typeof body.chainageOverrideReason === "string" &&
        body.chainageOverrideReason.trim() !== "";
      if (!hasOverrideReason) return "chainageOverrideReason must be non-empty";
      if (bodyKeys.length !== 1 || bodyKeys[0] !== "chainageOverrideReason") return "unexpected payable fields";
    }

    // Shape C: layerNo must be a positive integer (never cleared to null)
    if (hasLayerKey) {
      const raw = body.layerNo;
      if (typeof raw !== "number" || !Number.isInteger(raw) || raw <= 0) return "layerNo must be a positive integer";
      if (bodyKeys.length !== 1 || bodyKeys[0] !== "layerNo") return "unexpected layer fields";
    }

    return null; // valid
  }

  it("Shape A — valid incidental payload passes", () => {
    expect(
      validateOverlapResolutionPayload({
        isIncidental: true,
        incidentalDescription: "Emergency road repair",
      }),
    ).toBeNull();
  });

  it("Shape B — valid override-reason payload passes", () => {
    expect(
      validateOverlapResolutionPayload({
        chainageOverrideReason: "Vegetation regrowth / repeat clearing",
      }),
    ).toBeNull();
  });

  it("Shape C — valid positive-integer layerNo payload passes", () => {
    expect(validateOverlapResolutionPayload({ layerNo: 2 })).toBeNull();
    expect(validateOverlapResolutionPayload({ layerNo: 1 })).toBeNull();
  });

  it("Shape C — invalid layerNo values are rejected", () => {
    // zero, negative, non-integer, non-number, null → all invalid
    expect(validateOverlapResolutionPayload({ layerNo: 0 })).toBe("layerNo must be a positive integer");
    expect(validateOverlapResolutionPayload({ layerNo: -3 })).toBe("layerNo must be a positive integer");
    expect(validateOverlapResolutionPayload({ layerNo: 1.5 })).toBe("layerNo must be a positive integer");
    expect(validateOverlapResolutionPayload({ layerNo: "2" })).toBe("layerNo must be a positive integer");
    // null is not allowed — the direct correction flow never clears to null
    expect(validateOverlapResolutionPayload({ layerNo: null })).toBe("layerNo must be a positive integer");
  });

  it("Shape C — rejects extra fields alongside layerNo", () => {
    expect(validateOverlapResolutionPayload({ layerNo: 2, quantity: 5 })).toBe("unexpected layer fields");
  });

  it("layerNo combined with another shape → mutually exclusive", () => {
    expect(validateOverlapResolutionPayload({ layerNo: 2, isIncidental: true, incidentalDescription: "x" })).toBe("mutually exclusive");
    expect(validateOverlapResolutionPayload({ layerNo: 2, chainageOverrideReason: "x" })).toBe("mutually exclusive");
  });

  it("both isIncidental and chainageOverrideReason present → mutually exclusive", () => {
    expect(
      validateOverlapResolutionPayload({
        isIncidental: true,
        incidentalDescription: "Repair",
        chainageOverrideReason: "Some reason",
      }),
    ).toBe("mutually exclusive");
  });

  it("neither key present → neither provided", () => {
    expect(validateOverlapResolutionPayload({})).toBe("neither provided");
  });

  it("isIncidental=false with no override key → treated as 'isIncidental key present but false'", () => {
    // isIncidental=false sends the incidental-shape key with an invalid value
    expect(validateOverlapResolutionPayload({ isIncidental: false })).toBe(
      "isIncidental must be true",
    );
  });

  it("chainageOverrideReason empty string is treated as 'key absent' (hasOwnProperty but empty)", () => {
    // Empty string: key is present but its value is "", which fails hasOverrideReason check
    expect(validateOverlapResolutionPayload({ chainageOverrideReason: "" })).toBe(
      "chainageOverrideReason must be non-empty",
    );
    expect(validateOverlapResolutionPayload({ chainageOverrideReason: "   " })).toBe(
      "chainageOverrideReason must be non-empty",
    );
  });

  it("isIncidental=true without incidentalDescription → error", () => {
    expect(
      validateOverlapResolutionPayload({ isIncidental: true }),
    ).toBe("incidentalDescription required");
    expect(
      validateOverlapResolutionPayload({ isIncidental: true, incidentalDescription: "" }),
    ).toBe("incidentalDescription required");
    expect(
      validateOverlapResolutionPayload({ isIncidental: true, incidentalDescription: "   " }),
    ).toBe("incidentalDescription required");
  });

  it("chainageOverrideReason non-string types: 0 → key present but non-empty check fails", () => {
    // 0 is not a string → hasOverrideReason = false
    expect(validateOverlapResolutionPayload({ chainageOverrideReason: 0 })).toBe(
      "chainageOverrideReason must be non-empty",
    );
  });

  it("rejects arbitrary extra fields in both payload shapes", () => {
    expect(validateOverlapResolutionPayload({
      isIncidental: true,
      incidentalDescription: "Repair",
      quantity: 999,
    })).toBe("unexpected incidental fields");
    expect(validateOverlapResolutionPayload({
      chainageOverrideReason: "Repeat work",
      isDeleted: true,
    })).toBe("unexpected payable fields");
  });
});

// ── H-source: verify the route actually implements strict single-shape logic ─

describe("H-source: route source implements strict cross-contamination check", () => {
  it("route PATCH handler contains hasOwnProperty cross-contamination guard", async () => {
    const fs = await import("node:fs/promises");
    const routes = await fs.readFile("server/routes.ts", "utf8");
    const routeSlice = routes.slice(
      routes.indexOf("app.patch(\"/api/progress-entries/:id/overlap-resolution\""),
      routes.indexOf("// Batch 06B — prior submitted chainage progress"),
    );
    // Must use hasOwnProperty (or Object.prototype.hasOwnProperty) for strict key check
    expect(routeSlice).toContain("hasOwnProperty");
    // Must reject any combination of shapes (three-shape mutual exclusion).
    expect(routeSlice).toContain("shapeCount");
    // Must use typed storage methods (no 'storage as any')
    expect(routeSlice).toContain("storage.getProgressEntryWithDpr");
    expect(routeSlice).toContain("storage.updateProgressEntryClassification");
    // Must check DPR editability
    expect(routeSlice).toContain("dprIsCancelled");
    expect(routeSlice).toContain("dprIsDeleted");
    expect(routeSlice).toContain("dprIsSuperseded");
    // Must reject unsupported fields rather than silently ignoring them.
    expect(routeSlice).toContain("bodyKeys.length !== 2");
    expect(routeSlice).toContain("bodyKeys.length !== 1");
  });

  it("route implements Shape C layer correction guarded and layer-only", async () => {
    const fs = await import("node:fs/promises");
    const routes = await fs.readFile("server/routes.ts", "utf8");
    const routeSlice = routes.slice(
      routes.indexOf("app.patch(\"/api/progress-entries/:id/overlap-resolution\""),
      routes.indexOf("// Batch 06B — prior submitted chainage progress"),
    );
    // Third shape key + positive-integer validation.
    expect(routeSlice).toContain("hasLayerKey");
    expect(routeSlice).toContain("layerNo must be a positive integer");
    // Uses a dedicated typed storage method that updates only layer_no.
    expect(routeSlice).toContain("storage.updateProgressEntryLayer");
    // Layer branch runs AFTER the same auth/site/parent-state guards.
    const layerBranchIdx = routeSlice.indexOf("if (hasLayerKey) {\n        const newLayer");
    const siteGuardIdx = routeSlice.indexOf("Access denied for this site");
    const dprGuardIdx = routeSlice.indexOf("dprIsSuperseded");
    expect(layerBranchIdx).toBeGreaterThan(siteGuardIdx);
    expect(layerBranchIdx).toBeGreaterThan(dprGuardIdx);
    // Capability boundary — reuses shared isLayerCapableItem, no duplicated classifier.
    expect(routeSlice).toContain("isLayerCapableItem");
    expect(routeSlice).toContain("storage.getBoqItem");
    // Both exemption branches present: capable item OR existing layer.
    expect(routeSlice).toContain("itemIsCapable");
    expect(routeSlice).toContain("hasExistingLayer");
  });

  it("routes.ts imports isLayerCapableItem from @shared/layerDisplay (no duplicated predicate)", async () => {
    const fs = await import("node:fs/promises");
    const routes = await fs.readFile("server/routes.ts", "utf8");
    // Must import from the canonical shared location.
    expect(routes).toMatch(/import\s*\{[^}]*isLayerCapableItem[^}]*\}\s*from\s*["']@shared\/layerDisplay["']/);
  });

  it("storage canonicalizes transitions so classifications cannot contradict", async () => {
    const fs = await import("node:fs/promises");
    const storage = await fs.readFile("server/storage.ts", "utf8");
    const methodStart = storage.indexOf("async updateProgressEntryClassification(");
    const methodEnd = storage.indexOf("private async collectVersionChainAncestors", methodStart);
    const method = storage.slice(methodStart, methodEnd);
    expect(method).toContain("chainageOverrideReason: null");
    expect(method).toContain("isIncidental: false");
    expect(method).toContain("incidentalDescription: null");
  });

  it("storage updateProgressEntryLayer updates ONLY layer_no and returns the row", async () => {
    const fs = await import("node:fs/promises");
    const storage = await fs.readFile("server/storage.ts", "utf8");
    const methodStart = storage.indexOf("async updateProgressEntryLayer(");
    expect(methodStart).toBeGreaterThan(-1);
    const method = storage.slice(methodStart, methodStart + 600);
    // Only layer_no is set — no classification fields touched here.
    expect(method).toContain(".set({ layerNo }");
    expect(method).not.toContain("isIncidental");
    expect(method).not.toContain("chainageOverrideReason");
    expect(method).toContain(".returning()");
  });
});

// ── I: open-today strict destinationSite-only filter ────────────────────────

describe("I: open-today strict destinationSite-only filtering (no siteName fallback)", () => {
  /**
   * Mirrors the EXACT filter used in both branches of the open-today route.
   * The route now uses only destinationSite — records without destinationSite
   * are NOT returned to any DPR site context.
   */
  function normaliseSiteLabel(s: unknown): string {
    return String(s ?? "").replace(/ [–-] (Edited by|Copy by) .+$/, "").trim().toLowerCase();
  }

  function filterOpenToday(records: any[], site: string): any[] {
    const wanted = normaliseSiteLabel(site);
    // Strict: destinationSite only — no ?? siteName fallback
    return records.filter((u: any) => normaliseSiteLabel(u.destinationSite) === wanted);
  }

  it("records with matching destinationSite are returned", () => {
    const records = [
      { id: 1, destinationSite: "Takkadpally", siteName: "PLANT" },
      { id: 2, destinationSite: "FDR KK Road", siteName: "PLANT" },
    ];
    const result = filterOpenToday(records, "Takkadpally");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(1);
  });

  it("record with null destinationSite is NOT returned (strict, no siteName fallback)", () => {
    const records = [
      { id: 3, destinationSite: null, siteName: "Takkadpally" },
      { id: 4, destinationSite: null, siteName: "PLANT" },
    ];
    // Neither record has a destinationSite matching "Takkadpally"
    const result = filterOpenToday(records, "Takkadpally");
    expect(result).toHaveLength(0);
  });

  it("destinationSite is the sole ownership field — siteName irrelevant", () => {
    const records = [
      { id: 5, destinationSite: "Takkadpally", siteName: "PLANT" },
    ];
    // PLANT does NOT see this record — destinationSite says Takkadpally
    expect(filterOpenToday(records, "PLANT")).toHaveLength(0);
    // Takkadpally sees it
    expect(filterOpenToday(records, "Takkadpally")).toHaveLength(1);
  });

  it("site label is matched case-insensitively", () => {
    const records = [
      { id: 6, destinationSite: "TAKKADPALLY", siteName: "PLANT" },
    ];
    expect(filterOpenToday(records, "takkadpally")).toHaveLength(1);
    expect(filterOpenToday(records, "Takkadpally")).toHaveLength(1);
    expect(filterOpenToday(records, "TAKKADPALLY")).toHaveLength(1);
  });

  it("edited-by suffix in destinationSite is stripped before comparison", () => {
    const records = [
      { id: 7, destinationSite: "Takkadpally – Edited by Admin – 2026-08-10 09:00:00" },
    ];
    expect(filterOpenToday(records, "Takkadpally")).toHaveLength(1);
  });

  it("record with empty-string destinationSite is NOT returned", () => {
    const records = [
      { id: 8, destinationSite: "", siteName: "Takkadpally" },
    ];
    expect(filterOpenToday(records, "Takkadpally")).toHaveLength(0);
  });
});

// ── I-source: verify route implements strict destinationSite-only filter ─────

describe("I-source: route source does NOT use siteName fallback for open-today", () => {
  it("open-today handler filters on destinationSite only (no ?? u.siteName)", async () => {
    const fs = await import("node:fs/promises");
    const routes = await fs.readFile("server/routes.ts", "utf8");
    const routeSlice = routes.slice(
      routes.indexOf("app.get(\"/api/plant-module/equipment-usage/open-today\""),
      routes.indexOf("// Get previous diesel balance and closing reading"),
    );
    // Must NOT use the siteName fallback in the open-today filter
    expect(routeSlice).not.toContain("?? u.siteName");
    expect(routeSlice).not.toContain("?? (u as any).siteName");
    // Must filter on destinationSite
    expect(routeSlice).toContain("destinationSite");
    // Site param is required
    expect(routeSlice).toContain("site is required");
    // Permission check in both branches
    expect(routeSlice).toContain("siteMatchesPermitted");
    // Uses typed storage (no 'storage as any')
    expect(routeSlice).not.toContain("storage as any");
  });
});

// ── J: closePlantUsage — destinationSite primary, siteName legacy fallback ───

describe("J: closePlantUsage destinationSite primary + documented legacy fallback", () => {
  /**
   * Mirrors the site-match guard in closePlantUsageLinkedToEquipment.
   * destinationSite is primary; siteName is a legacy fallback for records
   * that pre-date the field. Both-null → usageSite="" → guard fires false
   * → allows close (fail-open for legacy linked records).
   */
  function normaliseSiteLabel(s: unknown): string {
    return String(s ?? "").replace(/ [–-] (Edited by|Copy by) .+$/, "").trim().toLowerCase();
  }

  function shouldClose(
    usage: { destinationSite?: string | null; siteName?: string | null },
    dprSite: string,
  ): boolean {
    const usageSite = normaliseSiteLabel(
      (usage as any).destinationSite ?? (usage as any).siteName,
    );
    if (usageSite && dprSite && usageSite !== normaliseSiteLabel(dprSite)) return false;
    return true;
  }

  it("usage with matching destinationSite is closed", () => {
    expect(
      shouldClose({ destinationSite: "Takkadpally", siteName: "PLANT" }, "Takkadpally"),
    ).toBe(true);
  });

  it("usage with non-matching destinationSite is skipped", () => {
    expect(
      shouldClose({ destinationSite: "FDR KK Road", siteName: "PLANT" }, "Takkadpally"),
    ).toBe(false);
  });

  it("null destinationSite + matching siteName → legacy fallback allows close", () => {
    expect(
      shouldClose({ destinationSite: null, siteName: "Takkadpally" }, "Takkadpally"),
    ).toBe(true);
  });

  it("null destinationSite + non-matching siteName → legacy fallback skips", () => {
    expect(
      shouldClose({ destinationSite: null, siteName: "Other Site" }, "Takkadpally"),
    ).toBe(false);
  });

  it("both null → usageSite='' → guard condition false → allows close (fail-open for legacy)", () => {
    // usageSite="" so `usageSite && dprSite` is falsy — does not block
    expect(
      shouldClose({ destinationSite: null, siteName: null }, "Takkadpally"),
    ).toBe(true);
  });

  it("dispatch from plant to site — closes on correct DPR, skips wrong DPR", () => {
    expect(
      shouldClose({ destinationSite: "TAKKADPALLY", siteName: "PLANT" }, "Takkadpally"),
    ).toBe(true);
    expect(
      shouldClose({ destinationSite: "TAKKADPALLY", siteName: "PLANT" }, "FDR KK Road"),
    ).toBe(false);
  });
});

// ── J-source: verify route source uses destinationSite ?? siteName (documented) ─

describe("J-source: closePlantUsage route source uses destinationSite with legacy fallback", () => {
  it("closePlantUsage uses destinationSite ?? siteName with documented fallback comment", async () => {
    const fs = await import("node:fs/promises");
    const routes = await fs.readFile("server/routes.ts", "utf8");
    const fnSlice = routes.slice(
      routes.indexOf("async function closePlantUsageLinkedToEquipment"),
      routes.indexOf("// EquipmentHub uses this shorter /plant/ prefix alias"),
    );
    // Uses destinationSite
    expect(fnSlice).toContain("destinationSite");
    // Has the legacy fallback
    expect(fnSlice).toMatch(/destinationSite.*\?\?.*siteName|destinationSite.*\?\?.*\.siteName/);
    // Has a comment documenting the legacy nature
    expect(fnSlice.toLowerCase()).toContain("legacy");
  });
});

// ── K: evaluateDprSubmitReadiness preserves existing behavior ────────────────

describe("K: existing submit-readiness rules are preserved (no regression)", () => {
  it("fully complete DPR has no mandatory issues", () => {
    const r = evaluateDprSubmitReadiness({
      progress: [{ activity: "Embankment", chainageFrom: "2+000", chainageTo: "2+500", quantity: 100 }],
      equipment: [{ machine: "JCB", openingReading: 1000, closingReading: 1050 }],
      labour: [{ category: "Unskilled", count: 10 }],
      materials: [{ material: "GSB", quantity: 50, uom: "Cum" }],
    });
    expect(r.ready).toBe(true);
    expect(r.mandatory).toHaveLength(0);
  });

  it("machine with no usage stays advisory-only (Batch 04 rule preserved)", () => {
    const r = evaluateDprSubmitReadiness({
      equipment: [{ machine: "Grader" }],
    });
    expect(r.ready).toBe(true);
    expect(r.mandatory).toHaveLength(0);
    expect(r.advisories.length).toBeGreaterThan(0);
  });

  it("blank placeholder rows are still ignored", () => {
    const r = evaluateDprSubmitReadiness({
      progress: [{ activity: "", quantity: null }],
      equipment: [{ machine: "" }],
      labour: [{ category: "", count: null, task: "", contractor: "" }],
      materials: [{ material: "" }],
    });
    expect(r.mandatory).toHaveLength(0);
    expect(r.advisories).toHaveLength(0);
  });
});
