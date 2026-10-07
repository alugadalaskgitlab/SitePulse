import fs from "node:fs";
import ts from "typescript";
import {execFileSync} from "node:child_process";
const dir="reports/perm-03b2";
const read=p=>JSON.parse(fs.readFileSync(p,"utf8"));
const json=(name,data)=>fs.writeFileSync(`${dir}/${name}.json`,JSON.stringify(data,null,2));
const csv=(name,rows)=>fs.writeFileSync(`${dir}/${name}.csv`,[Object.keys(rows[0]??{}),...rows.map(Object.values)].map(r=>r.map(v=>`"${String(v??"").replaceAll('"','""')}"`).join(",")).join("\n"));
function routes(text,file){
  const ast=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true),rows=[];
  const walk=n=>{
    if(ts.isCallExpression(n)&&ts.isPropertyAccessExpression(n.expression)&&/^(get|post|put|patch|delete)$/.test(n.expression.name.text)&&ts.isStringLiteral(n.arguments[0])){
      rows.push({method:n.expression.name.text.toUpperCase(),route:n.arguments[0].text,start:n.getStart(),end:n.end,line:ast.getLineAndCharacterOfPosition(n.getStart()).line+1,body:n.getText(ast)});
    }n.forEachChild(walk);
  };walk(ast);return rows;
}
const current=routes(fs.readFileSync("server/routes.ts","utf8"),"server/routes.ts");
const guard=r=>[...r.body.matchAll(/assert(?:ViewEither|View|Edit|Delete|Approve|Export|ReportExport|Admin)\(req, res[^)]*\)/g)].map(m=>m[0]).join("; ");
const keyList=["qto_boq","planning_masters","work_programme","work_programme_review","norms_library","edit_requests_review"];
const files=execFileSync("git",["ls-tree","-r","--name-only","HEAD","client/src","server","shared"],{encoding:"utf8"}).trim().split("\n").filter(f=>/\.(ts|tsx)$/.test(f)&&!/\.(test|spec)\./.test(f));
const references=[];
for(const file of files){
  const text=execFileSync("git",["show",`HEAD:${file}`],{encoding:"utf8",maxBuffer:10e6});
  const oldRoutes=file==="server/routes.ts"?routes(text,file):[];
  for(const match of text.matchAll(/"qto_boq"/g)){
    const line=text.slice(0,match.index).split("\n").length;
    const old=oldRoutes.find(r=>match.index>=r.start&&match.index<r.end);
    const now=old&&current.find(r=>r.method===old.method&&r.route===old.route);
    const guards=now?guard(now):"";
    const sourceLine=text.split("\n")[line-1].trim();
    let decision;
    if(now)decision=now.body.includes('"qto_boq"')?
      (old.route.includes("programme-status")?"Retained in shared status read: BOQ register consumes it.":"Retained: BOQ project/item/category/revision contract ownership, not scheduling."):
      `Moved to destination owner: ${guards}`;
    else if(file==="shared/permissions.ts")decision="Retained catalogue/template/module membership: BOQ remains an independent section; no grants changed.";
    else if(file.endsWith("BoqProgramSettings.tsx"))decision="Moved mix-link Delete to work_programme, matching Settings page and API.";
    else if(file.endsWith("BoqProjectDetail.tsx"))decision="Retained item/category Delete: original BOQ records belong to qto_boq; destination links are permission-aware.";
    else if(sourceLine.includes('"/norms"'))decision="Moved Norms navigation to norms_library.";
    else if(sourceLine.includes('"/work-program/:id/scope"'))decision="Retained additive BOQ scope View alongside project_scope and programme/planning consumers; scope mutations remain project_scope.";
    else if(sourceLine.includes('"/work-program"')||sourceLine.includes('href: "/work-program"'))decision="Shared project picker: qto_boq OR programme OR review OR planning. Open chooses an accessible destination; BOQ actions remain BOQ-only.";
    else if(sourceLine.includes('"/work-program/:id"'))decision="Retained BOQ detail page: original contract quantities/items/revisions.";
    else decision="Retained BOQ estimator discovery; unrelated programme permissions do not grant calculator access.";
    references.push({file,line,guardsWhat:old?`${old.method} ${old.route}`:sourceLine,decision,currentLine:now?.line??"",currentGuards:guards});
  }
}
csv("qto-reference-disposition",references);
const finalReferences=[];
for(const file of [...files,"client/src/components/ProgrammeLink.tsx"]){
  if(!fs.existsSync(file))continue;
  const lines=fs.readFileSync(file,"utf8").split("\n");
  lines.forEach((line,i)=>{if(line.includes('"qto_boq"'))finalReferences.push({file,line:i+1,source:line.trim()});});
}
csv("qto-current-references",finalReferences);
const routeMap=current.filter(r=>keyList.some(k=>r.body.includes(`"${k}"`))).map(r=>({method:r.method,route:r.route,line:r.line,guards:guard(r)}));
csv("key-route-map",routeMap);
const app=fs.readFileSync("client/src/App.tsx","utf8");
const pages=[...app.matchAll(/<Route path="([^"]+)" component=\{gated(?:Either)?\(([^)]+)\)/g)].filter(m=>keyList.some(k=>m[2].includes(`"${k}"`))).map(m=>({page:m[1],gate:m[2]}));
csv("key-page-map",pages);
const candidates=fs.readFileSync("reports/perm-03/output-route-candidates.csv","utf8").trim().split("\n").slice(1).map(line=>{
  const [method,route]=line.split(","),r=current.find(r=>r.method===method&&r.route===route);
  const exportGuards=r?[...r.body.matchAll(/assert(?:ReportExport|Export)\(req, res[^)]+\)/g)].map(m=>m[0]).join("; "):"";
  return {method,route,line:r?.line,exportGuards,disposition:exportGuards?"Export bit enforced":route==="/api/attachments"?"Upload; not output":route==="/api/admin/exportable-tables"?"Metadata list; not exported records":route==="/api/admin/estimator-guide.pdf"?"Not placed: separate estimator-admin cookie boundary, not changed":"Not placed: explicitly preserved admin-only output boundary"};
});
csv("output-route-disposition",candidates);
const old=routes(fs.readFileSync("/tmp/perm03/baseline-source/server/routes.ts","utf8"),"server/routes.ts");
const admin=read("/tmp/perm03/routes-before.json").filter(r=>r.adminOnly&&r.file==="server/routes.ts").map(r=>({method:r.method,route:r.route,unchanged:old.find(x=>x.method===r.method&&x.route===r.route)?.body===current.find(x=>x.method===r.method&&x.route===r.route)?.body}));
json("admin-boundary",admin);
if(admin.length!==93||admin.some(r=>!r.unchanged))throw Error("Admin route boundary changed");
const before=read(`${dir}/before.json`),after=read(`${dir}/after.json`);
const integrity={before:before.counts,after:after.counts,beforeChecksums:before.checksums,afterChecksums:after.checksums,usersUnchanged:before.checksums.users===after.checksums.users,permissionsUnchanged:before.checksums.permissions===after.checksums.permissions,adminRoutesUnchanged:admin.every(r=>r.unchanged)};
json("integrity",integrity);
if(!integrity.usersUnchanged||!integrity.permissionsUnchanged)throw Error("Unexpected persistent row changes");
const baseline=read("/tmp/perm03/isolated-baseline-tests.json"),result=read("/tmp/perm03b2-final.json");
const name=p=>p.replace(/^.*?\/(tests\/|client\/)/,"$1");
const counts=r=>({files:r.testResults.length,total:r.numTotalTests,passed:r.numPassedTests,failed:r.numFailedTests,skipped:r.numPendingTests});
const failures=r=>r.testResults.flatMap(f=>f.assertionResults.filter(t=>t.status==="failed").map(t=>`${name(f.name)}:${t.fullName}`));
const bf=failures(baseline),ff=failures(result);
const comparison={baseline:counts(baseline),final:counts(result),newFailures:ff.filter(x=>!bf.includes(x)),resolvedBaseline:bf.filter(x=>!ff.includes(x)),missingFiles:baseline.testResults.map(f=>name(f.name)).filter(p=>!result.testResults.some(f=>name(f.name)===p))};
json("test-comparison",comparison);
fs.copyFileSync("/tmp/perm03b2-final.json",`${dir}/full-tests.json`);
const evidence=read(`${dir}/browser-evidence.json`);
const reportScreens=read(`${dir}/report-screen-checks.json`).map(r=>{
  const screen=evidence.find(e=>e.screenshot===r.screenshot);
  const pin=screen?.text?.includes("Enter Access PIN");
  return {...r,certified:!pin&&!r.denied&&!r.outputs.length,exception:pin?"Separate estimator PIN login shown; report content not verified":r.denied?"Report not accessible":r.outputs.length?"Output controls remain":"None"};
});
json("report-screen-certification",reportScreens);
const audit=read("/tmp/perm03b2-audit.json");
const escape=s=>String(s).replaceAll("&","&amp;").replaceAll("<","&lt;");
const pre=x=>`<pre>${escape(JSON.stringify(x,null,2))}</pre>`;
const detail=(title,x)=>`<details><summary>${title}</summary>${pre(x)}</details>`;
const screenshots=evidence.filter(e=>e.screenshot);
const changed=execFileSync("git",["diff","--name-only"],{encoding:"utf8"}).trim().split("\n");
const html=`<!doctype html><html><head><meta charset="utf-8"><title>PERM-03B-2 verification</title><style>body{font:15px/1.5 system-ui;max-width:1100px;margin:32px auto;padding:24px;color:#172b3d}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f0f3f6;padding:16px}details{margin:14px 0}img{width:100%}.notice{background:#fff3d4;padding:16px}</style></head><body>
<h1>PERM-03B-2 — Work Programme and Export</h1>
<p>Live E1–E5 checks passed. No production writes, publishing, flag changes, real-user grants, broad Delete/Notify acceptance, or PERM-04 work.</p>
<h2>A — every original qto_boq reference</h2>
<p>The instruction quotes 44 references. The committed source examined actually contains ${references.length} exact quoted literals in client/server/shared TypeScript, ${references.filter(r=>r.file!=="shared/permissions.ts").length} outside the permission catalogue. The inventory records every actual occurrence instead of inventing a 44th entry. Earlier uncommitted split work was already present when this batch began; this report reconciles the committed references with the final source.</p>
${detail("File:line, guarded operation, destination and reason",references)}
${detail("Current remaining references",finalReferences)}
<p>Programme settings, bars, allocation and scheduling mutations use work_programme. Planning equipment/labour reads and edits and geometry use planning_masters. Review/classification/resource operations use work_programme_review; Norms edits use norms_library; Edit Requests uses edit_requests_review.</p>
<p>Decisions: shared project selection accepts its legitimate section consumers, but original BOQ detail stays qto_boq. Open chooses an allowed destination. ProgrammeLink hides cross-page links when the destination is denied. Scope metadata and mix-template lookups remain shared reads, not shared edit grants. Equipment/labour master listing is planning-only (a live first attempt exposed an overly broad OR; corrected and repeated). All 93 admin route bodies are unchanged.</p>
${detail("Finished page/key map",pages)}${detail("Finished API/key map",routeMap)}
<p>Navigation: shared Work Program &amp; BOQ picker; Planning Masters/Geometry links use planning_masters; programme/settings/arrangements links use work_programme; demand/earthwork/item/resource links use work_programme_review; Norms sidebar uses norms_library; Edit Requests sidebar uses edit_requests_review. BOQ detail and estimator discovery retain qto_boq.</p>
${detail("A5: existing additive View rows; no writes required",read(`${dir}/view-preservation.json`))}
<h2>B — Reports and Export</h2>
${detail("All output candidates, including explicit exceptions",candidates)}
<p>The admin guide uses admin_settings Export. The preserved admin-only manual/export-data endpoints and separate estimator-admin guide are explicitly not re-gated. Upload and table-list metadata are not exported records. No report calculations, content or layout were changed. Plant Daily Report's exposed PDF control was found in the browser, guarded with plant_daily_reports Export and rechecked. Earlier Heating Trends and shared Export-gate corrections remain included.</p>
${detail("Report screen checks",reportScreens)}
<h2>E — actual signed-in evidence</h2>
<p>Reused the existing ordinary verification account/session/device without resetting its password or flags. Temporary account 23, project 15: E1 programme allowed/planning denied; E2 mirror; E3 Settings PUT 200 and persisted settings visible; E4 Norms/Edit Requests independently allowed, opposite page and API denied; E5 Reports-only export 403 with control absent, temporary Export grant gives control and 200.</p>
${pre(evidence.filter(e=>e.status))}
<p class="notice">E6: three calculator comparison/impact screens showed their separate estimator PIN login, not report content; no PIN bypass or flag change was attempted. They are not certified by these screenshots. Protected SPA documents can return HTTP 200 while their page renders No access; API 403 and the visible denial are the evidence. Built-in browser Print is outside application control. Publish/schema preview was not inspected; only the Publishing settings review surface can be offered without starting publishing.</p>
<h2>Z — verification and cleanup</h2>${pre(integrity)}
${detail("Every temporary user/permission write",read(`${dir}/writes.json`))}
${detail("Cleanup: removed row IDs and zero remaining rows",read(`${dir}/cleanup.json`))}
<p>Cleanup's first name check did not match the normalized project name; the same captured project ID and case-insensitive exact test name were used to finish deletion. No unrelated record was deleted.</p>
${pre(comparison)}
<p>Build passed. Tests added: programmeNavigationPermissions (seven destination/picker checks). Existing programmeBarOutcome1430 source-contract expectation now uses programme/review instead of BOQ; provider-boundary regression also checks Export fails closed outside context. These do not replace browser evidence. No pre-existing type errors are claimed as new.</p>
<p>PERM-02: LIVE 205 / DEAD 3 / HIDDEN 0 / CORRECTLY-OFF 488 (87 sections). Final catalogue: 92 × 8.</p>${pre(audit.counts)}
${detail("Changed tracked files (including carried-in split work)",changed)}
<p>New files: client/src/components/ProgrammeLink.tsx, tests/programmeNavigationPermissions.test.tsx, scripts/permission03b2-browser.mjs, scripts/permission03b2-report.mjs, reports/perm-03b2/.</p>
<h2>Screenshots</h2>${screenshots.map(s=>`<details><summary>${escape(s.label)}</summary><img alt="${escape(s.label)}" src="data:image/jpeg;base64,${fs.readFileSync(`${dir}/${s.screenshot}`).toString("base64")}"></details>`).join("")}
<h2>Publish review</h2><p>No publish attempted. Publishing settings are offered separately; this is not a claim that the production deployment/schema preview was inspected.</p>
</body></html>`;
fs.writeFileSync(`${dir}/status-report.html`,html);
console.log({references:references.length,comparison,integrity,reportScreens:{certified:reportScreens.filter(r=>r.certified).length,exceptions:reportScreens.filter(r=>!r.certified).map(r=>r.path)},audit:audit.counts});
