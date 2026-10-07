import fs from "node:fs";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import ts from "typescript";
import {execFileSync} from "node:child_process";
const dir="reports/perm-prod01";
const read=name=>JSON.parse(fs.readFileSync(`${dir}/${name}.json`,"utf8"));
const save=(name,value)=>fs.writeFileSync(`${dir}/${name}.json`,JSON.stringify(value,null,2));
const before=read("before"),after=read("after"),final=read("final"),original=read("original"),second=read("second");
assert.deepEqual(after,second);
assert.deepEqual(original.flags,final.flags);
assert.deepEqual(original.permissions,final.permissions);
assert.deepEqual(before.flags,after.flags);
const changes=[];
for(const row of before.permissions){
 const updated=after.permissions.find(p=>p.id===row.id);assert(updated,"No row may be removed");
 const changed=Object.keys(row).filter(k=>JSON.stringify(row[k])!==JSON.stringify(updated[k]));
 if(changed.length){assert.deepEqual(changed,["can_view"]);assert.equal(row.can_view,false);assert.equal(updated.can_view,true);changes.push({kind:"updated",before:row,after:updated});}
}
for(const row of after.permissions.filter(p=>!before.permissions.some(b=>b.id===p.id))){
 for(const[k,v]of Object.entries(row).filter(([k])=>k.startsWith("can_")))assert.equal(v,k==="can_view",`Unexpected ${k}`);
 changes.push({kind:"inserted",before:null,after:row});
}
const fixtures=read("fixtures");
const empty=fixtures.accounts.find(a=>a.label==="none").id;
assert.equal(after.permissions.filter(p=>p.user_id===empty).length,0);
const audit=read("audit-api").data;
assert.equal(changes.length,audit.changedRows);
assert.equal(changes.length,audit.changes.length);
assert(Object.values(read("cleanup").remaining).every(n=>n===0));
const hash=x=>crypto.createHash("sha256").update(JSON.stringify(x)).digest("hex");
save("row-changes",changes);
save("integrity",{existingUsersFlagsUnchanged:true,existingPermissionsUnchanged:true,onlyViewAdded:true,nothingUserGainedNothing:true,
 originalPermissions:{count:original.permissions.length,checksum:hash(original.permissions)},
 finalPermissions:{count:final.permissions.length,checksum:hash(final.permissions)},
 beforeFixturePermissions:before.permissions.length,afterFixturePermissions:after.permissions.length,changedRows:changes.length,
 firstToSecondStartupUnchanged:true,retainedDurableAuditRows:audit.changes.length});
const routes=text=>{
 const ast=ts.createSourceFile("routes.ts",text,ts.ScriptTarget.Latest,true),map=new Map();
 const walk=n=>{if(ts.isCallExpression(n)&&ts.isPropertyAccessExpression(n.expression)&&n.expression.expression.getText(ast)==="app"&&["get","post","put","patch","delete"].includes(n.expression.name.text)&&n.arguments[0]&&ts.isStringLiteral(n.arguments[0]))map.set(`${n.expression.name.text}:${n.arguments[0].text}`,n.getText(ast));n.forEachChild(walk);};walk(ast);return map;
};
const old=routes(execFileSync("git",["show","HEAD:server/routes.ts"],{encoding:"utf8",maxBuffer:5e6}));
const now=routes(fs.readFileSync("server/routes.ts","utf8"));
const changedExisting=[...old].filter(([key,body])=>now.get(key)!==body).map(([key])=>key);
assert.deepEqual(changedExisting,[]);
save("route-preservation",{changedExistingRoutes:changedExisting,newRoutes:[...now.keys()].filter(k=>!old.has(k)),adminOnlyRoutesUnchanged:true});
const baseline=JSON.parse(fs.readFileSync("reports/perm-03b2/full-tests.json","utf8"));
const suite=JSON.parse(fs.readFileSync("/tmp/permprod01-full.json","utf8"));
const path=n=>n.replace(/^.*?\/(tests\/|client\/)/,"$1");
const failures=r=>r.testResults.flatMap(f=>f.assertionResults.filter(t=>t.status==="failed").map(t=>`${path(f.name)}:${t.fullName}`));
const counts=r=>({files:r.testResults.length,total:r.numTotalTests,passed:r.numPassedTests,failed:r.numFailedTests,skipped:r.numPendingTests});
const bf=failures(baseline),cf=failures(suite);
const comparison={baseline:counts(baseline),current:counts(suite),newFailures:cf.filter(f=>!bf.includes(f)),resolvedBaseline:bf.filter(f=>!cf.includes(f)),missingBaselineFiles:baseline.testResults.filter(f=>!suite.testResults.some(t=>path(t.name)===path(f.name))).map(f=>path(f.name))};
save("test-comparison",comparison);fs.copyFileSync("/tmp/permprod01-full.json",`${dir}/full-tests.json`);
const esc=s=>String(s).replaceAll("&","&amp;").replaceAll("<","&lt;");
const detail=(title,data)=>`<details><summary>${esc(title)}</summary><pre>${esc(JSON.stringify(data,null,2))}</pre></details>`;
const shots=["verification-signin","create-before","create-after","audit-screen"];
const html=`<!doctype html><html><head><meta charset="utf-8"><title>PERM-PROD-01 access preservation</title><style>body{font:16px/1.5 system-ui;max-width:1080px;margin:30px auto;padding:20px;color:#183244}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ccc;padding:8px;text-align:left}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f2f5f7;padding:14px}details{margin:18px 0}img{width:100%}.notice{background:#fff2d1;padding:16px}</style></head><body>
<h1>PERM-PROD-01 — one-time additive access preservation</h1>
<p>Implemented and exercised only in development. No production database connection was requested, read or used, and nothing was published. This is a single startup migration, not a recurring repair job.</p>
<h2>Rule and completion</h2>
<p>For non-admin/non-owner users, add View on sections with a live View gate when any existing Create, Edit, Delete, Reports, Export or Approve bit is true. Notify alone never qualifies. Preserve every other bit exactly. Then carry View from the old source sections to the five split keys. Never apply role templates, change flags or modify any existing guard or route.</p>
<p>The migration runs before routes begin serving. One transaction contains all grants, one durable settings row per audit change, and the completion marker. A transaction-scoped advisory lock and table locks serialize first-run concurrency. Any failure rolls back; a successful commit prevents future reruns. Later starts execute just one marker SELECT and return without acquiring a connection for a transaction or scanning users/permissions. No rerun endpoint, button or flag exists.</p>
<p>Audit rows intentionally use dedicated app_settings keys, not the generic signed-in transaction-audit endpoint, to avoid exposing permission grants through that existing endpoint. No new table or schema change.</p>
<h2>Carry-forward map</h2>
<table><tr><th>Existing View</th><th>New View</th></tr>${audit.mapping.map(m=>`<tr><td>${esc(m.source)}</td><td>${esc(m.target)}</td></tr>`).join("")}</table>
<p>Derived/cross-checked against the finished reports/perm-03b2/key-page-map.csv, qto-reference-disposition.csv and status-report.html. The historical source of Edit Requests is confirmed by the original PERM-03 Part D3 instruction and the recorded split in scripts/permission-delegation-migration.ts; that old script is NOT run or imported. Shared BOQ/scope reads remain unchanged. The generated live-action catalogue limits A2 to its 88 live View keys, excluding dead View cells.</p>
<h2>Ten newly gated pages — development counts</h2>
<p>Counts exclude admins/owners and describe stored ordinary-user View grants at migration time, not production. Each page needed zero new grants; each already had four ordinary users with View. Thus all ten have zero affected users, but none has zero users with access. No blanket signed-in access was granted.</p>
<table><tr><th>Page</th><th>Section</th><th>Users granted View</th><th>Users with View after</th></tr>${audit.pageSummary.map(p=>`<tr><td>${esc(p.page)}</td><td>${esc(p.section)}</td><td>${p.usersGranted}</td><td>${p.usersWithAccess}</td></tr>`).join("")}</table>
<h2>C1–C6: development proof</h2>
<p>Ordinary verification account 16 signed in with its existing development secret; no password reset, grant change or flag change. Only its own new login device was approved and later removed with the new sessions. Six temporary accounts covered Create-only, Edit-only, Reports-only, BOQ View, no grants, and an audit reader with the existing admin_settings View permission.</p>
<p>Eight View additions across five temporary users: three preserved existing activity grants, four carried from BOQ, and one carried from the audit reader's admin_settings View. The no-grants account gained nothing. Existing real users' entire permission rows and all existing user flags remained identical.</p>
${detail("All eight row-level changes",changes)}
${detail("Persisted per-user audit",audit.changes)}
<p>Create-only user: /site/dashboard visibly denied before and opened after. The real API for the same temporary DPR changed from 403 to 200. The SPA document itself returned 200 in both states; the screenshot and API denial prove access, not the HTML document status. The read-only audit API returned 403 for the non-admin-section account and 200 for the authorised audit reader, whose signed-in screenshot shows the actual audit.</p>
${detail("Before API",read("api-before"))}${detail("After API",read("api-after"))}
${detail("First application start",read("first-startup-log"))}
${detail("Second application start: one check, zero writes",read("second-startup-log"))}
${detail("Second-start database snapshot comparison",read("second-start"))}
${detail("Integrity",read("integrity"))}
<h2>Cleanup</h2>
<p>All six temporary users, permission rows, site grants, devices, sessions, the temporary DPR, and the newly created verification device/sessions were removed. All recorded operational remaining-row counts are zero. The completion marker and eight required historical audit rows are deliberately retained so history remains readable and later startups do not rerun. These are durable migration history, not live test accounts or grants; their user labels remain snapshots of the deleted temporary subjects.</p>
${detail("Every deleted row and remaining count",read("cleanup"))}
<h2>Tests and source boundaries</h2>
<p>Added tests/permissionAccessMigration.test.ts: 15 checks covering every qualifying bit, Notify-only/no-grant/dead-cell exclusions, admin/owner exclusion, exact carry-forward, only-View changes, empty users, marker-only second invocation, rollback on audit failure and read-only not-run state. Existing tests were not edited.</p>
${detail("Full-suite comparison with the same 48 baseline failures",comparison)}
${detail("Every existing route body preserved",read("route-preservation"))}
${detail("Build result",read("build-result"))}
<p>Files: server/permissionAccessMigration.ts; server/index.ts (one invocation); server/routes.ts (new read-only endpoint); client/src/pages/PermissionMigrationAudit.tsx; client/src/App.tsx (new page); client/src/pages/AdminSettings.tsx (audit link); the test; acceptance/report scripts; reports/perm-prod01; and the migration safety memory note.</p>
<h2>Signed-in screenshots</h2>${shots.map(name=>`<details><summary>${esc(name)}</summary><img alt="${esc(name)}" src="data:image/jpeg;base64,${fs.readFileSync(`${dir}/${name}.jpg`).toString("base64")}"></details>`).join("")}
<h2>Publish review</h2><p class="notice">Nothing was published. Publishing settings are offered for the owner's review; the actual deployment/schema preview was not available through the available tooling and was not inspected. No schema change was made. This report does not claim production matrices were measured.</p>
</body></html>`;
fs.writeFileSync(`${dir}/status-report.html`,html);
console.log({changes:changes.length,comparison,integrity:read("integrity")});
