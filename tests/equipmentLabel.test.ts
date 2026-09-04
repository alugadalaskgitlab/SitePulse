import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { formatEquipmentOptionLabel } from "../shared/equipmentLabel";

describe("canonical equipment option labels", () => {
  it("formats owned and hired equipment like Equipment Master", () => {
    expect(formatEquipmentOptionLabel({
      name: "JCB 3DX",
      registrationNumber: "TS09AB1234",
      ownership: "owned",
      meterType: "hour_meter",
    })).toBe("JCB 3DX | TS09AB1234 | Owned | Hour Meter");

    expect(formatEquipmentOptionLabel({
      name: "Water Tanker",
      registrationNumber: "TS10XY4567",
      ownership: "hired",
      vendorName: "ABC Earthmovers",
      meterType: "odometer",
    })).toBe("Water Tanker | TS10XY4567 | Hired - ABC Earthmovers | Odometer");
  });

  it("cleanly omits a blank hired vendor and all missing optional fields", () => {
    expect(formatEquipmentOptionLabel({
      name: "Paver",
      ownership: "hired",
      vendorName: "   ",
      meterType: "hour_meter",
    })).toBe("Paver | Hired | Hour Meter");

    const label = formatEquipmentOptionLabel({
      name: "Roller",
      registrationNumber: null,
      ownership: "hired",
      vendorName: undefined,
      meterType: null,
    });
    expect(label).toBe("Roller | Hired");
    expect(label).not.toMatch(/undefined|null/i);
  });

  it("uses the shared helper throughout the scoped usage and master screens", () => {
    const usage = readFileSync("client/src/pages/PlantEquipmentUsage.tsx", "utf8");
    const master = readFileSync("client/src/pages/Plant.tsx", "utf8");
    expect(usage.match(/formatEquipmentOptionLabel\(/g)?.length).toBeGreaterThanOrEqual(7);
    expect(master).toContain("formatEquipmentOptionLabel(equip)");
    expect(usage).not.toContain("HLC Owned Vehicle");
    expect(usage).not.toContain('`HIRED: ${(equip as any).vendorName}`');
  });

  it("does not change equipment option identities or selection handlers", () => {
    const usage = readFileSync("client/src/pages/PlantEquipmentUsage.tsx", "utf8");
    expect(usage).toContain('<SelectItem key={equip.id} value={String(equip.id)}>');
    expect(usage).toContain("handleEquipmentChange(value)");
    expect(usage).toContain("onValueChange={setTransportEquipmentId}");
  });
});