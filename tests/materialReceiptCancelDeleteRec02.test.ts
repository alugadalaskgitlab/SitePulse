import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const storageSource = readFileSync(new URL("../server/storage.ts", import.meta.url), "utf8");

function methodSource(start: string, end: string): string {
  const from = storageSource.indexOf(start);
  const to = storageSource.indexOf(end, from + start.length);
  expect(from, `${start} should exist`).toBeGreaterThanOrEqual(0);
  expect(to, `${end} should follow ${start}`).toBeGreaterThan(from);
  return storageSource.slice(from, to);
}

describe("REC-02 material receipt cancel/delete chronology", () => {
  it("dates cancel reversals from the receipt invoice date with historical fallback", () => {
    const cancelBody = methodSource(
      "async _cancelMaterialReceiptWithinTx(",
      "async cancelSitePurchase(",
    );
    expect(cancelBody).toContain(
      "materialReceiptTransactionDate(receipt.invoiceDate, receipt.date)",
    );
    expect(cancelBody).toContain("date: transactionDate");
    expect(cancelBody).not.toContain("new Date().toISOString().slice(0, 10)");
  });

  it("resequences the affected material after a successful cancel transaction", () => {
    const cancel = methodSource(
      "async cancelMaterialReceipt(",
      "async _cancelMaterialReceiptWithinTx(",
    );
    expect(cancel).toContain("await db.transaction");
    expect(cancel).toContain(
      "await this.recomputeBalanceAfterForMaterial(result.materialId)",
    );
    expect(cancel.indexOf("await this.recomputeBalanceAfterForMaterial")).toBeGreaterThan(
      cancel.indexOf("await db.transaction"),
    );
  });

  it("resequences the affected material after a successful delete transaction", () => {
    const remove = methodSource(
      "async deleteMaterialReceipt(",
      "async _deleteMaterialReceiptWithinTx(",
    );
    expect(remove).toContain("materialId: materialReceipts.materialId");
    expect(remove).toContain("await db.transaction");
    expect(remove).toContain(
      "await this.recomputeBalanceAfterForMaterial(existing.materialId)",
    );
    expect(remove.indexOf("await this.recomputeBalanceAfterForMaterial")).toBeGreaterThan(
      remove.indexOf("await db.transaction"),
    );
  });

  it("keeps the existing cancel/delete stock-sufficiency guards unchanged", () => {
    const cancelBody = methodSource(
      "async _cancelMaterialReceiptWithinTx(",
      "async cancelSitePurchase(",
    );
    const deleteBody = methodSource(
      "async _deleteMaterialReceiptWithinTx(",
      "// Truck Dispatches",
    );
    expect(cancelBody).toContain(
      'dieselStockSufficiencyGuard(material.name, "material_receipt_cancel")',
    );
    expect(deleteBody).toContain(
      'dieselStockSufficiencyGuard(material.name, "material_receipt_delete")',
    );
  });
});