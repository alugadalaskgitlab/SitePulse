/**
 * Task #1409 — Guided DPR wizard step model (pure, testable).
 *
 * The guided flow is a 5-step wizard:
 *   1 Report      — date / site / engineer
 *   2 Activities  — same-as-yesterday copy + programme checklist + manual add
 *   3 Details     — per-activity cards (side, chainage, quantity, No Work, photos)
 *   4 Resources   — site photos, equipment, labour, remarks
 *   5 Review      — summary + readiness + Final Submit
 *
 * Steps 1 and 2 gate advancing (site/engineer picked; ≥1 activity). Steps 3+
 * are deliberately lenient — drafts are intentionally incomplete; hard rules
 * only run at Final Submit (Batch 04 readiness + validateForSubmit).
 */

export const GUIDED_STEPS = [
  { id: 1, key: "report", label: "Report" },
  { id: 2, key: "activities", label: "Activities" },
  { id: 3, key: "details", label: "Details" },
  { id: 4, key: "resources", label: "Photos & crew" },
  { id: 5, key: "review", label: "Review" },
] as const;

export type GuidedStepId = 1 | 2 | 3 | 4 | 5;

export const clampGuidedStep = (raw: unknown): GuidedStepId => {
  const n = Number(raw);
  return (Number.isInteger(n) && n >= 1 && n <= 5 ? n : 1) as GuidedStepId;
};

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
  return null; // steps 3 and 4 never block Next (draft-lenient)
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
