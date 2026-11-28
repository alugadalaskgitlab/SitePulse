import { z } from "zod";

export const equipmentTankDipSettingsSchema = z.object({
  dipLitersPerCm: z.number().finite().positive().nullable().optional(),
  deadStockDepthCm: z.number().finite().nonnegative().nullable().optional(),
  tankCapacityLiters: z.number().finite().positive().nullable().optional(),
});

export type EquipmentTankDipSettings = z.infer<typeof equipmentTankDipSettingsSchema>;
