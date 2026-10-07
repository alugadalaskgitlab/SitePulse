/** Read-only evidence collection. Does not import the application or execute routes. */
import fs from "node:fs";
import crypto from "node:crypto";
import ts from "typescript";
import pg from "pg";
import * as XLSX from "xlsx";
import { SECTION_KEYS, SECTION_LABELS } from "../shared/permissions";

const dir = "reports/perm-03";
fs.mkdirSync(dir, { recursive: true });
const baseline = JSON.parse(fs.readFileSync("/tmp/perm03/baseline-db.json", "utf8"));
const writes = JSON.parse(fs.readFileSync(`${dir}/permission-writes.json`, "utf8"));
const beforeRoutes = JSON.parse(fs.readFileSync("/tmp/perm03/routes-before.json", "utf8"));
const hash = (x: unknown) => crypto.createHash("sha256").update(JSON.stringify(x)).digest("hex");
const csv = (name: string, rows: object[]) => fs.writeFileSync(`${dir}/${name}.csv`,
  XLSX.utils.sheet_to_csv(XLSX.utils.json_to_sheet(rows)));
const source = fs.readFileSync("server/routes.ts", "utf8");
function routes(text: string) {
  const ast = ts.createSourceFile("routes.ts", text, ts.ScriptTarget.Latest, true);
  const result = new Map<string, string>();
  const walk = (n: ts.Node) => {
    if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression)
      && /^(get|post|put|patch|delete)$/.test(n.expression.name.text)
      && n.arguments[0] && ts.isStringLiteral(n.arguments[0]))
      result.set(`${n.expression.name.text.toUpperCase()} ${n.arguments[0].text}`, n.getText(ast));
    n.forEachChild(walk);
  };
  walk(ast);
  return result;
}
const oldRoutes = routes(fs.readFileSync("/tmp/perm03/baseline-source/server/routes.ts", "utf8"));
const newRoutes = routes(source);
const admin = beforeRoutes.filter((r: any) => r.adminOnly);
const changedAdminRoutes = admin.filter((r: any) => oldRoutes.get(`${r.method} ${r.route}`) !== newRoutes.get(`${r.method} ${r.route}`));
const plain = (s: string) => s.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[-_]/g, " ").toLowerCase();
const proposed = (path: string): string => {
  const rules: [RegExp, string][] = [
    [/ldo|flow-readings/, "admin_ldo_tools"], [/ledger|stock-correction|stock-balances|opening-stocks|recompute-balance|hlc-borrow/, "admin_ledger_tools"],
    [/export-data|import-data|reset-sequences/, "data_sync"], [/change-.*pin/, "user_management"],
    [/shift-log-manpower/, "master_personnel"], [/personnel/, "master_personnel"],
    [/vendor-rate/, "rate_cards"], [/vendor-alias/, "vendor_bill_aliases"], [/vendor-bills/, "vendor_bills"],
    [/site-material-trips/, "site_materials"], [/site-backfill|sites\/|plant-settings|\/api\/plant\//, "sites_plants_manage"],
    [/\/dprs\//, "site_dprs"], [/mix-templates|mix-types|materials\//, "master_materials"],
    [/equipment-performance/, "equipment_performance_report"], [/equipment-usage|maintenance/, "plant_equipment"],
    [/equipment\//, "master_equipment"], [/parties\//, "master_parties"],
    [/material-receipts|material-issues|material-returns/, "plant_materials"], [/dispatch/, "plant_production"],
    [/bitumen/, "plant_bitumen"], [/shift-logs/, "plant_shift_logs"], [/heating/, "plant_heating"],
    [/\/irn\//, "irn_raise"], [/purchase-indents/, "purchase_indents_approve"],
    [/diesel-requirements/, "site_diesel"], [/concrete/, "concrete_estimates_manage"],
    [/stores/, "stores_inventory"], [/rmc\/mix/, "rmc_mix_designs"], [/rmc\/batch/, "rmc_batch_records"],
    [/rmc\/cube/, "rmc_cube_tests"], [/rmc\/raw/, "rmc_raw_materials"], [/scope-segments/, "project_scope"],
    [/boq/, "qto_boq"], [/planning/, "planning_masters"], [/snl/, "norms_library"],
    [/notifications/, "admin_notifications_manage"],
  ];
  return rules.find(([re]) => re.test(path))?.[1] ?? "admin_settings";
};
const adminRows = admin.map((r: any) => {
  const body = oldRoutes.get(`${r.method} ${r.route}`) ?? "";
  const operation = [...body.matchAll(/storage\.(\w+)\(/g)].map(m => m[1]).filter(n => !/^get|^list/.test(n))[0];
  const group = /change-.*pin|devices|users/.test(r.route) ? "User and device management"
    : /backfill/.test(r.route) ? "Backfill"
    : /rebuild|reassign|transfer|fix-ledger|orphan-stock|recompute/.test(r.route) ? "Ledger rebuild/reassign/transfer"
    : /reconcil|stock-correction/.test(r.route) ? "Reconcile"
    : /export-data|import-data|reset-sequences/.test(r.route) ? "Data sync"
    : r.method === "DELETE" ? "Destructive deletes"
    : /masters|parties|materials|mix-|equipment-types|labour-types|plant-settings|manpower|\/snl\//.test(r.route) ? "Masters management" : "Other";
  const action = r.method === "DELETE" || /cancel|delete-custom|force-close/.test(r.route) ? "delete"
    : /export|\.pdf/.test(r.route) ? "export" : r.method === "GET" || /preview|review-list|eligibility/.test(r.route) ? "view" : "edit";
  const section = proposed(r.route);
  return {
    group, method: r.method, route: r.route,
    description: operation ? `${plain(operation).replace(/^./, c => c.toUpperCase())}.`
      : `${r.method === "GET" ? "Read" : "Run"} ${plain(r.route.replace(/^\/api\//, "").replace(/\/:[^/]+/g, "").replaceAll("/", " "))}.`,
    proposed_section: section, proposed_action: action,
    disposition: /Backfill|Ledger|Data sync/.test(group) ? "Keep owner-only: cross-record repair/import needs a separately reviewed operational procedure."
      : group === "Destructive deletes" ? "Potentially delegable after record/site restrictions and reversal rules are reviewed; unchanged now."
      : "Potentially delegable with a narrow section/action and existing record restrictions; unchanged now.",
    proposal_status: "Inventory proposal only; not an authorization change",
    body_unchanged: oldRoutes.get(`${r.method} ${r.route}`) === newRoutes.get(`${r.method} ${r.route}`),
    catalogue_key: (SECTION_KEYS as readonly string[]).includes(section),
  };
});
csv("admin-route-inventory", adminRows);
const changes: any[] = [];
for (const row of writes) for (const action of ["view", "create", "edit", "delete", "view_reports", "export", "approve", "notify"]) {
  const key = `can_${action}`, before = row.before?.[key] ?? false;
  if (before !== row.after[key]) changes.push({ user_id: row.after.user_id, user: row.user,
    section: row.after.section_key, action, before, after: row.after[key], permission_id: row.after.id, audit_id: row.auditId });
}
csv("permission-cell-changes", changes);
const oldDeleteSections = new Set(beforeRoutes.filter((r: any) =>
  (!r.adminOnly && r.method === "DELETE" && r.guards.some((g: string) => /assertEdit/.test(g)))
  || r.guards.some((g: string) => /assertDeleteOrCancel/.test(g)))
  .flatMap((r: any) => r.guards.filter((g: string) => /assertEdit|assertDeleteOrCancel/.test(g))
    .flatMap((g: string) => [...g.matchAll(/"([^"]+)"/g)].map(m => m[1]))));
const oldAuditBook = XLSX.read(fs.readFileSync("/tmp/perm03/baseline-audit.csv"), { type: "buffer" });
const oldAudit = XLSX.utils.sheet_to_json<any>(oldAuditBook.Sheets[oldAuditBook.SheetNames[0]]);
const oldReportSections = new Set(oldAudit.filter(r => r.action_key === "view_reports" && r.verdict === "LIVE").map(r => r.section_key));
csv("prior-edit-delete-and-report-export-grants", baseline.permissions.flatMap((p: any) => {
  const user = baseline.users.find((u: any) => u.id === p.user_id);
  if (user.is_admin || user.is_owner) return [];
  return [
    ...(p.can_edit && oldDeleteSections.has(p.section_key) ? [{ user: user.full_name, section: p.section_key, authority_before: "Edit permitting delete/cancel" }] : []),
    ...(p.can_view_reports && oldReportSections.has(p.section_key) ? [{ user: user.full_name, section: p.section_key, authority_before: "Reports permitting output (baseline reader evidence)" }] : []),
  ];
}));
const notifying = new Set([...source.matchAll(/sendPushToSection\(\s*["']([^"']+)["']/g)].map(m => m[1]));
csv("notification-coverage", SECTION_KEYS.map(section => ({
  section, label: SECTION_LABELS[section], sends_section_push: notifying.has(section),
})));
const db = new pg.Client({ connectionString: process.env.DEV_DATABASE_URL });
await db.connect();
try {
  await db.query("BEGIN READ ONLY");
  if ((await db.query("select current_database() name")).rows[0].name !== "sitelog_dev") throw Error("Wrong database");
  const users = (await db.query("select id,full_name,is_admin,is_owner,is_field_engineer,can_manage_permissions,md5(row_to_json(u)::text) hash from users u order by id")).rows;
  const permissions = (await db.query("select * from user_permissions order by id")).rows;
  const expected = new Map(baseline.permissions.map((p: any) => [p.id, p]));
  for (const w of writes) expected.set(w.after.id, w.after);
  const canonical = (rows: any[]) => rows.map(r => Object.fromEntries(Object.entries(r).sort())).sort((a, b) => Number(a.id) - Number(b.id));
  const expectedMatches = hash(canonical(permissions)) === hash(canonical([...expected.values()]));
  const result = {
    usersBefore: baseline.users.length, usersAfter: users.length,
    userHashBefore: hash(baseline.users), userHashAfter: hash(users), usersUnchanged: hash(baseline.users) === hash(users),
    permissionsBefore: baseline.permissions.length, permissionsAfter: permissions.length,
    permissionHashBefore: hash(canonical(baseline.permissions)), permissionHashAfter: hash(canonical(permissions)),
    exactAuthorizedPermissionChangesOnly: expectedMatches, changedPermissionRows: writes.length,
    insertedPermissionRows: writes.filter((w: any) => !w.before).length, changedCells: changes.length,
    adminRoutesBefore: admin.length, changedAdminRoutes: changedAdminRoutes.map((r: any) => `${r.method} ${r.route}`),
    notifySections: [...notifying].sort(),
    nonAdminExplicitGrantsRemaining: permissions.filter((p: any) => {
      const u = users.find(u => u.id === p.user_id);
      return u && !u.is_admin && !u.is_owner && (p.can_delete || p.can_export || p.can_notify);
    }).length,
  };
  fs.writeFileSync(`${dir}/integrity.json`, JSON.stringify(result, null, 2) + "\n");
  const escape = (x: unknown) => String(x ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
  const table = (rows: any[]) => {
    if (!rows.length) return "<p>None.</p>";
    const keys = Object.keys(rows[0]);
    return `<div class="scroll"><table><thead><tr>${keys.map(k => `<th>${escape(k)}</th>`).join("")}</tr></thead><tbody>${rows.map(r => `<tr>${keys.map(k => `<td>${escape(r[k])}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
  };
  const csvTable = (name: string) => {
    const book = XLSX.read(fs.readFileSync(`${dir}/${name}.csv`), { type: "buffer" });
    return table(XLSX.utils.sheet_to_json(book.Sheets[book.SheetNames[0]]));
  };
  const comparisonPath = `${dir}/test-comparison.json`;
  const comparison = fs.existsSync(comparisonPath) ? JSON.parse(fs.readFileSync(comparisonPath, "utf8")) : { status: "Full after-run comparison not yet recorded" };
  const audit = JSON.parse(fs.readFileSync("/tmp/perm03/audit-wip.json", "utf8"));
  const changed = fs.readFileSync("/tmp/perm03/changed-files.txt", "utf8").split("\n").filter(p => p && !p.startsWith("reports/part-c/"));
  const outputs = JSON.parse(fs.readFileSync(`${dir}/routes-after.json`, "utf8")).filter((r: any) => r.output)
    .map((r: any) => ({ method: r.method, route: r.route, guards: r.guards.join("; "),
      classification: r.adminOnly ? "Admin-only: unchanged" : r.guards.some((g: string) => /assertExport|assertReportExport/.test(g)) ? "Export guard present" : "Candidate requires manual classification; not certified covered" }));
  csv("output-route-candidates", outputs);
  fs.writeFileSync(`${dir}/status-report.html`, `<!doctype html><html lang="en"><meta charset="utf-8"><title>PERM-03 — incomplete implementation status</title>
<style>body{font:15px/1.55 system-ui,sans-serif;color:#17212b;max-width:1200px;margin:40px auto;padding:0 24px}h1,h2{line-height:1.2}h2{margin-top:38px}strong.warning{display:block;background:#fff0d9;border-left:5px solid #b15b00;padding:18px}.scroll{overflow:auto}table{border-collapse:collapse;width:100%;font-size:12px}td,th{border:1px solid #ccd5df;padding:7px;text-align:left;vertical-align:top}th{background:#edf2f7}pre{white-space:pre-wrap;font-size:12px;background:#f3f5f7;padding:16px}li{margin:7px 0}</style>
<h1>PERM-03 — incomplete implementation status</h1>
<strong class="warning">Not approved for publishing. Signed-in acceptance and complete control coverage have not been completed. This report distinguishes implemented changes from remaining work.</strong>
<h2>Implemented</h2><ul>
<li>Delete/cancel helpers read Delete, and export helpers and ReportExportGate read Export. Default matrices, templates and bulk grants do not automatically enable Delete, Export or Notify. Legacy permission backfills no longer infer these grants.</li>
<li>The ten specified page paths now have View gates. The catalogue retains all original rows and adds planning_masters, work_programme, work_programme_review, norms_library and edit_requests_review: 92 sections × 8 actions.</li>
<li>Edit Requests has independent View and Approve checks, with self-approval restrictions retained. Personal pages were not gated.</li>
<li>Development migration: 57 Delete, 44 Export and 50 Notify cells cleared; 18 additive View cells set. 97 permission rows changed, including 12 inserted rows. Admin/owner permission records and all user records remain unchanged.</li>
<li>All 93 inventoried assertAdmin route bodies match the immutable baseline exactly.</li></ul>
<h2>Important evidence corrections</h2><p>The source inventory found 55 DELETE routes: 40 admin-guarded, eight with Edit guards, two with assertMixCalcWrite, and five other routes. Four BOQ/SNL deletes lacked a section guard: categories, items, revisions and SNL mappings. These now have Delete guards. The fifth is estimator session logout, not a business-record deletion. The arrangement and programme-allocation routes already combined assertAuthed with Edit; they were not authentication-only. assertMixCalcWrite already checked mix_calculator.delete for deletion and retains its existing bypasses.</p>
<h2>Remaining and unverified</h2><ul>
<li>Maintenance-part removal, scope draft deletion, mix-link deletion, SNL mapping removal and push-unsubscribe controls now have Delete gates. Exhaustive control coverage has not been certified.</li>
<li>New Work Programme keys are attached to pages, but API/action and navigation coverage is not fully reconciled. Several related operations still use the old qto_boq key.</li>
<li>Reports-versus-Export on-screen behavior and all output-route candidates have not been fully certified.</li>
<li>No signed-in positive/negative browser acceptance was completed. Previously documented private verification credentials/browser files are absent in this container. An alternative temporary-account run was not completed. No new test users/devices/subscriptions were created in this run.</li>
<li>End-to-end Notify delivery with and without the bit remains unverified. The notification section inventory below is source evidence only.</li>
<li>The admin-route inventory is an automated source-based proposal, not a completed operational-safety review.</li>
<li>No production writes or publishing were performed. Publish preview has not been presented as ready.</li></ul>
<h2>Verification</h2><p>Build passed. Three focused permission/export test files passed: 61 tests. The subsequent targeted regression run passed all nine selected files after correcting fixtures and separating on-screen preview access from Export. The initial overlapping baseline was discarded; an immutable pre-change snapshot produced 328 files, 4,575 tests, 4,524 passes, 48 failures and three skips. The startup preview screenshot is not signed-in UI evidence.</p>
<pre>${escape(JSON.stringify(comparison, null, 2))}</pre>
<h2>Permission audit</h2>${table([{ phase: "PERM-02", LIVE: 205, DEAD: 3, HIDDEN: 0, "CORRECTLY-OFF": 488 }, { phase: "Current partial implementation", ...audit.counts }])}
<p>The three retained dead cells are vendor_bill_aliases.view, admin_notifications_manage.view and push_notifications.view. Source audit counts do not prove browser behavior.</p>
<h2>Before/after checksums and boundary checks</h2><pre>${escape(JSON.stringify(result, null, 2))}</pre>
<h2>Exact permission-cell writes</h2>${table(changes)}
<h2>Prior Edit-delete and Reports-export authority</h2><p>Information only: these are baseline grants with identified action readers, not new grants. Admin/owner users retain their existing bypass.</p>${csvTable("prior-edit-delete-and-report-export-grants")}
<h2>Notification coverage — every section</h2>${csvTable("notification-coverage")}
<h2>Admin-only inventory — all 93, unchanged</h2>${table(adminRows)}
<h2>Output-route candidates and present guards</h2>${table(outputs)}
<h2>Files changed or added</h2><p>Pre-existing unrelated reports/part-c PDF changes are excluded.</p><pre>${escape([...new Set(changed)].join("\n"))}</pre>
<h2>Test additions and changes</h2><ul>
<li>permissionDelegation: new tests execute production permission helpers and check independent bits, authentication, admin/owner bypasses, and default/template exclusions.</li>
<li>permission-map: updated the expected catalogue size and action map for the five additional keys and independent actions.</li>
<li>vendorExportPermissions and wholeBillPageIntegration: Export, rather than Reports, determines output eligibility.</li>
<li>attachmentGalleryViewer: supplies an authenticated permission context for the new Delete gate while retaining viewer/history checks.</li>
<li>dprBreakdownPersistence and materialReceiptSubmittedEdit: retain existing source-scope/edit tests while checking the independent Delete control.</li>
<li>perm01MatrixUi: Home's subscription removal is now a real Delete action, not an inert cell.</li>
<li>progressReportExportRoute and push-subscription-routes-reliability: mocks expose the production Export/Delete helpers now used by their routes.</li>
<li>vendorPayablesPreview and vendorPayablesPreviewUi: screen access remains Reports; download revalidation uses Export explicitly. Added separate allow/deny tests for export revalidation.</li></ul>
<p>account-push-notification, push-notification-setup and scopeConfirmedReachEditBatch03 received authenticated permission fixtures after the final full run. Their follow-up run passed all 16 tests across three files. The full suite was not repeated after these test-only fixture corrections; the original 51-failure full-run evidence is retained rather than rewritten as a 48-failure run.</p>
<h2>Acceptance evidence status</h2><p>Requested signed-in cases 1–7 are unverified. Unit/component/endpoint fixtures are not substitutes for signed-in screenshots or real push delivery. Z1 is verified by the exact database comparison above; Z2 is recorded in the test comparison; Z3 build passed; Z4 audit was regenerated. No follow-up tasks or PERM-04 work were created.</p>
</html>`);
  console.log(JSON.stringify(result, null, 2));
  await db.query("ROLLBACK");
} finally { await db.end(); }
