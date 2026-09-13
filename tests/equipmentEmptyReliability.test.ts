import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { isMeaningfulEquipmentRow, isVisibleEquipmentRow, meaningfulEquipmentRows, visibleEquipmentRows } from "../shared/equipmentUsage";
import { buildEquipmentPerformanceReport } from "../shared/equipmentPerformance";
import { evaluateDprSubmitReadiness } from "../shared/dprSubmitReadiness";

describe("equipment empty-row reliability", () => {
  it("drops only default placeholders while retaining explicit zero readings and linked evidence", () => {
    const empty = {
      machine: "", operator: "Operator name", entryType: "time_meter",
      startTime: "08:00", diesel: 0,
    };
    expect(isMeaningfulEquipmentRow({ ...empty, startTime: "" })).toBe(false);
    // Existing/history rows have no client-side provenance flag, so a
    // timestamp is always treated as intentional evidence by the shared rule.
    expect(isMeaningfulEquipmentRow(empty)).toBe(true);
    expect(isMeaningfulEquipmentRow({ ...empty, openingReading: 0, closingReading: 0 })).toBe(true);
    expect(isMeaningfulEquipmentRow({ ...empty, entryType: "idle" })).toBe(true);
    expect(isMeaningfulEquipmentRow({ ...empty, activityAllocations: [{ boqItemId: 5 }] })).toBe(true);
    expect(isMeaningfulEquipmentRow({ ...empty, breakdowns: [{ description: "Hydraulic leak" }] })).toBe(true);
    expect(isMeaningfulEquipmentRow({ ...empty, plantUsageId: 12 })).toBe(true);
    expect(meaningfulEquipmentRows([{ ...empty, startTime: "" }, { ...empty, openingReading: 0 }])).toHaveLength(1);
  });

  it("retains ambiguous legacy start-only history for editing but suppresses its known auto-prefill shape on read", () => {
    const oldSiteEntryPlaceholder = {
      machine: "Operating", vehicleNo: "", operator: "Operator name",
      entryType: "time_meter", startTime: "08:00", endTime: "",
      hoursWorked: 0, diesel: 0,
    };
    expect(isMeaningfulEquipmentRow(oldSiteEntryPlaceholder)).toBe(true);
    expect(isVisibleEquipmentRow(oldSiteEntryPlaceholder)).toBe(false);
    expect(isVisibleEquipmentRow({ ...oldSiteEntryPlaceholder, equipmentId: 21 })).toBe(true);
    expect(isVisibleEquipmentRow({ ...oldSiteEntryPlaceholder, openingReading: 0 })).toBe(true);
    expect(isVisibleEquipmentRow({ ...oldSiteEntryPlaceholder, openingDiesel: 0 })).toBe(true);
    expect(isVisibleEquipmentRow({ ...oldSiteEntryPlaceholder, activityAllocations: [{ boqItemId: 5 }] })).toBe(true);
    expect(isVisibleEquipmentRow({ ...oldSiteEntryPlaceholder, breakdowns: [{ description: "Leak" }] })).toBe(true);
  });

  it("builds a child-aware read collection for every DPR view", () => {
    const legacyPlaceholder = {
      id: 1, machine: "Operating", vehicleNo: "", operator: "Operator name",
      entryType: "time_meter", startTime: "08:00", endTime: "", hoursWorked: 0, diesel: 0,
    };
    const visible = visibleEquipmentRows([
      legacyPlaceholder,
      { ...legacyPlaceholder, id: 2, breakdowns: [{ description: "Hydraulic leak" }] },
      { ...legacyPlaceholder, id: 3, activityAllocations: [{ boqItemId: 17 }] },
    ]);
    expect(visible.map((row: any) => row.id)).toEqual([2, 3]);
  });

  it("requests source correction, rather than dropping meaningful identity-less evidence", () => {
    const readiness = evaluateDprSubmitReadiness({
      equipment: [{ machine: "", operator: "Operator", openingReading: 0, closingReading: 0 }],
    });
    expect(readiness.mandatory).toContainEqual(expect.objectContaining({
      section: "equipment",
      rowIndex: 0,
      message: expect.stringContaining("identity missing"),
    }));
  });

  it("suppresses legacy empty logs in both activity and identification review, including no-work DPRs", () => {
    const report = buildEquipmentPerformanceReport({
      projects: [{ id: 1, name: "No Work Site", status: "active" }],
      dprs: [{ id: 1, date: "2026-08-21", site: "NoSiteWork", boqProjectId: 1, dprStatus: "submitted" }],
      masters: [],
      usages: [],
      logs: [
        { id: 1, dprId: 1, machine: "Operating", operator: "Operator name", entryType: "time_meter", startTime: "08:00", hoursWorked: 0, diesel: 0 },
        { id: 2, dprId: 1, machine: "", openingReading: 0, closingReading: 0 },
      ],
    });
    expect(report.totals.eventCount).toBe(1);
    expect(report.reviewRows).toEqual([expect.objectContaining({ logId: 2 })]);
  });

  it("keeps blank parents when direct report input carries separate stoppages or allocations", () => {
    const report = buildEquipmentPerformanceReport({
      projects: [{ id: 1, name: "No Work Site", status: "active" }],
      dprs: [{ id: 1, date: "2026-08-21", site: "NoSiteWork", boqProjectId: 1, dprStatus: "submitted" }],
      masters: [],
      usages: [],
      logs: [
        { id: 1, dprId: 1, machine: "", operator: "Operator name", entryType: "time_meter" },
        { id: 2, dprId: 1, machine: "", operator: "Operator name", entryType: "time_meter", activityAllocations: [{ boqItemId: 7 }] },
        { id: 3, dprId: 1, machine: "", operator: "Operator name", entryType: "time_meter" },
      ],
      breakdowns: [{ sourceType: "dpr_log", sourceRecordId: 3, description: "Hydraulic leak" }],
    });
    expect(report.events.map((event) => event.reference.equipmentLogId)).toEqual([2, 3]);
  });

  it("uses the same filter on create, replace/edit, version, and clone paths while retaining omitted linked children", () => {
    const storage = fs.readFileSync(path.resolve("server/storage.ts"), "utf8");
    expect(storage).toContain("equipment: meaningfulEquipmentRows(dprData.equipment");
    expect(storage).toContain("const preservedEquipmentInputs = await this.preserveOmittedEquipmentAllocationsTx");
    expect(storage).toContain("const equipmentInputs = meaningfulEquipmentRows(preservedEquipmentInputs)");
    expect(storage).toContain("const clonePairs = (original.equipment as any[]).map");
    expect(storage).toContain("const cloneEquipmentInputs = clonePairs.map");
    expect(storage).toContain("_preserveLinkedChildren");
    expect(storage).toContain("linkedBreakdownRows");
  });

  it("uses visible equipment for detail, dashboard, admin report, preview, hub, copy, and planning read paths", () => {
    const detail = fs.readFileSync(path.resolve("client/src/pages/DprDetails.tsx"), "utf8");
    const dashboard = fs.readFileSync(path.resolve("client/src/pages/SiteDashboard.tsx"), "utf8");
    const admin = fs.readFileSync(path.resolve("client/src/pages/AdminReports.tsx"), "utf8");
    const preview = fs.readFileSync(path.resolve("client/src/components/DprPreviewDialog.tsx"), "utf8");
    const hub = fs.readFileSync(path.resolve("client/src/pages/EquipmentHub.tsx"), "utf8");
    const copy = fs.readFileSync(path.resolve("client/src/lib/sameAsYesterday.ts"), "utf8");
    const planning = fs.readFileSync(path.resolve("client/src/pages/WorkDemand.tsx"), "utf8");
    expect(detail).toContain("const visibleEquipment = useMemo");
    expect(detail).toContain("visibleEquipment.length === 0");
    expect(dashboard).toContain("visibleEquipment: visibleEquipmentRows(dpr.equipment)");
    expect(dashboard).toContain("dpr.visibleEquipment.map");
    expect(admin).toContain("visibleEquipment: visibleEquipmentRows(dpr.equipment)");
    expect(admin).toContain("dpr.visibleEquipment.forEach");
    expect(preview).toContain("const visibleEquipment = visibleEquipmentRows(dpr?.equipment)");
    expect(hub).toContain("visibleEquipmentRows(d.equipment)");
    expect(copy).toContain("equipment: visibleEquipmentRows(dpr.equipment)");
    expect(planning).toContain("for (const eq of visibleEquipmentRows(dpr.equipment))");
  });

  it("keeps Field Home and Guided read summaries on the stricter visible rule, not write retention", () => {
    const fieldHome = fs.readFileSync(path.resolve("client/src/pages/FieldHome.tsx"), "utf8");
    const checklist = fs.readFileSync(path.resolve("shared/dprFieldChecklist.ts"), "utf8");
    const guided = fs.readFileSync(path.resolve("client/src/pages/GuidedDpr.tsx"), "utf8");
    expect(fieldHome).toContain("const visibleMyEquipment = visibleEquipmentRows(myDpr?.equipment)");
    expect(fieldHome).toContain("const eqEntries = visibleMyEquipment");
    expect(checklist).toContain("const equipment = visibleEquipmentRows(dpr?.equipment)");
    expect(checklist).toContain("const eqCount = equipment.length");
    expect(guided).toContain("isVisibleEquipmentRow");
    expect(guided).toContain("yesterdayDpr.equipment ?? []).filter((e: any) => isVisibleEquipmentRow(e)");
  });
});