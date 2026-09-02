export const PROGRAMME_BAR_OUTCOMES = ["active_arranged", "executed", "partially_executed", "not_executed", "cancelled", "suspended", "early_closed", "rescheduled"] as const;
export const PROGRAMME_BAR_OUTCOME_REASONS = ["rain", "site_not_ready", "client_instruction", "equipment_breakdown", "vendor_unavailable", "material_unavailable", "work_completed_early", "change_in_programme", "other"] as const;

export type ProgrammeBarOutcomeInput = {
  outcome: string; reason?: string | null; reasonOther?: string | null; rescheduledDate?: string | null;
  actualQuantity?: number | null; actualUom?: string | null;
};

/** Tuple rules shared by route tests and the write handler. */
export function programmeBarOutcomeInputError(input: ProgrammeBarOutcomeInput): string | null {
  if (!PROGRAMME_BAR_OUTCOMES.includes(input.outcome as any)) return "Invalid outcome";
  const ordinaryRequiresReason = input.outcome !== "active_arranged" && input.outcome !== "executed";
  const hasActualQuantity = input.actualQuantity != null;
  const hasActualUom = !!input.actualUom?.trim();
  if (hasActualQuantity !== hasActualUom) return "actualQuantity and actualUom must be provided together";
  const hasOverride = hasActualQuantity && hasActualUom;
  const requiresReason = ordinaryRequiresReason || hasOverride;
  if (requiresReason && !PROGRAMME_BAR_OUTCOME_REASONS.includes(input.reason as any)) return "Reason is required for this outcome or override";
  if (!requiresReason && input.reason != null && input.reason !== "") return "Reason is not allowed for active/arranged or executed outcomes without an override";
  const other = !!input.reasonOther?.trim();
  if ((input.reason === "other") !== other) return input.reason === "other" ? "reasonOther is required when reason is other" : "reasonOther is only allowed when reason is other";
  if ((input.outcome === "rescheduled") !== !!input.rescheduledDate) return input.outcome === "rescheduled" ? "rescheduledDate is required for a rescheduled outcome" : "rescheduledDate is only allowed for a rescheduled outcome";
  return null;
}