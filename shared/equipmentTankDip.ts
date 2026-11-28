import { z } from "zod";

export const equipmentTankDipSettingsSchema = z.object({
  dipLitersPerCm: z.number().finite().positive().nullable().optional(),
  deadStockDepthCm: z.number().finite().nonnegative().nullable().optional(),
  tankCapacityLiters: z.number().finite().positive().nullable().optional(),
});

export type EquipmentTankDipSettings = z.infer<typeof equipmentTankDipSettingsSchema>;

export const hasDipCalibration = (equipment?: EquipmentTankDipSettings | null): equipment is EquipmentTankDipSettings & { dipLitersPerCm: number } =>
  typeof equipment?.dipLitersPerCm === "number" && Number.isFinite(equipment.dipLitersPerCm) && equipment.dipLitersPerCm > 0;

export function equipmentDipVolumes(cm: number, equipment: EquipmentTankDipSettings & { dipLitersPerCm: number }) {
  return {
    tank: cm * equipment.dipLitersPerCm,
    usable: Math.max(0, cm - (equipment.deadStockDepthCm ?? 0)) * equipment.dipLitersPerCm,
  };
}

/** Only explicit new dip evidence changes litres; legacy litres-only payloads pass through. */
export function applyEquipmentDip<T extends Record<string, any>>(
  input: T, equipment: EquipmentTankDipSettings | null | undefined,
  keys = { openingCm: "openingDipCm", closingCm: "closingDipCm", openingLitres: "openingDiesel", closingLitres: "dieselBalanceInTank" },
): T {
  const result: Record<string, any> = { ...input };
  for (const [cmKey, litresKey] of [[keys.openingCm, keys.openingLitres], [keys.closingCm, keys.closingLitres]]) {
    if (input[cmKey] == null) continue;
    const cm = z.number().finite().nonnegative().parse(input[cmKey]);
    if (!hasDipCalibration(equipment)) throw new Error("Set litres per cm in Equipment Master before saving a dip.");
    result[litresKey] = cm * equipment.dipLitersPerCm;
  }
  return result as T;
}
