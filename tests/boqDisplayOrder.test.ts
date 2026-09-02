import { describe, expect, it } from "vitest";
import { buildBoqDisplayHierarchy } from "../shared/boqDisplayOrder";

const label = (code?: string | null) => code ? `Operational ${code}` : "Uncategorised";

describe("BOQ display hierarchy", () => {
  it("keeps Pampad-style restarted item numbers within their Bill and source", () => {
    const items = [
      { id: 4, itemCode: "1.2", categorySourceBillNo: "BILL-2", categoryName: "Drainage", categorySortOrder: 20, excelRow: 42, sortOrder: 4, workCategory: "DRAINAGE" },
      { id: 2, itemCode: "1.10", categorySourceBillNo: "BILL-1", categoryName: "Earthwork", categorySortOrder: 10, excelRow: 22, sortOrder: 2, workCategory: "EARTHWORK" },
      { id: 3, itemCode: "1.1", categorySourceBillNo: "BILL-2", categoryName: "Drainage", categorySortOrder: 20, excelRow: 41, sortOrder: 3, workCategory: "DRAINAGE" },
      { id: 1, itemCode: "1.2", categorySourceBillNo: "BILL-1", categoryName: "Earthwork", categorySortOrder: 10, excelRow: 21, sortOrder: 1, workCategory: "EARTHWORK" },
      { id: 5, itemCode: "2.1", categorySourceBillNo: "BILL-1", categoryName: "Pavement", categorySortOrder: 11, excelRow: 30, sortOrder: 5, workCategory: "SUBBASE_BASE" },
    ];

    const hierarchy = buildBoqDisplayHierarchy(items, label);
    expect(hierarchy.map(bill => bill.label)).toEqual(["BILL-1", "BILL-2"]);
    expect(hierarchy[0].sources.map(source => source.label)).toEqual(["Earthwork", "Pavement"]);
    expect(hierarchy[0].sources.flatMap(source => source.items.map(item => item.id))).toEqual([1, 2, 5]);
    expect(hierarchy[1].sources[0].items.map(item => item.id)).toEqual([3, 4]);
  });

  it("retains operational-category fallback when imported Bill metadata is absent", () => {
    const hierarchy = buildBoqDisplayHierarchy([
      { id: 2, itemCode: "10.1", workCategory: "EARTHWORK", categoryName: "Imported heading", excelRow: null, sortOrder: 2 },
      { id: 1, itemCode: "2.1", workCategory: "EARTHWORK", categoryName: "Imported heading", excelRow: null, sortOrder: 1 },
      { id: 3, itemCode: "1.1", workCategory: "DRAINAGE", categoryName: null, sortOrder: 3 },
    ], label);

    expect(hierarchy).toHaveLength(1);
    expect(hierarchy[0].imported).toBe(false);
    expect(hierarchy[0].sources.map(source => source.label)).toEqual([
      "Operational EARTHWORK",
      "Operational DRAINAGE",
    ]);
    expect(hierarchy[0].sources[0].items.map(item => item.id)).toEqual([1, 2]);
  });
});