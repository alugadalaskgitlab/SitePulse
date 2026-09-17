import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import VendorBills from "../../../client/src/pages/VendorBills";
import { queryClient } from "../../../client/src/lib/queryClient";
import { calculateEquipmentHireFinancials, calculateHireGroup } from "../../../shared/hireBilling";
import "../../../client/src/index.css";

type FixtureBill = Record<string, any>;

const dailyRow = {
  key: "plant_usage:vb09",
  date: "2026-08-05",
  projectSite: "NARASIMHULU ROAD",
  openingMeter: 410,
  closingMeter: 418,
  workingHours: 8,
  workingHoursIncomplete: false,
  startTime: "08:00",
  endTime: "16:00",
  multipleTimeSegments: false,
  clockDuration: 8,
  clockDurationIncomplete: false,
  dieselIssued: null,
  openingTank: null,
  closingTank: null,
  dieselConsumed: null,
  expectedDiesel: null,
  difference: null,
  consumptionRate: null,
  consumptionRateUnit: "L/hr",
  consumptionIncomplete: true,
  events: [],
};

// This mirrors the persisted hire-statement snapshot shape used by storage:
// the export builder reads performanceDailyRows (and accepts dailyRows for
// legacy records), while sourceEvidence is retained for frozen maintenance
// context. Each representative bill below adds its own frozen financials.
const frozenDailyRows = [dailyRow];

/*
 * These are deliberately labelled representative fixture records.  They
 * exercise the persisted monthly-hire response shape only; the verifier must
 * not report them as production/dev-database evidence.  A dev-server run can
 * replace window.__VB09_HISTORICAL_BILLS__ with the server worker's two real
 * records before mounting this component.
 */
const representativeHistoricalBills: FixtureBill[] = [
  {
    id: 901,
    billDate: "2026-08-31",
    billNo: "VB09-HIST-DRAFT",
    billType: "equipment",
    vendorName: "NARASIMHULU",
    periodFrom: "2026-08-01",
    periodTo: "2026-08-31",
    status: "draft",
    notes: "REPRESENTATIVE FIXTURE RECORD — NOT PRODUCTION EVIDENCE",
    totalAmount: 90000,
    adjustmentAmount: 0,
    gstRateEquipment: 18,
    tdsRate: 2,
    netPayableAmount: 104076,
    amountPaid: 0,
    createdAt: "2026-08-31T12:00:00.000Z",
    items: [],
    hireStatements: [{
      id: 9901,
      equipmentId: 7701,
      equipmentName: "JCB · FIX-JCB-01",
      vendorName: "NARASIMHULU",
      billingBasis: "monthly",
      rate: 90000,
      periodFrom: "2026-08-01",
      periodTo: "2026-08-31",
      quantity: 1,
      grossAmount: 90000,
      deductionAmount: 0,
      netAmount: 90000,
      status: "draft",
      calculationSnapshot: {
        equipmentId: 7701,
        equipmentName: "JCB · FIX-JCB-01",
        terms: { billingBasis: "monthly", rate: 90000, dieselResponsibility: "vendor" },
        diesel: { consumptionNorm: null, actualDiesel: null, expectedDiesel: null, finalRecoveryAmount: 0 },
        performanceDailyRows: frozenDailyRows,
        dailyRows: frozenDailyRows,
        sourceEvidence: { activities: [], maintenance: [] },
        adjustments: { breakdownDeduction: 0, hsdRecovery: 0 },
        financials: { grossHire: 90000, breakdownDeduction: 0, hsdRecovery: 0, taxableAmount: 90000, gstRate: 18, gstAmount: 16200, invoiceTotal: 106200, tdsRate: 2, tdsAmount: 2124, netPayable: 104076 },
      },
      exceptions: [],
    }],
  },
  {
    id: 902,
    billDate: "2026-09-13",
    billNo: "VB09-HIST-PAID",
    billType: "equipment",
    vendorName: "NARASIMHULU",
    periodFrom: "2026-08-01",
    periodTo: "2026-09-13",
    status: "paid",
    notes: "REPRESENTATIVE FIXTURE RECORD — NOT PRODUCTION EVIDENCE",
    totalAmount: 126000,
    adjustmentAmount: 0,
    gstRateEquipment: 18,
    tdsRate: 2,
    netPayableAmount: 146034,
    amountPaid: 146034,
    createdAt: "2026-09-13T12:00:00.000Z",
    paidAt: "2026-09-20T12:00:00.000Z",
    paymentRecordedBy: "VB-09 Fixture",
    items: [],
    hireStatements: [{
      id: 9902,
      equipmentId: 7701,
      equipmentName: "JCB · FIX-JCB-01",
      vendorName: "NARASIMHULU",
      billingBasis: "monthly",
      rate: 126000,
      periodFrom: "2026-08-01",
      periodTo: "2026-09-13",
      quantity: 1,
      grossAmount: 126000,
      deductionAmount: 0,
      netAmount: 126000,
      status: "billed",
      calculationSnapshot: {
        equipmentId: 7701,
        equipmentName: "JCB · FIX-JCB-01",
        terms: { billingBasis: "monthly", rate: 126000, dieselResponsibility: "vendor" },
        diesel: { consumptionNorm: null, actualDiesel: null, expectedDiesel: null, finalRecoveryAmount: 0 },
        performanceDailyRows: frozenDailyRows,
        dailyRows: frozenDailyRows,
        sourceEvidence: { activities: [], maintenance: [] },
        adjustments: { breakdownDeduction: 0, hsdRecovery: 0 },
        financials: { grossHire: 126000, breakdownDeduction: 0, hsdRecovery: 0, taxableAmount: 126000, gstRate: 18, gstAmount: 22680, invoiceTotal: 148680, tdsRate: 2, tdsAmount: 2973.6, netPayable: 145706.4 },
      },
      exceptions: [],
    }],
  },
];

const nonEquipmentBills: FixtureBill[] = [
  {
    id: 903,
    billDate: "2026-08-10",
    billNo: "VB09-MATERIAL",
    billType: "material",
    vendorName: "MATERIAL VENDOR",
    periodFrom: "2026-08-01",
    periodTo: "2026-08-31",
    status: "verified",
    totalAmount: 12000,
    gstRateMaterial: 18,
    tdsRate: 2,
    createdAt: "2026-08-10T12:00:00.000Z",
    items: [{ id: 9031, billId: 903, date: "2026-08-05", category: "material", description: "20MM AGGREGATE", qty: 10, unit: "MT", rate: 1200, amount: 12000, source: "auto:material-9031" }],
  },
];

// VB-16 uses a compact three-day period so the browser evidence can inspect
// every rich daily column without manufacturing a month of empty rows.  The
// shape is the same Equipment Performance daily-row contract consumed by the
// production saved-bill output builder.
const vb16PerformanceDailyRows: FixtureBill[] = [
  {
    key: "plant_usage:vb16-01", date: "2026-10-01", projectSite: "VB16 LIVE SITE",
    openingMeter: 1200, closingMeter: 1205, workingHours: 5, workingHoursIncomplete: false,
    startTime: "08:00", endTime: "13:00", multipleTimeSegments: false, clockDuration: 5,
    clockDurationIncomplete: false, dieselIssued: 10, openingTank: 80, closingTank: 70,
    dieselConsumed: 10, expectedDiesel: 10, difference: 0, consumptionRate: 2,
    consumptionRateUnit: "L/hr", consumptionIncomplete: false, events: [],
  },
  {
    key: "plant_usage:vb16-02", date: "2026-10-02", projectSite: "VB16 LIVE SITE",
    openingMeter: 1205, closingMeter: 1211, workingHours: 6, workingHoursIncomplete: false,
    startTime: "08:30", endTime: "14:30", multipleTimeSegments: false, clockDuration: 6,
    clockDurationIncomplete: false, dieselIssued: 13, openingTank: 70, closingTank: 57,
    dieselConsumed: 13, expectedDiesel: 12, difference: 1, consumptionRate: 2.17,
    consumptionRateUnit: "L/hr", consumptionIncomplete: false, events: [],
  },
  {
    key: "plant_usage:vb16-03", date: "2026-10-03", projectSite: "VB16 LIVE SITE",
    openingMeter: 1211, closingMeter: 1215, workingHours: 4, workingHoursIncomplete: false,
    startTime: "09:00", endTime: "13:00", multipleTimeSegments: false, clockDuration: 4,
    clockDurationIncomplete: false, dieselIssued: 8, openingTank: 57, closingTank: 49,
    dieselConsumed: 8, expectedDiesel: 8, difference: 0, consumptionRate: 2,
    consumptionRateUnit: "L/hr", consumptionIncomplete: false, events: [],
  },
];

const vb16MaintenanceRows: FixtureBill[] = [{
  sourceId: 16602, businessDate: "2026-10-02", eventType: "breakdown",
  description: "HYDRAULIC HOSE INSPECTION", downtimeHours: 1,
  fromTime: "14:30", toTime: "15:30", remarks: "REVIEWED",
}];

const vb16SavedBill: FixtureBill = {
  id: 1601, billDate: "2026-10-03", billNo: "VB16-RICH-SAVED", billType: "equipment",
  vendorName: "VB16 DAILY EQUIPMENT", periodFrom: "2026-10-01", periodTo: "2026-10-03",
  status: "approved", totalAmount: 18000, adjustmentAmount: 0, gstRateEquipment: 18,
  tdsRate: 2, netPayableAmount: 21124.8, amountPaid: 0, createdAt: "2026-10-03T12:00:00.000Z",
  notes: "VB16 FIXTURE RICH DAILY ACTIVITY — NOT PRODUCTION EVIDENCE",
  items: [], hireStatements: [{
    id: 16601, equipmentId: 1601, equipmentName: "VB16 DAILY EXCAVATOR",
    vendorName: "VB16 DAILY EQUIPMENT", billingBasis: "monthly", rate: 18000,
    periodFrom: "2026-10-01", periodTo: "2026-10-03", quantity: 1, grossAmount: 18000,
    deductionAmount: 0, netAmount: 18000, status: "approved",
    calculationSnapshot: {
      equipmentId: 1601, equipmentName: "VB16 DAILY EXCAVATOR",
      terms: { billingBasis: "monthly", rate: 18000, dieselResponsibility: "hlc", consumptionNorm: 2 },
      diesel: { consumptionNorm: 2, actualDiesel: 31, expectedDiesel: 30, finalRecoveryAmount: 0 },
      performanceDailyRows: vb16PerformanceDailyRows, dailyRows: vb16PerformanceDailyRows,
      sourceEvidence: { activities: [], maintenance: vb16MaintenanceRows },
      adjustments: { breakdownDeduction: 0, hsdRecovery: 0 },
      financials: {
        grossHire: 18000, breakdownDeduction: 0, hsdRecovery: 0, taxableAmount: 18000,
        gstRate: 18, gstAmount: 3240, invoiceTotal: 21240, tdsRate: 2, tdsAmount: 360,
        netPayable: 20880,
      },
    },
    exceptions: [],
  }],
};

const vb16MaterialBill: FixtureBill = {
  id: 1602, billDate: "2026-10-03", billNo: "VB16-MATERIAL-SAVED", billType: "material",
  vendorName: "VB16 MATERIAL SUPPLIER", periodFrom: "2026-10-01", periodTo: "2026-10-03",
  status: "approved", totalAmount: 5000, gstRateMaterial: 18, tdsRate: 2,
  netPayableAmount: 5800, amountPaid: 0, createdAt: "2026-10-03T12:00:00.000Z",
  items: [{ id: 16021, billId: 1602, date: "2026-10-02", category: "material", description: "VB16 AGGREGATE", qty: 5, unit: "MT", rate: 1000, amount: 5000, source: "manual" }],
};

// VB-17 isolates the monthly-hire recovery/breakdown display contract. Three
// active days produce a 9,000 gross hire line (90,000 / 30 × 3), while the
// tank equation deliberately produces 56 actual versus 24 expected litres:
// 32 L excess × the latest accepted purchase rate of ₹95 = ₹3,040.
const vb17PerformanceDailyRows: FixtureBill[] = [
  {
    key: "plant_usage:vb17-01", date: "2026-11-01", projectSite: "VB17 BREAKDOWN SITE",
    openingMeter: 2000, closingMeter: 2008, workingHours: 8, workingHoursIncomplete: false,
    startTime: "08:00", endTime: "16:00", multipleTimeSegments: false, clockDuration: 8,
    clockDurationIncomplete: false, dieselIssued: 18, openingTank: 100, closingTank: 82,
    dieselConsumed: 18, expectedDiesel: 8, difference: 10, consumptionRate: 2.25,
    consumptionRateUnit: "L/hr", consumptionIncomplete: false, events: [],
  },
  {
    key: "plant_usage:vb17-02", date: "2026-11-02", projectSite: "VB17 BREAKDOWN SITE",
    openingMeter: 2008, closingMeter: 2016, workingHours: 8, workingHoursIncomplete: false,
    startTime: "08:00", endTime: "16:00", multipleTimeSegments: false, clockDuration: 8,
    clockDurationIncomplete: false, dieselIssued: 18, openingTank: 82, closingTank: 64,
    dieselConsumed: 18, expectedDiesel: 8, difference: 10, consumptionRate: 2.25,
    consumptionRateUnit: "L/hr", consumptionIncomplete: false, events: [],
  },
  {
    key: "plant_usage:vb17-03", date: "2026-11-03", projectSite: "VB17 BREAKDOWN SITE",
    openingMeter: 2016, closingMeter: 2024, workingHours: 8, workingHoursIncomplete: false,
    startTime: "08:00", endTime: "16:00", multipleTimeSegments: false, clockDuration: 8,
    clockDurationIncomplete: false, dieselIssued: 20, openingTank: 64, closingTank: 100,
    dieselConsumed: 20, expectedDiesel: 8, difference: 12, consumptionRate: 2.5,
    consumptionRateUnit: "L/hr", consumptionIncomplete: false, events: [],
  },
];
const vb17MaintenanceRows: FixtureBill[] = [{
  id: 17601, sourceId: 17601, equipmentId: 1701, date: "2026-11-02",
  businessDate: "2026-11-02", eventType: "breakdown", description: "VB17 HYDRAULIC BREAKDOWN",
  downtimeHours: 3, fromTime: "10:00", toTime: "13:00", remarks: "VB17 BREAKDOWN EVIDENCE",
}];
const vb17HlcEquipment = {
  id: 1701, name: "VB17 MONTHLY HLC EXCAVATOR", registrationNumber: "VB17-HLC-01",
  ownership: "hired", vendorName: "VB17 HLC HIRE", hireBillingBasis: "monthly",
  hireRate: 90_000, hireStartDate: "2026-11-01", hireEndDate: null,
  consumptionNorm: 1, meterType: "hour_meter", hireDieselResponsibility: "hlc",
  hireBreakdownDeductionEnabled: true, automaticMonthlyBreakdownDeductions: true,
  hireOperatorResponsibility: null, hireAgreementRemarks: "VB17 accepted recovery evidence",
  hireMonthlyDivisorType: "30", hireMonthlyDivisor: null,
};
const vb17VendorEquipment = {
  ...vb17HlcEquipment, id: 1702, name: "VB17 CONTRACTOR DIESEL LOADER",
  registrationNumber: "VB17-VENDOR-02", vendorName: "VB17 VENDOR HIRE",
  hireDieselResponsibility: "vendor", consumptionNorm: 1,
};
const vb17DieselRate: FixtureBill = {
  source: "diesel_rate", sourceId: 17701, businessDate: "2026-11-01", date: "2026-11-01",
  rate: 95, qtyPurchased: 100, purchasedAt: "2026-11-01T12:00:00Z",
};
const vb17HlcActivities: FixtureBill[] = [
  { source: "equipment_default", sourceId: 1701, equipmentId: 1701, businessDate: "2026-11-01", equipment: vb17HlcEquipment },
  ...vb17PerformanceDailyRows.map((row, index) => ({
    source: "plant_usage", sourceId: 17710 + index, equipmentId: 1701, businessDate: row.date,
    occurredAt: `${row.date}T08:00:00Z`, entryType: "hourly", status: "closed",
    hoursOrKmRun: row.workingHours, actualDiesel: row.dieselConsumed, dieselSource: "plant_stock",
    openingDiesel: row.openingTank, closingDiesel: row.closingTank, expectedDiesel: row.expectedDiesel,
    expectedDieselAvailable: true, consumptionNorm: 1, equipmentName: vb17HlcEquipment.name,
    site: row.projectSite, task: "VB17 EXCAVATION",
  })),
  ...vb17MaintenanceRows.map(row => ({
    source: "maintenance", sourceId: row.sourceId, equipmentId: 1701, businessDate: row.businessDate,
    eventType: row.eventType, description: row.description, downtimeHours: row.downtimeHours,
    fromTime: row.fromTime, toTime: row.toTime, remarks: row.remarks, equipment: vb17HlcEquipment,
  })),
  vb17DieselRate,
];
const vb17VendorActivities: FixtureBill[] = [
  { source: "equipment_default", sourceId: 1702, equipmentId: 1702, businessDate: "2026-11-01", equipment: vb17VendorEquipment },
  ...vb17PerformanceDailyRows.map((row, index) => ({
    source: "plant_usage", sourceId: 17720 + index, equipmentId: 1702, businessDate: row.date,
    occurredAt: `${row.date}T08:00:00Z`, entryType: "hourly", status: "closed",
    hoursOrKmRun: row.workingHours, actualDiesel: row.dieselConsumed, dieselSource: "contractor",
    expectedDiesel: row.expectedDiesel, expectedDieselAvailable: true, consumptionNorm: 1,
    equipmentName: vb17VendorEquipment.name, site: row.projectSite, task: "VB17 LOADING",
  })),
];
const vb17PerformanceReport = (equipment: FixtureBill) => ({
  filterOptions: {
    projects: ["VB17 BREAKDOWN SITE"], ownership: ["hired"], owners: [equipment.vendorName],
    equipmentTypes: ["EXCAVATOR"], scopes: [{ value: "plant", label: "Plant" }, { value: "site", label: "Site" }],
    equipment: [{ id: equipment.id, name: equipment.name, registrationNumber: equipment.registrationNumber, ownership: "hired", vendorName: equipment.vendorName, meterType: equipment.meterType }],
  },
  totals: {
    eventCount: 3, linkedCount: 3, confirmedLegacyCount: 0, unclassifiedCount: 0,
    runtimeHours: 24, totalKm: 0, trips: 0, dieselActual: 56, dieselExpected: 24,
    dieselVariance: 32, activeDays: 3, efficiencyPercent: 233.33,
    dieselBasis: "tank_measured", dieselComparedActual: 56, dieselComparisonIncomplete: false,
  },
  reviewRows: [], events: [], projects: ["VB17 BREAKDOWN SITE"],
  fleet: [{
    key: `equipment:${equipment.id}`, equipmentId: equipment.id, machine: equipment.name,
    registrationNumber: equipment.registrationNumber, equipmentType: "EXCAVATOR", ownership: "hired",
    confidence: "linked", usageBasis: "hour_meter", currentLocation: "VB17 BREAKDOWN SITE", currentStatus: "active",
    firstIncludedDate: "2026-11-01", lastUsedDate: "2026-11-03", eventCount: 3, activeDays: 3,
    runtimeHours: 24, totalKm: 0, trips: 0, dieselActual: 56,
    dieselBasis: "tank_measured", dieselComparedActual: 56, dieselComparisonIncomplete: false,
    dieselExpected: 24, dieselVariance: 32, efficiencyPercent: 233.33, dataQualityWarnings: [],
    hired: { hireStartDate: "2026-11-01", usedDays: 3, gapDays: 0, utilizationPercent: 100 },
    ownerVendor: equipment.vendorName, meterUnit: "h", openingMeter: 2000, closingMeter: 2024,
    workingHours: 24, workingHoursIncomplete: false, clockDuration: 24, clockDurationIncomplete: false,
    dieselIssued: 56, openingTank: 100, closingTank: 100, dieselConsumed: 56, expectedDiesel: 24,
    difference: 32, consumptionRate: 2.33, consumptionRateUnit: "L/hr",
    consumptionIncomplete: false, dailyRows: vb17PerformanceDailyRows,
  }],
});
const vb17HistoricalBill: FixtureBill = {
  id: 1703, billDate: "2026-11-03", billNo: "VB17-HISTORICAL",
  billType: "equipment", vendorName: "VB17 HLC HIRE", periodFrom: "2026-11-01", periodTo: "2026-11-03",
  status: "draft", totalAmount: 9000, adjustmentAmount: 0, gstRateEquipment: 18, tdsRate: 2,
  netPayableAmount: 3312.8, amountPaid: 0, createdAt: "2026-11-03T12:00:00.000Z",
  notes: "VB17 HISTORICAL HIRE REGRESSION — NOT PRODUCTION EVIDENCE", items: [],
  hireStatements: [{
    id: 17703, equipmentId: 1701, equipmentName: vb17HlcEquipment.name, vendorName: "VB17 HLC HIRE",
    billingBasis: "monthly", rate: 90_000, periodFrom: "2026-11-01", periodTo: "2026-11-03",
    quantity: 1, grossAmount: 9000, deductionAmount: 3000, netAmount: 2960, status: "draft",
    calculationSnapshot: {
      equipmentId: 1701, equipmentName: vb17HlcEquipment.name,
      terms: { billingBasis: "monthly", rate: 90_000, dieselResponsibility: "hlc", consumptionNorm: 3, hireStartDate: "2026-11-01", breakdownDeductionEnabled: true },
      diesel: { consumptionNorm: 1, actualDiesel: 56, expectedDiesel: 24, suggestedExcess: 32, applicableRate: 95, suggestedRecoveryAmount: 3040, finalRecoveryAmount: 3040, expectedDieselAvailable: true },
      performanceDailyRows: vb17PerformanceDailyRows, dailyRows: vb17PerformanceDailyRows,
      sourceEvidence: { activities: vb17HlcActivities, maintenance: vb17MaintenanceRows },
      adjustments: { breakdownDeduction: 3000, hsdRecovery: 3040 },
      financials: { grossHire: 9000, breakdownDeduction: 3000, hsdRecovery: 3040, taxableAmount: 2960, gstRate: 18, gstAmount: 532.8, invoiceTotal: 3492.8, tdsRate: 2, tdsAmount: 180, netPayable: 3312.8 },
    },
    exceptions: [],
  }],
};

const vb18LegacyBill: FixtureBill = {
  id: 1802, billDate: "2026-12-05", billNo: "VB18-LEGACY-NO-EXTRAS",
  billType: "material", vendorName: "VB18 ORDINARY SUPPLIER",
  periodFrom: "2026-12-01", periodTo: "2026-12-05", status: "approved",
  totalAmount: 2500, adjustmentLabel: "LEGACY ADVANCE", adjustmentAmount: -250,
  additionalAdjustments: [], gstRateMaterial: 0, tdsRate: 0, netPayableAmount: 2250,
  amountPaid: 0, createdAt: "2026-12-05T12:00:00.000Z",
  items: [{
    id: 18021, billId: 1802, date: "2026-12-05", category: "material",
    description: "VB18 LEGACY MATERIAL", qty: 1, unit: "LOT", rate: 2500,
    amount: 2500, source: "manual",
  }],
};

const initialBills = (() => {
  const initialScenario = new URLSearchParams(window.location.search).get("scenario") || "";
  if (initialScenario.startsWith("vb10") || initialScenario === "vb16-draft") return [];
  if (initialScenario === "vb16-saved") return [vb16SavedBill];
  if (initialScenario === "vb16-material") return [vb16MaterialBill];
  if (initialScenario === "vb17-draft" || initialScenario === "vb17-vendor") return [];
  if (initialScenario === "vb17-historical") return [vb17HistoricalBill];
  if (initialScenario === "vb18-new") return [];
  if (initialScenario === "vb18-legacy") return [vb18LegacyBill];
  const injected = (window as Window & {
    __VB09_HISTORICAL_BILLS__?: FixtureBill[];
    __VB09_DEV_BILLS__?: FixtureBill[];
  }).__VB09_HISTORICAL_BILLS__;
  const devBills = (window as Window & { __VB09_DEV_BILLS__?: FixtureBill[] }).__VB09_DEV_BILLS__;
  if (Array.isArray(injected) && injected.length >= 2) return injected;
  return [
    ...(Array.isArray(devBills) ? devBills : []),
    ...representativeHistoricalBills,
    ...nonEquipmentBills,
  ];
})();

const itemByType: Record<string, FixtureBill[]> = {
  equipment: [{
    date: "2026-08-05",
    category: "equipment",
    description: "JCB · 8 HOURS (PLANT) — REAL HIRE ACTIVITY",
    qty: 8,
    unit: "HRS",
    rate: 3500,
    amount: 28000,
    source: "auto:jcb-activity-5001",
    sourceId: 5001,
    equipmentId: 7701,
    siteName: "NARASIMHULU ROAD",
  }],
  material: [{
    date: "2026-08-05",
    category: "material",
    description: "20MM AGGREGATE (SITE)",
    qty: 10,
    unit: "MT",
    rate: 1200,
    amount: 12000,
    source: "auto:material-5002",
    sourceId: 5002,
    siteName: "NARASIMHULU ROAD",
  }],
  transport: [{
    date: "2026-08-06",
    category: "transport",
    description: "TRUCK DISPATCH VIA NARASIMHULU ROAD (SITE)",
    qty: 3,
    unit: "TRIP",
    rate: 2400,
    amount: 7200,
    source: "auto:transport-5003",
    sourceId: 5003,
    leadDistance: 12,
    siteName: "NARASIMHULU ROAD",
  }],
  labour: [{
    date: "2026-08-07",
    category: "labour",
    description: "LABOUR OPERATOR MALE - PLANT",
    qty: 2,
    unit: "HEAD-DAY",
    rate: 900,
    amount: 1800,
    source: "auto:labour-5004",
    sourceId: 5004,
    siteName: "PLANT",
  }],
};

// VB-11 browser evidence uses the same raw auto-item contract as the
// production /api/vendor-bills/auto-items endpoint.  Rates intentionally start
// at zero so the mounted VendorBills component must perform its rate-card
// lookup when a group is pulled.  The mixed supplier has two distinct
// materials and all four billable categories, which makes a broad-category
// grouping regression visible in the DOM.
const vb11MixedAutoItems: FixtureBill[] = [
  { date: "2026-09-01", category: "equipment", description: "EXCAVATOR - DAILY HIRE - EAST ROAD (PLANT)", qty: 8, unit: "HRS", rate: 0, amount: 0, source: "auto", sourceId: 7101, equipmentId: 7701, siteName: "PLANT" },
  { date: "2026-09-02", category: "equipment", description: "EXCAVATOR - DAILY HIRE - EAST ROAD (PLANT)", qty: 6, unit: "HRS", rate: 0, amount: 0, source: "auto", sourceId: 7102, equipmentId: 7701, siteName: "PLANT" },
  { date: "2026-09-03", category: "material", description: "SOIL (SITE)", qty: 12, unit: "MT", rate: 0, amount: 0, source: "auto", sourceId: 7201, siteName: "SITE: NARASIMHULU ROAD" },
  { date: "2026-09-04", category: "material", description: "SOIL (SITE)", qty: 8, unit: "MT", rate: 0, amount: 0, source: "auto", sourceId: 7202, siteName: "SITE: NARASIMHULU ROAD" },
  { date: "2026-09-05", category: "material", description: "SAND (SITE)", qty: 10, unit: "MT", rate: 0, amount: 0, source: "auto", sourceId: 7203, siteName: "SITE: NARASIMHULU ROAD" },
  { date: "2026-09-06", category: "transport", description: "TIPPER TRUCK VIA QUARRY (SITE)", qty: 2, unit: "TRIP", rate: 0, amount: 0, source: "auto", sourceId: 7301, leadDistance: 14, siteName: "SITE: NARASIMHULU ROAD" },
  { date: "2026-09-07", category: "transport", description: "TIPPER TRUCK VIA QUARRY (SITE)", qty: 3, unit: "TRIP", rate: 0, amount: 0, source: "auto", sourceId: 7302, leadDistance: 14, siteName: "SITE: NARASIMHULU ROAD" },
  { date: "2026-09-08", category: "labour", description: "LABOUR OPERATOR MALE - PLANT", qty: 2, unit: "HEAD-DAY", rate: 0, amount: 0, source: "auto", sourceId: 7401, siteName: "PLANT" },
];

const vb11SingleCategoryAutoItems: FixtureBill[] = [
  { date: "2026-09-01", category: "equipment", description: "ROLLER - DAILY HIRE - SOLO (PLANT)", qty: 7, unit: "HRS", rate: 0, amount: 0, source: "auto", sourceId: 7501, equipmentId: 7702, siteName: "PLANT" },
];

const vb11RateCards: FixtureBill[] = [
  { itemKey: "EQ_EXCAVATOR_HRS", category: "equipment", rate: 3500 },
  { itemKey: "MAT_SOIL_MT", category: "material", rate: 1250 },
  { itemKey: "MAT_SAND_MT", category: "material", rate: 900 },
  { itemKey: "EQ_QUARRY_TRIP", category: "transport", rate: 2400 },
  { itemKey: "LAB_OPERATOR_MALE", category: "labour", rate: 800 },
  { itemKey: "EQ_ROLLER_HRS", category: "equipment", rate: 2800 },
];

const vb10EquipmentMasters: FixtureBill[] = [
  {
    id: 1001, name: "MONTHLY HLC EXCAVATOR", registrationNumber: "VB10-M-01",
    ownership: "hired", vendorName: "VB10 EQUIPMENT HIRE",
    hireBillingBasis: "monthly", hireRate: 90_000, hireMonthlyDivisorType: "30",
    hireMonthlyDivisor: null, hireStartDate: "2026-05-01", hireEndDate: null,
    consumptionNorm: 2.5, meterType: "hour_meter", hireDieselResponsibility: "hlc",
    hireBreakdownDeductionEnabled: true, hireOperatorResponsibility: null, hireAgreementRemarks: null,
  },
  {
    id: 1002, name: "HOURLY CONTRACTOR LOADER", registrationNumber: "VB10-H-02",
    ownership: "hired", vendorName: "VB10 EQUIPMENT HIRE",
    hireBillingBasis: "hourly", hireRate: 1_500, hireStartDate: "2026-05-01",
    hireEndDate: null, consumptionNorm: 1.5, meterType: "hour_meter",
    hireDieselResponsibility: "vendor", hireBreakdownDeductionEnabled: false,
    hireOperatorResponsibility: null, hireAgreementRemarks: null,
  },
  {
    id: 1003, name: "MIDMONTH MONTHLY CRANE", registrationNumber: "VB10-M-03",
    ownership: "hired", vendorName: "VB10 EQUIPMENT HIRE",
    hireBillingBasis: "monthly", hireRate: 60_000, hireMonthlyDivisorType: "30",
    hireMonthlyDivisor: null, hireStartDate: "2026-05-15", hireEndDate: null,
    consumptionNorm: 2, meterType: "hour_meter", hireDieselResponsibility: "vendor",
    hireBreakdownDeductionEnabled: true, hireOperatorResponsibility: null, hireAgreementRemarks: null,
  },
  {
    id: 1004, name: "ZERO ACTIVITY MONTHLY ROLLER", registrationNumber: "VB10-M-04",
    ownership: "hired", vendorName: "VB10 EQUIPMENT HIRE",
    hireBillingBasis: "monthly", hireRate: 30_000, hireMonthlyDivisorType: "30",
    hireMonthlyDivisor: null, hireStartDate: "2026-05-01", hireEndDate: null,
    consumptionNorm: 1.2, meterType: "hour_meter", hireDieselResponsibility: "vendor",
    hireBreakdownDeductionEnabled: true, hireOperatorResponsibility: null, hireAgreementRemarks: null,
  },
];

const vb10HireActivities: FixtureBill[] = [
  // Three plant-stock records reconcile to opening + issues - closing:
  // 100 L + 55 L - 100 L = 55 L actual against 20 h × 2.5 = 50 L expected.
  { source: "plant_usage", sourceId: 1101, equipmentId: 1001, businessDate: "2026-05-05", occurredAt: "2026-05-05T08:00:00Z", entryType: "hourly", status: "closed", hoursOrKmRun: 8, actualDiesel: 20, dieselSource: "plant_stock", openingDiesel: 100, closingDiesel: 90, expectedDiesel: 20, expectedDieselAvailable: true, consumptionNorm: 2.5, equipmentName: "MONTHLY HLC EXCAVATOR", site: "VB10 ROAD", task: "EXCAVATION" },
  { source: "plant_usage", sourceId: 1102, equipmentId: 1001, businessDate: "2026-05-10", occurredAt: "2026-05-10T08:00:00Z", entryType: "hourly", status: "closed", hoursOrKmRun: 4, actualDiesel: 15, dieselSource: "plant_stock", openingDiesel: 90, closingDiesel: 75, expectedDiesel: 10, expectedDieselAvailable: true, consumptionNorm: 2.5, equipmentName: "MONTHLY HLC EXCAVATOR", site: "VB10 ROAD", task: "EXCAVATION" },
  { source: "plant_usage", sourceId: 1103, equipmentId: 1001, businessDate: "2026-05-15", occurredAt: "2026-05-15T08:00:00Z", entryType: "hourly", status: "closed", hoursOrKmRun: 8, actualDiesel: 20, dieselSource: "plant_stock", openingDiesel: 75, closingDiesel: 100, expectedDiesel: 20, expectedDieselAvailable: true, consumptionNorm: 2.5, equipmentName: "MONTHLY HLC EXCAVATOR", site: "VB10 ROAD", task: "EXCAVATION" },
  { source: "plant_usage", sourceId: 1201, equipmentId: 1002, businessDate: "2026-05-05", occurredAt: "2026-05-05T09:00:00Z", entryType: "hourly", status: "closed", hoursOrKmRun: 8, actualDiesel: 12, dieselSource: "contractor", expectedDiesel: 12, expectedDieselAvailable: true, consumptionNorm: 1.5, equipmentName: "HOURLY CONTRACTOR LOADER", site: "VB10 ROAD", task: "LOADING" },
  { source: "plant_usage", sourceId: 1301, equipmentId: 1003, businessDate: "2026-05-20", occurredAt: "2026-05-20T09:00:00Z", entryType: "monthly", status: "closed", hoursOrKmRun: 5, actualDiesel: 10, dieselSource: "contractor", expectedDiesel: 10, expectedDieselAvailable: true, consumptionNorm: 2, equipmentName: "MIDMONTH MONTHLY CRANE", site: "VB10 ROAD", task: "LIFTING" },
  // A mirrored DPR row proves that the fixture has an explicit source link and
  // should still be counted once by normalizeHireActivities.
  { source: "dpr_log", sourceId: 1401, equipmentId: 1001, businessDate: "2026-05-10", occurredAt: "2026-05-10T08:00:00Z", entryType: "hourly", status: "closed", hoursOrKmRun: 4, plantUsageId: 1102, actualDiesel: 15, dieselSource: "plant_stock", expectedDiesel: 10, expectedDieselAvailable: true, consumptionNorm: 2.5, equipmentName: "MONTHLY HLC EXCAVATOR", site: "VB10 ROAD", task: "EXCAVATION" },
  { source: "diesel_rate", sourceId: 1501, businessDate: "2026-05-01", date: "2026-05-01", rate: 95, qtyPurchased: 100, purchasedAt: "2026-05-01T12:00:00Z" },
  { source: "diesel_rate", sourceId: 1502, businessDate: "2026-05-10", date: "2026-05-10", rate: 105, qtyPurchased: 50, purchasedAt: "2026-05-10T12:00:00Z" },
];

const vb10Maintenance: FixtureBill[] = [
  { id: 1601, equipmentId: 1001, date: "2026-05-04", eventType: "breakdown", description: "HYDRAULIC HOSE", downtimeHours: 10 },
  { id: 1602, equipmentId: 1001, date: "2026-05-11", eventType: "breakdown", description: "TRACK REPAIR", downtimeHours: 11 },
  // A second maintenance row on the same outage date must remain evidence
  // without creating a second monthly availability deduction.
  { id: 1604, equipmentId: 1001, date: "2026-05-11", eventType: "breakdown", description: "TRACK REPAIR FOLLOW-UP", downtimeHours: 1 },
  { id: 1603, equipmentId: 1001, date: "2026-05-20", eventType: "breakdown", description: "BUCKET REPAIR", downtimeHours: 10 },
];

// The generic auto-items endpoint returns activity-priced candidates without
// a rate.  The mounted form maps source + sourceId to its stable auto-line
// identity and the Equipment Master hire groups supply the monthly amounts.
// Monthly activity is deliberately absent: storage excludes it from this
// endpoint because monthly availability is represented by a generated group.
const vb10AutoItems: FixtureBill[] = [{
  date: "2026-05-05", category: "equipment",
  description: "HOURLY CONTRACTOR LOADER - LOADING (PLANT) - HOURLY HIRE | 8 HRS | DIESEL: 12L",
  qty: 8, unit: "HRS", source: "auto", sourceId: "plant_usage:1201",
  equipmentId: 1002, siteName: "PLANT",
}];

// /api/reports/equipment-performance returns a complete report envelope. The
// mounted bill editor currently consumes fleet.dailyRows, but retaining the
// real envelope prevents the fixture from accepting a partial invented API.
const vb10PerformanceDailyRows = [
  { key: "plant_usage:1101", date: "2026-05-05", projectSite: "VB10 ROAD", openingMeter: null, closingMeter: null, workingHours: 8, workingHoursIncomplete: false, startTime: null, endTime: null, multipleTimeSegments: false, clockDuration: null, clockDurationIncomplete: true, dieselIssued: 20, openingTank: 100, closingTank: 90, dieselConsumed: 20, expectedDiesel: 20, difference: 0, consumptionRate: 2.5, consumptionRateUnit: "L/hr", consumptionIncomplete: false, events: [] },
  { key: "plant_usage:1102", date: "2026-05-10", projectSite: "VB10 ROAD", openingMeter: null, closingMeter: null, workingHours: 4, workingHoursIncomplete: false, startTime: null, endTime: null, multipleTimeSegments: false, clockDuration: null, clockDurationIncomplete: true, dieselIssued: 15, openingTank: 90, closingTank: 75, dieselConsumed: 15, expectedDiesel: 10, difference: 5, consumptionRate: 3.75, consumptionRateUnit: "L/hr", consumptionIncomplete: false, events: [] },
  { key: "plant_usage:1103", date: "2026-05-15", projectSite: "VB10 ROAD", openingMeter: null, closingMeter: null, workingHours: 8, workingHoursIncomplete: false, startTime: null, endTime: null, multipleTimeSegments: false, clockDuration: null, clockDurationIncomplete: true, dieselIssued: 20, openingTank: 75, closingTank: 100, dieselConsumed: 20, expectedDiesel: 20, difference: 0, consumptionRate: 2.5, consumptionRateUnit: "L/hr", consumptionIncomplete: false, events: [] },
];

const vb10PerformanceReport = () => {
  const fleet = vb10EquipmentMasters.map(equipment => {
    const usage = vb10HireActivities.filter(row => row.source === "plant_usage" && Number(row.equipmentId) === Number(equipment.id));
    const runtimeHours = usage.reduce((sum, row) => sum + Number(row.hoursOrKmRun || 0), 0);
    const dieselActual = usage.reduce((sum, row) => sum + Number(row.actualDiesel || 0), 0);
    const dieselExpected = usage.reduce((sum, row) => sum + Number(row.expectedDiesel || 0), 0);
    const isHlc = Number(equipment.id) === 1001;
    return {
      key: `equipment:${equipment.id}`, equipmentId: equipment.id, machine: equipment.name,
      registrationNumber: equipment.registrationNumber, equipmentType: null, ownership: "hired",
      confidence: "linked", usageBasis: "hour_meter", currentLocation: "VB10 ROAD", currentStatus: "active",
      firstIncludedDate: "2026-05-01", lastUsedDate: usage.length ? usage[usage.length - 1]?.businessDate || "2026-05-01" : "2026-05-01",
      eventCount: usage.length, activeDays: new Set(usage.map(row => row.businessDate)).size, runtimeHours,
      totalKm: 0, trips: 0, dieselActual: usage.length ? dieselActual : 0, dieselBasis: isHlc ? "tank_measured" : "issued_only",
      dieselComparedActual: usage.length ? dieselActual : 0, dieselComparisonIncomplete: false,
      dieselExpected: usage.length ? dieselExpected : 0, dieselVariance: usage.length ? dieselActual - dieselExpected : 0,
      efficiencyPercent: dieselExpected > 0 ? dieselActual / dieselExpected * 100 : null, dataQualityWarnings: [],
      hired: { hireStartDate: equipment.hireStartDate, hireEndDate: equipment.hireEndDate, elapsedDays: 31, usedDays: usage.length ? new Set(usage.map(row => row.businessDate)).size : 0, gapDays: 31 - new Set(usage.map(row => row.businessDate)).size, utilizationPercent: usage.length ? new Set(usage.map(row => row.businessDate)).size / 31 * 100 : 0 },
      ownerVendor: "VB10 EQUIPMENT HIRE", meterUnit: "h", openingMeter: null, closingMeter: null,
      workingHours: runtimeHours, workingHoursIncomplete: false, clockDuration: null, clockDurationIncomplete: true,
      dieselIssued: usage.length ? dieselActual : 0, openingTank: isHlc ? 100 : null, closingTank: isHlc ? 100 : null,
      dieselConsumed: usage.length ? dieselActual : 0, expectedDiesel: usage.length ? dieselExpected : 0,
      difference: usage.length ? dieselActual - dieselExpected : 0, consumptionRate: runtimeHours > 0 ? dieselActual / runtimeHours : null,
      consumptionRateUnit: "L/hr", consumptionIncomplete: false,
      dailyRows: isHlc ? vb10PerformanceDailyRows : [],
    };
  });
  return {
    filterOptions: {
      projects: [], ownership: ["hired"], owners: ["VB10 EQUIPMENT HIRE"], equipmentTypes: [],
      equipment: vb10EquipmentMasters.map(equipment => ({
        id: equipment.id, name: equipment.name, registrationNumber: equipment.registrationNumber,
        ownership: "hired", vendorName: equipment.vendorName, meterType: equipment.meterType,
      })),
      scopes: [{ value: "plant", label: "Plant" }, { value: "site", label: "Site" }],
    },
    totals: {
      eventCount: vb10HireActivities.filter(row => row.source === "plant_usage").length,
      linkedCount: vb10HireActivities.filter(row => row.source === "plant_usage").length,
      confirmedLegacyCount: 0, unclassifiedCount: 0, runtimeHours: fleet.reduce((sum, row) => sum + row.runtimeHours, 0),
      totalKm: 0, trips: 0, dieselActual: fleet.reduce((sum, row) => sum + Number(row.dieselActual || 0), 0),
      dieselExpected: fleet.reduce((sum, row) => sum + Number(row.dieselExpected || 0), 0),
      dieselVariance: fleet.reduce((sum, row) => sum + Number(row.dieselVariance || 0), 0),
      activeDays: new Set(vb10HireActivities.filter(row => row.source === "plant_usage").map(row => row.businessDate)).size,
      efficiencyPercent: null, dieselBasis: "mixed", dieselComparedActual: fleet.reduce((sum, row) => sum + Number(row.dieselComparedActual || 0), 0),
      dieselComparisonIncomplete: false,
    },
    reviewRows: [], events: [], fleet, projects: [],
  };
};

const scenarioName = () => new URLSearchParams(window.location.search).get("scenario") || "";
const vb10Scenario = () => scenarioName().startsWith("vb10");
const vb10NoPriceScenario = () => scenarioName() === "vb10-no-price";
const vb11MixedScenario = () => scenarioName().startsWith("vb11fix");
const vb11SingleCategoryScenario = () => scenarioName() === "singlecategory";
const vb11Scenario = () => vb11MixedScenario() || vb11SingleCategoryScenario();
// VB-14 reuses the proven VB-11 mixed candidate shape, but gives the
// duplicate endpoint a deterministic approved/paid subset.  Keep this behind
// its own scenario so the earlier VB-11 verifier continues to exercise the
// old "flag every first item" response contract unchanged.
const vb14Scenario = () => scenarioName().startsWith("vb14");
const vb14CleanScenario = () => scenarioName() === "vb14-clean";
const vb14DuplicateFailureScenario = () => scenarioName() === "vb14-duplicate-failure";
const vb14VendorName = () => vb14CleanScenario() ? "VB14 CLEAN SUPPLIER" : "VB14 MIXED SUPPLIER";

// VB-15 keeps the browser contract separate from VB-14.  The JCB case carries
// an explicit raw DPR→Plant mirror link so the fixture can show exactly what a
// fixed backend response would contain, while the verifier reports that this
// remains fixture evidence rather than proof of the production storage query.
const vb15Part1RawActivities: FixtureBill[] = [
  {
    source: "dpr_log", sourceId: 917, plantUsageId: 228, equipmentId: 45,
    businessDate: "2026-08-31", occurredAt: "2026-08-31T09:00:00Z",
    hoursOrKmRun: 5.4, actualDiesel: 10, site: "BODAPALLY SITE",
    equipmentName: "JCB VISWANATH BODAPALLY", entryType: "hourly",
  },
  {
    source: "plant_usage", sourceId: 228, plantUsageId: null, equipmentId: 45,
    businessDate: "2026-08-31", occurredAt: "2026-08-31T09:00:00Z",
    hoursOrKmRun: 5.4, actualDiesel: 10, site: "BODAPALLY PLANT",
    equipmentName: "JCB VISWANATH BODAPALLY", entryType: "hourly",
  },
  {
    source: "plant_usage", sourceId: 81503, plantUsageId: null, equipmentId: 45,
    businessDate: "2026-09-01", occurredAt: "2026-09-01T08:00:00Z",
    hoursOrKmRun: 2, actualDiesel: 4, site: "INDEPENDENT PLANT",
    equipmentName: "JCB VISWANATH BODAPALLY", entryType: "hourly",
  },
  {
    source: "dpr_log", sourceId: 81504, plantUsageId: null, equipmentId: 45,
    businessDate: "2026-09-02", occurredAt: "2026-09-02T08:00:00Z",
    hoursOrKmRun: 3, actualDiesel: 5, site: "INDEPENDENT SITE",
    equipmentName: "JCB VISWANATH BODAPALLY", entryType: "hourly",
  },
];

const vb15Part1AutoItems: FixtureBill[] = [
  {
    date: "2026-08-31", category: "equipment",
    description: "JCB VISWANATH BODAPALLY - DAILY HIRE - BODAPALLY SITE (SITE) | 5.4 HRS | DIESEL: 10L",
    qty: 5.4, unit: "HRS", rate: 0, amount: 0, source: "auto", sourceId: 917,
    equipmentId: 45, siteName: "SITE: BODAPALLY SITE",
  },
  {
    date: "2026-09-01", category: "equipment",
    description: "JCB VISWANATH BODAPALLY - DAILY HIRE - INDEPENDENT PLANT (PLANT) | 2 HRS | DIESEL: 4L",
    qty: 2, unit: "HRS", rate: 0, amount: 0, source: "auto", sourceId: 81503,
    equipmentId: 45, siteName: "PLANT: INDEPENDENT PLANT",
  },
  {
    date: "2026-09-02", category: "equipment",
    description: "JCB VISWANATH BODAPALLY - DAILY HIRE - INDEPENDENT SITE (SITE) | 3 HRS | DIESEL: 5L",
    qty: 3, unit: "HRS", rate: 0, amount: 0, source: "auto", sourceId: 81504,
    equipmentId: 45, siteName: "SITE: INDEPENDENT SITE",
  },
];

const vb15OtherPlantAutoItems: FixtureBill[] = [
  {
    date: "2026-07-12", category: "equipment",
    description: "WHEEL LOADER - DAILY HIRE - OTHER PLANT (PLANT) | 4 HRS",
    qty: 4, unit: "HRS", rate: 0, amount: 0, source: "auto", sourceId: 81601,
    equipmentId: 8160, siteName: "PLANT: OTHER PERIOD",
  },
  {
    date: "2026-07-13", category: "equipment",
    description: "WHEEL LOADER - DAILY HIRE - OTHER PLANT (PLANT) | 3 HRS",
    qty: 3, unit: "HRS", rate: 0, amount: 0, source: "auto", sourceId: 81602,
    equipmentId: 8160, siteName: "PLANT: OTHER PERIOD",
  },
];

const vb15OtherSiteAutoItems: FixtureBill[] = [
  {
    date: "2026-07-21", category: "equipment",
    description: "BACKHOE OTHER SITE (SITE) | 6 HRS",
    qty: 6, unit: "HRS", rate: 0, amount: 0, source: "auto", sourceId: 81701,
    equipmentId: 8170, siteName: "SITE: OTHER PERIOD",
  },
];

const vb15Scenario = () => scenarioName().startsWith("vb15");
const vb15CleanScenario = () => scenarioName() === "vb15-clean";
const vb15Part1Scenario = () => scenarioName() === "vb15-part1-jcb";
const vb15OtherPlantScenario = () => scenarioName() === "vb15-other-plant";
const vb15OtherSiteScenario = () => scenarioName() === "vb15-other-site";
const vb15VendorName = () => {
  if (vb15Part1Scenario()) return "JCB VISWANATH BODAPALLY";
  if (vb15OtherPlantScenario()) return "VB15 OTHER PLANT VENDOR";
  if (vb15OtherSiteScenario()) return "VB15 OTHER SITE VENDOR";
  return vb15CleanScenario() ? "VB15 CLEAN SUPPLIER" : "VB15 MIXED SUPPLIER";
};
const vb15AutoItems = () => {
  if (vb15Part1Scenario()) return vb15Part1AutoItems;
  if (vb15OtherPlantScenario()) return vb15OtherPlantAutoItems;
  if (vb15OtherSiteScenario()) return vb15OtherSiteAutoItems;
  return vb11MixedAutoItems;
};
const vb15RawActivities = () => vb15Part1Scenario() ? vb15Part1RawActivities : vb15AutoItems();
const vb15Rates = [
  { itemKey: "EQ_JCB_VISWANATH_BODAPALLY_HRS", category: "equipment", rate: 3500 },
  { itemKey: "EQ_WHEEL_LOADER_OTHER_PLANT_HRS", category: "equipment", rate: 2800 },
  { itemKey: "EQ_BACKHOE_OTHER_SITE_HRS", category: "equipment", rate: 2400 },
  ...vb11RateCards,
];

const vb16Scenario = () => scenarioName().startsWith("vb16");
const vb16DraftScenario = () => scenarioName() === "vb16-draft";
const vb16SavedScenario = () => scenarioName() === "vb16-saved";
const vb16MaterialScenario = () => scenarioName() === "vb16-material";
const vb16VendorName = () => vb16MaterialScenario() ? "VB16 MATERIAL SUPPLIER" : "VB16 DAILY EQUIPMENT";
const vb16Equipment = {
  id: 1601, name: "VB16 DAILY EXCAVATOR", registrationNumber: "VB16-EX-01",
  ownership: "hired", vendorName: "VB16 DAILY EQUIPMENT", hireBillingBasis: "monthly",
  hireRate: 18000, hireStartDate: "2026-10-01", hireEndDate: null,
  consumptionNorm: 2, meterType: "hour_meter", hireDieselResponsibility: "hlc",
  hireBreakdownDeductionEnabled: true, hireOperatorResponsibility: null,
  hireAgreementRemarks: "VB16 fixture live daily activity",
  hireMonthlyDivisorType: "30", hireMonthlyDivisor: null,
};
const vb16HireActivities: FixtureBill[] = [
  {
    source: "equipment_default", sourceId: 1601, equipmentId: 1601,
    businessDate: "2026-10-01", equipment: vb16Equipment,
  },
  ...vb16PerformanceDailyRows.map(row => ({
    source: "plant_usage", sourceId: Number(String(row.key).split(":").pop()?.split("-").pop() || 0) + 16600,
    equipmentId: 1601, businessDate: row.date, occurredAt: `${row.date}T09:00:00Z`,
    entryType: "hourly", status: "closed", hoursOrKmRun: row.workingHours,
    actualDiesel: row.dieselConsumed, dieselSource: "plant_stock",
    openingDiesel: row.openingTank, closingDiesel: row.closingTank,
    expectedDiesel: row.expectedDiesel, expectedDieselAvailable: true,
    consumptionNorm: 2, equipmentName: vb16Equipment.name, site: row.projectSite, task: "EXCAVATION",
  })),
  ...vb16MaintenanceRows.map(row => ({
    source: "maintenance", sourceId: row.sourceId, equipmentId: 1601,
    businessDate: row.businessDate, eventType: row.eventType, description: row.description,
    downtimeHours: row.downtimeHours, fromTime: row.fromTime, toTime: row.toTime,
    remarks: row.remarks, equipment: vb16Equipment,
  })),
];
const vb16PerformanceReport = () => ({
  filterOptions: {
    projects: ["VB16 LIVE SITE"], ownership: ["hired"], owners: ["VB16 DAILY EQUIPMENT"],
    equipmentTypes: ["EXCAVATOR"], scopes: [{ value: "plant", label: "Plant" }, { value: "site", label: "Site" }],
    equipment: [{ id: vb16Equipment.id, name: vb16Equipment.name, registrationNumber: vb16Equipment.registrationNumber, ownership: "hired", vendorName: vb16Equipment.vendorName, meterType: vb16Equipment.meterType }],
  },
  totals: {
    eventCount: 3, linkedCount: 3, confirmedLegacyCount: 0, unclassifiedCount: 0,
    runtimeHours: 15, totalKm: 0, trips: 0, dieselActual: 31, dieselExpected: 30,
    dieselVariance: 1, activeDays: 3, efficiencyPercent: 103.33, dieselBasis: "tank_measured",
    dieselComparedActual: 31, dieselComparisonIncomplete: false,
  },
  reviewRows: [], events: [], projects: ["VB16 LIVE SITE"],
  fleet: [{
    key: "equipment:1601", equipmentId: 1601, machine: vb16Equipment.name,
    registrationNumber: vb16Equipment.registrationNumber, equipmentType: "EXCAVATOR",
    ownership: "hired", confidence: "linked", usageBasis: "hour_meter",
    currentLocation: "VB16 LIVE SITE", currentStatus: "active",
    firstIncludedDate: "2026-10-01", lastUsedDate: "2026-10-03",
    eventCount: 3, activeDays: 3, runtimeHours: 15, totalKm: 0, trips: 0,
    dieselActual: 31, dieselBasis: "tank_measured", dieselComparedActual: 31,
    dieselComparisonIncomplete: false, dieselExpected: 30, dieselVariance: 1,
    efficiencyPercent: 103.33, dataQualityWarnings: [],
    hired: { hireStartDate: "2026-10-01", usedDays: 3, gapDays: 0, utilizationPercent: 100 },
    ownerVendor: "VB16 DAILY EQUIPMENT", meterUnit: "h",
    openingMeter: 1200, closingMeter: 1215, workingHours: 15, workingHoursIncomplete: false,
    clockDuration: 15, clockDurationIncomplete: false, dieselIssued: 31,
    openingTank: 80, closingTank: 49, dieselConsumed: 31, expectedDiesel: 30,
    difference: 1, consumptionRate: 2.07, consumptionRateUnit: "L/hr",
    consumptionIncomplete: false, dailyRows: vb16PerformanceDailyRows,
  }],
});

const vb17Scenario = () => scenarioName().startsWith("vb17");
const vb17DraftScenario = () => scenarioName() === "vb17-draft";
const vb17VendorScenario = () => scenarioName() === "vb17-vendor";
const vb17HistoricalScenario = () => scenarioName() === "vb17-historical";
const vb17VendorName = () => vb17VendorScenario() ? "VB17 VENDOR HIRE" : "VB17 HLC HIRE";
const vb17Equipment = () => vb17VendorScenario() ? vb17VendorEquipment : vb17HlcEquipment;
const vb17Activities = () => vb17VendorScenario() ? vb17VendorActivities : vb17HlcActivities;

// VB-18 is an isolated adjustment fixture.  It deliberately uses an hourly
// equipment activity (rather than a persisted hire statement) so the browser
// exercises the ordinary Vendor Bills adjustment editor and its contractor
// diesel auto-suggestion.  All records are synthetic and never reach storage.
const vb18Scenario = () => scenarioName().startsWith("vb18");
const vb18VendorName = "VB18 DIESEL CONTRACTOR";
const vb18Equipment = {
  id: 1801, name: "VB18 DIESEL LOADER", registrationNumber: "VB18-D-01",
  ownership: "hired", vendorName: vb18VendorName, hireBillingBasis: "hourly",
  hireRate: 5000, hireStartDate: "2026-12-01", hireEndDate: null,
  consumptionNorm: 1.5, meterType: "hour_meter", hireDieselResponsibility: "vendor",
  hireBreakdownDeductionEnabled: false, hireOperatorResponsibility: null,
  hireAgreementRemarks: "VB18 isolated adjustment fixture",
};
const vb18AutoItems: FixtureBill[] = [{
  date: "2026-12-05", category: "equipment",
  description: "VB18 DIESEL LOADER - HOURLY HIRE (PLANT) | 2 HRS",
  qty: 2, unit: "HRS", rate: 5000, amount: 10000, source: "auto",
  sourceId: 18001, equipmentId: 1801, siteName: "PLANT",
}];
const vb18HireActivities: FixtureBill[] = [
  { source: "equipment_default", sourceId: 1801, equipmentId: 1801, businessDate: "2026-12-01", equipment: vb18Equipment },
  {
    source: "plant_usage", sourceId: 18002, equipmentId: 1801, businessDate: "2026-12-05",
    occurredAt: "2026-12-05T08:00:00Z", entryType: "hourly", status: "closed",
    hoursOrKmRun: 10, actualDiesel: 10, dieselSource: "contractor",
    expectedDiesel: 15, expectedDieselAvailable: true, consumptionNorm: 1.5,
    equipmentName: vb18Equipment.name, site: "VB18 ROAD", task: "LOADING",
  },
  { source: "diesel_rate", sourceId: 18003, businessDate: "2026-12-01", date: "2026-12-01", rate: 100, qtyPurchased: 100, purchasedAt: "2026-12-01T12:00:00Z" },
];

function vb10SnapshotForGroup(group: any, status = "draft", billPayload: any = {}): any {
  const equipment = vb10EquipmentMasters.find(row => Number(row.id) === Number(group.equipmentId));
  const isHlc = Number(group.equipmentId) === 1001;
  const activities = vb10HireActivities.filter(row =>
    row.source !== "diesel_rate" && Number(row.equipmentId) === Number(group.equipmentId));
  const maintenance = vb10Maintenance.filter(row => Number(row.equipmentId) === Number(group.equipmentId))
    .map(row => ({ id: row.id, date: row.date, eventType: row.eventType, description: row.description, downtimeHours: row.downtimeHours }));
  const dieselPurchases = vb10NoPriceScenario() ? [] : vb10HireActivities
    .filter(row => row.source === "diesel_rate")
    .map(row => ({ id: Number(row.sourceId), date: row.date || row.businessDate, rate: Number(row.rate), qtyPurchased: Number(row.qtyPurchased), purchasedAt: row.purchasedAt }));
  const authoritativeDieselPeriod = isHlc ? {
    actualDiesel: 55, expectedDiesel: 50, difference: 5, reliable: true, dailyRows: [],
  } : undefined;
  const terms = {
    billingBasis: group.basis, rate: Number(equipment?.hireRate || group.rate),
    hireStartDate: equipment?.hireStartDate, hireEndDate: equipment?.hireEndDate,
    monthlyDivisorType: equipment?.hireMonthlyDivisorType || "30", monthlyDivisor: equipment?.hireMonthlyDivisor,
    dieselResponsibility: equipment?.hireDieselResponsibility, meterType: equipment?.meterType,
    consumptionNorm: equipment?.consumptionNorm,
    consumptionRateUnit: equipment?.meterType === "odometer" ? "L/km" : "L/hr",
    breakdownDeductionEnabled: !!equipment?.hireBreakdownDeductionEnabled,
    automaticMonthlyBreakdownDeductions: true,
    breakdownHoursPerDay: group.breakdownHoursPerDay,
    breakdownGraceDays: group.breakdownGraceDays ?? 0,
  };
  const calc = calculateHireGroup({
    terms, periodFrom: group.periodFrom, periodTo: group.periodTo, activities, maintenance,
    dailyDecisions: group.dailyDecisions || [], tripDecisions: group.tripDecisions || [],
    exceptionDecisions: group.exceptionDecisions || [], quantityOverride: group.quantityOverride,
    grossAmountOverride: group.grossAmountOverride, dieselNormOverride: equipment?.consumptionNorm,
    dieselNormBasisOverride: terms.consumptionRateUnit, dieselPurchases, authoritativeDieselPeriod,
    dieselRecovery: group.dieselRecoveryDecision
      ? { decision: group.dieselRecoveryDecision, finalAmount: group.dieselRecoveryFinalAmount, remarks: group.dieselRecoveryRemarks }
      : undefined,
  });
  const adjustments = group.adjustments || {};
  const otherDebit = Number(adjustments.otherDebit || 0);
  const advanceAdjustment = Number(adjustments.advanceAdjustment || 0);
  const otherCredit = Number(adjustments.otherCredit || 0);
  const deduction = calc.deductionAmount + calc.diesel.finalRecoveryAmount + otherDebit + advanceAdjustment - otherCredit;
  const financials = calculateEquipmentHireFinancials({
    grossHire: calc.grossAmount, breakdownDeduction: calc.deductionAmount,
    hsdRecovery: calc.diesel.finalRecoveryAmount, otherDebit, advanceAdjustment, otherCredit,
    gstRate: Number(billPayload.gstRateEquipment || 0), tdsRate: Number(billPayload.tdsRate || 0), paid: 0,
  });
  const exceptions = calc.exceptions;
  return {
    id: Number(group.equipmentId) + 70000,
    equipmentId: Number(group.equipmentId), equipmentName: equipment?.name, vendorName: "VB10 EQUIPMENT HIRE",
    billingBasis: group.basis, rate: Number(equipment?.hireRate || group.rate),
    monthlyDivisorType: terms.monthlyDivisorType, monthlyDivisor: terms.monthlyDivisor,
    hireStartDate: terms.hireStartDate, hireEndDate: terms.hireEndDate,
    dieselResponsibility: terms.dieselResponsibility, operatorResponsibility: equipment?.hireOperatorResponsibility,
    agreementRemarks: equipment?.hireAgreementRemarks, periodFrom: group.periodFrom, periodTo: group.periodTo,
    quantity: calc.quantity, grossAmount: calc.grossAmount, deductionAmount: deduction,
    netAmount: financials.taxableAmount, status,
    calculationSnapshot: {
      billingIntegration: "vb10_automatic", equipmentId: Number(group.equipmentId), equipmentName: equipment?.name,
      terms, ...calc, performanceDailyRows: authoritativeDieselPeriod?.dailyRows || [],
      dailyDecisions: group.dailyDecisions || [], tripDecisions: group.tripDecisions || [],
      exceptionDecisions: group.exceptionDecisions || [],
      dieselRecoveryDecision: group.dieselRecoveryDecision, dieselRecoveryFinalAmount: calc.diesel.finalRecoveryAmount,
      dieselRecoveryRemarks: group.dieselRecoveryRemarks, breakdownGraceDays: group.breakdownGraceDays ?? 0,
      projectSite: group.projectSite ?? null,
      exceptions,
      sourceEvidence: { activities, maintenance },
      adjustments: {
        breakdownDeduction: calc.deductionAmount, hsdRecovery: calc.diesel.finalRecoveryAmount,
        hsdRecoveryReason: group.dieselRecoveryRemarks || null, otherDebit,
        otherDebitReason: adjustments.otherDebitReason || null, advanceAdjustment,
        advanceAdjustmentReason: adjustments.advanceAdjustmentReason || null, otherCredit,
        otherCreditReason: adjustments.otherCreditReason || null,
      },
      financials,
    },
    exceptions,
  };
}

const fixtureState = {
  requests: [] as Array<{ method: string; path: string }>,
  createdPayloads: [] as any[],
  createdSnapshots: [] as any[],
  updatedPayloads: [] as any[],
  updatedSnapshots: [] as any[],
  statusPayloads: [] as Array<{ id: number; payload: any }>,
  downloadClicks: [] as string[],
  downloadFiles: [] as Array<{ name: string; bytes: number; type: string; signature: string }>,
  downloadBodies: [] as Array<{ name: string; type: string; base64: string }>,
  printDocuments: [] as string[],
  selectedHistorical: [] as number[],
  rateCardCalls: [] as string[],
  duplicateChecks: [] as any[],
  duplicateFlags: [] as any[][],
  duplicateErrors: [] as Array<{ status: number; itemCount: number }>,
  toastMessages: [] as Array<{ title: string; description?: string }>,
  vb15RawActivities: [] as any[],
  vb15ReturnedActivities: [] as any[],
};

declare global {
  interface Window {
    __VB09Fixture?: typeof fixtureState;
    __VB09_HISTORICAL_BILLS__?: FixtureBill[];
    __VB09_DEV_BILLS__?: FixtureBill[];
  }
}

window.__VB09Fixture = fixtureState;

let bills = [...initialBills];
let nextBillId = 950;
const srcdocDescriptor = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, "srcdoc");
if (srcdocDescriptor?.set && srcdocDescriptor.get) {
  Object.defineProperty(HTMLIFrameElement.prototype, "srcdoc", {
    configurable: srcdocDescriptor.configurable,
    enumerable: srcdocDescriptor.enumerable,
    get: srcdocDescriptor.get,
    set(value: string) {
      fixtureState.printDocuments.push(value);
      srcdocDescriptor.set?.call(this, value);
    },
  });
}
const fixtureObjectUrls = new Map<string, Blob>();
const nativeCreateObjectURL = URL.createObjectURL.bind(URL);
const nativeRevokeObjectURL = URL.revokeObjectURL.bind(URL);
URL.createObjectURL = (blob: Blob | MediaSource) => {
  const url = nativeCreateObjectURL(blob);
  if (blob instanceof Blob) fixtureObjectUrls.set(url, blob);
  return url;
};
URL.revokeObjectURL = (url: string) => {
  fixtureObjectUrls.delete(url);
  return nativeRevokeObjectURL(url);
};

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function requestDetails(input: RequestInfo | URL): { method: string; url: URL } {
  const method = typeof input === "object" && "method" in input ? input.method || "GET" : "GET";
  const rawUrl = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  return { method: method.toUpperCase(), url: new URL(rawUrl, window.location.origin) };
}

const originalFetch = window.fetch.bind(window);
window.fetch = async (input, init) => {
  const { url: requestUrl, method: inputMethod } = requestDetails(input);
  const method = (init?.method || inputMethod).toUpperCase();
  const pathname = requestUrl.pathname;
  fixtureState.requests.push({ method, path: `${pathname}${requestUrl.search}` });

  if (pathname === "/api/vendor-bills" && method === "GET") return json(bills);
  if (pathname === "/api/vendor-bills/summary" && method === "GET") {
    const totalAmount = bills.reduce((sum, bill) => sum + Number(bill.totalAmount || 0), 0);
    const count = (status: string) => bills.filter(bill => bill.status === status).length;
    const amount = (status: string) => bills.filter(bill => bill.status === status).reduce((sum, bill) => sum + Number(bill.totalAmount || 0), 0);
    return json({
      total: bills.length,
      totalAmount,
      draft: count("draft"),
      draftAmount: amount("draft"),
      verified: count("verified"),
      verifiedAmount: amount("verified"),
      approved: count("approved"),
      approvedAmount: amount("approved"),
      paid: count("paid"),
      paidAmount: amount("paid"),
      gstByCategory: { equipment: 0, material: 0, transport: 0, labour: 0, other: 0 },
      totalGst: 0,
    });
  }
  if (pathname === "/api/vendor-bills/vendor-names" && method === "GET") {
    if (vb10Scenario()) return json(["VB10 EQUIPMENT HIRE"]);
    if (vb16Scenario()) return json([vb16VendorName()]);
    if (vb17Scenario()) return json([vb17VendorName()]);
    if (vb18Scenario()) return json([vb18VendorName]);
    if (vb11MixedScenario()) return json(["VB11 MIXED SUPPLIER"]);
    if (vb11SingleCategoryScenario()) return json(["VB11 EQUIPMENT SUPPLIER"]);
    if (vb14Scenario()) return json([vb14VendorName()]);
    if (vb15Scenario()) return json([vb15VendorName()]);
    return json(["NARASIMHULU", "MATERIAL VENDOR", "TRANSPORT VENDOR", "LABOUR VENDOR"]);
  }
  if (pathname === "/api/vendor-aliases" && method === "GET") return json([]);
  if (pathname === "/api/vendor-rate-cards" && method === "GET") {
    if (vb11Scenario() || vb14Scenario()) {
      fixtureState.rateCardCalls.push(requestUrl.search);
      return json(vb11RateCards);
    }
    if (vb15Scenario()) {
      fixtureState.rateCardCalls.push(requestUrl.search);
      return json(vb15Rates);
    }
    return json([]);
  }
  if (pathname === "/api/vendor-bills/check-duplicates") {
    if (vb15Scenario() && method === "POST") {
      const payload = init?.body ? JSON.parse(String(init.body)) : {};
      fixtureState.duplicateChecks.push(payload);
      const noDuplicates = vb15CleanScenario() || vb15Part1Scenario() || vb15OtherPlantScenario() || vb15OtherSiteScenario();
      const flags = noDuplicates || !Array.isArray(payload.items)
        ? []
        : payload.items.reduce((matches: any[], item: any, index: number) => {
          const description = String(item.description || "").toUpperCase();
          const date = String(item.date || "");
          if (item.category === "equipment" && date === "2026-09-01") {
            matches.push({ index, billNo: "VB15-APPROVED-001", billStatus: "approved" });
          }
          if (item.category === "material" && description.includes("SOIL") && date === "2026-09-04") {
            matches.push({ index, billNo: "VB15-PAID-002", billStatus: "paid" });
          }
          return matches;
        }, []);
      fixtureState.duplicateFlags.push(flags);
      return json(flags);
    }
    if (vb14Scenario() && method === "POST") {
      const payload = init?.body ? JSON.parse(String(init.body)) : {};
      fixtureState.duplicateChecks.push(payload);
      if (vb14DuplicateFailureScenario()) {
        fixtureState.duplicateErrors.push({
          status: 503,
          itemCount: Array.isArray(payload.items) ? payload.items.length : 0,
        });
        return json({ message: "Fixture duplicate preflight unavailable" }, 503);
      }
      // VB-14's mixed case has two genuinely billed candidates: the first
      // equipment activity is in an approved bill and the second SOIL
      // activity is in a paid bill.  Match by the same fields sent to the
      // production endpoint rather than relying on array position so a
      // grouped pull gets the correct per-group index as well as Pull All.
      // The response is deliberately one flag per candidate index, matching
      // storage.checkDuplicateBilledItems' break-after-first-match contract.
      const flags = vb14CleanScenario() || !Array.isArray(payload.items)
        ? []
        : payload.items.reduce((matches: any[], item: any, index: number) => {
          const description = String(item.description || "").toUpperCase();
          const date = String(item.date || "");
          const equipmentDuplicate = item.category === "equipment" && date === "2026-09-01";
          const paidMaterialDuplicate = item.category === "material" &&
            description.includes("SOIL") && date === "2026-09-04";
          if (equipmentDuplicate) matches.push({ index, billNo: "VB14-APPROVED-001", billStatus: "approved" });
          if (paidMaterialDuplicate) matches.push({ index, billNo: "VB14-PAID-002", billStatus: "paid" });
          return matches;
        }, []);
      fixtureState.duplicateFlags.push(flags);
      return json(flags);
    }
    if (vb11Scenario() && method === "POST") {
      const payload = init?.body ? JSON.parse(String(init.body)) : {};
      fixtureState.duplicateChecks.push(payload);
      // The first item of each explicit pull is marked as already present in
      // another bill.  This exercises the existing duplicate badge without
      // changing which candidate group remains pending.
      const flags = Array.isArray(payload.items) && payload.items.length
        ? [{ index: 0, billNo: `VB11-DUP-${fixtureState.duplicateChecks.length}`, billStatus: "approved" }]
        : [];
      fixtureState.duplicateFlags.push(flags);
      return json(flags);
    }
    return json([]);
  }

  const detailMatch = pathname.match(/^\/api\/vendor-bills\/(\d+)$/);
  if (detailMatch && method === "GET") {
    const bill = bills.find(candidate => candidate.id === Number(detailMatch[1]));
    return bill ? json(bill) : json({ message: "Not found" }, 404);
  }

  if (pathname === "/api/vendor-bills/equipment-hire-discovery") {
    if (vb10Scenario()) return json([{
      vendorName: "VB10 EQUIPMENT HIRE",
      equipmentCount: vb10EquipmentMasters.length,
      equipment: vb10EquipmentMasters.map(equipment => ({
        id: equipment.id, name: equipment.name, registrationNumber: equipment.registrationNumber,
        hireBillingBasis: equipment.hireBillingBasis, hireRate: equipment.hireRate,
        hireStartDate: equipment.hireStartDate, hireEndDate: equipment.hireEndDate,
        hireDieselResponsibility: equipment.hireDieselResponsibility,
        hireOperatorResponsibility: equipment.hireOperatorResponsibility,
        hireAgreementRemarks: equipment.hireAgreementRemarks,
        hireBreakdownDeductionEnabled: equipment.hireBreakdownDeductionEnabled,
        hireMonthlyDivisorType: equipment.hireMonthlyDivisorType, hireMonthlyDivisor: equipment.hireMonthlyDivisor,
        meterType: equipment.meterType, consumptionNorm: equipment.consumptionNorm,
      })),
    }]);
    return json([{
      vendorName: "NARASIMHULU",
      equipmentCount: 1,
      equipment: [{
        id: 7701, name: "JCB", registrationNumber: "FIX-JCB-01",
        hireBillingBasis: "monthly", hireRate: 90_000, hireStartDate: "2026-08-01", hireEndDate: null,
        hireDieselResponsibility: "vendor", hireOperatorResponsibility: null, hireAgreementRemarks: null,
        hireBreakdownDeductionEnabled: false, hireMonthlyDivisorType: "30", hireMonthlyDivisor: null,
        meterType: "hour_meter", consumptionNorm: null,
      }],
    }]);
    if (vb17Scenario()) {
      const equipment = vb17Equipment();
      return json([{
        vendorName: equipment.vendorName, equipmentCount: 1,
        equipment: [{
          id: equipment.id, name: equipment.name, registrationNumber: equipment.registrationNumber,
          hireBillingBasis: equipment.hireBillingBasis, hireRate: equipment.hireRate,
          hireStartDate: equipment.hireStartDate, hireEndDate: equipment.hireEndDate,
          hireDieselResponsibility: equipment.hireDieselResponsibility,
          hireOperatorResponsibility: equipment.hireOperatorResponsibility,
          hireAgreementRemarks: equipment.hireAgreementRemarks,
          hireBreakdownDeductionEnabled: equipment.hireBreakdownDeductionEnabled,
          automaticMonthlyBreakdownDeductions: equipment.automaticMonthlyBreakdownDeductions,
          hireMonthlyDivisorType: equipment.hireMonthlyDivisorType, hireMonthlyDivisor: equipment.hireMonthlyDivisor,
          meterType: equipment.meterType, consumptionNorm: equipment.consumptionNorm,
        }],
      }]);
    }
  }
  if (pathname === "/api/vendor-bills/discover-vendors") {
    if (vb10Scenario()) return json([{
      vendorName: "VB10 EQUIPMENT HIRE",
      // Three eligible monthly masters plus five in-period plant-usage
      // records; this is the generic discovery count, not hire-activity rows.
      recordCount: 8,
      categories: ["equipment"],
      existingBill: null,
    }]);
    if (vb16DraftScenario()) return json([{
      vendorName: vb16VendorName(), recordCount: 3, categories: ["equipment"], existingBill: null,
    }]);
    if (vb17DraftScenario() || vb17VendorScenario()) return json([{
      vendorName: vb17VendorName(), recordCount: 3, categories: ["equipment"], existingBill: null,
    }]);
    if (vb18Scenario()) return json([{
      vendorName: vb18VendorName, recordCount: vb18AutoItems.length, categories: ["equipment"], existingBill: null,
    }]);
    if (vb11MixedScenario()) return json([{
      vendorName: "VB11 MIXED SUPPLIER",
      recordCount: vb11MixedAutoItems.length,
      categories: ["equipment", "material", "transport", "labour"],
      existingBill: null,
    }]);
    if (vb11SingleCategoryScenario()) return json([{
      vendorName: "VB11 EQUIPMENT SUPPLIER",
      recordCount: vb11SingleCategoryAutoItems.length,
      categories: ["equipment"],
      existingBill: null,
    }]);
    if (vb14Scenario()) return json([{
      vendorName: vb14VendorName(),
      recordCount: vb11MixedAutoItems.length,
      categories: ["equipment", "material", "transport", "labour"],
      existingBill: null,
    }]);
    if (vb15Scenario()) {
      const items = vb15AutoItems();
      return json([{
        vendorName: vb15VendorName(),
        recordCount: items.length,
        categories: [...new Set(items.map(item => item.category))],
        existingBill: null,
      }]);
    }
    return json([{
      vendorName: "NARASIMHULU",
      recordCount: 1,
      categories: ["equipment"],
      existingBill: null,
      // Intentionally no hireBillingBasis/rate/start-date fields.  VB-09
      // must discover JCB from activity, not Equipment Master hire terms.
    }]);
  }

  if (pathname === "/api/vendor-bills/auto-items") {
    const billType = requestUrl.searchParams.get("billType") || "equipment";
    if (vb10Scenario()) return json(["equipment", "all"].includes(billType) ? vb10AutoItems : []);
    if (vb16Scenario()) return json([]);
    if (vb17Scenario()) return json([]);
    if (vb18Scenario()) {
      return json(["equipment", "all"].includes(billType) ? vb18AutoItems : []);
    }
    if (vb11MixedScenario()) {
      return json(billType === "all"
        ? vb11MixedAutoItems
        : vb11MixedAutoItems.filter(item => item.category === billType));
    }
    if (vb11SingleCategoryScenario()) {
      return json(["equipment", "all"].includes(billType) ? vb11SingleCategoryAutoItems : []);
    }
    if (vb14Scenario()) {
      return json(billType === "all"
        ? vb11MixedAutoItems
        : vb11MixedAutoItems.filter(item => item.category === billType));
    }
    if (vb15Scenario()) {
      const allItems = vb15AutoItems();
      const from = requestUrl.searchParams.get("periodFrom") || "";
      const to = requestUrl.searchParams.get("periodTo") || "";
      const items = allItems.filter(item => (!from || item.date >= from) && (!to || item.date <= to));
      const returned = billType === "all" ? items : items.filter(item => item.category === billType);
      fixtureState.vb15RawActivities = vb15RawActivities();
      fixtureState.vb15ReturnedActivities = returned;
      return json(returned);
    }
    return json(itemByType[billType] || []);
  }
  if (pathname === "/api/vendor-bills/hire-activities") {
    if (vb10Scenario()) {
      return json([
        ...vb10EquipmentMasters.map(equipment => ({
          source: "equipment_default", sourceId: equipment.id, equipmentId: equipment.id,
          businessDate: requestUrl.searchParams.get("periodFrom") || "2026-05-01", equipment,
        })),
        ...vb10HireActivities
          .filter(row => !vb10NoPriceScenario() || row.source !== "diesel_rate")
          .map(row => row.equipmentId
            ? { ...row, equipment: vb10EquipmentMasters.find(equipment => equipment.id === row.equipmentId) }
            : row),
        ...vb10Maintenance.map(row => ({
          source: "maintenance", sourceId: row.id, equipmentId: row.equipmentId,
          businessDate: row.date, eventType: row.eventType, description: row.description,
          downtimeHours: row.downtimeHours, equipment: vb10EquipmentMasters.find(equipment => equipment.id === row.equipmentId),
        })),
      ]);
    }
    if (vb16DraftScenario()) {
      return json(vb16HireActivities);
    }
    if (vb17Scenario()) {
      const equipment = vb17Equipment();
      return json(vb17Activities().map(row => row.source === "equipment_default"
        ? { ...row, equipment }
        : row.source === "maintenance" ? { ...row, equipment } : row));
    }
    if (vb18Scenario()) return json(vb18HireActivities);
    if (vb15Scenario()) {
      const from = requestUrl.searchParams.get("periodFrom") || "";
      const to = requestUrl.searchParams.get("periodTo") || "";
      const activities = vb15AutoItems().filter(item => (!from || item.date >= from) && (!to || item.date <= to));
      fixtureState.vb15RawActivities = vb15RawActivities();
      fixtureState.vb15ReturnedActivities = activities;
      return json(activities);
    }
    return json([]);
  }
  if (pathname === "/api/reports/equipment-performance") {
    if (vb10Scenario()) return json(vb10PerformanceReport());
    if (vb16DraftScenario()) return json(vb16PerformanceReport());
    if (vb17Scenario()) return json(vb17PerformanceReport(vb17Equipment()));
    return json({
      filterOptions: { projects: [], ownership: [], owners: [], equipmentTypes: [], equipment: [], scopes: [] },
      totals: { eventCount: 0, linkedCount: 0, confirmedLegacyCount: 0, unclassifiedCount: 0, runtimeHours: 0, totalKm: 0, trips: 0, dieselActual: 0, dieselExpected: 0, dieselVariance: 0, activeDays: 0, efficiencyPercent: null, dieselBasis: "unavailable", dieselComparedActual: 0, dieselComparisonIncomplete: true },
      reviewRows: [], events: [], fleet: [], projects: [],
    });
  }
  if (pathname === "/api/vendor-bills/company-accounts") return json([]);

  if (pathname === "/api/vendor-bills" && method === "POST") {
    const payload = init?.body ? JSON.parse(String(init.body)) : {};
    fixtureState.createdPayloads.push(payload);
    const id = nextBillId++;
    const ordinaryPayloadItems = Array.isArray(payload.items)
      ? payload.items.filter((item: any) => !["hire_statement", "hire_group"].includes(String(item.source || "").toLowerCase()))
      : [];
    const items = ordinaryPayloadItems.map((item: any, index: number) => ({ ...item, id: id * 10 + index, billId: id }));
    const hireStatements = vb10Scenario() && Array.isArray(payload.hireGroups)
      ? payload.hireGroups.map((group: any) => vb10SnapshotForGroup(group, "draft", payload))
      : [];
    const hireItems = hireStatements.map((statement: any, index: number) => ({
      id: id * 10 + ordinaryPayloadItems.length + index, billId: id, date: statement.periodTo,
      category: "equipment", description: `HIRE - ${statement.equipmentName} (${statement.periodFrom} TO ${statement.periodTo})`,
      qty: statement.quantity, unit: statement.billingBasis === "monthly" ? "MONTHS" : statement.billingBasis === "daily" ? "DAYS" : statement.billingBasis === "hourly" ? "HRS" : "TRIPS",
      rate: statement.rate, amount: statement.netAmount, source: "hire_statement",
      equipmentId: statement.equipmentId, hireStatementId: statement.id,
    }));
    const responseItems = [...items, ...hireItems];
    const created = {
      ...payload,
      id,
      billDate: payload.billDate || "2026-09-13",
      billNo: payload.billNo || `${vb10Scenario() ? "VB10" : "VB09"}-FIXTURE-${id}`,
      billType: payload.billType || "equipment",
      vendorName: payload.vendorName || (vb10Scenario() ? "VB10 EQUIPMENT HIRE" : "NARASIMHULU"),
      periodFrom: payload.periodFrom || "2026-08-01",
      periodTo: payload.periodTo || "2026-09-13",
      status: vb18Scenario() ? "approved" : "draft",
      totalAmount: Number(payload.hireGroups?.length
        ? responseItems.reduce((sum: number, item: any) => sum + Number(item.amount || 0), 0)
        : payload.totalAmount || items.reduce((sum: number, item: any) => sum + Number(item.amount || 0), 0)),
      items: responseItems,
      hireStatements,
    };
    bills = [created, ...bills];
    fixtureState.createdSnapshots.push(created);
    return json(created, 201);
  }

  const updateMatch = pathname.match(/^\/api\/vendor-bills\/(\d+)$/);
  if (updateMatch && method === "PUT") {
    const payload = init?.body ? JSON.parse(String(init.body)) : {};
    fixtureState.updatedPayloads.push({ id: Number(updateMatch[1]), payload });
    const billId = Number(updateMatch[1]);
    const current = bills.find(candidate => candidate.id === billId) || {};
    const hireStatements = vb10Scenario() && Array.isArray(payload.hireGroups)
      ? payload.hireGroups.map((group: any) => vb10SnapshotForGroup(group, current.status === "draft" ? "draft" : current.status, payload))
      : current.hireStatements;
    const ordinaryPayloadItems = Array.isArray(payload.items)
      ? payload.items.filter((item: any) => !["hire_statement", "hire_group"].includes(String(item.source || "").toLowerCase()))
      : [];
    const responseItems = hireStatements?.length
      ? [...ordinaryPayloadItems, ...hireStatements.map((statement: any, index: number) => ({
        id: billId * 10 + ordinaryPayloadItems.length + index, billId,
        date: statement.periodTo, category: "equipment",
        description: `HIRE - ${statement.equipmentName} (${statement.periodFrom} TO ${statement.periodTo})`,
        qty: statement.quantity,
        unit: statement.billingBasis === "monthly" ? "MONTHS" : statement.billingBasis === "daily" ? "DAYS" : statement.billingBasis === "hourly" ? "HRS" : "TRIPS",
        rate: statement.rate, amount: statement.netAmount, source: "hire_statement",
        equipmentId: statement.equipmentId, hireStatementId: statement.id,
      }))]
      : (Array.isArray(payload.items) ? payload.items : current.items);
    const updated = { ...current, ...payload, items: responseItems, hireStatements };
    bills = bills.map(candidate => candidate.id === billId ? updated : candidate);
    fixtureState.updatedSnapshots.push(updated);
    return json(updated);
  }

  const statusMatch = pathname.match(/^\/api\/vendor-bills\/(\d+)\/status$/);
  if (statusMatch && method === "PATCH") {
    const payload = init?.body ? JSON.parse(String(init.body)) : {};
    const billId = Number(statusMatch[1]);
    fixtureState.statusPayloads.push({ id: billId, payload });
    const current = bills.find(candidate => candidate.id === billId);
    if (!current) return json({ message: "Not found" }, 404);
    const status = String(payload.status || "");
    const statements = Array.isArray(current.hireStatements)
      ? current.hireStatements.map((statement: any) => ({
        ...statement,
        status: status === "verified" ? "reviewed" : status === "approved" ? "approved" : status === "paid" ? "billed" : statement.status,
      }))
      : current.hireStatements;
    const updated = { ...current, status, hireStatements: statements };
    bills = bills.map(candidate => candidate.id === billId ? updated : candidate);
    return json(updated);
  }

  // All mutations remain in-memory and are recorded for assertions.
  if (pathname.startsWith("/api/")) return json({});
  return originalFetch(input, init);
};

const originalAnchorClick = HTMLAnchorElement.prototype.click;
function fixturePdfForBill(bill: any): Blob {
  // This is only a deterministic fixture-server PDF for the isolated browser
  // run. The production endpoint remains untouched; print assertions below
  // inspect the real client-generated iframe document.
  const additional = Array.isArray(bill?.additionalAdjustments)
    ? bill.additionalAdjustments
    : Array.isArray(bill?.additional_adjustments) ? bill.additional_adjustments : [];
  const baseTotal = Number(bill?.totalAmount || 0);
  const gstRate = Number(bill?.gstRateEquipment || bill?.gstRateMaterial || 0);
  const gst = baseTotal * gstRate / 100;
  const tds = baseTotal * Number(bill?.tdsRate || 0) / 100;
  const additionalTotal = additional.reduce((sum: number, entry: any) => sum + Number(entry?.amount || 0), 0);
  const netTotal = baseTotal + gst + Number(bill?.adjustmentAmount || 0) + additionalTotal - tds;
  const amount = (value: unknown) => `${Number(value || 0) >= 0 ? "+" : ""}${Number(value || 0).toFixed(2)}`;
  const lines = [
    `Vendor Bill ${bill?.billNo || ""}`,
    ...(gstRate ? [`GST @ ${gstRate}% +${gst.toFixed(2)}`] : []),
    `Primary: ${bill?.adjustmentLabel || "ADVANCE DEDUCTION"} ${amount(bill?.adjustmentAmount)}`,
    ...additional.map((entry: any, index: number) =>
      `Additional ${index + 1}: ${entry?.label || "ADDITIONAL DEDUCTION / CREDIT"} ${amount(entry?.amount)}`),
    ...(tds ? [`TDS @ ${bill?.tdsRate}% -${tds.toFixed(2)}`] : []),
    `NET TOTAL: ${netTotal.toFixed(2)}`,
  ].map(line => line.replace(/[^\x20-\x7E]/g, "?"));
  const escapePdf = (line: string) => line.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
  const stream = ["BT", "/F1 12 Tf", "50 780 Td", ...lines.flatMap((line, index) => [
    `(${escapePdf(line)}) Tj`, ...(index < lines.length - 1 ? ["0 -24 Td"] : []),
  ]), "ET"].join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${new TextEncoder().encode(stream).byteLength} >>\nstream\n${stream}\nendstream`,
  ];
  let pdf = "%PDF-1.4\n%\xE2\xE3\xCF\xD3\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets[index + 1] = new TextEncoder().encode(pdf).byteLength;
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = new TextEncoder().encode(pdf).byteLength;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let index = 1; index <= objects.length; index += 1) {
    pdf += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new Blob([pdf], { type: "application/pdf" });
}
function captureDownload(this: HTMLAnchorElement) {
  if (this.href.includes("/api/vendor-bills/") && this.href.endsWith("/pdf")) {
    const match = this.href.match(/\/api\/vendor-bills\/(\d+)\/pdf(?:$|[?#])/);
    const bill = match ? bills.find(candidate => candidate.id === Number(match[1])) : undefined;
    if (bill) {
      const fixturePdfBlob = fixturePdfForBill(bill);
      const fixturePdfUrl = nativeCreateObjectURL(fixturePdfBlob);
      fixtureObjectUrls.set(fixturePdfUrl, fixturePdfBlob);
      this.href = fixturePdfUrl;
      this.download = this.download || `VendorBill-${bill.billNo}.pdf`;
    }
  }
  if (this.download || this.href.includes("/api/vendor-bills/")) {
    fixtureState.downloadClicks.push(this.download || this.href);
    const blob = fixtureObjectUrls.get(this.href);
    if (blob) {
      void blob.arrayBuffer().then(buffer => {
        const bytes = new Uint8Array(buffer);
        const signature = Array.from(bytes.slice(0, 4)).map(value => value.toString(16).padStart(2, "0")).join("");
        fixtureState.downloadFiles.push({
          name: this.download || "unnamed-download",
          bytes: bytes.byteLength,
          type: blob.type,
          signature,
        });
        let binary = "";
        bytes.forEach(byte => { binary += String.fromCharCode(byte); });
        fixtureState.downloadBodies.push({
          name: this.download || "unnamed-download",
          type: blob.type,
          base64: btoa(binary),
        });
      });
    }
  }
}
HTMLAnchorElement.prototype.click = function click() {
  captureDownload.call(this);
  return originalAnchorClick.call(this);
};
// jsPDF/FileSaver dispatches a MouseEvent instead of calling anchor.click().
const originalAnchorDispatch = HTMLAnchorElement.prototype.dispatchEvent;
HTMLAnchorElement.prototype.dispatchEvent = function dispatchEvent(event: Event) {
  if (event.type === "click") captureDownload.call(this);
  return originalAnchorDispatch.call(this, event);
};

const mount = async () => {
  // verify.mjs may create this temporary module from git HEAD so the
  // non-equipment creation geometry can be compared in the same browser
  // session.  It is never committed and is not a production import.
  const Component = new URLSearchParams(window.location.search).get("mode") === "baseline"
    ? (await import(/* @vite-ignore */ "./baseline-head.tsx")).default
    : VendorBills;
  queryClient.clear();
  createRoot(document.getElementById("root")!).render(
    <QueryClientProvider client={queryClient}>
      <Component />
    </QueryClientProvider>,
  );
};

void mount();