// Development-only real HTTP/browser acceptance. Requires Chromium CDP :9235.
// Uses only disposable accounts and the existing verification secret.
import fs from "node:fs";
import crypto from "node:crypto";
import assert from "node:assert/strict";
import pg from "pg";
import bcrypt from "bcryptjs";
import WebSocket from "ws";
import { applyRoleTemplate } from "../shared/permissions.ts";
const base = "http://127.0.0.1:5000", out = "reports/user-role02", id = 1900000900;
const p = new pg.Client({ connectionString: process.env.DEV_DATABASE_URL });
await p.connect();
assert.equal((await p.query("select current_database() name")).rows[0].name, "sitelog_dev");
assert(process.env.DEV_VERIFICATION_PASSWORD);
fs.mkdirSync(out, { recursive: true });
const save = (name, value) => fs.writeFileSync(`${out}/${name}.json`, JSON.stringify(value, null, 2));
const tables = ["users", "user_permissions", "user_site_access", "sites", "boq_projects", "boq_items",
  "earthwork_arrangements", "site_material_trips", "vendors", "vendor_bills", "vendor_bill_items"];
async function snapshot() {
  const result = {};
  for (const table of tables) {
    const rows = (await p.query(`select to_jsonb(t) - 'business_role' as row from ${table} t order by id`)).rows;
    result[table] = { count: rows.length, sha256: crypto.createHash("sha256").update(JSON.stringify(rows)).digest("hex") };
  }
  return result;
}
const before = JSON.parse(fs.readFileSync(`${out}/integrity-before.json`, "utf8"));
assert.deepEqual(await snapshot(), before, "Existing records changed since schema approval");
const accounts = [id];
let browser;
async function api(client, path, body, method = body ? "POST" : "GET") {
  const r = await fetch(base + path, { method, headers: { "Content-Type": "application/json",
    cookie: Object.entries(client).map(([k, v]) => `${k}=${v}`).join("; ") }, body: body ? JSON.stringify(body) : undefined });
  for (const cookie of r.headers.getSetCookie()) { const v = cookie.split(";")[0], i = v.indexOf("="); client[v.slice(0, i)] = v.slice(i + 1); }
  const text = await r.text(); let data;
  try { data = JSON.parse(text); } catch { data = { text: text.slice(0, 150) }; }
  return { status: r.status, data };
}
async function login(email, uid) {
  const client = {};
  let r = await api(client, "/api/auth/login", { identifier: email, password: process.env.DEV_VERIFICATION_PASSWORD });
  if (r.status === 202) {
    const tokens = Object.values(client).map(v => decodeURIComponent(v).split(".")[0].replace(/^s:/, ""));
    const pending = (await p.query("select id from user_devices where user_id=$1 and status='pending' and device_token=any($2::text[])", [uid, tokens])).rows;
    assert.equal(pending.length, 1);
    await p.query("update user_devices set status='approved',approved_at=now() where id=$1", [pending[0].id]);
    r = await api(client, "/api/auth/login", { identifier: email, password: process.env.DEV_VERIFICATION_PASSWORD });
  }
  assert.equal(r.status, 200);
  return client;
}
async function connect() {
  const targets = await (await fetch("http://127.0.0.1:9235/json")).json();
  const ws = new WebSocket(targets.find(t => t.type === "page").webSocketDebuggerUrl);
  await new Promise(r => ws.once("open", r));
  let n = 0; const pending = new Map();
  ws.on("message", raw => { const m = JSON.parse(raw); if (pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } });
  const call = (method, params = {}) => new Promise((resolve, reject) => {
    const rid = ++n; pending.set(rid, m => m.error ? reject(Error(m.error.message)) : resolve(m.result));
    ws.send(JSON.stringify({ id: rid, method, params }));
  });
  const evaluate = async expression => {
    const r = await call("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description);
    return r.result?.value;
  };
  return { ws, call, evaluate };
}
try {
  await p.query("insert into users(id,email,full_name,password_hash,is_admin,is_owner,setup_complete,notifications_enabled) values($1,'userrole02-admin@test.invalid','USERROLE02 Admin',$2,true,false,true,false)",
    [id, await bcrypt.hash(process.env.DEV_VERIFICATION_PASSWORD, 10)]);
  const admin = await login("userrole02-admin@test.invalid", id);
  async function create(suffix, roleTemplate) {
    const r = await api(admin, "/api/auth/users", { email: `userrole02-${suffix}@test.invalid`, fullName: `USERROLE02 ${suffix}`,
      password: process.env.DEV_VERIFICATION_PASSWORD, roleTemplate, siteAccess: { mode: "none" } });
    assert.equal(r.status, 201);
    accounts.push(r.data.id);
    assert.equal(r.data.businessRole, roleTemplate);
    return r.data.id;
  }
  const uid = await create("review", "viewer");
  const opsId = await create("operations", "operations_director");
  const matrix = applyRoleTemplate("viewer");
  matrix.site_dprs.delete = true; matrix.site_dprs.export = true; matrix.site_dprs.notify = true;
  matrix.user_management.edit = true;
  assert.equal((await api(admin, `/api/auth/users/${uid}/permissions`, { matrix, businessRole: null }, "PUT")).status, 200);
  const ops = await login("userrole02-operations@test.invalid", opsId);
  const denials = {};
  for (const [name, path, body, method] of [
    ["users", "/api/auth/users", undefined, "GET"],
    ["permission-save", `/api/auth/users/${opsId}/permissions`, { matrix, businessRole: "administrator" }, "PUT"],
    ["delete-trip", "/api/site-material-trips/1900000900", undefined, "DELETE"],
    ["branding", "/api/admin/branding", {}, "POST"],
    ["licence", "/api/admin/licensed-modules", {}, "POST"],
  ]) {
    denials[name] = await api(ops, path, body, method);
    assert.equal(denials[name].status, 403, name);
  }
  save("backend-denials", denials);
  const invalid = await api(admin, `/api/auth/users/${uid}/permissions`, { matrix, businessRole: "invented" }, "PUT");
  assert.equal(invalid.status, 400);
  assert.equal((await api(admin, `/api/auth/users/${uid}/permissions`)).data.businessRole, null);
  browser = await connect(); await browser.call("Network.enable");
  for (const [name, value] of Object.entries(admin)) await browser.call("Network.setCookie", { name, value, url: base });
  await browser.call("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false });
  await browser.call("Page.navigate", { url: base + "/admin/users" });
  const wait = async expr => {
    for (let n = 0; n < 100; n++) { if (await browser.evaluate(expr)) return; await new Promise(r => setTimeout(r, 200)); }
    throw Error("UI timeout: " + expr);
  };
  const click = async selector => {
    await wait(`!!document.querySelector(${JSON.stringify(selector)})`);
    const box = await browser.evaluate(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});el.scrollIntoView({block:"center"});const r=el.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
    await browser.call("Input.dispatchMouseEvent", { type: "mousePressed", ...box, button: "left", clickCount: 1 });
    await browser.call("Input.dispatchMouseEvent", { type: "mouseReleased", ...box, button: "left", clickCount: 1 });
    await new Promise(r => setTimeout(r, 180));
  };
  const shot = async name => {
    await new Promise(r => setTimeout(r, 400));
    fs.writeFileSync(`${out}/${name}.jpg`, Buffer.from((await browser.call("Page.captureScreenshot", { format: "jpeg", quality: 85 })).data, "base64"));
  };
  const read = async () => (await api(admin, `/api/auth/users/${uid}/permissions`)).data;
  await click(`[data-testid="button-perms-${uid}"]`);
  await click('[data-testid="select-role-template"]'); await click('[data-testid="template-operations_director"]');
  await wait(`!!document.querySelector('[data-testid="role-change-preview"]')`);
  assert.equal(await browser.evaluate(`document.querySelector('[data-testid="button-save-perms"]').disabled`), true);
  assert.deepEqual((await read()).matrix, matrix);
  await shot("pending-review");
  await click('[data-testid="button-cancel-role"]');
  assert.equal((await read()).businessRole, null);
  await click('[data-testid="select-role-template"]'); await click('[data-testid="template-operations_director"]');
  await click('[data-testid="button-confirm-role"]');
  assert.equal((await read()).businessRole, null, "Confirm must stage only");
  assert.deepEqual((await read()).matrix, matrix);
  await shot("confirmed-unsaved");
  await click('[data-testid="button-save-perms"]');
  await wait(`!document.querySelector('[data-testid="button-save-perms"]')`);
  const merged = await read();
  assert.equal(merged.businessRole, "operations_director");
  assert.equal(merged.matrix.site_dprs.create, true);
  assert.equal(merged.matrix.site_dprs.delete, true);
  assert.equal(merged.matrix.site_dprs.export, true);
  assert.equal(merged.matrix.user_management.edit, true);
  await click(`[data-testid="button-edit-${uid}"]`);
  await wait(`document.querySelector('[role="dialog"]')?.innerText.includes("Operations Director")`);
  await shot("edit-user-designation");
  await browser.call("Page.navigate", { url: base + "/admin/users" });
  await click(`[data-testid="button-perms-${uid}"]`);
  await shot("reopened-saved");
  await click('[data-testid="select-role-template"]'); await click('[data-testid="template-viewer"]');
  await click('[data-testid="role-mode-replace"]');
  await click('[data-testid="button-confirm-role"]'); await click('[data-testid="button-save-perms"]');
  await wait(`!document.querySelector('[data-testid="button-save-perms"]')`);
  const replaced = await read();
  assert.equal(replaced.businessRole, "viewer");
  assert.equal(replaced.matrix.site_dprs.delete, false);
  assert.equal(replaced.matrix.user_management.edit, false);
  // Matrix-only advanced save preserves explicit designation, without inference.
  replaced.matrix.site_materials.edit = true;
  assert.equal((await api(admin, `/api/auth/users/${uid}/permissions`, replaced.matrix, "PUT")).status, 200);
  assert.equal((await read()).businessRole, "viewer");
  const flags = (await p.query("select is_admin,is_owner,can_manage_permissions,can_unlock_records,business_role from users where id=$1", [uid])).rows[0];
  assert.deepEqual(flags, { is_admin: false, is_owner: false, can_manage_permissions: false, can_unlock_records: false, business_role: "viewer" });
  save("acceptance", { previewUnchanged: true, cancelUnchanged: true, confirmStagesOnly: true, merged,
    replaced, advancedPreservesDesignation: true, flags, invalidDesignationStatus: invalid.status });
} finally {
  browser?.ws.close();
  const found = (await p.query("select id from users where email like 'userrole02-%@test.invalid'")).rows.map(r => r.id);
  for (const table of ["user_sessions", "user_devices", "user_permissions", "user_site_access"])
    await p.query(`delete from ${table} where user_id=any($1::int[])`, [found]);
  await p.query("delete from users where id=any($1::int[])", [found]);
  save("removed", { users: found });
  const after = await snapshot(); save("integrity-after", after);
  assert.deepEqual(after, before, "Existing records changed");
  assert.equal((await p.query("select count(*)::int as n from users where business_role is not null")).rows[0].n, 0);
  await p.end();
}
