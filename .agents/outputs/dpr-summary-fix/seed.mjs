import fs from "node:fs/promises";
import {createHash} from "node:crypto";
import {db,save,close} from "./browser.mjs";
const p=await db();
const auth=JSON.parse(await fs.readFile("/tmp/dpr-summary-fix-state.json"));
const created={}, cases={}, before={};
for(const table of ["sites","boq_projects","boq_items","dprs","progress_entries","labour_logs","equipment_logs","site_material_trips","material_logs","site_purchases"]){
  const {rows}=await p.query(`select * from ${table} order by id`);
  before[table]={maxId:Math.max(0,...rows.map(r=>r.id)),hash:createHash("sha256").update(JSON.stringify(rows)).digest("hex")};
}
await save("before",before);
async function insert(table,v){
  const keys=Object.keys(v);
  const {rows:[r]}=await p.query(`insert into ${table}(${keys.join(",")}) values(${keys.map((_,i)=>`$${i+1}`).join(",")}) returning *`,Object.values(v));
  (created[table]??=[]).push(r.id);return r;
}
try{
  await p.query("BEGIN");
  const site=await insert("sites",{name:"SUMMARY CHECK · Development only"});
  const project=await insert("boq_projects",{name:site.name,site_id:site.id,status:"active"});
  const activities=[
    ["Wet Mix Macadam",56.25,"Cum"],["GSB",120,"Cum"],["Clearing",.5,"Ha"],
    ["Diversion",40,"Sqm",true],["Road marking",250,"m"],
  ];
  const items=[];
  for(const [name,,unit] of activities)items.push(await insert("boq_items",{boq_project_id:project.id,description:name,item_name:name,unit,boq_qty:1000,current_qty:1000}));
  const data=[
    ["A",1,false,1],["BE",3,false,2],["C",5,false,5],["D",2,true,0],["NoWork",0,true,0],["Mixed",1,false,0],
  ];
  for(const [n,[label,count,noWork,materials]] of data.entries()){
    const date=`2026-09-${20+n}`;
    const dpr=await insert("dprs",{site:site.name,date,engineer:"Development verification",role:"engineer",dpr_status:"submitted",submitted_at:date+"T18:00:00Z",boq_project_id:project.id,author_user_id:auth.userId,work_type:"road"});
    cases[label]=dpr.id;
    if(label==="Mixed"){
      await insert("site_material_trips",{date,site:site.name,material:"WMM",quantity:12,uom:"MT",supplier:"Development supplier",unloaded_at:"stretch",boq_project_id:project.id});
      await insert("material_logs",{dpr_id:dpr.id,type:"Received",material:"WMM",quantity:8,uom:"MT"});
      await insert("equipment_logs",{dpr_id:dpr.id,machine:"Water tanker",water_quantity:4000,diesel:0,usage_status:"working"});
      await insert("site_purchases",{dpr_id:dpr.id,item_description:"Safety gloves",vendor:"Development vendor",quantity:6,uom:"Pairs",amount:987654.32});
    }
    for(let i=0;i<count;i++){
      const [activity,quantity,uom,incidental]=activities[i];
      await insert("progress_entries",{dpr_id:dpr.id,activity,quantity,uom,boq_item_id:items[i].id,quantity_source:"measured",is_incidental:!!incidental});
    }
    if(noWork)await insert("progress_entries",{dpr_id:dpr.id,activity:"No-work excluded marker",no_site_work:true,no_site_work_description:"No site work at this reach"});
    await insert("equipment_logs",{dpr_id:dpr.id,machine:"Development machine",hours_worked:1,diesel:2,diesel_source:"contractor",usage_status:"working"});
    await insert("labour_logs",{dpr_id:dpr.id,category:"Skilled",count:2});
    const receipts=[["WMM",5,141.03,"MT"],["Soil",3,60,"MT"],["Sand",2,12,"Cum"],["Stone",1,22,"MT"],["Aggregate",4,30,"MT"]];
    for(const [material,trips,total,uom] of receipts.slice(0,materials)){
      for(let i=0;i<trips;i++)await insert("site_material_trips",{date,site:site.name,material,quantity:total/trips,uom,supplier:"Development supplier",unloaded_at:"stretch",boq_project_id:project.id});
    }
  }
  await p.query("COMMIT");
  await save("seed",{created,cases,site:site.name});
  console.log(cases);
}catch(e){await p.query("ROLLBACK");throw e;}
finally{await p.end();await close();}