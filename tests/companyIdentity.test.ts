import { describe, expect, it } from "vitest";
import {
  companyPrefixSegment,
  canRunLegacyLedgerGapFix,
  deriveCompanyShortName,
  formatInternalRequisitionNumber,
  formatVendorBillNumber,
  formatCompanyText,
  isLegacyHlcCompany,
  isOwnCompanyName,
  nextInternalRequisitionSequence,
  nextPurchaseIndentSequence,
  nextVendorBillSequence,
  resolveCompanyIdentity,
} from "../shared/companyIdentity";

describe("configured company identity", () => {
  it("keeps current HLC labels and supports another short name at display time", () => {
    const hlc = resolveCompanyIdentity({
      companyName: "High Lane Constructions Pvt Ltd",
      companyShortName: "HLC",
    });
    expect(formatCompanyText("HLC stock for High Lane Constructions", hlc))
      .toBe("HLC stock for High Lane Constructions Pvt Ltd");

    const other = resolveCompanyIdentity({ companyName: "Acme Roads Pvt Ltd", companyShortName: "ABC" });
    expect(formatCompanyText("HLC stock", other)).toBe("ABC stock");
    expect(formatCompanyText("High Lane Constructions Pvt Ltd", other)).toBe("Acme Roads Pvt Ltd");
  });

  it("renders short-name labels for stock, procurement, requirements, receipts, and equipment bills", () => {
    const other = resolveCompanyIdentity({ companyName: "Acme Roads Pvt Ltd", companyShortName: "ABC" });
    const labels = [
      "Borrow from HLC",
      "Issue from HLC stock",
      "HLC / Internally Arranged",
      "HLC · Material Receipt",
      "Prepared · HLC",
    ];
    expect(labels.map(label => formatCompanyText(label, other))).toEqual([
      "Borrow from ABC",
      "Issue from ABC stock",
      "ABC / Internally Arranged",
      "ABC · Material Receipt",
      "Prepared · ABC",
    ]);
  });

  it("uses neutral fallbacks without inventing a logo or party", () => {
    expect(resolveCompanyIdentity({ companyName: "", companyShortName: "" })).toMatchObject({
      companyName: "Your company",
      companyShortName: "Your company",
      ownCompanyPartyName: null,
    });
    expect(deriveCompanyShortName("Acme Road Services")).toBe("ARS");
    expect(companyPrefixSegment("abc / west")).toBe("ABC - WEST");
  });

  it("uses the HLC party-name heuristic only for HLC identity", () => {
    const hlc = resolveCompanyIdentity({ companyName: "High Lane Constructions Pvt Ltd", companyShortName: "HLC" });
    const abc = resolveCompanyIdentity({
      companyName: "Acme Roads Pvt Ltd",
      companyShortName: "ABC",
      ownCompanyPartyName: "Acme Roads",
    });
    expect(isLegacyHlcCompany(hlc)).toBe(true);
    expect(isOwnCompanyName("High Lane Constructions", hlc)).toBe(true);
    expect(isLegacyHlcCompany(abc)).toBe(false);
    expect(isOwnCompanyName("Acme Roads", abc)).toBe(true);
    expect(isOwnCompanyName("High Lane Constructions", abc)).toBe(false);
    const renamedShortName = resolveCompanyIdentity({
      companyName: "High Lane Constructions Pvt Ltd",
      companyShortName: "ABC",
    });
    expect(isOwnCompanyName("High Lane Constructions Pvt Ltd", renamedShortName)).toBe(true);
    expect(isOwnCompanyName("HLC", renamedShortName)).toBe(false);
    expect(isOwnCompanyName("Another High Lane vendor", renamedShortName)).toBe(false);
  });

  it("limits the one-time ledger gap fix to the HLC installation", () => {
    expect(canRunLegacyLedgerGapFix("HLC")).toBe(true);
    expect(canRunLegacyLedgerGapFix(" hlc ")).toBe(true);
    expect(canRunLegacyLedgerGapFix("HLCPL")).toBe(false);
    expect(canRunLegacyLedgerGapFix("ABC")).toBe(false);
    expect(canRunLegacyLedgerGapFix(null)).toBe(false);
  });

  it("keeps HLC document prefixes and starts other companies under their own prefix", () => {
    expect(formatVendorBillNumber("HLC", 2026, 31)).toBe("HLC/VB/2026/0031");
    expect(nextVendorBillSequence("HLC", 2026, ["HLC/VB/2026/0009", "HLC/VB/2026/0010"])).toBe(11);
    expect(formatVendorBillNumber("ABC", 2026, nextVendorBillSequence("ABC", 2026, [])))
      .toBe("ABC/VB/2026/0001");
    expect(nextPurchaseIndentSequence({
      shortName: "HLC", legacyCounter: 4, companyCounter: 2, legacyCount: 4, companyCount: 2, companyMax: 5,
    })).toBe(6);
    expect(nextPurchaseIndentSequence({
      shortName: "ABC", legacyCounter: 4, companyCounter: 0, legacyCount: 4, companyCount: 0, companyMax: 0,
    })).toBe(1);
    expect(formatInternalRequisitionNumber("ABC", 2026, "SITE", "SK", "WMM", 1))
      .toBe("ABC/IRN/2026/SITE-SK-WMM/0001");
    expect(nextInternalRequisitionSequence("HLC", 7, 3)).toBe(8);
    expect(nextInternalRequisitionSequence("ABC", 7, 0)).toBe(1);
  });
});
