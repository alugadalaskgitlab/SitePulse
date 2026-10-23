export type SnlWorkFamily = "earthwork" | "granular" | "bituminous";

const WORK_CATEGORY_FAMILIES: Record<string, SnlWorkFamily> = {
  EARTHWORK: "earthwork",
  SUBBASE_BASE: "granular",
  BITUMINOUS: "bituminous",
};

const RULE_TAG_FAMILIES: Record<string, SnlWorkFamily> = {
  EMBANKMENT: "earthwork",
  SUBGRADE: "earthwork",
  ROADWAY_EXCAVATION: "earthwork",
  FORMATION_EXCAVATION: "earthwork",
  GSB: "granular",
  WMM: "granular",
  DBM: "bituminous",
  SDBC: "bituminous",
  BC: "bituminous",
  BM: "bituminous",
  PRIME_COAT: "bituminous",
  TACK_COAT: "bituminous",
  SEAL_COAT: "bituminous",
  MASTIC: "bituminous",
};

function normalizedKey(value: string | null | undefined): string {
  return String(value ?? "").trim().toUpperCase();
}

function familyForWorkCategory(value: string | null | undefined): SnlWorkFamily | null {
  return WORK_CATEGORY_FAMILIES[normalizedKey(value)] ?? null;
}

function familyForRuleTag(value: string | null | undefined): SnlWorkFamily | null {
  return RULE_TAG_FAMILIES[normalizedKey(value)] ?? null;
}

/**
 * When the BOQ work type is known, reject SNL candidates from another family.
 * A specific description rule takes precedence over a broad stored category.
 */
export function isSnlWorkFamilyCompatible(
  boqWorkCategory: string | null | undefined,
  ruleTag: string | null | undefined,
  snlWorkCategory: string | null | undefined,
): boolean {
  const expectedFamily =
    familyForRuleTag(ruleTag) ?? familyForWorkCategory(boqWorkCategory);
  if (!expectedFamily) return true;
  return familyForWorkCategory(snlWorkCategory) === expectedFamily;
}

/**
 * An SNL recipe is eligible only after the item was marked mapped or the user
 * explicitly created a manual mapping. A stored suggestion ID alone is not
 * confirmation.
 */
export function isConfirmedSnlMapping(mapping: {
  snlItemId?: number | null;
  snlMappingStatus?: string | null;
  snlMappingIsAuto?: boolean | null;
}): boolean {
  return mapping.snlItemId != null &&
    (mapping.snlMappingStatus === "mapped" || mapping.snlMappingIsAuto === false);
}
