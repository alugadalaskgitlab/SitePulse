import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { getTableConfig } from "drizzle-orm/pg-core";
import * as schema from "../shared/schema";

// Native, disposable PostgreSQL with independent connections. Never imports the
// app database implementation or consults any managed database credentials.
const holder = vi.hoisted(() => ({ db: null as any }));
vi.mock("../server/db", () => ({ get db() { return holder.db; }, pool: {} }));
vi.mock("../server/push", () => ({ sendPushToAll: vi.fn() }));
const gate = () => {
  let release!: () => void;
  const promise = new Promise<void>(resolve => { release = resolve; });
  return { promise, release };
};
let root: string;
let pool: pg.Pool;
let storage: any;
let baseDb: any;
let started = false;
const item = { id: 1, description: "WMM", qty: 10, uom: "MT", purpose: "ROAD", priority: "normal" };
const payload = (items: any[] = []) => ({
  date: "2026-01-01", proposedBy: "ENGINEER", raisedBy: "ENGINEER",
  siteId: 1, remarks: "EDIT", items,
});
beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), "pi01-native-postgres-"));
  mkdirSync(join(root, "socket"));
  execFileSync("initdb", ["-D", join(root, "data"), "-A", "trust", "-U", "pi01_test", "--no-locale", "-E", "UTF8"], { stdio: "pipe" });
  execFileSync("pg_ctl", ["-D", join(root, "data"), "-l", join(root, "postgres.log"), "-o", `-F -k ${join(root, "socket")} -p 58439 -c listen_addresses=''`, "-w", "start"], { stdio: "pipe" });
  started = true;
  pool = new pg.Pool({ host: join(root, "socket"), port: 58439, database: "postgres", user: "pi01_test", max: 8 });
  for (const table of [schema.purchaseIndents, schema.purchaseIndentItems, schema.purchaseOrders,
    schema.purchaseIndentItemHistory, schema.piItemTransactions, schema.storeGrnItems,
    schema.pendingPlantReceipts, schema.serviceCompletions, schema.siteMaterialTrips]) {
    const config = getTableConfig(table);
    await pool.query(`CREATE TABLE "${config.name}" (${config.columns.map(column =>
      `"${column.name}" ${column.getSQLType()}${column.primary ? " PRIMARY KEY" : ""}`).join(",")})`);
  }
  await pool.query("ALTER TABLE purchase_orders ADD CONSTRAINT native_pi_item_fk FOREIGN KEY (purchase_indent_item_id) REFERENCES purchase_indent_items(id)");
  baseDb = drizzle(pool, { schema });
  holder.db = baseDb;
  storage = new (await import("../server/storage")).DatabaseStorage();
}, 60000);
afterAll(async () => {
  await pool?.end();
  if (started) execFileSync("pg_ctl", ["-D", join(root, "data"), "-m", "immediate", "-w", "stop"], { stdio: "pipe" });
  if (root) rmSync(root, { recursive: true, force: true });
}, 30000);
beforeEach(async () => {
  vi.restoreAllMocks();
  holder.db = baseDb;
  await pool.query(`TRUNCATE purchase_orders,purchase_indent_item_history,pi_item_transactions,store_grn_items,
    pending_plant_receipts,service_completions,site_material_trips,purchase_indent_items,purchase_indents RESTART IDENTITY;
    INSERT INTO purchase_indents(id,indent_no,date,proposed_by,raised_by,site_id,status,approved_by,remarks,pi_type)
      VALUES(1,'NATIVE-TEST-ONLY','2026-01-01','ENGINEER','ENGINEER',1,'ordered','MANAGER','OLD','material');
    INSERT INTO purchase_indent_items(id,indent_id,description,qty,uom,purpose,priority,delivered_qty,approved_qty)
      VALUES(1,1,'WMM',10,'MT','ROAD','normal',0,0);
    SELECT setval('purchase_indent_items_id_seq',1);`);
});
async function waitForBlockedConnection() {
  for (let i = 0; i < 200; i++) {
    const result = await pool.query("SELECT pid,pg_blocking_pids(pid) AS blockers FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock'");
    if (result.rows.some(row => row.blockers.length > 0)) return result.rows;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  throw new Error("No independently blocked PostgreSQL connection observed");
}

it("edit removal holds the item lock; a queued source writer rechecks disappearance before physical insertion", async () => {
  const entered = gate();
  const release = gate();
  let paused = false;
  holder.db = new Proxy(baseDb, {
    get(target, key) {
      if (key !== "transaction") return Reflect.get(target, key);
      return (callback: any) => target.transaction((tx: any) => callback(new Proxy(tx, {
        get(transaction, method) {
          if (method !== "execute") return Reflect.get(transaction, method);
          return async (...args: any[]) => {
            const result = await transaction.execute(...args);
            if (!paused) { paused = true; entered.release(); await release.promise; }
            return result;
          };
        },
      })));
    },
  });
  const removal = storage.updatePurchaseIndent(1, payload());
  await entered.promise;
  const physicalInsert = vi.fn();
  const writer = baseDb.transaction((tx: any) =>
    storage._mutatePiDeliverySourceWithinTx(tx, "trip", null, physicalInsert, 1)
  ).then(() => null, (error: Error) => error);
  try {
    expect((await waitForBlockedConnection()).length).toBeGreaterThan(0);
    expect(physicalInsert).not.toHaveBeenCalled();
  } finally { release.release(); }
  await removal;
  expect((await writer)?.message).toContain("not found");
  expect(physicalInsert).not.toHaveBeenCalled();
  expect((await pool.query("SELECT * FROM site_material_trips")).rows).toHaveLength(0);
}, 15000);

it("a source writer holds protection throughout its physical callback; queued edit sees the committed reference", async () => {
  const entered = gate();
  const release = gate();
  const writer = baseDb.transaction((tx: any) => storage._mutatePiDeliverySourceWithinTx(tx, "trip", null, async () => {
    entered.release();
    await release.promise;
    const [trip] = await tx.insert(schema.siteMaterialTrips).values({
      id: 1, indentId: 1, indentItemId: 1, date: "2026-01-01", material: "WMM",
      quantity: 1, uom: "MT", isCancelled: false, isDeleted: false,
    }).returning();
    return trip;
  }, 1));
  await entered.promise;
  const edit = storage.updatePurchaseIndent(1, payload()).then(() => null, (error: Error) => error);
  try {
    expect((await waitForBlockedConnection()).length).toBeGreaterThan(0);
    expect((await pool.query("SELECT * FROM purchase_indent_items")).rows).toHaveLength(1);
  } finally { release.release(); }
  await writer;
  expect((await edit)?.message).toContain("cannot be removed");
  expect((await pool.query("SELECT * FROM site_material_trips")).rows).toHaveLength(1);
  expect((await pool.query("SELECT * FROM purchase_indent_items")).rows).toHaveLength(1);
}, 15000);

function snapshot() {
  return { id: 1, indentNo: "NATIVE-TEST-ONLY", piType: "material", status: "ordered",
    items: [{ ...item, approvedQty: 0, orderedQty: null, purchaseStatus: null }] };
}
it("canonical receipt callback retains removal protection even when reapproval overwrites approvedQty to zero", async () => {
  const entered = gate();
  const release = gate();
  await pool.query("UPDATE purchase_indent_items SET approved_qty=10 WHERE id=1");
  vi.spyOn(storage, "getPurchaseIndent").mockResolvedValue(snapshot());
  vi.spyOn(storage, "createMaterialReceipt").mockImplementation(async () => {
    entered.release();
    await release.promise;
    throw new Error("NATIVE TEST: stop before physical receipt");
  });
  const receipt = storage.recordMaterialIndentReceipt(1, [{ itemId: 1, materialId: 1, qty: 1, uom: "MT" }], "TEST")
    .then(() => null, (error: Error) => error);
  await Promise.race([entered.promise, receipt.then((error: Error) => { throw error; })]);
  try {
    await storage.approvePurchaseIndent(1, [{ itemId: 1, approvedQty: 0 }], "TEST");
    expect((await pool.query("SELECT approved_qty FROM purchase_indent_items WHERE id=1")).rows[0].approved_qty).toBe(0);
    expect((await pool.query("SELECT * FROM purchase_indent_item_history WHERE item_id=1")).rows).toHaveLength(1);
    await expect(storage.updatePurchaseIndent(1, payload())).rejects.toThrow("cannot be removed");
    expect((await pool.query("SELECT * FROM purchase_indent_items")).rows).toHaveLength(1);
  } finally { release.release(); }
  expect((await receipt)?.message).toContain("NATIVE TEST");
}, 15000);

it("canonical receipt rejects a disappeared item before invoking the physical receipt callback", async () => {
  vi.spyOn(storage, "getPurchaseIndent").mockResolvedValue(snapshot());
  const physical = vi.spyOn(storage, "createMaterialReceipt").mockResolvedValue({ id: 1 });
  await storage.updatePurchaseIndent(1, payload());
  // Keep the parent eligible to exercise the missing-item authoritative recheck,
  // rather than the independent "must still be ordered" header check.
  await pool.query("UPDATE purchase_indents SET status='ordered' WHERE id=1");
  await expect(storage.recordMaterialIndentReceipt(1, [{ itemId: 1, materialId: 1, qty: 1, uom: "MT" }], "TEST"))
    .rejects.toThrow(/no longer belongs|not found/);
  expect(physical).not.toHaveBeenCalled();
}, 15000);