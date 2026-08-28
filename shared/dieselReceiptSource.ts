// 06M-C-HF — Daily Diesel Receipt: bypass PI/Indent warning.
//
// A Material Receipt opened from an approved/purchased Daily Diesel Requirement
// (linkedDieselRequirementId != null) is sourced from that requirement, NOT
// from a Purchase Indent. The generic PI lookup/warning/override machinery
// must not apply to it. Ordinary receipts keep the existing PI controls.

/** Source-mode flag: a receipt linked to a Daily Diesel Requirement. */
export function isDieselSourcedReceipt(linkedDieselRequirementId: number | null | undefined): boolean {
  return linkedDieselRequirementId != null;
}

export interface AutoSelectInputs {
  linkedDieselRequirementId: number | null | undefined;
  editing: boolean;
  currentIndentRef: string;
  /** pending Material Indent matches by materialId */
  pendingIndents: { indentNo: string; itemId: number }[];
  /** approved/ordered PIs (name-based matches) */
  activeIndents: { indentNo: string }[];
}

export type AutoSelectDecision =
  | { action: "skip" }
  | { action: "clearPendingItem" }
  | { action: "select"; indentNo: string; pendingItemId: number | null };

/**
 * Section 8: the PI auto-selection effect must not fire AT ALL for a
 * diesel-sourced receipt — even when a pending Material Indent or a single
 * active PI for Diesel coincidentally exists.
 */
export function decidePiAutoSelect(i: AutoSelectInputs): AutoSelectDecision {
  if (isDieselSourcedReceipt(i.linkedDieselRequirementId)) return { action: "skip" };
  if (i.editing) return { action: "skip" };
  if (i.currentIndentRef) return { action: "skip" };
  if (i.pendingIndents.length === 1) {
    return { action: "select", indentNo: i.pendingIndents[0].indentNo, pendingItemId: i.pendingIndents[0].itemId };
  }
  if (i.activeIndents.length === 1) {
    return { action: "select", indentNo: i.activeIndents[0].indentNo, pendingItemId: null };
  }
  return { action: "clearPendingItem" };
}

export interface SubmitPiValidationInputs {
  linkedDieselRequirementId: number | null | undefined;
  selectedPiStatus: string | null; // status of the PI matching indentRef, null if none selected
  indentOverride: boolean;
}

/**
 * Section 5: submit-time PI validation is skipped ONLY for diesel-sourced
 * receipts. Ordinary receipts keep the exact existing rule: a selected,
 * non-approved/non-ordered PI blocks save unless the override is ticked.
 */
export function submitBlockedByPi(i: SubmitPiValidationInputs): boolean {
  if (isDieselSourcedReceipt(i.linkedDieselRequirementId)) return false;
  if (i.selectedPiStatus == null) return false;
  const linkable = i.selectedPiStatus === "approved" || i.selectedPiStatus === "ordered";
  return !linkable && !i.indentOverride;
}

/**
 * Sections 3/4: the generic Indent Ref block (selector, "No approved Purchase
 * Indent…" warning, override checkbox) is hidden entirely for diesel-sourced
 * receipts; a read-only source line is shown instead.
 */
export function showPiIndentBlock(linkedDieselRequirementId: number | null | undefined): boolean {
  return !isDieselSourcedReceipt(linkedDieselRequirementId);
}

/**
 * Section 10: post-save "No approved indent linked — regularise" notice is
 * generic PI logic; never show it for a diesel-sourced receipt.
 */
export function showRegulariseIndentNotice(args: {
  linkedDieselRequirementId: number | null | undefined;
  indentRef: string | null | undefined;
  indentStatus: string | undefined;
}): boolean {
  if (isDieselSourcedReceipt(args.linkedDieselRequirementId)) return false;
  return !args.indentRef || (args.indentStatus != null && args.indentStatus !== "approved");
}

/**
 * The compact PI Pending badge is the list-row counterpart of the regularise
 * notice. Keep this source decision here as well so a diesel purchase never
 * leaks generic PI state into a receipt row.
 */
export function showPiPendingBadge(args: {
  linkedDieselRequirementId: number | null | undefined;
  indentRef: string | null | undefined;
  indentStatus: string | undefined;
}): boolean {
  if (isDieselSourcedReceipt(args.linkedDieselRequirementId)) return false;
  return !args.indentRef || args.indentStatus !== "approved";
}

/** Labels for the explicit, user-driven supporting-document closure workflow. */
export function receiptClosureStatus(
  documentStatus: string | null | undefined,
  hasRequiredDoc: boolean | null | undefined,
): "Pending Document" | "Ready to Final Submit" | "Final Submitted" {
  if (documentStatus === "submitted") return "Final Submitted";
  return hasRequiredDoc ? "Ready to Final Submit" : "Pending Document";
}
