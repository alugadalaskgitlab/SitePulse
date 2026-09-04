import { describe, expect, it } from "vitest";
import {
  buildEquipmentPerformanceReport,
  normalizeEquipmentLabel,
  suggestEquipment,
} from "../shared/equipmentPerformance";

const projects = [
  { id: 10, name: "Live Road", status: "active" },
  { id: 20, name: "Closed Road", status: "closed" },
];
const dprs = [
  { id: 100, date: "2026-01-01", site: "Site A", boqProjectId: 10, dprStatus: "submitted" },
  { id: 101, date: "2026-01-03", site: "Site A", boqProjectId: 10, dprStatus: "submitted" },
  { id: 200, date: "2026-01-02", site: "Old Site", boqProjectId: 20, dprStatus: "submitted" },
];
const masters = [
  { id: 1, name: "JCB 3DX", registrationNumber: "TS-01 AB 1000", ownership: "owned", equipmentType: "Excavator", meterType: "hour_meter", consumptionNorm: 5, isActive: 1 },
  { id: 2, name: "Water Tanker", ownership: "hired", equipmentType: "Tanker", meterType: "odometer", consumptionNorm: 0.25, hireStartDate: "2026-01-01", hireEndDate: "2026-01-05", isActive: 1 },
];

describe("EQUIP-01 pure equipment performance report", () => {
  it("counts a concrete linked pair once and computes canonical meter diesel", () => {
    const report = buildEquipmentPerformanceReport({
      projects, dprs, masters,
      usages: [{ id: 700, date: "2026-01-01", equipmentId: 1, openingReading: 10, closingReading: 14, dieselIssued: 22, task: "Excavate" }],
      logs: [{ id: 900, dprId: 100, machine: "JCB 3DX", equipmentId: 1, plantUsageId: 700, openingReading: 10, closingReading: 14, diesel: 22 }],
    });
    expect(report.events).toHaveLength(1);
    expect(report.events[0]).toMatchObject({
      key: "plant_usage:700", source: "plant_usage", confidence: "linked",
      scope: "site", site: "Site A",
      runtimeHours: 4, dieselExpected: 20, dieselActual: 22, dieselBasis: "issued_only", dieselVariance: 2,
      reference: { dprId: 100, equipmentLogId: 900, plantUsageId: 700 },
    });
    expect(report.projects[0]).toMatchObject({ eventCount: 1, linkedCount: 1 });
    expect(report.totals).toMatchObject({ eventCount: 1, dieselActual: 22, dieselExpected: 20, dieselVariance: 2 });
  });

  it("does not let an invalid link suppress a log and keeps missing identities visible", () => {
    const report = buildEquipmentPerformanceReport({
      projects, dprs, masters, usages: [],
      logs: [
        { id: 901, dprId: 100, machine: "JCB", equipmentId: 1, plantUsageId: 999999, openingReading: 1, closingReading: 2 },
        { id: 902, dprId: 100, machine: "Water---Tanker", equipmentId: null, openingReading: 100, closingReading: 120 },
      ],
    });
    expect(report.events.map((event) => event.confidence)).toEqual(["confirmed_legacy_match", "unclassified"]);
    expect(report.projects[0]).toMatchObject({ eventCount: 2, linkedCount: 0, confirmedLegacyCount: 1, unclassifiedCount: 1 });
    expect(report.events[1].suggestions[0]).toMatchObject({ equipmentId: 2, match: "exact" });
    expect(report.reviewRows).toEqual([expect.objectContaining({ logId: 902, machine: "Water---Tanker", usageValue: 20 })]);
    expect(report.fleet.find((row) => row.equipmentId === null)).toMatchObject({
      key: "unclassified:water tanker", confidence: "unclassified", eventCount: 1, activeDays: 1,
    });
  });

  it("keeps explicit DPR attribution and includes no-DPR plant usage without guessing a project", () => {
    const report = buildEquipmentPerformanceReport({
      projects, dprs, masters,
      usages: [
        { id: 701, date: "2026-01-01", equipmentId: 1, dprId: 100 },
        { id: 702, date: "2026-01-02", equipmentId: 1, dprId: 200 },
        { id: 703, date: "2026-01-02", equipmentId: 1, siteName: "HMP PLANT", plantName: "Main Plant" },
        { id: 717, date: "2026-01-02", equipmentId: 1, siteName: "Site A", plantName: "Main Plant" },
        { id: 720, date: "2026-01-02", equipmentId: 1, siteName: "Plant Road", plantName: "Main Plant" },
      ],
      logs: [],
    });
    expect(report.events.map((event) => event.key)).toEqual(["plant_usage:701", "plant_usage:703"]);
    expect(report.events[0]).toMatchObject({
      key: "plant_usage:701", scope: "site", site: "Site A", projectId: 10, project: "Live Road",
    });
    expect(report.events[1]).toMatchObject({
      key: "plant_usage:703", scope: "plant", site: "HMP PLANT",
      plant: "Main Plant", projectId: null, project: "Plant Operations / HMP",
      reference: { dprId: null, plantUsageId: 703 },
    });
    expect(report.events.some((event) => event.key === "plant_usage:702")).toBe(false);
    expect(report.events.some((event) => event.key === "plant_usage:717")).toBe(false);
    expect(report.events.some((event) => event.key === "plant_usage:720")).toBe(false);
    expect(report.projects[0].historyFrom).toBe("2026-01-01");
  });

  it("uses confirmed physical tank consumption for diesel variance and efficiency", () => {
    const report = buildEquipmentPerformanceReport({
      projects, dprs, masters,
      usages: [{
        id: 714, date: "2026-01-01", equipmentId: 1, dprId: 100,
        openingReading: 10, closingReading: 14,
        openingDiesel: 40, dieselIssued: 60, closingDiesel: 25,
        dieselBalanceConfirmed: true,
      }],
      logs: [],
    });
    expect(report.events[0]).toMatchObject({
      dieselActual: 75,
      dieselBasis: "tank_measured",
      dieselExpected: 20,
      dieselVariance: 55,
      efficiencyPercent: 20 / 75 * 100,
      actualConsumptionRate: 75 / 4,
    });
    expect(report.fleet[0]).toMatchObject({
      dieselActual: 75, dieselBasis: "tank_measured", efficiencyPercent: 20 / 75 * 100,
    });
    expect(report.totals).toMatchObject({
      dieselActual: 75, dieselBasis: "tank_measured", efficiencyPercent: 20 / 75 * 100,
    });
  });

  it("falls back to clearly-classified issued fuel when tank readings are not confirmed", () => {
    const report = buildEquipmentPerformanceReport({
      projects, dprs, masters,
      usages: [{
        id: 715, date: "2026-01-01", equipmentId: 1, dprId: 100,
        openingReading: 10, closingReading: 14,
        openingDiesel: 40, dieselIssued: 60, closingDiesel: 25,
        dieselBalanceConfirmed: false,
      }],
      logs: [],
    });
    expect(report.events[0]).toMatchObject({
      dieselActual: 60,
      dieselBasis: "issued_only",
      dieselExpected: 20,
      dieselVariance: 40,
      efficiencyPercent: 20 / 60 * 100,
    });
    expect(report.totals.dieselBasis).toBe("issued_only");
  });

  it("prefers the confirmed physical balance over a legacy derived closing value", () => {
    const report = buildEquipmentPerformanceReport({
      projects, dprs, masters,
      usages: [{
        id: 716, date: "2026-01-01", equipmentId: 1,
        plantName: "Main Plant",
        openingDiesel: 20, dieselIssued: 0, closingDiesel: 17,
        dieselBalanceInTank: 14, dieselBalanceConfirmed: true,
      }],
      logs: [],
    });
    expect(report.events[0]).toMatchObject({
      projectId: null, project: "Plant Operations / HMP",
      dieselActual: 6, dieselBasis: "tank_measured",
    });
  });

  it("keeps aggregate expected diesel and efficiency on the same diesel-available rows", () => {
    const report = buildEquipmentPerformanceReport({
      projects, dprs, masters,
      usages: [
        {
          id: 718, date: "2026-01-01", equipmentId: 1, dprId: 100,
          openingReading: 10, closingReading: 14,
          openingDiesel: 40, dieselIssued: 60, closingDiesel: 25,
          dieselBalanceConfirmed: true,
        },
        {
          id: 719, date: "2026-01-03", equipmentId: 1, dprId: 101,
          openingReading: 14, closingReading: 18,
          dieselIssued: null,
        },
      ],
      logs: [],
    });
    expect(report.events[1]).toMatchObject({ dieselActual: null, dieselExpected: 20, dieselBasis: "unavailable" });
    expect(report.fleet[0]).toMatchObject({
      dieselActual: 75, dieselExpected: 20, dieselVariance: 55,
      efficiencyPercent: 20 / 75 * 100, dieselBasis: "tank_measured",
    });
    expect(report.totals).toMatchObject({
      dieselActual: 75, dieselExpected: 20, dieselVariance: 55,
      efficiencyPercent: 20 / 75 * 100, dieselBasis: "tank_measured",
    });
  });

  it("keeps total diesel while excluding missing-norm rows from comparative metrics", () => {
    const report = buildEquipmentPerformanceReport({
      projects, dprs,
      masters: [{ ...masters[0], consumptionNorm: null }],
      usages: [
        {
          id: 721, date: "2026-01-01", equipmentId: 1, dprId: 100,
          openingReading: 10, closingReading: 14, dieselIssued: 30,
        },
      ],
      logs: [],
    });
    expect(report.fleet[0]).toMatchObject({
      dieselActual: 30,
      dieselComparedActual: null,
      dieselExpected: null,
      dieselVariance: null,
      efficiencyPercent: null,
      dieselComparisonIncomplete: true,
    });
    expect(report.totals).toMatchObject({
      dieselActual: 30,
      dieselComparedActual: 0,
      dieselExpected: 0,
      dieselVariance: 0,
      efficiencyPercent: null,
      dieselComparisonIncomplete: true,
    });
  });

  it("keeps project history anchored to its first event when the display window is filtered", () => {
    const report = buildEquipmentPerformanceReport({
      projects, dprs, masters,
      usages: [
        { id: 712, date: "2026-01-01", equipmentId: 1, dprId: 100 },
        { id: 713, date: "2026-01-03", equipmentId: 1, dprId: 101 },
      ],
      logs: [],
      filters: { dateFrom: "2026-01-03" },
    });
    expect(report.events.map((event) => event.date)).toEqual(["2026-01-03"]);
    expect(report.projects[0].historyFrom).toBe("2026-01-01");
  });

  it("sorts machine history chronologically and derives hired versus owned fields", () => {
    const report = buildEquipmentPerformanceReport({
      projects, dprs, masters,
      usages: [
        { id: 704, date: "2026-01-03", equipmentId: 1, dprId: 101 },
        { id: 705, date: "2026-01-01", equipmentId: 1, dprId: 100 },
        { id: 706, date: "2026-01-01", equipmentId: 2, dprId: 100 },
        { id: 707, date: "2026-01-03", equipmentId: 2, dprId: 101 },
      ],
      logs: [], asOfDate: "2026-01-05",
    });
    expect(report.events.map((event) => event.date)).toEqual(["2026-01-01", "2026-01-01", "2026-01-03", "2026-01-03"]);
    const owned = report.fleet.find((row) => row.equipmentId === 1)!;
    const hired = report.fleet.find((row) => row.equipmentId === 2)!;
    expect(owned).toMatchObject({ ownership: "owned", owned: { daysSinceLastUse: 2 } });
    expect(owned).not.toHaveProperty("hired");
    expect(hired).toMatchObject({ ownership: "hired", hired: { elapsedDays: 5, usedDays: 2, gapDays: 3, utilizationPercent: 40 } });
    expect(hired).not.toHaveProperty("owned");
    expect(hired).toMatchObject({ runtimeHours: 0, totalKm: 0, trips: 0, efficiencyPercent: null });
  });

  it("uses trip math from computeEquipmentUsage directly", () => {
    const report = buildEquipmentPerformanceReport({
      projects, dprs, masters,
      usages: [{ id: 708, date: "2026-01-01", equipmentId: 2, dprId: 100, entryType: "trip_based", numberOfTrips: 3, tripDistance: 8, dieselIssued: 13 }],
      logs: [],
    });
    expect(report.events[0]).toMatchObject({
      usageBasis: "trip_based", trips: 3, totalKm: 48, dieselExpected: 12,
      actualConsumptionRate: 13 / 48, efficiencyPercent: 12 / 13 * 100, dieselEfficiencyUnit: "L/km",
    });
  });

  it("returns active filter options even when that project has no events", () => {
    const report = buildEquipmentPerformanceReport({ projects, dprs: [], masters, usages: [], logs: [] });
    expect(report.filterOptions).toMatchObject({
      projects: [{ id: 10, name: "Live Road" }],
      ownership: ["hired", "owned"],
      equipmentTypes: ["Excavator", "Tanker"],
      equipment: expect.arrayContaining([{ id: 1, name: "JCB 3DX", registrationNumber: "TS-01 AB 1000" }]),
      scopes: [
        { value: "site", label: "Site / road operations" },
        { value: "plant", label: "Plant / HMP / RMC operations" },
      ],
    });
    expect(report.projects).toEqual([]);
    expect(report.totals.eventCount).toBe(0);
  });

  it("limits suggestions and filter options to the caller-visible master subset", () => {
    const report = buildEquipmentPerformanceReport({
      projects, dprs, masters, filterMasters: [masters[0]], usages: [],
      logs: [{ id: 909, dprId: 100, machine: "Water Tanker", equipmentId: null }],
    });
    expect(report.filterOptions.equipment).toEqual([
      { id: 1, name: "JCB 3DX", registrationNumber: "TS-01 AB 1000" },
    ]);
    expect(report.reviewRows[0].suggestions).toEqual([]);
  });

  it("does not calculate hired utilization or gaps without both hire-window dates", () => {
    const report = buildEquipmentPerformanceReport({
      projects, dprs,
      masters: [{ ...masters[1], hireStartDate: null, hireEndDate: null }],
      usages: [{ id: 710, date: "2026-01-01", equipmentId: 2, dprId: 100 }],
      logs: [],
      asOfDate: "2026-01-05",
    });
    expect(report.fleet[0].hired).toMatchObject({
      elapsedDays: null, usedDays: null, gapDays: null, utilizationPercent: null,
    });
    expect(report.fleet[0].dataQualityWarnings).toContain(
      "Hire start and end dates are required before utilization or gap days can be calculated.",
    );
  });

  it("attaches only exact-source breakdown notes to the represented event", () => {
    const report = buildEquipmentPerformanceReport({
      projects, dprs, masters,
      usages: [{ id: 711, date: "2026-01-01", equipmentId: 1, dprId: 100 }],
      logs: [],
      breakdowns: [
        { sourceType: "plant_usage", sourceRecordId: 711, description: "Hydraulic hose", fromTime: "10:00", toTime: "11:00", remarks: "Replaced" },
        { sourceType: "plant_usage", sourceRecordId: 999, description: "Wrong event" },
      ],
    });
    expect(report.events[0].breakdownNotes).toEqual(["Hydraulic hose · 10:00–11:00 · Replaced"]);
  });
});

describe("EQUIP-01 historical suggestions", () => {
  it("normalizes case, punctuation and whitespace without fuzzy matching", () => {
    expect(normalizeEquipmentLabel("  JCB---3DX!! ")).toBe("jcb 3dx");
    expect(suggestEquipment("ts01 ab1000", masters)).toEqual([]);
    expect(suggestEquipment("water tanker hired", masters)[0]).toMatchObject({ equipmentId: 2, match: "substring" });
  });
});