/**
 * PERM-01 B: evaluate the SAME currently saved matrices against verified
 * pre-B and current code. This is not a historical permission snapshot.
 * Read-only user query; no app server or business writes.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { pool } from "../server/db";
import { emptyMatrix, type Action, type PermissionMatrix, type SectionKey } from "../shared/permissions";

// Parent of the first commit that introduced Part B. Pin, rather than HEAD^,
// because later commits can change unrelated app and permission source.
const BASELINE_SHA = "ce8212da79907ffbde97a49827d668b5edaef486";

const targets: Array<[string, string, Action, SectionKey]> = [
  ["post", "/api/sites", "create", "sites_plants_manage"],
  ["patch", "/api/sites/:id", "edit", "sites_plants_manage"],
  ["post", "/api/sites/seed", "create", "sites_plants_manage"],
  ["post", "/api/plant", "create", "sites_plants_manage"],
  ["patch", "/api/plant/:id", "edit", "sites_plants_manage"],
  ["post", "/api/notifications", "create", "admin_notifications_manage"],
  ["post", "/api/vendor-aliases", "create", "vendor_masters_manage"],
  ["post", "/api/vendor-rate-cards", "create", "vendor_masters_manage"],
  ["post", "/api/vendor-rate-cards/bulk-upsert", "create", "vendor_masters_manage"],
  ["post", "/api/concrete-estimates", "create", "concrete_estimates_manage"],
  ["patch", "/api/concrete-estimates/:id", "edit", "concrete_estimates_manage"],
  ["post", "/api/concrete/v2/estimates", "create", "concrete_estimates_manage"],
  ["patch", "/api/concrete/v2/estimates/:id", "edit", "concrete_estimates_manage"],
];
function handler(source: string, method: string, route: string) {
  const start = source.indexOf(`app.${method}("${route}",`);
  if (start < 0) throw new Error(`Missing ${method} ${route}`);
  const end = source.indexOf("\n  app.", start + 1);
  return source.slice(start, end < 0 ? undefined : end);
}
function concreteGate(source: string): SectionKey[] {
  const matches = [...source.matchAll(/<Route path="\/admin\/concrete-estimates" component=\{gatedEither\(ConcreteEstimates, ([^)]+)\)\} \/>/g)];
  if (matches.length !== 1) throw new Error("Expected exactly one concrete estimates client route");
  const keys = [...matches[0][1].matchAll(/"([^"]+)"/g)].map(m => m[1] as SectionKey);
  if (!keys.length || keys.length !== matches[0][1].split(",").length) throw new Error("Unexpected client route gate syntax");
  return keys;
}
function visible(matrix: PermissionMatrix, key: SectionKey) {
  const row = matrix[key];
  return row.view || row.create || row.edit || row.delete || row.view_reports || row.export || row.approve;
}

async function main() {
  const testOutput = execFileSync("npx", ["vitest", "run", "tests/perm01PartBHandlers.test.ts"], { encoding: "utf8", timeout: 120_000 });
  if (!/15 passed/.test(testOutput)) throw new Error("Expected 15 passing mocked-storage handler tests");
  const original = execFileSync("git", ["show", `${BASELINE_SHA}:server/routes.ts`], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  const changed = readFileSync("server/routes.ts", "utf8");
  for (const [method, route, action, granular] of targets) {
    const verb = action === "create" ? "Create" : "Edit";
    if (!handler(original, method, route).includes(`assert${verb}(req, res, "admin_settings")`)) throw new Error(`Legacy baseline changed: ${route}`);
    if (!handler(changed, method, route).includes(`assert${verb}Either(req, res, "${granular}", "admin_settings")`)) throw new Error(`Missing additive guard: ${route}`);
  }
  const clientBefore = concreteGate(execFileSync("git", ["show", `${BASELINE_SHA}:client/src/App.tsx`], { encoding: "utf8" }));
  const clientAfter = concreteGate(readFileSync("client/src/App.tsx", "utf8"));
  if (clientBefore.join(",") !== "concrete_calculator,reports" ||
    clientBefore.some(k => !clientAfter.includes(k)) ||
    !clientAfter.includes("admin_settings") || !clientAfter.includes("concrete_estimates_manage")) {
    throw new Error("Concrete client gate baseline/current keys do not preserve existing access plus legacy and granular keys");
  }

  // One read-only repeatable-read snapshot of the CURRENT saved assignments.
  // Do not query credentials or write to user_permissions/business records.
  const client = await pool.connect();
  let users: Array<{ id: number; fullName: string; isAdmin: boolean; isOwner: boolean }> = [];
  let rows: Array<{ userId: number; sectionKey: string; canCreate: boolean; canEdit: boolean; canView: boolean; canDelete: boolean; canViewReports: boolean; canExport: boolean; canApprove: boolean; canNotify: boolean }> = [];
  try {
    await client.query("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
    users = (await client.query(
      `SELECT id, full_name AS "fullName", is_admin AS "isAdmin", is_owner AS "isOwner"
       FROM users WHERE is_active = true AND (is_admin = true OR is_owner = true OR EXISTS
         (SELECT 1 FROM user_permissions p WHERE p.user_id = users.id
          AND p.section_key = 'admin_settings' AND (p.can_create OR p.can_edit)))
       ORDER BY CASE WHEN is_admin OR is_owner THEN 0 ELSE 1 END, id LIMIT 3`
    )).rows;
    if (!users.length) throw new Error("No active admin/PM available for comparison");
    rows = (await client.query(
      `SELECT user_id AS "userId", section_key AS "sectionKey",
         can_view AS "canView", can_create AS "canCreate", can_edit AS "canEdit",
         can_delete AS "canDelete", can_view_reports AS "canViewReports",
         can_export AS "canExport", can_approve AS "canApprove", can_notify AS "canNotify"
       FROM user_permissions WHERE user_id = ANY($1::int[])`, [users.map(u => u.id)]
    )).rows;
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
  const comparisons = users.map(user => {
    const matrix = emptyMatrix();
    for (const row of rows.filter(r => r.userId === user.id)) {
      if (!(row.sectionKey in matrix)) continue;
      matrix[row.sectionKey as SectionKey] = {
        view: row.canView, create: row.canCreate, edit: row.canEdit, delete: row.canDelete,
        view_reports: row.canViewReports, export: row.canExport, approve: row.canApprove, notify: row.canNotify,
      };
    }
    const bypass = user.isAdmin || user.isOwner;
    const decisions = targets.map(([method, route, action, granular]) => {
      const legacyBit = matrix.admin_settings[action];
      const granularBit = matrix[granular][action];
      const before = bypass || legacyBit;
      const after = before || granularBit;
      return {
        route: `${method.toUpperCase()} ${route}`, action,
        legacyKey: "admin_settings", legacyBit, granularKey: granular, granularBit,
        adminOwnerBypass: bypass, before, after,
        reason: bypass ? "admin/owner bypass before and after"
          : legacyBit ? `admin_settings.${action} grants both versions`
          : granularBit ? `${granular}.${action} newly grants access`
          : "neither same-action key granted; denied before and after",
      };
    });
    const beforeOtherKeys = clientBefore.filter(key => visible(matrix, key));
    const afterOtherKeys = clientAfter.filter(key => visible(matrix, key));
    const clientDecision = {
      route: "CLIENT /admin/concrete-estimates", action: "entry",
      legacyKey: "admin_settings", legacyBit: visible(matrix, "admin_settings"),
      granularKey: "concrete_estimates_manage", granularBit: visible(matrix, "concrete_estimates_manage"),
      adminOwnerBypass: bypass,
      originalGateKeys: clientBefore, currentGateKeys: clientAfter,
      before: bypass || beforeOtherKeys.length > 0,
      after: bypass || afterOtherKeys.length > 0,
      reason: bypass ? "admin/owner bypass before and after"
        : beforeOtherKeys.length ? `pre-existing entry gate (${beforeOtherKeys.join(", ")}) grants both versions`
        : afterOtherKeys.length ? `newly granted via ${afterOtherKeys.join(", ")}`
        : "no visible gate key; denied before and after",
    };
    const allDecisions = [...decisions, clientDecision];
    const losses = allDecisions.filter(d => d.before && !d.after).length;
    if (losses) throw new Error(`Access loss detected for ${user.fullName}`);
    return {
      displayName: user.fullName, isAdmin: user.isAdmin, isOwner: user.isOwner,
      targetedBefore: allDecisions.filter(d => d.before).length,
      targetedAfter: allDecisions.filter(d => d.after).length,
      targetedChecks: allDecisions.length, losses,
      decisions: allDecisions,
    };
  });
  mkdirSync("reports/perm01", { recursive: true });
  const report = "reports/perm01/part-b-evidence.json";
  const textReport = "reports/perm01/part-b-evidence.txt";
  const provenance = `Pinned pre-B source commit ${BASELINE_SHA}; current working-tree sources. Same CURRENT saved permissions evaluated under both code paths; NOT a historical user-permission snapshot.`;
  writeFileSync(report, JSON.stringify({
    label: "PERM-01 B — per-action actual-user decision comparison",
    provenance, baselineCommit: BASELINE_SHA,
    matrixSource: "current active user permission rows, one repeatable-read READ ONLY transaction",
    mockedHandlerTestsPassed: 15, verifiedServerRoutes: targets.length,
    verifiedClientRoute: "/admin/concrete-estimates", comparisons,
    conclusion: "No sampled admin/PM loses a targeted decision",
  }, null, 2) + "\n");
  const lines = [
    "PERM-01 B — real-user per-action comparison (no business operations)",
    provenance,
    "Server: before = bypass OR legacy same-action; after = before OR granular same-action.",
    "Client: before/after = bypass OR visibility of each source-verified entry key.",
    "HTTP tests: 15/15 mocked-storage handlers passed.",
  ];
  for (const user of comparisons) {
    lines.push("", `${user.displayName} [admin=${user.isAdmin}, owner=${user.isOwner}]: ${user.targetedBefore}/${user.targetedChecks} before -> ${user.targetedAfter}/${user.targetedChecks} after; losses=${user.losses}`);
    for (const d of user.decisions) {
      lines.push(`  ${d.route} [${d.action}]: legacy ${d.legacyKey}=${d.legacyBit}, granular ${d.granularKey}=${d.granularBit}, bypass=${d.adminOwnerBypass}, before=${d.before}, after=${d.after}; ${d.reason}`);
    }
  }
  writeFileSync(textReport, lines.join("\n") + "\n");
  console.log(`PASS: ${targets.length} additive server routes + 1 client gate, ${comparisons.length} current real users, 0 losses. Baseline ${BASELINE_SHA}. Evidence: ${report}, ${textReport}`);
}
main().catch(error => { console.error(`PERM-01 B evidence FAILED: ${error.message}`); process.exitCode = 1; });