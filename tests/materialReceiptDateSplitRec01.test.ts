import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { materialReceiptTransactionDate } from "../shared/materialReceiptDates";

const storageSource = readFileSync(new URL("../server/storage.ts", import.meta.url), "utf8");
const routeSource = readFileSync(new URL("../server/routes.ts", import.meta.url), "utf8");
const receiptsUiSource = readFileSync(new URL("../client/src/pages/PlantMaterialReceipts.tsx", import.meta.url), "utf8");
const stockUiSource = readFileSync(new URL("../client/src/pages/PlantStock.tsx", import.meta.url), "utf8");
const dieselRegisterSource = readFileSync(new URL("../client/src/pages/StoresDieselRegister.tsx", import.meta.url), "utf8");
const dieselRequirementsSource = readFileSync(new URL("../client/src/pages/DieselRequirements.tsx", import.meta.url), "utf8");

function methodSource(start: string, end: string): string {
  const from = storageSource.indexOf(start);
  const to = storageSource.indexOf(end, from + start.length);
  expect(from, `${start} should exist`).toBeGreaterThanOrEqual(0);
  expect(to, `${end} should follow ${start}`).toBeGreaterThan(from);
  return storageSource.slice(from, to);
}

describe("REC-01 receipt entry date and invoice date split", () => {
  it("uses invoice date as the transaction date and falls back without rewriting legacy rows", () => {
    expect(materialReceiptTransactionDate("2026-08-17", "2026-09-04")).toBe("2026-08-17");
    expect(materialReceiptTransactionDate(null, "2026-09-04")).toBe("2026-09-04");
    expect(materialReceiptTransactionDate("", "2026-09-04")).toBe("2026-09-04");
    expect(storageSource).not.toContain("ALTER TABLE material_receipts ADD COLUMN IF NOT EXISTS invoice_date");
  });

  it("defaults new form values once from Diesel Requirements and Purchase Indents but keeps invoice date editable", () => {
    expect(receiptsUiSource).toContain('useState(format(new Date(), "yyyy-MM-dd"))');
    expect(receiptsUiSource).toContain("purchasedDieselRequirements.find((row) => row.id === linkedDieselRequirementId)");
    expect(receiptsUiSource).toContain("setInvoiceDate(requirement.date || date)");
    expect(receiptsUiSource).toContain("allPurchaseIndents.find((row) => row.indentNo === indentRef)");
    expect(receiptsUiSource).toContain("setInvoiceDate(purchaseIndent.date || date)");
    expect(receiptsUiSource).toContain("invoiceDateDefaultSourceRef.current !== source");
    expect(receiptsUiSource).toContain('value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)}');
    expect(receiptsUiSource).toContain("materialReceiptTransactionDate(invoiceDate, date)");
    expect(receiptsUiSource).toContain("invoiceDate: effectiveInvoiceDate");
  });

  it("posts create and edit ledger/LDO rows on invoice date and resequences running balances", () => {
    const create = methodSource("async createMaterialReceipt(", "async updateMaterialReceipt(");
    expect(create).toContain("materialReceiptTransactionDate(receipt.invoiceDate, receipt.date)");
    expect(create).toContain("invoiceDate: transactionDate");
    expect(create.match(/date: transactionDate/g)?.length).toBeGreaterThanOrEqual(2);
    expect(create).toContain("await this.recomputeBalanceAfterForMaterial(receipt.materialId)");
    expect(create.indexOf("await this.recomputeBalanceAfterForMaterial")).toBeGreaterThan(create.indexOf("await db.transaction"));

    const update = methodSource("async updateMaterialReceipt(", "async deleteMaterialReceipt(");
    expect(update).toContain("receipt.invoiceDate ?? existing.invoiceDate");
    expect(update).toContain("receipt.invoiceDate !== undefined || existing.invoiceDate != null");
    expect(update).toContain("updates.invoiceDate = transactionDate");
    expect(update.match(/date: transactionDate/g)?.length).toBeGreaterThanOrEqual(2);
    expect(update).toContain("await this.recomputeBalanceAfterForMaterial(newMaterialId2)");

    const recompute = methodSource("async recomputeBalanceAfterForMaterial(", "async reconcileStockBalancesFromLedger(");
    expect(recompute).toContain("ORDER BY date, id");
    expect(recompute).toContain("SET balance_after");
  });

  it("filters, groups, and sorts receipt chronology by invoice date with historical fallback", () => {
    const list = methodSource("async getMaterialReceipts(", "private getMaterialCategoryCode(");
    expect(list).toContain("COALESCE(${materialReceipts.invoiceDate}, ${materialReceipts.date})");
    expect(list).toContain("gte(transactionDate, filters.dateFrom)");
    expect(list).toContain("lte(transactionDate, filters.dateTo)");
    expect(list).toContain("desc(materialReceipts.date)");
    expect(list).toContain("desc(materialReceipts.time)");

    expect(receiptsUiSource).toContain("const transactionDate = getReceiptTransactionDate(r)");
    expect(receiptsUiSource).toContain("const dateKey = getReceiptTransactionDate(receipt)");
    expect(receiptsUiSource).toContain("Invoice date —");

    const linkedDiesel = methodSource("async getDieselRequirementReceipts(", "async updateVendorBillPaymentDetails(");
    expect(linkedDiesel).toContain("COALESCE(${materialReceipts.invoiceDate}, ${materialReceipts.date})");
    expect(linkedDiesel).toContain("desc(materialReceipts.time)");

    const ldoReport = methodSource("async computeLdoReconciliation(", "async getAttachments(");
    expect(ldoReport).toContain("date: receiptTransactionDate");
    expect(ldoReport).toContain("gte(receiptTransactionDate, dateFrom)");

    const dailySummary = methodSource("async getDailyPlantSummary(", "async getBitumenHeatingSessions(");
    expect(dailySummary).toContain("COALESCE(${materialReceipts.invoiceDate}, ${materialReceipts.date})");
  });

  it("keeps entry date/time visible beside invoice date in receipt, ledger, statement, and Diesel views/exports", () => {
    expect(receiptsUiSource).toContain('"Entry Date": r.date');
    expect(receiptsUiSource).toContain('"Entry Time": r.time || ""');
    expect(receiptsUiSource).toContain('"Invoice Date": getReceiptTransactionDate(r)');
    expect(receiptsUiSource).toContain("Entered {receipt.date}");

    const ledger = methodSource("async getStockLedger(", "async getStockBalanceAsOf(");
    expect(ledger).toContain("invoiceDate:");
    expect(ledger).toContain("entryDate:");
    expect(ledger).toContain("entryTime:");
    expect(stockUiSource).toContain('"Transaction Date": entry.date');
    expect(stockUiSource).toContain('"Invoice Date": entry.invoiceDate || ""');
    expect(stockUiSource).toContain('"Entry Date": entry.entryDate || ""');
    expect(stockUiSource).toContain("Entry Date / Time");

    expect(routeSource).toContain("invoiceDate: r.invoiceDate || r.date");
    expect(dieselRegisterSource).toContain("Invoice {r.invoiceDate} · Entered {r.date}");
    expect(dieselRequirementsSource).toContain("Invoice {r.invoiceDate}");
    expect(dieselRequirementsSource).toContain("Entered {r.date}");
  });

  it("leaves Physical Stock Reconciliation on countDate", () => {
    const reconciliation = methodSource("async postStockReconciliation(", "async saveStockReconciliationDraft(");
    expect(reconciliation).toContain("data.countDate");
    expect(reconciliation).not.toContain("materialReceiptTransactionDate");
    expect(reconciliation).not.toContain("invoiceDate");
  });
});