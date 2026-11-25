import { companyPrefixSegment } from "./companyIdentity";

export type DeliveryEvidence = {
  kind: "receipt" | "trip"; id: number; date: string; quantity: number;
  uom: string; reference: string | null; status: "active" | "cancelled" | "deleted";
  countedQty?: number | null;
  countedWarning?: string | null;
};

// A linked material master is authoritative for bulk routing. Never infer a route
// from the item's free-text description (or silently rewrite its saved route).
export function effectivePiDeliveryRoute(item: {
  procurementRoute?: string | null; catalogProcurementRoute?: string | null;
}): string | null {
  return item.catalogProcurementRoute === "material" || item.catalogProcurementRoute === "bulk_plant"
    ? item.catalogProcurementRoute
    : item.procurementRoute ?? item.catalogProcurementRoute ?? null;
}

export function isBulkPiDeliveryItem(item: Parameters<typeof effectivePiDeliveryRoute>[0]): boolean {
  return ["material", "bulk_plant"].includes(effectivePiDeliveryRoute(item) ?? "");
}

export function normalizeDeliveryMaterialName(value: unknown): string {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").toLocaleUpperCase("en") : "";
}

function deliveryUnit(value: string): { kind: "mass" | "volume" | "other"; key: string; factor: number } {
  const key = value.trim().toLowerCase().replace(/\s+/g, " ");
  if (["mt", "t", "ton", "tons", "tonne", "tonnes"].includes(key)) return { kind: "mass", key: "mt", factor: 1 };
  if (["kg", "kgs"].includes(key)) return { kind: "mass", key: "mt", factor: 0.001 };
  if (["cum", "m3", "m³"].includes(key)) return { kind: "volume", key: "cum", factor: 1 };
  if (["cft", "ft3", "ft³"].includes(key)) return { kind: "volume", key: "cum", factor: 1 / 35.315 };
  if (["l", "ltr", "litre", "litres", "liter", "liters"].includes(key)) return { kind: "volume", key: "cum", factor: 0.001 };
  return { kind: "other", key, factor: 1 };
}

export function convertDeliveryQuantity(
  qty: number,
  from: string,
  to: string,
  bulkDensityMtPerCum?: number | null,
): number | null {
  if (!Number.isFinite(qty) || qty < 0) return null;
  const source = deliveryUnit(from);
  const target = deliveryUnit(to);
  if (source.kind === target.kind && (source.kind !== "other" || source.key === target.key)) {
    return qty * source.factor / target.factor;
  }
  const density = Number(bulkDensityMtPerCum);
  if (!Number.isFinite(density) || density <= 0) return null;
  if (source.kind === "mass" && target.kind === "volume") {
    return qty * source.factor / density / target.factor;
  }
  if (source.kind === "volume" && target.kind === "mass") {
    return qty * source.factor * density / target.factor;
  }
  return null;
}

export function reconcileDeliveryEvidence(
  evidence: DeliveryEvidence[],
  uom: string,
  bulkDensityMtPerCum?: number | null,
  materialName?: string | null,
) {
  const unique = Array.from(new Map(evidence.map(e => [`${e.kind}:${e.id}`, e])).values());
  const deliveryWarnings: string[] = [];
  let deliveredQty = 0;
  const deliveryEvidence = unique.map(e => {
    const countedQty = e.status === "active" ? convertDeliveryQuantity(e.quantity, e.uom, uom, bulkDensityMtPerCum) : 0;
    const needsDensity = countedQty === null
      && ((deliveryUnit(e.uom).kind === "mass" && deliveryUnit(uom).kind === "volume")
        || (deliveryUnit(e.uom).kind === "volume" && deliveryUnit(uom).kind === "mass"));
    const countedWarning = needsDensity
      ? `Not counted — set bulk density for ${materialName?.trim() || "this material"} in Material master`
      : countedQty === null ? `Not counted — cannot convert ${e.uom} to ${uom}` : null;
    if (countedQty === null) deliveryWarnings.push(`${e.kind} ${e.id}: ${countedWarning}`);
    else deliveredQty += countedQty;
    return { ...e, countedQty, countedWarning };
  });
  return { deliveredQty, deliveryEvidence, deliveryWarnings };
}

export function validateDeliveryDestination(location: unknown, siteId: unknown) {
  if (!["hmp_plant", "rmc_plant", "site"].includes(String(location))) throw new Error("Explicit delivery destination is required (Plant or Site)");
  if (location === "site" && (!Number.isInteger(siteId) || Number(siteId) <= 0)) throw new Error("Receiving site is required");
  return { receivingLocation: String(location), receivingSiteId: location === "site" ? Number(siteId) : null };
}

export function formatPurchaseIndentNumber(siteName: string, year: number, sequence: number, companyShortName = "HLC") {
  const label = siteName.trim().toUpperCase().replace(/[\/\\]/g, "-");
  if (!label) throw new Error("Site or raised-from location is required");
  return `${companyPrefixSegment(companyShortName)}/PI/${label}/${year}/${String(sequence).padStart(4, "0")}`;
}