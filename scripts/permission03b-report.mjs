import fs from "node:fs";
import ts from "typescript";
import {execFileSync} from "node:child_process";
const dir="reports/perm-03b";
const read=p=>JSON.parse(fs.readFileSync(p,"utf8"));
const write=(name,value)=>fs.writeFileSync(`${dir}/${name}.json`,JSON.stringify(value,null,2));
const escape=s=>String(s).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll('"',"&quot;");
const csv=(name,rows)=>fs.writeFileSync(`${dir}/${name}.csv`,rows.length?[Object.keys(rows[0]),...rows.map(Object.values)].map(r=>r.map(v=>`"${String(v??"").replaceAll('"','""')}"`).join(",")).join("\n"):"");
function routes(file){
  const text=fs.readFileSync(file,"utf8"),ast=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true),rows=[];
  function walk(n){
    if(ts.isCallExpression(n)&&ts.isPropertyAccessExpression(n.expression)&&/^(get|post|put|patch|delete)$/.test(n.expression.name.text)&&ts.isStringLiteral(n.arguments[0])){
      const body=n.getText(ast);rows.push({method:n.expression.name.text.toUpperCase(),route:n.arguments[0].text,line:ast.getLineAndCharacterOfPosition(n.getStart()).line+1,body});
    }n.forEachChild(walk);
  }walk(ast);return rows;
}
const current=routes("server/routes.ts"),old=routes("/tmp/perm03/baseline-source/server/routes.ts");
const inventory=read("/tmp/perm03/routes-before.json");
const admin=inventory.filter(r=>r.adminOnly&&r.file==="server/routes.ts").map(r=>({...r,unchanged:old.find(x=>x.method===r.method&&x.route===r.route)?.body===current.find(x=>x.method===r.method&&x.route===r.route)?.body}));
write("admin-boundary",admin);
const before=read(`${dir}/before.json`),after=read(`${dir}/after.json`);
const preservation=[];
for(const u of before.users.filter(u=>!u.is_admin&&!u.is_owner)){
  const has=key=>before.permissions.some(p=>p.user_id===u.id&&p.section_key===key&&p.can_view);
  for(const key of ["planning_masters","work_programme","work_programme_review","norms_library","edit_requests_review"]){
    const required=key==="edit_requests_review"?(has("admin_settings")||has("user_management")):has("qto_boq");
    if(required){const row=after.permissions.find(p=>p.user_id===u.id&&p.section_key===key);preservation.push({user_id:u.id,section:key,permission_id:row?.id,view_preserved:!!row?.can_view,written_this_batch:false});}
  }
}
csv("view-preservation",preservation);
const integrity={before:before.counts,after:after.counts,beforeChecksums:before.checksums,afterChecksums:after.checksums,
  permissionRowsUnchanged:JSON.stringify(before.permissions)===JSON.stringify(after.permissions),
  userChanges:before.users.map(u=>({id:u.id,fields:Object.keys(u).filter(k=>JSON.stringify(u[k])!==JSON.stringify(after.users.find(v=>v.id===u.id)?.[k]))})).filter(u=>u.fields.length),
  adminRouteCount:admin.length,adminRoutesUnchanged:admin.every(r=>r.unchanged),
  ordinaryUsersWithRestrictedBits:after.permissions.filter(p=>(p.can_delete||p.can_export||p.can_notify)&&after.users.some(u=>u.id===p.user_id&&!u.is_admin&&!u.is_owner)).map(p=>p.id)};
write("integrity",integrity);
const keys=["planning_masters","work_programme","work_programme_review","norms_library","edit_requests_review"];
const surfaces=[
  {key:"planning_masters",pages:"/work-program/planning-masters; /work-program/:id/geometry",navigation:"Existing Planning Masters entry; BOQ detail Geometry link now checks planning_masters"},
  {key:"work_programme",pages:"/work-program/:id/settings; /work-program/:id/programme; /work-program/:id/execution-arrangements",navigation:"BOQ detail Work Programme link; Settings and programme cross-links retain page-level destination gates"},
  {key:"work_programme_review",pages:"/work-program/:id/demand; /work-program/:id/earthwork; /work-program/:id/resource-review; /work-program/:id/item-review",navigation:"BOQ detail BOM & Demand, Resource Review and Item Review links now check work_programme_review"},
  {key:"norms_library",pages:"/norms",navigation:"HubShell Norms Library (SNL) now checks norms_library rather than qto_boq"},
  {key:"edit_requests_review",pages:"/edit-requests",navigation:"HubShell Edit Requests and pending query now check edit_requests_review instead of admin-only visibility"},
];
csv("new-key-page-navigation-map",surfaces);
const map=current.filter(r=>keys.some(k=>r.body.includes(`"${k}"`))).map(r=>({method:r.method,route:r.route,line:r.line,guards:[...r.body.matchAll(/assert(?:ViewEither|View|Edit|Approve|Delete|Export)\(req, res,[^)]+\)/g)].map(m=>m[0]).join("; ")}));
csv("new-key-route-map",map);
const qt=current.filter(r=>r.body.includes('"qto_boq"')).map(r=>({method:r.method,route:r.route,line:r.line,disposition:r.route.startsWith("/api/snl/")?"Shared BOQ/SNL read: BOQ editor is a legitimate consumer":r.route.includes("programme-status")?"Shared status read displayed on the BOQ register":"Retained BOQ contract/item/revision ownership; no programme mutation grant"}));
csv("qto-retained",qt);
const changes=current.filter(r=>{const o=old.find(x=>x.method===r.method&&x.route===r.route);return o&&o.body!==r.body;}).map(r=>({method:r.method,route:r.route,line:r.line,guards:map.find(x=>x.method===r.method&&x.route===r.route)?.guards??""}));
csv("changed-route-inventory",changes);
const candidates=fs.readFileSync("reports/perm-03/output-route-candidates.csv","utf8").trim().split("\n").slice(1).map(line=>{const [method,route]=line.split(",");const r=current.find(r=>r.method===method&&r.route===route);const guards=r?[...r.body.matchAll(/assert(?:ReportExport|Export)\(req, res,[^)]+\)/g)].map(m=>m[0]).join("; "):"";
  return {method,route,line:r?.line,classification:guards?"Export guard":route==="/api/attachments"?"Upload, not output":route==="/api/admin/exportable-tables"?"Table-name metadata, not exported records":route==="/api/admin/estimator-guide.pdf"?"EXCEPTION: separate estimator-admin cookie; unchanged under admin-boundary rule":"EXCEPTION: admin-only output unchanged under 93-route preservation rule",guards};});
csv("output-route-classification",candidates);
const baseline=read("/tmp/perm03/isolated-baseline-tests.json");
const result=read("/tmp/perm03b-final-tests.json");
const failures=r=>r.testResults.flatMap(f=>f.assertionResults.filter(t=>t.status==="failed").map(t=>({file:f.name.split("/").pop(),test:t.fullName})));
const baseFailures=failures(baseline),finalFailures=failures(result),identity=x=>`${x.file}:${x.test}`;
const compare={baseline:{files:baseline.testResults.length,total:baseline.numTotalTests,passed:baseline.numPassedTests,failed:baseline.numFailedTests,skipped:baseline.numPendingTests},
 final:{files:result.testResults.length,total:result.numTotalTests,passed:result.numPassedTests,failed:result.numFailedTests,skipped:result.numPendingTests},
 newlyFailed:finalFailures.filter(x=>!baseFailures.some(y=>identity(y)===identity(x))),
 resolvedBaseline:baseFailures.filter(x=>!finalFailures.some(y=>identity(y)===identity(x))),
 missingFiles:baseline.testResults.map(f=>f.name.split("/").pop()).filter(n=>!result.testResults.some(f=>f.name.endsWith("/"+n)))};
write("test-comparison",compare);
const evidence=read(`${dir}/browser-evidence.json`);
const reportScreens=read(`${dir}/report-screen-checks.json`);
const shots=["durable-account","qto-repeat-delete-denied","qto-repeat-delete-allowed","work_programme-delete-denied","work_programme-delete-allowed","project_scope-delete-denied","project_scope-delete-allowed","reports-without-export","reports-with-export",...keys.flatMap(k=>[`${k}-view-denied`,`${k}-view-allowed`]),...reportScreens.map(s=>s.screenshot.replace(/\.jpg$/,""))];
const audit=read("/tmp/perm03b-audit.log");
const files=[...new Set([...execFileSync("git",["diff","--name-only"],{encoding:"utf8"}).trim().split("\n"),"client/src/components/DeleteGate.tsx","tests/deleteGateProviderBoundary.test.tsx"])];
const pre=x=>`<pre>${escape(JSON.stringify(x,null,2))}</pre>`;
const html=`<!doctype html><html><head><meta charset="utf-8"><title>PERM-03B verification report</title><style>body{font:15px/1.5 system-ui;max-width:1100px;margin:40px auto;padding:24px;color:#182235}h1,h2{color:#153854}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#eef2f6;padding:16px}img{width:100%;border:1px solid #ccc}.warning{background:#fff1cf;padding:16px}details{margin:16px 0}</style></head><body>
<h1>PERM-03B — implementation and signed-in verification</h1>
<p class="warning"><strong>Not fully certified.</strong> Real signed-in Delete, Export and five-key checks passed below. End-to-end Notify delivery and exhaustive report-screen/action-control coverage remain unrun. No production changes, publishing, PERM-04 work or follow-up tasks.</p>
<h2>A — regressions</h2><p>DeleteGate now denies without an auth provider instead of crashing shared notification widgets. The ordinary useAuth hook still throws if its provider is absent. A real no-provider regression test protects this boundary. Account and scope fixtures supply the permission helpers now consumed by their mounted components; their business assertions were not weakened. The execution-evidence source-contract test was updated from the old BOQ key to Programme OR Programme Review, still before site-scope enforcement. The generated permission map was regenerated after the route edits.</p>${pre(compare)}
<h2>B — split</h2><p>Programme scheduling, settings/mix links and allocation mutations use work_programme; classification, resource review and earthwork forecasting use work_programme_review; planning master edits use planning_masters; SNL mapping changes use norms_library. Shared reads accept the legitimate consuming sections with OR guards. Edit Requests keeps its independent View/Approve checks. Existing BOQ ownership and scope access remain on their original keys. All 93 admin route bodies are preserved.</p>
<p>Hub navigation now uses Norms and Edit Requests keys; BOQ detail links use the destination keys. Dedicated page gates were checked independently. This does not certify every nested write control in the large programme/review screens; existing cross-page links can still lead to a denied page.</p>
<details><summary>Exact new-key route map</summary>${pre(map)}</details><details><summary>Retained qto_boq routes</summary>${pre(qt)}</details>
<details><summary>Pages and navigation for each new key</summary>${pre(surfaces)}</details>
<p>No additive migration was necessary: every required View row was already present from PERM-03. No real permission row was written.</p>${pre(preservation)}
<h2>C — output routes</h2><p>Every candidate is classified below. Admin-only exports remain exceptions because changing those guards is explicitly prohibited. The admin/manager guide now checks admin_settings Export. Attachment upload and table-name metadata are not report exports.</p>${pre(candidates)}
<p>Progress Report was verified on screen with View + Reports and no Export: report rendered, export control absent, download HTTP 403. With Export: control visible and download HTTP 200. Ten additional report/report-hub routes were opened using an ordinary account with View + Reports and every Export bit false. All rendered without visible app download/print controls. Heating Trends initially exposed Export Excel; that control was corrected to use the same two section keys as its already-guarded endpoint, then the screen check was repeated. These checks cover the initial screen state, not every filter, record-detail or populated export variation. Browser-native Print cannot be prevented by an app permission.</p>
${pre(reportScreens.map(({path,status,screenshot,visibleOutputControls,denied})=>({path,status,screenshot,visibleOutputControls,denied})))}
<h2>D — durable development verification</h2><p>Existing ordinary Agent Verification account retained; only its password was reset from DEV_VERIFICATION_PASSWORD, and normal login activity changed its last-login timestamp. The user supplied the secure secret because the available tooling could not save an agent-generated one. Device 98 was approved in development without impersonating a human approver. Disposable session files are not credential storage.</p>${pre(read(`${dir}/login-proof.json`))}
<h2>E — signed-in acceptance and cleanup</h2><p>Temporary ordinary accounts 21 and 22 and projects 13 and 14 were used and removed. E1: BOQ item, programme mix-link and draft scope Delete controls were absent/present with 403/200 API results. The initial BOQ negative capture was blank during loading and is superseded by the repeat captures. E2: Reports/Export evidence above. E4: each new key was disabled/enabled independently, with denied/allowed pages and 403/200 endpoints. E5: no ordinary real user has Delete/Export/Notify; Grant-all exclusion remains covered by the existing permission tests, not a signed-in permission-manager interaction.</p>
<p class="warning">E3 unrun: no isolated real-device notification delivery was established. No section notification event was fired because delivery isolation had not been demonstrated; no real user was sent a test notification. E6: exhaustive report-screen checks, nested write-control coverage and Grant-all UI acceptance are also unrun. Component or source tests are not presented as screen evidence.</p>
${pre(evidence.filter(r=>r.status))}${pre(read(`${dir}/cleanup.json`))}
<h2>Integrity, row counts and checksums</h2>${pre(integrity)}<p>Exact temporary permission transitions and fixture rows are in temporary-writes.json; authorized persistent password reset is described without its value in account-write.json. All temporary users, permissions, devices, sessions, site grants and project were removed. Real user flags and admin bypasses are unchanged.</p>
<h2>Audit</h2><p>PERM-02: LIVE 205 / DEAD 3 / HIDDEN 0 / CORRECTLY-OFF 488, 87 sections. Current: 92 sections × 8 actions.</p>${pre(audit)}
<h2>Files changed</h2>${pre(files)}<p>New evidence and reproducible verification scripts are under reports/perm-03b and scripts/permission03b-*.</p>
<h2>Signed-in screenshots</h2>${shots.map(name=>`<details><summary>${escape(name)}</summary><img alt="${escape(name)}" src="data:image/jpeg;base64,${fs.readFileSync(`${dir}/${name}.jpg`).toString("base64")}"></details>`).join("")}
<h2>Publish preview</h2><p>Build passed. Publishing settings are offered separately for review only. No publish was attempted; a production schema/deployment preview was not inspected, and readiness is not claimed while certification gaps remain.</p></body></html>`;
fs.writeFileSync(`${dir}/status-report.html`,html);
console.log({comparison:compare,integrity,audit:audit.counts});
