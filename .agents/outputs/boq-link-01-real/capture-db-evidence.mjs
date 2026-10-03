import fs from "node:fs/promises";
import assert from "node:assert/strict";
import { db, api, close, out } from "../../../scripts/boq-link-real-browser.mjs";

const pool = await db();
const evidence = { database: "sitelog_dev", newDprIds: [249, 250, 251, 252] };
const before = JSON.parse(await fs.readFile(`${out}/old-dpr-before.json`, "utf8"));
const after = {};
for (const table of Object.keys(before)) {
  if (table === "header") {
    after.header = (await pool.query("select * from dprs where id=246")).rows;
  } else if (table === "equipment_activity_allocations" || table === "equipment_activity_segments") {
    after[table] = (await pool.query(`select * from ${table} where equipment_log_id in(select id from equipment_logs where dpr_id=246) order by id`)).rows;
  } else {
    after[table] = (await pool.query(`select * from ${table} where dpr_id=246 order by id`)).rows;
  }
}
assert.deepEqual(JSON.parse(JSON.stringify(after)), before);
evidence.oldDprUnchanged = true;
evidence.oldSegmentBoqItemsSupplementalReadOnly = (await pool.query("select * from equipment_activity_segment_boq_items where segment_id in(select id from equipment_activity_segments where equipment_log_id in(select id from equipment_logs where dpr_id=246)) order by id")).rows;
await fs.writeFile(`${out}/old-dpr-after-browser.json`, JSON.stringify(after, null, 2));
evidence.resources = {};
for (const id of evidence.newDprIds) {
  evidence.resources[id] = {};
  for (const table of ["dprs", "equipment_logs", "labour_logs", "material_logs", "progress_entries"]) {
    evidence.resources[id][table] = (await pool.query(`select * from ${table} where ${table === "dprs" ? "id" : "dpr_id"}=$1 order by id`, [id])).rows;
  }
  evidence.resources[id].segments = (await pool.query("select * from equipment_activity_segments where equipment_log_id in(select id from equipment_logs where dpr_id=$1) order by id", [id])).rows;
  evidence.resources[id].segmentBoqItems = (await pool.query("select * from equipment_activity_segment_boq_items where segment_id in(select id from equipment_activity_segments where equipment_log_id in(select id from equipment_logs where dpr_id=$1)) order by id", [id])).rows;
  evidence.resources[id].allocations = (await pool.query("select * from equipment_activity_allocations where equipment_log_id in(select id from equipment_logs where dpr_id=$1) order by id", [id])).rows;
  assert(evidence.resources[id].equipment_logs.every(row => row.boq_item_id === null));
  await fs.writeFile(`${out}/new-dpr-${id}-final-api.json`, JSON.stringify(await api(`/api/dprs/${id}`), null, 2));
}
const original = evidence.resources[249];
assert.equal(original.dprs[0].dpr_status, "submitted");
assert.equal(original.labour_logs[0].boq_item_id, 13);
assert.equal(original.segments.length, 1);
assert.equal(original.segments[0].start_time, "08:00");
assert.equal(original.segments[0].end_time, "10:00");
assert.equal(original.segmentBoqItems[0].boq_item_id, 13);
assert.equal(original.segmentBoqItems[0].programme_bar_id, 26617);
const meter = original.equipment_logs.find(row => row.operator === "DEV METER VERIFIER");
assert(!meter.start_time && !meter.end_time);
assert.equal(meter.opening_reading, 100);
assert.equal(meter.closing_reading, 102);
for (const id of [249, 250, 252]) {
  const dg = evidence.resources[id].equipment_logs.find(row => row.operator === "DEV GENERAL DG");
  assert.equal(dg.resource_scope, "general");
  assert.equal(dg.boq_item_id, null);
  assert(!evidence.resources[id].segments.some(row => row.equipment_log_id === dg.id));
}
for (const id of [250, 252]) {
  assert(evidence.resources[id].labour_logs.some(row => row.resource_scope === "general" && row.boq_item_id === null));
  assert(evidence.resources[id].material_logs.some(row => row.resource_scope === "general" && row.boq_item_id === null));
}
assert(evidence.resources[251].progress_entries.every(row => row.no_site_work && row.boq_item_id === null));
assert(evidence.resources[251].labour_logs.some(row => row.count === 1 && row.resource_scope === null && row.boq_item_id === null));
evidence.versions = (await pool.query("select * from dpr_versions where original_dpr_id in(249,250) order by id")).rows;
evidence.userBeforeDeactivation = (await pool.query("select id,full_name,is_active,is_admin from users where id=9")).rows;
evidence.assertionsPassed = true;
await fs.writeFile(`${out}/browser-db-evidence.json`, JSON.stringify(evidence, null, 2));
console.log(JSON.stringify({ assertionsPassed: true, oldDprUnchanged: true, newDprIds: evidence.newDprIds, versions: evidence.versions }));
await pool.end();
await close();