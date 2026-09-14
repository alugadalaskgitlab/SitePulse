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

const initialBills = (() => {
  if (new URLSearchParams(window.location.search).get("scenario")?.startsWith("vb10")) return [];
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

const vb10Scenario = () => new URLSearchParams(window.location.search).get("scenario")?.startsWith("vb10") === true;
const vb10NoPriceScenario = () => new URLSearchParams(window.location.search).get("scenario") === "vb10-no-price";

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
  printDocuments: [] as string[],
  selectedHistorical: [] as number[],
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
    return json(["NARASIMHULU", "MATERIAL VENDOR", "TRANSPORT VENDOR", "LABOUR VENDOR"]);
  }
  if (pathname === "/api/vendor-aliases" && method === "GET") return json([]);
  if (pathname === "/api/vendor-rate-cards" && method === "GET") return json([]);
  if (pathname === "/api/vendor-bills/check-duplicates") return json([]);

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
    return json([]);
  }
  if (pathname === "/api/reports/equipment-performance") {
    if (vb10Scenario()) return json(vb10PerformanceReport());
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
      status: "draft",
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
function captureDownload(this: HTMLAnchorElement) {
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