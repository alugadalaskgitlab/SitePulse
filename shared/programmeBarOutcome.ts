export const PROGRAMME_BAR_OUTCOMES = ["active_arranged", "executed", "partially_executed", "not_executed", "cancelled", "suspended", "early_closed", "rescheduled"] as const;
export const PROGRAMME_BAR_OUTCOME_REASONS = ["rain", "site_not_ready", "client_instruction", "equipment_breakdown", "vendor_unavailable", "material_unavailable", "work_completed_early", "change_in_programme", "other"] as const;

export type ProgrammeBarOutcomeInput = {
  outcome: string; reason?: string | null; reasonOther?: string | null; rescheduledDate?: string | null;
  actualQuantity?: number | null; actualUom?: string | null;
};

/** Tuple rules shared by route tests and the write handler. */
export function programmeBarOutcomeInputError(input: ProgrammeBarOutcomeInput): string | null {
  if (!PROGRAMME_BAR_OUTCOMES.includes(input.outcome as any)) return "Invalid outcome";
  const requiresReason = input.outcome !== "active_arranged" && input.outcome !== "executed";
  if (requiresReason && !PROGRAMME_BAR_OUTCOME_REASONS.includes(input.reason as any)) return "Reason is required for this outcome";
  if (!requiresReason && input.reason != null && input.reason !== "") return "Reason is not allowed for active/arranged or executed outcomes";
  const other = !!input.reasonOther?.trim();
  if ((input.reason === "other") !== other) return input.reason === "other" ? "reasonOther is required when reason is other" : "reasonOther is only allowed when reason is other";
  if ((input.outcome === "rescheduled") !== !!input.rescheduledDate) return input.outcome === "rescheduled" ? "rescheduledDate is required for a rescheduled outcome" : "rescheduledDate is only allowed for a rescheduled outcome";
  const recordsActual = input.outcome === "partially_executed";
  const hasActual = input.actualQuantity != null || !!input.actualUom?.trim();
  if (recordsActual && (input.actualQuantity == null || !input.actualUom?.trim())) return "actualQuantity and actualUom are required for partially_executed outcomes";
  if (!recordsActual && hasActual) return "actualQuantity and actualUom are only allowed for partially_executed outcomes";
  return null;
}