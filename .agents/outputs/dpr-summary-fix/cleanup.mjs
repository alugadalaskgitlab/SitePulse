import fs from "node:fs/promises";
import {createHash} from "node:crypto";
import {db,save,close,out} from "./browser.mjs";
const {created}=JSON.parse(await fs.readFile(`${out}/seed.json`));
const before=JSON.parse(await fs.readFile(`${out}/before.json`));
const auth=JSON.parse(await fs.readFile("/tmp/dpr-summary-fix-state.json"));
const p=await db();
try{
  await p.query("BEGIN");
  for(const table of ["site_purchases","material_logs","site_material_trips","labour_logs","equipment_logs","progress_entries","dprs","boq_items","boq_projects","sites"])
    await p.query(`delete from ${table} where id=ANY($1::int[])`,[created[table]]);
  await p.query("update user_sessions set logged_out_at=now() where user_id=$1",[auth.userId]);
  await p.query("update user_devices set status='revoked' where user_id=$1",[auth.userId]);
  await p.query("update users set is_active=false,is_admin=false where id=$1",[auth.userId]);
  await p.query("COMMIT");
  const comparison={};
  for(const [table,fingerprint] of Object.entries(before)){
    const {rows}=await p.query(`select * from ${table} where id<=$1 order by id`,[fingerprint.maxId]);
    comparison[table]=createHash("sha256").update(JSON.stringify(rows)).digest("hex")===fingerprint.hash;
  }
  await save("cleanup",{testRecordsRemoved:true,testAccessRevoked:true,existingBusinessRowsUnchanged:comparison});
  await fs.rm("/tmp/dpr-summary-fix-state.json");
  console.log(comparison);
}catch(e){await p.query("ROLLBACK");throw e;}
finally{await p.end();await close();}