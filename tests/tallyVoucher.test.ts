import { describe, expect, it } from "vitest";
import {
  defaultTallyVoucherMappings,
  emptyTallyComponentLedgerMappings,
  type TallyExportConfig,
} from "@shared/tallyExportReadiness";
import { buildTallyImportXml, buildTallyVoucherPreview } from "@shared/tallyVoucher";

const config: TallyExportConfig = {
  companyName: "High Lane Constructions Pvt Ltd - SK 2025-26",
  cutoverDate: "2026-01-31",
  projectCategory: "Projects",
  resourceCategory: "Resources",
  voucherMappings: {
    ...defaultTallyVoucherMappings,
    material: { voucherType: "Purchase", expenseLedger: "Purchase of Material", confirmed: true },
    equipment: { voucherType: "Journal", expenseLedger: "Machinery Hire Charges", confirmed: true },
  },
  componentLedgerMappings: {
    ...emptyTallyComponentLedgerMappings,
    gst: { ledgerName: "Input GST", confirmed: true },
    tds: { ledgerName: "TDS Payable", confirmed: true },
  },
};

const vendor = { id: 4, name: "Vendor & Sons", tallyLedgerName: "Vendor & Sons" };
const sites = [{ id: 8, name: "North Site", tallyCostCentreName: "NORTH-CC" }];

describe("HLC Tally voucher preview and XML", () => {
  it("builds a balanced itemized material purchase and escapes XML text", () => {
    const result = buildTallyVoucherPreview({
      id: 5,
      billNo: "HLC/VB/2026/0030",
      billDate: "2026-02-10",
      billType: "MATERIAL",
      vendorName: "Vendor & Sons",
      vendorId: 4,
      siteId: 8,
      totalAmount: 100,
      items: [{ category: "material", description: "Stone", amount: 100, siteName: "North Site" }],
    }, {
      config,
      vendor,
      sites,
      equipment: [],
    });

    expect(result.reasons).toEqual([]);
    expect(result.preview).toMatchObject({
      billNo: "HLC/VB/2026/0030",
      voucherType: "Purchase",
      netPayable: 100,
      debits: 100,
      credits: 100,
    });
    expect(result.preview?.entries).toContainEqual(expect.objectContaining({
      ledgerName: "Purchase of Material",
      side: "debit",
      categoryAllocations: [{ category: "Projects", costCentre: "NORTH-CC", amount: 100 }],
    }));

    const xml = buildTallyImportXml(config.companyName, [result.preview!]);
    expect(xml).toContain("<TALLYREQUEST>Import Data</TALLYREQUEST>");
    expect(xml).toContain("<SVCURRENTCOMPANY>High Lane Constructions Pvt Ltd - SK 2025-26</SVCURRENTCOMPANY>");
    expect(xml).toContain("<LEDGERNAME>Vendor &amp; Sons</LEDGERNAME>");
    expect(xml).toContain("<BILLTYPE>New Ref</BILLTYPE>");
    expect(xml).toContain("<AMOUNT>-100.00</AMOUNT>");
    expect(xml).toContain("<NAME>NORTH-CC</NAME>");
  });

  it("allocates equipment hire gross to both the project and the specific machine", () => {
    const result = buildTallyVoucherPreview({
      id: 6,
      billNo: "HLC/VB/2026/0031",
      billDate: "2026-02-11",
      billType: "EQUIPMENT",
      vendorName: "Vendor & Sons",
      vendorId: 4,
      siteId: 8,
      totalAmount: 100,
      items: [{
        category: "equipment",
        description: "Excavator hire",
        amount: 100,
        siteName: "North Site",
        equipmentId: 55,
        hireStatementId: 70,
        source: "hire_statement",
      }],
      hireStatements: [{
        id: 70,
        equipmentId: 55,
        grossAmount: 100,
        netAmount: 100,
      }],
    }, {
      config,
      vendor,
      sites,
      equipment: [{ id: 55, name: "EX-55", tallyCostCentreName: "MACHINE-55" }],
    });

    expect(result.reasons).toEqual([]);
    expect(result.preview?.entries).toContainEqual(expect.objectContaining({
      ledgerName: "Machinery Hire Charges",
      categoryAllocations: [
        { category: "Projects", costCentre: "NORTH-CC", amount: 100 },
        { category: "Resources", costCentre: "MACHINE-55", amount: 100 },
      ],
    }));
  });

  it("keeps combined-bill items on their category ledgers and separates GST and TDS", () => {
    const combinedConfig: TallyExportConfig = {
      ...config,
      voucherMappings: {
        ...config.voucherMappings,
        material: { voucherType: "Purchase", expenseLedger: "Purchase of Material", confirmed: true },
        transport: { voucherType: "Journal", expenseLedger: "Mix Transportation Charges", confirmed: true },
        all: { voucherType: "Journal", confirmed: true },
      },
    };
    const result = buildTallyVoucherPreview({
      id: 8,
      billNo: "HLC/VB/2026/0033",
      billDate: "2026-02-13",
      billType: "ALL",
      vendorName: "Vendor & Sons",
      vendorId: 4,
      siteId: 8,
      totalAmount: 150,
      gstRateMaterial: 10,
      gstRateTransport: 10,
      tdsRate: 2,
      items: [
        { category: "material", description: "Stone", amount: 100, siteName: "North Site" },
        { category: "transport", description: "Haulage", amount: 50, siteName: "North Site" },
      ],
    }, {
      config: combinedConfig,
      vendor,
      sites,
      equipment: [],
    });

    expect(result.reasons).toEqual([]);
    expect(result.preview).toMatchObject({
      voucherType: "Journal",
      netPayable: 162,
      debits: 165,
      credits: 165,
    });
    expect(result.preview?.entries).toContainEqual(expect.objectContaining({
      ledgerName: "Input GST",
      side: "debit",
      amount: 15,
    }));
    expect(result.preview?.entries).toContainEqual(expect.objectContaining({
      ledgerName: "TDS Payable",
      side: "credit",
      amount: 3,
    }));
    expect(result.preview?.entries.map(entry => entry.ledgerName)).toContain("Mix Transportation Charges");
  });

  it("blocks unconfirmed ledgers and unclassified adjustments instead of guessing", () => {
    const result = buildTallyVoucherPreview({
      id: 7,
      billNo: "HLC/VB/2026/0032",
      billDate: "2026-02-12",
      billType: "MATERIAL",
      vendorName: "Vendor & Sons",
      vendorId: 4,
      siteId: 8,
      totalAmount: 100,
      adjustmentLabel: "Unmapped adjustment",
      adjustmentAmount: -5,
      netPayableAmount: 95,
      items: [{ category: "material", description: "Stone", amount: 100, siteName: "North Site" }],
    }, {
      config: {
        ...config,
        voucherMappings: {
          ...config.voucherMappings,
          material: { ...config.voucherMappings.material, confirmed: false },
        },
      },
      vendor,
      sites,
      equipment: [],
    });

    expect(result.preview).toBeNull();
    expect(result.reasons).toContain('Tally voucher type "Purchase" has not been confirmed against HLC Tally.');
    expect(result.reasons).toContain('Adjustment "Unmapped adjustment" has no confirmed accounting treatment.');
  });
});
