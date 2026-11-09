export type DieselSupplierVendor = {
  id: number;
  name: string;
  businessName?: string | null;
  isActive?: boolean | number | null;
};

export type DieselSupplierAlias = {
  canonicalName: string;
  alias: string;
};

export type DieselSupplierSuggestion = {
  id: number;
  name: string;
  vendorId: number | null;
  kind: "master" | "previous";
  businessName?: string | null;
};

const key = (value: string) => value.trim().replace(/\s+/g, " ").toLocaleUpperCase();
const searchable = (value: string) => value.trim().toLocaleLowerCase();
const active = (vendor: DieselSupplierVendor) =>
  vendor.isActive == null || vendor.isActive === true || Number(vendor.isActive) === 1;

export function buildDieselSupplierSuggestions(
  query: string,
  vendors: DieselSupplierVendor[],
  aliases: DieselSupplierAlias[],
  previousNames: string[],
): DieselSupplierSuggestion[] {
  const needle = searchable(query);
  if (needle.length < 2) return [];

  const masterSuggestions = vendors
    .filter(active)
    .filter((vendor) => {
      const names = [vendor.name, vendor.businessName || ""];
      const aliasNames = aliases
        .filter((alias) => key(alias.canonicalName) === key(vendor.name))
        .map((alias) => alias.alias);
      return [...names, ...aliasNames].some((name) => searchable(name).includes(needle));
    })
    .map((vendor) => ({
      id: vendor.id,
      name: vendor.name,
      vendorId: vendor.id,
      kind: "master" as const,
      businessName: vendor.businessName,
    }));

  const masterNames = new Set<string>();
  for (const vendor of vendors) {
    if (!active(vendor)) continue;
    masterNames.add(key(vendor.name));
    if (vendor.businessName) masterNames.add(key(vendor.businessName));
    aliases
      .filter((alias) => key(alias.canonicalName) === key(vendor.name))
      .forEach((alias) => masterNames.add(key(alias.alias)));
  }

  const seenPrevious = new Set<string>();
  const previousSuggestions: DieselSupplierSuggestion[] = [];
  for (const name of previousNames) {
    const trimmed = name.trim();
    const normalized = key(trimmed);
    if (!trimmed || !searchable(trimmed).includes(needle) ||
        masterNames.has(normalized) || seenPrevious.has(normalized)) continue;
    seenPrevious.add(normalized);
    previousSuggestions.push({
      id: -(previousSuggestions.length + 1),
      name: trimmed,
      vendorId: null,
      kind: "previous",
    });
  }

  return [...masterSuggestions, ...previousSuggestions];
}

function normalizedForDistance(value: string) {
  return value.trim().toLocaleUpperCase().replace(/[^A-Z0-9]/g, "");
}

function editDistance(left: string, right: string) {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i++) {
    const current = [i];
    for (let j = 1; j <= right.length; j++) {
      current[j] = Math.min(
        current[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + (left[i - 1] === right[j - 1] ? 0 : 1),
      );
    }
    for (let j = 0; j <= right.length; j++) previous[j] = current[j];
  }
  return previous[right.length];
}

export function findCloseDieselSupplierMatch(
  value: string,
  vendors: DieselSupplierVendor[],
  previousNames: string[],
): DieselSupplierSuggestion | null {
  const normalized = normalizedForDistance(value);
  if (normalized.length < 4) return null;

  const candidates: DieselSupplierSuggestion[] = [
    ...vendors.filter(active).map((vendor) => ({
      id: vendor.id,
      name: vendor.name,
      vendorId: vendor.id,
      kind: "master" as const,
      businessName: vendor.businessName,
    })),
    ...previousNames.filter((name) => name.trim()).map((name, index) => ({
      id: -(index + 1),
      name: name.trim(),
      vendorId: null,
      kind: "previous" as const,
    })),
  ];

  const seen = new Set<string>();
  let best: { candidate: DieselSupplierSuggestion; distance: number } | null = null;
  for (const candidate of candidates) {
    const candidateKey = normalizedForDistance(candidate.name);
    if (!candidateKey || candidateKey === normalized || seen.has(candidateKey)) continue;
    seen.add(candidateKey);
    const distance = editDistance(normalized, candidateKey);
    const threshold = Math.max(1, Math.floor(Math.max(normalized.length, candidateKey.length) * 0.2));
    if (distance > threshold) continue;
    if (!best || distance < best.distance) best = { candidate, distance };
  }
  return best?.candidate ?? null;
}

export function dieselSupplierReportGroup(
  purchase: { supplier?: string | null; vendorId?: number | null },
  vendors: DieselSupplierVendor[],
  aliases: DieselSupplierAlias[],
): { kind: "master" | "fuel_station"; key: string; label: string } {
  const linkedVendor = purchase.vendorId == null ? null : vendors.find((vendor) => vendor.id === purchase.vendorId);
  if (purchase.vendorId != null) {
    return {
      kind: "master",
      key: `vendor:${purchase.vendorId}`,
      label: linkedVendor?.name || purchase.supplier?.trim() || "Vendor",
    };
  }

  const supplier = purchase.supplier?.trim() || "";
  const matchingAliases = aliases.filter((alias) => key(alias.alias) === key(supplier));
  const canonicalNames = Array.from(new Set(matchingAliases.map((alias) => key(alias.canonicalName))));
  if (canonicalNames.length === 1) {
    const matchedVendor = vendors.find((vendor) => key(vendor.name) === canonicalNames[0]);
    if (matchedVendor) {
      return { kind: "master", key: `vendor:${matchedVendor.id}`, label: matchedVendor.name };
    }
  }
  return {
    kind: "fuel_station",
    key: `fuel:${supplier || "(not recorded)"}`,
    label: supplier || "Not recorded",
  };
}

export function linkedDieselReceiptCanCreateVendorBillItem(
  purchase: { paymentMode?: string | null; paymentStatus?: string | null; vendorId?: number | null },
  targetVendorIds: number[],
) {
  return purchase.paymentMode?.trim().toLowerCase() === "credit" &&
    purchase.paymentStatus?.trim().toLowerCase() !== "paid" &&
    purchase.vendorId != null &&
    targetVendorIds.includes(purchase.vendorId);
}
