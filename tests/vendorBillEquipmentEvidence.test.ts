import { describe, expect, it, vi } from "vitest";
vi.mock("../server/db", () => ({ db: {} }));
import { equipmentEvidenceKey, projectEquipmentEvidence, resolveSavedEquipmentEvidenceSources } from "../server/vendorBillEquipmentEvidence";

const record = {
  key: "dpr_equipment:12", site: "ROAD A",
  log: { id: 12, equipmentId: 7, openingReading: 100, closingReading: 102 },
  equipment: { id: 7, meterType: "hour_meter" },
};
const item = { category: "equipment", sourceId: "dpr_equipment:12", equipmentId: 7, qty: 1, rate: 3500, amount: 3500 };
describe("bill equipment evidence read-only projection", () => {
  it("attaches exact source facts without mutating financial values or inputs", () => {
    const input = structuredClone(item);
    const result = projectEquipmentEvidence([input], [record], ["ROAD A"])[0] as any;
    expect(result.equipmentLogEvidence.log).toEqual(record.log);
    expect({ qty: result.qty, rate: result.rate, amount: result.amount }).toEqual({ qty: 1, rate: 3500, amount: 3500 });
    expect(input).toEqual(item);
  });
  it("decodes exact persisted source identities when the transient sourceId is absent", () => {
    expect(equipmentEvidenceKey({ ...item, sourceId: undefined, source: "auto:plant_usage:12" }))
      .toBe("plant_usage:12");
    expect(equipmentEvidenceKey({ ...item, sourceId: undefined, source: "auto:dpr_equipment:12" }))
      .toBe("dpr_equipment:12");
    expect(equipmentEvidenceKey({ ...item, sourceId: undefined, source: "auto:dpr_equipment:12x" })).toBeNull();
  });
  it.each([{ permitted: [] }, { permitted: ["ROAD B"] }])("withholds facts outside actual source-site access %j", ({ permitted }) => {
    expect(projectEquipmentEvidence([item], [record], permitted)[0]).toBe(item);
  });
  it("supports explicit all-sites access", () => {
    expect(projectEquipmentEvidence([item], [record], null)[0]).not.toBe(item);
  });
  it("does not substitute mismatched equipment, missing logs or numeric legacy IDs", () => {
    for (const value of [{ ...item, equipmentId: 8 }, { ...item, sourceId: "dpr_equipment:13" }, { ...item, sourceId: 12 }]) {
      expect(projectEquipmentEvidence([value], [record], null)[0]).toBe(value);
    }
  });
  it("keeps source namespaces distinct", () => {
    const value = { ...item, sourceId: "plant_usage:12" };
    expect(projectEquipmentEvidence([value], [record], null)[0]).toBe(value);
  });
  it.each(["12", "dpr_equipment:0", "dpr_equipment:-1", "dpr_equipment:12abc", "unknown:12"])("rejects ambiguous source %s", sourceId => {
    expect(equipmentEvidenceKey({ ...item, sourceId })).toBeNull();
  });
  it("never enriches non-equipment rows", () => {
    expect(equipmentEvidenceKey({ ...item, category: "material" })).toBeNull();
  });
  it("recovers a missing legacy source only from an exact unique candidate", () => {
    const saved = {
      category: "equipment", source: "auto", equipmentId: 7, date: "2026-09-09",
      description: "JCB SITE - HOURLY HIRE | 6 HRS", unit: "HRS", siteName: "SITE: ROAD A", amount: 900,
    };
    const candidate = {
      ...saved, sourceId: "dpr_equipment:12",
      description: "JCB SITE - HOURLY HIRE | 8 HRS | DIESEL: 4L",
    };
    expect(resolveSavedEquipmentEvidenceSources([saved], [candidate])[0]).toEqual({ ...saved, sourceId: candidate.sourceId });
    const zeroQuantity = { ...candidate, qty: 0, description: "JCB SITE - HOURLY HIRE | 0 HRS" };
    expect(resolveSavedEquipmentEvidenceSources([saved], [zeroQuantity])[0]).toEqual({ ...saved, sourceId: candidate.sourceId });
    for (const changed of [
      { ...candidate, description: "OTHER TASK - HOURLY HIRE | 8 HRS" },
      { ...candidate, siteName: "ROAD B" },
      { ...candidate, date: "2026-09-10" },
      { ...candidate, description: "JCB SITE - DAILY HIRE | 8 HRS" },
    ]) {
      expect(resolveSavedEquipmentEvidenceSources([saved], [changed])[0]).toBe(saved);
    }
    expect(resolveSavedEquipmentEvidenceSources([saved], [candidate, { ...candidate, sourceId: "dpr_equipment:13" }])[0]).toBe(saved);
    const manual = { ...saved, source: "manual" };
    expect(resolveSavedEquipmentEvidenceSources([manual], [candidate])[0]).toBe(manual);
  });
});