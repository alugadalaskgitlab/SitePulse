import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { getTableConfig } from "drizzle-orm/pg-core";
import * as schema from "../shared/schema";

const holder = vi.hoisted(() => ({ db: null as any }));
vi.mock("../server/db", () => ({ get db() { return holder.db; }, pool: {} }));
vi.mock("../server/push", () => ({ sendPushToAll: vi.fn() }));

describe("PI-02B explicit procurement-route correction", () => {
  let pg: PGlite;
  let storage: any;

  beforeAll(async () => {
    pg = new PGlite();
    for (const table of [
      schema.sites,
      schema.purchaseIndents,
      schema.purchaseIndentItems,
      schema.piItemTransactions,
      schema.storeGrnItems,
      schema.purchaseIndentItemHistory,
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

  afterAll(async () => pg?.close());

  beforeEach(async () => {
    await pg.exec(`
      TRUNCATE sites,purchase_indents,purchase_indent_items,pi_item_transactions,store_grn_items,purchase_indent_item_history,audit_logs RESTART IDENTITY;
      INSERT INTO sites(id,name,enabled_modules) VALUES(1,'Site A','{}'),(2,'Site B','{}');
      INSERT INTO purchase_indents(id,date,indent_no,proposed_by,raised_by,status,site_id,pi_type)
      VALUES
        (1,'2026-02-01','PI-A','TEST','TEST','ordered',1,'material'),
        (2,'2026-02-01','PI-B','TEST','TEST','ordered',2,'material'),
        (3,'2026-02-01','PI-STORES','TEST','TEST','ordered',1,'stores');
      INSERT INTO purchase_indent_items(id,indent_id,description,qty,uom,purpose,priority,delivered_qty,procurement_route,purchase_status)
      VALUES
        (1,1,'MISTAGGED WMM',10,'MT','ROAD','normal',0,'stores','ORDERED'),
        (2,1,'CORRECT GSB',10,'MT','ROAD','normal',0,'bulk_plant','ORDERED'),
        (3,2,'OTHER SITE SOIL',10,'MT','ROAD','normal',0,NULL,'ORDERED'),
        (4,3,'VALID STORE ITEM',1,'NOS','REPAIR','normal',0,'stores','ORDERED'),
        (5,1,'CORRECT MATERIAL ROUTE',10,'MT','ROAD','normal',0,'material','ORDERED');
    `);
  });

  it("A1/A3 scans site-scoped proposals without changing any route", async () => {
    const rows = await storage.scanPurchaseIndentRouteCorrections(["Site A"]);
    expect(rows).toEqual([expect.objectContaining({
      itemId: 1,
      indentNo: "PI-A",
      itemName: "MISTAGGED WMM",
      currentProcurementRoute: "stores",
      proposedProcurementRoute: "material",
      canApply: true,
    })]);
    expect((await pg.query("SELECT procurement_route FROM purchase_indent_items WHERE id=1")).rows[0])
      .toEqual({ procurement_route: "stores" });
    expect((await pg.query("SELECT id,procurement_route FROM purchase_indent_items WHERE id IN (2,5) ORDER BY id")).rows)
      .toEqual([
        { id: 2, procurement_route: "bulk_plant" },
        { id: 5, procurement_route: "material" },
      ]);
    expect((await pg.query("SELECT count(*)::int AS count FROM audit_logs")).rows[0])
      .toEqual({ count: 0 });
  });

  it("A2 applies only the selected row and records item/old/new audit values", async () => {
    const result = await storage.applyPurchaseIndentRouteCorrections({
      items: [{ itemId: 1, expectedProcurementRoute: "stores" }],
      permittedSiteNames: ["Site A"],
      actor: { userId: 17, userName: "OWNER TEST", userRole: "owner" },
    });
    expect(result.corrected).toHaveLength(1);
    expect((await pg.query("SELECT procurement_route FROM purchase_indent_items WHERE id=1")).rows[0])
      .toEqual({ procurement_route: "material" });
    expect((await pg.query<any>(`
      SELECT module,transaction_id,old_values,new_values,user_id
      FROM audit_logs
    `)).rows[0]).toEqual({
      module: "purchase_indent_route_correction",
      transaction_id: 1,
      old_values: { procurementRoute: "stores" },
      new_values: { procurementRoute: "material" },
      user_id: 17,
    });
    await expect(storage.recordDelivery(1, { deliveredQty: 1 }, "TEST", 17))
      .rejects.toThrow(/Cannot use record-delivery/);
    expect((await pg.query("SELECT count(*)::int AS count FROM pi_item_transactions")).rows[0])
      .toEqual({ count: 0 });
  });

  it("rechecks stale selections and blocks conversion when Stores history exists", async () => {
    await pg.exec(`
      INSERT INTO pi_item_transactions(indent_item_id,indent_id,transaction_type,created_by)
      VALUES(1,1,'delivery_receipt','TEST');
    `);
    const [row] = await storage.scanPurchaseIndentRouteCorrections(["Site A"]);
    expect(row).toMatchObject({ itemId: 1, canApply: false });
    expect(row.conflictReason).toMatch(/Stores delivery\/GRN history/);

    await expect(storage.applyPurchaseIndentRouteCorrections({
      items: [{ itemId: 1, expectedProcurementRoute: "stores" }],
      permittedSiteNames: ["Site A"],
      actor: { userId: 17, userName: "OWNER TEST" },
    })).rejects.toMatchObject({ code: "PI_ROUTE_CORRECTION_CONFLICT" });

    await pg.exec("DELETE FROM pi_item_transactions; UPDATE purchase_indent_items SET procurement_route='material' WHERE id=1");
    await expect(storage.applyPurchaseIndentRouteCorrections({
      items: [{ itemId: 1, expectedProcurementRoute: "stores" }],
      permittedSiteNames: ["Site A"],
      actor: { userId: 17, userName: "OWNER TEST" },
    })).rejects.toMatchObject({ code: "PI_ROUTE_CORRECTION_CONFLICT" });
    expect((await pg.query("SELECT procurement_route FROM purchase_indent_items WHERE id=1")).rows[0])
      .toEqual({ procurement_route: "material" });
  });
});