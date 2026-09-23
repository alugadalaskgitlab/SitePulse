import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";

// Never fall back to DATABASE_URL: this integration test may only touch the
// explicitly isolated development runtime, and every write is rolled back.
const connectionString = process.env.DEV_DATABASE_URL;
const describeDev = connectionString ? describe : describe.skip;

describeDev("vendor bill site persistence (development PostgreSQL)", () => {
  let client: pg.Client;

  beforeAll(async () => {
    client = new pg.Client({ connectionString });
    await client.connect();
  });

  afterAll(async () => {
    await client?.end();
  });

  it("round-trips a selected site and null All Sites without committing", async () => {
    await client.query("BEGIN");
    try {
      const site = await client.query<{ id: number }>(
        "INSERT INTO sites (name) VALUES ($1) RETURNING id",
        [`VB-PARTA-TEST-${Date.now()}`],
      );
      const inserted = await client.query<{ id: number; site_id: number | null }>(
        `INSERT INTO vendor_bills
           (site_id, bill_date, bill_no, bill_type, vendor_name)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, site_id`,
        [site.rows[0].id, "2026-08-20", `VB-PARTA-${Date.now()}`, "MATERIAL", "TEST VENDOR"],
      );
      expect(inserted.rows[0].site_id).toBe(site.rows[0].id);

      const allSites = await client.query<{ site_id: number | null }>(
        "UPDATE vendor_bills SET site_id = NULL WHERE id = $1 RETURNING site_id",
        [inserted.rows[0].id],
      );
      expect(allSites.rows[0].site_id).toBeNull();
    } finally {
      await client.query("ROLLBACK");
    }
  });
});