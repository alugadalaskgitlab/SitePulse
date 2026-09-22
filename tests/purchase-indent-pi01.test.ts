import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";
import { readFileSync } from "node:fs";
import * as schema from "../shared/schema";
import { reconcileDeliveryEvidence, validateDeliveryDestination } from "../shared/purchaseIndentDelivery";

const holder = vi.hoisted(() => ({ db: null as any }));
vi.mock("../server/db", () => ({ get db() { return holder.db; }, pool: {} }));
vi.mock("../server/push", () => ({ sendPushToAll: vi.fn() }));

describe("PI-01 executable PostgreSQL and storage integration", () => {
  let pg: PGlite;
  let storage: any;
  beforeAll(async () => {
    // Isolated WASM PostgreSQL only: never reads DATABASE_URL or touches the app DB.
    pg = new PGlite();
    for (const table of [schema.appSettings, schema.sites, schema.purchaseIndents, schema.purchaseIndentItems,
      schema.piItemTransactions, schema.pendingPlantReceipts, schema.materialReceipts, schema.siteMaterialTrips,
      schema.plantMaterials, schema.stockBalances, schema.stockLedger, schema.ldoFlowReadings]) {
      const config = getTableConfig(table);
      await pg.exec(`CREATE TABLE "${config.name}" (${config.columns
        .filter(c => c.name !== "delivered_qty")
        .map(c => `"${c.name}" ${c.getSQLType()}${c.primary ? " PRIMARY KEY" : ""}`).join(",")})`);
    }
    await pg.exec(readFileSync("migrations/0034_purchase_indent_delivery.sql", "utf8"));
    holder.db = drizzle(pg, { schema });
    // The production node-postgres adapter reports rowCount; PGlite calls it affectedRows.
    const execute = holder.db.execute.bind(holder.db);
    holder.db.execute = async (...args: any[]) => {
      const result = await execute(...args);
      return { ...result, rowCount: result.affectedRows ?? 0 };
    };
    storage = new (await import("../server/storage")).DatabaseStorage();
  }, 60000);
  afterAll(async () => { await pg?.close(); });
  beforeEach(async () => {
    await pg.exec(`TRUNCATE app_settings,sites,purchase_indents,purchase_indent_items,pi_item_transactions,pending_plant_receipts,material_receipts,site_material_trips,plant_materials,stock_balances,stock_ledger,ldo_flow_readings RESTART IDENTITY;
      INSERT INTO plant_materials(id,name,default_uom,conversion_factor,conversion_from_uom,conversion_to_uom) VALUES(1,'WMM','MT',.001,'kg','MT');
      INSERT INTO sites(id,name) VALUES(1,'Site A'),(2,'Site B');
      INSERT INTO purchase_indents(id,indent_no,site_id,pi_type,status,created_at) VALUES(1,'OLD/UNCHANGED',1,'material','ordered',now());
      SELECT setval('purchase_indents_id_seq',1);
      INSERT INTO purchase_indent_items(id,indent_id,description,uom,qty,ordered_qty,procurement_route,purchase_status) VALUES(1,1,'WMM','MT',1500,1500,'bulk_plant','ORDERED'),(2,1,'GSB','MT',500,500,'bulk_plant','ORDERED');
      UPDATE purchase_indent_items SET material_id=1 WHERE id=1;`);
  });

  async function total(id = 1) {
    return (await pg.query<any>("SELECT delivered_qty FROM purchase_indent_items WHERE id=$1", [id])).rows[0].delivered_qty;
  }
  async function receipt(id: number, qty: number, uom = "MT") {
    await storage.createMaterialReceipt({ id, date: "2026-02-01", quantity: qty, uom, materialId: 1,
      isCancelled: false, isDeleted: false, receiptNo: `R${id}` });
    await holder.db.transaction((tx: any) => storage._linkPiReceiptWithinTx(tx, 1, id));
  }
  async function trip(id: number, qty: number, uom = "MT") {
    await storage.createSiteMaterialTrip({ id, indentId: 1, indentItemId: 1, date: "2026-02-03",
      site: "Site A", material: "WMM", quantity: qty, uom, isCancelled: false, isDeleted: false, receiptNumber: `T${id}` });
  }
  async function changeReceipt(id: number, patch: any = null) {
    if (!patch) await storage.deleteMaterialReceipt(id);
    else if (patch.isCancelled) await storage.cancelMaterialReceipt(id, 8, "Correction");
    else await storage.updateMaterialReceipt(id, patch);
  }

  it("runs with only the additive column and no PostgreSQL custom routines or triggers", async () => {
    expect((await pg.query<any>("SELECT count(*) AS n FROM pg_proc WHERE proname IN ('pi_delivery_evidence','pi_delivery_changed','pi_reconcile_delivery')")).rows[0].n).toBe(0);
    expect((await pg.query<any>("SELECT count(*) AS n FROM pg_trigger WHERE NOT tgisinternal")).rows[0].n).toBe(0);
  });

  it("numbers independent sites and shares Store/Bulk sequence, retaining old numbers", async () => {
    const year = new Date().getFullYear();
    const allocate = async (site: number, type: string) => holder.db.transaction(async (tx: any) => {
      const number = await storage.generateIndentNo(tx, site, null);
      await tx.insert(schema.purchaseIndents).values({ indentNo: number, siteId: site, piType: type, date: `${year}-01-01`, proposedBy: "TEST", raisedBy: "TEST", createdAt: new Date() });
      return number;
    });
    expect(await allocate(1, "stores")).toBe(`HLC/PI/SITE A/${year}/0002`);
    expect(await allocate(2, "material")).toBe(`HLC/PI/SITE B/${year}/0001`);
    expect(await allocate(1, "material")).toBe(`HLC/PI/SITE A/${year}/0003`);
    expect((await pg.query<any>("SELECT indent_no FROM purchase_indents WHERE id=1")).rows[0].indent_no).toBe("OLD/UNCHANGED");
    const values = await Promise.all([allocate(2, "stores"), allocate(2, "material")]);
    expect(new Set(values).size).toBe(2);
    await pg.exec("DELETE FROM purchase_indents WHERE site_id=2; UPDATE sites SET name='Renamed Site B' WHERE id=2");
    expect(await allocate(2, "stores")).toBe(`HLC/PI/RENAMED SITE B/${year}/0004`);
  });

  it("keeps every partial receipt and trip, deduplicates pointers, and converts kg", async () => {
    await receipt(1, 200);
    await receipt(2, 100000, "kg");
    await trip(1, 300);
    expect(await total()).toBe(600);
    await holder.db.transaction((tx: any) => storage._linkPiReceiptWithinTx(tx, 1, 2));
    expect(await total()).toBe(600);
    await trip(2, 900);
    expect(await total()).toBe(1500);
    const evidence = await storage._getPiDeliveryEvidence(holder.db, 1);
    expect(evidence).toHaveLength(4);
    expect(reconcileDeliveryEvidence(evidence, "MT").deliveredQty).toBe(1500);
  });

  it("does not complete a bulk indent from incompatible legacy accepted totals", async () => {
    await pg.exec("UPDATE purchase_indent_items SET approved_qty=qty,purchase_status='PURCHASED',total_accepted_qty=9999 WHERE id=1; UPDATE purchase_indent_items SET approved_qty=0 WHERE id=2");
    await receipt(1, 300000, "kg");
    await storage.checkAndCompleteIndent(1);
    expect((await pg.query<any>("SELECT status FROM purchase_indents WHERE id=1")).rows[0].status).toBe("ordered");
    await trip(1, 1200);
    await storage.checkAndCompleteIndent(1);
    expect((await pg.query<any>("SELECT status FROM purchase_indents WHERE id=1")).rows[0].status).toBe("completed");
  });

  it("reconciles receipt edit, cancellation, hard deletion and retains historical evidence", async () => {
    await receipt(1, 300);
    await receipt(2, 200);
    await changeReceipt(1, { quantity: 100 });
    expect(await total()).toBe(300);
    await changeReceipt(1, { isCancelled: true });
    expect(await total()).toBe(200);
    await changeReceipt(1);
    expect(await total()).toBe(200);
    await changeReceipt(2);
    expect(await total()).toBe(0);
    const evidence = await storage._getPiDeliveryEvidence(holder.db, 1);
    expect(evidence).toHaveLength(2);
    expect(evidence.every((e: any) => e.status === "deleted")).toBe(true);
    await receipt(3, 100);
    await changeReceipt(3, { isDeleted: true });
    expect(await total()).toBe(0);
  });

  it("reconciles trip edit, reassignment, cancel, soft-delete and hard-delete", async () => {
    await trip(1, 300);
    await storage.updateSiteMaterialTrip(1, { quantity: 200 });
    expect(await total()).toBe(200);
    await storage.updateSiteMaterialTrip(1, { indentItemId: 2 });
    expect(await total()).toBe(0);
    expect(await total(2)).toBe(200);
    await storage.cancelSiteMaterialTrip(1, 8, "Correction");
    expect(await total(2)).toBe(0);
    await trip(2, 100);
    await storage.updateSiteMaterialTrip(2, { isDeleted: true });
    expect(await total()).toBe(0);
    await trip(3, 100);
    await storage.deleteSiteMaterialTrip(3);
    expect(await total()).toBe(0);
  });

  it("excludes incompatible units with an explicit warning and rolls back atomically", async () => {
    await receipt(1, 10, "CUM");
    await trip(1, 200);
    expect(await total()).toBe(200);
    const evidence = await storage._getPiDeliveryEvidence(holder.db, 1);
    expect(reconcileDeliveryEvidence(evidence, "MT").deliveryWarnings).toHaveLength(1);
    await expect(holder.db.transaction(async (tx: any) => {
      await storage._mutatePiDeliverySourceWithinTx(tx, "trip", 1, async () => tx.update(schema.siteMaterialTrips).set({ quantity: 500 }).where(eq(schema.siteMaterialTrips.id, 1)));
      throw new Error("rollback");
    })).rejects.toThrow("rollback");
    expect(await total()).toBe(200);
  });

  it("rejects invalid new links atomically but does not block cleanup of deleted PI history", async () => {
    await trip(1, 100);
    await expect(storage.updateSiteMaterialTrip(1, { indentItemId: 999 })).rejects.toThrow(/not found/);
    expect(await total()).toBe(100);
    await receipt(1, 200);
    await pg.exec("DELETE FROM purchase_indent_items WHERE id=1");
    await expect(storage.cancelMaterialReceipt(1, 8, "PI removed")).resolves.toMatchObject({ isCancelled: true });
    await expect(storage.deleteSiteMaterialTrip(1)).resolves.toBeUndefined();
  });

  it("requires destination and site, assigns legacy ordered items, and retains confirmed history", async () => {
    expect(() => validateDeliveryDestination(undefined, null)).toThrow(/destination/);
    await expect(storage.setPurchaseIndentDestination(1, 1, "site", null, 8, "Purchaser")).rejects.toThrow(/site/);
    await storage.setPurchaseIndentDestination(1, 1, "hmp_plant", null, 8, "Purchaser");
    await receipt(1, 300);
    await pg.exec("UPDATE pending_plant_receipts SET status='confirmed',linked_receipt_id=1 WHERE indent_item_id=1");
    await storage.setPurchaseIndentDestination(1, 1, "site", 2, 8, "Purchaser");
    const rows = (await pg.query<any>("SELECT * FROM pending_plant_receipts ORDER BY id")).rows;
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ status: "confirmed", receiving_location: "hmp_plant", linked_receipt_id: 1 });
    expect(rows[1]).toMatchObject({ status: "pending", receiving_location: "site", receiving_site_id: 2, qty: 1200 });
    expect(await total()).toBe(300);
    await expect(storage.setPurchaseIndentDestination(2, 1, "hmp_plant", null, 8, "Purchaser")).rejects.toThrow(/not found/);
  });

  it("rejects both ordering paths without destination, without persisting partial orders", async () => {
    await pg.exec("UPDATE purchase_indents SET status='approved' WHERE id=1");
    const header = (await holder.db.select().from(schema.purchaseIndents))[0];
    const items = await holder.db.select().from(schema.purchaseIndentItems);
    const detail = vi.spyOn(storage, "getPurchaseIndent").mockResolvedValue({ ...header, items });
    try {
      await expect(storage.placeOrderIndent(1, [{ itemId: 1 }], "Purchaser")).rejects.toThrow(/destination/);
      expect((await pg.query<any>("SELECT status FROM purchase_indents WHERE id=1")).rows[0].status).toBe("approved");
      await expect(storage.submitPurchaserAction(1, [{ itemId: 1, purchaseActionType: "ordered", qty: 1500 }], "Purchaser", 8)).rejects.toThrow(/destination/);
      expect((await pg.query<any>("SELECT count(*) AS n FROM pi_item_transactions")).rows[0].n).toBe(0);
      await storage.submitPurchaserAction(1, [{ itemId: 1, purchaseActionType: "ordered", qty: 1500, receivingLocation: "site", receivingSiteId: 2 }], "Purchaser", 8);
      expect((await pg.query<any>("SELECT receiving_location FROM pending_plant_receipts")).rows[0].receiving_location).toBe("site");
    } finally { detail.mockRestore(); }
  });

  it("uses the destination placeholder for an actual pending receipt, without duplicate queue entries", async () => {
    await storage.setPurchaseIndentDestination(1, 1, "hmp_plant", null, 8, "Purchaser");
    const header = (await holder.db.select().from(schema.purchaseIndents))[0];
    const items = await holder.db.select().from(schema.purchaseIndentItems);
    const detail = vi.spyOn(storage, "getPurchaseIndent").mockResolvedValue({ ...header, items });
    try {
      await storage.submitBulkReceiptAsPending(1, "hmp_plant", null, [{ itemId: 1, materialName: "WMM", qty: 200, uom: "MT" }], 8, "Purchaser");
      const rows = (await pg.query<any>("SELECT qty,remarks FROM pending_plant_receipts")).rows;
      expect(rows).toEqual([{ qty: 200, remarks: null }]);
      await expect(storage.submitBulkReceiptAsPending(1, "hmp_plant", null, [{ itemId: 1, materialName: "WMM", qty: -1, uom: "MT" }], 8, "Purchaser")).rejects.toThrow(/positive/);
      const confirmed = await storage.confirmPendingPlantReceipt(1, 9, "Receiver");
      expect(confirmed.status).toBe("confirmed");
      expect(await total()).toBe(200);
      const evidence = await storage._getPiDeliveryEvidence(holder.db, 1);
      expect(evidence).toHaveLength(1);
      await storage.linkReceiptToIndentItem(1, confirmed.linkedReceiptId, "Receiver");
      expect(await total()).toBe(200);
    } finally { detail.mockRestore(); }
  });
});