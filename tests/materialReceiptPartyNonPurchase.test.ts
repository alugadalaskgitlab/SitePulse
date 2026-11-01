import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { isPartyNonPurchaseReceipt } from "../shared/materialReceiptParty";

describe("party-owned material receipt classification", () => {
  it("classifies a non-HLC party receipt as non-purchase", () => {
    expect(isPartyNonPurchaseReceipt({ partyId: 42, isPlantCommon: 0 }, 7)).toBe(true);
  });

  it("keeps HLC and plant-common receipts on the purchase workflow", () => {
    expect(isPartyNonPurchaseReceipt({ partyId: 7, isPlantCommon: 0 }, 7)).toBe(false);
    expect(isPartyNonPurchaseReceipt({ partyId: 42, isPlantCommon: 1 }, 7)).toBe(false);
    expect(isPartyNonPurchaseReceipt({ partyId: 42, isPlantCommon: true }, 7)).toBe(false);
    expect(isPartyNonPurchaseReceipt({ partyId: null, isPlantCommon: 0 }, 7)).toBe(false);
  });

  it("treats all receipts as HLC when the HLC party cannot be resolved", () => {
    expect(isPartyNonPurchaseReceipt({ partyId: 42, isPlantCommon: 0 }, null)).toBe(false);
    expect(isPartyNonPurchaseReceipt({ partyId: 42, isPlantCommon: 0 }, undefined)).toBe(false);
  });
});

describe("receipt UI and final-submit wiring", () => {
  const page = readFileSync("client/src/pages/PlantMaterialReceipts.tsx", "utf8");
  const routes = readFileSync("server/routes.ts", "utf8");

  it("uses the shared classification for badges, filtering, row label, submit state, and PI form", () => {
    expect(page).toContain("isPartyNonPurchaseReceipt(receipt, selectedHlcPartyId)");
    expect(page).toContain("if (isPartyReceipt(r)) return false;");
    expect(page).toContain('{getPartyName(receipt.partyId, receipt.materialId)} stock');
    expect(page).toContain("!(receipt as any).hasRequiredDoc && !isPartyReceipt(receipt)");
    expect(page).toContain("isSelectedPartyNonPurchase");
    expect(page).toContain("Party-owned material — no Purchase Indent needed.");
    expect(page).toContain("!needsNotice || isPartyReceipt(receipt)");
  });

  it("bypasses the document requirement only for classified party receipts on the server", () => {
    expect(routes).toContain('import { isPartyNonPurchaseReceipt } from "@shared/materialReceiptParty";');
    const start = routes.indexOf('app.post("/api/plant-module/material-receipts/:id/final-submit"');
    const nextRoute = routes.indexOf("app.post(", start + 1);
    const receiptSubmitRoute = routes.slice(start, nextRoute);
    expect(receiptSubmitRoute).toContain("hlcPartyId = await storage.getHlcPartyId()");
    expect(receiptSubmitRoute).toContain("retaining document requirement.");
    expect(receiptSubmitRoute).toContain("if (!isOwnerOrAdmin && !isPartyNonPurchaseReceipt(before, hlcPartyId))");
    expect(receiptSubmitRoute).toContain("Please upload the bill, challan, DC, invoice or receipt photo before Final Submit.");
    const sitePurchaseRoute = routes.slice(
      routes.indexOf('app.post("/api/site-purchases/:id/final-submit"'),
      start,
    );
    expect(sitePurchaseRoute).not.toContain("isPartyNonPurchaseReceipt");
  });
});
