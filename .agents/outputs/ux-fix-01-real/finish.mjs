import assert from "node:assert/strict";
import fs from "node:fs/promises";
import {createHash} from "node:crypto";
import {api,db,save,close,out} from "./browser.mjs";
const pool=await db();
const state=JSON.parse(await fs.readFile("/tmp/ux-fix-01-state.json","utf8"));
const load=async n=>JSON.parse(await fs.readFile(`${out}/${n}.json`,"utf8"));
const evidence={database:"sitelog_dev",testUserId:state.userId,newDprIds:[254,255,256,257,258,259,260],cases:[],limitations:[]};
try {
  const oldBefore=await load("legacy-246-before");
  const oldAfter={};
  for(const t of Object.keys(oldBefore)) {
    let query;
    if(t==="junction")query="select * from equipment_activity_segment_boq_items where segment_id in(select id from equipment_activity_segments where equipment_log_id in(select id from equipment_logs where dpr_id=246)) order by id";
    else if(["equipment_activity_allocations","equipment_activity_segments"].includes(t))query=`select * from ${t} where equipment_log_id in(select id from equipment_logs where dpr_id=246) order by id`;
    else query=`select * from ${t} where ${t==="dprs"?"id":"dpr_id"}=246 order by id`;
    oldAfter[t]=(await pool.query(query)).rows;
  }
  await save("legacy-246-after",oldAfter);
  assert.deepEqual(JSON.parse(JSON.stringify(oldAfter)),oldBefore);
  const detailBefore=await load("legacy-246-detail-before");
  const detailAfter=await api("/api/dprs/246");await save("legacy-246-detail-after",detailAfter);
  assert.deepEqual(detailAfter,detailBefore);
  evidence.legacy246={databaseEqual:true,detailApiEqual:true,segmentJunctionEqual:true,detailSha256:createHash("sha256").update(JSON.stringify(detailBefore)).digest("hex"),writes:0};
  const initial=await load("A-B-initial");assert.equal(initial.start,"");assert.equal(initial.end,"");assert(initial.text.includes("Working"));
  const fresh=await load("D-fresh-autofill-complete");assert.equal(fresh.opening,fresh.closing);assert.equal(fresh.diesel,"0");assert.equal(fresh.rows,0);
  const noStoppage=(await load("D-breakdown-without-stoppage-api")).body;assert.equal(noStoppage.equipment[0].breakdowns.length,0);
  const stoppage=(await load("D-stoppage-saved-api")).body.equipment[0].breakdowns[0];
  assert.equal(stoppage.fromTime,"09:00");assert.equal(stoppage.toTime,"10:30");assert.equal(stoppage.responsibility,"vendor");assert.equal(stoppage.repairScope,"hlc");assert.equal(stoppage.debitableToVendor,true);assert(stoppage.attachment.objectPath);
  assert.equal((await load("F-blank-labour-api")).body.labour.length,0);
  const f=(await load("F-task-only-ui-fixed")).text;assert(f.startsWith("Failed to save report\nEnter the number of workers"));assert(!f.includes("Expected number"));
  const h=await load("H-one-tap-focus");assert.equal(h.count,1);assert.equal(h.active,"input-labour-worker-0-0");
  const g=(await load("G-H-saved-api")).body.labour[0];assert.equal(g.count,2);assert.equal(g.hours,4);assert.deepEqual(g.workerNames,["UX Worker Alpha","UX Worker Beta"]);
  const i=await load("I-unsaved-dialog");assert.equal(i.length,1);assert.equal(i[0].message,"Discard changes?");assert.deepEqual(await load("I-nochanges-dialog-events"),i);
  assert.equal((await load("C-legacy-editor-view-only-ui")).chip,"Not recorded");
  const e=await load("E-exact-task-reopened-ui");assert.equal(e.task,"UX EXACT EDITED TASK ROUND TRIP");assert.equal(e.hours,"5");
  for(const n of ["J-guided-equipment-ui","J-edit-equipment-ui"]){const r=await load(n);assert.equal(r.status,"Working");assert.equal(r.start,"");assert.equal(r.end,"");assert(r.text.includes("Task / work done"));}
  for(const n of ["J-guided-labour-rule-ui","J-edit-labour-rule-ui"])assert((await load(n)).text.includes("Enter the number of workers"));
  evidence.hoursTransport=[];
  for(const [stage,n,expected] of [
    ["create","hours-create-response",3.5],["draft PATCH","hours-draft-patch-response",5],
    ["section save/reopen","G-H-saved-api",4],["guided submit","hours-submit-api",4],
    ["edit-as-copy","hours-dpr-255",4],["clone (detail reread)","transport-final-256",4],
    ["Detailed submit","hours-257-submit-api",5],["second edit-as-copy","E-exact-task-edit-copy-api",5]
  ]) {
    const r=await load(n);assert.equal(r.body.labour[0].hours,expected);
    evidence.hoursTransport.push({stage,dprId:r.body.id,hours:expected,status:r.status,evidence:`${n}.json`});
  }
  const current=(await api("/api/dprs/258")).body;
  const bounds=[];
  for(const hours of [0.25,24.5]) {
    const r=await api("/api/dprs/258/draft",{...current,labour:current.labour.map(l=>({...l,hours}))},"PATCH");
    bounds.push({hours,...r});assert.equal(r.status,400);
  }
  await save("hours-bounds-api",bounds);
  assert.deepEqual((await api("/api/dprs/258")).body,current);
  const site=(await pool.query("select id,name from sites where lower(trim(name))=lower($1)",["THAKADPALLY - SIRUR"])).rows[0];
  assert(site);
  await pool.query("insert into user_permissions(user_id,section_key,can_view,can_create,can_edit) values($1,'site_dprs',true,true,true) on conflict(user_id,section_key) do update set can_view=true,can_create=true,can_edit=true",[state.userId]);
  await pool.query("insert into user_site_access(user_id,site_id,access_level) values($1,$2,'full') on conflict(user_id,site_id) do nothing",[state.userId,site.id]);
  await pool.query("update users set is_admin=false,all_sites_access=false,setup_complete=true where id=$1",[state.userId]);
  try {
    const allowed=await api("/api/dprs/labour-contractors?site="+encodeURIComponent(site.name));
    const denied=await api("/api/dprs/labour-contractors?site="+encodeURIComponent("UX Verification Other Site "+state.userId));
    const missingSite=await api("/api/dprs/labour-contractors");
    await save("contractor-authorization",{allowed,denied,missingSite,permittedSite:site.name,testUserId:state.userId});
    assert.equal(allowed.status,200);assert.equal(denied.status,403);assert.equal(missingSite.status,400);
    assert(!allowed.body.includes("UX Other Site Only "+state.userId));
    evidence.contractorAuthorization={allowed:200,denied:403,missingSite:400};
  } finally {await pool.query("update users set is_admin=true where id=$1",[state.userId]);}
  evidence.resources={};
  for(const id of evidence.newDprIds) {
    const r=await api(`/api/dprs/${id}`);await save(`final-dpr-${id}`,r);
    evidence.resources[id]={};
    for(const table of ["dprs","equipment_logs","labour_logs","progress_entries","material_logs","dpr_draft_stoppages"]) {
      const query=table==="dpr_draft_stoppages"
        ? "select * from dpr_draft_stoppages where equipment_log_id in(select id from equipment_logs where dpr_id=$1) order by id"
        : `select * from ${table} where ${table==="dprs"?"id":"dpr_id"}=$1 order by id`;
      evidence.resources[id][table]=(await pool.query(query,[id])).rows;
    }
  }
  evidence.versions=(await pool.query("select * from dpr_versions where original_dpr_id in(254,257) order by id")).rows;
  evidence.cases=[
    {case:"A",result:"PASS",summary:"Real section editor: new hired JCB, Working, Task beside Status, both calculated quantities in readings row, General below work editor; desktop and 390px mobile screenshots.",screenshots:["A-desktop","A-mobile"]},
    {case:"B",result:"PASS",summary:"Machine selection left both clock inputs blank. Empty-time draft saved ready; entering only 08:00 produced end time required readiness. Start/end remain mandatory as a pair.",screenshots:["B-save-empty-times","B-start-without-end"]},
    {case:"C",result:"PASS",summary:"DPR246 was viewed only, including opening its editable renderer without changing/saving anything. Null-status chip and in-card select showed Not recorded. Complete detail API, DB baseline and segment/BOQ junction equal before/after.",screenshots:["C-legacy-null-status-not-recorded","C-legacy-246-readonly"]},
    {case:"D",result:"PASS",summary:"Fresh Breakdown row: closing equals opening, diesel zero, no clock defaults and no stoppage created. Save without daily status reason rejected with exact Enter the breakdown reason. Explicitly added stoppage, 09:00–10:30 / 1.5 h, reason/vendor/HLC/deduct/photo/remarks; draft save/reopen preserved fields and attachment metadata.",screenshots:["D-fresh-autofill-complete","D-required-status-reason","D-stoppage-fields-before-save","D-stoppage-reopened"]},
    {case:"E",result:"PASS",summary:"Saved test DPR257 incidental text rendered in Task field. True UI edit-as-copy to DPR260 persisted exact new text in equipment_logs.task and reopened identically. No historic task was overwritten.",screenshots:["E-saved-incidental-new-task-box","E-exact-task-reopened"]},
    {case:"F",result:"PASS AFTER FIX",summary:"Added blank labour row, Save & return succeeded and no labour row persisted. Task-only row showed required count. Initial raw Zod toast was reported; after owning agent fix/restart, real retest produced exact Enter the number of workers toast/banner.",screenshots:["F-blank-save-return","F-task-count-required-fixed"]},
    {case:"G",result:"PASS",summary:"Direct / local hire, Count2, Hours4 saved/reopened; submitted Site Report showed 4 h. Historical DPR248 labour Hours cell was empty, matching NULL DB storage.",screenshots:["G-H-labour-hours-input","G-H-reopened","G-site-report-hours","G-legacy-hours-blank"]},
    {case:"H",result:"PASS",summary:"One real click opened one empty worker box with actual activeElement focus; added two names, saved and reopened; names identical in detail API.",screenshots:["H-one-tap-focus","G-H-reopened"]},
    {case:"I",result:"PASS",summary:"Unsaved Cancel emitted native Discard changes? confirmation (recorded CDP dialog event), accepted and returned without save. Fresh unchanged section Cancel returned directly, with no additional dialog.",screenshots:["I-discarded-back-to-sections","I-clean-cancel-sections"]},
    {case:"J",result:"PASS",summary:"Guided and Detailed Edit new equipment both Working with blank times and moved Task; task-only labour rejected with plain-English count message. Guided blank-row draft PATCH and edit-as-copy dropped blank labour, retaining saved Hours.",screenshots:["J-guided-new-equipment","J-guided-labour-rule","J-edit-new-equipment","J-edit-labour-rule"]}
  ];
  evidence.limitations=[
    "Browser navigation, selection, click, typing, cancel, saving, reopening and submissions were real Chromium interactions, with real authenticated APIs and PostgreSQL; no fixtures/stubs/auth bypass. Native time controls used DOM-native value setter plus bubbling input/change after real focus because CDP segmented keyboard entry did not work; the resulting application validation and writes were real.",
    "Create-with-hours, clone, invalid hours bounds, contractor authorization and supplemental transport assertions were API/DB checks, explicitly not claimed as standalone browser cases. Edit-as-copy, draft saving, submit and reopen were additionally exercised in UI.",
    "No old submitted Breakdown-with-empty-reason record exists in development (read-only query found none). Historical null-status DPR246 report/editor read was not gated. Direct helper non-DPR parity and full-suite test K are the owning agent's responsibility.",
    "Draft stoppage attachment metadata round-tripped. On submission, stoppages convert to maintenance-backed rows and the detail API no longer includes attachment metadata in the same breakdown object; edit-as-copy subsequently rehomes the maintenance relationship. This was observed, not changed or asserted as a UX regression.",
    "New development records and uploaded screenshot-as-test-photo remain for the owning agent's evidence/cleanup decision; only test user/browser/profile credentials were cleaned up. No production writes/publication or product-file edits."
  ];
  evidence.assertionsPassed=true;
} finally {
  // Deactivate only the newly minted test account, even after test failures.
  await pool.query("update users set is_admin=true where id=$1",[state.userId]);
  let deactivation;
  try {deactivation=await api(`/api/auth/users/${state.userId}`,{isActive:false},"PATCH");} catch(err) {deactivation={error:err.message};}
  await pool.query("update users set is_active=false where id=$1",[state.userId]);
  await pool.query("update user_sessions set logged_out_at=coalesce(logged_out_at,now()) where user_id=$1",[state.userId]);
  await pool.query("update user_devices set status='revoked',revoked_at=now() where user_id=$1",[state.userId]);
  const row=(await pool.query("select id,is_active from users where id=$1",[state.userId])).rows[0];
  await save("test-account-deactivation",{apiStatus:deactivation.status,user:row,devicesRevoked:true});
  evidence.cleanup={testUserInactive:!row.is_active,devicesRevoked:true};
  await save("verification-results",evidence);
  await pool.end();await close();
}