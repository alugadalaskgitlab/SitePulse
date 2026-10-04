// Isolated DEVELOPMENT records only. No existing business rows are updated.
import fs from "node:fs/promises";
import {createHash} from "node:crypto";
import {db,save,close} from "./browser.mjs";
const p=await db();
const state=JSON.parse(await fs.readFile("/tmp/dpr-page-01-state.json","utf8"));
const created={};
const tables=["sites","boq_projects","boq_items","work_program_bars","dprs","progress_entries","equipment_master","equipment_logs","equipment_activity_segments","equipment_activity_segment_boq_items","labour_logs","site_material_trips"];
const fingerprint=async table=>{
  const {rows}=await p.query(`select * from ${table} order by id`);
  return {maxId:Math.max(0,...rows.map(r=>r.id)),hash:createHash("sha256").update(JSON.stringify(rows)).digest("hex")};
};
const before={};
for(const t of tables) before[t]=await fingerprint(t);
await save("preexisting-fingerprints",before);
async function insert(table,values){
  const columns=Object.keys(values);
  const {rows:[row]}=await p.query(`insert into ${table}(${columns.join(",")}) values(${columns.map((_,i)=>`$${i+1}`).join(",")}) returning *`,Object.values(values));
  (created[table]??=[]).push(row.id);return row;
}
try{
  await p.query("BEGIN");
  const site="DPR PAGE DEVELOPMENT · ALLADURG ROAD";
  const siteRow=await insert("sites",{name:site});
  const project=await insert("boq_projects",{name:site,site_id:siteRow.id,start_date:"2026-09-01",total_months:3,status:"active"});
  const item=await insert("boq_items",{boq_project_id:project.id,description:"Wet Mix Macadam",item_name:"Wet Mix Macadam",display_name:"Wet Mix Macadam",unit:"Cum",canonical_unit:"m3",boq_qty:900,current_qty:900});
  const excavation=await insert("boq_items",{boq_project_id:project.id,description:"Excavation",unit:"Cum",canonical_unit:"m3",boq_qty:900,current_qty:900,dpr_conversion_factor:2});
  const bar=await insert("work_program_bars",{boq_project_id:project.id,boq_item_id:item.id,reach_label:"Reach 1",chainage_from:0,chainage_to:1.6,start_month:.8,end_month:1,start_date:"2026-09-25",end_date:"2026-09-30",planned_qty:900});
  const report=async(date,remarks="")=>insert("dprs",{date,site,engineer:"Development verification",role:"engineer",dpr_status:"submitted",submitted_at:date+"T18:00:00Z",boq_project_id:project.id,author_user_id:state.userId,remarks,work_type:"road"});
  const prior=await report("2026-09-29");
  const progress=async(dprId,qty,extra={})=>insert("progress_entries",{dpr_id:dprId,activity:"Wet Mix Macadam",boq_item_id:item.id,programme_bar_id:bar.id,chainage_from:"0+280",chainage_to:"0+380",chainage_from_km:.28,chainage_to_km:.38,length:100,width:3.75,thickness:.15,quantity:qty,uom:"Cum",side:"full",quantity_source:"measured",...extra});
  await progress(prior.id,355.75);
  const main=await report("2026-10-02");
  await progress(main.id,56.25);
  const machines=[
    ["Soil Compactor","TS08JG4572","Nafeez","Ramesh",2594.4,2595.5,1.1,"09:50","17:13",20,54,62.5,9,9.9],
    ["Tractor – Ratnam","0930","Ratnam","Yovan",5193.3,5196.4,3.1,"09:56","18:10",5,10,10,4,12.4],
    ["Tractor Dozer","TS34TA8581","Mahipal","Nagesh",8819.1,8820.5,1.4,"14:40","17:30",17,2,15,2.5,3.5],
  ];
  const masters=[];
  for(const [name,reg,vendor,operator,opening,closing,hours,start,end,diesel,tank0,tank1,norm,expected] of machines){
    const master=await insert("equipment_master",{name,registration_number:reg,ownership:"hired",vendor_name:vendor,meter_type:"hour_meter",consumption_norm:norm});
    masters.push(master);
    const log=await insert("equipment_logs",{dpr_id:main.id,machine:name,vehicle_no:reg,operator,equipment_id:master.id,opening_reading:opening,closing_reading:closing,hours_worked:hours,start_time:start,end_time:end,diesel,opening_diesel:tank0,diesel_balance_in_tank:tank1,diesel_balance_confirmed:true,diesel_norm:norm,expected_diesel:expected,diesel_source:"plant_stock",usage_status:"working",entry_type:"monthly",task:"Compacting WMM lift",boq_item_id:item.id});
    const segment=await insert("equipment_activity_segments",{equipment_log_id:log.id,start_time:start,end_time:end,hours_worked:hours});
    await insert("equipment_activity_segment_boq_items",{segment_id:segment.id,boq_item_id:item.id});
  }
  for(const name of ["Machender","Samson"])await insert("labour_logs",{dpr_id:main.id,category:"Unskilled",gender:"Male",count:1,contractor:name,task:"WMM"});
  for(let i=0;i<5;i++)await insert("site_material_trips",{date:"2026-10-02",site,material:"WMM",supplier:"Saravana",quantity:i===4?29.03:28,uom:"MT",unloaded_at:"stretch",boq_project_id:project.id,notes:"DPR PAGE DEVELOPMENT verification only"});
  const edge=await report("2026-10-03","Rain delayed the afternoon shift.");
  await progress(edge.id,56.25,{programme_bar_id:null});
  await progress(edge.id,847.552,{activity:"Excavation",boq_item_id:excavation.id,programme_bar_id:null,uom:"Cft",material_outcome:"reused_on_site",reusable_qty:8});
  for(const [i,diesel] of [11.5,8.8,10.8].entries())await insert("equipment_logs",{dpr_id:edge.id,machine:`Norm test ${i+1}`,opening_reading:100,closing_reading:101,hours_worked:1,diesel,diesel_norm:10,expected_diesel:10,diesel_source:"direct_purchase",usage_status:"working"});
  await insert("equipment_logs",{dpr_id:edge.id,machine:"Missing closing",opening_reading:100,diesel:10,diesel_norm:10,expected_diesel:10,usage_status:"working"});
  for(const status of ["idle_no_work","breakdown"])await insert("equipment_logs",{dpr_id:edge.id,machine:status==="breakdown"?"Breakdown machine":"Idle machine",usage_status:status,usage_status_reason:status==="breakdown"?"Hydraulic repair":"Rain stopped work",diesel:0,hours_worked:0});
  const vehicle=await insert("equipment_master",{name:"Tipper",meter_type:"odometer",ownership:"owned",consumption_norm:.2});
  await insert("equipment_logs",{dpr_id:edge.id,machine:"Tipper",equipment_id:vehicle.id,opening_reading:84320,closing_reading:84402,total_km:82,diesel:18,expected_diesel:16.4,diesel_norm:.2,diesel_source:"direct_purchase",usage_status:"working"});
  await insert("labour_logs",{dpr_id:edge.id,category:"Skilled",count:2,hours:7.5,task:"Drain work"});
  await insert("labour_logs",{dpr_id:edge.id,category:"Unskilled",count:1});
  await insert("site_material_trips",{date:"2026-10-03",site,material:"WMM",supplier:"Saravana",quantity:30,uom:"MT",unloaded_at:"yard",boq_project_id:project.id,notes:"DPR PAGE DEVELOPMENT verification only"});
  await p.query("COMMIT");
  await save("seeded-records",{developmentOnly:true,site,projectId:project.id,barId:bar.id,boqItemId:item.id,mainId:main.id,edgeId:edge.id,created});
  console.log({mainId:main.id,edgeId:edge.id,projectId:project.id,barId:bar.id});
}catch(e){await p.query("ROLLBACK");throw e;}
finally{await p.end();await close();}