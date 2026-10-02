import { beforeAll, afterAll, beforeEach, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { getTableConfig } from "drizzle-orm/pg-core";
import * as schema from "../shared/schema";

const holder = vi.hoisted(() => ({ db: null as any }));
vi.mock("../server/db", () => ({ get db() { return holder.db; }, pool: {} }));
vi.mock("../server/push", () => ({ sendPushToAll: vi.fn() }));
let pg: PGlite;
let storage: any;
beforeAll(async () => {
  pg = new PGlite();
  for (const table of [schema.purchaseIndents, schema.purchaseIndentItems, schema.purchaseOrders,
    schema.purchaseIndentItemHistory, schema.piItemTransactions, schema.storeGrnItems,
    schema.pendingPlantReceipts, schema.serviceCompletions, schema.siteMaterialTrips, schema.materialReceipts]) {
    const config = getTableConfig(table);
    await pg.exec(`CREATE TABLE "${config.name}" (${config.columns.map(c =>
      `"${c.name}" ${c.getSQLType()}${c.primary ? " PRIMARY KEY" : ""}`).join(",")})`);
  }
  await pg.exec("ALTER TABLE purchase_orders ADD CONSTRAINT test_pi_item_fk FOREIGN KEY (purchase_indent_item_id) REFERENCES purchase_indent_items(id)");
  holder.db = drizzle(pg, { schema });
  storage = new (await import("../server/storage")).DatabaseStorage();
}, 30000);
afterAll(async () => { await pg.close(); });
beforeEach(async () => {
  await pg.exec(`TRUNCATE purchase_orders,purchase_indent_item_history,pi_item_transactions,store_grn_items,
    pending_plant_receipts,service_completions,site_material_trips,material_receipts,purchase_indent_items,purchase_indents RESTART IDENTITY;
    INSERT INTO purchase_indents(id,indent_no,date,proposed_by,raised_by,site_id,status,approved_by,remarks)
      VALUES(1,'TEST-ONLY','2026-01-01','ENGINEER','ENGINEER',1,'approved','MANAGER','OLD');
    INSERT INTO purchase_indent_items(id,indent_id,description,qty,uom,purpose,priority,delivered_qty)
      VALUES(1,1,'WMM',10,'MT','ROAD','normal',0);
    SELECT setval('purchase_indent_items_id_seq',1);`);
});
const item = { id: 1, description: "WMM", qty: 10, uom: "MT", purpose: "ROAD", priority: "normal" };
const payload = (items: any[] = [item], remarks = "NEW") => ({
  date: "2026-01-01", proposedBy: "ENGINEER", raisedBy: "ENGINEER", siteId: 1, remarks, items,
});
it("edit schema retains IDs and strips purchase fields", () => {
  const parsed = schema.updatePurchaseIndentRequestSchema.parse(payload([{ ...item, vendor: "FORGED" }]));
  expect(parsed.items[0].id).toBe(1);
  expect(parsed.items[0]).not.toHaveProperty("vendor");
  expect(() => schema.updatePurchaseIndentRequestSchema.parse(payload([{ ...item, id: -1 }]))).toThrow();
});
it("ordered remarks edit preserves real PO FK, tracking and history plus header approval", async () => {
  await pg.exec(`UPDATE purchase_indent_items SET purchase_status='ORDERED',vendor='VENDOR',rate=42,ordered_qty=10,total_purchased_qty=3 WHERE id=1;
    INSERT INTO purchase_orders(purchase_indent_item_id) VALUES(1);
    INSERT INTO purchase_indent_item_history(item_id,action) VALUES(1,'ORDERED');`);
  const result = await storage.updatePurchaseIndent(1, payload());
  expect(result).toMatchObject({ status: "approved", approvedBy: "MANAGER", remarks: "NEW" });
  expect(result.items[0]).toMatchObject({ id: 1, vendor: "VENDOR", rate: 42, purchaseStatus: "ORDERED", orderedQty: 10, totalPurchasedQty: 3 });
  expect((await pg.query("SELECT * FROM purchase_indent_item_history")).rows).toHaveLength(1);
});
it("pending edit/add/remove reconciles IDs and resets approval for genuine changes", async () => {
  let result = await storage.updatePurchaseIndent(1, payload([{ ...item, qty: 12 }, { ...item, id: undefined, description: "GSB" }]));
  expect(result.status).toBe("pending");
  expect(result.items.map((i: any) => i.id)).toEqual([1, 2]);
  result = await storage.updatePurchaseIndent(1, payload([{ ...item, qty: 12 }]));
  expect(result.items.map((i: any) => i.id)).toEqual([1]);
});
it.each([
  "INSERT INTO purchase_orders(purchase_indent_item_id) VALUES(1)",
  "INSERT INTO purchase_indent_item_history(item_id) VALUES(1)",
  "INSERT INTO pi_item_transactions(indent_item_id) VALUES(1)",
  "INSERT INTO store_grn_items(indent_item_id) VALUES(1)",
  "INSERT INTO store_grn_items(source_pi_item_id) VALUES(1)",
  "INSERT INTO pending_plant_receipts(indent_item_id) VALUES(1)",
  "INSERT INTO service_completions(indent_item_id) VALUES(1)",
  "INSERT INTO site_material_trips(indent_item_id) VALUES(1)",
])("rejects dependent removal and critical changes atomically: %s", async sql => {
  await pg.exec(sql);
  await expect(storage.updatePurchaseIndent(1, payload([]))).rejects.toThrow("cannot be removed");
  await expect(storage.updatePurchaseIndent(1, payload([{ ...item, qty: 20 }]))).rejects.toThrow("quantity, UOM or material");
  expect((await pg.query<any>("SELECT remarks,status FROM purchase_indents WHERE id=1")).rows[0]).toEqual({ remarks: "OLD", status: "approved" });
});
it("rejects duplicate and stale IDs", async () => {
  await expect(storage.updatePurchaseIndent(1, payload([item, item]))).rejects.toThrow("duplicated");
  await expect(storage.updatePurchaseIndent(1, payload([{ ...item, id: 99 }]))).rejects.toThrow("no longer belongs");
});
it("omitted nullable planning fields are a normalized no-op and preserve approval", async () => {
  const result = await storage.updatePurchaseIndent(1, payload([{
    ...item, spec: undefined, partNo: undefined, materialId: undefined,
    estRate: undefined, estAmount: undefined, requiredBy: undefined,
  }], "OLD"));
  expect(result).toMatchObject({ status: "approved", approvedBy: "MANAGER" });
  expect(result.items[0]).toMatchObject({
    spec: null, partNo: null, materialId: null, estRate: null, estAmount: null, requiredBy: null,
  });
});
it("round-tripped zero estimates and urgent existing dates remain a no-op", async () => {
  await pg.exec("UPDATE purchase_indent_items SET est_rate=0,est_amount=0,priority='urgent',required_by='2026-01-03'");
  const result = await storage.updatePurchaseIndent(1, payload([{
    ...item, estRate: 0, estAmount: 0, priority: "urgent", requiredBy: "2026-01-03",
  }], "OLD"));
  expect(result).toMatchObject({ status: "approved", approvedBy: "MANAGER" });
  expect(result.items[0]).toMatchObject({ estRate: 0, estAmount: 0, requiredBy: "2026-01-03" });
});
it.each(["recordMaterialIndentReceipt", "recordBulkMaterialReceipt"])("%s rejects an untouched zero-approved target before physical creation", async method => {
  await pg.exec("UPDATE purchase_indents SET status='ordered',pi_type='material'; UPDATE purchase_indent_items SET approved_qty=0");
  const snapshot = vi.spyOn(storage, "getPurchaseIndent").mockResolvedValue({
    id: 1, indentNo: "TEST-ONLY", piType: "material", status: "ordered",
    items: [{ ...item, approvedQty: 0, orderedQty: null, purchaseStatus: null }],
  });
  const create = vi.spyOn(storage, "createMaterialReceipt");
  try {
    await expect(storage[method](1, [{
      itemId: 1, materialId: 1, qty: 1, uom: "MT",
    }], "TEST")).rejects.toThrow("has no approval or procurement activity");
    expect(create).not.toHaveBeenCalled();
    expect((await pg.query("SELECT * FROM purchase_indent_item_history")).rows).toHaveLength(0);
  } finally { snapshot.mockRestore(); create.mockRestore(); }
});
it.each(["recordMaterialIndentReceipt", "recordBulkMaterialReceipt"])("%s records durable attempt evidence before physical creation, surviving approval changes", async method => {
  await pg.exec("UPDATE purchase_indents SET status='ordered',pi_type='material'; UPDATE purchase_indent_items SET approved_qty=10");
  const snapshot = vi.spyOn(storage, "getPurchaseIndent").mockResolvedValue({
    id: 1, indentNo: "TEST-ONLY", piType: "material", status: "ordered", items: [item],
  });
  const create = vi.spyOn(storage, "createMaterialReceipt").mockImplementation(async () => {
    const history = (await pg.query<any>("SELECT action,notes FROM purchase_indent_item_history WHERE item_id=1")).rows;
    expect(history).toHaveLength(1);
    expect(history[0].action).toBe("RECEIPT_RECORDING_STARTED");
    expect(history[0].notes).toMatch(/does not confirm/);
    // Deterministically interleave a later approval revision and a PI edit
    // after eligibility commits but before canonical receipt writes.
    await pg.exec("UPDATE purchase_indent_items SET approved_qty=0 WHERE id=1");
    await expect(storage.updatePurchaseIndent(1, payload([]))).rejects.toThrow("cannot be removed");
    await expect(storage.updatePurchaseIndent(1, payload([{ ...item, qty: 20 }]))).rejects.toThrow("quantity, UOM or material");
    await storage.updatePurchaseIndent(1, payload([item], "REMARKS DURING RECEIPT"));
    throw new Error("TEST: canonical receipt stopped without stock writes");
  });
  try {
    await expect(storage[method](1, [{ itemId: 1, materialId: 1, qty: 1, uom: "MT" }], "TEST"))
      .rejects.toThrow("TEST: canonical receipt stopped without stock writes");
    expect(create).toHaveBeenCalledOnce();
    expect((await pg.query("SELECT * FROM purchase_indent_items")).rows).toHaveLength(1);
  } finally { snapshot.mockRestore(); create.mockRestore(); }
});
it("receipt guard rejects deletion winning after initial snapshot without recording an attempt", async () => {
  await pg.exec("UPDATE purchase_indents SET status='ordered',pi_type='material'");
  const snapshot = vi.spyOn(storage, "getPurchaseIndent").mockImplementation(async () => {
    await pg.exec("DELETE FROM purchase_indent_items WHERE id=1");
    return { id: 1, piType: "material", status: "ordered", items: [item] };
  });
  const create = vi.spyOn(storage, "createMaterialReceipt");
  try {
    await expect(storage.recordMaterialIndentReceipt(1, [{ itemId: 1, materialId: 1, qty: 1, uom: "MT" }], "TEST")).rejects.toThrow("no longer belongs");
    expect(create).not.toHaveBeenCalled();
    expect((await pg.query("SELECT * FROM purchase_indent_item_history")).rows).toHaveLength(0);
  } finally { snapshot.mockRestore(); create.mockRestore(); }
});
it.each(["recordMaterialIndentReceipt", "recordBulkMaterialReceipt"])("%s proceeds through actual PI linkage for an eligible receipt", async method => {
  await pg.exec("UPDATE purchase_indents SET status='ordered',pi_type='material'; UPDATE purchase_indent_items SET approved_qty=10");
  const snapshot = vi.spyOn(storage, "getPurchaseIndent").mockResolvedValue({
    id: 1, indentNo: "TEST-ONLY", piType: "material", status: "ordered", items: [item],
  });
  // Canonical stock posting is covered separately; supply a real isolated receipt
  // row and exercise the actual PI receipt-link, evidence, and total writers.
  const create = vi.spyOn(storage, "createMaterialReceipt").mockImplementation(async (data: any) => {
    const [row] = await holder.db.insert(schema.materialReceipts).values({
      ...data, receiptNo: "TEST-ONLY-1", isDeleted: false, isCancelled: false,
    }).returning();
    return row;
  });
  const complete = vi.spyOn(storage, "checkAndCompleteIndent").mockResolvedValue(undefined);
  try {
    await storage[method](1, [{ itemId: 1, materialId: 1, qty: 1, uom: "MT" }], "TEST");
    expect(create).toHaveBeenCalledOnce();
    const persisted = (await pg.query<any>("SELECT linked_receipt_id,total_accepted_qty,delivered_qty FROM purchase_indent_items WHERE id=1")).rows[0];
    expect(persisted).toEqual({ linked_receipt_id: 1, total_accepted_qty: 1, delivered_qty: 1 });
    expect((await pg.query("SELECT * FROM purchase_indent_item_history WHERE action='RECEIPT_RECORDING_STARTED'")).rows).toHaveLength(1);
  } finally { snapshot.mockRestore(); create.mockRestore(); complete.mockRestore(); }
});
it("service writer rechecks identity before either dependent insert", async () => {
  await pg.exec("DELETE FROM purchase_indent_items WHERE id=1");
  await expect(storage.createServiceCompletion({
    indentId: 1, indentItemId: 1, completionStatus: "completed",
    verifiedByUserId: 1, verifiedByName: "TEST", createdByUserId: 1,
  })).rejects.toThrow("no longer belongs");
  expect((await pg.query("SELECT * FROM service_completions")).rows).toHaveLength(0);
  expect((await pg.query("SELECT * FROM pi_item_transactions")).rows).toHaveLength(0);
});
it("reference helper obtains FOR UPDATE and rejects before insertion after removal wins", async () => {
  const steps: string[] = [];
  const tx: any = {
    select: () => ({ from: () => ({ where: () => ({ orderBy: () => ({
      for: async (mode: string) => { steps.push(mode); return []; },
    }) }) }) }),
  };
  await expect(storage._lockPiItemsWithinTx(tx, [2, 1, 2], 1)).rejects.toThrow("no longer belongs");
  expect(steps).toEqual(["update"]);
});
it("service-first ordering makes subsequent pending removal fail", async () => {
  const completion = vi.spyOn(storage, "checkAndCompleteIndent").mockResolvedValue(undefined);
  try {
    await storage.createServiceCompletion({
      indentId: 1, indentItemId: 1, completionStatus: "completed",
      verifiedByUserId: 1, verifiedByName: "TEST", createdByUserId: 1,
    });
    await expect(storage.updatePurchaseIndent(1, payload([]))).rejects.toThrow("cannot be removed");
    expect((await pg.query("SELECT * FROM service_completions")).rows).toHaveLength(1);
  } finally { completion.mockRestore(); }
});
it("pending receipt rejects an item removed after its initial snapshot", async () => {
  const snapshot = vi.spyOn(storage, "getPurchaseIndent").mockImplementation(async () => {
    await pg.exec("DELETE FROM purchase_indent_items WHERE id=1");
    return { id: 1, indentNo: "TEST-ONLY", items: [{ ...item, materialId: null }] };
  });
  try {
    await expect(storage.submitBulkReceiptAsPending(1, "hmp_plant", null, [{
      itemId: 1, materialName: "WMM", qty: 1, uom: "MT",
    }], 1, "TEST")).rejects.toThrow("no longer belongs");
    expect((await pg.query("SELECT * FROM pending_plant_receipts")).rows).toHaveLength(0);
    expect((await pg.query("SELECT * FROM pi_item_transactions")).rows).toHaveLength(0);
  } finally { snapshot.mockRestore(); }
});
it("source-trip writer rejects deleted target before running its insertion callback", async () => {
  await pg.exec("DELETE FROM purchase_indent_items WHERE id=1");
  const mutation = vi.fn();
  await expect(holder.db.transaction((tx: any) =>
    storage._mutatePiDeliverySourceWithinTx(tx, "trip", null, mutation, 1)
  )).rejects.toThrow("not found");
  expect(mutation).not.toHaveBeenCalled();
});