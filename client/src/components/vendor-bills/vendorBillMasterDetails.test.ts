import { describe, expect, it } from "vitest";
import { vendorBillMasterBottomRows, vendorBillMasterTopRows } from "./vendorBillMasterDetails";

describe("vendor bill Vendor Master display rows", () => {
  it("omits blank values and suppresses a business name identical to the master name", () => {
    const details = {
      name: "SAMPLE VENDOR",
      businessName: " sample vendor ",
      address: "  ",
      gstNumber: "08ABCDE1234F1Z5",
      contactPersonName: "  rajesh sharma ",
      contactPhone: "",
      panNumber: "ABCDE1234F",
      bankAccountName: null,
      bankName: "STATE BANK",
      bankAccountNumber: "1234567890",
      bankIfsc: "SBIN0000123",
    };
    expect(vendorBillMasterTopRows(details)).toEqual([
      { label: "GSTIN", value: "08ABCDE1234F1Z5" },
      { label: "Contact person", value: "Rajesh Sharma" },
    ]);
    expect(vendorBillMasterBottomRows(details)).toEqual([
      { label: "PAN", value: "ABCDE1234F" },
      { label: "Bank name", value: "STATE BANK" },
      { label: "Account number", value: "1234567890" },
      { label: "IFSC", value: "SBIN0000123" },
    ]);
    expect(vendorBillMasterTopRows({ name: "SAMPLE VENDOR" })).toEqual([]);
    expect(vendorBillMasterBottomRows({ name: "SAMPLE VENDOR" })).toEqual([]);
  });
});
