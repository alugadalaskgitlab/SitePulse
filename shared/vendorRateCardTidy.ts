export type RateCardTidyCard = {
  id: number;
  vendorName: string;
  vendorId: number | null;
  category: string;
  itemKey: string;
  itemLabel: string | null;
  unit: string;
  rate: number | string;
  notes?: string | null;
  leadDistanceKm?: number | null;
  payloadMt?: number | null;
  ratePerKm?: number | null;
  updatedAt?: string | Date | null;
};

export type RateCardTidyVendor = { id: number; name: string; isActive?: boolean };

export type RateCardTidyGroup = {
  key: string;
  vendorId: number;
  vendorName: string;
  identity: string;
  category: string;
  itemKey: string;
  itemLabel: string;
  unit: string;
  sameRate: boolean;
  keeperId: number;
  rows: RateCardTidyCard[];
};

export type UnlinkedRateCardGroup = {
  key: string;
  savedName: string;
  savedNames: string[];
  rows: RateCardTidyCard[];
};

const nameKey = (value: unknown) => String(value ?? "").trim().replace(/\s+/g, " ").toUpperCase();

export function normalizeRateCardTidyUnit(unit: unknown): string {
  const normalized = nameKey(unit).replace(/\s+/g, "");
  if (normalized === "TRIPS") return "TRIP";
  if (normalized === "DAYS") return "DAY";
  if (normalized === "HOURS" || normalized === "HOUR") return "HRS";
  if (normalized === "KMS") return "KM";
  return normalized;
}

export function rateCardTidyIdentity(card: Pick<RateCardTidyCard, "category" | "itemKey" | "unit">): string {
  const category = nameKey(card.category);
  let key = nameKey(card.itemKey);
  const prefix = category === "MATERIAL" ? "MAT_" : category === "LABOUR" ? "LAB_" : "EQ_";
  if (key.startsWith(prefix)) key = key.slice(prefix.length);
  const suffix = `_${nameKey(card.unit).replace(/\s+/g, "_")}`;
  if (key.endsWith(suffix)) key = key.slice(0, -suffix.length);
  const compactKey = key.replace(/[^A-Z0-9]/g, "");
  return `${category}:${compactKey}:${normalizeRateCardTidyUnit(card.unit)}`;
}

function metadataCount(card: RateCardTidyCard): number {
  return Number(card.leadDistanceKm != null) + Number(card.payloadMt != null) +
    Number(card.ratePerKm != null) + Number(Boolean(card.notes));
}

export function chooseRateCardTidyKeeper(
  rows: RateCardTidyCard[],
  vendorName: string,
): RateCardTidyCard {
  return [...rows].sort((a, b) =>
    metadataCount(b) - metadataCount(a) ||
    Number(nameKey(b.vendorName) === nameKey(vendorName)) - Number(nameKey(a.vendorName) === nameKey(vendorName)) ||
    a.id - b.id,
  )[0];
}

export function buildRateCardTidyGroups(
  cards: RateCardTidyCard[],
  vendors: RateCardTidyVendor[],
): RateCardTidyGroup[] {
  const masters = new Map(vendors.map(vendor => [Number(vendor.id), vendor]));
  const groups = new Map<string, RateCardTidyCard[]>();
  for (const card of cards) {
    if (card.vendorId == null) continue;
    const vendor = masters.get(Number(card.vendorId));
    if (!vendor) continue;
    const identity = rateCardTidyIdentity(card);
    const key = `vendor:${vendor.id}:${identity}`;
    groups.set(key, [...(groups.get(key) ?? []), card]);
  }
  return Array.from(groups.entries())
    .filter(([, rows]) => rows.length > 1)
    .map(([key, rows]: [string, RateCardTidyCard[]]) => {
      const first = rows[0];
      const vendor = masters.get(Number(first.vendorId))!;
      const rates = rows.map(row => Number(row.rate));
      return {
        key,
        vendorId: Number(vendor.id),
        vendorName: vendor.name,
        identity: rateCardTidyIdentity(first),
        category: first.category,
        itemKey: first.itemKey,
        itemLabel: first.itemLabel || first.itemKey,
        unit: first.unit,
        sameRate: rates.every(rate => rate === rates[0]),
        keeperId: chooseRateCardTidyKeeper(rows, vendor.name).id,
        rows: [...rows].sort((a, b) => a.id - b.id),
      };
    })
    .sort((a, b) => a.vendorName.localeCompare(b.vendorName) || a.identity.localeCompare(b.identity));
}

export function buildUnlinkedRateCardGroups(cards: RateCardTidyCard[]): UnlinkedRateCardGroup[] {
  const groups = new Map<string, RateCardTidyCard[]>();
  for (const card of cards) {
    if (card.vendorId != null) continue;
    const key = nameKey(card.vendorName);
    if (!key) continue;
    groups.set(key, [...(groups.get(key) ?? []), card]);
  }
  return Array.from(groups.entries())
    .map(([key, rows]: [string, RateCardTidyCard[]]) => ({
      key,
      savedName: rows.map(row => row.vendorName).sort((a, b) => a.localeCompare(b))[0],
      savedNames: Array.from(new Set<string>(rows.map(row => row.vendorName))).sort((a, b) => a.localeCompare(b)),
      rows: [...rows].sort((a, b) => a.id - b.id),
    }))
    .sort((a, b) => a.savedName.localeCompare(b.savedName));
}

export type RateCardTidyDecision =
  | { key: string; action: "defer" }
  | { key: string; action: "keep"; keepCardId: number }
  | { key: string; action: "custom"; rate: number };

export type RateCardTidyOperation = {
  key: string;
  vendorId: number;
  vendorName: string;
  keepCardId: number;
  rate: number;
  choice: "same_rate_merge" | "selected_rate" | "custom_rate";
  rows: RateCardTidyCard[];
};

export function planRateCardTidyOperations(
  groups: RateCardTidyGroup[],
  decisions: RateCardTidyDecision[],
): RateCardTidyOperation[] {
  const byKey = new Map(decisions.map(decision => [decision.key, decision]));
  const conflicts = groups.filter(group => !group.sameRate);
  for (const group of conflicts) {
    if (!byKey.has(group.key)) throw new Error(`Choose a rate or Decide later for ${group.itemLabel}`);
  }
  for (const decision of decisions) {
    if (!groups.some(group => group.key === decision.key && !group.sameRate)) {
      throw new Error("A rate decision no longer matches the preview. Refresh it and review again.");
    }
  }

  const operations: RateCardTidyOperation[] = [];
  for (const group of groups) {
    if (group.sameRate) {
      operations.push({
        key: group.key,
        vendorId: group.vendorId,
        vendorName: group.vendorName,
        keepCardId: group.keeperId,
        rate: Number(group.rows.find(row => row.id === group.keeperId)!.rate),
        choice: "same_rate_merge",
        rows: group.rows,
      });
      continue;
    }
    const decision = byKey.get(group.key)!;
    if (decision.action === "defer") continue;
    const keeper = decision.action === "keep"
      ? group.rows.find(row => row.id === decision.keepCardId)
      : group.rows.find(row => row.id === group.keeperId);
    if (!keeper) throw new Error(`The chosen rate row is no longer in ${group.itemLabel}`);
    const rate = decision.action === "custom" ? decision.rate : Number(keeper.rate);
    if (!Number.isFinite(rate) || rate <= 0) throw new Error(`Enter a positive rate for ${group.itemLabel}`);
    operations.push({
      key: group.key,
      vendorId: group.vendorId,
      vendorName: group.vendorName,
      keepCardId: keeper.id,
      rate,
      choice: decision.action === "custom" ? "custom_rate" : "selected_rate",
      rows: group.rows,
    });
  }
  return operations;
}
