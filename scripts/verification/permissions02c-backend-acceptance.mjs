import fs from "node:fs/promises";
import assert from "node:assert/strict";
import pg from "pg";
import { api, manifest, saveManifest, dir, privateDir } from "./permissions02c-browser.mjs";
const admin = JSON.parse(await fs.readFile(`${privateDir}/admin-session.json`, "utf8"));
const cfg = await fs.readFile(".replit", "utf8");
const db = new pg.Client({ connectionString: process.env.DEV_DATABASE_URL ?? cfg.match(/^DEV_DATABASE_URL\s*=\s*"([^"]+)"/m)?.[1] });
await db.connect();
assert.equal((await db.query("select current_database() as name")).rows[0].name, "sitelog_dev");
const results = [];
const log = async (test, evidence) => {
  results.push({ test, evidence });
  await fs.writeFile(`${dir}/backend-results.json`, JSON.stringify(results, null, 2));
};
const initial = JSON.parse(await fs.readFile(`${dir}/subject-initial-permissions.json`, "utf8")).matrix;
const empty = () => Object.fromEntries(Object.entries(initial).map(([s, actions]) => [s, Object.fromEntries(Object.keys(actions).map(a => [a, false]))]));
async function set(id, matrix, actor = admin) {
  const r = await api(actor, `/api/auth/users/${id}/permissions`, "PUT", matrix);
  assert.equal(r.status, 200);
  return r.body.matrix;
}
async function signIn(key) {
  const c = [];
  let r = await api(c, "/api/auth/login", "POST", {
    identifier: manifest[key].email, password: process.env.DEV_VERIFICATION_PASSWORD,
  });
  assert.equal(r.status, 202);
  const devices = (await db.query("select id,status from user_devices where user_id=$1", [manifest[key].id])).rows;
  assert.equal(devices.length, 1);
  assert.equal(devices[0].status, "pending");
  const approved = await api(admin, `/api/auth/devices/${devices[0].id}/approve`, "POST", {});
  assert.equal(approved.status, 200);
  r = await api(c, "/api/auth/login", "POST", {
    identifier: manifest[key].email, password: process.env.DEV_VERIFICATION_PASSWORD,
  });
  assert.equal(r.status, 200);
  assert.equal((await api(c, "/api/auth/me")).body.user.id, manifest[key].id);
  await fs.writeFile(`${privateDir}/${key}-session.json`, JSON.stringify(c), { mode: 0o600 });
  manifest[key].deviceId = devices[0].id; await saveManifest();
  await log(`${key}: normal device approval and login`, { pending: 202, approval: 200, login: 200, approvedByDisposableAdministrator: true });
  return c;
}
try {
  const subject = await signIn("subject");
  const paths = ["/api/diesel-requirements", "/api/purchase-indents", "/api/irn", "/api/site-material-trips", "/api/maintenance/logs", "/api/vendor-bills"];
  const probe = async (label, grants) => {
    const matrix = empty();
    for (const [s, a] of grants) matrix[s][a] = true;
    await set(manifest.subject.id, matrix);
    const statuses = {};
    for (const path of paths) {
      const r = await api(subject, path);
      statuses[path] = { status: r.status, ...(Array.isArray(r.body) ? { returnedRows: r.body.length } : {}) };
    }
    await log(label, { grants, statuses });
  };
  await probe("All permission bits unchecked", []);
  await probe("Granular view-only grants", [["diesel_req_view", "view"], ["purchase_indents_view", "view"], ["irn_view", "view"], ["site_materials", "view"], ["plant_maintenance", "view"], ["vendor_bills_view", "view"]]);
  await probe("Broad legacy view grants; granular view bits off", [["site_diesel", "view"], ["site_procurement", "view"], ["plant_equipment", "view"], ["vendor_bills", "view"]]);
  await probe("Diesel supporting stores alternative", [["stores_inventory", "view"]]);
  await probe("Diesel raise/create alternative", [["diesel_req_raise", "create"]]);
  await probe("Final revocation: all sources off again", []);
  const managerMatrix = empty();
  managerMatrix.diesel_req_view.view = true;
  await set(manifest.manager.id, managerMatrix);
  const flagged = await api(admin, `/api/auth/users/${manifest.manager.id}`, "PATCH", { canManagePermissions: true, permissionManagerScope: "partial" });
  assert.equal(flagged.status, 200);
  if (!manifest.limitedTarget) {
    const created = await api(admin, "/api/auth/users", "POST", {
      email: "permissions02c.limited@test.invalid", fullName: "PERM 02C Limited Target",
      password: process.env.DEV_VERIFICATION_PASSWORD, permissions: empty(),
      siteAccess: { mode: "selected", siteIds: [manifest.siteId] },
    });
    assert.equal(created.status, 201);
    manifest.limitedTarget = { id: created.body.id, email: created.body.email };
    await saveManifest();
  }
  // Give subject out-of-scope grants to exercise the UI's preservation block.
  await set(manifest.subject.id, initial);
  const manager = await signIn("manager");
  const protectAdmin = await api(manager, `/api/auth/users/${manifest.administrator.id}/permissions`, "PUT", empty());
  assert.equal(protectAdmin.status, 403);
  await log("Partial manager cannot modify disposable Administrator", { status: protectAdmin.status });
  const attempted = empty(); attempted.diesel_req_view.view = true; attempted.vendor_bills.view = true;
  const stored = await set(manifest.limitedTarget.id, attempted, manager);
  assert.equal(stored.diesel_req_view.view, true);
  assert.equal(stored.vendor_bills.view, false);
  await log("Current backend caps out-of-scope grants", { status: 200, allowedDieselViewStored: true, unownedVendorViewStored: false });
  await set(manifest.limitedTarget.id, empty());
  const sites = (await api(admin, `/api/auth/users/${manifest.subject.id}/site-access`)).body;
  assert.deepEqual(sites, JSON.parse(await fs.readFile(`${dir}/subject-initial-sites.json`, "utf8")));
  await log("Site access preserved through all matrix updates", sites);
  console.log(JSON.stringify(results, null, 2));
} finally {
  await db.end();
}
