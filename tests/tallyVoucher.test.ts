import { describe, expect, it } from "vitest";
import {
  defaultTallyVoucherMappings,
  emptyTallyComponentLedgerMappings,
  type TallyExportConfig,
} from "@shared/tallyExportReadiness";
import { buildTallyImportXml, buildTallyVoucherPreview } from "@shared/tallyVoucher";
import {
  buildTallyVerificationSamples,
  gangaramPartyLedger,
  tallyVerificationCompany,
  tallyVerificationConfig,
  tallyVerificationEquipment,
  tallyVerificationSite,
  tallyVerificationVendor,
} from "./fixtures/tallyVerificationFixtures";

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
    expect(result.reasons).toContain('material expense ledger "Purchase of Material" has not been confirmed against HLC Tally.');
    expect(result.reasons).toContain('Adjustment "Unmapped adjustment" has no confirmed accounting treatment.');
  });

  it("builds three isolated trial vouchers with one Gangaram party ledger and balanced postings", () => {
    const samples = buildTallyVerificationSamples();
    expect(samples.map(sample => sample.bill.billNo)).toEqual([
      "HLC/VB/2026/0001",
      "HLC/VB/2026/0018",
      "HLC/VB/2026/TEST-EQ-01",
    ]);
    expect(samples.map(sample => sample.preview.voucherType)).toEqual(["Purchase", "Journal", "Journal"]);

    for (const sample of samples) {
      expect(sample.preview.debits).toBe(sample.preview.credits);
      expect(sample.preview.entries.filter(entry => entry.isPartyLedger)).toEqual([
        expect.objectContaining({
          ledgerName: gangaramPartyLedger,
          side: "credit",
          amount: sample.preview.netPayable,
        }),
      ]);
      expect(sample.xml).toContain(`<SVCURRENTCOMPANY>${tallyVerificationCompany}</SVCURRENTCOMPANY>`);
      expect(sample.xml).toContain(`<REFERENCE>${sample.bill.billNo}</REFERENCE>`);
      expect(sample.xml).toContain(`<LEDGERNAME>${gangaramPartyLedger}</LEDGERNAME>`);
      const allocationsByCategory = new Map<string, number>();
      for (const entry of sample.preview.entries) {
        expect(entry.isPartyLedger || entry.ledgerName.startsWith("TEST ONLY -")).toBe(true);
        for (const allocation of entry.categoryAllocations) {
          allocationsByCategory.set(
            allocation.category,
            (allocationsByCategory.get(allocation.category) ?? 0) + allocation.amount,
          );
        }
      }
      expect(allocationsByCategory.get("Projects")).toBe(Number(sample.bill.totalAmount));
      expect(allocationsByCategory.get("Resources") ?? 0).toBe(
        sample.bill.billType === "EQUIPMENT" ? Number(sample.bill.totalAmount) : 0,
      );
    }

    const [material, transport, equipment] = samples;
    expect(material.preview.entries.map(entry => entry.ledgerName)).toEqual(expect.arrayContaining([
      "TEST ONLY - Purchase of Material",
      "TEST ONLY - Input GST",
      "TEST ONLY - TDS Payable",
      gangaramPartyLedger,
    ]));
    expect(material.preview.entries).toContainEqual(expect.objectContaining({
      ledgerName: "TEST ONLY - Input GST",
      side: "debit",
      amount: 50,
    }));
    expect(material.preview.entries).toContainEqual(expect.objectContaining({
      ledgerName: "TEST ONLY - TDS Payable",
      side: "credit",
      amount: 10,
    }));
    expect(material.xml).toContain("<VOUCHERTYPENAME>Purchase</VOUCHERTYPENAME>");

    expect(transport.preview.entries).toContainEqual(expect.objectContaining({
      ledgerName: "TEST ONLY - Advance Recovery",
      side: "credit",
      amount: 500,
    }));
    expect(transport.xml).toContain("<VOUCHERTYPENAME>Journal</VOUCHERTYPENAME>");
    expect(transport.xml).toContain("<LEDGERNAME>TEST ONLY - Advance Recovery</LEDGERNAME>");
    expect(transport.xml).toContain("<AMOUNT>500.00</AMOUNT>");

    expect(equipment.preview.entries).toContainEqual(expect.objectContaining({
      ledgerName: "TEST ONLY - Machinery Hire Charges",
      categoryAllocations: [
        { category: "Projects", costCentre: "TEST ONLY - PROJECTS - NORTH SITE", amount: 3000 },
        { category: "Resources", costCentre: "TEST ONLY - RESOURCES - TIPPER 2086", amount: 3000 },
      ],
    }));
    expect(equipment.xml).toContain("<CATEGORY>Projects</CATEGORY>");
    expect(equipment.xml).toContain("<CATEGORY>Resources</CATEGORY>");
  });

  it("blocks missing party, expense, voucher-type, site, and machine mappings", () => {
    const fixtureSamples = buildTallyVerificationSamples();
    const material = fixtureSamples[0].bill;
    const equipmentBill = fixtureSamples[2].bill;
    const cases = [
      {
        bill: material,
        context: {
          config: tallyVerificationConfig,
          vendor: { ...tallyVerificationVendor, tallyLedgerName: null },
          sites: [tallyVerificationSite],
          equipment: [],
        },
        reason: "Vendor has no mapped Tally ledger.",
      },
      {
        bill: material,
        context: {
          config: {
            ...tallyVerificationConfig,
            voucherMappings: {
              ...tallyVerificationConfig.voucherMappings,
              material: { ...tallyVerificationConfig.voucherMappings.material, expenseLedger: null },
            },
          },
          vendor: tallyVerificationVendor,
          sites: [tallyVerificationSite],
          equipment: [],
        },
        reason: "material expense has no mapped Tally ledger.",
      },
      {
        bill: fixtureSamples[1].bill,
        context: {
          config: {
            ...tallyVerificationConfig,
            componentLedgerMappings: {
              ...tallyVerificationConfig.componentLedgerMappings,
              advanceAdjustment: { ledgerName: null, confirmed: false },
            },
          },
          vendor: tallyVerificationVendor,
          sites: [tallyVerificationSite],
          equipment: [],
        },
        reason: "advanceAdjustment has no mapped Tally ledger.",
      },
      {
        bill: material,
        context: {
          config: {
            ...tallyVerificationConfig,
            voucherMappings: {
              ...tallyVerificationConfig.voucherMappings,
              material: { ...tallyVerificationConfig.voucherMappings.material, voucherType: "", confirmed: true },
            },
          },
          vendor: tallyVerificationVendor,
          sites: [tallyVerificationSite],
          equipment: [],
        },
        reason: "Tally voucher type is missing.",
      },
      {
        bill: material,
        context: {
          config: tallyVerificationConfig,
          vendor: tallyVerificationVendor,
          sites: [{ ...tallyVerificationSite, tallyCostCentreName: null }],
          equipment: [],
        },
        reason: `Site "${tallyVerificationSite.name}" has no Name in Tally.`,
      },
      {
        bill: equipmentBill,
        context: {
          config: tallyVerificationConfig,
          vendor: tallyVerificationVendor,
          sites: [tallyVerificationSite],
          equipment: [{ ...tallyVerificationEquipment, tallyCostCentreName: null }],
        },
        reason: `Machine "${tallyVerificationEquipment.name}" has no Name in Tally.`,
      },
    ];

    for (const item of cases) {
      const result = buildTallyVoucherPreview(item.bill, item.context);
      expect(result.preview).toBeNull();
      expect(result.reasons).toContain(item.reason);
    }
  });
});
