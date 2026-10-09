// Approval-only policy. Allocation, fulfilment and DPR behavior do not use this.
export function requirementApprovalBlock(
  actor: { id: number; isOwner?: boolean },
  submittedBy: number | null | undefined,
): string | null {
  if (!Number.isInteger(submittedBy) || Number(submittedBy) <= 0) {
    return "Approval is unavailable because this requirement's creator is unknown.";
  }
  if (submittedBy === actor.id && actor.isOwner !== true) {
    return "You cannot approve or reject a requirement you created.";
  }
  return null;
}

export function isRequirementDecision(status: string): boolean {
  return status === "approved" || status === "rejected";
}
