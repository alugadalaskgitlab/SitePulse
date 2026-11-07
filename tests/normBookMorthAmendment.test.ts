import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseMorthSdbWorkbook } from "../server/snlMorthParser";
import { calculateBomDemand } from "../shared/planningEngine";
import { computeItemDemand } from "../client/src/pages/WorkDemand";

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
