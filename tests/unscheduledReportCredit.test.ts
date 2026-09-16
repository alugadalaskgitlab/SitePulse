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
      where: () => q,
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
    // The raw aggregate is what the production SQL returns after joining the
    // persisted DPR/progress/BOQ rows. A null programmeBarId is not a filter.
    fx.executeRows.push(
      [{ boqItemId: ITEM_ID, totalQty: 6, lastDate: "2026-08-05" }],
      [], // structure DPR aggregate
    );

    const [row] = await new FixtureStorage().getPlanVsActual(PROJECT_ID, "2026-08-31");

    expect(row).toMatchObject({
      boqItemId: ITEM_ID,
      totalActual: 6,
      lastActivityDate: "2026-08-05",
    });
  });
});