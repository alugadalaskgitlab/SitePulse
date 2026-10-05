import fs from "node:fs";
import path from "node:path";
import pg from "pg";
import assert from "node:assert/strict";
import { storage } from "../server/storage";

const out = ".agents/outputs/transport-setup-review";
fs.mkdirSync(out, { recursive: true });
const write = (name: string, data: unknown) => fs.writeFileSync(`${out}/${name}.json`, JSON.stringify(data, null, 2));
for (const [label, key, expected] of [
  ["runtime", "DEV_DATABASE_URL", "sitelog_dev"], ["publish-development", "DATABASE_URL", "heliumdb"],
]) {
  const client = new pg.Client({ connectionString: process.env[key] });
  await client.connect();
  await client.query("BEGIN READ ONLY");
  assert.equal((await client.query("select current_database() as name")).rows[0].name, expected);
  const rows = (await client.query("select * from vendor_rate_cards order by id")).rows;
  write(`${label}-before`, rows);
  console.log(`${label}: ${rows.length} saved rows, ${rows.filter(r => r.rate > 0).length} positive rates`);
  await client.query("ROLLBACK");
  await client.end();
}
const discovered = await storage.discoverVendorItems("NARASIMHULU");
write("narasimhulu-discovered", discovered);
console.log("NARASIMHULU discovered", discovered.length);

// Inventory only. Normalized comparison strings are NEVER written to the DB.
const schema = fs.readFileSync("shared/schema.ts", "utf8").split("\n");
let table = "";
const catalog: { table: string; line: number; definition: string }[] = [];
schema.forEach((line, i) => {
  const m = line.match(/= pgTable\("([^"]+)"/);
  if (m) table = m[1];
  if (/^\s+\w+:\s+(text|integer|jsonb)\(/.test(line) &&
      (/(vendor|supplier|transporter|material|canonicalName|alias)/i.test(line.split("//")[0]) ||
       (/^\s+name:/.test(line) && /(material|vendor|parties|store_items|equipment)/.test(table)))) {
    catalog.push({ table, line: i + 1, definition: line.trim() });
  }
});
write("name-storage-catalog", catalog);
const transformations: { file: string; line: number; code: string; context: string }[] = [];
function scan(dir: string) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) scan(p);
    else if (/\.(ts|tsx|js|jsx)$/.test(p) && !/\.(test|spec)\./.test(p)) {
      const lines = fs.readFileSync(p, "utf8").split("\n");
      lines.forEach((line, i) => {
        if (/\.to(?:Locale)?UpperCase\s*\(|\.trim(?:Start|End)?\s*\(|\buppercase(?:Optional)?BusinessText\s*\(/.test(line)) {
          transformations.push({ file: p, line: i + 1, code: line.trim(),
            context: lines.slice(Math.max(0, i - 3), i + 4).join("\n") });
        }
      });
    }
  }
}
["client/src", "server", "shared"].forEach(scan);
write("all-case-and-trim-source-locations", transformations);
console.log("catalog columns", catalog.length, "case/trim source locations", transformations.length);
process.exit(0);
