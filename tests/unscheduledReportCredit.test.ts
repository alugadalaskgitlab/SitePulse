/**
 * Reporting-path regression for an unlinked BOQ progress row.
 *
 * This deliberately exercises DatabaseStorage's real read/credit methods with
 * fixture rows returned by the DB boundary. It does not create or mutate any
 * customer records, and it does not weaken programme-link validation.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const fx = vi.hoisted(() => {
  const selectRows: any[][] = [];
  const executeRows: any[][] = [];
  const query = (rows: any[]) => {
    const q: any = {
      from: () => q,
      innerJoin: () => q,
      leftJoin: () => q,
      where: () => q,
      groupBy: () => q,
      limit: () => q,
      then: (resolve: any, reject: any) => Promise.resolve(rows).then(resolve, reject),
    };
    return q;
  };
  return {
    selectRows,
    executeRows,
    fakeDb: {
      select: vi.fn(() => query(selectRows.shift() ?? [])),
      execute: vi.fn(async () => ({ rows: executeRows.shift() ?? [] })),
    },
  };
});

vi.mock("../server/db", () => ({ db: fx.fakeDb }));

import { DatabaseStorage } from "../server/storage";

const PROJECT_ID = 910001;
const ITEM_ID = 701;
const boqItem = {
  id: ITEM_ID,
  boqProjectId: PROJECT_ID,
  itemCode: "GSB-01",
  description: "GSB LAYING",
  unit: "CUM",
  canonicalUnit: "CUM",
  currentQty: 5000,
  clientRate: null,
  dprConversionFactor: 0.5,
  dprMeasurementMethod: "SQM_LW",
  categoryName: null,
};

class FixtureStorage extends DatabaseStorage {
  override async getBoqItems() {
    return [boqItem] as any;
  }

  override async getWorkProgramBars() {
    // No scheduled programme bars are needed for this report row.
    return [] as any;
  }

  override async getBoqProject() {
    return { id: PROJECT_ID, startDate: "2026-01-01" } as any;
  }

  override async getBoqItem() {
    return boqItem as any;
  }
}

beforeEach(() => {
  fx.selectRows.length = 0;
  fx.executeRows.length = 0;
  vi.clearAllMocks();
});

describe("unscheduled BOQ progress remains in reporting credit", () => {
  it("getExecutedProgressForPlan includes a persisted null programmeBarId row", async () => {
    fx.selectRows.push(
      [{ id: 6001 }], // submitted, non-superseded DPR ids
      [{
        boqItemId: ITEM_ID,
        quantity: 12,
        uom: "SQM",
        programmeBarId: null,
        noSiteWork: false,
        isIncidental: false,
      }],
    );

    const result = await new FixtureStorage().getExecutedProgressForPlan({
      site: "Test Site",
      date: "2026-08-05",
      boqItemId: ITEM_ID,
      programmeBarId: null,
    });

    // Real credit path: 12 physical units × the BOQ item's 0.5 factor.
    expect(result).toEqual({
      dprExists: true,
      executedByUom: [{ uom: "CUM", qty: 6, entryCount: 1 }],
      creditApplied: true,
    });
  });

  it("getPlanVsActual reports the persisted null-link BOQ total", async () => {
    // Production now returns physical rows and credits them through the shared
    // row-aware unit contract. A null programmeBarId is still not a filter.
    fx.executeRows.push(
      [{
        boqItemId: ITEM_ID,
        quantity: 12,
        uom: "SQM",
        boqUnit: "CUM",
        measurementMethod: "SQM_LW",
        conversionFactor: 0.5,
        dprDate: "2026-08-05",
      }],
      [], // structure DPR aggregate
    );

    const [row] = await new FixtureStorage().getPlanVsActual(PROJECT_ID, "2026-08-31");

    expect(row).toMatchObject({
      boqItemId: ITEM_ID,
      totalActual: 6,
      lastActivityDate: "2026-08-05",
    });
  });

  it("getPlanVsActual ignores a stale factor when row and contractual UOM are both SQM", async () => {
    const alladurgItem = {
      ...boqItem,
      id: 13,
      unit: "Sqm",
      canonicalUnit: "Sqm",
      currentQty: 6960,
      clientRate: 4.04,
      dprConversionFactor: 0.0001,
    };
    class AlladurgFixtureStorage extends FixtureStorage {
      override async getBoqItems() { return [alladurgItem] as any; }
    }
    fx.executeRows.push(
      [
        { boqItemId: 13, quantity: 2400, uom: "SQM", boqUnit: "Sqm", measurementMethod: null, conversionFactor: 0.0001, dprDate: "2026-08-16" },
        { boqItemId: 13, quantity: 2400, uom: "SQM", boqUnit: "Sqm", measurementMethod: null, conversionFactor: 0.0001, dprDate: "2026-08-17" },
      ],
      [],
    );

    const [row] = await new AlladurgFixtureStorage().getPlanVsActual(PROJECT_ID, "2026-08-31");
    expect(row.totalActual).toBe(4800);
    expect(row.actualAmount).toBe(19392);
    expect(row.lastActivityDate).toBe("2026-08-17");
    expect(row.actualIncomplete).toBe(false);
    expect(row.conversionWarnings.join(" ")).toMatch(/Ignored stale conversion factor/);
  });

  it("getPlanVsActual nulls completion and valuation when any eligible credit is unresolved", async () => {
    const unresolvedItem = {
      ...boqItem,
      unit: "MT",
      canonicalUnit: "MT",
      dprMeasurementMethod: null,
      dprConversionFactor: 2,
      clientRate: 100,
    };
    class UnresolvedFixtureStorage extends FixtureStorage {
      override async getBoqItems() { return [unresolvedItem] as any; }
    }
    fx.executeRows.push(
      [{
        boqItemId: ITEM_ID, quantity: 10, uom: "NOS", quantitySource: "measured",
        boqUnit: "MT", measurementMethod: null, conversionFactor: 2, dprDate: "2026-08-18",
      }],
      [],
    );

    const [row] = await new UnresolvedFixtureStorage().getPlanVsActual(PROJECT_ID, "2026-08-31");
    expect(row.totalActual).toBeNull();
    expect(row.percentComplete).toBeNull();
    expect(row.actualAmount).toBeNull();
    expect(row.actualIncomplete).toBe(true);
    expect(row.conversionWarnings.join(" ")).toMatch(/explicit NOS→MT conversion profile factor/i);
  });

  it("getReportedQtyByBar uses full geometry metadata and exposes unresolved credit", async () => {
    fx.selectRows.push([
      {
        barId: 81, boqItemId: 13, quantity: 2400, uom: "SQM",
        quantitySource: "calculated", length: 1600, width: 1.5, thickness: null,
        chainageFrom: "0.000", chainageTo: "1.600",
        boqUnit: "Sqm", measurementMethod: null, conversionFactor: 0.0001,
      },
      {
        barId: 82, boqItemId: 99, quantity: 10, uom: "NOS",
        quantitySource: "measured", length: null, width: null, thickness: null,
        chainageFrom: null, chainageTo: null,
        boqUnit: "MT", measurementMethod: null, conversionFactor: 2,
      },
      {
        barId: 83, boqItemId: 13, quantity: 0.24, uom: "SQM",
        quantitySource: "measured",
        quantitySourceNote: "UOM override SQM -> Ha (x0.0001): legacy import",
        length: null, width: null, thickness: null, chainageFrom: null, chainageTo: null,
        boqUnit: "Sqm", measurementMethod: null, conversionFactor: 0.0001,
      },
    ]);

    const result = await new FixtureStorage().getReportedQtyByBar([81, 82]);
    expect(result.get(81)).toBe(2400);
    expect(result.reviewRequiredBarIds.has(81)).toBe(true); // stale factor warning remains visible
    expect(result.has(82)).toBe(false);
    expect(result.reviewRequiredBarIds.has(82)).toBe(true);
    expect(result.has(83)).toBe(false);
    expect(result.unresolvedBarIds.has(83)).toBe(true);
  });

  it("work-programme evidence credits valid warned SQM rows instead of turning them into zero", async () => {
    fx.selectRows.push([{
      programmeBarId: 81,
      boqItemId: 13,
      quantity: 2400,
      dprDate: "2026-08-16",
      uom: "SQM",
      quantitySource: "calculated",
      length: 1600,
      width: 1.5,
      thickness: null,
      chainageFrom: "0.000",
      chainageTo: "1.600",
      itemUnit: "Sqm",
      measurementMethod: null,
      conversionFactor: 0.0001,
    }]);
    const bars = [{
      id: 81, boqProjectId: PROJECT_ID, boqItemId: 13,
      chainageFrom: 0, chainageTo: 1.6, side: "lhs", plannedQty: 3000,
    }] as any;

    const evidence = await new FixtureStorage().getWorkProgrammeExecutionEvidence(PROJECT_ID, bars, fx.fakeDb);
    expect(evidence.get(81)).toMatchObject({
      reportedQty: 2400,
      reviewRequired: false,
    });
    expect(evidence.get(81)?.conversionWarnings.join(" ")).toMatch(/Ignored stale conversion factor/);
  });
});
