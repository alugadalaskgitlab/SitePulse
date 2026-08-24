export type EquipmentDestinationType = "site" | "hmp" | "rmc";

export type EquipmentLifecycleStatus = {
  id: number;
  status?: string | null;
  destinationType?: EquipmentDestinationType | null;
  destinationSite?: string | null;
  closedByUserName?: string | null;
  closedBy?: string | null;
  successorId?: number | null;
};

/** The plant URL context is the authority for which receiving queue to show. */
export function plantDestinationType(plantName: string | null): "hmp" | "rmc" | null {
  if (!plantName) return null;
  const normalized = plantName.toLowerCase();
  if (normalized.includes("rmc")) return "rmc";
  if (normalized.includes("hmp")) return "hmp";
  return null;
}

/** Lifecycle endpoint deployments have returned either an array or { rows }. */
export function lifecycleByUsageId(payload: unknown): Map<number, EquipmentLifecycleStatus> {
  const rows = Array.isArray(payload)
    ? payload
    : Array.isArray((payload as any)?.rows)
      ? (payload as any).rows
      : Array.isArray((payload as any)?.data)
        ? (payload as any).data
        : [];
  return new Map(rows
    .filter((row: any) => Number.isFinite(Number(row?.id)))
    .map((row: any) => [Number(row.id), row]));
}

/** DPR equipment logs use equipmentUsageId; accept legacy aliases without guessing row ids. */
export function linkedUsageId(row: Record<string, any>): number | null {
  const value = row.plantUsageId ?? row.equipmentUsageId ?? row.usageId ?? row.linkedUsageId ?? row.passthrough?.plantUsageId ?? null;
  const id = Number(value);
  return Number.isFinite(id) && id > 0 ? id : null;
}

export function lifecycleLabel(status?: EquipmentLifecycleStatus): string | null {
  if (!status) return null;
  if (status.status === "open") {
    return `Pending at ${status.destinationType?.toUpperCase() ?? "destination"}${status.destinationSite ? `: ${status.destinationSite}` : ""}`;
  }
  if (status.status === "closed") {
    if (status.successorId != null) {
      return `Completed at ${status.destinationType?.toUpperCase() ?? "destination"}${status.destinationSite ? `: ${status.destinationSite}` : ""}`;
    }
    return `Closed${status.closedByUserName || status.closedBy ? ` by ${status.closedByUserName ?? status.closedBy}` : ""}`;
  }
  return status.status ? status.status.replace(/_/g, " ") : null;
}