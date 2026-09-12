/**
 * Arrangement creation must use the same project mutex and scope token as
 * the route's validation read.  A stale token is rejected before INSERT.
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
  ScopeChangedDuringPlanningError,
  storage,
} from "../server/storage";

const PROJECT_ID = 77;
const arrangement = {
  boqProjectId: PROJECT_ID,
  boqItemId: 900,
  materialLabel: "Approved earth",
  workCategory: "earthwork",
  arrangementType: "departmental",
  status: "draft",
  allocatedQty: 100,
  uom: "CUM",
} as any;

function setupTransaction(currentToken: string) {
  const project = { id: PROJECT_ID };
  const insertReturning = vi.fn(async () => [{ id: 1201, ...arrangement }]);
  const insertValues = vi.fn(() => ({ returning: insertReturning }));
  const insert = vi.fn(() => ({ values: insertValues }));
  const tx: any = {
    select: vi.fn(() => {
      const query: any = {
        from: () => query,
        where: () => query,
        for: () => query,
        limit: () => query,
        then: (resolve: (value: unknown) => unknown, reject?: (error: unknown) => unknown) =>
          Promise.resolve([project]).then(resolve, reject),
      };
      return query;
    }),
    execute: vi.fn(async () => ({ rows: [{ token: currentToken }] })),
    insert,
  };
  fx.transaction.mockImplementationOnce(async (callback: (value: any) => Promise<unknown>) => callback(tx));
  return { tx, insert, insertValues, insertReturning };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("createEarthworkArrangement scope mutex", () => {
  it("rejects a stale scope token before inserting an arrangement", async () => {
    const { tx, insert } = setupTransaction("new-token");

    await expect(storage.createEarthworkArrangement(arrangement, "old-token"))
      .rejects.toBeInstanceOf(ScopeChangedDuringPlanningError);

    expect(tx.execute).toHaveBeenCalledTimes(1);
    expect(insert).not.toHaveBeenCalled();
  });

  it("locks and inserts when the scope token is still current", async () => {
    const { tx, insert, insertValues, insertReturning } = setupTransaction("current-token");

    const result = await storage.createEarthworkArrangement(arrangement, "current-token");

    expect(result).toMatchObject({ id: 1201, boqProjectId: PROJECT_ID });
    expect(tx.execute).toHaveBeenCalledTimes(1);
    expect(insert).toHaveBeenCalledTimes(1);
    expect(insertValues).toHaveBeenCalledWith(arrangement);
    expect(insertReturning).toHaveBeenCalledTimes(1);
  });
});