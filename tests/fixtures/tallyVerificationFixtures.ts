import {
  defaultTallyVoucherMappings,
  emptyTallyComponentLedgerMappings,
  type TallyExportConfig,
} from "@shared/tallyExportReadiness";
import {
  buildTallyImportXml,
  buildTallyVoucherPreview,
  type TallyVoucherPreview,
} from "@shared/tallyVoucher";

export const tallyVerificationCompany = "HLC TALLY TRIAL - TEST ONLY - NOT PRODUCTION";
export const gangaramPartyLedger = "Gangaram Narsimulu";

export const tallyVerificationConfig: TallyExportConfig = {
  companyName: tallyVerificationCompany,
  cutoverDate: "2026-01-31",
  projectCategory: "Projects",
  resourceCategory: "Resources",
  voucherMappings: {
    ...defaultTallyVoucherMappings,
    material: { voucherType: "Purchase", expenseLedger: "TEST ONLY - Purchase of Material", confirmed: true },
    transport: { voucherType: "Journal", expenseLedger: "TEST ONLY - Transport Charges", confirmed: true },
    equipment: { voucherType: "Journal", expenseLedger: "TEST ONLY - Machinery Hire Charges", confirmed: true },
  },
  componentLedgerMappings: {
    ...emptyTallyComponentLedgerMappings,
    gst: { ledgerName: "TEST ONLY - Input GST", confirmed: true },
    tds: { ledgerName: "TEST ONLY - TDS Payable", confirmed: true },
    advanceAdjustment: { ledgerName: "TEST ONLY - Advance Recovery", confirmed: true },
  },
};

export const tallyVerificationVendor = {
  id: 4,
  name: "NARASIMHULU",
  tallyLedgerName: gangaramPartyLedger,
};

export const tallyVerificationSite = {
  id: 8001,
  name: "TEST ONLY - NORTH SITE",
  tallyCostCentreName: "TEST ONLY - PROJECTS - NORTH SITE",
};

export const tallyVerificationEquipment = {
  id: 8055,
  name: "TEST ONLY - TIPPER 2086",
  tallyCostCentreName: "TEST ONLY - RESOURCES - TIPPER 2086",
};

export const tallyVerificationBills = [
  {
    id: 80001,
    billNo: "HLC/VB/2026/0001",
    billDate: "2026-02-10",
    periodFrom: "2026-02-10",
    periodTo: "2026-02-10",
    billType: "MATERIAL",
    status: "approved",
    vendorName: tallyVerificationVendor.name,
    vendorId: tallyVerificationVendor.id,
    siteId: tallyVerificationSite.id,
    totalAmount: 1000,
    gstRateMaterial: 5,
    tdsRate: 1,
    items: [{
      category: "material",
      description: "TEST ONLY - crushed aggregate",
      amount: 1000,
      siteName: tallyVerificationSite.name,
    }],
  },
  {
    id: 80018,
    billNo: "HLC/VB/2026/0018",
    billDate: "2026-02-18",
    periodFrom: "2026-02-18",
    periodTo: "2026-02-18",
    billType: "TRANSPORT",
    status: "approved",
    vendorName: tallyVerificationVendor.name,
    vendorId: tallyVerificationVendor.id,
    siteId: tallyVerificationSite.id,
    totalAmount: 2000,
    adjustmentLabel: "Advance adjustment",
    adjustmentAmount: -500,
    netPayableAmount: 1500,
    items: [{
      category: "transport",
      description: "TEST ONLY - tipper transport",
      amount: 2000,
      siteName: tallyVerificationSite.name,
    }],
  },
  {
    id: 80055,
    billNo: "HLC/VB/2026/TEST-EQ-01",
    billDate: "2026-02-20",
    periodFrom: "2026-02-20",
    periodTo: "2026-02-20",
    billType: "EQUIPMENT",
    status: "approved",
    vendorName: tallyVerificationVendor.name,
    vendorId: tallyVerificationVendor.id,
    siteId: tallyVerificationSite.id,
    totalAmount: 3000,
    netPayableAmount: 3000,
    items: [{
      category: "equipment",
      description: "TEST ONLY - tipper hire",
      amount: 3000,
      siteName: tallyVerificationSite.name,
      equipmentId: tallyVerificationEquipment.id,
      hireStatementId: 80701,
      source: "hire_statement",
    }],
    hireStatements: [{
      id: 80701,
      equipmentId: tallyVerificationEquipment.id,
      grossAmount: 3000,
      netAmount: 3000,
    }],
  },
] as const;

export type TallyVerificationSample = {
  bill: (typeof tallyVerificationBills)[number];
  preview: TallyVoucherPreview;
  xml: string;
};

export function buildTallyVerificationSamples(): TallyVerificationSample[] {
  return tallyVerificationBills.map(bill => {
    const result = buildTallyVoucherPreview(bill, {
      config: tallyVerificationConfig,
      vendor: tallyVerificationVendor,
      sites: [tallyVerificationSite],
      equipment: [tallyVerificationEquipment],
    });
    if (!result.preview) {
      throw new Error(`${bill.billNo} fixture was blocked: ${result.reasons.join("; ")}`);
    }
    return {
      bill,
      preview: result.preview,
      xml: buildTallyImportXml(tallyVerificationCompany, [result.preview]),
    };
  });
}
