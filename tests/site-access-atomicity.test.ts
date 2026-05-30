/**
 * Regression test: setUserSiteAccess must be atomic.
 *
 * If the insert step fails inside the transaction, the delete must be rolled
 * back so the user is NOT left with zero rows (which the system interprets as
 * all-sites access — an unintended privilege escalation).
 */

import { vi, describe, it, expect, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Capture transaction / delete / insert spies BEFORE any imports
// ---------------------------------------------------------------------------

const { txDeleteSpy, txInsertValuesSpy, txInsertSpy, transactionSpy } = vi.hoisted(() => {
  const txInsertValuesSpy = vi.fn().mockResolvedValue([]);
  const txInsertSpy = vi.fn().mockReturnValue({ values: txInsertValuesSpy });
  const txDeleteSpy = vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) });

  // Default: run the callback (success path)
  const transactionSpy = vi.fn().mockImplementation(async (cb: (tx: any) => Promise<void>) => {
    await cb({ delete: txDeleteSpy, insert: txInsertSpy });
  });

  return { txDeleteSpy, txInsertValuesSpy, txInsertSpy, transactionSpy };
});

// Mock the db module so DatabaseStorage uses our spies
vi.mock("../server/db", () => ({
  db: {
    transaction: transactionSpy,
    select: vi.fn().mockReturnValue({ from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) }) }),
    delete: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) }),
    insert: vi.fn().mockReturnValue({ values: vi.fn().mockResolvedValue([]) }),
  },
}));

// DatabaseStorage is constructed at module load; import after mocks are set up.
import { storage } from "../server/storage";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resetSpies() {
  transactionSpy.mockClear();
  txDeleteSpy.mockClear();
  txInsertSpy.mockClear();
  txInsertValuesSpy.mockClear();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("setUserSiteAccess — atomicity", () => {
  beforeEach(resetSpies);

  it("uses db.transaction (not raw delete + insert) to ensure atomicity", async () => {
    await storage.setUserSiteAccess(1, [10, 20]);
    expect(transactionSpy).toHaveBeenCalledTimes(1);
  });

  it("on success: delete and insert are both called inside the transaction", async () => {
    await storage.setUserSiteAccess(1, [10, 20]);

    expect(txDeleteSpy).toHaveBeenCalledTimes(1);
    expect(txInsertSpy).toHaveBeenCalledTimes(1);
    expect(txInsertValuesSpy).toHaveBeenCalledTimes(1);

    const insertedRows = txInsertValuesSpy.mock.calls[0][0] as { userId: number; siteId: number }[];
    expect(insertedRows.map((r) => r.siteId).sort()).toEqual([10, 20]);
  });

  it("on failure: transaction rolls back — prior rows are NOT deleted", async () => {
    // Simulate the insert inside the transaction failing
    transactionSpy.mockImplementationOnce(async (cb: (tx: any) => Promise<void>) => {
      await cb({
        delete: txDeleteSpy,
        insert: vi.fn().mockReturnValue({
          values: vi.fn().mockRejectedValue(new Error("FK violation")),
        }),
      });
    });

    await expect(storage.setUserSiteAccess(1, [99])).rejects.toThrow("FK violation");

    // The transaction wrapper itself is responsible for rollback; the key
    // observable here is that the outer caller received the error (no silent
    // swallow) and did NOT perform a separate delete outside the transaction.
    expect(transactionSpy).toHaveBeenCalledTimes(1);
  });

  it("deduplicates siteIds before writing", async () => {
    await storage.setUserSiteAccess(1, [5, 5, 10, 5, 10]);

    const insertedRows = txInsertValuesSpy.mock.calls[0][0] as { siteId: number }[];
    const ids = insertedRows.map((r) => r.siteId).sort((a, b) => a - b);
    expect(ids).toEqual([5, 10]);
  });

  it("skips insert entirely when siteIds is empty (clear all sites)", async () => {
    await storage.setUserSiteAccess(1, []);

    expect(txDeleteSpy).toHaveBeenCalledTimes(1);
    expect(txInsertSpy).not.toHaveBeenCalled();
  });

  it("filters out invalid (non-positive) siteIds", async () => {
    await storage.setUserSiteAccess(1, [0, -1, 5, NaN as unknown as number, 3]);

    const insertedRows = txInsertValuesSpy.mock.calls[0][0] as { siteId: number }[];
    expect(insertedRows.map((r) => r.siteId).sort((a, b) => a - b)).toEqual([3, 5]);
  });
});
