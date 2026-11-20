/**
 * Task #1409 — Guided DPR wizard step model (pure, testable).
 *
 * The guided flow is an 8-step wizard (Batch 06C-P split Labour and
 * Equipment into their own pages, Photos & Remarks got its own page; the
 * site-activities step is optional and sits before Labour):
 *   1 Report      — date / site / engineer
 *   2 Activities  — same-as-yesterday copy + programme checklist + manual add
 *   3 Details     — per-activity cards (side, chainage, Length, quantity, No Work, photos)
 *   4 Site activities — optional levels, tests, office work and visits
 *   5 Labour      — labour rows shown directly (+ Add Labour)
 *   6 Equipment   — equipment rows shown directly, master selector + usage reuse
 *   7 Photos      — general site photos + remarks
 *   8 Review      — summary + readiness + Final Submit
 *
 * Steps 1 and 2 gate advancing (site/engineer picked; ≥1 activity). Steps 3+
 * are deliberately lenient — drafts are intentionally incomplete; hard rules
 * only run at Final Submit (Batch 04 readiness + validateForSubmit).
 */

export const GUIDED_STEPS = [
  { id: 1, key: "report", label: "Report" },
  { id: 2, key: "activities", label: "Activities" },
  { id: 3, key: "details", label: "Details" },
  { id: 4, key: "siteActivities", label: "Site activities" },
  { id: 5, key: "labour", label: "Labour" },
  { id: 6, key: "equipment", label: "Equipment" },
  { id: 7, key: "photos", label: "Photos" },
  { id: 8, key: "review", label: "Review" },
] as const;

export type GuidedStepId = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export const clampGuidedStep = (raw: unknown): GuidedStepId => {
  const n = Number(raw);
  return (Number.isInteger(n) && n >= 1 && n <= 8 ? n : 1) as GuidedStepId;
};

/**
 * Autosaved v1 blobs use the previous seven-step numbering. Translate those
 * once when restoring; all newly written blobs carry stepVersion: 2.
 */
export function restoreGuidedStep(raw: unknown, version?: unknown): GuidedStepId {
  const value = Number(raw);
  if (version === 2) return clampGuidedStep(value);
  if (!Number.isInteger(value) || value < 1 || value > 7) return 1;
  if (value <= 3) return value as GuidedStepId;
  return (value + 1) as GuidedStepId;
}

/**
 * Batch 06D — "Complete Today's DPR" deep link: map the shared readiness
 * validator's SEMANTIC sections (not fragile checklist item ids like c1/c4)
 * to the Guided step that actually fixes them, and pick the earliest.
 *
 *   activities → 3 Details   (chainage / quantity closure lives there)
 *   labour     → 5 Labour
 *   equipment  → 6 Equipment
 *   materials  → 8 Review    (Guided has no materials step; Review shows the
 *                             readiness panel that names the material issue)
 *
 * No mandatory incomplete section → 8 Review.
 */
export const READINESS_SECTION_TO_GUIDED_STEP: Record<string, GuidedStepId> = {
  activities: 3,
  labour: 5,
  equipment: 6,
  materials: 8,
};

export function firstIncompleteGuidedStep(sections: readonly string[]): GuidedStepId {
  let best: GuidedStepId = 8;
  for (const s of sections) {
    const step = READINESS_SECTION_TO_GUIDED_STEP[s];
    if (step != null && step < best) best = step;
  }
  return best;
}

export type GuidedWizardState = {
  siteName: string;
  engineer: string;
  entryCount: number;
};

/** Reason the current step cannot advance, or null when Next is allowed. */
export function guidedStepBlocker(step: GuidedStepId, s: GuidedWizardState): string | null {
  if (step === 1) {
    if (!s.siteName || !s.engineer) return "Select the site and engineer first.";
    return null;
  }
  if (step === 2) {
    if (s.entryCount === 0) return "Add at least one activity — pick from the programme list or record one manually.";
    return null;
  }
  return null; // steps 3–7 never block Next (draft-lenient); site activities are optional
}

export const canAdvanceGuidedStep = (step: GuidedStepId, s: GuidedWizardState): boolean =>
  guidedStepBlocker(step, s) == null;

/**
 * A row marked "No Site Work" is complete by itself (activity text is enough);
 * a normal row needs chainage From/To and a positive quantity.
 */
export function guidedEntryComplete(e: {
  noSiteWork?: boolean | null;
  activity?: string | null;
  chainageFrom?: string | null;
  chainageTo?: string | null;
  quantity?: number | null;
}): boolean {
  if (e.noSiteWork) return !!(e.activity && e.activity.trim());
  return !!(e.chainageFrom && e.chainageTo && e.quantity != null && e.quantity > 0);
}
