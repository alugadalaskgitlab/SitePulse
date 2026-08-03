import type { QueryClient } from "@tanstack/react-query";

/**
 * Instruction 026 (Part A2): single place that invalidates every query affected
 * by an earthwork-arrangement mutation (create/submit/approve/revise/cancel or
 * programme-bar allocation change), so Equipment/Diesel/Labour demand, shortage
 * rows and the Work Programme refresh immediately.
 *
 * Predicate-based matching because the codebase uses two key styles:
 *   ["shortage-check", projectId]  and  ["/api/boq/projects", projectId, "shortage-check"]
 */
export function invalidateArrangementQueries(queryClient: QueryClient, projectId: number) {
  const affectedTails = new Set(["bom", "shortage-check", "programme", "arrangement-programme-allocations"]);
  return queryClient.invalidateQueries({
    predicate: (q) => {
      const key = q.queryKey;
      if (!Array.isArray(key)) return false;
      const parts = key.map(String);
      // Any earthwork-arrangement query for this project or arrangement detail
      if (parts.some(p => p.includes("earthwork-arrangement"))) return true;
      // ["shortage-check", projectId]
      if (parts[0] === "shortage-check" && Number(parts[1]) === projectId) return true;
      // ["/api/boq/projects", projectId, <tail>]
      if (parts[0] === "/api/boq/projects" && Number(parts[1]) === projectId && affectedTails.has(parts[2])) return true;
      return false;
    },
  });
}
