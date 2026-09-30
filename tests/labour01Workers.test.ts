import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { cleanWorkerNames, insertLabourWithWorkers, replaceLabourWorkers } from "../server/labourWorkers";
import { labourLogs, labourLogWorkers } from "../shared/schema";

function transaction() {
  const inserted: Record<string, any[]> = {};
  const deleted: string[] = [];
  let nextId = 800;
  return {
    inserted, deleted,
    tx: {
      insert(table: any) {
        const name = table === labourLogs ? "labour_logs" : table === labourLogWorkers ? "labour_log_workers" : "unexpected";
        return {
          values(rows: any) {
            const values = Array.isArray(rows) ? rows : [rows];
            const result = values.map(row => ({ ...row, id: ++nextId }));
            inserted[name] = [...(inserted[name] ?? []), ...result];
            return { returning: async () => result, then: (resolve: any) => Promise.resolve(result).then(resolve) };
          },
        };
      },
      delete(table: any) {
        deleted.push(table === labourLogWorkers ? "labour_log_workers" : "unexpected");
        return { where: async () => undefined };
      },
    },
  };
}

describe("LABOUR-01 named labour child persistence", () => {
  it("keeps an old count-only row valid and inserts no workers", async () => {
    const { tx, inserted } = transaction();
    await insertLabourWithWorkers(tx, 11, [{ category: "Skilled", count: 3 }]);
    expect(inserted.labour_logs).toHaveLength(1);
    expect(inserted.labour_log_workers).toBeUndefined();
  });

  it("preserves names for identified replacements, trims blank names, and permits duplicates", async () => {
    const { tx, inserted } = transaction();
    await insertLabourWithWorkers(tx, 11, [
      { persistedId: 2, category: "Skilled", count: 1 },
      { persistedId: 3, category: "Unskilled", count: 2, workerNames: [" Sam ", "", "Sam"] },
    ], [
      { id: 2, workerNames: ["Nisha"] },
      { id: 3, workerNames: ["Removed"] },
    ]);
    expect(inserted.labour_logs?.every(row => row.persistedId === undefined && row.workerNames === undefined)).toBe(true);
    expect(inserted.labour_log_workers?.map(row => row.name)).toEqual(["Nisha", "Sam", "Sam"]);
    expect(inserted.labour_log_workers?.map(row => row.labourLogId)).toEqual([801, 802, 802]);
  });

  it("does not guess a previous named row from its index or category", async () => {
    const { tx, inserted } = transaction();
    await expect(insertLabourWithWorkers(tx, 1, [{ category: "Skilled", count: 1 }],
      [{ id: 2, workerNames: ["Nisha"] }])).rejects.toThrow("Reload saved labour row identities");
    expect(inserted.labour_logs).toBeUndefined();
  });

  it("distinguishes omitted children from explicit empty list in section reconciliation", async () => {
    const { tx, deleted, inserted } = transaction();
    await replaceLabourWorkers(tx, [{ id: 2 }], [{}]);
    expect(deleted).toHaveLength(0);
    await replaceLabourWorkers(tx, [{ id: 2 }], [{ workerNames: [] }]);
    expect(deleted).toEqual(["labour_log_workers"]);
    expect(inserted.labour_log_workers).toBeUndefined();
    await replaceLabourWorkers(tx, [{ id: 2 }], [{ workerNames: [" A ", " B "] }]);
    expect(inserted.labour_log_workers?.map(row => row.name)).toEqual(["A", "B"]);
  });

  it("requires a list of text names, while allowing names above count", () => {
    expect(cleanWorkerNames([" A ", "A", "  "])).toEqual(["A", "A"]);
    expect(cleanWorkerNames(undefined)).toBeUndefined();
    expect(() => cleanWorkerNames([42])).toThrow("Worker names");
  });

  it("declares a real cascading FK and index in the additive migration", () => {
    const sql = readFileSync("migrations/0039_labour_log_workers.sql", "utf8");
    expect(sql).toMatch(/labour_log_id integer NOT NULL REFERENCES labour_logs\(id\) ON DELETE CASCADE/);
    expect(sql).toMatch(/CREATE INDEX labour_log_workers_labour_log_id_idx ON labour_log_workers \(labour_log_id\)/);
  });
});