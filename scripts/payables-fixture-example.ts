// In-memory acceptance example only. No database import or record insertion.
import fs from "node:fs/promises";
import * as XLSX from "xlsx";
import { buildVendorPayablesPreview, type PayablesPreviewReader } from "../server/vendorPayablesPreview";
import { buildPayablesPreviewWorkbook, buildPayablesPreviewPdf } from "../client/src/components/vendor-bills/payablesPreviewExport";
const equipment = { id: 7, name: "Example excavator", hireBillingBasis: "monthly", hireRate: 87300,
  hireStartDate: "2026-06-01", hireEndDate: null, hireMonthlyDivisorType: "30",
  hireDieselResponsibility: "vendor", hireBreakdownDeductionEnabled: true, meterType: "hour_meter" };
const reader = {
  getVendorBillAutoItems: async () => [
    { date: "2026-06-04", category: "material", description: "Example aggregate", qty: 17.4, unit: "MT", rate: 913.5, source: "auto", sourceId: "material:3", siteName: "SITE: EXAMPLE SITE" },
    { date: "2026-06-05", category: "labour", description: "Example labour", qty: 6, unit: "HEAD-DAY", rate: 847, source: "auto", siteName: "SITE: EXAMPLE SITE" },
    { date: "2026-06-06", category: "transport", description: "Already billed example transport", qty: 2, unit: "TRIP", rate: 1000, source: "auto", siteName: "SITE: EXAMPLE SITE" },
  ],
  getVendorBillHireActivities: async () => [
    { source: "equipment_default", equipmentId: 7, sourceId: 7, businessDate: "2026-06-01", equipment },
    { source: "dpr_log", equipmentId: 7, sourceId: 71, businessDate: "2026-06-04", hoursOrKmRun: 6.5, site: "EXAMPLE SITE", equipment },
    { source: "maintenance", equipmentId: 7, sourceId: 73, businessDate: "2026-06-07", eventType: "breakdown", downtimeHours: 4, description: "Example hydraulic hose repair", equipment },
  ],
  getVendorRateCards: async () => [],
  checkDuplicateBilledItems: async () => [{ index: 2 }],
  getVendorBills: async () => [{ id: 1, vendorName: "EXAMPLE ONLY — NOT LIVE DATA", billDate: "2026-05-31", billType: "all",
    gstRateEquipment: 18, gstRateMaterial: 5, gstRateLabour: 18,
    items: [{ category: "equipment" }, { category: "material" }, { category: "labour" }] }],
  getHireStatements: async () => [], resolveVendorAliases: async () => [],
  getSites: async () => [{ id: 1, name: "EXAMPLE SITE" }],
} as unknown as PayablesPreviewReader;
const preview = await buildVendorPayablesPreview(reader,
  { vendorName: "EXAMPLE ONLY — NOT LIVE DATA", periodFrom: "2026-06-01", periodTo: "2026-06-30", siteId: 1 },
  { permittedSiteNames: null, siteId: 1, siteName: "EXAMPLE SITE" });
preview.warnings.unshift("Demonstration data held in memory only. No business records were created.");
const out = ".agents/outputs/vb-payables-preview";
await fs.writeFile(`${out}/three-category-example.json`, JSON.stringify(preview, null, 2));
await fs.writeFile(`${out}/three-category-example.xlsx`, XLSX.write(buildPayablesPreviewWorkbook(preview), { type: "buffer", bookType: "xlsx" }));
await fs.writeFile(`${out}/three-category-example.pdf`, Buffer.from(buildPayablesPreviewPdf(preview).output("arraybuffer")));
console.log({ categories: preview.categories.filter(c => c.items.length).map(c => c.category),
  excluded: preview.excludedCount, siteTotal: preview.siteTotal, unallocated: preview.unallocatedTotal, grandTotal: preview.grandTotal });