export const CUBIC_FEET_PER_CUBIC_METRE = 35.3147;

export interface CompactedLooseProfile {
  rolledDensity: number | null | undefined;
  rollingPct: number | null | undefined;
  looseFactor: number | null | undefined;
  wastagePct: number | null | undefined;
}

export interface CompactedLooseQuantity {
  compactedDensity: number;
  looseWeightPerCum: number;
  compactedCum: number;
  compactedMt: number;
  looseCum: number;
  looseCft: number;
  wastageMt: number;
  wastageLooseCum: number;
  wastageLooseCft: number;
  requiredMt: number;
  requiredLooseCum: number;
  requiredLooseCft: number;
}

const finite = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

export function compactedLooseProfileFromInputs(inputs: {
  rolledDensity: string;
  rollingPct: string;
  extraLoosePct: string;
  wastagePct: string;
}): CompactedLooseProfile {
  const numberOrNull = (raw: string): number | null => {
    if (raw.trim() === "") return null;
    const value = Number(raw);
    return Number.isFinite(value) ? value : null;
  };
  const extraLoosePct = numberOrNull(inputs.extraLoosePct);
  return {
    rolledDensity: numberOrNull(inputs.rolledDensity),
    rollingPct: numberOrNull(inputs.rollingPct),
    looseFactor: extraLoosePct == null ? null : looseFactorFromExtraLoosePercent(extraLoosePct),
    wastagePct: numberOrNull(inputs.wastagePct),
  };
}

/** Loose delivered mass per cubic metre; wastage is intentionally irrelevant. */
export function looseWeightPerCumFromProfile(
  profile: Pick<CompactedLooseProfile, "rolledDensity" | "rollingPct" | "looseFactor"> | null | undefined,
): number | null {
  if (
    !profile ||
    !finite(profile.rolledDensity) || profile.rolledDensity <= 0 ||
    !finite(profile.rollingPct) || profile.rollingPct <= 0 ||
    !finite(profile.looseFactor) || profile.looseFactor < 1
  ) return null;
  const looseDensity = profile.rolledDensity * profile.rollingPct / 100 / profile.looseFactor;
  return Number.isFinite(looseDensity) && looseDensity > 0 ? looseDensity : null;
}

export type MaterialDensityFields = Partial<CompactedLooseProfile> & {
  bulkDensity?: number | null;
  conversionFactor?: number | null;
  conversionFromUom?: string | null;
  conversionToUom?: string | null;
};

export function effectiveMaterialBulkDensity(material: MaterialDensityFields): number | null {
  const derived = looseWeightPerCumFromProfile(material);
  if (derived != null) return derived;
  return finite(material.bulkDensity) && material.bulkDensity > 0 ? material.bulkDensity : null;
}

/** Add a read-only effective density view without changing the saved material values. */
export function withEffectiveMaterialDensity<T extends MaterialDensityFields>(
  material: T,
): T & { savedBulkDensity: number | null } {
  const savedBulkDensity = material.bulkDensity ?? null;
  const derived = looseWeightPerCumFromProfile(material);
  if (derived == null) return { ...material, savedBulkDensity };

  const sourceUom = (material.conversionFromUom ?? "CFT").trim().toUpperCase();
  const conversionFromUom = ["CUM", "M3", "M³"].includes(sourceUom) ? "Cum" : "CFT";
  return {
    ...material,
    savedBulkDensity,
    bulkDensity: derived,
    conversionFactor: conversionFromUom === "CFT" ? derived / CUBIC_FEET_PER_CUBIC_METRE : derived,
    conversionFromUom,
    conversionToUom: "Ton",
  };
}

export function hasCompleteCompactedLooseProfile(
  profile: CompactedLooseProfile | null | undefined,
): profile is CompactedLooseProfile & {
  rolledDensity: number;
  rollingPct: number;
  looseFactor: number;
  wastagePct: number;
} {
  return !!profile &&
    finite(profile.rolledDensity) && profile.rolledDensity > 0 &&
    finite(profile.rollingPct) && profile.rollingPct > 0 &&
    finite(profile.looseFactor) && profile.looseFactor >= 1 &&
    finite(profile.wastagePct) && profile.wastagePct >= 0;
}

export function resolveCompactedLooseProfile(
  primary: CompactedLooseProfile | null | undefined,
  fallback: CompactedLooseProfile | null | undefined,
): CompactedLooseProfile | null {
  if (hasCompleteCompactedLooseProfile(primary)) return primary;
  if (hasCompleteCompactedLooseProfile(fallback)) return fallback;
  const hasAnyValue = (profile: CompactedLooseProfile | null | undefined) =>
    !!profile && Object.values(profile).some((value) => value != null && value !== "");
  if (hasAnyValue(primary)) return primary ?? null;
  return fallback ?? primary ?? null;
}

export function calculateCompactedLooseQuantity(
  compactedCum: number,
  profile: CompactedLooseProfile | null | undefined,
): CompactedLooseQuantity | null {
  if (!Number.isFinite(compactedCum) || compactedCum < 0 || !hasCompleteCompactedLooseProfile(profile)) {
    return null;
  }
  const compactedDensity = profile.rolledDensity * profile.rollingPct / 100;
  const looseWeightPerCum = compactedDensity / profile.looseFactor;
  const compactedMt = compactedCum * compactedDensity;
  const looseCum = compactedCum * profile.looseFactor;
  const looseCft = looseCum * CUBIC_FEET_PER_CUBIC_METRE;
  const wastageMt = compactedMt * profile.wastagePct / 100;
  const wastageLooseCum = looseCum * profile.wastagePct / 100;
  const wastageLooseCft = wastageLooseCum * CUBIC_FEET_PER_CUBIC_METRE;
  return {
    compactedDensity,
    looseWeightPerCum,
    compactedCum,
    compactedMt,
    looseCum,
    looseCft,
    wastageMt,
    wastageLooseCum,
    wastageLooseCft,
    requiredMt: compactedMt + wastageMt,
    requiredLooseCum: looseCum + wastageLooseCum,
    requiredLooseCft: looseCft + wastageLooseCft,
  };
}

export function looseFactorFromExtraLoosePercent(percent: number): number | null {
  return Number.isFinite(percent) && percent >= 0 ? 1 + percent / 100 : null;
}

export function extraLoosePercentFromFactor(factor: number | null | undefined): number | null {
  return finite(factor) && factor >= 1 ? (factor - 1) * 100 : null;
}

export type MaterialQuantityBasis = "compacted" | "loose";

export function convertMaterialQuantityToMt(
  quantity: number,
  uom: string,
  basis: MaterialQuantityBasis,
  profile: CompactedLooseProfile | null | undefined,
): number | null {
  if (!Number.isFinite(quantity) || !hasCompleteCompactedLooseProfile(profile)) return null;
  const compactedDensity = profile.rolledDensity * profile.rollingPct / 100;
  const looseWeight = compactedDensity / profile.looseFactor;
  const unit = uom.trim().toUpperCase().replace(/M³|M3/g, "CUM");
  if (["MT", "TON", "TONNE", "TONNES"].includes(unit)) return quantity;
  if (["KG", "KGS"].includes(unit)) return quantity / 1000;
  if (unit === "CUM" || unit === "M3") {
    return quantity * (basis === "loose" ? looseWeight : compactedDensity);
  }
  if (unit === "CFT") {
    return quantity * (basis === "loose" ? looseWeight : compactedDensity) / CUBIC_FEET_PER_CUBIC_METRE;
  }
  return null;
}

function canonicalVolumeMassUom(value: string): string {
  const unit = value.trim().toUpperCase().replace(/M³|M3|CUBIC\s*MET(?:RE|ER)|CUBIC\s*MET(?:RE|ER)S/g, "CUM");
  if (["TON", "TONNE", "TONNES", "T"].includes(unit)) return "MT";
  if (["KG", "KGS", "KILOGRAM", "KILOGRAMS"].includes(unit)) return "KG";
  if (["CUM", "M³", "M3"].includes(unit)) return "CUM";
  if (["CFT", "CUFT", "FT³"].includes(unit)) return "CFT";
  return unit;
}

export function boqQuantityToCompactedCum(
  quantity: number,
  uom: string,
  thicknessMm: number | null | undefined,
  profile: CompactedLooseProfile | null | undefined,
): number | null {
  if (!Number.isFinite(quantity) || quantity < 0) return null;
  const unit = canonicalVolumeMassUom(uom);
  if (unit === "CUM") return quantity;
  if (unit === "CFT") return quantity / CUBIC_FEET_PER_CUBIC_METRE;
  if (unit === "SQM" || unit === "SQFT") {
    if (!finite(thicknessMm) || thicknessMm <= 0) return null;
    const squareMetres = unit === "SQFT" ? quantity * 0.09290304 : quantity;
    return squareMetres * thicknessMm / 1000;
  }
  if (unit === "MT" || unit === "KG") {
    if (!hasCompleteCompactedLooseProfile(profile)) return null;
    const mt = unit === "KG" ? quantity / 1000 : quantity;
    const compactedDensity = profile.rolledDensity * profile.rollingPct / 100;
    return compactedDensity > 0 ? mt / compactedDensity : null;
  }
  return null;
}

/**
 * Converts between a material's BOQ compacted basis and its loose delivery basis.
 * CUM BOQ quantities are compacted; CFT truck quantities are loose.
 */
export function convertCompactedLooseUom(
  quantity: number,
  fromUom: string,
  toUom: string,
  profile: CompactedLooseProfile | null | undefined,
): number | null {
  if (!Number.isFinite(quantity) || !hasCompleteCompactedLooseProfile(profile)) return null;
  const from = canonicalVolumeMassUom(fromUom);
  const to = canonicalVolumeMassUom(toUom);
  if (from === to) return quantity;

  const compactedDensity = profile.rolledDensity * profile.rollingPct / 100;
  const looseWeight = compactedDensity / profile.looseFactor;
  const toMt = (qty: number, unit: string): number | null => {
    if (unit === "MT") return qty;
    if (unit === "KG") return qty / 1000;
    if (unit === "CUM") return qty * compactedDensity;
    if (unit === "CFT") return qty * looseWeight / CUBIC_FEET_PER_CUBIC_METRE;
    return null;
  };
  const fromMt = (mt: number, unit: string): number | null => {
    if (unit === "MT") return mt;
    if (unit === "KG") return mt * 1000;
    if (unit === "CUM") return mt / compactedDensity;
    if (unit === "CFT") return mt / looseWeight * CUBIC_FEET_PER_CUBIC_METRE;
    return null;
  };
  const asMt = toMt(quantity, from);
  const converted = asMt == null ? null : fromMt(asMt, to);
  return converted == null || !Number.isFinite(converted) ? null : converted;
}

/** New material values replace only the older loose-to-compacted profile. */
export function looseToCompactedProfileFactor(
  fromUom: string,
  toUom: string,
  profile: CompactedLooseProfile | null | undefined,
): number | null {
  if (!hasCompleteCompactedLooseProfile(profile)) return null;
  const from = canonicalVolumeMassUom(fromUom);
  const to = canonicalVolumeMassUom(toUom);
  if (from === "CUM" && to === "CUM") return 1 / profile.looseFactor;
  if (from === "CFT" && to === "CUM") return 1 / (CUBIC_FEET_PER_CUBIC_METRE * profile.looseFactor);
  if (from === "CUM" && to === "CFT") return profile.looseFactor * CUBIC_FEET_PER_CUBIC_METRE;
  if (from === "CFT" && to === "CFT") return 1;
  return convertCompactedLooseUom(1, fromUom, toUom, profile);
}
