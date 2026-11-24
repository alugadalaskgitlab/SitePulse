import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { getTableConfig } from "drizzle-orm/pg-core";
import * as schema from "../shared/schema";

const holder = vi.hoisted(() => ({ db: null as any }));
vi.mock("../server/db", () => ({ get db() { return holder.db; }, pool: {} }));

let pg: PGlite;
let dispatchPro: typeof import("../server/dispatchProOutbox");

async function createTableFromSchema(table: any) {
  const config = getTableConfig(table);
  const columns = config.columns.map((column) =>
    `"${column.name}" ${column.getSQLType()}${column.primary ? " PRIMARY KEY" : ""}`,
  );
  await pg.exec(`CREATE TABLE "${config.name}" (${columns.join(", ")})`);
}

beforeAll(async () => {
  pg = new PGlite();
  for (const table of [
    schema.parties,
    schema.truckDispatches,
    schema.plantShiftLogs,
    schema.plantSupplyOrders,
    schema.sites,
    schema.mixTemplates,
  ]) {
    await createTableFromSchema(table);
  }

  // Build the real PostgreSQL check constraint from the shipped migrations.
  await pg.exec(readFileSync(new URL("../migrations/0058_plant_day_dispatchpro.sql", import.meta.url), "utf8"));
  await pg.exec(readFileSync(new URL("../migrations/0066_supply_order_dispatchpro_link.sql", import.meta.url), "utf8"));
  await pg.exec(readFileSync(new URL("../migrations/0067_dispatchpro_outbox_order_operation.sql", import.meta.url), "utf8"));

  holder.db = drizzle(pg, { schema });
  dispatchPro = await import("../server/dispatchProOutbox");
}, 60_000);

afterAll(async () => {
  await pg?.close();
});

describe("FIX-SPDP-01 real outbox operation constraint", () => {
  it("queues supply orders and still inserts truck create, patch and cancel rows", async () => {
    await pg.exec(`
      INSERT INTO plant_supply_orders (id) VALUES (91);
      INSERT INTO parties (id, name, dispatchpro_site_id) VALUES (1, 'Fixture party', 'DP-FIXTURE');
      INSERT INTO mix_templates (id, name) VALUES (1, 'BC');
      INSERT INTO truck_dispatches
        (id, date, party_id, mix_template_id, truck_number, load_weight, dispatchpro_id)
      VALUES
        (1, '2026-11-24', 1, 1, 'TG12UH0001', 10, NULL),
        (2, '2026-11-24', 1, 1, 'TG12UH0002', 12, 'DP-DISPATCH-2'),
        (3, '2026-11-24', 1, 1, 'TG12UH0003', 14, 'DP-DISPATCH-3');
    `);

    const queued = await dispatchPro.enqueueSupplyOrderDispatchPro({
      id: 91,
      partyId: 1,
      partyName: "Fixture party",
      siteId: 2,
      siteName: "Fixture site",
      orderNo: "PO-FIXTURE-91",
      periodFrom: "2026-11-24",
      periodTo: "2026-11-30",
      status: "open",
      lines: [],
    });
    expect(queued.queued).toBe(true);

    expect((await dispatchPro.enqueueDispatchProChange(1, "create")).queued).toBe(true);
    expect((await dispatchPro.enqueueDispatchProChange(2, "patch")).queued).toBe(true);
    expect((await dispatchPro.enqueueDispatchProCancellation({ id: 3, partyId: 1 })).queued).toBe(true);

    const rows = await pg.query(
      "SELECT operation, supply_order_id FROM dispatchpro_outbox ORDER BY id",
    );
    expect(rows.rows).toEqual([
      { operation: "order", supply_order_id: 91 },
      { operation: "create", supply_order_id: null },
      { operation: "patch", supply_order_id: null },
      { operation: "cancel", supply_order_id: null },
    ]);
  });
});
