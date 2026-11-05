import {
  CUBIC_FEET_PER_CUBIC_METRE,
  calculateCompactedLooseQuantity,
  hasCompleteCompactedLooseProfile,
  type CompactedLooseProfile,
} from "./compactedLoose";

export type MaterialBalanceSourceKind = "received" | "used";
export type MaterialBalanceBasis = "compacted" | "loose";

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
}

export interface MaterialBalanceRow {
  materialName: string;
  rolledQuantity: number | null;
  rolledUom: string;
  compactedCum: number | null;
  requiredMt: number | null;
  requiredLooseCum: number | null;
  requiredLooseCft: number | null;
  wastageMt: number | null;
  wastageCum: number | null;
  receivedMt: number | null;
  usedMt: number | null;
  differenceMt: number | null;
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

function addOptional(total: number | null, next: number | null): number | null {
  return total == null || next == null ? null : total + next;
}

export function buildMaterialBalanceRows(
  requirements: MaterialBalanceRequirement[],
  sourceQuantities: MaterialBalanceQuantity[],
): MaterialBalanceRow[] {
  const rows = new Map<string, MaterialBalanceRow>();
  const profiles = new Map<string, CompactedLooseProfile | null>();

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
        compactedCum: 0,
        requiredMt: 0,
        requiredLooseCum: 0,
        requiredLooseCft: 0,
        wastageMt: 0,
        wastageCum: 0,
        receivedMt: 0,
        usedMt: 0,
        differenceMt: null,
        valuesConfigured: true,
        receivedSources: [],
        usedSources: [],
        attributions: [],
      };
      rows.set(key, row);
      profiles.set(key, requirement.profile);
    }
    if (row.rolledUom !== requirement.uom) {
      row.rolledUom = "Mixed";
      row.rolledQuantity = null;
    } else if (row.rolledQuantity != null) {
      row.rolledQuantity += requirement.quantity;
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
        row.compactedCum = addOptional(row.compactedCum, result.compactedCum);
        row.requiredMt = addOptional(row.requiredMt, result.requiredMt);
        row.requiredLooseCum = addOptional(row.requiredLooseCum, result.looseCum);
        row.requiredLooseCft = addOptional(row.requiredLooseCft, result.looseCft);
        row.wastageMt = addOptional(row.wastageMt, result.wastageMt);
        row.wastageCum = addOptional(row.wastageCum, result.wastageLooseCum);
      }
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
    const profile = profiles.get(key) ?? null;
    const value = quantityToMt(source.quantity, source.uom, source.basis, profile);
    if (source.kind === "received") {
      row.receivedMt = addOptional(row.receivedMt, value);
      row.receivedSources.push(source.source);
    } else {
      row.usedMt = addOptional(row.usedMt, value);
      row.usedSources.push(source.source);
    }
    row.attributions.push(source.attribution);
  }

  for (const row of rows.values()) {
    if (!row.valuesConfigured) {
      row.rolledQuantity = null;
      row.compactedCum = null;
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
    row.receivedSources = [...new Set(row.receivedSources)];
    row.usedSources = [...new Set(row.usedSources)];
    row.attributions = [...new Set(row.attributions)];
  }
  return [...rows.values()].sort((a, b) => a.materialName.localeCompare(b.materialName));
}
