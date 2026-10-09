import { beforeAll, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
vi.mock("../server/db", () => ({ db: {} }));
let Storage: any;
let Conflict: any;
beforeAll(async () => {
  const m = await import("../server/storage");
  Storage = m.DatabaseStorage;
  Conflict = m.EquipmentIncomingConflictError;
});
const dpr = { id: 9001, date: "2026-10-09", site: "TAKKADPALLY-SIRUR", dprStatus: "submitted" };
const log = { id: 9002, machine: "EQLINK TEST MACHINE", plantUsageId: 9003, diesel: 0 };
function transaction(rows: any[][]) {
  const tx: any = { execute: vi.fn(async () => ({})), select: vi.fn(() => {
    const q: any = { from: () => q, where: () => q, limit: async () => rows.shift() ?? [] };
    return q;
  }) };
  return tx;
}
it("unchanged equipment still locks and rejects a dangling link with row details", async () => {
  const tx = transaction([[]]);
  const storage = new Storage();
  const update = vi.spyOn(storage, "_updateEquipmentUsageTxn");
  const error = await storage.finalizeDprEquipmentUsageTx(tx, dpr, [log]).catch((e: any) => e);
  expect(error).toBeInstanceOf(Conflict);
  expect(error.code).toBe("EQUIPMENT_INCOMING_CONFLICT");
  expect(error.details).toEqual({ equipmentLogId: 9002, plantUsageId: 9003, equipmentName: log.machine, dprId: 9001, dprDate: dpr.date });
  for (const text of [log.machine, dpr.date, "9002", "9003"]) expect(error.message).toContain(text);
  expect(tx.execute).toHaveBeenCalledOnce();
  expect(update).not.toHaveBeenCalled();
});
it("date mismatch retains the conflict and names both dates and IDs", async () => {
  const tx = transaction([[{ id: 9003, status: "open", date: "2026-10-08" }], []]);
  const error = await new Storage().finalizeDprEquipmentUsageTx(tx, dpr, [log]).catch((e: any) => e);
  expect(error).toBeInstanceOf(Conflict);
  expect(error.details.usageDate).toBe("2026-10-08");
  for (const text of [log.machine, "2026-10-08", dpr.date, "9002", "9003"]) expect(error.message).toContain(text);
});
it("a valid closed non-owned link remains a no-op", async () => {
  const storage = new Storage();
  const update = vi.spyOn(storage, "_updateEquipmentUsageTxn");
  await storage.finalizeDprEquipmentUsageTx(transaction([[{ id: 9003, status: "closed" }], []]), dpr, [log]);
  expect(update).not.toHaveBeenCalled();
});
it("a valid open link still runs normal closure", async () => {
  const storage = new Storage();
  const update = vi.spyOn(storage, "_updateEquipmentUsageTxn").mockResolvedValue({});
  await storage.finalizeDprEquipmentUsageTx(transaction([[{ id: 9003, status: "open", date: dpr.date }], []]), dpr, [log]);
  expect(update).toHaveBeenCalledWith(9003, expect.objectContaining({ status: "closed", closedByDprId: 9001 }), expect.anything());
});
it("submitted updates still run closure and transport the conflict as 409", () => {
  const storage = readFileSync("server/storage.ts", "utf8");
  const routes = readFileSync("server/routes.ts", "utf8");
  expect(storage).toContain("await this.finalizeDprEquipmentUsageTx(tx, updated, insertedEquipLogs, audit)");
  expect(routes).toContain('res.status(409).json({ code: err.code, message: err.message, ...(err.details ? { details: err.details } : {}) })');
});
