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
  tallyVerificationInterstateVendor,
  tallyVerificationVendor,
} from "./fixtures/tallyVerificationFixtures";

const config: TallyExportConfig = {
  companyName: "High Lane Constructions Pvt Ltd - SK 2025-26",
  cutoverDate: "2026-01-31",
  projectCategory: "Projects",
  resourceCategory: "Resources",
  homeStateCode: "36",
  voucherMappings: {
    ...defaultTallyVoucherMappings,
    material: { voucherType: "Purchase", expenseLedger: "Purchase of Material", confirmed: true },
    equipment: { voucherType: "Journal", expenseLedger: "Machinery Hire Charges", confirmed: true },
  },
  componentLedgerMappings: {
    ...emptyTallyComponentLedgerMappings,
    gstCgst: { ledgerName: "ITC CGST", confirmed: true },
    gstSgst: { ledgerName: "ITC SGST", confirmed: true },
    gstIgst: { ledgerName: "ITC IGST", confirmed: true },
    tds: { ledgerName: "TDS Payable", confirmed: true },
  },
};

const vendor = {
  id: 4,
  name: "Vendor & Sons",
  tallyLedgerName: "Vendor & Sons",
  gstNumber: "36ABCDE1234F1Z5",
};
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
      ledgerName: "ITC CGST",
      side: "debit",
      amount: 7.5,
    }));
    expect(result.preview?.entries).toContainEqual(expect.objectContaining({
      ledgerName: "ITC SGST",
      side: "debit",
      amount: 7.5,
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

  it("builds four isolated trial vouchers with state-based GST and balanced postings", () => {
    const samples = buildTallyVerificationSamples();
    expect(samples.map(sample => sample.bill.billNo)).toEqual([
      "HLC/VB/2026/0001",
      "HLC/VB/2026/0018",
      "HLC/VB/2026/TEST-ALL-01",
      "HLC/VB/2026/TEST-EQ-01",
    ]);
    expect(samples.map(sample => sample.preview.voucherType)).toEqual(["Purchase", "Journal", "Journal", "Journal"]);

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
        expect(
          entry.isPartyLedger ||
          entry.ledgerName.startsWith("TEST ONLY -") ||
          ["ITC CGST", "ITC SGST", "ITC IGST"].includes(entry.ledgerName),
        ).toBe(true);
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

    const [material, transport, combined, equipment] = samples;
    expect(material.preview.entries.map(entry => entry.ledgerName)).toEqual(expect.arrayContaining([
      "TEST ONLY - Purchase of Material",
      "ITC CGST",
      "ITC SGST",
      "TEST ONLY - TDS Payable",
      gangaramPartyLedger,
    ]));
    expect(material.preview.entries).toContainEqual(expect.objectContaining({
      ledgerName: "ITC CGST",
      side: "debit",
      amount: 25,
    }));
    expect(material.preview.entries).toContainEqual(expect.objectContaining({
      ledgerName: "ITC SGST",
      side: "debit",
      amount: 25,
    }));
    expect(material.preview.entries).toContainEqual(expect.objectContaining({
      ledgerName: "TEST ONLY - TDS Payable",
      side: "credit",
      amount: 10,
    }));
    expect(material.xml).toContain("<VOUCHERTYPENAME>Purchase</VOUCHERTYPENAME>");
    expect(material.preview.debits).toBe(1050);
    expect(material.preview.credits).toBe(1050);

    expect(transport.preview.entries).toContainEqual(expect.objectContaining({
      ledgerName: "TEST ONLY - Advance Recovery",
      side: "credit",
      amount: 500,
    }));
    expect(transport.preview.entries).toContainEqual(expect.objectContaining({
      ledgerName: "ITC IGST",
      side: "debit",
      amount: 360,
    }));
    expect(transport.preview.entries.some(entry =>
      entry.ledgerName === "ITC CGST" || entry.ledgerName === "ITC SGST",
    )).toBe(false);
    expect(transport.preview.debits).toBe(2360);
    expect(transport.preview.credits).toBe(2360);
    expect(transport.xml).toContain("<VOUCHERTYPENAME>Journal</VOUCHERTYPENAME>");
    expect(transport.xml).toContain("<LEDGERNAME>TEST ONLY - Advance Recovery</LEDGERNAME>");
    expect(transport.xml).toContain("<AMOUNT>500.00</AMOUNT>");

    expect(combined.preview.entries).toContainEqual(expect.objectContaining({
      ledgerName: "ITC CGST",
      side: "debit",
      amount: 70,
    }));
    expect(combined.preview.entries).toContainEqual(expect.objectContaining({
      ledgerName: "ITC SGST",
      side: "debit",
      amount: 70,
    }));
    expect(combined.preview.entries.filter(entry => ["ITC CGST", "ITC SGST", "ITC IGST"].includes(entry.ledgerName)))
      .toHaveLength(2);
    expect(combined.preview.debits).toBe(1640);
    expect(combined.preview.credits).toBe(1640);
    expect(combined.xml).toContain("<VOUCHERTYPENAME>Journal</VOUCHERTYPENAME>");

    expect(equipment.preview.entries).toContainEqual(expect.objectContaining({
      ledgerName: "TEST ONLY - Machinery Hire Charges",
      categoryAllocations: [
        { category: "Projects", costCentre: "TEST ONLY - PROJECTS - NORTH SITE", amount: 3000 },
        { category: "Resources", costCentre: "TEST ONLY - RESOURCES - TIPPER 2086", amount: 3000 },
      ],
    }));
    expect(equipment.xml).toContain("<CATEGORY>Projects</CATEGORY>");
    expect(equipment.xml).toContain("<CATEGORY>Resources</CATEGORY>");
    expect(equipment.preview.entries).toHaveLength(2);
    expect(equipment.preview.entries.some(entry => ["ITC CGST", "ITC SGST", "ITC IGST"].includes(entry.ledgerName))).toBe(false);
  });

  it("blocks missing party, expense, voucher-type, site, and machine mappings", () => {
    const fixtureSamples = buildTallyVerificationSamples();
    const material = fixtureSamples[0].bill;
    const equipmentBill = fixtureSamples[3].bill;
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

  it("blocks GST when state or split mappings are missing, but leaves no-GST bills unchanged", () => {
    const materialBill = buildTallyVerificationSamples()[0].bill;
    const baseContext = {
      config: tallyVerificationConfig,
      vendor: tallyVerificationVendor,
      sites: [tallyVerificationSite],
      equipment: [tallyVerificationEquipment],
    };
    const missingGstin = buildTallyVoucherPreview(materialBill, {
      ...baseContext,
      vendor: { ...tallyVerificationVendor, gstNumber: null },
    });
    expect(missingGstin.preview).toBeNull();
    expect(missingGstin.reasons).toContain('Vendor "NARASIMHULU" GSTIN is missing; GST state cannot be determined.');

    const malformedGstin = buildTallyVoucherPreview(materialBill, {
      ...baseContext,
      vendor: { ...tallyVerificationVendor, gstNumber: "not-a-gstin" },
    });
    expect(malformedGstin.preview).toBeNull();
    expect(malformedGstin.reasons).toContain('Vendor "NARASIMHULU" GSTIN is malformed; GST state cannot be determined.');

    const missingHomeState = buildTallyVoucherPreview(materialBill, {
      ...baseContext,
      config: { ...tallyVerificationConfig, homeStateCode: null },
    });
    expect(missingHomeState.preview).toBeNull();
    expect(missingHomeState.reasons).toContain("HLC home state code is missing or invalid.");

    const missingSplitLedger = buildTallyVoucherPreview(materialBill, {
      ...baseContext,
      config: {
        ...tallyVerificationConfig,
        componentLedgerMappings: {
          ...tallyVerificationConfig.componentLedgerMappings,
          gstSgst: { ledgerName: null, confirmed: false },
        },
      },
    });
    expect(missingSplitLedger.preview).toBeNull();
    expect(missingSplitLedger.reasons).toContain("ITC SGST has no mapped Tally ledger.");

    const unconfirmedIgst = buildTallyVoucherPreview(buildTallyVerificationSamples()[1].bill, {
      ...baseContext,
      vendor: { ...tallyVerificationInterstateVendor, tallyLedgerName: gangaramPartyLedger },
      config: {
        ...tallyVerificationConfig,
        componentLedgerMappings: {
          ...tallyVerificationConfig.componentLedgerMappings,
          gstIgst: { ledgerName: "ITC IGST", confirmed: false },
        },
      },
    });
    expect(unconfirmedIgst.preview).toBeNull();
    expect(unconfirmedIgst.reasons).toContain(
      'ITC IGST ledger "ITC IGST" has not been confirmed against HLC Tally.',
    );

    const noGstBill = buildTallyVerificationSamples()[3].bill;
    const noGst = buildTallyVoucherPreview(noGstBill, {
      ...baseContext,
      vendor: { ...tallyVerificationVendor, gstNumber: null },
      config: {
        ...tallyVerificationConfig,
        homeStateCode: null,
        componentLedgerMappings: {
          ...tallyVerificationConfig.componentLedgerMappings,
          gstCgst: { ledgerName: null, confirmed: false },
          gstSgst: { ledgerName: null, confirmed: false },
          gstIgst: { ledgerName: null, confirmed: false },
        },
      },
    });
    expect(noGst.reasons).toEqual([]);
    expect(noGst.preview?.entries).toHaveLength(2);
  });

  it("splits odd-paise intra-state GST without losing a cent", () => {
    const result = buildTallyVoucherPreview({
      id: 80,
      billNo: "HLC/VB/2026/TEST-PAISE-01",
      billDate: "2026-02-21",
      billType: "MATERIAL",
      vendorName: tallyVerificationVendor.name,
      vendorId: tallyVerificationVendor.id,
      siteId: tallyVerificationSite.id,
      totalAmount: 100.1,
      gstRateMaterial: 10,
      items: [{
        category: "material",
        description: "TEST ONLY - odd paise GST",
        amount: 100.1,
        siteName: tallyVerificationSite.name,
      }],
    }, {
      config: tallyVerificationConfig,
      vendor: tallyVerificationVendor,
      sites: [tallyVerificationSite],
      equipment: [],
    });

    expect(result.preview?.entries).toContainEqual(expect.objectContaining({
      ledgerName: "ITC CGST",
      amount: 5.01,
    }));
    expect(result.preview?.entries).toContainEqual(expect.objectContaining({
      ledgerName: "ITC SGST",
      amount: 5,
    }));
    expect(result.preview?.debits).toBe(result.preview?.credits);
  });
});
