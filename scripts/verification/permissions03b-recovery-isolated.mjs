import fs from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";
import ts from "typescript";
import { execFileSync } from "node:child_process";
const calls = [];
const storage = new Proxy({}, { get: (_, key) => async () => {
  calls.push(String(key));
  if (["getDprs", "getPlanningEquipmentTypes"].includes(key)) return [{}];
  return { skipped: [], errors: [], updated: 0, marked: 0, unmatched: 0 };
}});
const sqls = [];
const sql = (strings, ...args) => strings.join("?");
const context = { storage, db: { execute: async q => { sqls.push(q); return { rows: [], rowCount: 0 }; } },
  sql, console: { log(){}, error(){} }, process: { env: {} },
  backfillSplitPermissions: async()=>{}, backfillPlantSubPermissions: async()=>{},
  migrateEmailPhoneSchema: async()=>{}, ensureBootstrapAdmin: async()=>{} };
for (const [path, start, end, call] of [
  ["server/index.ts", "async function runBackgroundMigrations()", "  // ── Stale draft GRN push alert", "runBackgroundMigrations"],
  ["server/routes.ts", "async function seedDatabase()", "async function seedPlanningMasters()", "seedDatabase"],
]) {
  const text = fs.readFileSync(path, "utf8");
  let source = text.slice(text.indexOf(start), text.indexOf(end, text.indexOf(start)));
  if (call === "runBackgroundMigrations") source += "\n}";
  // Only dynamic helper in the isolated runner: replace with a no-op spy module.
  source = source.replace('await import("./arrangementAllocationSync")', '({backfillArrangementBarAllocations: async () => ({arrangements:0})})');
  const js = ts.transpileModule(source + `\n${call}()`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
  await vm.runInNewContext(js, context);
}
const plan = JSON.parse(execFileSync("node", ["scripts/verification/stock-repair-plan.mjs"], {encoding:"utf8"}));
const retired = plan.operations.flatMap(op => op.retiredAutomaticCalls);
assert.ok(retired.includes("fixLdoStockDeductionErrors"));
assert.ok(retired.includes("migrateDprPlantStockDieselToLedger"));
assert.ok(retired.includes("resetAllSequences"));
assert.deepEqual(calls.filter(name => retired.includes(name)), []);
assert.ok(!sqls.some(q => /\b(?:UPDATE|INSERT INTO|DELETE FROM)\s+stock_(ledger|balances)/i.test(q)));
assert.ok(calls.includes("ensureRmcTables"));
// Check transitive storage helpers, not just direct spy calls.
const storageSource = fs.readFileSync("server/storage.ts", "utf8");
const ast = ts.createSourceFile("storage.ts", storageSource, ts.ScriptTarget.Latest, true);
const methods = new Map();
function visit(node) {
  if (ts.isMethodDeclaration(node) && node.name) methods.set(node.name.getText(ast), node.getText(ast));
  ts.forEachChild(node, visit);
}
visit(ast);
const checked = new Set();
function check(name) {
  if (checked.has(name)) return;
  checked.add(name);
  const body = methods.get(name) ?? "";
  assert.ok(!/\.(?:update|insert|delete)\(stock(?:Ledger|Balances)\)/.test(body), `stock writer reachable: ${name}`);
  assert.ok(!/\b(?:UPDATE|INSERT INTO|DELETE FROM)\s+stock_(?:ledger|balances)/i.test(body), `SQL stock writer reachable: ${name}`);
  assert.ok(!/setval\s*\(/.test(body), `sequence reset reachable: ${name}`);
  for (const match of body.matchAll(/this\.(\w+)\(/g)) check(match[1]);
}
for (const name of calls) check(name);
for (const match of fs.readFileSync("server/index.ts", "utf8").matchAll(/storage(?: as any\))?\.(\w+)\(/g)) check(match[1]);
const routes = fs.readFileSync("server/routes.ts", "utf8");
const oldRoutes = execFileSync("git", ["show", "595c515d:server/routes.ts"], {encoding:"utf8", maxBuffer:8*1024*1024});
assert.equal(routes.slice(0,routes.indexOf("async function seedDatabase()")), oldRoutes.slice(0,oldRoutes.indexOf("async function seedDatabase()")), "permission/operational routes changed");
assert.throws(() => execFileSync("node", ["scripts/verification/stock-repair-plan.mjs", "--apply"], {stdio:"pipe"}));
console.log(JSON.stringify({ passed: true, retired, startupCalls: calls, sqlStatements: sqls }, null, 2));
