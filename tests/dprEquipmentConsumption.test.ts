import { describe, expect, it } from "vitest";
import { CONSUMPTION_FLAG_PCT, resolveDprRowConsumption, type DprRowConsumptionInput } from "../shared/dprEquipmentConsumption";

const row = (patch: Partial<DprRowConsumptionInput> = {}) => resolveDprRowConsumption({
  runtime: 5, efficiencyUnit: "L/hr", dieselIssued: 60, actualConsumed: 50,
  dieselBalanceConfirmed: false, norm: 10, savedNorm: null, ...patch,
});

describe("read-only DPR consumption", () => {
  it("uses issued without confirmation and measured with confirmation", () => {
    expect(row()).toMatchObject({ basis: "issued", value: 12, flag: "worse" });
    expect(row({ dieselBalanceConfirmed: true })).toMatchObject({ basis: "measured", value: 10, flag: "ok" });
  });
  it("prefers canonical measured result", () => {
    expect(row({ canonical: { state: "available", rate: 9, unit: "L/hr" }, dieselBalanceConfirmed: true }))
      .toMatchObject({ basis: "measured", value: 9, flag: "ok" });
  });
  it.each(["unavailable", "pending", "loading"])("uses row evidence when canonical is %s", state => {
    expect(row({ canonical: { state } })).toMatchObject({ basis: "issued", value: 12 });
    expect(row({ canonical: { state }, dieselBalanceConfirmed: true })).toMatchObject({ basis: "measured", value: 10 });
  });
  it("converts vehicle value and norm and reverses the deviation direction", () => {
    expect(row({ runtime: 100, dieselIssued: 25, efficiencyUnit: "L/km", norm: 0.2 }))
      .toMatchObject({ value: 4, norm: 5, displayUnit: "km/L", deviationPct: 20, flag: "worse" });
    expect(row({ canonical: { state: "available", rate: 0.2, unit: "L/km" }, norm: 0.2 }))
      .toMatchObject({ value: 5, norm: 5, basis: "measured" });
  });
  it.each([[11, "ok"], [9, "ok"], [11.5, "worse"], [8.8, "better_check"], [10.8, "ok"]] as const)(
    "flags machine rate %s as %s", (rate, flag) => {
      expect(CONSUMPTION_FLAG_PCT).toBe(10);
      expect(row({ dieselIssued: rate * 5 }).flag).toBe(flag);
    });
  it.each([[4.5, "ok"], [5.5, "ok"], [4.4, "worse"], [5.6, "better_check"]] as const)(
    "flags vehicle efficiency %s as %s", (value, flag) => {
      expect(row({ efficiencyUnit: "L/km", norm: 0.2, runtime: 100, dieselIssued: 100 / value }).flag).toBe(flag);
    });
  it.each([null, 0, -1, NaN, Infinity])("handles invalid runtime %s", runtime => {
    expect(row({ runtime })).toMatchObject({ basis: "incomplete", value: null, reason: "hours/km not available", flag: null });
  });
  it("explains absent closing reading including a zero opening", () => {
    expect(row({ runtime: null, openingReading: 0, closingReading: null }).reason).toBe("closing reading missing");
  });
  it.each([null, 0, -1, NaN, Infinity])("handles missing/invalid diesel %s", dieselIssued => {
    expect(row({ dieselIssued })).toMatchObject({ basis: "incomplete", value: null, reason: "no diesel recorded" });
  });
  it("identifies vendor-provided diesel without inventing consumption", () => {
    expect(row({ dieselSource: "contractor", dieselIssued: null }).reason).toBe("diesel by vendor");
  });
  it("uses saved norm only as a fallback", () => {
    expect(row({ norm: null, savedNorm: 12 })).toMatchObject({ norm: 12, flag: "ok" });
    expect(row({ norm: 10, savedNorm: 12 }).norm).toBe(10);
    expect(row({ norm: 0, savedNorm: -1 })).toMatchObject({ norm: null, deviationPct: null, flag: null });
  });
  it("allows measured zero L/hr but never divides by zero for vehicles", () => {
    expect(row({ actualConsumed: 0, dieselBalanceConfirmed: true })).toMatchObject({ value: 0, flag: "better_check" });
    expect(row({ actualConsumed: 0, dieselBalanceConfirmed: true, efficiencyUnit: "L/km" }))
      .toMatchObject({ basis: "incomplete", value: null, reason: "no diesel consumed" });
  });
  it("ignores invalid canonical or consumed values and uses valid issued evidence", () => {
    expect(row({ canonical: { state: "available", rate: NaN, unit: "L/hr" } }).basis).toBe("issued");
    expect(row({ dieselBalanceConfirmed: true, actualConsumed: -1 }).basis).toBe("issued");
  });
  it("guards missing units and overflow", () => {
    expect(row({ efficiencyUnit: null }).value).toBeNull();
    expect(row({ runtime: Number.MIN_VALUE }).value).toBeNull();
  });
});