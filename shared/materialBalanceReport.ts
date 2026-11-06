import {
  CUBIC_FEET_PER_CUBIC_METRE,
  calculateCompactedLooseQuantity,
  hasCompleteCompactedLooseProfile,
  type CompactedLooseProfile,
} from "./compactedLoose";

export type MaterialBalanceSourceKind = "received" | "used";
export type MaterialBalanceBasis = "compacted" | "loose";
export type LegacyLooseToCompactedProfile = {
  fromUom: string;
  toUom: string;
  conversionFactor: number;
};

export interface MaterialBalanceQuantity {
  materialName: string;
  quantity: number;
  uom: string;
  basis: MaterialBalanceBasis;
  kind: MaterialBalanceSourceKind;
  source: string;
  attribution: "by project/item" | "by site";
}

export interface MaterialBalanceRequirement {
  materialName: string;
  quantity: number;
  uom: string;
  profile: CompactedLooseProfile | null;
  legacyLooseToCompactedProfiles?: LegacyLooseToCompactedProfile[];
  earthwork?: boolean;
}

export interface MaterialBalanceRow {
  materialName: string;
  rolledQuantity: number | null;
  rolledUom: string;
  nativeQuantity: number | null;
  nativeUom: string | null;
  compactedCum: number | null;
  requiredMt: number | null;
  requiredLooseCum: number | null;
  requiredLooseCft: number | null;
  wastageMt: number | null;
  wastageCum: number | null;
  receivedMt: number | null;
  usedMt: number | null;
  differenceMt: number | null;
  receivedCum: number | null;
  usedCum: number | null;
  differenceCum: number | null;
  receivedNative: number | null;
  usedNative: number | null;
  differenceNative: number | null;
  earthwork: boolean;
  valuesConfigured: boolean;
  receivedSources: string[];
  usedSources: string[];
  attributions: string[];
}

function keyOf(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLocaleUpperCase();
}

function normaliseUom(uom: string): "MT" | "CUM" | "CFT" | null {
  const key = uom.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (["MT", "TON", "TONNE", "TONNES", "T"].includes(key)) return "MT";
  if (["CUM", "M3", "CBM", "CUBICMETRE", "CUBICMETRES"].includes(key)) return "CUM";
  if (["CFT", "CUFT", "CUBICFEET", "CUBICFOOT"].includes(key)) return "CFT";
  return null;
}

function quantityToMt(
  quantity: number,
  uom: string,
  basis: MaterialBalanceBasis,
  profile: CompactedLooseProfile | null,
): number | null {
  if (!Number.isFinite(quantity) || quantity < 0) return null;
  const canonical = normaliseUom(uom);
  if (canonical === "MT") return quantity;
  if (!profile || !hasCompleteCompactedLooseProfile(profile)) return null;
  const cubicMetres = canonical === "CUM"
    ? quantity
    : canonical === "CFT"
      ? quantity / CUBIC_FEET_PER_CUBIC_METRE
      : null;
  if (cubicMetres == null) return null;
  if (basis === "compacted") {
    const density = profile.rolledDensity * profile.rollingPct / 100;
    return cubicMetres * density;
  }
  const looseDensity = profile.rolledDensity * profile.rollingPct / 100 / profile.looseFactor;
  return cubicMetres * looseDensity;
}

function legacyProfilesForUom(
  profiles: LegacyLooseToCompactedProfile[] | undefined,
  fromUom: string,
) {
  const wantedUom = normaliseUom(fromUom);
  if (!wantedUom) return [];
  return (profiles ?? []).filter(profile =>
    normaliseUom(profile.fromUom) === wantedUom &&
    normaliseUom(profile.toUom) === "CUM" &&
    Number.isFinite(Number(profile.conversionFactor)) &&
    Number(profile.conversionFactor) > 0,
  );
}

function quantityToCum(
  quantity: number,
  uom: string,
  basis: MaterialBalanceBasis,
  profile: CompactedLooseProfile | null,
  legacyProfiles?: LegacyLooseToCompactedProfile[],
): number | null {
  if (!Number.isFinite(quantity) || quantity < 0) return null;
  const canonical = normaliseUom(uom);
  const cubicMetres = canonical === "CUM"
    ? quantity
    : canonical === "CFT"
      ? quantity / CUBIC_FEET_PER_CUBIC_METRE
      : null;
  if (cubicMetres != null) {
    if (basis === "compacted") return cubicMetres;
    if (profile && hasCompleteCompactedLooseProfile(profile)) return cubicMetres / profile.looseFactor;
    const exactProfiles = legacyProfilesForUom(legacyProfiles, canonical!);
    if (exactProfiles.length === 1) return quantity * Number(exactProfiles[0].conversionFactor);
    if (exactProfiles.length > 1) return null;
    if (canonical === "CFT") {
      const cumProfiles = legacyProfilesForUom(legacyProfiles, "CUM");
      if (cumProfiles.length === 1) return cubicMetres * Number(cumProfiles[0].conversionFactor);
    }
    return null;
  }
  if (canonical !== "MT" || !profile || !hasCompleteCompactedLooseProfile(profile)) return null;
  const compactedDensity = profile.rolledDensity * profile.rollingPct / 100;
  const density = basis === "compacted" ? compactedDensity : compactedDensity / profile.looseFactor;
  return density > 0 ? quantity / density : null;
}

function addOptional(total: number | null, next: number | null): number | null {
  return total == null || next == null ? null : total + next;
}

export function buildMaterialBalanceRows(
  requirements: MaterialBalanceRequirement[],
  sourceQuantities: MaterialBalanceQuantity[],
): MaterialBalanceRow[] {
  const rows = new Map<string, MaterialBalanceRow>();
  const profiles = new Map<string, CompactedLooseProfile | null>();
  const legacyProfiles = new Map<string, LegacyLooseToCompactedProfile[]>();

  for (const requirement of requirements) {
    const materialName = requirement.materialName.trim();
    if (!materialName) continue;
    const key = keyOf(materialName);
    let row = rows.get(key);
    if (!row) {
      row = {
        materialName,
        rolledQuantity: 0,
        rolledUom: requirement.uom,
        nativeQuantity: normaliseUom(requirement.uom) == null ? 0 : null,
        nativeUom: normaliseUom(requirement.uom) == null ? requirement.uom : null,
        compactedCum: 0,
        requiredMt: 0,
        requiredLooseCum: 0,
        requiredLooseCft: 0,
        wastageMt: 0,
        wastageCum: 0,
        receivedMt: 0,
        usedMt: 0,
        differenceMt: null,
        receivedCum: 0,
        usedCum: 0,
        differenceCum: null,
        receivedNative: 0,
        usedNative: 0,
        differenceNative: null,
        earthwork: !!requirement.earthwork,
        valuesConfigured: true,
        receivedSources: [],
        usedSources: [],
        attributions: [],
      };
      rows.set(key, row);
      profiles.set(key, requirement.profile);
    }
    if (requirement.legacyLooseToCompactedProfiles?.length) {
      legacyProfiles.set(key, requirement.legacyLooseToCompactedProfiles);
    }
    row.earthwork ||= !!requirement.earthwork;
    if (row.rolledUom !== requirement.uom) {
      row.rolledUom = "Mixed";
      row.rolledQuantity = null;
    } else if (row.rolledQuantity != null) {
      row.rolledQuantity += requirement.quantity;
    }
    if (normaliseUom(requirement.uom) == null) {
      if (row.nativeUom === requirement.uom && row.nativeQuantity != null) {
        row.nativeQuantity += requirement.quantity;
      } else {
        row.nativeUom = "Mixed";
        row.nativeQuantity = null;
      }
      row.compactedCum = null;
      row.requiredMt = null;
      row.requiredLooseCum = null;
      row.requiredLooseCft = null;
      row.wastageMt = null;
      row.wastageCum = null;
      row.receivedMt = null;
      row.usedMt = null;
      row.differenceMt = null;
      row.receivedCum = null;
      row.usedCum = null;
      row.differenceCum = null;
      continue;
    }

    if (row.nativeUom != null) {
      row.nativeUom = "Mixed";
      row.nativeQuantity = null;
      row.compactedCum = null;
      row.requiredMt = null;
      row.requiredLooseCum = null;
      row.requiredLooseCft = null;
      row.wastageMt = null;
      row.wastageCum = null;
      row.receivedMt = null;
      row.usedMt = null;
      row.differenceMt = null;
      row.receivedCum = null;
      row.usedCum = null;
      row.differenceCum = null;
      continue;
    }

    const profile = requirement.profile ?? profiles.get(key) ?? null;
    if (requirement.profile && hasCompleteCompactedLooseProfile(requirement.profile)) profiles.set(key, requirement.profile);
    if (profile && hasCompleteCompactedLooseProfile(profile)) {
      const canonicalUom = normaliseUom(requirement.uom);
      const compactedCum = canonicalUom === "CUM"
        ? requirement.quantity
        : canonicalUom === "MT"
          ? requirement.quantity / (profile.rolledDensity * profile.rollingPct / 100)
          : canonicalUom === "CFT"
            ? requirement.quantity / CUBIC_FEET_PER_CUBIC_METRE
            : null;
      if (compactedCum == null) {
        row.valuesConfigured = false;
        row.compactedCum = null;
        row.requiredMt = null;
        row.requiredLooseCum = null;
        row.requiredLooseCft = null;
        row.wastageMt = null;
        row.wastageCum = null;
      } else {
        const result = calculateCompactedLooseQuantity(compactedCum, profile);
        if (!result) {
          row.valuesConfigured = false;
          row.compactedCum = null;
          row.requiredMt = null;
          row.requiredLooseCum = null;
          row.requiredLooseCft = null;
          row.wastageMt = null;
          row.wastageCum = null;
        } else {
          row.compactedCum = addOptional(row.compactedCum, result.compactedCum);
          row.requiredMt = addOptional(row.requiredMt, result.requiredMt);
          row.requiredLooseCum = addOptional(row.requiredLooseCum, result.looseCum);
          row.requiredLooseCft = addOptional(row.requiredLooseCft, result.looseCft);
          row.wastageMt = addOptional(row.wastageMt, result.wastageMt);
          row.wastageCum = addOptional(row.wastageCum, result.wastageLooseCum);
        }
      }
    } else if (requirement.earthwork && normaliseUom(requirement.uom) === "CUM") {
      row.compactedCum = addOptional(row.compactedCum, requirement.quantity);
      row.valuesConfigured = false;
    } else {
      row.valuesConfigured = false;
      row.compactedCum = null;
      row.requiredMt = null;
      row.requiredLooseCum = null;
      row.requiredLooseCft = null;
      row.wastageMt = null;
      row.wastageCum = null;
    }
  }

  for (const source of sourceQuantities) {
    const key = keyOf(source.materialName);
    const row = rows.get(key);
    if (!row) continue;
    if (row.nativeUom != null) {
      if (row.nativeUom !== "Mixed" && row.nativeUom.trim().toUpperCase() === source.uom.trim().toUpperCase()) {
        if (source.kind === "received") row.receivedNative = addOptional(row.receivedNative, source.quantity);
        else row.usedNative = addOptional(row.usedNative, source.quantity);
      }
      if (source.kind === "received") row.receivedSources.push(source.source);
      else row.usedSources.push(source.source);
      row.attributions.push(source.attribution);
      continue;
    }
    const profile = profiles.get(key) ?? null;
    const value = quantityToMt(source.quantity, source.uom, source.basis, profile);
    const cubicValue = quantityToCum(
      source.quantity,
      source.uom,
      source.basis,
      profile,
      legacyProfiles.get(key),
    );
    if (source.kind === "received") {
      row.receivedMt = addOptional(row.receivedMt, value);
      row.receivedCum = addOptional(row.receivedCum, cubicValue);
      row.receivedSources.push(source.source);
    } else {
      row.usedMt = addOptional(row.usedMt, value);
      row.usedCum = addOptional(row.usedCum, cubicValue);
      row.usedSources.push(source.source);
    }
    row.attributions.push(source.attribution);
  }

  for (const row of Array.from(rows.values())) {
    if (!row.valuesConfigured) {
      if (!row.earthwork) {
        row.rolledQuantity = null;
        row.compactedCum = null;
      }
      row.requiredMt = null;
      row.requiredLooseCum = null;
      row.requiredLooseCft = null;
      row.wastageMt = null;
      row.wastageCum = null;
      row.receivedMt = null;
      row.usedMt = null;
    }
    row.differenceMt = row.receivedMt == null || row.usedMt == null
      ? null
      : row.receivedMt - row.usedMt;
    row.differenceCum = row.receivedCum == null || row.usedCum == null
      ? null
      : row.receivedCum - row.usedCum;
    row.differenceNative = row.receivedNative == null || row.usedNative == null
      ? null
      : row.receivedNative - row.usedNative;
    row.receivedSources = Array.from(new Set(row.receivedSources));
    row.usedSources = Array.from(new Set(row.usedSources));
    row.attributions = Array.from(new Set(row.attributions));
  }
  return Array.from(rows.values()).sort((a, b) => a.materialName.localeCompare(b.materialName));
}
