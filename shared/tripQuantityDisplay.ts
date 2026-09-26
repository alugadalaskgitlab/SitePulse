import { convertSolidQty, normalizeUom } from "./uomConvert";

export interface TripQuantityInput {
  quantity: number | string;
  uom: string;
  boqItemId?: number | null;
  material?: string;
  boqQuantity?: { quantity: number; uom: string } | null;
}

/** Exact BOQ + material recipe lookup only. Recipe rates are not conversions.
 * MAT-03 explicitly requires entered-only display when density is absent,
 * even for volume-to-volume conversions that otherwise need no density.
 */
export function lookupTripBoqQuantity(
  trip: TripQuantityInput,
  recipes: readonly { boqItemId: number; materialName: string; uom: string }[],
  materials: readonly { name: string; bulkDensity: number | null }[],
): TripQuantityInput["boqQuantity"] {
  if (trip.boqItemId == null) return null;
  const matches = recipes.filter(r => r.boqItemId === trip.boqItemId && r.materialName === trip.material);
  const masters = materials.filter(m => m.name === trip.material);
  if (matches.length !== 1 || masters.length !== 1) return null;
  const solidUnits = ["CFT", "CUM", "MT"];
  if (!solidUnits.includes(normalizeUom(trip.uom)) || !solidUnits.includes(normalizeUom(matches[0].uom))) return null;
  const density = masters[0].bulkDensity;
  if (density == null || !Number.isFinite(density) || density <= 0) return null;
  const quantity = convertSolidQty(Number(trip.quantity), trip.uom, matches[0].uom, density);
  return quantity != null && Number.isFinite(quantity) ? { quantity, uom: matches[0].uom } : null;
}

export function formatTripQuantity(trip: TripQuantityInput, includeEnteredUom = true): string {
  const entered = includeEnteredUom ? `${trip.quantity} ${trip.uom}` : `${trip.quantity}`;
  return trip.boqItemId != null && trip.boqQuantity
    ? `${entered} (≈${Number(trip.boqQuantity.quantity.toFixed(3))} ${trip.boqQuantity.uom}, BOQ unit)`
    : entered;
}