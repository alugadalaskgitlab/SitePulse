// Read-only development preservation inventory. Never opens production.
import pg from "pg";
import fs from "node:fs";
const db = new pg.Client({ connectionString: process.env.DEV_DATABASE_URL });
await db.connect();
try {
  await db.query("BEGIN READ ONLY");
  const name = (await db.query("select current_database() name")).rows[0].name;
  if (name !== "sitelog_dev") throw Error("Wrong database");
  const tables = (await db.query("select tablename from pg_tables where schemaname='public' order by tablename")).rows;
  const result = { database: name, tables: {} };
  for (const { tablename } of tables) {
    const table = '"' + tablename.replaceAll('"', '""') + '"';
    result.tables[tablename] = (await db.query(`select count(*)::int as count, md5(coalesce(string_agg(to_jsonb(t)::text, E'\\n' order by to_jsonb(t)::text), '')) as digest from ${table} t`)).rows[0];
  }
  fs.mkdirSync("reports/perm-req01", { recursive: true });
  fs.writeFileSync(`reports/perm-req01/${process.argv[2] || "before"}.json`, JSON.stringify(result,null,2));
  const holders = (await db.query("select u.id,u.full_name,u.is_active,u.is_admin,u.is_owner from users u join user_permissions p on p.user_id=u.id where p.section_key='site_dprs' and p.can_approve=true order by u.id")).rows;
  fs.writeFileSync("reports/perm-req01/development-approval-impact.json", JSON.stringify(holders,null,2));
  console.log(`${tables.length} tables snapshotted; ${holders.length} stored approval holders`);
  await db.query("ROLLBACK");
} finally { await db.end(); }
