import type { VendorBillWithItems } from "./schema";

export type GstCategory = "equipment" | "material" | "transport" | "labour" | "other";

export type GstByCategory = Record<GstCategory, number>;

export type GstBreakdown = GstByCategory & { total: number };

const num = (v: number | null | undefined): number => (typeof v === "number" ? v : 0);

export function computeBillGstByCategory(bill: VendorBillWithItems): GstByCategory {
  const result: GstByCategory = { equipment: 0, material: 0, transport: 0, labour: 0, other: 0 };

  const catSubs: Record<GstCategory, number> = { equipment: 0, material: 0, transport: 0, labour: 0, other: 0 };
  for (const item of bill.items || []) {
    const c = ((item.category || "other").toLowerCase()) as GstCategory;
    const key: GstCategory = c in catSubs ? c : "other";
    catSubs[key] += num(item.amount);
  }

  const billType = (bill.billType || "").toLowerCase() as GstCategory | "all" | string;
  const distinctCats = (Object.keys(catSubs) as GstCategory[]).filter(c => catSubs[c] !== 0);
  const usePerGroupGst = billType === "all" || distinctCats.length > 1;

  if (usePerGroupGst) {
    const eqRate = num(bill.gstRateEquipment);
    const matRate = num(bill.gstRateMaterial);
    const trRate = num(bill.gstRateTransport);
    const labRate = num(bill.gstRateLabour);
    if (eqRate)  result.equipment = (catSubs.equipment) * eqRate / 100;
    if (matRate) result.material  = (catSubs.material)  * matRate / 100;
    if (trRate)  result.transport = (catSubs.transport) * trRate / 100;
    if (labRate) result.labour    = (catSubs.labour)    * labRate / 100;
    return result;
  }

  const rate =
    billType === "equipment" ? num(bill.gstRateEquipment) :
    billType === "material"  ? num(bill.gstRateMaterial)  :
    billType === "transport" ? num(bill.gstRateTransport) :
    billType === "labour"    ? num(bill.gstRateLabour)    : 0;
  if (!rate) return result;
  const amt = num(bill.totalAmount) * rate / 100;
  const target: GstCategory =
    billType === "equipment" || billType === "material" || billType === "transport" || billType === "labour"
      ? billType
      : "other";
  result[target] = amt;
  return result;
}

export function aggregateGstBreakdown(bills: VendorBillWithItems[]): GstBreakdown {
  const totals: GstByCategory = { equipment: 0, material: 0, transport: 0, labour: 0, other: 0 };
  for (const bill of bills) {
    const b = computeBillGstByCategory(bill);
    totals.equipment += b.equipment;
    totals.material  += b.material;
    totals.transport += b.transport;
    totals.labour    += b.labour;
    totals.other     += b.other;
  }
  const total = totals.equipment + totals.material + totals.transport + totals.labour + totals.other;
  return { ...totals, total };
}
