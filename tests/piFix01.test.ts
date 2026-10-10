import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { is } from "drizzle-orm";
import { getTableConfig, PgTable } from "drizzle-orm/pg-core";
import * as schema from "../shared/schema";
import { buildPiTimeline, formatPiTimestamp } from "../shared/piTimeline";
import { linkedPiStoreStock } from "../shared/piStoreStock";

const holder = vi.hoisted(() => ({ db: null as any }));
vi.mock("../server/db", () => ({ get db() { return holder.db; }, pool: {} }));
vi.mock("../server/push", () => ({ sendPushToAll: vi.fn() }));
let pg: PGlite, storage: any;
beforeAll(async () => {
  pg = new PGlite();
  for (const table of Object.values(schema).filter(v => is(v, PgTable)) as PgTable[]) {
    const cfg = getTableConfig(table);
    await pg.exec(`CREATE TABLE "${cfg.name}" (${cfg.columns.map(c => `"${c.name}" ${c.getSQLType()}${c.primary ? " PRIMARY KEY" : ""}`).join(",")})`);
  }
  holder.db = drizzle(pg, { schema });
  storage = new (await import("../server/storage")).DatabaseStorage();
}, 60000);
afterAll(async () => pg?.close());

it.each(["UTC", "America/Los_Angeles", "Asia/Kolkata"])("formats instants and legacy UTC independently of browser TZ %s", timezone => {
  const old = process.env.TZ; process.env.TZ = timezone;
  try {
    for (const input of ["2026-10-10T03:00:00Z", "2026-10-10 03:00:00", "2026-10-10T08:30:00+05:30", "2026-10-10 08:30:00 IST"])
      expect(formatPiTimestamp(input)).toBe("10-Oct-2026, 08:30 AM IST");
    expect(formatPiTimestamp("2026-10-10T20:00:00Z")).toBe("11-Oct-2026, 01:30 AM IST");
    for (const input of [null, "", "2026-10-10", "bad"]) expect(formatPiTimestamp(input)).toBe("Time not recorded");
  } finally { if (old === undefined) delete process.env.TZ; else process.env.TZ = old; }
});
it("retains item-specific repeat events, unknown completion, prior approval, and explicit reopened audit evidence", () => {
  const events = buildPiTimeline({
    status: "completed", createdAt: "2026-10-01T01:00:00Z", raisedBy: "Raiser",
    approvedBy: "Manager", approvedAt: "2026-10-02 02:00:00", storesStatus: "verified",
    storesVerifiedAt: null, updatedAt: "2026-10-09T22:00:00Z",
    items: [{ id: 1, description: "A" }, { id: 2, description: "B" }],
  }, [
    { id: 1, indentItemId: 1, transactionType: "purchaser_action", qty: 3, createdAt: "2026-10-03T01:00:00Z", createdBy: "Buyer" },
    { id: 2, indentItemId: 2, transactionType: "purchaser_action", qty: 2, createdAt: "2026-10-04T01:00:00Z", createdBy: "Buyer 2" },
    { id: 3, indentItemId: 1, transactionType: "handover", createdAt: "2026-10-05T01:00:00Z", createdBy: "Recorder", receivedBy: "Stores" },
    { id: 4, indentItemId: 1, transactionType: "purchaser_action", reasonCode: "ordered", qty: 8, createdAt: "2026-10-02T03:00:00Z", createdBy: "Orderer" },
  ], [{ id: 5, action: "reopen", createdAt: "2026-10-06T01:00:00Z", userName: "Admin" }]);
  expect(events.filter(e => e.label === "Purchased").map(e => e.itemId)).toEqual([1, 2]);
  expect(events.find(e => e.label === "Handed Over / Received")?.actor).toBe("Stores");
  expect(events.find(e => e.label === "Completed")?.at).toBeNull();
  expect(events.find(e => e.label === "Stores Verified")?.at).toBeNull();
  expect(events.some(e => e.label === "Approved")).toBe(true);
  expect(events.some(e => e.label === "Reopened" && e.actor === "Admin")).toBe(true);
  expect(events.some(e => e.label === "Stores Check Bypassed")).toBe(false);
});
it("distinguishes zero stock, missing links, ambiguous links and incompatible units", () => {
  const stores = [{ id: 1, name: "Renamed", uom: "Nos", balance: 0 }];
  expect(linkedPiStoreStock({ storeItemId: 1, uom: "no" }, stores)?.liveStockQty).toBe(0);
  expect(linkedPiStoreStock({ storeItemId: 1, uom: "kg" }, stores)?.liveStockQty).toBeNull();
  expect(linkedPiStoreStock({ storeItemId: 99, uom: "no" }, stores)?.liveStockQty).toBeNull();
  expect(linkedPiStoreStock({ storeItemId: -1, uom: "no" }, stores)?.liveStockQty).toBeNull();
});
it("recovers legacy header times from audit without duplicating an undated placeholder", () => {
  const events = buildPiTimeline({ status: "approved", raisedBy: "Raiser", approvedBy: "Manager", items: [] }, [], [
    { id: 1, action: "create", createdAt: "2026-10-01T00:00:00Z", userName: "Raiser" },
    { id: 2, action: "approve", createdAt: "2026-10-02T00:00:00Z", userName: "Manager" },
  ]);
  expect(events).toHaveLength(2);
  expect(events.every(e => e.at != null)).toBe(true);
});
it("retains receipt history even when the legacy receipt pointer is absent", () => {
  const events = buildPiTimeline({ status: "completed", items: [{ id: 1, history: [{
    id: 10, action: "DELIVERY_PARTIAL", actionAt: "2026-10-03 03:00:00", actionBy: "Receiver",
  }] }] });
  expect(events.find(e => e.label === "Received (partial)")).toMatchObject({ actor: "Receiver", itemId: 1, at: "2026-10-03T03:00:00.000Z" });
});
it("enriches real PI list and detail from direct/inactive Store IDs and exact historical GRN links", async () => {
  const db = holder.db;
  await db.insert(schema.purchaseIndents).values({ id: 1, date: "2026-10-10", indentNo: "FIXTURE", proposedBy: "A", raisedBy: "B", status: "approved", piType: "stores" });
  await db.insert(schema.purchaseIndentItems).values([
    { id: 11, indentId: 1, description: "Old name", qty: 10, uom: "Nos", purpose: "Test", storeItemId: 21 },
    { id: 12, indentId: 1, description: "Different PI description", qty: 4, uom: "Nos", purpose: "Test" },
  ]);
  await db.insert(schema.storeItems).values([
    { id: 21, name: "Renamed inactive Store master", category: "Tools", uom: "Nos", isActive: 0 },
    { id: 22, name: "Linked through GRN", category: "Tools", uom: "Nos", isActive: 1 },
  ]);
  await db.insert(schema.storeGrns).values([
    { id: 31, grnNumber: "G1", date: "2026-10-04", status: "finalized", isCancelled: false },
    { id: 32, grnNumber: "G2", date: "2026-10-05", status: "draft", isCancelled: false },
    { id: 33, grnNumber: "G3", date: "2026-10-06", status: "finalized", isCancelled: true },
  ]);
  await db.insert(schema.storeGrnItems).values([
    { id: 41, grnId: 31, itemId: 21, sourcePiItemId: 11, qty: 10, uom: "Nos" },
    { id: 42, grnId: 31, itemId: 22, sourcePiItemId: 12, qty: 4, uom: "Nos" },
    { id: 43, grnId: 32, itemId: 21, qty: 100, uom: "Nos" },
    { id: 44, grnId: 33, itemId: 21, qty: 200, uom: "Nos" },
  ]);
  await db.insert(schema.storeIssues).values({ id: 51, isCancelled: false });
  await db.insert(schema.storeIssueItems).values({ id: 52, issueId: 51, itemId: 21, qty: 3 });
  await db.insert(schema.auditLogs).values({ id: 61, module: "store_grn", transactionId: 31, action: "finalize", userName: "Stores Actor", createdAt: new Date("2026-10-04T06:00:00Z") });
  await db.insert(schema.users).values({ id: 71, fullName: "Order Actor" });
  await db.insert(schema.purchaseOrders).values({ id: 81, purchaseIndentId: 1, purchaseIndentItemId: 11,
    status: "approved", raisedByUserId: 71, approvedByUserId: 71, raisedAt: new Date("2026-10-02T06:00:00Z"), approvedAt: new Date("2026-10-03T06:00:00Z") });
  const list = await storage.getPurchaseIndents();
  expect(list[0].items.map((i: any) => i.liveStockQty)).toEqual([7, 4]);
  const detail = await storage.getPurchaseIndent(1);
  expect(detail.items.map((i: any) => i.liveStockQty)).toEqual([7, 4]);
  expect(detail.timeline.filter((e: any) => e.label === "Received")).toHaveLength(2);
  expect(detail.timeline.find((e: any) => e.label === "Received")).toMatchObject({ actor: "Stores Actor", at: "2026-10-04T06:00:00.000Z" });
  expect(detail.timeline.find((e: any) => e.label === "Purchase Order Approved")).toMatchObject({ actor: "Order Actor", at: "2026-10-03T06:00:00.000Z" });
  await db.update(schema.storeIssueItems).set({ qty: 10 });
  expect((await storage.getPurchaseIndents())[0].items[0].liveStockQty).toBe(0);
  expect((await storage.getPurchaseIndent(1)).items[0].liveStockQty).toBe(0);
});
