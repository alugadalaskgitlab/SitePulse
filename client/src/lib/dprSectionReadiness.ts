import { evaluateDprSubmitReadiness } from "@shared/dprSubmitReadiness";
import type { DprReadinessIssue } from "@shared/dprSubmitReadiness";
import { withCutFillReadinessContext } from "./cutFillLedger";

/** Display-only evaluation. The server remains authoritative at submit time. */
export function evaluateSectionReadiness(
  saved: Record<string, any>,
  boqItems: any[],
  local: Partial<Record<"progress" | "structureItems" | "equipment" | "labour" | "materials" | "sitePurchases", any>> = {},
) {
  const merged: Record<string, any> = { ...saved, ...local };
  return evaluateDprSubmitReadiness({
    ...merged,
    progress: merged.workType === "structure" ? [] : withCutFillReadinessContext(merged.progress ?? [], boqItems),
  });
}

/** DOM focus only: never changes evaluator rules or issue indexes. */
export function sectionIssueFieldTestId(issue: DprReadinessIssue, chainageFrom = ""): string | null {
  const index = issue.rowIndex ?? (typeof issue.rowKey === "number" ? issue.rowKey : null);
  if (index == null) return null;
  const message = issue.message.toLowerCase();
  if (issue.section === "activities") {
    if (/reusable quantity|between 0 and/.test(message)) return "input-reusable-qty";
    if (/material outcome|fully reusable|partly reusable|unsuitable/.test(message)) return "select-cut-fill-outcome";
    if (/quantity/.test(message)) return `input-progress-qty-${index}`;
    if (/no site work/.test(message)) return `input-progress-description-${index}`;
    if (/incidental/.test(message)) return `input-incidental-description-${index}`;
    if (/chainage/.test(message)) return `input-progress-${chainageFrom ? "to" : "from"}-${index}`;
    return `input-progress-activity-${index}`;
  }
  if (issue.section === "equipment") {
    if (/closing meter/.test(message)) return `equipment-compact-closing-meter-${index}`;
    if (/opening meter/.test(message)) return `equipment-compact-opening-meter-${index}`;
    if (/end time/.test(message)) return `equipment-compact-end-${index}`;
    if (/start time/.test(message)) return `equipment-compact-start-${index}`;
    if (/trip/.test(message)) return `input-equipment-trips-${index}`;
    return `equipment-compact-usage-status-${index}`;
  }
  if (issue.section === "labour") return /count/.test(message) ? `input-labour-count-${index}` : `select-labour-category-${index}`;
  return /quantity/.test(message) ? `input-material-qty-${index}` : `input-material-uom-${index}`;
}