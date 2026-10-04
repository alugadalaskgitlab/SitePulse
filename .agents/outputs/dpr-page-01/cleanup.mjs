import fs from "node:fs/promises";
import {createHash} from "node:crypto";
import {db,save,close,api} from "./browser.mjs";
const seed=JSON.parse(await fs.readFile(".agents/outputs/dpr-page-01/seeded-records.json"));
const auth=JSON.parse(await fs.readFile("/tmp/dpr-page-01-state.json"));
const before=JSON.parse(await fs.readFile(".agents/outputs/dpr-page-01/preexisting-fingerprints.json"));
const p=await db();
try{
  await p.query("BEGIN");
  // Startup migration can post freshly seeded Plant Stock rows. Undo exactly
  // these test references, restoring their net effect, never historical rows.
  const ledger=(await p.query("select * from stock_ledger where transaction_type='dpr_equipment_usage' and reference_id=ANY($1::int[]) for update",[seed.created.equipment_logs.map(id=>-id)])).rows;
  for(const row of ledger){
    const balances=await p.query("select id from stock_balances where material_id=$1 and party_id is not distinct from $2 for update",[row.material_id,row.party_id]);
    if(balances.rows.length!==1)throw Error("Ambiguous test ledger balance");
    await p.query("update stock_balances set balance=balance+$1 where id=$2",[Number(row.quantity_out)-Number(row.quantity_in),balances.rows[0].id]);
    await p.query("delete from stock_ledger where id=$1",[row.id]);
  }
  await p.query("delete from equipment_usage where source_usage_id=ANY($1::int[])",[seed.created.equipment_usage]);
  for(const table of ["equipment_activity_segment_boq_items","equipment_activity_segments","equipment_logs","equipment_usage","progress_entries","labour_logs","site_material_trips","dprs","work_program_bars","boq_items","boq_projects","equipment_master","sites"]){
    await p.query(`delete from ${table} where id=ANY($1::int[])`,[seed.created[table]??[]]);
  }
  await p.query("update user_sessions set logged_out_at=now() where user_id=$1",[auth.userId]);
  await p.query("update user_devices set status='revoked' where user_id=$1",[auth.userId]);
  await p.query("update users set is_active=false,is_admin=false where id=$1",[auth.userId]);
  await p.query("COMMIT");
  const comparison={};
  for(const [table,fingerprint] of Object.entries(before)){
    const {rows}=await p.query(`select * from ${table} where id<=$1 order by id`,[fingerprint.maxId]);
    comparison[table]=createHash("sha256").update(JSON.stringify(rows)).digest("hex")===fingerprint.hash;
  }
  await save("cleanup",{removedSeedData:true,testAccountDisabled:true,testDevicesRevoked:true,testSessionsRevoked:true,testLedgerEntriesRemoved:ledger.length,testLedgerNetRestored:ledger.reduce((n,r)=>n+Number(r.quantity_out)-Number(r.quantity_in),0),preexistingRowsUnchanged:comparison});
  console.log(comparison);
  await fs.rm("/tmp/dpr-page-01-state.json");
}catch(e){await p.query("ROLLBACK");throw e;}
finally{await p.end();await close();}