// Explicit maintenance command, never imported by the application or its seed.
import pg from "pg";
import fs from "node:fs";
import crypto from "node:crypto";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";

export const verificationGrants = {
  site_materials: ["view", "create", "edit"],
  work_programme: ["view", "edit"],
  work_programme_review: ["view", "edit"],
  planning_masters: ["view"],
  vendor_bills: ["view", "create", "edit"],
  vendor_bills_raise: ["view", "create", "edit"],
  vendor_bills_view: ["view"],
  master_parties: ["view"],
};
const hash = value => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
export async function restoreVerificationGrants(client) {
  const database = (await client.query("select current_database() name")).rows[0].name;
  assert.equal(database, "sitelog_dev", "Refusing non-development database");
  console.log(`Before writes: current_database() = ${database}`);
  await client.query("BEGIN");
  try {
    const user = (await client.query(`select id,email,full_name,is_admin,is_owner,is_field_engineer,can_manage_permissions
      from users where id=16 for update`)).rows[0];
    assert.equal(user?.email, "agent.verification@test.invalid");
    assert.equal(user.full_name, "Agent Verification");
    for (const key of ["is_admin","is_owner","is_field_engineer","can_manage_permissions"]) assert.equal(user[key],false,key);
    const snapshot = async () => {
      const users = (await client.query("select * from users order by id")).rows;
      const permissions = (await client.query("select * from user_permissions order by id")).rows;
      return {users:{count:users.length,checksum:hash(users)},permissions,
        realUsersChecksum:hash(users.filter(r=>r.id!==16)),
        realPermissionsChecksum:hash(permissions.filter(r=>r.user_id!==16))};
    };
    const before=await snapshot();
    for (const [section,actions] of Object.entries(verificationGrants)) {
      await client.query(`insert into user_permissions (user_id,section_key,can_view,can_create,can_edit)
        values (16,$1,$2,$3,$4) on conflict (user_id,section_key) do update set
        can_view=excluded.can_view,can_create=excluded.can_create,can_edit=excluded.can_edit
        where (user_permissions.can_view,user_permissions.can_create,user_permissions.can_edit)
        is distinct from (excluded.can_view,excluded.can_create,excluded.can_edit)`,
        [section,...["view","create","edit"].map(a=>actions.includes(a))]);
    }
    await client.query(`update user_permissions set can_delete=false,can_export=false,can_notify=false
      where user_id=16 and (can_delete or can_export or can_notify)`);
    const after=await snapshot();
    assert.deepEqual(after.users,before.users);
    assert.equal(after.realUsersChecksum,before.realUsersChecksum);
    assert.equal(after.realPermissionsChecksum,before.realPermissionsChecksum);
    const summarize = s => ({users:s.users,permissions:{count:s.permissions.length,checksum:hash(s.permissions)},
      realUsersChecksum:s.realUsersChecksum,realPermissionsChecksum:s.realPermissionsChecksum,
      accountPermissions:s.permissions.filter(r=>r.user_id===16)});
    const changed=after.permissions.filter(r=>JSON.stringify(r)!==JSON.stringify(before.permissions.find(b=>b.id===r.id)))
      .map(r=>({id:r.id,before:before.permissions.find(b=>b.id===r.id)??null,after:r}));
    assert(changed.every(r=>r.after.user_id===16));
    await client.query("COMMIT");
    return {database,flags:Object.fromEntries(["is_admin","is_owner","is_field_engineer","can_manage_permissions"].map(k=>[k,user[k]])),
      before:summarize(before),after:summarize(after),changed};
  } catch(error) {await client.query("ROLLBACK");throw error;}
}
if (process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  if (!process.env.DEV_DATABASE_URL) throw Error("Development connection missing");
  const client=new pg.Client({connectionString:process.env.DEV_DATABASE_URL});
  await client.connect();
  try {
    const result=await restoreVerificationGrants(client);
    fs.mkdirSync("reports/dev-acct02",{recursive:true});
    fs.writeFileSync("reports/dev-acct02/permissions.json",JSON.stringify(result,null,2));
    console.log("Changed permission row IDs:",result.changed.map(r=>r.id));
  } finally {await client.end();}
}
