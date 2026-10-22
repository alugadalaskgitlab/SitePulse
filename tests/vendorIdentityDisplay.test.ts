import { describe, expect, it } from "vitest";
import { vendorIdentityDisplayName } from "../shared/vendorIdentityDisplay";

describe("vendorIdentityDisplayName", () => {
  it("uses the current linked Vendor Master name without changing the recorded label", () => {
    expect(vendorIdentityDisplayName({
      recordedName: "OLD SUPPLIER SPELLING",
      vendorId: 12,
      linkedVendorName: "CURRENT VENDOR NAME",
    })).toBe("CURRENT VENDOR NAME");
  });

  it("falls back to recorded text when the link or current name is unavailable", () => {
    expect(vendorIdentityDisplayName({
      recordedName: "RECORDED SUPPLIER",
      vendorId: 12,
      linkedVendorName: null,
    })).toBe("RECORDED SUPPLIER");
    expect(vendorIdentityDisplayName({
      recordedName: "RECORDED SUPPLIER",
      vendorId: null,
      linkedVendorName: "UNLINKED MASTER",
    })).toBe("RECORDED SUPPLIER");
  });
});
