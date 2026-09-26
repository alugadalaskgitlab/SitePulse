import type { StockLedgerEntry } from "@shared/schema";

// Same definition as the Diesel Procurement Report: equipment usage plus
// direct site purchases (which are issued at the point of purchase).
export function dieselTotalIssued(entries: StockLedgerEntry[]): number {
  return entries.reduce((sum, entry) => {
    if (entry.transactionType === "equipment_usage") return sum + Number(entry.quantityOut ?? 0);
    if (entry.transactionType === "direct_purchase" && Number(entry.quantityIn ?? 0) > 0) {
      return sum + Number(entry.quantityIn);
    }
    return sum;
  }, 0);
}