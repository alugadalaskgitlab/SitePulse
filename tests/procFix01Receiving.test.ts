import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { is } from "drizzle-orm";
import { getTableConfig, PgTable } from "drizzle-orm/pg-core";
import * as schema from "../shared/schema";

const holder = vi.hoisted(() => ({ db: null as any }));
vi.mock("../server/db", () => ({ get db() { return holder.db; }, pool: {} }));
vi.mock("../server/push", () => ({ sendPushToAll: vi.fn() }));

let pg: PGlite;
let storage: any;

beforeAll(async () => {
  pg = new PGlite();
  for (const table of Object.values(schema).filter(v => is(v, PgTable)) as PgTable[]) {
    const config = getTableConfig(table);
    await pg.exec(`CREATE TABLE "${config.name}" (${config.columns.map(column =>
      `"${column.name}" ${column.getSQLType()}${column.primary ? " PRIMARY KEY" : ""}`
    ).join(",")})`);
  }
  holder.db = drizzle(pg, { schema });
  storage = new (await import("../server/storage")).DatabaseStorage();
}, 60_000);

afterAll(async () => pg?.close());

beforeEach(async () => {
  await pg.exec("TRUNCATE store_grn_items, store_grns, purchase_indent_items, purchase_indents, users, audit_logs");
  await pg.exec(`
    INSERT INTO users (id, full_name) VALUES (1, 'Synthetic Owner');
    INSERT INTO purchase_indents (id, indent_no, date, proposed_by, raised_by, status)
      VALUES (1, 'SYNTHETIC/PI/0001', '2026-11-22', 'Synthetic', 'Synthetic', 'approved');
    INSERT INTO purchase_indent_items (id, indent_id, description, qty, approved_qty, uom, purchase_status, linked_grn_id)
      VALUES (1, 1, 'Synthetic Cable', 60, 60, 'METERS', 'PURCHASED', 1);
    INSERT INTO store_grns
      (id, grn_number, date, supplier, status, acceptance_status, is_cancelled, created_by_user_id, source_pi_indent_id)
      VALUES (1, 'STORE/26-27/0001', '2026-11-22', 'SYNTHETIC SUPPLIER', 'draft', 'accepted', false, 1, 1);
    INSERT INTO store_grn_items (id, grn_id, qty, uom, indent_item_id, source_pi_item_id, item_description)
      VALUES (1, 1, 60, 'METERS', 1, 1, 'Synthetic Cable');
  `);
});

it("cancels a draft GRN created from a purchase action and records the reason", async () => {
  const cancelled = await storage.cancelStoreGrn(1, 1, "Synthetic correction");
  expect(cancelled).toMatchObject({ id: 1, isCancelled: true, cancellationReason: "Synthetic correction" });
  const logs = await pg.query("SELECT action, reason FROM audit_logs WHERE transaction_id=1");
  expect(logs.rows).toEqual([{ action: "cancel", reason: "Synthetic correction" }]);
});

it("returns a plain business reason when cancellation is refused", async () => {
  await pg.exec("UPDATE purchase_indents SET status='closed' WHERE id=1");
  await expect(storage.cancelStoreGrn(1, 1, "Synthetic correction"))
    .rejects.toThrow("Cannot cancel GRN: linked purchase indent(s) are already closed (SYNTHETIC/PI/0001). Re-open the indent before cancelling this GRN.");
  expect((await pg.query("SELECT is_cancelled FROM store_grns WHERE id=1")).rows[0].is_cancelled).toBe(false);
});

it("allows an Owner to cancel a finalized GRN even when its indent is closed", async () => {
  await pg.exec("UPDATE purchase_indents SET status='closed' WHERE id=1; UPDATE store_grns SET status='finalized' WHERE id=1");
  const cancelled = await storage.cancelStoreGrn(1, 1, "Owner-approved correction", true);
  expect(cancelled).toMatchObject({ id: 1, isCancelled: true, cancellationReason: "Owner-approved correction" });
});

it("derives receipt progress from finalized linked GRNs and cancellation restores waiting status", async () => {
  let [indent] = await storage.getPurchaseIndents();
  expect(indent.status).toBe("awaiting_delivery");

  await pg.exec("UPDATE store_grns SET status='finalized' WHERE id=1");
  [indent] = await storage.getPurchaseIndents();
  expect(indent.status).toBe("completed");
  expect(indent.items[0]).toMatchObject({
    grnReceivedQty: 60,
    grnDocuments: [{ id: 1, grnNumber: "STORE/26-27/0001", status: "finalized" }],
  });

  await storage.cancelStoreGrn(1, 1, "Synthetic correction after receipt");
  [indent] = await storage.getPurchaseIndents();
  expect(indent.status).toBe("awaiting_delivery");
  expect(indent.items[0].grnReceivedQty).toBe(0);
});

it("shows a partial finalized receipt in the item's unit", async () => {
  await pg.exec("UPDATE store_grns SET status='finalized' WHERE id=1; UPDATE store_grn_items SET qty=40 WHERE id=1");
  const [indent] = await storage.getPurchaseIndents();
  expect(indent.status).toBe("partially_received");
  expect(indent.items[0]).toMatchObject({ grnReceivedQty: 40, approvedQty: 60, uom: "METERS" });
  const detail = await storage.getPurchaseIndent(1);
  expect(detail?.status).toBe("partially_received");
  expect(detail?.items[0]).toMatchObject({ grnReceivedQty: 40, approvedQty: 60, uom: "METERS" });
});

it("counts only finalized, non-cancelled GRN lines in stock", async () => {
  await pg.exec(`
    INSERT INTO store_items (id, name, category, uom, is_active) VALUES (10, 'Synthetic cable', 'Electricals', 'METERS', 1);
    UPDATE store_grn_items SET item_id=10 WHERE id=1;
    UPDATE store_grn_items SET qty=60 WHERE id=1;
    UPDATE store_grns SET status='finalized' WHERE id=1;
    INSERT INTO store_grns (id, grn_number, date, supplier, status, acceptance_status, is_cancelled, created_by_user_id)
      VALUES (2, 'STORE/26-27/0002', '2026-11-22', 'SYNTHETIC SUPPLIER', 'draft', 'accepted', false, 1);
    INSERT INTO store_grn_items (id, grn_id, item_id, qty, uom) VALUES (2, 2, 10, 90, 'METERS');
  `);
  expect((await storage.getStoreItemsWithBalance([10])).find((item: any) => item.id === 10)?.balance).toBe(60);
  expect((await storage.getStoreStockSummary()).find((item: any) => item.itemId === 10)?.balance).toBe(60);
  expect((await storage.getStoreItemLedger(10)).map((row: any) => row.qty)).toEqual([60]);
  const [indent] = await storage.getPurchaseIndents();
  expect(indent.items[0].liveStockQty).toBe(60);
  await storage.cancelStoreGrn(1, 1, "Synthetic reversal");
  expect((await storage.getStoreStockSummary()).find((item: any) => item.itemId === 10)?.balance).toBe(0);
});

it("generates shared PO numbers from both stores and PI order records and restarts on 1 April IST", async () => {
  await pg.exec(`
    INSERT INTO purchase_indent_items (id, order_no) VALUES (101, 'HLC/PO/26-27/0004');
    INSERT INTO purchase_orders (id, order_no) VALUES (101, 'HLC/PO/26-27/0008');
  `);
  const generate = (at: string) =>
    holder.db.transaction((tx: any) => storage.generatePurchaseOrderNumber(tx, new Date(at)));
  expect(await generate("2027-03-31T18:29:00.000Z")).toBe("HLC/PO/26-27/0009");
  expect(await generate("2027-03-31T18:30:00.000Z")).toBe("HLC/PO/27-28/0001");
});

it("blocks a second purchase submission after an indent edit and identifies its existing GRN", async () => {
  await holder.db.insert(schema.piItemTransactions).values({
    indentId: 1, indentItemId: 1, transactionType: "purchaser_action",
    qty: 60, reasonCode: "already_purchased", createdBy: "SYNTHETIC",
  });
  await pg.exec(`
    INSERT INTO store_grns (id, grn_number, date, supplier, status, acceptance_status, is_cancelled, created_by_user_id)
      VALUES (2, 'STORE/26-27/0002', '2026-11-22', 'SYNTHETIC SUPPLIER', 'draft', 'accepted', false, 1);
    INSERT INTO store_grn_items (id, grn_id, qty, uom, source_pi_item_id, item_description)
      VALUES (2, 2, 60, 'METERS', 1, 'Synthetic Cable');
    UPDATE purchase_indents SET date='2026-11-23' WHERE id=1;
  `);
  await expect(storage.submitPurchaserAction(1, [{
    itemId: 1, purchaseActionType: "already_purchased", qty: 60,
  }], "Synthetic purchaser", 1)).rejects.toThrow(
    "Purchase action already recorded. GRN STORE/26-27/0002 created. Open it from the indent or GRN history."
  );
  await expect(storage.submitPurchaserAction(1, [
    { itemId: 1, purchaseActionType: "ordered", qty: 60 },
    { itemId: 1, purchaseActionType: "ordered", qty: 60 },
  ], "Synthetic purchaser", 1)).rejects.toThrow("A purchase action may be submitted only once per indent item.");
});
