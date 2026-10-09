import fs from "node:fs/promises";
import assert from "node:assert/strict";
import { api, manifest as m, dir, signIn, emptyMatrix } from "./permissions03b-runtime.mjs";
const phase = process.argv[2];
assert.ok(["before", "after"].includes(phase));
const admin = await signIn("administrator");
const subject = await signIn("subject", admin);
const template = (await api(admin, `/api/auth/users/${m.subject.id}/permissions`)).body.matrix;
const results = [];
const test = async (name, cookies, path, expected, method = "GET", body) => {
  const r = await api(cookies, path, method, body);
  const ids = Array.isArray(r.body) ? r.body.map(x => typeof x === "object" ? x.id ?? x.equipmentId : x) : undefined;
  results.push({ name, method, path, status: r.status, expected, ids,
    ...(r.status >= 400 ? { error: r.body } : {}) });
  await fs.writeFile(`${dir}/${phase}-api.json`, JSON.stringify(results, null, 2));
  // Keep collecting independent evidence even when one supporting API is broken.
  return r;
};
const set = async (grants) => {
  const matrix = emptyMatrix(template);
  for (const [key, action] of grants) matrix[key][action] = true;
  assert.equal((await api(admin, `/api/auth/users/${m.subject.id}/permissions`, "PUT", matrix)).status, 200);
  assert.deepEqual((await api(admin, `/api/auth/users/${m.subject.id}/permissions`)).body.matrix, matrix);
};
for (const [key, action] of [
  ["diesel_req_view", "view"], ["site_diesel", "view"], ["stores_inventory", "view"],
  ["diesel_req_raise", "create"], ["plant_maintenance", "view"], ["plant_equipment", "view"],
]) {
  await set([[key, action]]);
  const diesel = !key.startsWith("plant_");
  const root = diesel ? "/api/diesel-requirements" : "/api/maintenance/logs";
  const records = diesel ? m.diesel : m.maintenance;
  const list = await test(`${key}.${action} list`, subject, root, 200);
  await test(`${key}.${action} own-site detail`, subject, `${root}/${records[0].id}`, 200);
  await test(`${key}.${action} other-site detail`, subject, `${root}/${records[1].id}`, 403);
  if (phase === "after") {
    assert.ok(list.body.some(r => r.id === records[0].id), `${key} own record missing`);
    assert.ok(!list.body.some(r => r.id === records[1].id), `${key} leaked foreign record`);
  }
  if (action === "view" && ["diesel_req_view", "plant_maintenance"].includes(key)) {
    await test(`${key} cannot create`, subject, root, 403, "POST", {});
    await test(`${key} cannot edit`, subject, `${root}/${records[0].id}`, 403, diesel ? "PUT" : "PATCH", {});
    await test(`${key} cannot delete`, subject, `${root}/${records[0].id}`, 403, "DELETE");
    if (diesel) {
      for (const operation of ["approve", "reject", "purchase-update", "payment-status"])
        await test(`${key} cannot ${operation}`, subject, `${root}/${records[0].id}/${operation}`, 403, "PATCH", {});
      await test("granular diesel summary", subject, `${root}/summary`, 200);
      await test("granular diesel receipt status", subject, `${root}/receipt-status?ids=${records[0].id}`, 200);
      await test("granular diesel foreign receipt status", subject, `${root}/receipt-status?ids=${records[1].id}`, 403);
      await test("granular diesel attachments", subject, `/api/attachments?moduleType=diesel_purchase&linkedRecordId=${records[0].id}`, 200);
      await test("granular diesel foreign attachments", subject, `/api/attachments?moduleType=diesel_purchase&linkedRecordId=${records[1].id}`, 403);
      await test("granular diesel does not gain comparison report", subject, `${root}/comparison?dateFrom=2026-10-09&dateTo=2026-10-09`, 403);
      await test("granular diesel does not gain daily report", subject, `${root}/daily-report?from=2026-10-09&to=2026-10-09`, 403);
    } else {
      for (const operation of ["cancel", "parts"])
        await test(`${key} cannot ${operation}`, subject, `${root}/${records[0].id}/${operation}`, 403, "POST", {});
      for (const supporting of ["health-summary", "open-count", "equipment-options"])
        await test(`granular maintenance ${supporting}`, subject, `/api/maintenance/${supporting}`, 200);
      await test("granular maintenance foreign attachment", subject, `/api/attachments?moduleType=equipment_breakdown&linkedRecordId=${records[1].id}`, 404);
      // The master already returned 200 before this batch, even without its
      // dedicated View. Record that inherited gap, never call it a new grant.
      await test("equipment master inherited reachability unchanged", subject, "/api/plant-module/equipment", 200);
      await test("granular maintenance does not gain stores", subject, "/api/stores/items", 403);
    }
  }
}
await set([]);
for (const path of ["/api/diesel-requirements", "/api/maintenance/logs", "/api/maintenance/health-summary", "/api/maintenance/open-count"]) {
  await test("all off " + path, subject, path, 403);
  await test("Administrator " + path, admin, path, 200);
}
// Leave only the two granular reads for signed-in browser verification.
await set([["diesel_req_view", "view"], ["plant_maintenance", "view"]]);
console.log(`${phase}: ${results.length} authenticated request results recorded`);
if (phase === "after") {
  const failed = results.filter(r => r.status !== r.expected);
  console.log(JSON.stringify({ failed }));
  if (failed.length) process.exitCode = 1;
}
