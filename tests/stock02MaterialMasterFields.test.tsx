import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MaterialCategoryProfileFields, type MaterialProfileFields } from "../client/src/components/MaterialCategoryProfileFields";
import { buildMaterialProfileSaveFields } from "../client/src/lib/materialMasterForm";
import {
  materialAliasesJson,
  materialAliasesText,
  materialMasterFieldGroup,
  materialTankLabel,
} from "../shared/materialMasterFields";

const values: MaterialProfileFields = {
  volumeUom: "CFT",
  bulkDensity: "",
  rolledDensity: "",
  rollingPct: "",
  extraLoosePct: "",
  wastagePct: "",
  materialThicknessMm: "",
  packedUnitName: "",
  packedUnitNetWeightKg: "",
  packedUnitVolumeLiters: "",
};

function htmlFor(category: string, name = "Example material", profileValues = values) {
  return renderToStaticMarkup(createElement(MaterialCategoryProfileFields, {
    category,
    name,
    values: profileValues,
    onChange: () => {},
  }));
}

describe("STOCK-02 Material Master category fields", () => {
  it("shows only the basic-fields prompt until a category is selected", () => {
    const html = htmlFor("");
    expect(html).toContain("Choose a category to see the right fields");
    expect(html).not.toContain("input-bulk-density");
    expect(html).not.toContain("packed-unit-master-fields");
  });

  it("shows no density or packed fields for store materials", () => {
    const html = htmlFor("Electricals", "POWER CABLE");
    expect(html).not.toContain("input-bulk-density");
    expect(html).not.toContain("input-packed-unit-net-kg");
    expect(html).not.toContain("input-packed-unit-volume-liters");
  });

  it("shows only packed net weight for bitumen and emulsion", () => {
    for (const category of ["Bitumen", "Emulsion"]) {
      const html = htmlFor(category);
      expect(html).toContain("input-packed-unit-net-kg");
      expect(html).not.toContain("input-packed-unit-volume-liters");
      expect(html).not.toContain("input-bulk-density");
      expect(html).not.toContain("input-rolled-density");
    }
  });

  it("shows packed litres for fuel and density fields for aggregates", () => {
    const fuel = htmlFor("LDO", "LDO");
    expect(fuel).toContain("input-packed-unit-volume-liters");
    expect(fuel).not.toContain("input-packed-unit-net-kg");
    expect(fuel).not.toContain("input-bulk-density");

    const aggregate = htmlFor("Aggregate", "GSB");
    expect(aggregate).toContain("input-bulk-density");
    expect(aggregate).toContain("input-rolled-density");
    expect(aggregate).toContain("input-extra-loose-pct");
    expect(aggregate).toContain("input-wastage-pct");
  });

  it("keeps hidden saved profile fields in the update payload", () => {
    const savedFields: MaterialProfileFields = {
      volumeUom: "CFT",
      bulkDensity: "1.75",
      rolledDensity: "2.2",
      rollingPct: "98",
      extraLoosePct: "20",
      wastagePct: "0",
      materialThicknessMm: "150",
      packedUnitName: "Barrel",
      packedUnitNetWeightKg: "156",
      packedUnitVolumeLiters: "200",
    };
    const payload = buildMaterialProfileSaveFields(savedFields);
    expect(payload).toMatchObject({
      rolledDensity: 2.2,
      rollingPct: 98,
      looseFactor: 1.2,
      wastagePct: 0,
      packedUnitName: "Barrel",
      packedUnitNetWeightKg: 156,
      packedUnitVolumeLiters: 200,
    });
    // Compacted-and-loose values make density derived; omitting this legacy
    // column from a PATCH preserves its existing saved value.
    expect(payload.bulkDensity).toBeUndefined();
  });

  it("classifies categories and preserves aliases without rewriting them until edited", () => {
    expect(materialMasterFieldGroup(null, "12MM AGGREGATE")).toBe("choose-category");
    expect(materialMasterFieldGroup("Electricals", "POWER CABLE")).toBe("store");
    expect(materialMasterFieldGroup("Electricals", "Diesel pump cable")).toBe("store");
    expect(materialMasterFieldGroup("LDO", "LDO")).toBe("fuel");
    expect(materialMasterFieldGroup("Other", "LDO")).toBe("fuel");
    expect(materialMasterFieldGroup("Utility", "DIESEL")).toBe("fuel");
    expect(materialMasterFieldGroup("Bitumen", "EMULSION")).toBe("emulsion");
    expect(materialMasterFieldGroup("Other", "SOIL")).toBe("aggregate");
    expect(materialAliasesText('["Alt WMM","WMM"]')).toBe("Alt WMM\nWMM");
    expect(materialAliasesJson("Alt WMM\nWMM\nalt wmm")).toBe('["Alt WMM","WMM"]');
  });

  it("uses material-specific tank labels without changing tank numbers", () => {
    expect(materialTankLabel("LDO", 1)).toBe("LDO tank 1 (small vertical)");
    expect(materialTankLabel("Bitumen VG-30", 2)).toBe("Bitumen tank 2");
    expect(materialTankLabel("Emulsion", 1)).toBe("Emulsion tank 1");
    expect(materialTankLabel("Diesel", 2)).toBe("Tank 2");
    expect(materialTankLabel("VG-30", 1, "Bitumen")).toBe("Bitumen tank 1");
    expect(materialTankLabel("Emulsion", 1, "Bitumen")).toBe("Emulsion tank 1");
    expect(materialTankLabel("RS-1", 2, "Emulsion")).toBe("Emulsion tank 2");
    expect(materialTankLabel("High-speed fuel", 1, "LDO")).toBe("LDO tank 1 (small vertical)");
    expect(materialTankLabel("Bitumen cable", 2, "Electricals")).toBe("Tank 2");
  });
});
