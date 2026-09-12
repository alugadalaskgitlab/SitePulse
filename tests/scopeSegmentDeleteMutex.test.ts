/**
 * Scope-segment deletion must re-read lifecycle state after the project mutex
 * is acquired. A stale draft read must never delete a concurrently confirmed
 * segment.
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

import { storage } from "../server/storage";
import { boqProjects, projectScopeSegments } from "@shared/schema";

const SEGMENT_ID = 501;
const PROJECT_ID = 77;

function setupTransaction(
  initialStatus: "draft" | "confirmed",
  lockedStatus: "draft" | "confirmed",
  deletedRows: any[] = [{ id: SEGMENT_ID, status: "draft" }],
) {
  const events: string[] = [];
  const whereArgs: any[] = [];
  const selectResults = [
    [{ projectId: PROJECT_ID }],
    [{ id: PROJECT_ID }],
    [{ id: SEGMENT_ID, boqProjectId: PROJECT_ID, status: lockedStatus }],
  ];
  let selectCalls = 0;
  const select = vi.fn(() => {
    const result = selectResults[selectCalls] ?? [];
    selectCalls += 1;
    const q: any = {
      from(table: any) {
        if (table === projectScopeSegments) events.push("scope-read");
        if (table === boqProjects) events.push("project-read");
        return q;
      },
      where(condition: any) {
        whereArgs.push(condition);
        return q;
      },
      for(kind: string) {
        events.push(kind === "update" ? "row-lock" : `row-lock:${kind}`);
        return q;
      },
      limit() { return q; },
      then(resolve: (value: any) => unknown, reject?: (error: unknown) => unknown) {
        return Promise.resolve(result).then(resolve, reject);
      },
    };
    return q;
  });
  const returning = vi.fn(async () => deletedRows);
  const deleteSpy = vi.fn(() => {
    const q: any = {
      where(condition: any) {
        whereArgs.push(condition);
        return q;
      },
      returning,
    };
    return q;
  });
  const tx = { select, delete: deleteSpy };
  fx.transaction.mockImplementationOnce(async (callback: (value: any) => Promise<unknown>) => callback(tx));
  // The initial status is intentionally unused by the transaction double:
  // it documents the stale pre-lock value observed by the old implementation.
  void initialStatus;
  return { events, whereArgs, deleteSpy };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("deleteProjectScopeSegment project mutex", () => {
  it("re-reads after locking and rejects a segment confirmed concurrently", async () => {
    const tx = setupTransaction("draft", "confirmed");

    await expect(storage.deleteProjectScopeSegment(SEGMENT_ID))
      .rejects.toThrow("SEGMENT_NOT_DRAFT");

    expect(tx.events).toEqual([
      "scope-read",
      "project-read",
      "row-lock",
      "scope-read",
      "row-lock",
    ]);
    expect(tx.deleteSpy).not.toHaveBeenCalled();
  });

  it("deletes only a currently drafted row through a status-conditional delete", async () => {
    const tx = setupTransaction("draft", "draft");

    await expect(storage.deleteProjectScopeSegment(SEGMENT_ID)).resolves.toBeUndefined();

    expect(tx.deleteSpy).toHaveBeenCalledTimes(1);
    // The delete builder receives one combined predicate containing both the
    // identity and current draft-status conditions.
    expect(tx.whereArgs).toHaveLength(4);
  });

  it("rejects when the conditional draft delete affects no row", async () => {
    const tx = setupTransaction("draft", "draft", []);

    await expect(storage.deleteProjectScopeSegment(SEGMENT_ID))
      .rejects.toThrow("SEGMENT_NOT_DRAFT");
    expect(tx.deleteSpy).toHaveBeenCalledTimes(1);
  });
});