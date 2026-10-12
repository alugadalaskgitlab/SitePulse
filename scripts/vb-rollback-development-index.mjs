// Explicitly authorized development-only alignment. Never run against production.
// No application imports: startup/backfill hooks must not execute here.
import pg from "pg";

const targets = [
  { key: "DATABASE_URL", database: "heliumdb" },
  { key: "DEV_DATABASE_URL", database: "sitelog_dev" },
];
const clients = [];
const expected = "CREATE UNIQUE INDEX hire_statements_equipment_period_uq ON public.hire_statements USING btree (equipment_id, period_from, period_to)";
const fingerprint = `SELECT count(*)::text AS count,
  md5(coalesce(string_agg(md5(row_to_json(h)::text), '' ORDER BY id), '')) AS fingerprint
  FROM public.hire_statements h`;
try {
  // Lock and validate BOTH targets before changing either one.
  for (const target of targets) {
    if (!process.env[target.key]) throw new Error(`Missing explicit ${target.key}; no fallback permitted`);
    const client = new pg.Client({ connectionString: process.env[target.key] });
    await client.connect();
    clients.push({ client, target });
    const identity = (await client.query("SELECT current_database() AS name")).rows[0];
    if (identity.name !== target.database) throw new Error("Development database identity mismatch");
    await client.query("BEGIN");
    await client.query("SET LOCAL lock_timeout = '5s'");
    await client.query("LOCK TABLE public.hire_statements IN ACCESS EXCLUSIVE MODE");
    const duplicates = await client.query(`SELECT count(*)::int AS n FROM (
      SELECT equipment_id, period_from, period_to FROM public.hire_statements
      GROUP BY equipment_id, period_from, period_to HAVING count(*) > 1
    ) d`);
    if (duplicates.rows[0].n) throw new Error(`Conflicting statements in ${target.database}; no changes permitted`);
    const before = (await client.query(fingerprint)).rows[0];
    const index = (await client.query(`SELECT indexdef FROM pg_indexes
      WHERE schemaname='public' AND indexname='hire_statements_equipment_period_uq'`)).rows[0]?.indexdef;
    if (index !== expected && index !== `${expected} WHERE (NOT ((billing_basis = 'daily'::text) AND (vendor_bill_id IS NOT NULL)))`)
      throw new Error(`Unexpected index in ${target.database}; stop for review`);
    Object.assign(clients.at(-1), { before, index });
  }
  for (const state of clients) {
    if (state.index !== expected) {
      await state.client.query("DROP INDEX public.hire_statements_equipment_period_uq");
      await state.client.query(expected);
    }
    const after = (await state.client.query(fingerprint)).rows[0];
    if (JSON.stringify(state.before) !== JSON.stringify(after)) throw new Error("Statement preservation check failed");
    console.log(JSON.stringify({ target: state.target.database, beforeIndex: state.index,
      afterIndex: expected, statements: after.count, recordsUnchanged: true }));
  }
  for (const state of clients) await state.client.query("COMMIT");
  console.log("Both development index alignments committed. No Production connection used.");
} catch (error) {
  for (const state of clients) await state.client.query("ROLLBACK").catch(() => {});
  // Never print connection strings or raw connection errors.
  console.error(error.code ? `Alignment failed (${error.code})` : error.message);
  process.exitCode = 1;
} finally {
  for (const state of clients) await state.client.end();
}
