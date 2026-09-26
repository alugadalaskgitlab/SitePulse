import { describe, expect, it } from "vitest";
import { isTrulyBlankManualBillRow } from "@/lib/vendorBillBlankRows";

describe("VB-27 blank manual payload filtering", () => {
  const blank = { source: "manual", description: "  ", qty: 0, rate: 0, amount: 0, date: "" };
  it("drops only truly blank manual rows", () => {
    expect(isTrulyBlankManualBillRow(blank)).toBe(true);
    for (const patch of [
      { description: "SOIL" }, { qty: 1 }, { rate: 50 }, { amount: 10 },
      { date: "2027-02-14" }, { siteName: "SITE" }, { transporter: "VENDOR" },
      { equipmentId: 12 }, { sourceId: 0 }, { source: "auto" }, { source: "hire_group" },
      { sourceType: "site_material_trip" }, { vehicleNumber: "TEST-1" },
    ]) expect(isTrulyBlankManualBillRow({ ...blank, ...patch })).toBe(false);
  });
});