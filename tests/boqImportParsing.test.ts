import { describe, expect, it } from "vitest";
import { detectBoqBillBoundary, reconstructLogicalBoqItems } from "../shared/boqImportParsing";

describe("detectBoqBillBoundary", () => {
  it.each([
    ["BILL No. 1", "Earthwork", "BILL-1", "Earthwork"],
    ["Bill No 2", "Granular sub-base", "BILL-2", "Granular sub-base"],
    ["", "BILL-II: Bituminous works", "BILL-II", "Bituminous works"],
    ["SCHEDULE B", "Road furniture", "SCHEDULE B", "Road furniture"],
    ["", "Schedule-B — Drainage", "SCHEDULE B", "Drainage"],
  ])("recognises explicit marker %s / %s", (item, description, billNo, title) => {
    expect(detectBoqBillBoundary(item, description)).toEqual({ billNo, title });
  });

  it("does not guess a Bill boundary from a general heading or item code", () => {
    expect(detectBoqBillBoundary("", "Bill of Quantities")).toBeNull();
    expect(detectBoqBillBoundary("2.01", "Earthwork in excavation")).toBeNull();
  });
});

describe("reconstructLogicalBoqItems", () => {
  it("merges three physical rows and takes UOM/quantity from the final continuation", () => {
    const items = reconstructLogicalBoqItems([
      { itemCode: "BILL No. 2", description: "Road Works", sourceRow: 4 },
      { itemCode: "2.03", description: "Providing and laying RCC NP4 pipe", sourceRow: 10 },
      { itemCode: "", description: "including collars and jointing", sourceRow: 11 },
      { itemCode: "", description: "complete as per drawings", unit: "RM", boqQty: "1,250", clientRate: 800, sourceRow: 12 },
      { itemCode: "2.04", description: "Wet Mix Macadam", unit: "CUM", boqQty: 500, sourceRow: 13 },
    ]);

    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      itemCode: "2.03",
      description: "Providing and laying RCC NP4 pipe including collars and jointing complete as per drawings",
      unit: "RM",
      boqQty: 1250,
      clientRate: 800,
      categoryName: "Road Works",
      sourceBillNo: "BILL-2",
      sourceRow: 10,
      sortOrder: 0,
    });
    expect(items[1]).toMatchObject({
      itemCode: "2.04",
      description: "Wet Mix Macadam",
      unit: "CUM",
      boqQty: 500,
      sourceRow: 13,
      sortOrder: 1,
    });
  });

  it("keeps ordinary single-row items separate and preserves their order", () => {
    const items = reconstructLogicalBoqItems([
      { itemCode: "1.01", description: "Clearing and grubbing", unit: "HA", boqQty: 2, sourceRow: 5 },
      { itemCode: "1.02", description: "Roadway excavation", unit: "CUM", boqQty: 300, sourceRow: 6 },
    ]);
    expect(items.map(item => ({
      itemCode: item.itemCode,
      description: item.description,
      unit: item.unit,
      boqQty: item.boqQty,
      sourceRow: item.sourceRow,
    }))).toEqual([
      { itemCode: "1.01", description: "Clearing and grubbing", unit: "HA", boqQty: 2, sourceRow: 5 },
      { itemCode: "1.02", description: "Roadway excavation", unit: "CUM", boqQty: 300, sourceRow: 6 },
    ]);
  });
});