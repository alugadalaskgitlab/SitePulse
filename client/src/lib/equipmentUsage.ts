// Compatibility entrypoint: existing client imports retain this path while

import { EquipmentUsageEquipment, EquipmentUsageEntry, EquipmentUsageResult, MeterType, UsageBasis, AVERAGE_SPEED_KMPH } from "@shared/equipmentUsage";

// the canonical pure calculation is also used by server DPR normalization.
export * from "@shared/equipmentUsage";