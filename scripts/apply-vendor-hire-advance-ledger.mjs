import pg from "pg";
import { readFile } from "node:fs/promises";

if (process.env.NODE_ENV !== "development") {
  throw new Error("Run this explicitly reviewed migration with NODE_ENV=development only.");
}

const targets = [
  { key: "DEV_DATABASE_URL", database: "sitelog_dev" },
  { key: "DATABASE_URL", database: "heliumdb" },
];
const expectedColumns = [
  "id", "vendor_id", "site_id", "kind", "amount", "effective_date", "reference",
  "bill_id", "hire_statement_id", "client_request_id", "created_by_user_id", "created_by", "created_at",
];
const expectedIndexes = [
  "vendor_hire_advance_ledger_vendor_date_idx",
  "vendor_hire_advance_ledger_recovery_statement_uq",
  "vendor_hire_advance_ledger_opening_vendor_uq",
  "vendor_hire_advance_ledger_client_request_uq",
];
const expectedForeignKeys = [
  "vendor_hire_advance_ledger_vendor_id_vendors_id_fk",
  "vendor_hire_advance_ledger_site_id_sites_id_fk",
  "vendor_hire_advance_ledger_bill_id_vendor_bills_id_fk",
  "vendor_hire_advance_ledger_hire_statement_id_hire_statements_id_fk",
];
const migration = await readFile(
  new URL("../migrations/0051_vendor_hire_advance_ledger.sql", import.meta.url),
  "utf8",
);
const clients = [];
let step = "connect and verify development database identities";

async function inspectTarget(client) {
  const identity = (await client.query("SELECT current_database() AS name")).rows[0]?.name;
  const target = clients.at(-1)?.target;
  if (!target || identity !== target.database) {
    throw new Error("Development database identity check failed.");
  }
  const [prerequisites] = (await client.query(`
    SELECT to_regclass('public.vendors') AS vendors,
           to_regclass('public.sites') AS sites,
           to_regclass('public.vendor_bills') AS vendor_bills,
           to_regclass('public.hire_statements') AS hire_statements
  `)).rows;
  if (Object.values(prerequisites).some(value => value == null)) {
    throw new Error(`Required referenced tables are missing in ${target.database}.`);
  }

  const exists = (await client.query(
    "SELECT to_regclass('public.vendor_hire_advance_ledger') IS NOT NULL AS present",
  )).rows[0]?.present;
  if (!exists) {
    clients.at(-1).needsMigration = true;
    return;
  }

  const columns = (await client.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'vendor_hire_advance_ledger'
    ORDER BY ordinal_position
  `)).rows.map(row => row.column_name);
  const indexes = (await client.query(`
    SELECT indexname FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'vendor_hire_advance_ledger'
  `)).rows.map(row => row.indexname);
  const foreignKeys = (await client.query(`
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.vendor_hire_advance_ledger'::regclass AND contype = 'f'
  `)).rows.map(row => row.conname);

  if (JSON.stringify(columns) !== JSON.stringify(expectedColumns) ||
      expectedIndexes.some(name => !indexes.includes(name)) ||
      expectedForeignKeys.some(name => !foreignKeys.includes(name))) {
    throw new Error(`Existing vendor advance ledger schema is incomplete in ${target.database}; stopped without modifying it.`);
  }
  clients.at(-1).alreadyPresent = true;
}

try {
  for (const target of targets) {
    const connectionString = process.env[target.key];
    if (!connectionString) throw new Error(`Required development target ${target.key} is unavailable.`);
    const client = new pg.Client({ connectionString });
    await client.connect();
    clients.push({ client, target, needsMigration: false, alreadyPresent: false, inTransaction: false });
    await inspectTarget(client);
  }

  step = "begin additive schema transactions";
  for (const state of clients.filter(item => item.needsMigration)) {
    await state.client.query("BEGIN");
    state.inTransaction = true;
    await state.client.query("SET LOCAL lock_timeout = '5s'");
  }

  step = "create the reviewed ledger table and indexes";
  for (const state of clients.filter(item => item.needsMigration)) {
    await state.client.query(migration);
  }

  step = "verify columns, indexes, and foreign keys";
  for (const state of clients.filter(item => item.needsMigration)) {
    const columns = (await state.client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'vendor_hire_advance_ledger'
      ORDER BY ordinal_position
    `)).rows.map(row => row.column_name);
    const indexes = (await state.client.query(`
      SELECT indexname FROM pg_indexes
      WHERE schemaname = 'public' AND tablename = 'vendor_hire_advance_ledger'
    `)).rows.map(row => row.indexname);
    const foreignKeys = (await state.client.query(`
      SELECT conname FROM pg_constraint
      WHERE conrelid = 'public.vendor_hire_advance_ledger'::regclass AND contype = 'f'
    `)).rows.map(row => row.conname);
    const missingColumns = expectedColumns.filter(name => !columns.includes(name));
    const unexpectedColumns = columns.filter(name => !expectedColumns.includes(name));
    const missingIndexes = expectedIndexes.filter(name => !indexes.includes(name));
    const missingForeignKeys = expectedForeignKeys.filter(name => !foreignKeys.includes(name));
    if (missingColumns.length || unexpectedColumns.length || missingIndexes.length || missingForeignKeys.length) {
      throw new Error(`Schema verification mismatch in ${state.target.database}: ${JSON.stringify({
        missingColumns, unexpectedColumns, missingIndexes, missingForeignKeys,
      })}`);
    }
  }

  step = "commit development schema transactions";
  for (const state of clients.filter(item => item.inTransaction)) {
    await state.client.query("COMMIT");
    state.inTransaction = false;
  }

  console.log(JSON.stringify(clients.map(({ target, needsMigration, alreadyPresent }) => ({
    database: target.database,
    created: needsMigration,
    alreadyPresent,
    columns: expectedColumns.length,
    indexes: expectedIndexes.length,
  }))));
} catch (error) {
  await Promise.all(clients
    .filter(state => state.inTransaction)
    .map(state => state.client.query("ROLLBACK").catch(() => undefined)));
  const code = typeof error?.code === "string" ? ` (${error.code})` : "";
  console.error(`Vendor advance ledger migration failed during ${step}${code}; no credentials were logged.`);
  process.exitCode = 1;
} finally {
  await Promise.all(clients.map(state => state.client.end().catch(() => undefined)));
}
