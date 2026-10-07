import fs from "node:fs";
import ts from "typescript";
import vm from "node:vm";
import {execFileSync} from "node:child_process";
const dir="reports/perm-03b3";
const read=p=>JSON.parse(fs.readFileSync(p,"utf8"));
const save=(name,x)=>fs.writeFileSync(`${dir}/${name}.json`,JSON.stringify(x,null,2));
const csv=(name,rows)=>fs.writeFileSync(`${dir}/${name}.csv`,[Object.keys(rows[0]),...rows.map(Object.values)].map(r=>r.map(v=>`"${String(v??"").replaceAll('"','""')}"`).join(",")).join("\n"));
const shared=ts.createSourceFile("permissions.ts",fs.readFileSync("shared/permissions.ts","utf8"),ts.ScriptTarget.Latest,true);
const labels={};
function walk(n,fn){fn(n);n.forEachChild(c=>walk(c,fn));}
walk(shared,n=>{if(ts.isVariableDeclaration(n)&&n.name.getText(shared)==="SECTION_LABELS")for(const p of n.initializer.properties)labels[p.name.text]=p.initializer.text;});
const catalogue=read("shared/permission-actions.generated.json");
const calls=[],otherCalls=[];
for(const file of ["server/routes.ts","server/auth-routes.ts"]){
  const ast=ts.createSourceFile(file,fs.readFileSync(file,"utf8"),ts.ScriptTarget.Latest,true);
  walk(ast,n=>{
    if(!ts.isCallExpression(n)||!ts.isIdentifier(n.expression))return;
    const helper=n.expression.text,line=ast.getLineAndCharacterOfPosition(n.getStart()).line+1;
    if(helper==="sendPushToSection")calls.push({file,line,section:n.arguments[0].text});
    else if(["sendPushToAudience","sendPushToRaiser","sendPushToAll","sendPushToUser","sendTestPush"].includes(helper))otherCalls.push({file,line,helper});
  });
}
const extra={
  edit_requests_review:"Edit Request / Edit Request Approved use manager/all audiences, not section Notify.",
  rmc_cube_tests:"Failed cube-test event uses manager audience, not section Notify (API owner plant_production).",
  dashboard:"Push subscription confirmation/test only; not a section activity Notify subscription.",
};
const inventory=Object.keys(catalogue).map(section=>({
  section,label:labels[section],sectionNotify:calls.some(c=>c.section===section),
  callSites:calls.filter(c=>c.section===section).map(c=>`${c.file}:${c.line}`).join("; "),
  otherPush:extra[section]??"",
  classification:calls.some(c=>c.section===section)?"Section-targeted activity push":extra[section]?"Other push, not controlled by this section's Notify":"No section-targeted Notify hook; no additional dedicated push path identified",
}));
csv("push-capability-inventory",inventory);save("push-call-sites",{sectionTargeted:calls,otherHelpers:otherCalls});
// Execute the actual Grant all function bodies in a small state container.
// This verifies bulk-matrix semantics, not screen or notification delivery.
const ui=ts.createSourceFile("UserManagement.tsx",fs.readFileSync("client/src/pages/UserManagement.tsx","utf8"),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const functions={},variables={};
walk(ui,n=>{
  if(ts.isFunctionDeclaration(n)&&["setAllForSection","setAllForGroup","setHubAccess"].includes(n.name?.text))functions[n.name.text]=n.getText(ui);
  if(ts.isVariableDeclaration(n)&&["HUB_ACTIONS","HUB_SECTIONS"].includes(n.name.getText(ui)))variables[n.name.getText(ui)]=`const ${n.getText(ui)};`;
});
let matrix=Object.fromEntries(Object.keys(catalogue).map(k=>[k,Object.fromEntries(["view","create","edit","delete","view_reports","export","approve","notify"].map(a=>[a,false]))]));
const context=vm.createContext({
  SECTION_ACTIONS:Object.fromEntries(Object.entries(catalogue).map(([k,v])=>[k,v.actions])),
  canGrantAction:()=>true,canToggleHub:()=>true,setMatrix:fn=>{matrix=fn(matrix);},
});
vm.runInContext(ts.transpile([...Object.values(variables),...Object.values(functions)].join("\n")),context);
for(const section of Object.keys(catalogue))context.setAllForSection(section,true);
const sectionGrantAllSafe=Object.values(matrix).every(row=>!row.delete&&!row.export&&!row.notify);
for(const row of Object.values(matrix))for(const action of Object.keys(row))row[action]=false;
context.setAllForGroup(Object.keys(catalogue),true);
const groupGrantAllSafe=Object.values(matrix).every(row=>!row.delete&&!row.export&&!row.notify);
if(!sectionGrantAllSafe||!groupGrantAllSafe)throw Error("Grant all unexpectedly set explicit-only actions");
save("grant-all-check",{sectionGrantAllSafe,groupGrantAllSafe,sections:Object.keys(catalogue).length,method:"Executed actual bulk-change function bodies with permissive grant authority in an isolated state container; not browser evidence"});
const before=read(`${dir}/before.json`),after=read(`${dir}/final-integrity.json`);
const integrity={
  before:before.counts,after:after.counts,beforeChecksums:before.checksums,afterChecksums:after.checksums,
  usersUnchanged:before.checksums.users===after.checksums.users,
  permissionsUnchanged:before.checksums.permissions===after.checksums.permissions,
  applicationChanges:execFileSync("git",["diff","--name-only","--","client","server","shared","tests"],{encoding:"utf8"}).trim(),
};
if(!integrity.usersUnchanged||!integrity.permissionsUnchanged||integrity.applicationChanges)throw Error("Unexpected change");
save("integrity",integrity);
const evidence=read(`${dir}/browser-evidence.json`),repeat=read(`${dir}/repeat/browser-evidence.json`);
const failed=r=>r.testResults.flatMap(f=>f.assertionResults.filter(t=>t.status==="failed").map(t=>`${f.name.replace(/^.*?\/(tests\/|client\/)/,"$1")}:${t.fullName}`));
const base=read("/tmp/perm03/isolated-baseline-tests.json"),run=read("/tmp/perm03b3-full.json");
const counts=r=>({files:r.testResults.length,total:r.numTotalTests,passed:r.numPassedTests,failed:r.numFailedTests,skipped:r.numPendingTests});
const b=failed(base),f=failed(run);
const path=n=>n.replace(/^.*?\/(tests\/|client\/)/,"$1");
const tests={baseline:counts(base),current:counts(run),newFailures:f.filter(n=>!b.includes(n)),resolvedBaseline:b.filter(n=>!f.includes(n)),missingFiles:base.testResults.filter(b=>!run.testResults.some(r=>path(r.name)===path(b.name))).map(b=>path(b.name)),testsAddedOrChanged:[]};
save("test-comparison",tests);fs.copyFileSync("/tmp/perm03b3-full.json",`${dir}/full-tests.json`);
const cleanup=read(`${dir}/cleanup.json`),repeatCleanup=read(`${dir}/repeat/cleanup.json`),push=read(`${dir}/push-safety-preflight.json`),grants=read(`${dir}/real-action-grants.json`);
const esc=s=>String(s).replaceAll("&","&amp;").replaceAll("<","&lt;");
const pre=x=>`<pre>${esc(JSON.stringify(x,null,2))}</pre>`;
const details=(s,x)=>`<details><summary>${s}</summary>${pre(x)}</details>`;
const images=[...evidence.filter(e=>e.screenshot&&!e.label.startsWith("work_programme")).map(e=>({...e,prefix:""})),...repeat.filter(e=>e.label?.startsWith("work_programme")).map(e=>({...e,prefix:"repeat/"}))];
const html=`<!doctype html><html><head><meta charset="utf-8"><title>PERM-03B-3 acceptance evidence</title><style>body{font:15px/1.5 system-ui;max-width:1050px;margin:30px auto;padding:24px;color:#173049}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f1f4f7;padding:14px}details{margin:16px 0}img{max-width:100%}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ccc;padding:8px;text-align:left}.warning{background:#fff0cd;padding:16px}</style></head><body>
<h1>PERM-03B-3 — Delete passed; Notify blocked</h1>
<p>No application code, guard, label, section, flag, admin bypass or admin-only route changed. No production operation or publish. No Export/five-key/page-gating acceptance rerun. Tests added/changed: none.</p>
<p>Files added: scripts/permission03b3-browser.mjs, scripts/permission03b3-report.mjs, and reports/perm-03b3/ evidence, screenshots, inventory and checks. Updated .agents/memory/permission-preservation.md with the live Notify safety constraint.</p>
<h2>A — signed-in Delete evidence</h2>
<p>Reused ordinary user 16's approved sign-in without changing password, flags, grants or login timestamp. Created temporary ordinary user 24 for the three sections. User 25 repeated only the Settings check so both screenshots visibly include the mix-link row; first denied screenshot was above that row. Both runs and every cleanup are retained.</p>
<table><tr><th>Section</th><th>Exact DELETE route</th><th>Without Delete</th><th>With Delete</th></tr>
<tr><td>qto_boq</td><td>/api/boq/items/1178</td><td>Control absent; 403</td><td>Control present; 200</td></tr>
<tr><td>work_programme</td><td>/api/boq/projects/16/mix-links/9<br>Repeat: /api/boq/projects/17/mix-links/10</td><td>Control absent; 403</td><td>Control present; 200</td></tr>
<tr><td>project_scope</td><td>/api/boq/scope-segments/18</td><td>Control absent; 403</td><td>Control present; 200</td></tr></table>
<p>A3: user 24 held qto_boq Edit and not Delete. PATCH /api/boq/items/1178 returned 200, changed the saved description to “PERM-03B-3 edited without Delete”, and the reloaded signed-in screen shows it. DELETE on that same record returned 403 before and after that save. The BOQ item is one of the newly guarded routes. API requests were real authenticated requests; no interception or stub responses.</p>
${details("Actual HTTP evidence", [...evidence,...repeat].filter(e=>e.status))}
<h2>B — Notify: NOT CERTIFIED</h2>
<div class="warning"><p>Chosen candidate: site_dprs (DPR Cancelled). B1–B3 were NOT RUN: existing real administrator user 2 has Notify enabled and two stored active subscriptions. Firing the actual event could notify that real person. Clearing their grants, changing their notification flag or detaching their subscriptions would violate the instruction. No fake transport, auth bypass, modified audience or component test has been substituted for delivery.</p>
<p>The same real recipient is eligible for 19 of the 20 section-targeted push keys. The remaining key, site_diesel, is emitted inside the material-receipt event that also sends plant_materials; it is not a safe alternative. No notification event or subscription was created by this batch. The three exercised Delete/edit operations do not call a push sender. B4 is limited to this batch's actions, not a claim that unrelated external activity was monitored.</p></div>
${details("Stored real-user eligibility preflight; send outcome = NOT ATTEMPTED",push)}
<h3>B5 — all 92 sections</h3><p>${calls.length} actual section-targeted call expressions across ${inventory.filter(r=>r.sectionNotify).length} keys. The textual count of 76 includes the import. “Push-capable” here means a section-key Notify hook, not proof of delivery. The other 72 keys have no such hook. Separate audience/raiser pushes also exist; they must not be mislabeled as controlled by the section Notify bit. An action on one screen can notify another section's subscribers; absence of its own hook does not mean that action cannot trigger a different audience.</p>
<table><tr><th>Section</th><th>Activity push classification</th></tr>${inventory.map(r=>`<tr><td>${esc(r.label)}<br><code>${r.section}</code></td><td>${esc(r.classification)}${r.otherPush?`<br>${esc(r.otherPush)}`:""}</td></tr>`).join("")}</table>
${details("Other push helper calls",otherCalls)}
<p>Additional non-section paths: manager/all-audience Edit Request alerts; failed RMC cube-test manager alerts; PI and vendor-bill raiser alerts; subscription confirmation. None were fired. Existing behavior only; no new guards or business investigation.</p>
<h2>Z — integrity, bulk grants, tests and cleanup</h2>${pre(integrity)}
<p>Z2: every ordinary real user has Delete, Export and Notify unticked. The literal “every real user” condition is NOT true: pre-existing administrator user 2 retains its explicit grants. They are unchanged, as required. No grants were cleared to make the result appear compliant.</p>
${details("Existing real-user action rows; zero ordinary-user violations",grants)}
${details("Grant all: actual section/group function bodies, all 92 sections",read(`${dir}/grant-all-check.json`))}
${pre(tests)}<p>Build passed (npm run build). No application source was changed, so no workflow restart was needed. No component test is presented as browser proof.</p>
${details("First run: every temporary row/write",read(`${dir}/writes.json`))}
${details("First run: cleanup IDs and zero remaining rows",cleanup)}
${details("Settings screenshot repeat: every temporary row/write",read(`${dir}/repeat/writes.json`))}
${details("Repeat: cleanup IDs and zero remaining rows",repeatCleanup)}
<p>No temporary push subscription existed. Users, permissions, devices, sessions, site grants, audit entries, projects, items, mix links and draft scope records were removed. Database sequence advancement is not reset. The unrelated PDF outputs regenerated by the full suite were restored byte-for-byte.</p>
<h2>Signed-in screenshots</h2>${images.map(e=>`<details><summary>${esc(e.label)}</summary><img alt="${esc(e.label)}" src="data:image/jpeg;base64,${fs.readFileSync(`${dir}/${e.prefix}${e.screenshot}`).toString("base64")}"></details>`).join("")}
<h2>Unrun and publishing</h2><p>Notify receipt/non-receipt remains blocked for the safety reason above. No production rollout recommendation. Actual Publish/deployment-schema preview not inspected; the Publishing review surface is offered separately. No publish, PERM-04, production rollout, or follow-up task was started.</p></body></html>`;
fs.writeFileSync(`${dir}/status-report.html`,html);
console.log({integrity,tests,sectionPushKeys:inventory.filter(r=>r.sectionNotify).length,callSites:calls.length,otherPushSections:inventory.filter(r=>r.otherPush).length,noDirectPush:inventory.filter(r=>!r.sectionNotify&&!r.otherPush).length});
