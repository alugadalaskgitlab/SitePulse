import { withReturnTo } from "./progressReportNav";
import type { EquipmentPerformanceReport } from "@shared/equipmentPerformance";

export const EQUIPMENT_IDENTIFICATION_QUERY_KEY = [
  "/api/reports/equipment-performance",
  "pending-identification",
] as const;

export const EQUIPMENT_IDENTIFICATION_RETURN_TO =
  "/masters/section/equipment?review=identification#equipment-needing-identification";

export async function fetchEquipmentIdentification(): Promise<EquipmentPerformanceReport> {
  const response = await fetch("/api/reports/equipment-performance", { credentials: "include" });
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

export function equipmentIdentificationSourceHref(
  row: Pick<EquipmentPerformanceReport["reviewRows"][number], "source" | "dprId">,
): string | null {
  if (row.source !== "dpr_log" || row.dprId == null) return null;
  return withReturnTo(`/site/edit/${row.dprId}`, EQUIPMENT_IDENTIFICATION_RETURN_TO);
}

export async function linkCreatedEquipment(
  logId: number,
  equipmentId: number,
  link: (logId: number, equipmentId: number) => Promise<unknown>,
): Promise<{ logId: number; equipmentId: number }> {
  await link(logId, equipmentId);
  return { logId, equipmentId };
}