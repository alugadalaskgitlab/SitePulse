import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const storageSource = readFileSync(new URL("../server/storage.ts", import.meta.url), "utf8");
const routesSource = readFileSync(new URL("../server/routes.ts", import.meta.url), "utf8");

function methodSource(start: string, end: string): string {
  const from = storageSource.indexOf(start);
  const to = storageSource.indexOf(end, from + start.length);
  expect(from, `${start} should exist`).toBeGreaterThanOrEqual(0);
  expect(to, `${end} should follow ${start}`).toBeGreaterThan(from);
  return storageSource.slice(from, to);
}

describe("FIX 1 linked diesel receipt invariant", () => {
  it("keeps the authoritative remaining check inside the same transaction as create", () => {
    const create = methodSource("async createMaterialReceipt(", "async updateMaterialReceipt(");
    expect(create).toContain("await this._assertDieselReceiptWithinPurchasedQuantity(");
    expect(create).toContain("await this._adjustStockBalance(tx");
    expect(create).toContain("await tx.insert(stockLedger)");
    expect(create.indexOf("await this._assertDieselReceiptWithinPurchasedQuantity")).toBeLessThan(
      create.indexOf("await tx.insert(materialReceipts)"),
    );
    expect(create.indexOf("await tx.insert(materialReceipts)")).toBeLessThan(
      create.indexOf("await this._adjustStockBalance(tx"),
    );
  });

  it("uses the requirement FOR UPDATE lock and active-receipt semantics", () => {
    const lock = methodSource("private async _lockDieselRequirement(", "async createMaterialReceipt(");
    expect(lock).toContain("FROM diesel_requirements");
    expect(lock).toContain("FOR UPDATE");

    const check = methodSource("private async _assertDieselReceiptWithinPurchasedQuantity(", "private async _lockDieselRequirement(");
    expect(check).toContain("COALESCE(SUM(quantity), 0)");
    expect(check).toContain("COALESCE(is_cancelled, false) = false");
    expect(check).toContain("COALESCE(is_deleted, false) = false");
    expect(check).toContain("DieselReceiptExceedsRemainingError");
  });

  it("maps a post-validation invalid requirement to the early-validation 400 contract", () => {
    expect(routesSource).toContain("InvalidLinkedDieselRequirementError");
    expect(routesSource).toContain('res.status(400).json({');
    expect(routesSource).toContain("linkedDieselRequirementId: err.requirementId");
    // The quantity-overrun mapping remains a separate 409 branch and is
    // intentionally checked before this status/link branch.
    expect(routesSource.indexOf("handleDieselReceiptRemainingError(err, res)"))
      .toBeLessThan(routesSource.indexOf("handleInvalidLinkedDieselRequirementError(err, res)"));
  });

  it("serializes linked quantity edits, cancellations, and deletes in receipt→requirement→balance order", () => {
    const update = methodSource("async updateMaterialReceipt(", "async deleteMaterialReceipt(");
    const cancel = methodSource("async _cancelMaterialReceiptWithinTx(", "async cancelSitePurchase(");
    const remove = methodSource("async _deleteMaterialReceiptWithinTx(", "// Truck Dispatches");

    expect(update).toContain("linkedDieselRequirementId");
    expect(update).toContain("_assertDieselReceiptWithinPurchasedQuantity(");
    for (const body of [cancel, remove]) {
      expect(body).toContain("linkedDieselRequirementId");
      expect(body).toContain("_lockDieselRequirement(tx");
    }
    expect(update.indexOf("FOR UPDATE")).toBeLessThan(update.indexOf("_assertDieselReceiptWithinPurchasedQuantity("));
    expect(cancel.indexOf("FOR UPDATE")).toBeLessThan(cancel.indexOf("_lockDieselRequirement(tx"));
    expect(remove.indexOf("FOR UPDATE")).toBeLessThan(remove.indexOf("_lockDieselRequirement(tx"));
  });
});