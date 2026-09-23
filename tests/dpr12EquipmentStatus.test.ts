import { describe, expect, it } from "vitest";
import fs from "node:fs";
import {
  buildFleetEquipmentStatus,
  equipmentStatusInputError,
  resolveFleetStatusDay,
  type EquipmentStatusRecord,
} from "../shared/equipmentStatus";
import { isMeaningfulEquipmentRow, isVisibleEquipmentRow } from "../shared/equipmentUsage";
import { evaluateDprSubmitReadiness } from "../shared/dprSubmitReadiness";
import { buildGuidedEquipmentPayload, splitGuidedEquipmentRow } from "../shared/guidedEquipment";

const record = (
  source: "dpr_log" | "plant_usage",
  recordId: number,
  status: EquipmentStatusRecord["status"],
  extra: Partial<EquipmentStatusRecord> = {},
): EquipmentStatusRecord => ({
  source,
  recordId,
  equipmentId: 7,
  date: "2026-09-01",
  status,
  reason: null,
  ...extra,
});

describe("DPR-12 equipment status contract", () => {
  it("requires a backend reason for every explicit non-working status", () => {
    expect(equipmentStatusInputError({ usageStatus: "working" })).toBeNull();
    expect(equipmentStatusInputError({ usageStatus: null })).toBeNull();
    expect(equipmentStatusInputError({
      usageStatus: "idle_no_work",
      usageStatusReason: " ",
    })).toMatch(/reason/i);
    expect(equipmentStatusInputError({
      usageStatus: "breakdown",
      usageStatusReason: "Hydraulic hose",
    })).toBeNull();
    expect(equipmentStatusInputError({ usageStatus: "parked" })).toMatch(/invalid/i);
  });

  it("retains a status-only row as meaningful operational evidence", () => {
    expect(isMeaningfulEquipmentRow({ usageStatus: "idle_no_operator" })).toBe(true);
    expect(isVisibleEquipmentRow({ usageStatus: "idle_no_operator" })).toBe(true);
  });

  it("blocks final submit without a non-working reason but does not flag a reasoned idle row as missing usage", () => {
    const missingReason = evaluateDprSubmitReadiness({
      equipment: [{ equipmentId: 7, machine: "EXCAVATOR 01", usageStatus: "idle_no_work" }],
    });
    expect(missingReason.mandatory).toEqual(expect.arrayContaining([
      expect.objectContaining({ section: "equipment", message: expect.stringMatching(/reason required/i) }),
    ]));

    const reasonedIdle = evaluateDprSubmitReadiness({
      equipment: [{
        equipmentId: 7,
        machine: "EXCAVATOR 01",
        usageStatus: "idle_no_operator",
        usageStatusReason: "Operator on leave",
      }],
    });
    expect(reasonedIdle.mandatory).toHaveLength(0);
    expect(reasonedIdle.advisories).toHaveLength(0);
  });

  it("round-trips status-only Guided draft fields through its passthrough payload", () => {
    const hydrated = splitGuidedEquipmentRow({
      id: 91,
      equipmentId: 7,
      machine: "EXCAVATOR 01",
      usageStatus: "breakdown",
      usageStatusReason: "Hydraulic hose",
    });
    expect(buildGuidedEquipmentPayload(hydrated)).toMatchObject({
      persistedId: 91,
      equipmentId: 7,
      usageStatus: "breakdown",
      usageStatusReason: "Hydraulic hose",
    });
  });

  it("keeps missing and legacy logged days distinct", () => {
    expect(resolveFleetStatusDay("2026-09-01", [])).toEqual({
      date: "2026-09-01",
      status: "not_logged",
      reason: null,
    });
    expect(resolveFleetStatusDay("2026-09-01", [
      record("dpr_log", 1, null),
    ])).toEqual({
      date: "2026-09-01",
      status: "logged_unspecified",
      reason: null,
      legacyLogged: true,
    });
  });

  it("deduplicates a DPR mirror in favour of its canonical plant usage", () => {
    const day = resolveFleetStatusDay("2026-09-01", [
      record("dpr_log", 11, null, { plantUsageId: 51 }),
      record("plant_usage", 51, "working"),
    ]);
    expect(day.status).toBe("working");
    expect(day.conflict).toBeUndefined();
  });

  it("retains independently visible DPR evidence when its linked plant source is absent", () => {
    const day = resolveFleetStatusDay("2026-09-01", [
      record("dpr_log", 11, "idle_no_work", {
        plantUsageId: 51,
        reason: "Awaiting survey clearance",
      }),
    ]);
    expect(day).toMatchObject({
      status: "idle_no_work",
      reason: "Awaiting survey clearance",
    });
  });

  it("surfaces cross-source conflicts and uses documented deterministic priority", () => {
    const day = resolveFleetStatusDay("2026-09-01", [
      record("dpr_log", 11, "working"),
      record("plant_usage", 52, "breakdown", { reason: "Tyre" }),
    ]);
    expect(day).toMatchObject({
      status: "breakdown",
      reason: "Tyre",
      conflict: true,
    });
    expect(day.records).toHaveLength(2);
  });

  it("includes masters with no records and counts every date as Not Logged", () => {
    const equipment = buildFleetEquipmentStatus([{
      id: 7,
      name: "EXCAVATOR 01",
      ownership: "hired",
      vendorName: "VENDOR",
      meterType: "hour_meter",
    }], [], "2026-09-01", "2026-09-03");
    expect(equipment[0].summary).toEqual({
      working: 0,
      idleNoWork: 0,
      idleNoOperator: 0,
      breakdown: 0,
      loggedUnspecified: 0,
      notLogged: 3,
    });
    expect(equipment[0].days).toHaveLength(3);
  });

  it("counts logged records without explicit status separately from truly unlogged dates", () => {
    const legacyDates = ["2026-08-26", "2026-08-28", "2026-08-29", "2026-08-30"];
    const records = legacyDates.map((date, index) => ({
      ...record("dpr_log", index + 1, null),
      date,
    }));
    const equipment = buildFleetEquipmentStatus([{
      id: 7,
      name: "HIRED EXCAVATOR",
      ownership: "hired",
      vendorName: "VENDOR",
      meterType: "hour_meter",
    }], [
      ...records,
      { ...record("plant_usage", 99, "working"), date: "2026-08-31" },
    ], "2026-08-01", "2026-08-31");

    expect(equipment[0].summary).toEqual({
      working: 1,
      idleNoWork: 0,
      idleNoOperator: 0,
      breakdown: 0,
      loggedUnspecified: 4,
      notLogged: 26,
    });
    expect(equipment[0].days.find(day => day.date === "2026-08-27")).toEqual({
      date: "2026-08-27",
      status: "not_logged",
      reason: null,
    });
  });

  it("uses only closed plant usage for strict DPR carry-forward, preserving inclusive Plant continuity", () => {
    const source = fs.readFileSync("server/storage.ts", "utf8");
    const start = source.indexOf("async resolveLatestPriorClosing");
    const resolver = source.slice(start, start + 6500);
    expect(resolver).toContain('...(!opts?.inclusive ? [eq(equipmentUsage.status, "closed")] : [])');
    expect(resolver).toContain("opts?.inclusive");
    expect(resolver).toContain("lte(equipmentUsage.date, beforeDate)");
  });
});