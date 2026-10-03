import { beforeAll, describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { equipmentLogs, labourLogs, materialLogs } from "../shared/schema";
import { getTableColumns } from "drizzle-orm";

vi.mock("../server/db", () => ({ db: {}, pool: {} }));
let Storage: any;
beforeAll(async () => { Storage = (await import("../server/storage")).DatabaseStorage; });

describe("BOQ-LINK-01 storage contracts", () => {
  const tx = { select: () => { throw new Error("No master lookup expected"); } };
  it("clears legacy parent only on explicit General and preserves usage inputs", async () => {
    const input = { id: 1, machine: "DG", hoursWorked: 2, openingReading: 10, closingReading: 12, boqItemId: 7, resourceScope: "general", activitySegments: [], activityAllocations: [] };
    const [result] = await new Storage().normaliseDprEquipmentRowsTx(tx, [input]);
    expect(result).toMatchObject({ resourceScope: "general", boqItemId: null, hoursWorked: 2, openingReading: 10, closingReading: 12 });
  });
  it("does not silently erase child links on contradictory General", async () => {
    await expect(new Storage().normaliseDprEquipmentRowsTx(tx, [{ resourceScope: "general", activitySegments: [{}] }])).rejects.toThrow("Clear work assignments");
  });
  it("never mirrors assignments into parent BOQ and preserves unmodified legacy fallback", () => {
    const storage = new Storage();
    expect(storage.withEquipmentAllocationBoqMirror({ boqItemId: 7 }, [{ boqItemId: 8 }], true).boqItemId).toBeNull();
    expect(storage.withEquipmentAllocationBoqMirror({ boqItemId: 7 }, [], false).boqItemId).toBe(7);
  });
  it("declares exactly nullable no-default resource columns", () => {
    for (const table of [equipmentLogs, labourLogs, materialLogs]) {
      const column = getTableColumns(table).resourceScope;
      expect(column.name).toBe("resource_scope");
      expect(column.notNull).toBe(false);
      expect(column.hasDefault).toBe(false);
    }
  });
  it("ships ADD COLUMN only SQL", () => {
    const sql = readFileSync(".agents/outputs/boq-link-01/part-b-migration.sql", "utf8");
    expect(sql.trim().split(";").filter(s => s.trim())).toHaveLength(3);
    expect(sql).not.toMatch(/\b(DROP|RENAME|UPDATE|DELETE|DEFAULT)\b/i);
  });
});