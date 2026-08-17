// INSTRUCTION 06Q — client helper for the canonical opening-reading
// continuity endpoint. All entry surfaces (Guided DPR, Detailed SiteEntry,
// SiteEdit new rows, Plant Equipment Usage) go through this one function so
// there is exactly one resolver in the system.

export interface LatestClosingResult {
  closingReading: number | null;
  sourceDate: string | null;
  source: "plant_usage" | "dpr_log" | null;
}

export async function fetchLatestPriorClosing(
  equipmentId: number,
  beforeDate: string,
  opts?: { inclusive?: boolean },
): Promise<LatestClosingResult> {
  try {
    const inc = opts?.inclusive ? "&inclusive=1" : "";
    const res = await fetch(
      `/api/equipment/${equipmentId}/latest-closing?beforeDate=${encodeURIComponent(beforeDate)}${inc}`,
      { credentials: "include" },
    );
    if (!res.ok) return { closingReading: null, sourceDate: null, source: null };
    return await res.json();
  } catch {
    return { closingReading: null, sourceDate: null, source: null };
  }
}
