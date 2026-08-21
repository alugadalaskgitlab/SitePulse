/**
 * Batch 06W — Schedule Revision Planner tests.
 *
 * Covers:
 *  A  — bar execution state classification (not_started / started / completed)
 *  B  — positive delta shifts not_started successors forward
 *  C  — negative delta shifts not_started successors backward
 *  D  — all overlapping bars across different BOQ items are candidates
 *  E  — non-overlapping bars are excluded
 *  F  — started successors are protected (notShifted)
 *  G  — completed successors are protected (notShifted)
 *  H  — past-start / no-evidence successor still shifts (not_started)
 *  I  — cascade off → source only changes, all successors in notShifted
 *  J  — started source locks effective start to earliest evidence date
 *  K  — completed source rejects with an error
 *  L  — input immutability (no mutation of source objects)
 *  M  — item status: all five states (not_programmed, planned, in_progress, delayed, completed)
 *  N  — ScheduleRevisionRecord / CascadeShiftRecord type shapes compile and carry correct fields
 */

import { describe, it, expect } from "vitest";
import {
  classifyBarExecutionState,
  captureInitialBaseline,
  appendRevisionHistory,
  isAutoSequenceManagedBar,
  planScheduleRevision,
  deriveItemStatus,
  type BarEvidence,
  type BarExecutionState,
  type RevisionBar,
  type ItemStatus,
  type ScheduleRevisionRecord,
  type CascadeShiftRecord,
} from "../shared/programmeRevision";

describe("06W persistence invariants", () => {
  it("captures a baseline once and never replaces it", () => {
    expect(captureInitialBaseline(null, "2026-01-10")).toBe("2026-01-10");
    expect(captureInitialBaseline("2026-01-10", "2026-02-20")).toBe("2026-01-10");
  });

  it("appends history without mutating or replacing prior records", () => {
    const prior = [{ type: "schedule_revision", revisionId: "r1" }];
    const next = appendRevisionHistory(prior, { type: "cascade_shift", revisionId: "r2" });
    expect(prior).toHaveLength(1);
    expect(next).toHaveLength(2);
    expect(next[0]).toEqual(prior[0]);
  });

  it("protects a manually revised legacy-labelled bar from auto reruns", () => {
    expect(isAutoSequenceManagedBar({
      source: "manual",
      legacyAutoLabel: true,
      revisionHistory: [],
    })).toBe(true);
    expect(isAutoSequenceManagedBar({
      source: "manual",
      legacyAutoLabel: true,
      revisionHistory: [{ type: "schedule_revision" }],
    })).toBe(false);
    expect(isAutoSequenceManagedBar({
      source: "auto-sequence",
      legacyAutoLabel: false,
      revisionHistory: [{ type: "schedule_revision" }],
    })).toBe(true);
  });
});

// ── Fixtures ─────────────────────────────────────────────────────────────────

function mkBar(overrides: Partial<RevisionBar> & { id: number }): RevisionBar {
  return {
    boqProjectId: 1,
    boqItemId: 10,
    chainageFrom: 0,
    chainageTo: 5,
    startDate: "2025-06-01",
    endDate: "2025-06-30",
    plannedQty: 1000,
    ...overrides,
  };
}

function mkEvidence(reportedQty: number, earliestProgressDate: string | null = null): BarEvidence {
  return { reportedQty, earliestProgressDate };
}

const NO_EVIDENCE = new Map<number, BarEvidence>();

// ── A: Bar Execution State Classification ────────────────────────────────────

describe("A: classifyBarExecutionState", () => {
  it("returns not_started when evidence is null", () => {
    expect(classifyBarExecutionState(1000, null)).toBe<BarExecutionState>("not_started");
  });

  it("returns not_started when reportedQty=0 and no date", () => {
    expect(classifyBarExecutionState(1000, mkEvidence(0, null))).toBe("not_started");
  });

  it("returns started when reportedQty > 0 but < plannedQty", () => {
    expect(classifyBarExecutionState(1000, mkEvidence(200))).toBe("started");
  });

  it("returns started when reportedQty=0 but earliestProgressDate is set", () => {
    expect(classifyBarExecutionState(1000, mkEvidence(0, "2025-06-05"))).toBe("started");
  });

  it("returns completed when reportedQty >= plannedQty (positive plannedQty)", () => {
    expect(classifyBarExecutionState(1000, mkEvidence(1000))).toBe("completed");
    expect(classifyBarExecutionState(1000, mkEvidence(1200))).toBe("completed");
  });

  it("does NOT complete when plannedQty <= 0 even if reportedQty >= 0", () => {
    // zero plannedQty: reportedQty=0 is not positive evidence => not_started
    expect(classifyBarExecutionState(0, mkEvidence(0))).toBe("not_started");
    // any positive evidence => started (not completed since plannedQty is not positive)
    expect(classifyBarExecutionState(0, mkEvidence(5))).toBe("started");
  });
});

// ── B: Positive delta shifts not_started successors ──────────────────────────

describe("B: positive delta cascade", () => {
  it("shifts not_started successors forward by the delta days", () => {
    const source = mkBar({ id: 1, startDate: "2025-06-01", endDate: "2025-06-30" });
    const successor = mkBar({ id: 2, boqItemId: 10, startDate: "2025-06-30", endDate: "2025-07-29" });

    const result = planScheduleRevision({
      sourceBar: source,
      allProjectBars: [source, successor],
      evidenceMap: NO_EVIDENCE,
      requestedStart: "2025-06-01",
      requestedEnd: "2025-07-15", // +15 days from original end (June 30)
      cascade: true,
    });

    expect(result.delta).toBe(15);
    expect(result.shifted).toHaveLength(1);
    expect(result.shifted[0].id).toBe(2);
    expect(result.shifted[0].startDate).toBe("2025-07-15"); // June 30 + 15
    expect(result.shifted[0].endDate).toBe("2025-08-13");  // July 29 + 15
    expect(result.notShifted).toHaveLength(0);
  });
});

// ── C: Negative delta shifts not_started successors backward ─────────────────

describe("C: negative delta cascade", () => {
  it("shifts not_started successors backward by the negative delta", () => {
    const source = mkBar({ id: 1, startDate: "2025-06-01", endDate: "2025-06-30" });
    const successor = mkBar({ id: 2, startDate: "2025-06-30", endDate: "2025-07-29" });

    const result = planScheduleRevision({
      sourceBar: source,
      allProjectBars: [source, successor],
      evidenceMap: NO_EVIDENCE,
      requestedStart: "2025-06-01",
      requestedEnd: "2025-06-20", // -10 days from original end (June 30)
      cascade: true,
    });

    expect(result.delta).toBe(-10);
    expect(result.shifted).toHaveLength(1);
    expect(result.shifted[0].startDate).toBe("2025-06-20"); // June 30 − 10
    expect(result.shifted[0].endDate).toBe("2025-07-19");   // July 29 − 10
  });
});

// ── D: All overlapping bars across different BOQ items are candidates ─────────

describe("D: cross-BOQ-item cascade", () => {
  it("includes overlapping bars from different BOQ items as successor candidates", () => {
    const source = mkBar({ id: 1, boqItemId: 10, chainageFrom: 0, chainageTo: 5, startDate: "2025-06-01", endDate: "2025-06-30" });
    const succItem11 = mkBar({ id: 2, boqItemId: 11, chainageFrom: 1, chainageTo: 4, startDate: "2025-06-30", endDate: "2025-07-20" });
    const succItem12 = mkBar({ id: 3, boqItemId: 12, chainageFrom: 2, chainageTo: 3, startDate: "2025-06-30", endDate: "2025-07-15" });

    const result = planScheduleRevision({
      sourceBar: source,
      allProjectBars: [source, succItem11, succItem12],
      evidenceMap: NO_EVIDENCE,
      requestedStart: "2025-06-01",
      requestedEnd: "2025-07-10", // +10 days
      cascade: true,
    });

    expect(result.delta).toBe(10);
    const shiftedIds = result.shifted.map(b => b.id).sort();
    expect(shiftedIds).toEqual([2, 3]);
  });
});

// ── E: Non-overlapping bars are excluded ─────────────────────────────────────

describe("E: non-overlapping bars excluded", () => {
  it("does not shift bars whose chainage does not overlap the source bar", () => {
    const source = mkBar({ id: 1, chainageFrom: 0, chainageTo: 5, startDate: "2025-06-01", endDate: "2025-06-30" });
    // Non-overlapping (chainage 6-10)
    const nonOverlap = mkBar({ id: 2, chainageFrom: 6, chainageTo: 10, startDate: "2025-06-30", endDate: "2025-07-20" });

    const result = planScheduleRevision({
      sourceBar: source,
      allProjectBars: [source, nonOverlap],
      evidenceMap: NO_EVIDENCE,
      requestedStart: "2025-06-01",
      requestedEnd: "2025-07-15",
      cascade: true,
    });

    expect(result.shifted).toHaveLength(0);
    expect(result.notShifted).toHaveLength(0);
  });

  it("also excludes successors whose startDate is before the source bar's pre-revision endDate", () => {
    const source = mkBar({ id: 1, chainageFrom: 0, chainageTo: 5, startDate: "2025-06-01", endDate: "2025-06-30" });
    // Overlapping chainage but startDate before source endDate (concurrent bar)
    const concurrent = mkBar({ id: 2, chainageFrom: 0, chainageTo: 5, startDate: "2025-06-15", endDate: "2025-07-15" });

    const result = planScheduleRevision({
      sourceBar: source,
      allProjectBars: [source, concurrent],
      evidenceMap: NO_EVIDENCE,
      requestedStart: "2025-06-01",
      requestedEnd: "2025-07-10",
      cascade: true,
    });

    expect(result.shifted).toHaveLength(0);
    expect(result.notShifted).toHaveLength(0);
  });
});

// ── F: Started successors are protected ──────────────────────────────────────

describe("F: started successors protected", () => {
  it("puts started successors in notShifted with a reason", () => {
    const source = mkBar({ id: 1, startDate: "2025-06-01", endDate: "2025-06-30" });
    const startedSucc = mkBar({ id: 2, startDate: "2025-06-30", endDate: "2025-07-29", plannedQty: 500 });

    const evidenceMap = new Map<number, BarEvidence>([[2, mkEvidence(200)]]);

    const result = planScheduleRevision({
      sourceBar: source,
      allProjectBars: [source, startedSucc],
      evidenceMap,
      requestedStart: "2025-06-01",
      requestedEnd: "2025-07-15",
      cascade: true,
    });

    expect(result.shifted).toHaveLength(0);
    expect(result.notShifted).toHaveLength(1);
    expect(result.notShifted[0].bar.id).toBe(2);
    expect(result.notShifted[0].reason).toMatch(/started/i);
  });
});

// ── G: Completed successors are protected ────────────────────────────────────

describe("G: completed successors protected", () => {
  it("puts completed successors in notShifted with a reason", () => {
    const source = mkBar({ id: 1, startDate: "2025-06-01", endDate: "2025-06-30" });
    const completedSucc = mkBar({ id: 2, startDate: "2025-06-30", endDate: "2025-07-20", plannedQty: 500 });

    const evidenceMap = new Map<number, BarEvidence>([[2, mkEvidence(500)]]);

    const result = planScheduleRevision({
      sourceBar: source,
      allProjectBars: [source, completedSucc],
      evidenceMap,
      requestedStart: "2025-06-01",
      requestedEnd: "2025-07-15",
      cascade: true,
    });

    expect(result.shifted).toHaveLength(0);
    expect(result.notShifted).toHaveLength(1);
    expect(result.notShifted[0].bar.id).toBe(2);
    expect(result.notShifted[0].reason).toMatch(/completed/i);
  });
});

// ── H: Past-start / no-evidence successor still shifts ───────────────────────

describe("H: past-start / no-evidence successor shifts", () => {
  it("shifts a successor with no evidence even if its startDate is in the past (relative to today)", () => {
    // Source bar ends June 30; successor starts June 30 (on/after source pre-revision end)
    // Successor has no evidence, so it is "not_started" → still shiftable
    const source = mkBar({ id: 1, startDate: "2025-06-01", endDate: "2025-06-30" });
    const pastStartSucc = mkBar({
      id: 2,
      startDate: "2025-06-30",
      endDate: "2025-07-29",
      plannedQty: 400,
    });

    // No evidence for bar 2
    const result = planScheduleRevision({
      sourceBar: source,
      allProjectBars: [source, pastStartSucc],
      evidenceMap: NO_EVIDENCE,
      requestedStart: "2025-06-01",
      requestedEnd: "2025-07-15",
      cascade: true,
    });

    expect(result.shifted).toHaveLength(1);
    expect(result.shifted[0].id).toBe(2);
    expect(result.notShifted).toHaveLength(0);
  });
});

// ── I: Cascade off ────────────────────────────────────────────────────────────

describe("I: cascade off", () => {
  it("with cascade=false, only the source bar is revised and successors go to notShifted", () => {
    const source = mkBar({ id: 1, startDate: "2025-06-01", endDate: "2025-06-30" });
    const succ1 = mkBar({ id: 2, startDate: "2025-06-30", endDate: "2025-07-20" });
    const succ2 = mkBar({ id: 3, startDate: "2025-06-30", endDate: "2025-07-15" });

    const result = planScheduleRevision({
      sourceBar: source,
      allProjectBars: [source, succ1, succ2],
      evidenceMap: NO_EVIDENCE,
      requestedStart: "2025-06-01",
      requestedEnd: "2025-07-10",
      cascade: false,
    });

    expect(result.shifted).toHaveLength(0);
    expect(result.notShifted).toHaveLength(2);
    expect(result.notShifted.every(ns => ns.reason.toLowerCase().includes("cascade"))).toBe(true);
    // Source bar revised
    expect(result.revisedSource.endDate).toBe("2025-07-10");
    expect(result.delta).toBe(10);
  });
});

// ── J: Started source locks effective start ───────────────────────────────────

describe("J: started source locks effective start", () => {
  it("uses earliestProgressDate as effective start for a started source bar", () => {
    const source = mkBar({ id: 1, startDate: "2025-06-01", endDate: "2025-06-30", plannedQty: 1000 });
    const evidenceMap = new Map<number, BarEvidence>([
      [1, mkEvidence(200, "2025-06-10")],
    ]);

    const result = planScheduleRevision({
      sourceBar: source,
      allProjectBars: [source],
      evidenceMap,
      requestedStart: "2025-05-20", // ignored for started bar
      requestedEnd: "2025-07-15",
      cascade: false,
    });

    // Effective start locked to earliest evidence date, not requested start
    expect(result.revisedSource.startDate).toBe("2025-06-10");
    expect(result.revisedSource.endDate).toBe("2025-07-15");
  });

  it("falls back to original startDate when started but no earliestProgressDate", () => {
    const source = mkBar({ id: 1, startDate: "2025-06-01", endDate: "2025-06-30", plannedQty: 1000 });
    const evidenceMap = new Map<number, BarEvidence>([
      [1, mkEvidence(200, null)], // started (positive qty) but no date
    ]);

    const result = planScheduleRevision({
      sourceBar: source,
      allProjectBars: [source],
      evidenceMap,
      requestedStart: "2025-05-20",
      requestedEnd: "2025-07-15",
      cascade: false,
    });

    // Falls back to original startDate
    expect(result.revisedSource.startDate).toBe("2025-06-01");
    expect(result.revisedSource.endDate).toBe("2025-07-15");
  });
});

// ── K: Completed source rejects ───────────────────────────────────────────────

describe("K: completed source rejects", () => {
  it("throws when attempting to revise a completed bar", () => {
    const source = mkBar({ id: 1, startDate: "2025-06-01", endDate: "2025-06-30", plannedQty: 500 });
    const evidenceMap = new Map<number, BarEvidence>([[1, mkEvidence(500)]]);

    expect(() =>
      planScheduleRevision({
        sourceBar: source,
        allProjectBars: [source],
        evidenceMap,
        requestedStart: "2025-06-01",
        requestedEnd: "2025-07-15",
        cascade: false,
      })
    ).toThrow(/completed/i);
  });

  it("throws for invalid date order (start after end)", () => {
    const source = mkBar({ id: 1, startDate: "2025-06-01", endDate: "2025-06-30" });

    expect(() =>
      planScheduleRevision({
        sourceBar: source,
        allProjectBars: [source],
        evidenceMap: NO_EVIDENCE,
        requestedStart: "2025-07-20",
        requestedEnd: "2025-07-10", // before start
        cascade: false,
      })
    ).toThrow();
  });
});

// ── L: Input immutability ─────────────────────────────────────────────────────

describe("L: input immutability", () => {
  it("does not mutate the source bar", () => {
    const source = mkBar({ id: 1, startDate: "2025-06-01", endDate: "2025-06-30" });
    const originalStart = source.startDate;
    const originalEnd = source.endDate;

    planScheduleRevision({
      sourceBar: source,
      allProjectBars: [source],
      evidenceMap: NO_EVIDENCE,
      requestedStart: "2025-06-05",
      requestedEnd: "2025-07-20",
      cascade: false,
    });

    expect(source.startDate).toBe(originalStart);
    expect(source.endDate).toBe(originalEnd);
  });

  it("does not mutate successor bars", () => {
    const source = mkBar({ id: 1, startDate: "2025-06-01", endDate: "2025-06-30" });
    const succ = mkBar({ id: 2, startDate: "2025-06-30", endDate: "2025-07-20" });
    const originalSuccStart = succ.startDate;
    const originalSuccEnd = succ.endDate;

    planScheduleRevision({
      sourceBar: source,
      allProjectBars: [source, succ],
      evidenceMap: NO_EVIDENCE,
      requestedStart: "2025-06-01",
      requestedEnd: "2025-07-15",
      cascade: true,
    });

    expect(succ.startDate).toBe(originalSuccStart);
    expect(succ.endDate).toBe(originalSuccEnd);
  });

  it("does not mutate the allProjectBars array", () => {
    const source = mkBar({ id: 1, startDate: "2025-06-01", endDate: "2025-06-30" });
    const succ = mkBar({ id: 2, startDate: "2025-06-30", endDate: "2025-07-20" });
    const bars = [source, succ];
    const originalLength = bars.length;

    planScheduleRevision({
      sourceBar: source,
      allProjectBars: bars,
      evidenceMap: NO_EVIDENCE,
      requestedStart: "2025-06-01",
      requestedEnd: "2025-07-15",
      cascade: true,
    });

    expect(bars).toHaveLength(originalLength);
  });
});

// ── M: All five item statuses ─────────────────────────────────────────────────

describe("M: deriveItemStatus — all five states", () => {
  const today = "2025-07-01";

  it("not_programmed when no active bars", () => {
    const status = deriveItemStatus([], NO_EVIDENCE, today);
    expect(status).toBe<ItemStatus>("not_programmed");
  });

  it("completed when all bars are completed", () => {
    const bar1 = mkBar({ id: 1, startDate: "2025-05-01", endDate: "2025-05-31", plannedQty: 500 });
    const bar2 = mkBar({ id: 2, startDate: "2025-06-01", endDate: "2025-06-15", plannedQty: 300 });
    const evidence = new Map<number, BarEvidence>([
      [1, mkEvidence(500)],
      [2, mkEvidence(300)],
    ]);
    const status = deriveItemStatus([bar1, bar2], evidence, today);
    expect(status).toBe<ItemStatus>("completed");
  });

  it("delayed when incomplete bar has endDate before today", () => {
    // Bar ended before today, not yet completed
    const bar1 = mkBar({ id: 1, startDate: "2025-05-01", endDate: "2025-06-20", plannedQty: 500 });
    const evidence = new Map<number, BarEvidence>([[1, mkEvidence(200)]]);
    const status = deriveItemStatus([bar1], evidence, today);
    // today is 2025-07-01, endDate is 2025-06-20 (before today), not completed → delayed
    expect(status).toBe<ItemStatus>("delayed");
  });

  it("in_progress when a bar has started", () => {
    const bar1 = mkBar({ id: 1, startDate: "2025-06-01", endDate: "2025-07-31", plannedQty: 500 });
    const evidence = new Map<number, BarEvidence>([[1, mkEvidence(200)]]);
    const status = deriveItemStatus([bar1], evidence, today);
    expect(status).toBe<ItemStatus>("in_progress");
  });

  it("in_progress when today is inside a bar schedule window (not started)", () => {
    // No evidence, but today (2025-07-01) is inside [2025-06-15, 2025-07-31]
    const bar1 = mkBar({ id: 1, startDate: "2025-06-15", endDate: "2025-07-31", plannedQty: 500 });
    const status = deriveItemStatus([bar1], NO_EVIDENCE, today);
    expect(status).toBe<ItemStatus>("in_progress");
  });

  it("planned when bar exists but not started and today is before start", () => {
    // Bar starts in the future
    const bar1 = mkBar({ id: 1, startDate: "2025-08-01", endDate: "2025-09-30", plannedQty: 500 });
    const status = deriveItemStatus([bar1], NO_EVIDENCE, today);
    expect(status).toBe<ItemStatus>("planned");
  });

  it("delayed wins over in_progress when both conditions apply", () => {
    // bar1 ended before today (incomplete) → delayed
    // bar2 is active today → would be in_progress
    const bar1 = mkBar({ id: 1, startDate: "2025-04-01", endDate: "2025-05-31", plannedQty: 500 });
    const bar2 = mkBar({ id: 2, startDate: "2025-06-15", endDate: "2025-07-31", plannedQty: 300 });
    // bar1 has some evidence but not completed
    const evidence = new Map<number, BarEvidence>([[1, mkEvidence(200)]]);
    const status = deriveItemStatus([bar1, bar2], evidence, today);
    expect(status).toBe<ItemStatus>("delayed");
  });
});

// ── N: Revision history type shapes ──────────────────────────────────────────

describe("N: revision history type shapes", () => {
  it("ScheduleRevisionRecord has required date, reason, actor and createdAt fields", () => {
    const record: ScheduleRevisionRecord = {
      id: 1,
      barId: 42,
      originalStartDate: "2025-06-01",
      originalEndDate: "2025-06-30",
      revisedStartDate: "2025-06-01",
      revisedEndDate: "2025-07-15",
      delta: 15,
      reason: "contractor delayed mobilisation",
      cascadeApplied: true,
      actorId: 7,
      actorName: "Site Engineer",
      createdAt: "2025-06-25T10:00:00.000Z",
    };
    expect(record.barId).toBe(42);
    expect(record.delta).toBe(15);
    expect(record.reason).toBeTruthy();
    expect(record.cascadeApplied).toBe(true);
    expect(record.actorId).toBe(7);
    expect(record.createdAt).toContain("T");
  });

  it("ScheduleRevisionRecord actorId is nullable (actor-agnostic planner)", () => {
    const record: ScheduleRevisionRecord = {
      id: 2,
      barId: 43,
      originalStartDate: "2025-06-01",
      originalEndDate: "2025-06-30",
      revisedStartDate: "2025-06-05",
      revisedEndDate: "2025-07-20",
      delta: 20,
      reason: "scope extended",
      cascadeApplied: false,
      actorId: null,
      actorName: null,
      createdAt: "2025-06-26T09:00:00.000Z",
    };
    expect(record.actorId).toBeNull();
    expect(record.actorName).toBeNull();
  });

  it("CascadeShiftRecord has sourceRevisionId, barId, date fields, actor and createdAt", () => {
    const record: CascadeShiftRecord = {
      id: 10,
      sourceRevisionId: 1,
      barId: 55,
      originalStartDate: "2025-06-30",
      originalEndDate: "2025-07-29",
      shiftedStartDate: "2025-07-15",
      shiftedEndDate: "2025-08-13",
      delta: 15,
      actorId: 7,
      actorName: "Site Engineer",
      createdAt: "2025-06-25T10:00:00.000Z",
    };
    expect(record.sourceRevisionId).toBe(1);
    expect(record.barId).toBe(55);
    expect(record.delta).toBe(15);
    expect(record.createdAt).toBeTruthy();
  });
});
