import { describe, expect, it } from "vitest";
import {
  buildPossibleDoubleBillIndex,
  findPossibleDoubleBillMatches,
  type PossibleDoubleBillRecord,
} from "../shared/vendorBillPossibleDouble";

const bill = (overrides: Partial<PossibleDoubleBillRecord> = {}): PossibleDoubleBillRecord => ({
  id: 1,
  billNo: "HLC/VB/2026/0001",
  billDate: "2026-05-13",
  totalAmount: 15389.41,
  vendorId: 2,
  vendorName: "HIGH LANE CONSTRUCTIONS",
  status: "draft",
  isCancelled: false,
  isDeleted: false,
  ...overrides,
});

describe("possible vendor bill duplicate warnings", () => {
  it("flags same vendor and normalized invoice number regardless of amount/date", () => {
    const matches = findPossibleDoubleBillMatches(
      bill({ id: 8, billNo: " HLC / VB / 2026 / 0001 ", billDate: "2026-08-01", totalAmount: 1 }),
      [bill()],
    );
    expect(matches).toEqual([expect.objectContaining({ id: 1, reason: "invoice_number" })]);
  });

  it("flags the same vendor and gross amount within seven days via a Vendor Master alias", () => {
    const existing = bill({ vendorId: null, vendorName: "HLC BUILDERS" });
    const matches = findPossibleDoubleBillMatches(
      bill({ id: 9, vendorId: 4, vendorName: "Highlane Civil Works", billNo: "NEW-9", billDate: "2026-05-20" }),
      [existing],
      [{ id: 4, name: "Highlane Civil Works" }],
      [{ canonicalName: "Highlane Civil Works", alias: "HLC BUILDERS" }],
    );
    expect(matches).toEqual([expect.objectContaining({ id: 1, reason: "amount_and_date" })]);
  });

  it("excludes different vendors, amounts, dates beyond seven days, and voided/deleted bills", () => {
    const candidate = bill({ id: 9, billNo: "NEW-9" });
    const records = [
      bill({ id: 1, vendorId: 3 }),
      bill({ id: 2, totalAmount: 100 }),
      bill({ id: 3, billDate: "2026-05-21" }),
      bill({ id: 4, status: "voided" }),
      bill({ id: 5, isDeleted: true }),
      bill({ id: 6, isCancelled: true }),
    ];
    expect(findPossibleDoubleBillMatches(candidate, records, [{ id: 2, name: "OTHER VENDOR" }])).toEqual([]);
  });

  it("does not add matching rules for the previously cited sample pairs", () => {
    const records = [
      bill({ id: 17, billNo: "0017", vendorName: "NARASIMHULU JCB PLANNT", billDate: "2026-06-01", totalAmount: 12000 }),
      bill({ id: 21, billNo: "0021", vendorName: "NARASIMHULU JCB PLANT", billDate: "2026-05-04", totalAmount: 6701.885 }),
      bill({ id: 28, billNo: "0028", billDate: "2026-05-13", totalAmount: 15389.41 }),
      bill({ id: 29, billNo: "0029", billDate: "2026-05-13", totalAmount: 132000 }),
    ];
    expect(buildPossibleDoubleBillIndex(records, [{ id: 2, name: "HIGH LANE CONSTRUCTIONS" }]).size).toBe(0);
  });
});
