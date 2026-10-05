import { isTrulyBlankManualBillRow } from "@/lib/vendorBillBlankRows";
import { projectEquipmentLogEvidence, type EquipmentLogEvidence } from "./equipmentLogEvidence";
import { projectWholeBillScreenSections } from "./wholeBillScreenProjection";
import type { EquipmentHireExportData } from "./EquipmentHireBillOutput";
import type { BillExportCalendar, BillExportRow, WholeBillSnapshot } from "./wholeBillSnapshot";

type ScreenItem = {
  date?: string | null; category?: string | null; description?: string | null;
  qty?: number | null; unit?: string | null; rate?: number | null; amount?: number | null;
  siteName?: string | null; suppliedTo?: string | null; transporter?: string | null;
  vehicleNumber?: string | null; receiptNumber?: string | null; leadDistance?: number | null;
  initialBlank?: boolean; source?: string | null; equipmentId?: number | null;
  physicalQuantity?: number; physicalUnit?: string; unitRateWarning?: string;
  billedIn?: { billNo: string; billStatus: string } | null;
  equipmentLogEvidence?: EquipmentLogEvidence | null;
};
const categories = ["equipment", "material", "transport", "labour", "other"];
const labourSources = [
  { key: "site", label: "DPR Site Labour" },
  { key: "plant", label: "Plant Shift Manpower" },
  { key: "other", label: "Manual / Other" },
];

/** Page supplies the same grouping predicates and subtotals as its JSX. */
export function projectVendorBillPageItems({
  items, subtotals, shouldGroup, labourFilter = "all", showLabourFilter = false,
  getLabourSource, getSiteLabel, formatDate, billType = "all", total = 0,
}: {
  items: ScreenItem[]; subtotals: Record<string, number>; shouldGroup: boolean;
  labourFilter?: "all" | "site" | "plant"; showLabourFilter?: boolean;
  getLabourSource: (item: ScreenItem) => string;
  getSiteLabel: (item: ScreenItem) => string | null;
  formatDate: (date: string | null | undefined) => string;
  billType?: string; total?: number;
}) {
  const meaningful = items.filter(item => !(item.initialBlank && isTrulyBlankManualBillRow({
    ...item, qty: item.qty ?? undefined, rate: item.rate ?? undefined, amount: item.amount ?? undefined,
  })));
  const toRow = (item: ScreenItem): BillExportRow => {
    const diesel = item.description?.match(/DIESEL:\s*(\d+(?:\.\d+)?)L/i);
    return {
      date: item.date || "", category: item.category || "other", description: item.description || "",
      qty: item.qty ?? 0, unit: item.unit || "", rate: item.rate || null, amount: item.amount ?? 0,
      siteName: getSiteLabel(item), suppliedTo: item.suppliedTo, transporter: item.transporter,
      vehicleNumber: item.vehicleNumber, receiptNumber: item.receiptNumber, leadDistance: item.leadDistance,
      details: {
        ...(item.category === "equipment" ? projectEquipmentLogEvidence(item.equipmentLogEvidence).columns : {}),
        ...(diesel && Number(diesel[1]) > 0 ? { "Diesel (L)": Number(diesel[1]) } : {}),
        ...(item.physicalQuantity != null && item.physicalUnit && item.physicalUnit !== item.unit
          ? { "Physical quantity": item.physicalQuantity, "Physical unit": item.physicalUnit } : {}),
        ...(item.unitRateWarning ? { "Rate warning": item.unitRateWarning } : {}),
        ...(item.billedIn ? { "Billed in": item.billedIn.billNo, "Billed status": item.billedIn.billStatus.toUpperCase() } : {}),
      },
    };
  };
  if (!shouldGroup && billType !== "all") {
    return projectWholeBillScreenSections([{
      category: billType, subtotal: total,
      rowGroups: [{ rows: meaningful.filter(item => item.category !== "labour" ||
        !showLabourFilter || labourFilter === "all" || getLabourSource(item) === labourFilter).map(toRow) }],
    }], formatDate);
  }
  return projectWholeBillScreenSections(categories.map(category => {
    const rows = meaningful.filter(item => (item.category || "other") === category);
    const sources = labourSources.map(source => ({
      ...source, items: rows.filter(item => getLabourSource(item) === source.key),
    })).filter(source => source.items.length);
    // Grouped labour filters apply only when the JSX actually splits labour.
    const split = shouldGroup && category === "labour" && sources.length > 1;
    return {
      category, subtotal: subtotals[category] || 0,
      rowGroups: split
        ? sources.filter(source => labourFilter === "all" || source.key === labourFilter)
          .map(source => ({ label: source.label, rows: source.items.map(toRow) }))
        : [{ rows: rows.filter(item => shouldGroup || category !== "labour" ||
          !showLabourFilter || labourFilter === "all" || getLabourSource(item) === labourFilter).map(toRow) }],
    };
  }), formatDate);
}

/** Projection of already displayed hire financial outputs, not a new calculator. */
export function displayedHireTotals(outputs: EquipmentHireExportData[], netPayable?: number): WholeBillSnapshot["totals"] {
  const sum = (key: "grossHire" | "gstAmount" | "tdsAmount" | "netPayable") =>
    outputs.reduce((total, output) => total + Number(output[key] || 0), 0);
  return {
    subtotal: sum("grossHire"),
    gst: outputs.map(output => ({
      label: `GST ON EQUIPMENT @ ${output.gstRate || 0}%`, amount: output.gstAmount || 0,
      reason: output.equipmentName,
    })),
    totalGst: sum("gstAmount"),
    adjustments: outputs.flatMap(output => [
      { label: "BREAKDOWN DEDUCTION", amount: -output.breakdownDeduction },
      { label: "HSD RECOVERY", amount: -output.hsdRecovery },
      { label: "OTHER DEBIT", amount: -output.otherDebit, reason: output.otherDebitReason },
      { label: "ADVANCE ADJUSTMENT", amount: -output.advanceAdjustment, reason: output.advanceAdjustmentReason },
      { label: "OTHER CREDIT", amount: output.otherCredit, reason: output.otherCreditReason },
    ].map(row => ({ ...row, reason: [output.equipmentName, row.reason].filter(Boolean).join(" · ") }))),
    tds: { label: `IT TDS${outputs.length === 1 ? ` @ ${outputs[0].tdsRate || 0}%` : ""}`, amount: -sum("tdsAmount") },
    netPayable: netPayable ?? sum("netPayable"),
  };
}

/** Frozen HistoricalHireWorkingSheet facts, with the same labels as the page. */
export function historicalHireSheetRows(
  snapshot: any,
  formatDate: (date: string) => string,
  formatCurrency: (amount: number) => string,
): BillExportCalendar["breakdown"] {
  const workingSheet = Array.isArray(snapshot?.workingSheet) ? snapshot.workingSheet : [];
  const daily = snapshot?.decisions?.daily || [];
  const trips = snapshot?.decisions?.trip || [];
  const exceptions = snapshot?.exceptions || [];
  return {
    headers: ["Date", "Equipment", "Site", "Movement", "Activity", "Work", "Daily decision",
      "Hours / trips", "Trip decisions", "Opening / closing", "Actual HSD", "Expected HSD",
      "Signed variance", "HSD rate", "Breakdown", "Exception decisions", "Remarks"],
    rows: workingSheet.map((day: any) => {
      const dayDaily = daily.filter((entry: any) => entry.date === day.date);
      const dayTrips = trips.filter((entry: any) => entry.businessDate === day.date);
      const dayExceptions = exceptions.filter((entry: any) => entry.date === day.date);
      const price = (snapshot.diesel?.dailyPricing || []).find((entry: any) => entry.date === day.date);
      return [
        formatDate(day.date), day.equipmentNames?.join(" · ") || "—",
        day.siteLocations?.join(" · ") || "—", day.movementReferences?.join(" · ") || "—",
        day.activity === "breakdown" ? "BREAKDOWN" : day.activity === "no_activity" ? "NO WORK / NO ACTIVITY"
          : day.billableActivityCount === 0 && day.openActivityCount > 0 ? "OPEN — NOT BILLABLE" : "WORKED",
        day.activityDescriptions?.join(" · ") || "—",
        dayDaily[0]?.decision?.replace("_", " ").toUpperCase() || "",
        `${day.hours || "—"} H / ${day.trips || "—"} T`,
        dayTrips.map((entry: any) => `${entry.selected === false ? "EXCLUDED" : "INCLUDED"} ${entry.acceptedTrips} / ${entry.recordedTrips} TRIPS`).join(" · "),
        `${day.openingReadings?.join(" · ") || "—"} / ${day.closingReadings?.join(" · ") || "—"}`,
        day.actualDiesel ? `${day.actualDiesel} L` : "—", day.expectedDiesel ? `${day.expectedDiesel} L` : "—",
        `${day.dieselVariance > 0 ? "+" : ""}${Number(day.dieselVariance || 0).toFixed(2)} L`,
        price?.applicableRate != null ? `₹${formatCurrency(price.applicableRate)}/L` : "",
        day.maintenanceDescriptions?.join(" · ") || "—",
        dayExceptions.map((entry: any) => String(entry.decision || "").toUpperCase()).join(" · "),
        [...dayExceptions, ...dayDaily, ...dayTrips].map((entry: any) => entry.remarks).filter(Boolean).join(" · ") || "—",
      ];
    }),
  };
}