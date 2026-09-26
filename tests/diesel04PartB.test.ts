import { describe, expect, it } from "vitest";
import { dieselTotalIssued } from "../client/src/lib/dieselIssued";
import type { StockLedgerEntry } from "../shared/schema";

describe("DIESEL-04 B issued definition shared with procurement report", () => {
  it("adds equipment usage and direct purchases, not receipts or other issues", () => {
    const rows = [
      { transactionType: "equipment_usage", quantityOut: "12.5" },
      { transactionType: "direct_purchase", quantityIn: "4" },
      { transactionType: "receipt", quantityIn: "100" },
      { transactionType: "issue", quantityOut: "3" },
      { transactionType: "direct_purchase", quantityIn: "-2" },
    ] as unknown as StockLedgerEntry[];
    expect(dieselTotalIssued(rows)).toBe(16.5);
  });
});