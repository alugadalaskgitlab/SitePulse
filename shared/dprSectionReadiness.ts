import { evaluateDprSubmitReadiness } from "./dprSubmitReadiness";
import { withCutFillReadinessContext } from "./cutFillReadiness";

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