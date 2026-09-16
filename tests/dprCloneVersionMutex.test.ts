/**
 * Draft DPRs are edited in place and must never enter the clone/version
 * insertion paths. Submitted clone/version writes take the BOQ project mutex
 * before inserting the successor.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const fx = vi.hoisted(() => ({
  transaction: vi.fn(),
}));

vi.mock("../server/db", () => ({
  db: {
    transaction: fx.transaction,
  },
}));

import {
  DprDraftMutationError,
  storage,
} from "../server/storage";
import { boqProjects, dprs } from "@shared/schema";

const DPR_ID = 901;
const PROJECT_ID = 77;

function source(overrides: Record<string, unknown> = {}) {
  return {
    id: DPR_ID,
    date: "2026-03-10",
    site: "ALIPUR",
    engineer: "FIELD ENGINEER",
    role: "engineer",
    dprStatus: "submitted",
    boqProjectId: PROJECT_ID,
    submittedAt: "2026-03-10 17:00:00",
    createdAt: new Date("2026-03-10T17:00:00.000Z"),
    progress: [],
    equipment: [],
    labour: [],
    materials: [],
    sitePurchases: [],
    structureItems: [],
    ...overrides,
  } as any;
}

function setupTransaction(status: "draft" | "submitted", mode: "clone" | "version") {
  const events: string[] = [];
  const lockedSource = {
    id: DPR_ID,
    dprStatus: status,
    boqProjectId: PROJECT_ID,
    site: "ALIPUR",
    isSuperseded: false,
  };
  const selectResults = mode === "clone"
    ? [[{ boqProjectId: PROJECT_ID }], [{ id: PROJECT_ID }], [lockedSource]]
    : [[lockedSource], [{ id: PROJECT_ID }], [lockedSource]];
  let selectCalls = 0;
  const select = vi.fn(() => {
    const result = selectResults[selectCalls] ?? [];
    selectCalls += 1;
    const q: any = {
      from(table: any) {
        if (table === boqProjects) events.push("project-select");
        if (table === dprs) events.push("dpr-select");
        return q;
      },
      where() { return q; },
      for(kind: string) {
        if (kind === "update") {
          events.push(events.at(-1) === "project-select" ? "project-lock" : "dpr-lock");
        }
        return q;
      },
      limit() { return q; },
      orderBy() { return q; },
      then(resolve: (value: any) => unknown, reject?: (error: unknown) => unknown) {
        return Promise.resolve(result).then(resolve, reject);
      },
    };
    return q;
  });
  const insert = vi.fn((table: any) => {
    if (table === dprs) events.push("dpr-insert");
    const q: any = {
      values() { return q; },
      returning: vi.fn(async () => table === dprs ? [{
        id: DPR_ID + 1,
        ...source({ id: DPR_ID + 1 }),
      }] : []),
    };
    return q;
  });
  const update = vi.fn(() => {
    const q: any = {
      set() { return q; },
      where() { return q; },
      returning: vi.fn(async () => [{ id: DPR_ID }]),
    };
    return q;
  });
  const tx = { select, insert, update };
  fx.transaction.mockImplementationOnce(async (callback: (value: any) => Promise<unknown>) => callback(tx));
  return { events, insert };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("DPR clone/version draft prohibition", () => {
  it("rejects a draft clone after locking the project and source, before INSERT", async () => {
    vi.spyOn(storage, "getDpr").mockResolvedValueOnce(source({ dprStatus: "draft" }));
    const tx = setupTransaction("draft", "clone");

    await expect(storage.cloneDpr(DPR_ID, "manager"))
      .rejects.toBeInstanceOf(DprDraftMutationError);

    expect(tx.events).toEqual([
      "dpr-select",
      "project-select",
      "project-lock",
      "dpr-select",
      "dpr-lock",
    ]);
    expect(tx.insert).not.toHaveBeenCalled();
  });

  it("rejects a draft version after locking the project and source, before INSERT", async () => {
    const tx = setupTransaction("draft", "version");

    await expect(storage.createVersionDpr(
      DPR_ID,
      source({ id: undefined, dprStatus: "draft" }),
      "manager",
    )).rejects.toBeInstanceOf(DprDraftMutationError);

    expect(tx.events).toEqual([
      "dpr-select",
      "project-select",
      "project-lock",
      "dpr-select",
      "dpr-lock",
    ]);
    expect(tx.insert).not.toHaveBeenCalled();
  });
});

describe("submitted clone/version project mutex", () => {
  it("locks the project before a submitted clone INSERT", async () => {
    vi.spyOn(storage, "getDpr").mockResolvedValueOnce(source());
    const tx = setupTransaction("submitted", "clone");

    const result = await storage.cloneDpr(DPR_ID, "manager");

    expect(result).toMatchObject({ id: DPR_ID + 1 });
    expect(tx.events.indexOf("project-lock")).toBeGreaterThanOrEqual(0);
    expect(tx.events.indexOf("project-lock")).toBeLessThan(tx.events.indexOf("dpr-insert"));
  });

  it("locks the project before a submitted version INSERT", async () => {
    const tx = setupTransaction("submitted", "version");

    const result = await storage.createVersionDpr(
      DPR_ID,
      source({ id: undefined }),
      "manager",
    );

    expect(result).toMatchObject({ id: DPR_ID + 1 });
    expect(tx.events.indexOf("project-lock")).toBeGreaterThanOrEqual(0);
    expect(tx.events.indexOf("project-lock")).toBeLessThan(tx.events.indexOf("dpr-insert"));
  });

  it("keeps clone and version on the identical project-before-DPR lock order for a positive pin", async () => {
    vi.spyOn(storage, "getDpr").mockResolvedValueOnce(source());
    const cloneTx = setupTransaction("submitted", "clone");
    await expect(storage.cloneDpr(DPR_ID, "manager")).resolves.toMatchObject({ id: DPR_ID + 1 });

    const versionTx = setupTransaction("submitted", "version");
    await expect(storage.createVersionDpr(
      DPR_ID,
      source({ id: undefined }),
      "manager",
    )).resolves.toMatchObject({ id: DPR_ID + 1 });

    for (const events of [cloneTx.events, versionTx.events]) {
      expect(events.indexOf("project-lock")).toBeGreaterThanOrEqual(0);
      expect(events.indexOf("dpr-lock")).toBeGreaterThanOrEqual(0);
      expect(events.indexOf("project-lock")).toBeLessThan(events.indexOf("dpr-lock"));
      expect(events.indexOf("dpr-lock")).toBeLessThan(events.indexOf("dpr-insert"));
    }
  });
});

describe("versioned DPR lifecycle corrections", () => {
  it("uses the real storage finalizer to row-lock and adopt an unowned closed usage", async () => {
    const usage = {
      id: 701,
      date: "2026-03-10",
      equipmentId: 77,
      status: "closed",
      dprId: null,
      sourceUsageId: null,
      successorId: null,
      openingReading: 100,
      closingReading: 110,
      dieselIssued: 0,
      dieselSource: "plant_stock",
      dieselIncluded: false,
    };
    const events: string[] = [];
    let selectCalls = 0;
    const select = vi.fn(() => {
      const results = [
        [usage], // finalize: canonical usage
        [], // finalize: successor lookup
        [usage], // _updateEquipmentUsageTxn: canonical usage
        [], // _updateEquipmentUsageTxn: successor lookup
        [{ id: 77, name: "SOIL COMPACTOR", consumptionNorm: 5 }], // equipment master
        [], // historical diesel ledger
        [], // HLC party lookup
      ];
      const result = results[selectCalls++] ?? [];
      const q: any = {
        from() { return q; },
        where() { return q; },
        limit() { return q; },
        then(resolve: (value: any) => unknown, reject?: (error: unknown) => unknown) {
          return Promise.resolve(result).then(resolve, reject);
        },
      };
      return q;
    });
    const update = vi.fn(() => {
      const q: any = {
        set(values: any) {
          q.values = values;
          return q;
        },
        where() { return q; },
        returning: vi.fn(async () => [{ ...usage, dprId: 902, openingReading: 125, ...q.values }]),
      };
      return q;
    });
    const tx = {
      execute: vi.fn(async () => {
        events.push("usage-lock");
      }),
      select,
      update,
      delete: vi.fn(() => ({
        where: vi.fn(async () => undefined),
      })),
    };

    await (storage as any).finalizeDprEquipmentUsageTx(
      tx,
      { id: 902, date: "2026-03-10", site: "ALIPUR", dprStatus: "submitted", engineer: "FIELD ENGINEER" },
      [{
        plantUsageId: 701,
        equipmentId: 77,
        entryType: "time_meter",
        openingReading: 125,
        closingReading: 135,
        startTime: "08:00",
        endTime: "09:00",
        operator: "OPERATOR",
        task: "COMPACTION",
        diesel: 0,
        dieselSource: "plant_stock",
      }],
      {
        userId: 42,
        userName: "Admin",
        allowUnownedLinkedCorrectionIds: [701],
      },
    );

    expect(events).toEqual(["usage-lock"]);
    expect(update).toHaveBeenCalledTimes(1);
    expect(update.mock.results[0].value.set).toBeDefined();
    expect(update.mock.results[0].value.values).toEqual(expect.objectContaining({
      dprId: 902,
      openingReading: 125,
      closingReading: 135,
      closedByUserId: 42,
    }));
  });

  it("keeps a moved predecessor immutable while storing the corrected DPR copy", async () => {
    const usage = {
      id: 702,
      date: "2026-03-10",
      equipmentId: 77,
      status: "closed",
      dprId: 901,
      sourceUsageId: null,
      dieselIssued: 0,
      dieselSource: "plant_stock",
    };
    let selectCalls = 0;
    const select = vi.fn(() => {
      const result = selectCalls++ === 0
        ? [usage]
        : [{ id: 703 }];
      const q: any = {
        from() { return q; },
        where() { return q; },
        limit() { return q; },
        then(resolve: (value: any) => unknown, reject?: (error: unknown) => unknown) {
          return Promise.resolve(result).then(resolve, reject);
        },
      };
      return q;
    });
    const tx = {
      execute: vi.fn(),
      select,
      update: vi.fn(),
    };

    await (storage as any).finalizeDprEquipmentUsageTx(
      tx,
      { id: 904, date: "2026-03-10", site: "ALIPUR", dprStatus: "submitted", engineer: "FIELD ENGINEER" },
      [{
        plantUsageId: 702,
        equipmentId: 77,
        entryType: "time_meter",
        openingReading: 999,
        closingReading: 110,
        startTime: "08:00",
        endTime: "09:00",
        diesel: 0,
        dieselSource: "plant_stock",
      }],
      { userId: 42, allowMovedSourceCorrection: true },
    );

    expect(tx.execute).toHaveBeenCalledTimes(1);
    expect(tx.update).not.toHaveBeenCalled();
  });

  it("does not adopt an unchanged unowned row when another linked row is corrected", async () => {
    const usage = (id: number) => ({
      id,
      date: "2026-03-10",
      equipmentId: 77,
      status: "closed",
      dprId: null,
      sourceUsageId: null,
      dieselIssued: 0,
      dieselSource: "plant_stock",
    });
    const first = usage(711);
    const second = usage(712);
    const selectResults = [
      [first], [], [first], [], [{ id: 77, name: "SOIL COMPACTOR", consumptionNorm: 5 }], [], [],
      [second], [], [second], [], [{ id: 77, name: "SOIL COMPACTOR", consumptionNorm: 5 }], [], [],
    ];
    let selectCalls = 0;
    const select = vi.fn(() => {
      const result = selectResults[selectCalls++] ?? [];
      const q: any = {
        from() { return q; },
        where() { return q; },
        limit() { return q; },
        then(resolve: (value: any) => unknown, reject?: (error: unknown) => unknown) {
          return Promise.resolve(result).then(resolve, reject);
        },
      };
      return q;
    });
    const update = vi.fn(() => {
      const q: any = {
        set(values: any) {
          q.values = values;
          return q;
        },
        where() { return q; },
        returning: vi.fn(async () => [{ ...first, ...q.values }]),
      };
      return q;
    });
    const tx = {
      execute: vi.fn(),
      select,
      update,
      delete: vi.fn(() => ({ where: vi.fn(async () => undefined) })),
    };
    const log = (plantUsageId: number, openingReading: number) => ({
      plantUsageId,
      equipmentId: 77,
      entryType: "time_meter",
      openingReading,
      closingReading: openingReading + 10,
      startTime: "08:00",
      endTime: "09:00",
      diesel: 0,
      dieselSource: "plant_stock",
    });

    await (storage as any).finalizeDprEquipmentUsageTx(
      tx,
      { id: 905, date: "2026-03-10", site: "ALIPUR", dprStatus: "submitted", engineer: "FIELD ENGINEER" },
      [log(711, 125), log(712, 200)],
      { userId: 42, allowUnownedLinkedCorrectionIds: [711] },
    );

    expect(update).toHaveBeenCalledTimes(1);
    expect(update.mock.results[0].value.values).toEqual(expect.objectContaining({ dprId: 905, openingReading: 125 }));
  });
});