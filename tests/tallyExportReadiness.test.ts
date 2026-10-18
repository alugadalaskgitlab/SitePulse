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

  it("places candidates by billing period without falling back to bill date", () => {
    const report = buildTallyExportReadiness({
      config,
      vendors: [{ id: 4, name: "Example Vendor", tallyLedgerName: "Example Vendor" }],
      sites: [{ id: 8, name: "North Site", tallyCostCentreName: "North Site" }],
      hiredMachines: [],
      bills: [
        { id: 10, billNo: "PRE-10", billDate: "2026-03-11", periodFrom: "2026-01-25", periodTo: "2026-01-30", status: "approved", vendorId: 4, siteId: 8 },
        { id: 11, billNo: "POST-11", billDate: "2026-01-15", periodFrom: "2026-02-01", periodTo: "2026-02-02", status: "approved", vendorId: 4, siteId: 8 },
        { id: 12, billNo: "STRADDLE-12", billDate: "2026-03-11", periodFrom: "2026-01-30", periodTo: "2026-02-01", status: "paid", vendorId: 4, siteId: 8 },
        { id: 13, billNo: "NO-PERIOD-13", billDate: "2025-12-30", periodFrom: null, periodTo: null, status: "paid", vendorId: 4, siteId: 8 },
        { id: 14, billNo: "INVALID-PERIOD-14", billDate: "2026-02-01", periodFrom: "2026-02-31", periodTo: "2026-03-01", status: "approved", vendorId: 4, siteId: 8 },
        { id: 15, billNo: "REVERSED-PERIOD-15", billDate: "2026-02-01", periodFrom: "2026-02-02", periodTo: "2026-02-01", status: "approved", vendorId: 4, siteId: 8 },
        { id: 16, billNo: "DRAFT-16", billDate: "2026-02-01", periodFrom: "2026-02-01", periodTo: "2026-02-02", status: "draft", vendorId: 4, siteId: 8 },
        { id: 17, billNo: "CANCELLED-17", billDate: "2026-02-01", periodFrom: "2026-02-01", periodTo: "2026-02-02", status: "approved", isCancelled: true, vendorId: 4, siteId: 8 },
        { id: 18, billNo: "DELETED-18", billDate: "2026-02-01", periodFrom: "2026-02-01", periodTo: "2026-02-02", status: "paid", isDeleted: true, vendorId: 4, siteId: 8 },
        { id: 19, billNo: "VERIFIED-19", billDate: "2026-02-01", periodFrom: "2026-02-01", periodTo: "2026-02-02", status: "verified", vendorId: 4, siteId: 8 },
        { id: 20, billNo: "PRE-EXACT-20", billDate: "2026-03-11", periodFrom: "2026-01-25", periodTo: "2026-01-31", status: "approved", vendorId: 4, siteId: 8 },
      ],
    });

    expect(report.candidates).toEqual({
      total: 7,
      preCutover: 2,
      postCutover: 1,
      straddlesCutover: 1,
      periodNotRecorded: 3,
      ready: 1,
      blocked: 0,
    });
    expect(report.preCutoverBills.map(bill => bill.billNo)).toEqual(["PRE-10", "PRE-EXACT-20"]);
    expect(report.preCutoverBills.find(bill => bill.billNo === "PRE-EXACT-20")?.periodTo).toBe("2026-01-31");
    expect(report.straddlingBills.map(bill => bill.billNo)).toEqual(["STRADDLE-12"]);
    expect(report.periodNotRecordedBills.map(bill => bill.billNo)).toEqual([
      "NO-PERIOD-13",
      "INVALID-PERIOD-14",
      "REVERSED-PERIOD-15",
    ]);
  });

  it("treats the cutover date as pre-cutover and the following day as post-cutover", () => {
    const report = buildTallyExportReadiness({
      config,
      vendors: [],
      sites: [],
      hiredMachines: [],
      bills: [
        {
          id: 30,
          billNo: "ENDS-ON-CUTOVER",
          billDate: "2026-02-10",
          periodFrom: "2026-01-25",
          periodTo: "2026-01-31",
          status: "approved",
        },
        {
          id: 31,
          billNo: "STARTS-DAY-AFTER",
          billDate: "2026-02-10",
          periodFrom: "2026-02-01",
          periodTo: "2026-02-01",
          status: "approved",
        },
      ],
    });

    expect(report.preCutoverBills.map(bill => bill.billNo)).toEqual(["ENDS-ON-CUTOVER"]);
    expect(report.preCutoverBills[0].periodTo).toBe("2026-01-31");
    expect(report.candidates.postCutover).toBe(1);
    expect(report.blockedBills.map(bill => bill.billNo)).toEqual(["STARTS-DAY-AFTER"]);
    expect(report.candidates.straddlesCutover).toBe(0);
    expect(report.candidates.periodNotRecorded).toBe(0);
  });

  it("lists every blocker for post-cutover bills", () => {
    const report = buildTallyExportReadiness({
      config,
      vendors: [{ id: 4, name: "Example Vendor", tallyLedgerName: null }],
      sites: [{ id: 8, name: "North Site", tallyCostCentreName: null }],
      hiredMachines: [],
      bills: [{
        id: 20,
        billNo: "BLOCKED-20",
        billDate: "2026-03-11",
        periodFrom: "2026-02-01",
        periodTo: "2026-02-28",
        status: "approved",
        vendorId: 4,
        siteId: 8,
      }],
    });

    expect(report.candidates).toEqual({
      total: 1,
      preCutover: 0,
      postCutover: 1,
      straddlesCutover: 0,
      periodNotRecorded: 0,
      ready: 0,
      blocked: 1,
    });
    expect(report.blockedBills[0].reasons).toEqual([
      'Vendor "Example Vendor" has no Name in Tally.',
      'Site "North Site" has no Name in Tally.',
    ]);
  });

  it("rejects missing or invalid Tally configuration rather than silently falling back", () => {
    expect(() => parseTallyExportConfig(null)).toThrow("configuration is missing");
    expect(() => parseTallyExportConfig(JSON.stringify({ ...config, cutoverDate: "2026-02-31" }))).toThrow("valid YYYY-MM-DD");
  });
});
