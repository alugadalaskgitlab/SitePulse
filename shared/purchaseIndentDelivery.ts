export type DeliveryEvidence = {
  kind: "receipt" | "trip"; id: number; date: string; quantity: number;
  uom: string; reference: string | null; status: "active" | "cancelled" | "deleted";
  countedQty?: number | null;
};

export function convertDeliveryQuantity(qty: number, from: string, to: string): number | null {
  const unit = (value: string): [string, number] => {
    const s = value.trim().toLowerCase();
    if (["mt", "t", "ton", "tons", "tonne", "tonnes"].includes(s)) return ["mass", 1000];
    if (["kg", "kgs"].includes(s)) return ["mass", 1];
    if (["cum", "m3", "m³"].includes(s)) return ["volume", 1];
    if (["l", "ltr", "litre", "litres", "liter", "liters"].includes(s)) return ["volume", .001];
    return [s, 1];
  };
  const [a, x] = unit(from), [b, y] = unit(to);
  return Number.isFinite(qty) && qty >= 0 && a && a === b ? qty * x / y : null;
}

export function reconcileDeliveryEvidence(evidence: DeliveryEvidence[], uom: string) {
  const unique = Array.from(new Map(evidence.map(e => [`${e.kind}:${e.id}`, e])).values());
  const deliveryWarnings: string[] = [];
  let deliveredQty = 0;
  const deliveryEvidence = unique.map(e => {
    const countedQty = e.status === "active" ? convertDeliveryQuantity(e.quantity, e.uom, uom) : 0;
    if (countedQty === null) deliveryWarnings.push(`${e.kind} ${e.id}: cannot convert ${e.uom} to ${uom}; excluded from delivered quantity`);
    else deliveredQty += countedQty;
    return { ...e, countedQty };
  });
  return { deliveredQty, deliveryEvidence, deliveryWarnings };
}

export function validateDeliveryDestination(location: unknown, siteId: unknown) {
  if (!["hmp_plant", "rmc_plant", "site"].includes(String(location))) throw new Error("Explicit delivery destination is required (Plant or Site)");
  if (location === "site" && (!Number.isInteger(siteId) || Number(siteId) <= 0)) throw new Error("Receiving site is required");
  return { receivingLocation: String(location), receivingSiteId: location === "site" ? Number(siteId) : null };
}

export function formatPurchaseIndentNumber(siteName: string, year: number, sequence: number) {
  const label = siteName.trim().toUpperCase().replace(/[\/\\]/g, "-");
  if (!label) throw new Error("Site or raised-from location is required");
  return `HLC/PI/${label}/${year}/${String(sequence).padStart(4, "0")}`;
}