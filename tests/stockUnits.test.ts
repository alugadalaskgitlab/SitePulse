import { describe, expect, it } from "vitest";
import {
  buildStockBalanceRebuildPreview,
  convertStockQuantity,
  convertTransferQuantityBetweenBalances,
  normalizeWeightUnit,
} from "../shared/stockUnits";

describe("STOCK-02 stock unit normalization and ledger rebuild", () => {
  it.each(["T", "t", "TON", "Ton", "TONS", "tonnes", "Tonne"])(
    "normalizes %s to MT",
    unit => {
      expect(normalizeWeightUnit(unit)).toBe("MT");
    },
  );

  it("rebuilds one material's balance from mixed CFT, MT and TON ledger rows", () => {
    const result = buildStockBalanceRebuildPreview({
      materials: [{
        id: 3,
        name: "6MM DOWN",
        defaultUom: "CFT",
        conversionToUom: "Ton",
        bulkDensity: 1.6,
      }],
      parties: [{ id: 1, name: "HLC" }],
      balances: [{
        id: 10,
        materialId: 3,
        partyId: 1,
        balance: 3.2,
        uom: "MT",
      }],
      ledger: [
        { id: 100, materialId: 3, partyId: 1, transactionType: "receipt", quantityIn: 35.3147, quantityOut: 0, uom: "CFT" },
        { id: 101, materialId: 3, partyId: 1, transactionType: "adjustment", quantityIn: 0.5, quantityOut: 0, uom: "MT" },
        { id: 102, materialId: 3, partyId: 1, transactionType: "transfer", quantityIn: 0, quantityOut: 0.25, uom: "TON" },
      ],
    });

    expect(result.errors).toEqual([]);
    expect(result.canApply).toBe(true);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({
      stockUom: "MT",
      before: 3.2,
      after: 1.85,
    });
  });

  it("converts a CFT transfer into the source CFT unit and destination TON/MT unit", () => {
    const result = convertTransferQuantityBetweenBalances(35.3147, "CFT", "CFT", "TON", 1.6);
    expect(result).toEqual({
      fromQuantity: 35.3147,
      toQuantity: 1.6,
      fromUom: "CFT",
      toUom: "MT",
    });
  });

  it("blocks a CFT-to-MT rebuild when material density is missing", () => {
    const result = buildStockBalanceRebuildPreview({
      materials: [{
        id: 7,
        name: "DUST",
        defaultUom: "CFT",
        conversionToUom: "MT",
        bulkDensity: null,
      }],
      parties: [{ id: 1, name: "HLC" }],
      balances: [],
      ledger: [
        { id: 1, materialId: 7, partyId: 1, transactionType: "receipt", quantityIn: 12, quantityOut: 0, uom: "CFT" },
      ],
    });
    expect(result.canApply).toBe(false);
    expect(result.errors.join(" ")).toContain("without a configured material density");
  });

  it("converts legacy tons and metric tonnes as the same unit", () => {
    expect(convertStockQuantity(2.5, "TONNES", "MT")).toBe(2.5);
    expect(convertStockQuantity(1250, "Kgs", "MT")).toBe(1.25);
  });
});
