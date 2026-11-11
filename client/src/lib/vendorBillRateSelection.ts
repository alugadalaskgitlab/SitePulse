export type RateSelectionGroup = {
  equipmentId: number | null;
  groupName: string;
  entryType: string;
  category: string;
  unit: string;
};

export type VendorRateCardRecord = {
  id?: number;
  vendorName?: string | null;
  vendorId?: number | null;
  linkedVendorName?: string | null;
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

export const SITE_MATERIAL_TRIP_MATERIAL_SOURCE = "site_material_trip_material" as const;

export type AutoMaterialRateConversionItem = {
  sourceType?: string | null;
  category?: string | null;
  unit?: string | null;
};

export type AutoMaterialRateConversion =
  | { status: "not_applicable" | "no_match" | "ambiguous" }
  | { status: "manual_conversion_required"; targetUnit: string; card: VendorRateCardRecord }
  | { status: "same_unit"; rate: number; card: VendorRateCardRecord }
  | { status: "converted"; targetUnit: string; quantity: number; rate: number; card: VendorRateCardRecord };

/**
 * Material and transport can now be emitted from the same trip. Qualify only
 * the new material role so its identity cannot collide with the unchanged
 * legacy transporter identity.
 */
export function vendorBillAutoSourceIdentity(
  sourceType: string | null | undefined,
  sourceId: number | string | null | undefined,
  fallbackSource: string | null | undefined = "auto",
): string {
  if (sourceId == null || String(sourceId) === "") return fallbackSource || "auto";
  const normalizedId = String(sourceId).toLowerCase();
  return [SITE_MATERIAL_TRIP_MATERIAL_SOURCE, "site_material_trip_transport", "site_material_trip_unresolved", "site_material_trip_arrangement"].includes(sourceType || "")
    ? `auto:${sourceType}:${normalizedId}`
    : `auto:${normalizedId}`;
}

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
  const exactVendorIds = new Set(exactVendor.map(card => Number(card.vendorId)).filter(Number.isSafeInteger));
  const canonicalNames = new Set(exactVendor
    .map(card => normalizeRateCardPart(card.linkedVendorName))
    .filter(Boolean));
  const vendorMatches = allowVendorAliases
    ? candidates.filter(card =>
      normalizeRateCardPart(card.vendorName) === normalizeRateCardPart(selectedVendor) ||
      (card.vendorId != null && exactVendorIds.has(Number(card.vendorId))) ||
      (!!card.linkedVendorName && (
        normalizeRateCardPart(card.linkedVendorName) === normalizeRateCardPart(selectedVendor) ||
        canonicalNames.has(normalizeRateCardPart(card.linkedVendorName))
      )),
    )
    : exactVendor;
  return vendorMatches.sort((a, b) => {
    const vendorPriority = allowVendorAliases
      ? Number(normalizeRateCardPart(b.vendorName) === normalizeRateCardPart(selectedVendor)) -
        Number(normalizeRateCardPart(a.vendorName) === normalizeRateCardPart(selectedVendor))
      : 0;
    const keyDifference =
      (keyOrder.get(normalizeRateCardPart(a.itemKey)) ?? Number.MAX_SAFE_INTEGER) -
      (keyOrder.get(normalizeRateCardPart(b.itemKey)) ?? Number.MAX_SAFE_INTEGER);
    return vendorPriority || keyDifference || String(b.updatedAt || "").localeCompare(String(a.updatedAt || ""));
  });
}

export function distinctRateCardRateChoices(
  group: RateSelectionGroup,
  unit: string,
  rateCards: VendorRateCardRecord[],
  selectedVendor: string,
): RateCardUnitOption[] {
  const matches = matchingRateCardsForGroup(group, unit, rateCards, selectedVendor, { allowVendorAliases: true })
    .filter(card => Number(card.rate) > 0);
  const distinct = new Map<string, RateCardUnitOption>();
  for (const card of matches) {
    const rate = Number(card.rate);
    const key = `${normalizeRateCardPart(unit)}:${rate}`;
    if (!distinct.has(key)) distinct.set(key, { unit: card.unit || unit, rate, card });
  }
  return Array.from(distinct.values());
}

export function defaultConvertedQuantity(_unit: string): number {
  // There is no safe implicit conversion factor. One source row becomes one
  // target unit and remains editable in the bill table.
  return 1;
}

export function isDifferentBillingUnit(left: unknown, right: unknown): boolean {
  return normalizeRateCardPart(left) !== normalizeRateCardPart(right);
}

/**
 * Auto-pulled rows may use a physical/logged unit that differs from the
 * vendor's commercial billing unit, regardless of the vendor's role. A
 * conversion is safe only when exact, unit-aware rate-card matching leaves one
 * positive alternate-unit card. In particular, do not use
 * matchingRateCardsForGroup's sort order to choose between multiple cards.
 */
export function selectAutoMaterialRateConversion(
  item: AutoMaterialRateConversionItem,
  group: RateSelectionGroup,
  rateCards: VendorRateCardRecord[],
  selectedVendor: string,
): AutoMaterialRateConversion {
  if (!normalizeRateCardPart(item.category)) {
    return { status: "not_applicable" };
  }

  const currentUnit = normalizeRateCardPart(item.unit || group.unit);
  const currentMatches = matchingRateCardsForGroup(
    group,
    currentUnit,
    rateCards,
    selectedVendor,
    { allowVendorAliases: true },
  ).filter(card => Number(card.rate) > 0);
  const currentRates = Array.from(new Set(currentMatches.map(card => Number(card.rate))));
  if (currentRates.length === 1) {
    return {
      status: "same_unit",
      rate: currentRates[0],
      card: currentMatches[0],
    };
  }
  if (currentRates.length > 1) return { status: "ambiguous" };

  const alternateUnits = Array.from(new Set(
    rateCards
      .filter(card => Number(card.rate) > 0)
      .map(card => normalizeRateCardPart(card.unit))
      .filter(unit => unit && unit !== currentUnit),
  ));
  const matches = alternateUnits.flatMap(targetUnit =>
    matchingRateCardsForGroup(group, targetUnit, rateCards, selectedVendor, { allowVendorAliases: true })
      .filter(card => Number(card.rate) > 0)
      .map(card => ({ targetUnit, card })),
  );

  if (matches.length === 0) return { status: "no_match" };
  const distinctMatches = Array.from(new Map(matches.map(match => [
    `${normalizeRateCardPart(match.targetUnit)}:${Number(match.card.rate)}`,
    match,
  ])).values());
  if (distinctMatches.length !== 1) return { status: "ambiguous" };

  const selectedMatch = distinctMatches[0];
  const isExistingMaterialSource = item.sourceType === SITE_MATERIAL_TRIP_MATERIAL_SOURCE;
  const isOneTripCommercialUnit =
    item.sourceType === "site_material_trip" &&
    selectedMatch.targetUnit === "TRIP";
  if (!isExistingMaterialSource && !isOneTripCommercialUnit) {
    return {
      status: "manual_conversion_required",
      targetUnit: selectedMatch.targetUnit,
      card: selectedMatch.card,
    };
  }

  return {
    status: "converted",
    targetUnit: selectedMatch.targetUnit,
    quantity: defaultConvertedQuantity(selectedMatch.targetUnit),
    rate: Number(selectedMatch.card.rate),
    card: selectedMatch.card,
  };
}