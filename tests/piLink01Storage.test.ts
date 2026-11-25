import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { getTableConfig } from "drizzle-orm/pg-core";
import * as schema from "../shared/schema";
import { effectivePiStatusFromReceipts } from "../server/storage";

const holder = vi.hoisted(() => ({ db: null as any }));
vi.mock("../server/db", () => ({ get db() { return holder.db; }, pool: {} }));
vi.mock("../server/push", () => ({ sendPushToAll: vi.fn() }));

describe("PI-LINK-01 trip linking and close-with-balance", () => {
  let pg: PGlite;
  let storage: any;

  beforeAll(async () => {
    pg = new PGlite();
    for (const table of [
      schema.sites,
      schema.purchaseIndents,
      schema.purchaseIndentItems,
      schema.pendingPlantReceipts,
      schema.siteMaterialTrips,
      schema.piItemTransactions,
      schema.materialReceipts,
      schema.plantMaterials,
      schema.auditLogs,
    ]) {
      const config = getTableConfig(table);
      await pg.exec(`CREATE TABLE "${config.name}" (${config.columns
        .map(column => `"${column.name}" ${column.getSQLType()}${column.primary ? " PRIMARY KEY" : ""}`)
        .join(",")})`);
    }
    holder.db = drizzle(pg, { schema });
    storage = new (await import("../server/storage")).DatabaseStorage();
  }, 60_000);

  afterAll(async () => { await pg?.close(); });

  beforeEach(async () => {
    await pg.exec(`
      TRUNCATE sites,purchase_indents,purchase_indent_items,pending_plant_receipts,
        site_material_trips,pi_item_transactions,material_receipts,plant_materials,audit_logs RESTART IDENTITY;
      INSERT INTO sites(id,name) VALUES(1,'Site A');
      INSERT INTO plant_materials(id,name,default_uom,bulk_density,procurement_route)
        VALUES(1,'WMM','MT',2.205,'material');
      INSERT INTO purchase_indents(id,date,indent_no,proposed_by,raised_by,status,site_id,pi_type)
        VALUES(1,'2026-02-01','PI-A','TEST','TEST','ordered',1,'material');
      INSERT INTO purchase_indent_items(id,indent_id,description,qty,uom,purpose,priority,
        approved_qty,ordered_qty,total_purchased_qty,delivered_qty,procurement_route,purchase_status,material_id)
        VALUES(1,1,'WMM',10,'MT','ROAD','normal',10,10,10,0,'material','ORDERED',1);
      INSERT INTO pending_plant_receipts(id,indent_id,indent_no,indent_item_id,material_name,material_id,qty,uom,
        receiving_location,receiving_site_id,created_by_user_id,created_by,status)
        VALUES(1,1,'PI-A',1,'WMM',1,10,'MT','site',1,7,'TEST','pending');
      INSERT INTO site_material_trips(id,date,site,material,quantity,uom,vehicle_number,supplier,receipt_number,
        indent_id,indent_item_id,is_cancelled,is_deleted)
        VALUES
          (10,'2026-02-02',' site   a ','wmm',80,'CFT','TG01A1234','TRANSPORTER','CH-10',NULL,NULL,false,false),
          (11,'2026-01-31','Site A','WMM',80,'CFT','TG01A1235','TRANSPORTER','CH-11',NULL,NULL,false,false),
          (12,'2026-02-02','Site A','WMM',80,'CFT','TG01A1236','TRANSPORTER','CH-12',99,9,false,false),
          (13,'2026-02-02','Site A','GSB',80,'CFT','TG01A1237','TRANSPORTER','CH-13',NULL,NULL,false,false),
          (14,'2026-02-02','Site A','WMM',80,'CFT','TG01A1238','TRANSPORTER','CH-14',NULL,NULL,true,false);
    `);
  });

  it("offers only exact active unlinked site/material trips from the PI date", async () => {
    const panel = await storage.getPiSiteTripLinkPanel(1, 1);
    expect(panel).toMatchObject({ siteName: "Site A", materialName: "WMM", uom: "MT", piDate: "2026-02-01" });
    expect(panel.candidates.map((trip: any) => trip.id)).toEqual([10]);
    expect(panel.candidates[0].countedQty).toBeCloseTo(80 / 35.315 * 2.205, 8);
    expect((await storage.getPiSiteTripLinkPanel(1, 1, "2026-01-30")).candidates.map((trip: any) => trip.id))
      .toEqual([10, 11]);
  });

  it("links and unlinks through delivery snapshots, recomputes in MT, and audits both actions", async () => {
    await storage.linkSiteMaterialTripsToPiItem({
      indentId: 1,
      itemId: 1,
      tripIds: [10],
      actor: { userId: 7, userName: "Owner Test", userRole: "owner" },
    });
    expect((await pg.query<any>("SELECT indent_id,indent_item_id FROM site_material_trips WHERE id=10")).rows[0])
      .toEqual({ indent_id: 1, indent_item_id: 1 });
    expect((await pg.query<any>("SELECT delivered_qty,purchase_status FROM purchase_indent_items WHERE id=1")).rows[0])
      .toMatchObject({ delivered_qty: expect.any(Number), purchase_status: "PARTIAL" });
    expect((await pg.query<any>("SELECT status FROM purchase_indents WHERE id=1")).rows[0].status).toBe("partially_received");
    expect((await pg.query<any>("SELECT transaction_type FROM pi_item_transactions ORDER BY id")).rows)
      .toEqual([{ transaction_type: "pi_delivery_trip" }]);
    expect((await pg.query<any>("SELECT action,user_id FROM audit_logs ORDER BY id")).rows)
      .toEqual([{ action: "site_trip_link", user_id: 7 }]);

    const panel = await storage.getPiSiteTripLinkPanel(1, 1);
    expect(panel.linked.map((trip: any) => trip.id)).toEqual([10]);
    expect(panel.candidates.map((trip: any) => trip.id)).toEqual([]);

    await storage.unlinkSiteMaterialTripFromPi({
      tripId: 10,
      indentId: 1,
      itemId: 1,
      actor: { userId: 7, userName: "Owner Test", userRole: "owner" },
    });
    expect((await pg.query<any>("SELECT indent_id,indent_item_id FROM site_material_trips WHERE id=10")).rows[0])
      .toEqual({ indent_id: null, indent_item_id: null });
    expect((await pg.query<any>("SELECT delivered_qty,purchase_status FROM purchase_indent_items WHERE id=1")).rows[0])
      .toEqual({ delivered_qty: 0, purchase_status: "ORDERED" });
    expect((await pg.query<any>("SELECT status FROM purchase_indents WHERE id=1")).rows[0].status).toBe("ordered");
    expect((await pg.query<any>("SELECT action FROM audit_logs ORDER BY id")).rows)
      .toEqual([{ action: "site_trip_link" }, { action: "site_trip_unlink" }]);
  });

  it("suggests only open same-site, same-material PI items with an outstanding balance", async () => {
    expect(await storage.getUnlinkedPiCandidatesForSiteTrip("SITE A", "WMM")).toEqual([
      expect.objectContaining({
        indentId: 1,
        indentItemId: 1,
        indentNo: "PI-A",
        orderedQty: 10,
        deliveredQty: 0,
        balanceQty: 10,
      }),
    ]);
    await pg.exec("UPDATE purchase_indents SET status='closed_with_balance' WHERE id=1");
    expect(await storage.getUnlinkedPiCandidatesForSiteTrip("Site A", "WMM")).toEqual([]);
  });

  it("derives partial and fully delivered states from counted bulk deliveries", () => {
    const item = {
      qty: 10,
      approvedQty: 10,
      orderedQty: 10,
      procurementRoute: "material",
      purchaseStatus: "PARTIAL",
      deliveredQty: 6.5,
    };
    expect(effectivePiStatusFromReceipts("ordered", [item])).toBe("partially_received");
    expect(effectivePiStatusFromReceipts("ordered", [{ ...item, deliveredQty: 10, purchaseStatus: "PURCHASED" }]))
      .toBe("completed");
    expect(effectivePiStatusFromReceipts("closed_with_balance", [{ ...item, deliveredQty: 10 }]))
      .toBe("closed_with_balance");
  });

  it("stores a reason and quantity snapshot when closing, and restores the prior status on reopen", async () => {
    await pg.exec(`UPDATE purchase_indent_items SET delivered_qty=6.5 WHERE id=1;
      INSERT INTO site_material_trips(id,date,site,material,quantity,uom,receipt_number,indent_id,indent_item_id,is_cancelled,is_deleted)
        VALUES(20,'2026-02-02','Site A','WMM',6.5,'MT','CH-20',1,1,false,false)`);
    const getDetail = vi.spyOn(storage, "getPurchaseIndent").mockResolvedValue(undefined);
    const close = await storage.closePurchaseIndentWithBalance(1, "Supplier cannot deliver the remainder", {
      userId: 7, userName: "Owner Test",
    });
    expect(close).toBeUndefined();
    expect((await pg.query<any>("SELECT status,closed_balance_reason,closed_balance_snapshot FROM purchase_indents WHERE id=1")).rows[0])
      .toMatchObject({
        status: "closed_with_balance",
        closed_balance_reason: "Supplier cannot deliver the remainder",
        closed_balance_snapshot: {
          priorStatus: "ordered",
          items: [{ itemId: 1, orderedQty: 10, deliveredQty: 6.5, balanceQty: 3.5, uom: "MT" }],
        },
      });
    await expect(storage.closePurchaseIndentWithBalance(1, "duplicate", { userId: 7, userName: "Owner Test" }))
      .rejects.toThrow(/already closed/);

    const completeCheck = vi.spyOn(storage as any, "checkAndCompleteIndent").mockResolvedValue(undefined);
    await storage.reopenPurchaseIndentWithBalance(1, { userId: 7, userName: "Owner Test" });
    expect((await pg.query<any>("SELECT status,closed_balance_reason,closed_balance_snapshot,closed_balance_at FROM purchase_indents WHERE id=1")).rows[0])
      .toEqual({ status: "ordered", closed_balance_reason: null, closed_balance_snapshot: null, closed_balance_at: null });
    expect((await pg.query<any>("SELECT action FROM audit_logs ORDER BY id")).rows)
      .toEqual([{ action: "close_with_balance" }, { action: "reopen_with_balance" }]);
    expect(completeCheck).toHaveBeenCalledWith(1);
    completeCheck.mockRestore();
    getDetail.mockRestore();
  });
});
