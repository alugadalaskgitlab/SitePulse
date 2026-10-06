/**
 * PERM-01, read-only permission wiring inventory.
 * Run: npx tsx scripts/permission-audit.ts
 * Only writes reports/permission-audit.{csv,md}. Never imports server startup.
 * DB: DEV_DATABASE_URL only, transaction READ ONLY; --no-db for source-only reruns.
 * Definitions/tests/permission editors are not feature enforcement.
 * Generic helpers are expanded at concrete callers; unresolved sites are retained.
 */
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import pg from "pg";
import { SECTION_KEYS, SECTION_LABELS, ACTIONS, ACTION_LABELS, ROLE_TEMPLATES,
  applyRoleTemplate, EDIT_RECORD_TYPE_SECTION, PERMISSION_GROUPS } from "../shared/permissions";

const keys = new Set<string>(SECTION_KEYS), acts = new Set<string>(ACTIONS);
const visibleActions = ACTIONS.filter(a => a !== "notify");
const files: string[] = [];
function walk(dir: string) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (!["node_modules", "dist", "__tests__", "fixtures"].includes(e.name)) walk(p); }
    else if (/\.(ts|tsx)$/.test(p) && !/\.(test|spec|d)\.tsx?$/.test(p)) files.push(p);
  }
}
["client/src", "server", "shared"].forEach(walk);
const sources = new Map(files.map(f => [f, ts.createSourceFile(f, fs.readFileSync(f, "utf8"), ts.ScriptTarget.Latest, true,
  f.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS)]));
function visit(n: ts.Node, fn: (n: ts.Node) => void) { fn(n); n.forEachChild(c => visit(c, fn)); }
const loc = (n: ts.Node) => `${n.getSourceFile().fileName}:${n.getSourceFile().getLineAndCharacterOfPosition(n.getStart()).line + 1}`;
const text = (n?: ts.Node) => n?.getText() ?? "";
function unwrap(n: ts.Node): ts.Node {
  while (ts.isParenthesizedExpression(n) || ts.isAsExpression(n) || ts.isNonNullExpression(n) || ts.isTypeAssertionExpression(n) || ts.isSatisfiesExpression(n)) n = n.expression;
  return n;
}
function declaration(name: string, at: ts.Node): ts.VariableDeclaration | undefined {
  // Search successive lexical scopes, never substitute another route's local `m`.
  let scope: ts.Node | undefined = at.parent;
  while (scope) {
    if (ts.isBlock(scope) || ts.isSourceFile(scope)) {
      let result: ts.VariableDeclaration | undefined;
      const search = (n: ts.Node) => {
        if (n !== scope && (ts.isFunctionLike(n) || ts.isBlock(n))) return;
        if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.name.text === name && n.getStart() < at.getStart()) result = n;
        n.forEachChild(search);
      };
      search(scope);
      if (result) return result;
    }
    scope = scope.parent;
  }
}
function values(input?: ts.Node, depth = 0): string[] {
  if (!input || depth > 12) return [];
  const n = unwrap(input);
  if (ts.isStringLiteralLike(n)) return [n.text];
  if (ts.isArrayLiteralExpression(n)) return n.elements.flatMap(e => values(e, depth + 1));
  if (ts.isConditionalExpression(n)) return [...values(n.whenTrue, depth + 1), ...values(n.whenFalse, depth + 1)];
  if (ts.isIdentifier(n)) {
    const d = declaration(n.text, n);
    if (d?.initializer) return values(d.initializer, depth + 1);
    // An array callback parameter, e.g. ["view","create","edit"].some(action => ...).
    let p: ts.Node | undefined = n.parent;
    while (p) {
      if (ts.isArrowFunction(p) && p.parameters.some(x => text(x.name) === n.text) &&
          ts.isCallExpression(p.parent) && ts.isPropertyAccessExpression(p.parent.expression))
        return values(p.parent.expression.expression, depth + 1);
      p = p.parent;
    }
  }
  return [];
}
function chain(input: ts.Node, depth = 0): string[][] {
  if (depth > 15) return [];
  const n = unwrap(input);
  if (ts.isPropertyAccessExpression(n)) {
    if (n.name.text === "authPermissions") return [["$matrix"]];
    return chain(n.expression, depth + 1).map(p => [...p, n.name.text]);
  }
  if (ts.isElementAccessExpression(n)) return chain(n.expression, depth + 1)
    .flatMap(p => values(n.argumentExpression).map(v => [...p, v]));
  if (ts.isIdentifier(n)) {
    const d = declaration(n.text, n);
    if (d?.initializer) return chain(d.initializer, depth + 1);
    if (n.text === "permissions" && n.getSourceFile().fileName.startsWith("client/")) return [["$matrix"]];
  }
  if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken) return chain(n.left, depth + 1);
  return [];
}
function route(n: ts.Node): string {
  let p: ts.Node | undefined = n;
  while (p) {
    if (ts.isCallExpression(p) && ts.isPropertyAccessExpression(p.expression) &&
        /^(get|post|put|patch|delete|use)$/.test(p.expression.name.text) && ts.isStringLiteral(p.arguments[0] as any))
      return `${p.expression.name.text.toUpperCase()} ${text(p.arguments[0])}`;
    if (ts.isJsxElement(p) || ts.isJsxSelfClosingElement(p)) {
      const tag = ts.isJsxElement(p) ? p.openingElement : p;
      if (text(tag.tagName) === "Route") return text(tag.attributes);
      const href = tag.attributes.properties.find(a=>ts.isJsxAttribute(a) && text(a.name)==="href");
      if (href) return `${text(tag.tagName)} navigation: ${text(href)}`;
    }
    p = p.parent;
  }
  return "shared helper/component (see caller inventory)";
}
type Hit = { at: string; kind: string; context: string };
const refs = new Map<string, { client: Hit[]; server: Hit[] }>();
const unresolved = new Map<string, string>();
const pages: string[] = [], pairs: { at: string; helper: string; sections: string[]; actions: string[]; route: string }[] = [];
function add(n: ts.Node, sections: string[], actions: readonly string[], kind: string) {
  for (const s of new Set(sections)) for (const a of new Set(actions)) {
    if (!keys.has(s) || !acts.has(a)) continue;
    const k = `${s}.${a}`, ref = refs.get(k) ?? { client: [], server: [] };
    const side = n.getSourceFile().fileName.startsWith("client/") ? "client" : "server";
    if (!ref[side].some(h => h.at === loc(n) && h.kind === kind))
      ref[side].push({ at: loc(n), kind, context: route(n) });
    refs.set(k, ref);
  }
}
const ui = sources.get("client/src/pages/UserManagement.tsx")!;
let uiMap: Record<string, string[]> = {}, hubs: string[] = [];
visit(ui, n => {
  if (ts.isVariableDeclaration(n) && text(n.name) === "SECTION_ACTIONS" && n.initializer && ts.isObjectLiteralExpression(n.initializer))
    for (const p of n.initializer.properties) if (ts.isPropertyAssignment(p)) uiMap[text(p.name).replace(/["']/g, "")] = values(p.initializer);
  if (ts.isVariableDeclaration(n) && text(n.name) === "HUB_SECTIONS" && n.initializer && ts.isNewExpression(n.initializer))
    hubs = values(n.initializer.arguments?.[0]);
});
const helperActions: Record<string, string[]> = {
  assertEdit: ["edit"], assertEditEither: ["edit"], assertCreate: ["create"],
  assertCreateEither: ["create"], assertCreateOrEdit: ["create", "edit"],
  assertView: ["view"], assertViewEither: ["view"], assertApprove: ["approve"],
  assertDeleteOrCancel: ["edit"], assertReportExport: ["view_reports"],
};
const plumbing = new Set(["client/src/lib/auth-context.tsx", "client/src/components/RequireAuth.tsx",
  "client/src/components/ReportExportGate.tsx", "client/src/components/EditPermissionButton.tsx"]);
const genericResolved: string[] = [];
const allCalls: ts.CallExpression[] = [];
const functions = new Map<string, ts.Node[]>();
for (const sf of sources.values()) visit(sf, n => {
  if (ts.isFunctionDeclaration(n) && n.name) functions.set(n.name.text, [...(functions.get(n.name.text) ?? []), n]);
  if (ts.isVariableDeclaration(n) && n.initializer && (ts.isArrowFunction(n.initializer) || ts.isFunctionExpression(n.initializer)))
    functions.set(text(n.name), [...(functions.get(text(n.name)) ?? []), n.initializer]);
  if (ts.isCallExpression(n)) allCalls.push(n);
});
for (const [file, sf] of sources) visit(sf, n => {
  if (ts.isCallExpression(n)) {
    const name = text(n.expression), args = n.arguments;
    let sections: string[] = [], actions: string[] = [], recognized = false;
    if (["sectionCan", "sectionVisible", "canApprove"].includes(name)) {
      recognized = true; sections = values(args[0]);
      if (name === "sectionVisible" && file === "client/src/pages/PlantMasters.tsx" && text(args[0]) === "config.permission") {
        // Hand-traced finite SECTIONS configuration; extract current property values.
        visit(sf, p=>{if(ts.isPropertyAssignment(p) && text(p.name)==="permission") sections.push(...values(p.initializer));});
        genericResolved.push(`${loc(n)} config.permission -> SECTIONS[section]: parties/sites/plant-config = master_parties; materials/mix-templates = master_materials; equipment = master_equipment; personnel = master_personnel. Plant-config additionally adminOnly.`);
      }
      actions = name === "sectionCan" ? values(args[1]) : name === "sectionVisible" ? [...visibleActions] : ["approve"];
      if (name === "sectionVisible" && sections.length) pages.push(`${loc(n)} — ${sections.join(" OR ")} — ${route(n)} — ${file}`);
    } else if (helperActions[name]) {
      recognized = true; sections = args.slice(2).flatMap(a => values(a)); actions = helperActions[name];
    } else if (["gated", "gatedEither"].includes(name) && file === "client/src/App.tsx") {
      recognized = args.length > 1; sections = args.slice(1).flatMap(a => values(a)); actions = [...visibleActions];
      pages.push(`${loc(n)} — ${text(args[0])} — ${sections.join(" OR ") || "authentication only"} — ${route(n)}`);
    } else if (name === "requirePermission") {
      recognized = true; sections = values(args[0]); actions = values(args[1]);
    } else if (["requireUserMgmt", "requireDeviceMgmt"].includes(name)) {
      recognized = true; sections = [name === "requireUserMgmt" ? "user_management" : "device_approval"]; actions = values(args[0]);
    } else if (name === "sendPushToSection") {
      recognized = true; sections = values(args[0]); actions = ["notify"];
    } else if (name === "assertMixCalcWrite") {
      recognized = true; sections = ["mix_calculator"];
      actions = values(args[2]).flatMap(a=>a==="edit"?["edit","create"]:[a]);
    }
    if (recognized) {
      if (sections.length && actions.length) {
        add(n, sections, actions, name);
        if (sections.length > 1) pairs.push({ at: loc(n), helper: name, sections, actions, route: route(n) });
      } else if (plumbing.has(file) || (file === "client/src/App.tsx" && name === "sectionVisible") || (file === "server/auth-routes.ts" && name === "assertEdit" && text(args[2]) === "section"))
        genericResolved.push(`${loc(n)} ${text(n)} — expanded at concrete callers`);
      else unresolved.set(loc(n), text(n).slice(0,450));
    }
  }
  // Direct exact matrix reads, including aliases and optional chaining.
  if (ts.isPropertyAccessExpression(n) || ts.isElementAccessExpression(n)) {
    for (const p of chain(n)) if (p.length === 3 && p[0] === "$matrix" && keys.has(p[1]) && acts.has(p[2]))
      add(n, [p[1]], [p[2]], "direct matrix read");
  }
  if (ts.isJsxSelfClosingElement(n) || ts.isJsxOpeningElement(n)) {
    const tag = text(n.tagName), props = new Map(n.attributes.properties.filter(ts.isJsxAttribute).map(p => [text(p.name), p.initializer]));
    const propValues = (key: string) => { const v = props.get(key); return values(v && ts.isJsxExpression(v) ? v.expression : v); };
    if (tag === "ReportExportGate") {
      const ss = propValues("sections");
      if (ss.length) { add(n, ss, ["view_reports"], tag); if (ss.length > 1) pairs.push({ at: loc(n), helper: tag, sections:ss, actions:["view_reports"], route:route(n) }); }
      else unresolved.set(loc(n), text(n));
    }
    if (tag === "EditPermissionButton") {
      const ss = propValues("recordType").map(t => EDIT_RECORD_TYPE_SECTION[t]).filter(Boolean);
      if (ss.length) add(n, ss, ["edit"], "EditPermissionButton mapped record type");
      else unresolved.set(loc(n), text(n));
    }
    if (tag === "RequireAuth" && props.has("section")) {
      const ss = propValues("section");
      if (ss.length) { add(n, ss, visibleActions, tag); pages.push(`${loc(n)} — ${ss.join(" OR ")} — ${route(n)}`); }
      else genericResolved.push(`${loc(n)} RequireAuth section prop — traced through gated()`);
    }
    if (tag === "RequireAuth" && !props.has("section")) pages.push(`${loc(n)} — authentication only; no section matrix — ${route(n)}`);
  }
});
// Expand local non-parameterized permission wrappers at every actual call.
// Only propagate actual matrix reads, never business validation or flags.
for (const call of allCalls) {
  const name = text(call.expression);
  if (helperActions[name] || ["sectionCan", "sectionVisible", "canApprove"].includes(name)) continue;
  if (!/^(assert|can)/.test(name) || name === "assertMixCalcWrite") continue;
  const defs = (functions.get(name) ?? []).filter(d => d.getSourceFile() === call.getSourceFile());
  for (const d of defs) {
    const hits: [string,string][] = [];
    visit(d, n => { if (ts.isPropertyAccessExpression(n) || ts.isElementAccessExpression(n))
      for (const p of chain(n)) if (p[0] === "$matrix" && p.length === 3 && keys.has(p[1]) && acts.has(p[2])) hits.push([p[1],p[2]]); });
    hits.forEach(([s,a]) => add(call,[s],[a],`${name} -> ${loc(d)}`));
    if (new Set(hits.map(x=>x[0])).size > 1)
      pairs.push({at:loc(call),helper:name,sections:[...new Set(hits.map(x=>x[0]))],actions:[...new Set(hits.map(x=>x[1]))],route:route(call)});
  }
}
// Generic permission plumbing is reported separately, not counted as every cell live.
const bypasses: string[] = [], otherBypasses: string[] = [];
for (const [file,sf] of sources) {
  const canonical = ["server/auth-routes.ts","server/auth.ts","client/src/lib/auth-context.tsx"].includes(file);
  visit(sf,n=>{
    if (ts.isIfStatement(n) && /isAdmin|isOwner/.test(text(n.expression)) &&
        /^return (true|next\(\))/.test(text(n.thenStatement).replace(/^[{\s]+/,"")))
      (canonical ? bypasses : otherBypasses).push(`${loc(n)} — ${text(n.expression)} — ${text(n.thenStatement).replace(/\s+/g," ")}`);
  });
}
const csvQ = (v: unknown) => `"${String(v ?? "").replace(/"/g,'""')}"`;
const md = (v: unknown) => String(v ?? "").replace(/\|/g,"\\|").replace(/\r?\n/g," ");
const rendered = new Set(PERMISSION_GROUPS.flatMap(g=>g.sections));
const rows = SECTION_KEYS.flatMap(section=>ACTIONS.map(action=>{
  const r = refs.get(`${section}.${action}`) ?? {client:[],server:[]};
  const state = !Object.hasOwn(uiMap,section) ? "missing-from-UI-map" : uiMap[section].includes(action) ? "tickable" : "grey";
  const used = r.client.length + r.server.length > 0;
  const verdict = state === "missing-from-UI-map" ? "UNDECLARED" : state === "tickable" ? used ? "LIVE" : "DEAD" : used ? "HIDDEN" : "CORRECTLY-OFF";
  const label = action === "view" && hubs.includes(section) ? "Access" : ACTION_LABELS[action];
  const kinds = [...new Set([...r.client,...r.server].map(h=>h.kind))];
  const accessOnly = used && kinds.every(k=>["gated","gatedEither","sectionVisible","RequireAuth"].includes(k));
  const meaning = !used ? "No resolved feature reader." : accessOnly ? "Page/tile access ONLY through the seven-action visibility OR; no resolved action-specific operation. The action's name does not describe this effect."
    : action === "notify" ? "Recipient eligibility for concrete sendPushToSection events; also requires user notifications and subscription."
    : `Read by ${kinds.join(", ")}. ${action === "view_reports" ? "Reports controls export affordances/endpoints, not just viewing." : action === "edit" ? "May also authorize delete/cancel via edit-tier gates; see evidence." : ""}`;
  const mismatch = !used ? "Tick has no resolved feature effect" : accessOnly && action !== "view" ? "Named action only grants visibility" :
    action==="view" ? "Not exclusive: six other actions also grant visibility" :
    action==="view_reports" ? "Reports also controls exports" : action==="edit" && kinds.includes("assertDeleteOrCancel") ? "Edit also controls Delete/Cancel" :
    action==="approve" ? "Check route verbs: approval can mean verify/issue/reject/close/reopen" : "";
  return {section,action,label,state,verdict,r,meaning,mismatch,rendered:rendered.has(section)};
}));
const counts = Object.fromEntries(["LIVE","DEAD","HIDDEN","CORRECTLY-OFF","UNDECLARED"].map(v=>[v,rows.filter(r=>r.verdict===v).length]));
let userRows: any[] = [], dbNote = "Not queried (--no-db or missing DEV_DATABASE_URL). Production users are not verified.";
if (!process.argv.includes("--no-db") && process.env.DEV_DATABASE_URL) {
  const db = new pg.Client({connectionString:process.env.DEV_DATABASE_URL});
  try {
    await db.connect(); await db.query("BEGIN READ ONLY");
    const name = (await db.query("select current_database() as name")).rows[0].name;
    userRows = (await db.query(`SELECT id, full_name, is_admin, is_owner, is_field_engineer, can_manage_permissions,
      permission_manager_scope, all_sites_access, setup_complete FROM users ORDER BY id`)).rows;
    await db.query("ROLLBACK");
    dbNote = `Read-only snapshot of development database ${name}; ${userRows.length} users. No email, phone, password, session or credential fields read. Production users are not verified.`;
  } catch { dbNote = "Development user query failed; no user flags inferred. Rerun with configured DEV_DATABASE_URL. Production users are not verified."; }
  finally { await db.end(); }
}
const refText = (hs:Hit[])=>hs.map(h=>`${h.at} [${h.kind}; ${h.context}]`).join(" ; ");
const csv = [["section_key","section_label","action_key","action_label","ui_state","enforced_by_client","enforced_by_server","verdict","rendered_in_permission_groups","tooltip","actual_control","label_mismatch"].map(csvQ).join(","),
  ...rows.map(r=>[r.section,SECTION_LABELS[r.section],r.action,r.label,r.state,refText(r.r.client),refText(r.r.server),r.verdict,r.rendered,
    r.state==="grey" ? "Not used for this section" : 'No normal active-cell tooltip; when grant restricted: "You cannot change this grant". Notify header when disabled: "Push notifications are disabled for this user".',r.meaning,r.mismatch].map(csvQ).join(","))].join("\n")+"\n";
let out = `# PERM-01 — permission wiring audit (report only)\n\nGenerated ${new Date().toISOString()}. Run \`npx tsx scripts/permission-audit.ts\`.\n\n## Scope and method\n\nSource-only audit of ${files.length} production TS/TSX files under client/src, server and shared. No application startup/import, workflow restart, build, test-suite execution, account mutation or publish. Parked modules are scanned only for the permission references explicitly required by this audit, not their business logic. Runtime click-through was not performed. Verdict LIVE means a real code read, not proof that a control alone grants the entire operation.\n\nThe source currently declares **${SECTION_KEYS.length} sections × ${ACTIONS.length} actions = ${rows.length} cells**, not an assumed 82 × 8. Includes grey cells. UI state reflects SECTION_ACTIONS for an unrestricted manager, not actor-specific grant restrictions. Permission persistence/template/editor reads are not feature enforcement. Generic visibility is deliberately expanded to all seven actions it reads (not Notify); this is why many grey cells are HIDDEN. See hub exception below. The script uses the TypeScript AST, lexical alias tracing, concrete generic callers, mapped edit-record types and concrete push senders—not regex counts of literal sectionCan alone.\n\n## Verdict counts\n\n${Object.entries(counts).map(([k,v])=>`- ${k}: **${v}**`).join("\n")}\n\nUnresolved call sites: **${unresolved.size}**. These are not silently promoted to LIVE; unresolved coverage limits are listed below.\n\n## DEAD, grouped by section\n\n${SECTION_KEYS.map(s=>{const rr=rows.filter(r=>r.section===s&&r.verdict==="DEAD");return rr.length?`- **${s}** (${SECTION_LABELS[s]}): ${rr.map(r=>r.action).join(", ")}`:"";}).filter(Boolean).join("\n")}\n\n## HIDDEN\n\nGrey does not mean inert: sectionVisible reads seven bits; all can grant page entry. Hub rows intentionally aggregate seven historical bits into Access, so their HIDDEN aliases are not necessarily ungrantable in the aggregate. Non-hub grey readers have no matching checkbox.\n\n| Section | Action | Exact evidence |\n|---|---|---|\n${rows.filter(r=>r.verdict==="HIDDEN").map(r=>`| ${r.section} | ${r.action} | ${md(refText([...r.r.client,...r.r.server]))} |`).join("\n")}\n\n## Paired/multi-section checks\n\nIncludes server helper calls, client gatedEither and ReportExportGate; actions listed are alternatives when multiple actions occur. Other endpoint restrictions can still deny.\n\n`;
const grouped = new Map<string, typeof pairs>();
for(const p of pairs){const k=`${p.sections.slice().sort().join(" OR ")} [${p.actions.join("/")}]`;grouped.set(k,[...(grouped.get(k)??[]),p]);}
out += `${grouped.size} distinct section/action combinations; ${new Set(pairs.map(p=>p.sections.slice().sort().join("|"))).size} distinct section sets.\n\n`;
for(const [k,ps] of grouped) out+=`### ${k}\n\n${ps.map(p=>`- ${p.at} — ${p.helper} — ${md(p.route)}`).join("\n")}\n\n`;
out += `## Page-access visibility (B2)\n\nclient/src/lib/auth-context.tsx:159–165: sectionVisible returns true for ANY view/create/edit/delete/view_reports/export/approve; Notify alone does not grant entry. client/src/components/RequireAuth.tsx:54 delegates to this. client/src/App.tsx:185–203 ORs visibility across sections. Therefore View is not an exclusive page-access switch; Create alone can open a page, while APIs may still deny the request.\n\n${[...new Set(pages)].map(p=>`- ${md(p)}`).join("\n")}\n\n## Legacy broad keys (B3)\n\n`;
for(const s of ["site_procurement","site_diesel","vendor_bills","reports","rmc_operations","admin_settings","hmp_operations","reports_analysis","estimates_manager","app_management"]){
  const rr=rows.filter(r=>r.section===s), hs=rr.flatMap(r=>[...r.r.client,...r.r.server]);
  const overlaps=[...new Set(pairs.filter(p=>p.sections.includes(s)).flatMap(p=>p.sections.filter(x=>x!==s)))];
  out+=`- **${s}**: ${hs.length?`still read; overlaps ${overlaps.join(", ")||"no resolved paired helper"}. In the listed OR gates a true broad grant wins even if granular false (and vice versa); action-specific gates still require their specified bit. ${md(refText(hs.slice(0,5)))}`:"no resolved feature reader; changing it has no resolved feature effect."}\n`;
}
out += `\n## Admin/owner bypass and users (B4)\n\nThe premise “every assert helper checks isAdmin || isOwner” is not literally true. assertAuthed authenticates only; assertAdmin explicitly requires admin/owner; assertDeleteOrCancel delegates to assertEdit. The nine matrix assertion helpers in server/auth-routes.ts bypass for both flags. The three client helpers do too. requireUserMgmt and requireDeviceMgmt bypass for isAdmin only, as do requirePermission/requireAdmin in server/auth.ts. Permission-manager flags are another user-management path, not a matrix action. Owner parity is not universal.\n\nCount below is explicit early-success branches in the three canonical auth files (not every business-route role condition); assertAdmin/requireAdmin inverse-denial guards and derived context flags are separate from this count: **${bypasses.length}**.\n\n${bypasses.map(x=>`- ${md(x)}`).join("\n")}\n\nAn isAdmin=true user's effective matrix permissions cannot be removed through today's Permissions UI. The button is disabled for the target admin; even a saved false bit cannot defeat the bypass. The Administrator wizard option sets isAdmin rather than applying one of the seven ordinary matrices. See source inventory below for exact lines.\n\n${dbNote}\n\n| User ID | Name | isAdmin | isOwner | isFieldEngineer | canManagePermissions | permissionManagerScope | allSitesAccess | setupComplete |\n|---|---|---|---|---|---|---|---|---|\n${userRows.map(u=>`| ${[u.id,u.full_name,u.is_admin,u.is_owner,u.is_field_engineer,u.can_manage_permissions,u.permission_manager_scope??"NULL",u.all_sites_access,u.setup_complete].map(md).join(" | ")} |`).join("\n")}\n\n## Labels and every tickable cell (B5)\n\nNormal enabled cells have no tooltip. Restricted cells: “You cannot change this grant”. Grey cells: “Not used for this section”. Notify warning header: “Push notifications are disabled for this user”. UserManagement.tsx:1027–1067. View is “Access” only on hub tables. Export and Reports are separate labels, but ReportExportGate reads view_reports (Reports), not export. Delete/cancel delegates to Edit at server/auth-routes.ts:1076–1077. These are naming/behavior mismatches, not proposed changes. Approve can gate issue/reject/close/verify as shown in its route evidence. Notify reads eligibility only for concrete senders, not every possible section or event.\n\n| Section | Header today | Actual control and evidence |\n|---|---|---|\n${rows.filter(r=>r.state==="tickable").map(r=>`| ${r.section}${r.rendered?"":" **not rendered in any group**"} | ${r.label} | ${r.verdict}: ${md(r.meaning)} ${md(refText([...r.r.client,...r.r.server]))} |`).join("\n")}\n\n## Templates (B6)\n\nComputed by importing only shared/permissions.ts and calling applyRoleTemplate; includes post-builder overrides. No account receives these matrices during this audit.\n\n`;
for(const t of ROLE_TEMPLATES){
  const matrix=applyRoleTemplate(t.id), grants=SECTION_KEYS.filter(s=>ACTIONS.some(a=>matrix[s][a]));
  out+=`### ${t.label} (${t.id})\n\n${grants.map(s=>`- ${s}: ${ACTIONS.filter(a=>matrix[s][a]).join(", ")}`).join("\n")}\n\n**Create without Edit:** ${grants.filter(s=>matrix[s].create&&!matrix[s].edit).join(", ")||"none"}.\n\n`;
}
out += `## Dynamic resolution / limitations\n\nResolved wrapper sites:\n${genericResolved.map(s=>`- ${md(s)}`).join("\n")}\n\nCould not resolve:\n${[...unresolved].map(([k,v])=>`- ${k}: ${md(v)}`).join("\n")||"- None among recognized permission-call families."}\n\nThis is a syntactic/lexical source audit, not whole-program proof. Storage of a bit, editing the permission matrix, role-template assignments and unused declarations are not enforcement. LIVE does not mean API/client parity, correct business authorization, or successful execution under every additional gate. User flags are development only; published users would require a separately identified production read-only snapshot.\n`;
out += `\n## Source inventory for manual review\n\n`;
out += `### Additional explicit role-gate early returns\n\nOutside the three canonical auth files, ${otherBypasses.length} further explicit isAdmin/isOwner early-success branches exist; combined declaration-site count is ${bypasses.length+otherBypasses.length}. These are role-gate bypasses, not necessarily independent matrix consumers. This counts definitions, not calls: userHasPermission at server/auth.ts:185–195 has no current production caller, and requirePermission likewise has no current caller. Inline OR role grants are recorded at their concrete matrix-read evidence and are not counted again as early-return statements. No matrix can override an explicit role bypass. No exported assertDelete/assertExport exists in auth-routes.ts; actual helpers are assertDeleteOrCancel (Edit) and assertReportExport (Reports).\n\n${otherBypasses.map(x=>`- ${md(x)}`).join("\n")}\n\n`;
out += `## Five priority findings\n\n1. **Grey does not mean inactive.** sectionVisible reads all seven non-Notify actions (client/src/lib/auth-context.tsx:156–160); ordinary grey cells can therefore still grant page entry. The matrix says “Not used for this section” (client/src/pages/UserManagement.tsx:1059). Hub Access is a deliberate aggregate exception, not seven independent buttons.\n2. **Several visible access switches do not gate their pages.** Home and HMP/admin/masters/RMC hubs are wrapped in authentication-only RequireAuth (client/src/App.tsx:225–253); dashboard.view and hmp_hub/masters_hub/admin_hub/rmc_hub.view have no resolved feature reader.\n3. **Labels do not reliably describe the operation.** Reports controls export (client/src/components/ReportExportGate.tsx:8; server/auth-routes.ts:1031–1040), and Edit controls delete/cancel (server/auth-routes.ts:1076–1077). IRN approval UI reads Create (client/src/pages/irn/IrnDetailPage.tsx:81); closing uses Approve or Stores Create (:82; server/routes.ts:9856–9858).\n4. **Admin permissions cannot be restricted by this matrix, and Owner parity is inconsistent.** Client bypass: client/src/lib/auth-context.tsx:151/158/165. Server matrix bypass example: server/auth-routes.ts:952. Target admin Permissions button disabled: client/src/pages/UserManagement.tsx:422. Device/User management early bypasses only name isAdmin: server/auth-routes.ts:411/423. Administrator wizard is a flag choice, not an ordinary bounded matrix.\n5. **Labour Allocation exists in SECTION_ACTIONS but is absent from PERMISSION_GROUPS.** shared/permissions.ts:90/217 declares it; client/src/pages/UserManagement.tsx:132 gives view/create; server/routes.ts:23216 actually reads Create. It cannot be reached as its own permission row through normal group rendering. Its CSV UI-map state remains tickable, with rendered_in_permission_groups=false; changing the required verdict definition would conceal the distinction. Six operational templates grant Create without Edit; full section-by-section gaps are above.\n\n## A3 hint comparison\n\nThe hint is not reproduced: ${counts.DEAD} DEAD cells across ${new Set(rows.filter(r=>r.verdict==="DEAD").map(r=>r.section)).size} sections, not roughly 58 across 53. ${rows.filter(r=>r.action==="notify"&&r.verdict==="DEAD").length} tickable Notify cells are DEAD. Exact disagreements:\n\n`;
for(const [s,a] of [["user_management","create"],["user_management","edit"],["device_approval","view"],["device_approval","edit"],["stores_inventory","approve"],["equipment_performance_report","view_reports"],["labour_management","create"],["diesel_req_approve","edit"],...SECTION_KEYS.filter(s=>s.startsWith("rmc_")&&s!=="rmc_hub").map(s=>[s,"view"])]){
 const r=rows.find(r=>r.section===s&&r.action===a)!;
 out+=`- **${s}.${a}: ${r.verdict}.** ${r.meaning} ${md(refText(r.r.server.length?r.r.server:r.r.client).slice(0,1500))}\n`;
}
out += `\nNotify is traced from actual sendPushToSection callers through server/push.ts:195–211 to the stored can_notify predicate in server/storage.ts:11586–11591. PUSH_ACTIVE_SECTIONS declarations alone are not used as evidence. Per-section call locations are in CSV and the tickable-cell table. This is code wiring, not a claim that every recipient currently has notifications enabled or a working subscription.\n\n## Re-run validation and unresolved-cell count\n\nExactly ${rows.length} unique section/action pairs are emitted. All declared sections and actions are covered. ${unresolved.size ? "Unresolved calls listed above require further concrete caller tracing; cell reach cannot be claimed complete." : "Unresolved concrete permission calls: 0; unresolved cells from those calls: 0."} Generic permission-manager grant-cap reads of myPerms[section][action] (UserManagement.tsx:893–895), server matrix persistence/capping, and auth matrix loading are deliberately classified as permission administration, not feature enforcement; counting these would make every cell LIVE. Access-only LIVE cells are explicitly identified and are not claimed to enable the action named on the column. No full test suite/build is needed or run for this report-only batch; the script is executed and output shape validated independently.\n\n`;
for(const f of ["client/src/pages/UserManagement.tsx","server/auth-routes.ts","server/auth.ts"]){
 const sf=sources.get(f)!;
 sf.text.split("\n").forEach((line,i)=>{if(/disabled=.*isAdmin|__admin__|function assert|function requirePermission|function requireAdmin|const requireUserMgmt|const requireDeviceMgmt/.test(line))out+=`- ${f}:${i+1} — ${md(line.trim())}\n`;});
}
fs.mkdirSync("reports",{recursive:true});
fs.writeFileSync("reports/permission-audit.csv",csv);
fs.writeFileSync("reports/permission-audit.md",out);
console.log(JSON.stringify({sections:SECTION_KEYS.length,actions:ACTIONS.length,cells:rows.length,counts,unresolved:[...unresolved],bypasses:bypasses.length,users:userRows.length,dead:rows.filter(r=>r.verdict==="DEAD").map(r=>`${r.section}.${r.action}`)},null,2));
