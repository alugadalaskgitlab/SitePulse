import assert from "node:assert/strict";
import { api, manifest, saveManifest, signIn, developmentDb, emptyMatrix } from "./permissions03b-runtime.mjs";
const admin = await signIn("administrator");
assert.ok(!manifest.subject, "Do not duplicate fixtures");
const db = await developmentDb();
try {
  if (!manifest.sites) {
  await db.query("BEGIN");
  const sites = (await db.query(
    "insert into sites(name,is_active) values('PERM03B SITE A',1),('PERM03B SITE B',1) returning id,name"
  )).rows;
  const equipment = (await db.query(
    "insert into equipment_master(name,meter_type) values('PERM03B MACHINE A','hours'),('PERM03B MACHINE B','hours') returning id,name"
  )).rows;
  manifest.sites = sites; manifest.equipment = equipment;
  manifest.diesel = []; manifest.usage = []; manifest.maintenance = [];
  for (let i = 0; i < 2; i++) {
    const diesel = (await db.query(
      "insert into diesel_requirements(date,raised_by,total_planned,site_id,author_user_id,remarks) values('2026-10-09','PERM03B',10,$1,$2,'PERM03B fixture') returning id",
      [sites[i].id, manifest.administrator.id]
    )).rows[0];
    await db.query("insert into diesel_requirement_items(requirement_id,equipment_id,equipment_name,planned_qty) values($1,$2,$3,10)",
      [diesel.id, equipment[i].id, equipment[i].name]);
    const usage = (await db.query(
      "insert into equipment_usage(date,equipment_id,destination_site,remarks) values('2026-10-09',$1,$2,'PERM03B fixture') returning id",
      [equipment[i].id, sites[i].name]
    )).rows[0];
    const maintenance = (await db.query(
      "insert into equipment_maintenance_logs(date,equipment_id,event_type,description,source_type,source_record_id) values('2026-10-09',$1,'breakdown','PERM03B fixture','plant_usage',$2) returning id",
      [equipment[i].id, usage.id]
    )).rows[0];
    manifest.diesel.push(diesel); manifest.usage.push(usage); manifest.maintenance.push(maintenance);
  }
  await db.query("COMMIT");
  await saveManifest();
  }
  const permissions = await api(admin, `/api/auth/users/${manifest.administrator.id}/permissions`);
  assert.equal(permissions.status, 200);
  const actualMatrix = emptyMatrix(permissions.body.matrix);
  assert.ok(actualMatrix.diesel_req_view);
  const created = await api(admin, "/api/auth/users", "POST", {
    email: "permissions03b.subject@test.invalid", fullName: "PERM 03B Read-only Subject",
    password: process.env.DEV_VERIFICATION_PASSWORD, permissions: actualMatrix,
    siteAccess: { mode: "selected", siteIds: [manifest.sites[0].id] },
  });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  manifest.subject = { id: created.body.id, email: created.body.email };
  await saveManifest();
  await signIn("subject", admin);
  console.log(JSON.stringify({ fixtures: manifest, login: "normal; subject device approved through API by disposable admin" }));
} catch (error) {
  await db.query("ROLLBACK");
  throw error;
} finally { await db.end(); }
