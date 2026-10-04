import * as XLSX from "xlsx";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { equipmentHireActivitySheetRows, type BillingDailyRow } from "./EquipmentHireBillOutput";
import type { EquipmentPerformanceDailyRow } from "@shared/equipmentPerformance";
import type { PayablesHireGroup, VendorPayablesPreview } from "@shared/vendorPayablesPreview";

const text = (value: string) => value.replace(/[—–−]/g, "-").replace(/₹/g, "Rs. ");
const amount = (value: number | null) => value === null ? "Incomplete" : value;
const headings = { equipment: "Equipment hire", material: "Materials", transport: "Transport", labour: "Labour", other: "Other" };
const detailHeaders = ["Date", "Description", "Site / allocation", "Quantity", "Unit", "Rate", "Pre-tax", "Source", "Reason / review"];
export function previewBillingDailyRows(group: PayablesHireGroup): BillingDailyRow[] {
  return group.result.workingSheet.map(day => ({
    date: day.date, status: day.activity === "breakdown" ? "Breakdown" : day.activity === "worked" ? "Worked" : "No Work",
    downtimeHours: day.downtimeHours,
    remarks: [...day.activityDescriptions, ...day.maintenanceDescriptions, ...day.movementReferences].join(" · "),
    // Do not invent performance-only tank/time readings from activity evidence.
    performance: {
      projectSite: day.siteLocations.join(" · ") || "Not allocated to a site",
      openingMeter: day.openingReadings.length === 1 ? day.openingReadings[0] : null,
      closingMeter: day.closingReadings.length === 1 ? day.closingReadings[0] : null,
      workingHours: day.hours, dieselIssued: day.actualDiesel,
      dieselConsumed: null, openingTank: null, closingTank: null,
      expectedDiesel: day.expectedDieselAvailable ? day.expectedDiesel : null,
      startTime: null, endTime: null, clockDuration: null,
    } as EquipmentPerformanceDailyRow,
  }));
}
export function payablesSummaryRows(preview: VendorPayablesPreview) {
  return [
    [preview.label], ["Vendor", preview.vendorName], ["Period", `${preview.periodFrom} to ${preview.periodTo}`],
    ["Generated", preview.generatedAt], ["Site filter", preview.siteName || "All authorized sites"],
    ["Already-billed exclusions", preview.excludedCount], ["Unpriced items", preview.unpricedCount],
    ["Type", "Pre-tax", "GST (indicative)", "With GST", "GST %", "Rate source"],
    ...preview.categories.map(c => [headings[c.category], amount(c.totals.preTax), amount(c.totals.gst), amount(c.totals.withGst), preview.gstRates[c.category] ?? "Unknown", preview.gstSources[c.category]]),
    ["Authorized site subtotal", amount(preview.siteTotal.preTax), amount(preview.siteTotal.gst), amount(preview.siteTotal.withGst)],
    ["Not allocated to a site", amount(preview.unallocatedTotal.preTax), amount(preview.unallocatedTotal.gst), amount(preview.unallocatedTotal.withGst)],
    ["Vendor grand total", amount(preview.grandTotal.preTax), amount(preview.grandTotal.gst), amount(preview.grandTotal.withGst)],
    ...preview.warnings.map(warning => ["Note", warning]),
  ];
}
function detailRows(preview: VendorPayablesPreview, category: keyof typeof headings) {
  return preview.categories.find(c => c.category === category)!.items.map(item => [
    item.date, item.description, item.siteName || "Not allocated to a site", item.qty, item.unit,
    item.rate ?? "Unknown", amount(item.amount), item.source, [item.unallocatedReason, item.warning].filter(Boolean).join(" · "),
  ]);
}
export function buildPayablesPreviewWorkbook(preview: VendorPayablesPreview): XLSX.WorkBook {
  const workbook = XLSX.utils.book_new();
  const summary = XLSX.utils.aoa_to_sheet(payablesSummaryRows(preview));
  summary["!cols"] = [{ wch: 32 }, { wch: 65 }, { wch: 22 }, { wch: 22 }, { wch: 16 }, { wch: 28 }];
  XLSX.utils.book_append_sheet(workbook, summary, "Summary");
  for (const category of preview.categories) {
    const rows: (string | number)[][] = [
      [preview.label], ["Vendor", preview.vendorName, "Generated", preview.generatedAt],
      ["Period", `${preview.periodFrom} to ${preview.periodTo}`], detailHeaders, ...detailRows(preview, category.category),
    ];
    if (category.category === "equipment") {
      rows.push([], ["Machine-day activity calendar (evidence; not additional charges)"]);
      for (const group of preview.hireGroups) {
        const daily = equipmentHireActivitySheetRows(previewBillingDailyRows(group), group.dieselResponsibility, group.consumptionNorm, group.meterType);
        rows.push([group.equipmentName, group.periodFrom, group.periodTo, group.unallocatedReason || ""],
          ["Gross hire", group.result.grossAmount, "Breakdown deduction", group.result.deductionAmount, "HSD recovery", group.result.diesel.finalRecoveryAmount],
          ["Machine", ...daily.headers, "Trips", "Activity", "Allocation"]);
        daily.values.forEach((row, index) => rows.push([group.equipmentName, ...row,
          group.result.workingSheet[index].trips, group.result.workingSheet[index].activity, group.unallocatedReason || "Authorized activity evidence"]));
      }
    }
    const sheet = XLSX.utils.aoa_to_sheet(rows);
    sheet["!cols"] = Array.from({ length: 20 }, (_, i) => ({ wch: i === 1 || i === 8 ? 52 : 21 }));
    XLSX.utils.book_append_sheet(workbook, sheet, headings[category.category]);
  }
  return workbook;
}
export function buildPayablesPreviewPdf(preview: VendorPayablesPreview): jsPDF {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  doc.setProperties({ title: preview.label, subject: `${preview.vendorName} · ${preview.generatedAt}` });
  const header = () => {
    doc.setFontSize(14); doc.text(text(preview.label), 14, 14);
    doc.setFontSize(10); doc.text(text(`Vendor statement · ${preview.vendorName}`), 14, 21);
    doc.setFontSize(8); doc.text(`${preview.periodFrom} to ${preview.periodTo} | Generated ${preview.generatedAt}`, 14, 27);
  };
  header();
  let y = 33;
  const table = (head: string[], body: (string | number)[][]) => {
    autoTable(doc, { startY: y, margin: { top: 33, bottom: 14 }, head: [head.map(text)],
      body: body.map(row => row.map(cell => text(String(cell)))), theme: "grid",
      styles: { fontSize: 7, cellPadding: 2 }, headStyles: { fillColor: [180, 83, 9] }, didDrawPage: header });
    y = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
    if (y > 260) { doc.addPage(); header(); y = 33; }
  };
  table(["Type", "Pre-tax", "GST (indicative)", "With GST"], [
    ...preview.categories.map(c => [headings[c.category], amount(c.totals.preTax), amount(c.totals.gst), amount(c.totals.withGst)]),
    ["Authorized site subtotal", amount(preview.siteTotal.preTax), amount(preview.siteTotal.gst), amount(preview.siteTotal.withGst)],
    ["Not allocated to a site", amount(preview.unallocatedTotal.preTax), amount(preview.unallocatedTotal.gst), amount(preview.unallocatedTotal.withGst)],
    ["Vendor grand total", amount(preview.grandTotal.preTax), amount(preview.grandTotal.gst), amount(preview.grandTotal.withGst)],
  ]);
  table(["Preview notes"], [[`Excluded already billed: ${preview.excludedCount} | Unpriced: ${preview.unpricedCount}`],
    ...preview.categories.filter(c => c.items.length).map(c => [`${headings[c.category]} GST: ${preview.gstRates[c.category] ?? "Unknown"}% · ${preview.gstSources[c.category]}`]),
    ...preview.warnings.map(warning => [warning])]);
  for (const c of preview.categories) {
    table([headings[c.category], ...detailHeaders.slice(1)], detailRows(preview, c.category));
  }
  for (const group of preview.hireGroups) {
    table(["Machine-day", "Activity", "Hours", "Trips", "Breakdown", "Site / remarks"],
      group.result.workingSheet.map(day => [day.date, day.activity, day.hours, day.trips, day.downtimeHours,
        `${group.equipmentName} · ${day.siteLocations.join(", ") || "Not allocated to a site"} · ${day.maintenanceDescriptions.join(", ")}`]));
  }
  return doc;
}
export function exportPayablesPreview(preview: VendorPayablesPreview, format: "xlsx" | "pdf") {
  const filename = `payables-preview-${preview.vendorName.replace(/[^\w-]+/g, "-")}-${preview.periodFrom}-${preview.periodTo}`;
  if (format === "xlsx") XLSX.writeFile(buildPayablesPreviewWorkbook(preview), `${filename}.xlsx`);
  else buildPayablesPreviewPdf(preview).save(`${filename}.pdf`);
}