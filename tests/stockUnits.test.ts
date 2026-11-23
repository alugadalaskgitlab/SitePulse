import { describe, expect, it } from "vitest";
import { reconciliationPreviewMatches } from "../shared/stockReconciliation";
import {
  buildStockBalanceRebuildPreview,
  calculateStockLedgerNet,
  convertStockQuantity,
  convertTransferQuantityBetweenBalances,
  normalizeAllowedWeightUoms,
  normalizeWeightUnit,
} from "../shared/stockUnits";

describe("STOCK-02 stock unit normalization and ledger rebuild", () => {
  it("computes the canonical ledger figure from mixed CFT and MT rows, ignoring equipment-only rows", () => {
    const material = {
      id: 4,
      name: "DUST",
      defaultUom: "CFT",
      conversionToUom: "MT",
      bulkDensity: 1.65,
    };
    const entries = [
      { transactionType: "opening", quantityIn: 7700, quantityOut: 0, uom: "CFT" },
      { transactionType: "issue", quantityIn: 0, quantityOut: 75, uom: "CFT" },
      { transactionType: "receipt", quantityIn: 30, quantityOut: 0, uom: "MT" },
      { transactionType: "equipment_issue", quantityIn: 0, quantityOut: 1000, uom: "CFT" },
    ];
    const expected = calculateStockLedgerNet(material, entries);
    expect(expected).toBeCloseTo(convertStockQuantity(7625, "CFT", "MT", 1.65) + 30, 6);
    expect(expected).not.toBeCloseTo(convertStockQuantity(6625, "CFT", "MT", 1.65) + 30, 5);
  });

  it("reconciles mixed-unit DUST from the current ledger and refuses the stale stored snapshot", () => {
    const material = { id: 4, name: "DUST", defaultUom: "CFT", conversionToUom: "MT", bulkDensity: 1.65 };
    const legacyLedger = [
      { transactionType: "receipt", quantityIn: 846.844143, quantityOut: 0, uom: "CFT" },
      { transactionType: "adjustment", quantityIn: 0, quantityOut: 97.7444, uom: "MT" },
    ];
    const currentLedger = calculateStockLedgerNet(material, legacyLedger);
    expect(currentLedger).toBeCloseTo(-58.178, 3);
    expect(reconciliationPreviewMatches(currentLedger, currentLedger)).toBe(true);
    expect(reconciliationPreviewMatches(-72.818, currentLedger)).toBe(false);

    const physicalCount = 20;
    const previewAdjustment = physicalCount - currentLedger;
    expect(previewAdjustment).toBeCloseTo(78.178, 3);
    const afterPosting = calculateStockLedgerNet(material, [
      ...legacyLedger,
      { transactionType: "adjustment", quantityIn: previewAdjustment, quantityOut: 0, uom: "MT" },
    ]);
    expect(afterPosting).toBe(physicalCount);
    // The stored summary is set to this same calculated stock-unit value.
    expect(afterPosting).toBe(physicalCount);
  });

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

  it("keeps kilogram labels out of tonne relabels and converts only by 1,000", () => {
    for (const unit of ["Kg", "Kgs", "kg", "KGM", "kilogram"]) {
      expect(normalizeWeightUnit(unit)).toBe(unit);
    }
    expect(normalizeAllowedWeightUoms(JSON.stringify(["Kg", "Kgs", "kg"]))).toEqual({
      updated: JSON.stringify(["Kg", "Kgs", "kg"]),
      aliases: [],
    });
    expect(normalizeAllowedWeightUoms(JSON.stringify(["Kg", "Ton"]))).toEqual({
      updated: JSON.stringify(["Kg", "MT"]),
      aliases: ["Ton"],
    });
    expect(convertStockQuantity(1000, "Kg", "MT")).toBe(1);
    expect(convertStockQuantity(1, "MT", "Kgs")).toBe(1000);
  });

  it("allows a blocking diesel ledger row to be corrected in preview without changing its quantity", () => {
    const dieselRow = {
      id: 8380,
      materialId: 9,
      partyId: 2,
      transactionType: "receipt",
      quantityIn: 750,
      quantityOut: 0,
      uom: "MT",
    };
    const input = {
      materials: [{
        id: 9,
        name: "DIESEL",
        defaultUom: "Liters",
        conversionToUom: "Liters",
        bulkDensity: null,
      }],
      parties: [{ id: 2, name: "HIGH LANE CONSTRUCTIONS" }],
      balances: [],
      ledger: [dieselRow],
    };

    const blocked = buildStockBalanceRebuildPreview(input);
    expect(blocked.canApply).toBe(false);
    expect(blocked.blockingLedgerRows).toMatchObject([{
      ledgerRowId: 8380,
      materialName: "DIESEL",
      originalUom: "MT",
      targetUom: "Liters",
    }]);
    expect(blocked.errors.join(" ")).toContain("ledger row #8380");

    const corrected = buildStockBalanceRebuildPreview({
      ...input,
      ledgerUnitOverrides: { 8380: "Liters" },
    });
    expect(corrected.canApply).toBe(true);
    expect(corrected.errors).toEqual([]);
    expect(corrected.rows[0]).toMatchObject({ stockUom: "Liters", after: 750 });
    expect(dieselRow).toMatchObject({ quantityIn: 750, quantityOut: 0, uom: "MT" });
  });
});
