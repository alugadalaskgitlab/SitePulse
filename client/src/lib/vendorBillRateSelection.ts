export type RateSelectionGroup = {
  equipmentId: number | null;
  groupName: string;
  entryType: string;
  category: string;
  unit: string;
};

export type VendorRateCardRecord = {
  vendorName?: string | null;
  category?: string | null;
  itemKey?: string | null;
  unit?: string | null;
  rate?: number | string | null;
  updatedAt?: string | null;
};

export type RateCardUnitOption = {
  unit: string;
  rate: number;
  card: VendorRateCardRecord;
};

export type RateCardMatchOptions = {
  allowBlankUnitFallback?: boolean;
  allowVendorAliases?: boolean;
};

export const normalizeRateCardPart = (value: unknown) =>
  String(value ?? "").trim().toUpperCase().replace(/\s+/g, "_");

function deriveLabourKey(description: string): string {
  const head = description.trim().toUpperCase().split(" - ")[0].trim();
  const parts = head.split(/\s+/).filter(Boolean);
  if (parts[0] !== "LABOUR" || parts.length < 2) {
    return head.replace(/\s+/g, "_");
  }
  const category = parts[1];
  const gender = parts[2];
  return gender ? `LAB_${category}_${gender}` : `LAB_${category}`;
}

function rateCardIdentityKeys(group: RateSelectionGroup, unit: string): string[] {
  const normalizedUnit = normalizeRateCardPart(unit);
  const groupName = normalizeRateCardPart(group.groupName);
  if (group.category === "material") {
    return [`MAT_${groupName}_${normalizedUnit}`, `MAT_${groupName}`];
  }
  if (group.category === "transport") {
    return [`EQ_${groupName}_${normalizedUnit}`];
  }
  if (group.category === "equipment") {
    const machineKey = `EQ_${groupName}_${normalizedUnit}`;
    // The legacy equipment key used underscores for the slash in
    // TIME/METER. Keep that exact historical spelling.
    const entryType = normalizeRateCardPart(group.entryType || "OTHER").replace(/\//g, "_");
    const legacyKey = group.equipmentId == null ? "" : `${group.equipmentId}_${entryType}`;
    return legacyKey ? [machineKey, legacyKey] : [machineKey];
  }
  if (group.category === "labour") {
    return [normalizeRateCardPart(deriveLabourKey(group.groupName))];
  }
  return [groupName];
}

/**
 * Resolve cards only by exact category/item identity and the selected vendor.
 * The endpoint is vendor-scoped and may include resolved vendor aliases; an
 * exact selected-vendor card always wins over one returned through that alias.
 *
 * Blank-unit cards are intentionally opt-in for current-unit prefill only.
 * They must never create an alternate-unit option.
 */
export function matchingRateCardsForGroup(
  group: RateSelectionGroup,
  unit: string,
  rateCards: VendorRateCardRecord[],
  selectedVendor: string,
  options: RateCardMatchOptions = {},
): VendorRateCardRecord[] {
  const { allowBlankUnitFallback = false, allowVendorAliases = false } = options;
  const keys = rateCardIdentityKeys(group, unit).map(normalizeRateCardPart);
  const keyOrder = new Map(keys.map((key, index) => [key, index]));
  const normalizedCategory = normalizeRateCardPart(group.category);
  const normalizedUnit = normalizeRateCardPart(unit);
  const candidates = rateCards.filter(card => {
    const cardUnit = normalizeRateCardPart(card.unit);
    const unitMatches = cardUnit === normalizedUnit ||
      (allowBlankUnitFallback && !cardUnit && !isDifferentBillingUnit(unit, group.unit));
    return normalizeRateCardPart(card.category) === normalizedCategory &&
      unitMatches &&
      keyOrder.has(normalizeRateCardPart(card.itemKey));
  });
  const exactVendor = candidates.filter(card =>
    normalizeRateCardPart(card.vendorName) === normalizeRateCardPart(selectedVendor),
  );
  const vendorMatches = allowVendorAliases && !exactVendor.length ? candidates : exactVendor;
  return vendorMatches.sort((a, b) => {
    const keyDifference =
      (keyOrder.get(normalizeRateCardPart(a.itemKey)) ?? Number.MAX_SAFE_INTEGER) -
      (keyOrder.get(normalizeRateCardPart(b.itemKey)) ?? Number.MAX_SAFE_INTEGER);
    return keyDifference || String(b.updatedAt || "").localeCompare(String(a.updatedAt || ""));
  });
}

export function defaultConvertedQuantity(_unit: string): number {
  // There is no safe implicit conversion factor. One source row becomes one
  // target unit and remains editable in the bill table.
  return 1;
}

export function isDifferentBillingUnit(left: unknown, right: unknown): boolean {
  return normalizeRateCardPart(left) !== normalizeRateCardPart(right);
}