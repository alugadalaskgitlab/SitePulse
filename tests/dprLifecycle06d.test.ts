/**
 * Batch 06D — Field Home DPR lifecycle + Save Draft exit + pending guidance.
 *
 * Covers the pure seams behind:
 *  - readiness-section → Guided-step mapping (firstIncompleteGuidedStep);
 *  - "Complete" intent href (roadDprDraftHref complete flag);
 *  - older-pending-DPR detection (findOlderPendingDprs);
 *  - itemised pending lines from the SHARED checklist (deriveDprChecklist);
 *  - no doneCount-based lifecycle phase split.
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  firstIncompleteGuidedStep,
  READINESS_SECTION_TO_GUIDED_STEP,
  GUIDED_STEPS,
} from "../client/src/lib/guidedWizard";
import { roadDprDraftHref, setDprEntryMode, bindDprEntryModeUser } from "../client/src/lib/dprEntryMode";
import { findOlderPendingDprs } from "../client/src/lib/dprLifecycle";
import { deriveDprChecklist } from "../shared/dprFieldChecklist";
import { evaluateDprSubmitReadiness } from "../shared/dprSubmitReadiness";

// ─── §10/§11 Readiness-section → Guided-step mapping ────────────────────────

describe("firstIncompleteGuidedStep (06D §10–§11)", () => {
  it("maps semantic sections, not checklist item ids", () => {
    expect(READINESS_SECTION_TO_GUIDED_STEP).toEqual({
      activities: 3, labour: 4, equipment: 5, materials: 7,
    });
  });

  it("activities issues open the Details step (3)", () => {
    expect(firstIncompleteGuidedStep(["activities"])).toBe(3);
  });

  it("labour → 4, equipment → 5, materials → Review (7)", () => {
    expect(firstIncompleteGuidedStep(["labour"])).toBe(4);
    expect(firstIncompleteGuidedStep(["equipment"])).toBe(5);
    expect(firstIncompleteGuidedStep(["materials"])).toBe(7);
  });

  it("picks the EARLIEST relevant step when several sections are incomplete", () => {
    expect(firstIncompleteGuidedStep(["equipment", "activities", "labour"])).toBe(3);
    expect(firstIncompleteGuidedStep(["materials", "equipment"])).toBe(5);
  });

  it("no mandatory incomplete section → Review (7)", () => {
    expect(firstIncompleteGuidedStep([])).toBe(7);
  });

  it("unknown sections are ignored (defensive)", () => {
    expect(firstIncompleteGuidedStep(["weather" as any])).toBe(7);
  });

  it("mapped steps exist in the current 7-step wizard model", () => {
    const ids = GUIDED_STEPS.map(s => s.id as number);
    for (const step of Object.values(READINESS_SECTION_TO_GUIDED_STEP)) {
      expect(ids).toContain(step);
    }
  });

  it("integrates with the SHARED readiness validator output (no new rules)", () => {
    const r = evaluateDprSubmitReadiness({
      workType: "road",
      progress: [{ activity: "WMM", chainageFrom: "2+500", chainageTo: "", quantity: null }],
      equipment: [{ machine: "Roller", openingReading: 1250, closingReading: null, startTime: "08:30", endTime: "" }],
      labour: [],
      materials: [],
    });
    const sections = r.mandatory.map(i => i.section);
    expect(sections).toContain("activities");
    expect(sections).toContain("equipment");
    // earliest relevant step is Details (3), never Review-dump
    expect(firstIncompleteGuidedStep(sections)).toBe(3);
  });
});

// ─── §12 Complete-intent href ────────────────────────────────────────────────

describe("roadDprDraftHref complete intent (06D §12)", () => {
  beforeEach(() => {
    // node test env has no localStorage — stub the minimal surface the
    // entry-mode module touches (it degrades gracefully otherwise).
    const store = new Map<string, string>();
    (globalThis as any).localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => { store.set(k, v); },
      removeItem: (k: string) => { store.delete(k); },
      clear: () => { store.clear(); },
    };
    bindDprEntryModeUser(42);
  });

  it("guided draft href carries complete=1 only when requested", () => {
    setDprEntryMode("guided");
    expect(roadDprDraftHref(9, "/")).toBe("/site/guided?draftId=9&returnTo=%2F");
    expect(roadDprDraftHref(9, "/", { complete: true }))
      .toBe("/site/guided?draftId=9&complete=1&returnTo=%2F");
  });

  it("reopens the SAME draft id — never a create route", () => {
    setDprEntryMode("guided");
    const href = roadDprDraftHref(123, "/", { complete: true });
    expect(href).toContain("draftId=123");
    expect(href).not.toContain("/site/new");
  });

  it("detailed preference never gets a step-jump flag (no wizard steps there)", () => {
    setDprEntryMode("detailed");
    expect(roadDprDraftHref(9, "/", { complete: true })).toBe("/site/edit/9?draft&returnTo=%2F");
  });
});

// ─── §13–§16 Older pending DPR detection ────────────────────────────────────

describe("findOlderPendingDprs (06D §13–§16)", () => {
  const base = { site: "NH-44 Widening", isSuperseded: false };
  const opts = { todayStr: "2026-08-11", siteName: "NH-44 Widening", myName: "Ramesh" };

  it("detects yesterday's own unsubmitted DPR", () => {
    const rows = [
      { id: 1, date: "2026-08-10", engineer: "RAMESH - SUPERVISOR", status: "draft", ...base },
      { id: 2, date: "2026-08-11", engineer: "RAMESH - SUPERVISOR", status: "draft", ...base },
    ];
    const out = findOlderPendingDprs(rows, opts);
    expect(out.map(d => d.id)).toEqual([1]); // today's row excluded
  });

  it("older SUBMITTED DPR does not appear", () => {
    const rows = [
      { id: 1, date: "2026-08-10", engineer: "Ramesh", status: "submitted", ...base },
      { id: 2, date: "2026-08-09", engineer: "Ramesh", status: "draft", submittedAt: "2026-08-09 18:00", ...base },
    ];
    expect(findOlderPendingDprs(rows, opts)).toEqual([]);
  });

  it("another engineer's old draft is never shown as the current user's", () => {
    const rows = [{ id: 1, date: "2026-08-10", engineer: "SURESH - ENGINEER", status: "draft", ...base }];
    expect(findOlderPendingDprs(rows, opts)).toEqual([]);
  });

  it("superseded and other-site rows are excluded", () => {
    const rows = [
      { id: 1, date: "2026-08-10", engineer: "Ramesh", status: "draft", site: "NH-44 Widening", isSuperseded: true },
      { id: 2, date: "2026-08-10", engineer: "Ramesh", status: "draft", site: "Other Bypass", isSuperseded: false },
    ];
    expect(findOlderPendingDprs(rows, opts)).toEqual([]);
  });

  it("site name with edit suffix still matches", () => {
    const rows = [{ id: 1, date: "2026-08-10", engineer: "Ramesh", status: "draft", site: "NH-44 Widening – Edited by Manager – x", isSuperseded: false }];
    expect(findOlderPendingDprs(rows, opts).map(d => d.id)).toEqual([1]);
  });

  it("multiple pending drafts are ALL returned, most recent first (never collapsed)", () => {
    const rows = [
      { id: 1, date: "2026-08-07", engineer: "Ramesh", status: "draft", ...base },
      { id: 2, date: "2026-08-10", engineer: "Ramesh", status: "draft", ...base },
      { id: 3, date: "2026-08-09", engineer: "Ramesh", status: "draft", ...base },
    ];
    expect(findOlderPendingDprs(rows, opts).map(d => d.id)).toEqual([2, 3, 1]);
  });
});

// ─── §7–§8 Itemised pending guidance from the SHARED checklist ──────────────

describe("pending guidance uses deriveDprChecklist details (06D §7–§8)", () => {
  const draft = {
    workType: "road",
    progress: [{ activity: "WMM", chainageFrom: "2+500", chainageTo: "", quantity: null }],
    equipment: [{ machine: "Roller TS09", openingReading: 1250, closingReading: null, startTime: "08:30", endTime: "" }],
    labour: [],
    materials: [],
  };

  it("activity pending line names the actual chainage/quantity issue", () => {
    const { items } = deriveDprChecklist(draft, false);
    const act = items.find(i => i.id === "c4")!;
    expect(act.state).toBe("pending");
    expect(act.details.some(l => l.startsWith("WMM — "))).toBe(true);
  });

  it("equipment pending lines name closing reading and end time", () => {
    const { items } = deriveDprChecklist(draft, false);
    const eq = items.find(i => i.id === "c1")!;
    expect(eq.state).toBe("pending");
    expect(eq.details.join(" ")).toMatch(/closing/i);
    expect(eq.details.every(l => l.startsWith("Roller TS09 — "))).toBe(true);
  });

  it("'X items need completion' counts the validator's detail lines", () => {
    const { items } = deriveDprChecklist(draft, false);
    const n = items.flatMap(i => i.details).length;
    expect(n).toBeGreaterThanOrEqual(2); // WMM chainage + Roller closing (+ end time)
  });

  it("noSiteWork rows stay excluded from closure checks (reported, unchanged)", () => {
    const { items } = deriveDprChecklist({
      workType: "road",
      progress: [{ activity: "", noSiteWork: true, noSiteWorkDescription: "" }],
      equipment: [], labour: [], materials: [],
    }, false);
    const act = items.find(i => i.id === "c4")!;
    expect(act.details).toEqual([]); // no closure issues raised for the no-work row
  });
});

// ─── §1 No doneCount-based phase split ──────────────────────────────────────

describe("lifecycle phase model (06D §1)", () => {
  it("FieldHome has no continue-own/complete-own doneCount phase split", async () => {
    const fs = await import("node:fs/promises");
    const src = await fs.readFile("client/src/pages/FieldHome.tsx", "utf8");
    expect(src).not.toMatch(/continue-own|complete-own/);
    // the CTA switch still keys off the single draft-own phase
    expect(src).toContain('"draft-own"');
    expect(src).toContain("Complete Today's DPR");
    expect(src).toContain("Start Today's DPR");
  });

  it("Guided explicit Save Draft exits to Field Home only on success; Next/Back never exit", async () => {
    const fs = await import("node:fs/promises");
    const src = await fs.readFile("client/src/pages/GuidedDpr.tsx", "utf8");
    // draft-save success branch navigates to returnTo
    expect(src).toMatch(/Draft Saved[\s\S]{0,200}setLocation\(returnTo\)/);
    // Back/Next handlers only move the step
    expect(src).toMatch(/data-testid="button-step-back"/);
    expect(src).toMatch(/data-testid="button-step-next"/);
    const backNext = src.split("button-step-back")[1]?.split("button-submit")[0] ?? "";
    expect(backNext).not.toContain("setLocation");
  });
});
