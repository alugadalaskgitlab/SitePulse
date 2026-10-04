import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { mapAutoBillItem } from "../shared/vendorBillCandidates";

describe("vendor bill material-trip display", () => {
  const storage = readFileSync("server/storage.ts", "utf8");
  const client = readFileSync("client/src/pages/VendorBills.tsx", "utf8");

  it("passes existing vehicle and receipt references through material auto-items", () => {
    expect(storage).toContain("vehicleNumber: materialLogs.vehicleNumber");
    expect(storage).toContain("receiptNumber: materialLogs.receiptNumber");
    expect(storage).toContain("vehicleNumber: row.vehicleNumber ?? null");
    expect(storage).toContain("receiptNumber: row.receiptNumber ?? null");
    expect(storage).toContain("receiptNumber: materialReceipts.receiptNo");
    expect(client).toContain("mapAutoBillItem");
    expect(mapAutoBillItem({ vehicleNumber: "KA-01-TEST", receiptNumber: "TEST-RECEIPT" }))
      .toMatchObject({ vehicleNumber: "KA-01-TEST", receiptNumber: "TEST-RECEIPT" });
    expect(mapAutoBillItem({})).toMatchObject({ vehicleNumber: null, receiptNumber: null });
    expect(client).toContain("Vehicle: ${item.vehicleNumber}");
    expect(client).toContain("Receipt: ${item.receiptNumber}");
  });

  it("removes the untouched seeded blank when any nonempty activity group is pulled", () => {
    expect(client).toContain("initialBlank: true");
    expect(client).toContain("prev.filter(item => !item.initialBlank)");
    expect(client).toContain("Any");
    expect(client).toContain("successful activity pull");
    expect(client).toContain("const addLineItem = () =>");
  });
});