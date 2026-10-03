import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import SiteReport from "../../../client/src/pages/SiteReport";
import DprDetails from "../../../client/src/pages/DprDetails";
import BeforeSiteReport from "@before/pages/SiteReport";
import BeforeDprDetails from "@before/pages/DprDetails";
import { queryClient } from "../../../client/src/lib/queryClient";
import "../../../client/src/index.css";

const params = new URLSearchParams(location.search);
const before = params.get("version") === "before";
const stress = params.get("scenario") === "audit-stress";
const details = location.pathname.startsWith("/dpr/");
const date = "2026-10-02";
const boq = { id: 7, description: "Wet Mix Macadam", itemName: "Wet Mix Macadam", displayName: "Wet Mix Macadam", itemCode: "WMM", unit: "Cum", canonicalUnit: "Cum", includeInDpr: true };
const masters = [
  { id: 11, name: "SOIL COMPACTOR", registrationNumber: "TS08JG4572", ownership: "hired", vendorName: "Nafeez", meterType: "hour_meter", consumptionNorm: 9, isActive: 1 },
  { id: 12, name: "TRACTOR – RATNAM", registrationNumber: "0930", ownership: "hired", vendorName: "Ratnam", meterType: "hour_meter", consumptionNorm: 4, isActive: 1 },
  { id: 13, name: "TRACTOR DOZER", registrationNumber: "TS34TA8581", ownership: "hired", vendorName: "Mahipal", meterType: "hour_meter", consumptionNorm: 2.5, isActive: 1 },
];
const longFilename = "DPR409_AUDIT_ATTACHMENT_" + "hydraulic_inspection_vendor_signed_delivery_and_repair_scope_".repeat(4) + "END_FILENAME.pdf";
const longRemarks = Array.from({ length: 95 }, (_, i) => `AUDIT-PARAGRAPH-${i + 1}: Vendor responsibility remains recorded separately from maintenance status. The replaced hose, inspection record, payment scope, operator statement and physical dip evidence must remain readable on paper.`).join("\n") + "\nEND-LONG-REMARKS-409";
const rows = [
  { equipmentId: 11, machine: masters[0].name, vehicleNo: masters[0].registrationNumber, operator: "Ramesh", openingReading: 2594.4, closingReading: 2595.5, hoursWorked: 1.1, startTime: "09:50", endTime: "17:13", diesel: 20, openingDiesel: 54, dieselBalanceInTank: 62.5, dieselNorm: 9, expectedDiesel: 9.9, assignmentHours: 7.4 },
  { equipmentId: 12, machine: masters[1].name, vehicleNo: masters[1].registrationNumber, operator: "Yovan", openingReading: 5193.3, closingReading: 5196.4, hoursWorked: 3.1, startTime: "09:56", endTime: "18:10", diesel: 5, openingDiesel: 10, dieselBalanceInTank: 10, dieselNorm: 4, expectedDiesel: 12.4, assignmentHours: 8.2 },
  { equipmentId: 13, machine: masters[2].name, vehicleNo: masters[2].registrationNumber, operator: "Nagesh", openingReading: 8819.1, closingReading: 8820.5, hoursWorked: 1.4, startTime: "14:40", endTime: "17:30", diesel: 17, openingDiesel: 2, dieselBalanceInTank: 15, dieselNorm: 2.5, expectedDiesel: 3.5, assignmentHours: 2.8 },
].map((row, i) => ({
  ...row, id: 40901 + i, plantUsageId: 901 + i, entryType: "monthly", dieselSource: "plant_stock", dieselBalanceConfirmed: true, usageStatus: "working", usageStatusReason: "Saved fixture status reason", task: "Compacting WMM lift", totalKm: null,
  activitySegments: [{ startTime: row.startTime, endTime: row.endTime, hoursWorked: row.assignmentHours, boqItems: [{ boqItemId: 7, programmeBarId: null }] }],
  activityAllocations: [],
  breakdowns: stress && i === 0 ? [{
    id: 501, maintenanceLogId: 501, description: "AUDIT-STRESS Hydraulic inspection", fromTime: "11:10", toTime: "11:45", downtimeHours: 0.583,
    responsibility: "vendor", repairScope: "Parts and labour retained for vendor reconciliation", debitableToVendor: true, remarks: longRemarks,
    attachment: { id: 601, moduleType: "maintenance", linkedRecordId: 501, fileName: longFilename, objectPath: "/fixture/repair", mimeType: "application/pdf", fileSize: 1248 },
  }] : [],
}));
const record = {
  id: 409, date, site: "alladurg pwd road to pampad", engineer: "DPR409 fixture engineer", role: "engineer",
  dprStatus: "submitted", submittedAt: "2026-10-02T18:30:00Z", createdAt: "2026-10-02T07:30:00Z", workType: "road", boqProjectId: 1,
  progress: [{ id: 4091, entryKey: "wmm-409", activity: "Wet Mix Macadam", boqItemId: 7, programmeBarId: null, chainageFrom: "0+280", chainageTo: "0+380", length: 100, width: 3.75, thickness: .15, quantity: 56.25, uom: "Cum", side: "Full width", personnelIds: [] }],
  equipment: rows, labour: [{ id: 1, category: "Skilled", gender: "Male", count: 1, hours: 8, task: "WMM", contractor: "Fixture gang" }, { id: 2, category: "Unskilled", gender: "Male", count: 1, hours: 7.5 }],
  materials: [], sitePurchases: [], structureItems: [], remarks: "Explicit mockup-derived fixture. Not live authenticated DPR409.",
};
const state = { requests: [] as any[], moves: [] as any[], longFilename, longRemarks, record, baseline: before };
(window as any).__DprView01Fixture = state;
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });
window.fetch = async (input, init) => {
  const raw = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const url = new URL(raw, location.origin);
  const method = init?.method ?? (input instanceof Request ? input.method : "GET");
  const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
  state.requests.push({ method, path: url.pathname + url.search, body });
  if (!url.pathname.startsWith("/api/")) throw new Error(`Fixture forbids non-API network: ${url}`);
  if (method !== "GET") {
    if (url.pathname === "/api/equipment-usage/901/move" && method === "POST") { state.moves.push(body); return json({ id: 999, ...body }); }
    throw new Error(`Fixture forbids mutation: ${method} ${url.pathname}`);
  }
  if (url.pathname === "/api/dprs/409") return json(record);
  if (url.pathname === "/api/sites") return json([{ id: 1, name: record.site, isActive: 1 }, { id: 2, name: "Fixture receiving site", isActive: 1 }]);
  if (url.pathname === "/api/plant-module/equipment") return json(masters);
  if (url.pathname === "/api/equipment-usage/lifecycle") return json({ rows: rows.map((_, i) => ({ id: 901 + i, status: i === 0 ? "closed" : "open", successorId: null, closedByUserName: "Fixture plant operator" })) });
  if (url.pathname === "/api/maintenance/logs") return json(stress ? [{ id: 501, sourceRecordId: 40901, status: "resolved", description: "Linked inspection resolved", fromTime: "11:10", toTime: "11:50", downtimeHours: .667, responsibility: "contractor" }] : []);
  if (url.pathname === "/api/reports/equipment-performance") return json({ events: [], fleet: [], filterOptions: { equipment: masters } });
  if (url.pathname === "/api/boq/projects") return json([{ id: 1, name: "Fixture WMM project", siteId: 1, status: "active" }]);
  if (url.pathname === "/api/boq/projects/1/items") return json([boq]);
  if (url.pathname === "/api/config") return json({ companyName: "DPR409 isolated fixture", companyShortName: "DPR", rmcEnabled: true });
  return json([]);
};
const Component = details ? before ? BeforeDprDetails : DprDetails : before ? BeforeSiteReport : SiteReport;
createRoot(document.getElementById("root")!).render(<QueryClientProvider client={queryClient}>
  <main className="min-h-[100dvh] bg-slate-100 px-4 py-6 text-slate-900 sm:px-6">
    <aside data-testid="fixture-evidence-notice" className="mx-auto mb-6 max-w-5xl rounded border border-amber-300 bg-amber-50 p-4 text-amber-950">
      <strong>DPR-VIEW-01 · {before ? "HEAD before" : "Working tree after"} · {details ? "DprDetails" : "SiteReport"}</strong>
      <p className="text-sm">Mockup DPR409 numbers, explicitly fixture-only. Not live auth. No production writes. {stress && "Audit-stress variation: synthetic long remarks and attachment."}</p>
    </aside>
    <Component />
  </main>
</QueryClientProvider>);