// @vitest-environment jsdom
import "@testing-library/jest-dom";
import React, { useState } from "react";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { BomInputBar, BomInputItem } from "@shared/planningEngine";
import { BalanceWorkMaterialsByReach } from "../client/src/components/BalanceWorkMaterialsByReach";
import {
  buildBalanceWorkByReach,
  calculateStillToArrange,
  type WorkValueBalanceRow,
} from "../client/src/lib/bomReachBalance";
import {
  isProcurementReturnPath,
  materialUomEditHref,
  readWorkDemandTab,
  useBackClosesWorkDemandDialog,
  writeWorkDemandTab,
} from "../client/src/lib/workDemandNavigation";

afterEach(() => cleanup());

function item(
  id: number,
  description: string,
  layerType: string,
  materialName: string,
  materialUom: string,
  qtyPerBoqUnit: number,
  profile: BomInputItem["layerQuantityProfile"] = null,
): BomInputItem {
  return {
    id,
    itemCode: String(id),
    itemName: description,
    description,
    unit: "CUM",
    canonicalUnit: "CUM",
    currentQty: 100,
    materials: [],
    equipment: [],
    labour: [],
    layerConfig: { layerType } as any,
    layerQuantityProfile: profile,
    derivedKeyMaterials: [{
      materialName,
      uom: materialUom,
      qtyPerBoqUnit,
      wastagePct: 0,
      isClientSupplied: false,
    }],
  };
}

function workRow(overrides: Partial<WorkValueBalanceRow>): WorkValueBalanceRow {
  return {
    boqItemId: 1,
    itemCode: "1",
    description: "Earthen shoulders",
    unit: "CUM",
    reachId: 11,
    reachLabel: "Reach 1",
    chainageFrom: 0,
    chainageTo: 1,
    side: null,
    scopeQuantity: 10,
    doneQuantity: 0,
    balanceQuantity: 10,
    rowType: "working_reach",
    ...overrides,
  };
}

const soilProfile = {
  rolledDensity: 2.2,
  rollingPct: 98,
  looseFactor: 1.2,
  wastagePct: 0,
};

describe("balance material requirements by working reach", () => {
  it("uses Work value balance, groups fixed items separately, excludes no-scope and splits by reach", () => {
    const items = [
      item(1, "Earthen shoulders", "earthwork", "Shoulder Earth / Soil", "CUM", 1, soilProfile),
      item(2, "DGBM", "bituminous", "Bitumen", "MT", 0.04, {
        rolledDensity: 2.3,
        rollingPct: 98,
        looseFactor: 1,
        wastagePct: 0,
      }),
    ];
    const bars: BomInputBar[] = [
      { id: 1, boqItemId: 1, chainageFrom: 0, chainageTo: 1, startMonth: 1, endMonth: 2, plannedQty: 6, isQtyOverride: false },
      { id: 2, boqItemId: 1, chainageFrom: 2, chainageTo: 3, startMonth: 2, endMonth: 3, plannedQty: 20, isQtyOverride: false },
      { id: 3, boqItemId: 2, chainageFrom: 0, chainageTo: 1, startMonth: 1, endMonth: 3, plannedQty: 100, isQtyOverride: false },
    ];
    const result = buildBalanceWorkByReach({
      items,
      bars,
      totalMonths: 3,
      currentMonth: 2,
      demandMaterials: [
        { materialName: "Shoulder Earth / Soil", uom: "CUM", totalQty: 30 },
        { materialName: "Bitumen", uom: "MT", totalQty: 1.2 },
      ],
      stockRows: [
        { materialName: "Shoulder Earth / Soil", uom: "CUM", totalDemand: 30, hlcRecordedStock: 5, materialMappingUnresolved: false },
      ],
      workRows: [
        workRow({ balanceQuantity: 10, scopeQuantity: 10 }),
        workRow({ boqItemId: 1, reachId: 13, reachLabel: "Reach 3", chainageFrom: 2, chainageTo: 3, balanceQuantity: 20, scopeQuantity: 20 }),
        workRow({ boqItemId: 2, itemCode: "2", description: "DGBM", reachId: 11, reachLabel: "Reach 1", balanceQuantity: 100, scopeQuantity: 100 }),
        workRow({ boqItemId: 1, reachId: null, reachLabel: "Whole project", chainageFrom: null, chainageTo: null, balanceQuantity: 5, scopeQuantity: 5 }),
        workRow({ rowType: "no_scope", reachId: null, reachLabel: "BOQ not needed", balanceQuantity: 40, scopeQuantity: 40 }),
      ],
    });

    const reach1 = result.groups.find(group => group.key === "reach-11")!;
    const reach3 = result.groups.find(group => group.key === "reach-13")!;
    const fixed = result.groups.find(group => group.key === "whole-project")!;
    const reach1Soil = reach1.materials.find(material => /shoulder.*soil/i.test(material.materialName))!;
    const reach3Soil = reach3.materials.find(material => /shoulder.*soil/i.test(material.materialName))!;
    expect(reach1Soil.compactedCum).toBe(10);
    expect(reach1Soil.mt).toBeCloseTo(21.56, 2);
    expect(reach1Soil.looseCum).toBe(12);
    expect(reach1Soil.looseCft).toBeCloseTo(423.7764, 2);
    expect(reach3Soil.looseCum).toBe(24);
    expect(reach1.materials.find(material => material.materialName === "Plant mix")?.mt)
      .toBeCloseTo(225.4, 1);
    const scheduledMix = reach1.materials.find(material => material.materialName === "Plant mix")!;
    expect(Object.values(scheduledMix.monthly).some(value => value > 0)).toBe(true);
    expect(reach1.materials.find(material => /bitumen/i.test(material.materialName))?.mt).toBeCloseTo(4, 2);
    expect(fixed.label).toBe("Not tied to a reach");
    expect(result.groups.flatMap(group => group.workItems).some(work => work.quantity === 40)).toBe(false);
    expect(reach1Soil.overdue).toBeGreaterThan(0);
    expect(reach1Soil.notScheduled).toBeGreaterThan(0);
    expect(result.hasNotScheduled).toBe(true);
    expect(result.totals.find(total => /shoulder.*soil/i.test(total.materialName))?.stillToArrange).toBe(30);
  });

  it("keeps stock subtraction at zero or greater and labels overstock as enough", () => {
    expect(calculateStillToArrange(10, 15)).toEqual({ quantity: 0, enough: true });
    expect(calculateStillToArrange(10, -4)).toEqual({ quantity: 10, enough: false });
  });

  it("does not display CFT quantities without a material weight profile", () => {
    const aggregate = item(3, "Aggregate", "other", "Aggregate", "CFT", 1);
    const result = buildBalanceWorkByReach({
      items: [aggregate],
      bars: [],
      workRows: [workRow({ boqItemId: 3, description: "Aggregate" })],
      totalMonths: 1,
      currentMonth: 1,
      demandMaterials: [],
      stockRows: [],
    });
    const material = result.groups[0].materials[0];
    expect(material.valuesUnavailable).toBe(true);
    expect(result.totals[0].needed).toBeNull();
  });

  it("renders compacted, loose, monthly, and all-reaches totals", () => {
    const shoulder = item(1, "Earthen shoulders", "earthwork", "Shoulder Earth / Soil", "CUM", 1, soilProfile);
    render(
      <BalanceWorkMaterialsByReach
        items={[shoulder]}
        bars={[]}
        workRows={[workRow({ balanceQuantity: 10, scopeQuantity: 10 })]}
        totalMonths={6}
        projectStartDate="2026-08-15"
        currentMonth={3}
        endMonth={6}
        demandMaterials={[{ materialName: "Shoulder Earth / Soil", uom: "CUM", totalQty: 30 }]}
        stockRows={[{ materialName: "Shoulder Earth / Soil", uom: "CUM", totalDemand: 30, hlcRecordedStock: 5, materialMappingUnresolved: false }]}
      />,
    );
    expect(screen.getByText("Balance work — materials by reach")).toBeInTheDocument();
    expect(screen.getByText("All reaches — balance total")).toBeInTheDocument();
    expect(screen.getByText("10", { exact: true })).toBeInTheDocument();
    expect(screen.getByText("21.56", { exact: true })).toBeInTheDocument();
    expect(screen.getAllByText("12", { exact: true })).toHaveLength(2);
    expect(screen.getByText("424", { exact: true })).toBeInTheDocument();
    expect(screen.getByText("10 cum", { exact: true })).toBeInTheDocument();
    expect(screen.getAllByText("5 cum", { exact: true })).toHaveLength(2);
    expect(screen.getByText("Not scheduled")).toBeInTheDocument();
  });
});

describe("WorkDemand navigation", () => {
  it("keeps every selected tab in the URL and restores it from browser history", () => {
    window.history.replaceState({}, "", "/work-program/2/demand?tab=materials");
    writeWorkDemandTab("procurement");
    expect(readWorkDemandTab()).toBe("procurement");
    window.history.replaceState({}, "", "/work-program/2/demand?tab=equipment");
    expect(readWorkDemandTab()).toBe("equipment");
    expect(readWorkDemandTab("?tab=unsupported")).toBe("materials");
  });

  it("opens the exact material edit with Procurement as the return route", () => {
    const href = materialUomEditHref(42, 2);
    expect(href).toContain("/masters/section/materials?editMaterial=42&returnTo=");
    const target = new URL(href, "https://example.test");
    expect(decodeURIComponent(target.searchParams.get("returnTo")!)).toBe("/work-program/2/demand?tab=procurement");
    expect(isProcurementReturnPath("/work-program/2/demand?tab=procurement")).toBe(true);
    expect(isProcurementReturnPath("/work-program/2/demand?tab=materials")).toBe(false);
  });

  it("closes an open popup on Back without leaving the WorkDemand page", () => {
    window.history.replaceState({}, "", "/work-program/2/demand?tab=procurement");
    function DialogState() {
      const [open, setOpen] = useState(true);
      useBackClosesWorkDemandDialog(open, () => setOpen(false));
      return <div>{open ? "popup open" : "popup closed"}</div>;
    }
    render(<DialogState />);
    expect(window.history.state.__workDemandDialog).toMatch(/^work-demand-dialog-/);
    act(() => window.dispatchEvent(new PopStateEvent("popstate")));
    expect(screen.getByText("popup closed")).toBeInTheDocument();
    expect(window.location.pathname).toBe("/work-program/2/demand");
    expect(readWorkDemandTab()).toBe("procurement");
  });
});
