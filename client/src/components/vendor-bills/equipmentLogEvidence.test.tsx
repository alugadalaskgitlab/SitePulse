// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import * as XLSX from "xlsx";
import { mapAutoBillItem } from "@shared/vendorBillCandidates";
import { buildDprEquipmentTableDetails } from "@/components/DprEquipmentTableDetails";
import { consumptionForReadOnlyRow } from "@/components/DprEquipmentReadOnlyRow";
import EquipmentLogFacts from "./EquipmentLogFacts";
import { EQUIPMENT_LOG_COLUMNS, mapAutoBillItemWithEvidence, projectEquipmentLogEvidence, type EquipmentLogEvidence } from "./equipmentLogEvidence";
import { projectVendorBillPageItems } from "./wholeBillPageProjection";
import { billSectionTable, type WholeBillSnapshot } from "./wholeBillSnapshot";
import { buildWholeBillWorkbook, buildWholeBillPdf } from "./wholeBillExport";

const full = (): EquipmentLogEvidence => ({
  log: {
    entryType: "daily", openingReading: 2594.4, closingReading: 2595.5,
    hoursWorked: 1.1, startTime: "09:50", endTime: "17:13", diesel: 20,
    dieselSource: "plant_stock", openingDiesel: 30, dieselBalanceInTank: 38,
    dieselBalanceConfirmed: true, usageStatus: "working",
  },
  equipment: { meterType: "hour_meter", consumptionNorm: 9, hireDieselResponsibility: "vendor" },
});
afterEach(cleanup);

describe("VB-EXPORT-02 B equipment log evidence", () => {
  it("uses precisely the Site Report historical runtime, measured fuel, norm and >10% flags", () => {
    const evidence = full();
    const details = buildDprEquipmentTableDetails(evidence.log as any, evidence.equipment);
    const result = projectEquipmentLogEvidence(evidence);
    expect(result.consumption).toEqual(consumptionForReadOnlyRow(evidence.log as any, details));
    expect(result.consumption?.value).toBeCloseTo(12 / 1.1);
    render(<EquipmentLogFacts category="equipment" evidence={evidence} rowKey="full" />);
    const text = screen.getByTestId("equipment-log-facts-full").textContent;
    expect(text).toContain("1.1 h meter (2,594.4 → 2,595.5)");
    expect(text).toContain("09:50 – 17:13 (7.4 h)");
    expect(text).toContain("Diesel: vendor");
    expect(text).toContain("20 L");
    expect(text).toContain("10.9 L/hr (norm 9.0)");
    expect(screen.getByLabelText("More than 10% worse than norm").className).toContain("text-red-700");
  });
  it("converts vehicle consumption and norm to km/L through the DPR helper", () => {
    const evidence: EquipmentLogEvidence = {
      log: { openingReading: 84320, closingReading: 84402, totalKm: 82, diesel: 20, entryType: "daily" },
      equipment: { meterType: "odometer", consumptionNorm: 1 / 4.5 },
    };
    const result = projectEquipmentLogEvidence(evidence);
    expect(result.lines).toContain("82 km (84,320 → 84,402)");
    expect(result.columns).toMatchObject({ Consumption: "4.1 km/L", Norm: "4.5" });
  });
  it("keeps normalized plant usage runtime and fuel on the DPR historical path, not the bill quantity", () => {
    const evidence = full();
    evidence.log.hoursWorked = 2.6;
    const result = projectEquipmentLogEvidence(evidence);
    expect(result.columns["Meter hours/km"]).toBe("2.6 h");
    expect(result.consumption?.value).toBeCloseTo(12 / 2.6);
    expect(result.columns.Consumption).toBe("4.6 L/hr");
  });
  it.each(["closing", "norm", "diesel"] as const)("omits consumption with missing %s despite saved hours", missing => {
    const evidence = full();
    if (missing === "closing") evidence.log.closingReading = null;
    if (missing === "norm") evidence.equipment!.consumptionNorm = null;
    if (missing === "diesel") {
      evidence.log.diesel = null; evidence.log.dieselBalanceConfirmed = false;
    }
    const result = projectEquipmentLogEvidence(evidence);
    expect(result.consumption).toBeNull();
    expect(result.columns.Consumption).toBeNull();
    expect(result.columns.Norm).toBeNull();
    expect(result.columns["Deviation %"]).toBeNull();
    render(<EquipmentLogFacts category="equipment" evidence={evidence} rowKey="missing" />);
    expect(screen.queryByTestId("equipment-log-consumption-missing")).toBeNull();
    expect(screen.getByTestId("equipment-log-facts-missing").textContent).not.toMatch(/—|null|undefined/);
    if (missing === "closing") {
      expect(result.columns["Meter hours/km"]).toBeNull();
      expect(result.lines).toContain("Opening reading: 2,594.4");
    }
  });
  it.each(["breakdown", "idle_no_work", "idle_no_operator"] as const)("shows %s and its stored reason without consumption", usageStatus => {
    const evidence = full();
    evidence.log.usageStatus = usageStatus;
    evidence.log.usageStatusReason = "Hydraulic hose awaiting repair";
    render(<EquipmentLogFacts category="equipment" evidence={evidence} rowKey="stopped" />);
    expect(screen.getByTestId("equipment-log-facts-stopped").textContent).toContain(
      `${usageStatus === "breakdown" ? "Breakdown" : "Idle"} — Hydraulic hose awaiting repair`);
    expect(screen.queryByTestId("equipment-log-consumption-stopped")).toBeNull();
    expect(projectEquipmentLogEvidence(evidence).columns).toMatchObject({
      Status: usageStatus === "breakdown" ? "Breakdown" : "Idle",
      "Status reason": "Hydraulic hose awaiting repair",
    });
  });
  it("uses stored liability, never fuel source, and retains known zero litres and partial clock", () => {
    const evidence: EquipmentLogEvidence = {
      log: { dieselSource: "contractor", diesel: 0, startTime: "09:50" }, equipment: null,
    };
    const result = projectEquipmentLogEvidence(evidence);
    expect(result.lines).toEqual(["Clock in: 09:50", "0 L"]);
    expect(result.columns["Diesel scope"]).toBeNull();
    evidence.equipment = { hireDieselResponsibility: "hlc" };
    expect(projectEquipmentLogEvidence(evidence).lines).toContain("Diesel: HLC");
  });
  it("preserves the DPR amber flag and inclusive 10% boundary", () => {
    const evidence = full();
    evidence.log.dieselBalanceConfirmed = false;
    evidence.log.diesel = 7;
    render(<EquipmentLogFacts category="equipment" evidence={evidence} rowKey="amber" />);
    expect(screen.getByLabelText("More than 10% better than norm; check readings").className).toContain("text-amber-700");
    evidence.log.diesel = 1.1 * 9 * 1.1;
    expect(projectEquipmentLogEvidence(evidence).consumption?.flag).toBe("ok");
  });
  it("keeps the shared mapper financial/source output identical and evidence through copies", () => {
    const raw = { date: "2026-09-12", category: "equipment", description: "JCB-SITE", qty: 2.6,
      unit: "HRS", rate: 873.5, sourceType: "dpr_log", sourceId: 7312, equipmentLogEvidence: full() };
    const before = JSON.stringify(raw);
    const mapped = mapAutoBillItemWithEvidence(raw);
    const { equipmentLogEvidence, ...base } = mapped;
    expect(base).toEqual(mapAutoBillItem(raw));
    expect(equipmentLogEvidence).toBe(raw.equipmentLogEvidence);
    expect({ ...mapped, source: "manual" }.equipmentLogEvidence).toBe(raw.equipmentLogEvidence);
    projectEquipmentLogEvidence(equipmentLogEvidence);
    expect(JSON.stringify(raw)).toBe(before);
  });
  it("omits facts for material rows and absent evidence", () => {
    const { container } = render(<EquipmentLogFacts category="material" evidence={full()} rowKey="material" />);
    expect(container.innerHTML).toBe("");
    expect(projectEquipmentLogEvidence(null).lines).toEqual([]);
  });
  it("exports the eleven independent columns with UI values and no financial changes in XLSX/PDF", () => {
    const evidence = full();
    const items = [{ date: "2026-09-12", category: "equipment", description: "JCB-SITE", qty: 2.6,
      unit: "HRS", rate: 873.5, amount: 2271.1, siteName: "SITE · RING ROAD", equipmentLogEvidence: evidence }];
    const before = JSON.stringify(items);
    const sections = projectVendorBillPageItems({
      items, shouldGroup: true, subtotals: { equipment: 2271.1 }, getLabourSource: () => "site",
      getSiteLabel: item => item.siteName || null, formatDate: date => date || "",
    });
    const equipment = sections.find(section => section.category === "equipment")!;
    const table = billSectionTable(equipment);
    expect(table.headers.filter(header => EQUIPMENT_LOG_COLUMNS.includes(header as any))).toEqual(EQUIPMENT_LOG_COLUMNS);
    const row = table.values.find(row => row[2] === "JCB-SITE")!;
    const projection = projectEquipmentLogEvidence(evidence);
    for (const header of EQUIPMENT_LOG_COLUMNS) expect(row[table.headers.indexOf(header)]).toEqual(projection.columns[header]);
    expect(row.slice(-4)).toEqual([2.6, "HRS", 873.5, 2271.1]);
    const snapshot: WholeBillSnapshot = {
      companyName: "HLC", vendorName: "RAVI HIRE", billNo: "VB-731", billDate: "2026-10-04",
      periodFrom: "2026-09-01", periodTo: "2026-09-30", site: "RING ROAD", billType: "all", billTypeLabel: "All Types (Combined)",
      status: "verified", saved: true, generatedAt: "2026-10-04T10:00:00Z",
      sections, calendars: [], totals: { subtotal: 2271.1, gst: [], totalGst: 0,
        adjustments: [], tds: { label: "IT TDS", amount: 0 }, netPayable: 2271.1 },
    };
    const workbook = buildWholeBillWorkbook(snapshot);
    const sheet = XLSX.utils.sheet_to_json(workbook.Sheets.Equipment, { header: 1, defval: null }) as unknown[][];
    expect(sheet[1]).toEqual(table.headers);
    expect(sheet.find(row => row[2] === "JCB-SITE")).toEqual(row);
    const pdf = buildWholeBillPdf(snapshot).output();
    const pdfText = Array.from(pdf.matchAll(/\(([^)]*)\) Tj/g)).map(match => match[1]).join(" ");
    // PDF table headers may wrap inside words in this wide evidence table.
    expect(pdfText.replace(/\s/g, "")).toContain("Openingreading");
    expect(pdfText.replace(/\s/g, "")).toContain("DieselissuedL");
    expect(JSON.stringify(items)).toBe(before);
  });
});