import { describe, expect, it } from "vitest";
import {
  buildTallyExportReadiness,
  parseTallyExportConfig,
  trimTallyMappingName,
  type TallyExportConfig,
} from "@shared/tallyExportReadiness";

const config: TallyExportConfig = {
  companyName: "High Lane Constructions Pvt Ltd - SK 2025-26",
  cutoverDate: "2026-01-31",
  projectCategory: "Projects",
  resourceCategory: "Resources",
};

describe("Tally export readiness", () => {
  it("keeps typed Tally names as entered except for surrounding whitespace", () => {
    expect(trimTallyMappingName("  Ledger  With Mixed Case  ")).toBe("Ledger  With Mixed Case");
    expect(trimTallyMappingName("   ")).toBeNull();
    expect(trimTallyMappingName(null)).toBeNull();
  });

  it("lists every blocker for post-cutover bills and reports pre-cutover bills separately", () => {
    const report = buildTallyExportReadiness({
      config,
      vendors: [{ id: 4, name: "Example Vendor", tallyLedgerName: null }],
      sites: [{ id: 8, name: "North Site", tallyCostCentreName: null }],
      hiredMachines: [],
      bills: [
        { id: 10, billNo: "POST-10", billDate: "2026-02-01", status: "approved", vendorId: 4, siteId: 8 },
        { id: 11, billNo: "PRE-11", billDate: "2026-01-30", status: "paid", vendorId: 4, siteId: 8 },
        { id: 12, billNo: "DRAFT-12", billDate: "2026-02-01", status: "draft", vendorId: 4, siteId: 8 },
        { id: 13, billNo: "CANCELLED-13", billDate: "2026-02-01", status: "approved", isCancelled: true, vendorId: 4, siteId: 8 },
        { id: 14, billNo: "DELETED-14", billDate: "2026-02-01", status: "paid", isDeleted: true, vendorId: 4, siteId: 8 },
        { id: 15, billNo: "VERIFIED-15", billDate: "2026-02-01", status: "verified", vendorId: 4, siteId: 8 },
      ],
    });

    expect(report.candidates).toEqual({ total: 2, preCutover: 1, ready: 0, blocked: 1 });
    expect(report.blockedBills[0].reasons).toEqual([
      'Vendor "Example Vendor" has no Name in Tally.',
      'Site "North Site" has no Name in Tally.',
    ]);
    expect(report.preCutoverBills.map(bill => bill.billNo)).toEqual(["PRE-11"]);
  });

  it("rejects missing or invalid Tally configuration rather than silently falling back", () => {
    expect(() => parseTallyExportConfig(null)).toThrow("configuration is missing");
    expect(() => parseTallyExportConfig(JSON.stringify({ ...config, cutoverDate: "2026-02-31" }))).toThrow("valid YYYY-MM-DD");
  });
});
