import { beforeAll, afterAll, expect, it, vi } from "vitest";
const fx = vi.hoisted(() => ({ client: null as any }));
vi.mock("../server/db", async () => {
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  fx.client = new PGlite();
  return { db: drizzle(fx.client) };
});
beforeAll(async () => {
  await import("../server/storage");
  await fx.client.exec(`CREATE TABLE vendor_rate_cards (
    id serial PRIMARY KEY, vendor_name text NOT NULL, vendor_id integer,
    category text NOT NULL, item_key text NOT NULL, item_label text,
    unit text NOT NULL, rate real NOT NULL, notes text, updated_at timestamp,
    lead_distance_km real, payload_mt real, rate_per_km real
  );
  INSERT INTO vendor_rate_cards VALUES
    (1,'Mixed Vendor',NULL,'transport',' Exact  Key ','Mixed Label','TRIP',95,'Keep',NULL,NULL,NULL,NULL);`);
});
afterAll(async () => { await fx.client?.close(); });
it("SQL setup is update-only; numeric/null bill write-back cannot alter basis", async () => {
  const { DatabaseStorage } = await import("../server/storage");
  const storage = new DatabaseStorage();
  const basis = { leadDistanceKm: 12, payloadMt: 30, ratePerKm: 950 };
  const saved = await storage.updateTransportRateSetup(1, " Exact  Key ", basis);
  expect(saved).toMatchObject({ ...basis, vendorName: "Mixed Vendor", itemKey: " Exact  Key ", itemLabel: "Mixed Label", rate: 95, updatedAt: null });
  const bill = { vendorName: "Mixed Vendor", category: "transport", itemKey: " Exact  Key ", itemLabel: "Mixed Label", unit: "TRIP", rate: 95 };
  await storage.upsertVendorRateCard({ ...bill, leadDistanceKm: 99, payloadMt: 1, ratePerKm: 1 });
  await storage.upsertVendorRateCard({ ...bill, leadDistanceKm: null, payloadMt: null, ratePerKm: null });
  const rows = (await fx.client.query("SELECT * FROM vendor_rate_cards")).rows;
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ lead_distance_km: 12, payload_mt: 30, rate_per_km: 950, vendor_name: "Mixed Vendor", item_key: " Exact  Key ", item_label: "Mixed Label" });
  expect(await storage.updateTransportRateSetup(1, "EXACT KEY", basis)).toBeUndefined();
  expect(await storage.updateTransportRateSetup(999, " Exact  Key ", basis)).toBeUndefined();
  expect((await fx.client.query("SELECT * FROM vendor_rate_cards")).rows).toHaveLength(1);
});
