import { compactedLooseProfileFromInputs, looseWeightPerCumFromProfile } from "@shared/compactedLoose";
import type { MaterialProfileFields } from "@/components/MaterialCategoryProfileFields";

export function buildMaterialProfileSaveFields(values: MaterialProfileFields) {
  const profile = compactedLooseProfileFromInputs({
    rolledDensity: values.rolledDensity,
    rollingPct: values.rollingPct,
    extraLoosePct: values.extraLoosePct,
    wastagePct: values.wastagePct,
  });
  const derivedLooseDensity = looseWeightPerCumFromProfile(profile);
  const parsedDensity = Number(values.bulkDensity);
  const validManualDensity = Number.isFinite(parsedDensity) && parsedDensity > 0 ? parsedDensity : null;

  return {
    bulkDensity: derivedLooseDensity == null ? validManualDensity : undefined,
    conversionFromUom: derivedLooseDensity != null || validManualDensity != null ? values.volumeUom : undefined,
    rolledDensity: profile.rolledDensity,
    rollingPct: profile.rollingPct,
    looseFactor: profile.looseFactor,
    wastagePct: profile.wastagePct,
    packedUnitName: values.packedUnitName || null,
    packedUnitNetWeightKg: values.packedUnitNetWeightKg.trim() ? Number(values.packedUnitNetWeightKg) : null,
    packedUnitVolumeLiters: values.packedUnitVolumeLiters.trim() ? Number(values.packedUnitVolumeLiters) : null,
  };
}
