import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseMorthSdbWorkbook } from "../server/snlMorthParser";
import { calculateBomDemand } from "../shared/planningEngine";
import { computeItemDemand } from "../client/src/pages/WorkDemand";
import { isSnlEquipmentHoursUnit } from "../shared/snlEquipment";
import {
  getMorthReloadApplicableCodes,
  morthNormRowsEqualAtDatabasePrecision,
  validateParsedMorthItem,
} from "../server/snlMorthReload";

describe("MoRTH SDB amendment", () => {
  const workbook = readFileSync(resolve(
    process.cwd(),
    "attached_assets/MoRTH_Standard-Data-Book-Road-Bridge_1782816790434.xlsx",
  ));
  const items = parseMorthSdbWorkbook(workbook);
  const byCode = new Map(items.map(item => [item.code, item]));

  it("keeps 12.8 Case I and Case II resources separate across the workbook sections", () => {
    for (const letter of ["C", "D", "E", "F", "G", "H"]) {
      const caseI = byCode.get(`12.8-${letter}`);
      const caseII = byCode.get(`12.8-${letter}-Case-II`);
      expect(caseI, `12.8-${letter} Case I`).toBeDefined();
      expect(caseII, `12.8-${letter} Case II`).toBeDefined();
      expect(caseI!.equipment.length).toBeGreaterThan(0);
      expect(caseI!.labour.length).toBeGreaterThan(0);
      expect(caseI!.materials.length).toBeGreaterThan(0);
      expect(caseII!.equipment.length).toBeGreaterThan(caseI!.equipment.length);
      expect(caseII!.labour.length).toBeGreaterThan(0);
      expect(caseII!.materials.length).toBeGreaterThan(0);
      expect(caseII!.shiftOutput).toBeGreaterThan(0);
    }
    expect(byCode.get("12.8-C-Case-II")!.equipment.map(row => row.label).join(" "))
      .toMatch(/batching plant/i);
    expect(byCode.get("12.8-C-Case-II")!.equipment.map(row => row.label).join(" "))
      .toMatch(/transit mixer/i);
    expect(byCode.get("12.8-C-Case-II")!.equipment.map(row => row.label).join(" "))
      .toMatch(/concrete pump/i);
  });

  it("retains WBM method resources and method-specific grading materials", () => {
    for (const method of ["A", "B"]) {
      const parent = byCode.get(`4.9-${method}`);
      const gradeI = byCode.get(`4.9-${method}-i`);
      const gradeII = byCode.get(`4.9-${method}-ii`);
      expect(parent).toBeDefined();
      expect(parent!.equipment.length).toBeGreaterThan(0);
      expect(parent!.labour.length).toBeGreaterThan(0);
      expect(gradeI?.materials.length).toBeGreaterThan(0);
      expect(gradeII?.materials.length).toBeGreaterThan(0);
      expect(gradeI!.shiftOutput).toBe(parent!.shiftOutput);
      expect(gradeII!.shiftOutput).toBe(parent!.shiftOutput);
    }
  });

  it("keeps OR machinery alternatives out of hours and parses decimal quantity factors", () => {
    const wmm = byCode.get("4.12")!;
    const roller = wmm.equipment.find(row => /vibratory roller/i.test(row.label))!;
    expect(roller.qty).toBeCloseTo(3.9);
    expect(roller.notes).toContain("Alternative only");
    expect(roller.notes).toContain("Smooth 3 wheeled steel roller");
    expect(wmm.equipment.some(row => /smooth 3 wheeled steel roller/i.test(row.label))).toBe(false);

    const tipper = wmm.equipment.find(row => /tipper/i.test(row.label))!;
    expect(tipper).toMatchObject({ unit: "tonne.km", qty: 495 });
    expect(tipper.notes).toContain("Carrying by lead");
  });

  it("keeps lead-based tipper transport out of embankment machine-hour rows", () => {
    const embankment = byCode.get("3.16")!;
    const tipper = embankment.equipment.find(row => /tipper/i.test(row.label))!;
    expect(tipper.unit).toBe("tonne.km");
    expect(tipper.qty).toBe(160);
    expect(embankment.equipment.filter(row => row.unit === "hrs")).toHaveLength(5);
    expect(isSnlEquipmentHoursUnit(tipper.unit)).toBe(false);
    expect(isSnlEquipmentHoursUnit("hour")).toBe(true);
  });

  it("fills empty grading sub-items from their parent without double-counting the OR machine", () => {
    for (const [parentCode, childCodes] of [
      ["4.1-A", ["4.1A-i", "4.1A-ii", "4.1A-iii"]],
      ["4.1-B", ["4.1B-i", "4.1B-ii", "4.1B-iii"]],
      ["5.6", ["5.6-i", "5.6-ii"]],
      ["5.8", ["5.8-i", "5.8-ii"]],
    ] as const) {
      const parent = byCode.get(parentCode)!;
      for (const childCode of childCodes) {
        const child = byCode.get(childCode)!;
        expect(child.shiftOutput).toBe(parent.shiftOutput);
        expect(child.equipment).toEqual(parent.equipment);
        expect(child.labour).toEqual(parent.labour);
        expect(child.materials).toEqual(parent.materials);
      }
    }
  });

  it("keeps the full nested path and inherits heading units and output", () => {
    for (const code of ["2.3-i-A", "2.3-i-B", "2.3-ii-A", "2.3-ii-B"]) {
      const item = byCode.get(code);
      expect(item, code).toBeDefined();
      expect(item!.unit).toBe("HECTARE");
      expect(item!.shiftOutput).toBe(1);
      expect(item!.labour.length + item!.equipment.length + item!.materials.length).toBeGreaterThan(0);
    }
    expect(byCode.get("2.3-i-A")!.title).toMatch(/^Clearing and Grubbing Road Land —/);
    expect(byCode.get("2.3-i-A")?.title).toContain("By Manual Means — In area of light jungle");
    expect(byCode.get("2.3-ii-B")?.title).toContain("By Mechanical Means — In area of thorny jungle");
    expect(byCode.get("3.13-i-A")).toMatchObject({ unit: "CUM", shiftOutput: 10 });
    expect(byCode.get("3.13-i-B")).toMatchObject({ unit: "CUM", shiftOutput: 300 });
    expect(byCode.get("3.13-i-A")!.labour.length).toBeGreaterThan(0);
    expect(byCode.get("3.13-i-B")!.equipment.length).toBeGreaterThan(0);
  });

  it("derives outputs from costing lines and keeps the full three-level 2.4 path", () => {
    for (const code of ["1.4-i", "1.4-ii", "1.4-iii"]) {
      const item = byCode.get(code);
      expect(item, code).toBeDefined();
      expect(item).toMatchObject({ unit: "T.KM", shiftOutput: 100 });
      expect(validateParsedMorthItem(item!).status).toBe("passing");
      expect(item!.equipment.length).toBeGreaterThan(0);
    }
    for (const code of ["2.1-i", "2.1-ii", "2.1-iii", "2.1-iv"]) {
      const item = byCode.get(code);
      expect(item, code).toBeDefined();
      expect(item).toMatchObject({ unit: "EACH", shiftOutput: 1 });
      expect(validateParsedMorthItem(item!).status).toBe("passing");
    }
    for (const code of ["2.4-i-I-A", "2.4-i-I-B", "2.4-i-I-C"]) {
      const item = byCode.get(code);
      expect(item, code).toBeDefined();
      expect(item).toMatchObject({ unit: "CUM", shiftOutput: 1.25 });
      expect(item!.title).toContain("Lime /Cement Concrete");
      expect(item!.title).toContain("By Manual Means");
      expect(validateParsedMorthItem(item!).status).toBe("passing");
      expect(item!.equipment.length + item!.labour.length + item!.materials.length).toBeGreaterThan(0);
    }
  });

  it("accepts the workbook's split 'Taking out put' spelling and a material row before section labels", () => {
    expect(byCode.get("10.5")).toMatchObject({ unit: "SQM", shiftOutput: 4900 });
    expect(validateParsedMorthItem(byCode.get("10.5")!).status).toBe("passing");
    expect(byCode.get("12.2")?.shiftOutput).toBe(1);
    expect(validateParsedMorthItem(byCode.get("12.2")!).status).toBe("rate_only");
    expect(byCode.get("15.3")).toMatchObject({ unit: "CUM", shiftOutput: 1 });
    expect(byCode.get("15.3")!.materials).toHaveLength(1);
    expect(byCode.get("15.3")!.materials[0]).toMatchObject({ unit: "cum", qty: 1 });
    expect(validateParsedMorthItem(byCode.get("15.3")!).status).toBe("passing");
  });

  it("uses the 'Rate per cum' basis and keeps the 15.10 alternative under its correct parent", () => {
    for (const code of ["15.10-A", "15.10-B"]) {
      const item = byCode.get(code);
      expect(item, code).toBeDefined();
      expect(item).toMatchObject({ unit: "CUM", shiftOutput: 1 });
      expect(item!.materials.length).toBeGreaterThan(0);
      expect(validateParsedMorthItem(item!).status).toBe("passing");
    }
    expect(byCode.has("15.1-B")).toBe(false);
  });

  it("preserves chapter 12.1 depth paths and reports missing heading data for a resource-bearing row", () => {
    expect(byCode.get("12.1-I-A-i")).toMatchObject({ unit: "CUM", shiftOutput: 10 });
    expect(byCode.get("12.1-I-A-ii")).toMatchObject({ unit: "CUM", shiftOutput: 10 });
    expect(byCode.get("12.1-I-B-i")).toMatchObject({ unit: "CUM", shiftOutput: 240 });
    const backfill = byCode.get("12.1-VI");
    expect(backfill).toMatchObject({ unit: "CUM", shiftOutput: 6 });
    expect(backfill!.equipment.length + backfill!.labour.length + backfill!.materials.length).toBeGreaterThan(0);
    expect(validateParsedMorthItem(backfill!).status).toBe("passing");
  });

  it("normalizes Chapter 14 unit prefixes and gives p/q/r sub-cases resources and positive output", () => {
    expect(byCode.get("14.1-A-Case-I")?.unit).toBe("CUM");
    expect(byCode.get("14.1-A-Case-II")?.unit).toBe("CUM");
    expect(byCode.has("14.1-A-Case-II-i-2")).toBe(false);
    expect(byCode.has("14.1-A-Case-II-i-p")).toBe(true);
    for (const code of [
      "14.1-A-Case-I-i-p",
      "14.1-A-Case-I-i-q",
      "14.1-A-Case-I-i-r",
      "14.1-A-Case-II-i-p",
      "14.1-A-Case-II-i-q",
      "14.1-A-Case-II-i-r",
    ]) {
      const item = byCode.get(code);
      expect(item, code).toBeDefined();
      expect(item!.unit).toBe("CUM");
      expect(item!.shiftOutput).toBeGreaterThan(0);
      expect(item!.equipment.length + item!.labour.length + item!.materials.length).toBeGreaterThan(0);
    }
  });

  it("marks the documented market-rate entries as rate-only while other incomplete items need checking", () => {
    for (const code of ["5.20", "8.38", "8.42", "11.12", "11.13", "12.37", "14.12"]) {
      const item = byCode.get(code);
      expect(item, code).toBeDefined();
      expect(validateParsedMorthItem(item!).status).toBe("rate_only");
    }
    expect(validateParsedMorthItem(byCode.get("3.29")!).status).toBe("passing");
    expect(items.find(item => item.code === "12.1-VI")?.shiftOutput).toBeGreaterThan(0);
  });

  it("never includes Needs check rows in the set of reloadable changes", () => {
    expect(getMorthReloadApplicableCodes([
      { code: "ok-changed", status: "changed", validationStatus: "passing" },
      { code: "rate-only", status: "added", validationStatus: "rate_only" },
      { code: "bad-added", status: "added", validationStatus: "needs_check" },
      { code: "bad-changed", status: "changed", validationStatus: "needs_check" },
      { code: "unchanged", status: "unchanged", validationStatus: "passing" },
    ])).toEqual(["ok-changed", "rate-only"]);
  });

  it("compares numeric norm values at PostgreSQL REAL precision", () => {
    expect(morthNormRowsEqualAtDatabasePrecision(
      { materials: [{ quantityPerShift: 800, derivedPerUnit: 1.3333334 }] },
      { materials: [{ quantityPerShift: 800, derivedPerUnit: 1.33333333 }] },
    )).toBe(true);
    expect(morthNormRowsEqualAtDatabasePrecision(
      { materials: [{ quantityPerShift: 800, derivedPerUnit: 1.3333334 }] },
      { materials: [{ quantityPerShift: 799.9, derivedPerUnit: 1.33333333 }] },
    )).toBe(false);
  });

  it("caps BOM demand at BOQ quantity when multiple bars each carry the full quantity", () => {
    const item = {
      id: 501,
      itemCode: "5",
      description: "WMM",
      unit: "Cum",
      canonicalUnit: "cum",
      currentQty: 1631.25,
      materials: [],
      equipment: [],
      labour: [],
    } as any;
    const bars = [1, 2].map(id => ({
      id,
      boqItemId: item.id,
      chainageFrom: null,
      chainageTo: null,
      startMonth: id,
      endMonth: id,
      plannedQty: 1631.25,
      isQtyOverride: false,
    }));

    const demand = calculateBomDemand([item], bars, 12);
    expect(demand.programmeQuantityChecks).toEqual([expect.objectContaining({
      boqItemId: item.id,
      boqQty: 1631.25,
      programmeQty: 3262.5,
      cappedDemandQty: 1631.25,
    })]);
  });

  it("keeps item demand separate by BOQ identity and merges duplicate resource lines", () => {
    const itemBreakdown = (
      boqItemId: number,
      itemCode: string,
      values: { lineHours?: number; lineQty?: number; qtyPerUnit?: number; lineDays?: number; daysPerUnit?: number } = {},
    ) => ({
      boqItemId,
      itemCode,
      itemDescription: "Same description",
      fullDescription: "Same description",
      unit: "cum",
      workQty: 10,
      lineHours: values.lineHours ?? 0,
      hrsPerUnit: (values.lineHours ?? 0) / 10,
      lineQty: values.lineQty ?? 0,
      qtyPerUnit: values.qtyPerUnit ?? 0,
      lineDays: values.lineDays ?? 0,
      daysPerUnit: values.daysPerUnit ?? 0,
    });
    const demand = {
      materials: [{
        materialName: "Aggregate",
        uom: "MT",
        breakdown: [
          itemBreakdown(1, "1.1", { lineQty: 3, qtyPerUnit: 0.3 }),
          itemBreakdown(1, "1.1", { lineQty: 2, qtyPerUnit: 0.2 }),
        ],
      }],
      equipment: [{
        equipmentName: "Motor Grader",
        hrsPerUnit: 0.5,
        breakdown: [
          itemBreakdown(1, "1.1", { lineHours: 3 }),
          itemBreakdown(1, "1.1", { lineHours: 2 }),
          itemBreakdown(2, "1.2", { lineHours: 2 }),
        ],
      }],
      labour: [{
        designation: "Mazdoor",
        daysPerUnit: 0.2,
        breakdown: [
          itemBreakdown(1, "1.1", { lineDays: 1, daysPerUnit: 0.1 }),
          itemBreakdown(1, "1.1", { lineDays: 1, daysPerUnit: 0.1 }),
        ],
      }],
      programmeQuantityChecks: [{
        boqItemId: 1,
        itemCode: "1.1",
        description: "Same description",
        boqQty: 10,
        programmeQty: 20,
        cappedDemandQty: 10,
        unit: "cum",
      }],
    } as any;

    const rows = computeItemDemand(demand, new Set());
    expect(rows).toHaveLength(2);
    expect(rows.find(row => row.boqItemId === 1)?.equipment).toEqual([
      { name: "Motor Grader", hours: 5, hrsPerUnit: 0.5 },
    ]);
    expect(rows.find(row => row.boqItemId === 1)?.materials).toEqual([
      { name: "Aggregate", uom: "MT", qty: 5, qtyPerUnit: 0.5 },
    ]);
    expect(rows.find(row => row.boqItemId === 1)?.labour).toEqual([
      { name: "Mazdoor", days: 2, daysPerUnit: 0.2 },
    ]);
    expect(rows.find(row => row.boqItemId === 2)?.equipment[0].hours).toBe(2);
    expect(rows.find(row => row.boqItemId === 1)?.programmeQuantityCheck?.cappedDemandQty).toBe(10);
    expect(rows.find(row => row.boqItemId === 2)?.programmeQuantityCheck).toBeUndefined();
  });

  it("shows the programme-versus-BOQ warning even when no norm resources are mapped", () => {
    const rows = computeItemDemand({
      materials: [],
      equipment: [],
      labour: [],
      programmeQuantityChecks: [{
        boqItemId: 8,
        itemCode: "8",
        description: "DGBM 50 mm",
        boqQty: 543.75,
        programmeQty: 1087.5,
        cappedDemandQty: 543.75,
        unit: "cum",
      }],
    } as any, new Set());

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      boqItemId: 8,
      workQty: 543.75,
      description: "DGBM 50 mm",
    });
    expect(rows[0].programmeQuantityCheck?.programmeQty).toBe(1087.5);
  });
});
