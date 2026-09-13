import { withReturnTo } from "./progressReportNav";

export type EquipmentPerformanceFilters = {
  dateFrom: string;
  dateTo: string;
  projectId: string;
  scope: string;
  ownership: string;
  ownerVendor: string;
  equipmentType: string;
  equipmentId: string;
};

export const EQUIPMENT_PERFORMANCE_PATH = "/reports/equipment-performance";
export const EQUIPMENT_PERFORMANCE_FILTER_KEYS: ReadonlyArray<keyof EquipmentPerformanceFilters> = [
  "dateFrom",
  "dateTo",
  "projectId",
  "scope",
  "ownership",
  "ownerVendor",
  "equipmentType",
  "equipmentId",
];

export const EMPTY_EQUIPMENT_PERFORMANCE_FILTERS: EquipmentPerformanceFilters = {
  dateFrom: "",
  dateTo: "",
  projectId: "",
  scope: "",
  ownership: "",
  ownerVendor: "",
  equipmentType: "",
  equipmentId: "",
};

export function hasEquipmentPerformanceFilters(search: string): boolean {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  return EQUIPMENT_PERFORMANCE_FILTER_KEYS.some((key) => params.has(key));
}

export function parseEquipmentPerformanceFilters(
  search: string,
  defaults: EquipmentPerformanceFilters = EMPTY_EQUIPMENT_PERFORMANCE_FILTERS,
): EquipmentPerformanceFilters {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  if (!hasEquipmentPerformanceFilters(search)) return { ...defaults };
  return Object.fromEntries(
    EQUIPMENT_PERFORMANCE_FILTER_KEYS.map((key) => [key, params.get(key) ?? ""]),
  ) as unknown as EquipmentPerformanceFilters;
}

export function equipmentPerformanceUrl(
  filters: EquipmentPerformanceFilters,
  selectedMachine = "",
): string {
  const params = new URLSearchParams();
  EQUIPMENT_PERFORMANCE_FILTER_KEYS.forEach((key) => {
    const value = filters[key];
    if (value && value !== "all") params.set(key, value);
  });
  if (selectedMachine) params.set("machine", selectedMachine);
  const search = params.toString();
  return `${EQUIPMENT_PERFORMANCE_PATH}${search ? `?${search}` : ""}`;
}

export interface EquipmentSourceReference {
  source: "dpr_log" | "plant_usage";
  date?: string | null;
  equipmentId?: number | null;
  reference: {
    dprId?: number | null;
    plantUsageId?: number | null;
  };
}

/** Build a source-specific link while retaining the complete Fleet URL. */
export function equipmentSourceHref(
  event: EquipmentSourceReference,
  returnTo: string,
): string | null {
  if (event.source === "dpr_log" && event.reference.dprId != null) {
    return withReturnTo(`/site/edit/${event.reference.dprId}`, returnTo);
  }
  if (event.source === "plant_usage" && event.reference.plantUsageId != null) {
    const params = new URLSearchParams();
    if (event.date) {
      params.set("dateFrom", event.date);
      params.set("dateTo", event.date);
    }
    const path = `/plant/equipment-usage${params.size ? `?${params}` : ""}`;
    return withReturnTo(path, returnTo);
  }
  return null;
}