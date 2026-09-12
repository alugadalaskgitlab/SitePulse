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
  const lockedSource = { id: DPR_ID, dprStatus: status, boqProjectId: PROJECT_ID };
  const selectResults = mode === "clone"
    ? [[{ boqProjectId: PROJECT_ID }], [{ id: PROJECT_ID }], [lockedSource]]
    : [[{ boqProjectId: PROJECT_ID }], [{ id: PROJECT_ID }], [lockedSource]];
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
});