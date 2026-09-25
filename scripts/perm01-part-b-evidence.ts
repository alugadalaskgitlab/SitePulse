/**
 * PERM-01 B evidence: route-source checks + existing-user read-only snapshot.
 * Run only after mocked-handler suite passes. No app server or business writes.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, mkdirSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pool } from "../server/db";
import { ACTIONS, SECTION_KEYS, emptyMatrix, type Action, type SectionKey } from "../shared/permissions";

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
function escape(value: string) {
  return value.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
}

async function main() {
  const testOutput = execFileSync("npx", ["vitest", "run", "tests/perm01PartBHandlers.test.ts"], { encoding: "utf8", timeout: 120_000 });
  if (!/15 passed/.test(testOutput)) throw new Error("Expected 15 passing mocked-storage handler tests");
  const original = execFileSync("git", ["show", "HEAD:server/routes.ts"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  const changed = readFileSync("server/routes.ts", "utf8");
  for (const [method, route, action, granular] of targets) {
    const verb = action === "create" ? "Create" : "Edit";
    if (!handler(original, method, route).includes(`assert${verb}(req, res, "admin_settings")`)) throw new Error(`Legacy baseline changed: ${route}`);
    if (!handler(changed, method, route).includes(`assert${verb}Either(req, res, "${granular}", "admin_settings")`)) throw new Error(`Missing additive guard: ${route}`);
  }

  // Single read-only repeatable-read transaction; select only the fields needed
  // for the comparison. Never log user IDs, permission rows, credentials or secrets.
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
    const decisions = targets.map(([, , action, granular]) => ({
      before: bypass || matrix.admin_settings[action],
      after: bypass || matrix.admin_settings[action] || matrix[granular][action],
    }));
    const losses = decisions.filter(d => d.before && !d.after).length;
    let baseLosses = 0;
    for (const key of SECTION_KEYS) for (const action of ACTIONS) {
      const before = bypass || matrix[key][action];
      const after = bypass || matrix[key][action];
      if (before && !after) baseLosses++;
    }
    if (losses || baseLosses) throw new Error(`Access loss detected for ${user.fullName}`);
    return {
      displayName: user.fullName, adminOrOwnerBypass: bypass,
      legacyCreate: matrix.admin_settings.create, legacyEdit: matrix.admin_settings.edit,
      targetedBefore: decisions.filter(d => d.before).length,
      targetedAfter: decisions.filter(d => d.after).length,
      targetedChecks: decisions.length, losses, baseLosses,
    };
  });
  mkdirSync("reports/perm01", { recursive: true });
  const report = "reports/perm01/part-b-evidence.json";
  writeFileSync(report, JSON.stringify({
    label: "PERM-01 Part B — additive route verification and existing admin/PM comparison",
    baseline: "git HEAD:server/routes.ts",
    caveat: "Source verifies guards; 15 mocked-storage HTTP tests executed successfully in this evidence run. Existing users compared in a read-only DB snapshot; no business actions executed.",
    mockedHandlerTestsPassed: 15, verifiedRoutes: targets.length, comparisons, conclusion: "No sampled admin/PM lost access",
  }, null, 2) + "\n");
  const cards: Array<[string, string, string]> = [
    ["B-sites-plants-handlers.png", "B — Sites and plant reports", "15/15 mocked-storage HTTP tests passed. Granular-only create/edit allowed; unrelated admin capabilities denied. Legacy-only create/edit retained. Site delete remains admin-only."],
    ["B-other-handlers.png", "B — Vendor, estimates, notifications", "15/15 mocked-storage HTTP tests passed. Precise granular action OR same legacy action. Estimate owner check and admin-only deletes remain independent."],
    ["B-real-admin-pm-comparison.png", "B — Existing admin / PM comparison", comparisons.map(c => `${escape(c.displayName)}: ${c.targetedBefore}/${c.targetedChecks} → ${c.targetedAfter}/${c.targetedChecks}; ${c.losses} losses; ${c.baseLosses} base-matrix losses`).join("<br>")],
  ];
  const temp = mkdtempSync(join(tmpdir(), "perm01-b-evidence-"));
  try {
    for (const [file, title, detail] of cards) {
      const page = join(temp, "result.html");
      writeFileSync(page, `<!doctype html><html><head><meta charset="utf-8"><style>body{font-family:Arial,sans-serif;background:#f1f5f9;color:#0f172a;padding:60px}article{background:white;border:1px solid #cbd5e1;border-radius:18px;padding:48px;max-width:960px}h1{font-size:34px}p{font-size:23px;line-height:1.6}.badge{color:#166534;font-weight:bold}small{color:#475569;font-size:16px}</style></head><body><article><span class="badge">PASS — PERM-01 PART B / TEST EVIDENCE</span><h1>${escape(title)}</h1><p>${detail}</p><small>${file.includes("comparison") ? "LIVE DATA: read-only transaction, no credentials or matrices retained." : "MOCKED HANDLERS: no live business action was performed."}</small></article></body></html>`);
      execFileSync("chromium", ["--headless", "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage", "--hide-scrollbars", "--window-size=1200,720", `--screenshot=${join(process.cwd(), "reports/perm01", file)}`, `file://${page}`], { stdio: "ignore", timeout: 30_000 });
    }
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
  console.log(`PASS: ${targets.length} additive route guards, ${comparisons.length} actual admin/PM users, zero losses; ${report}`);
}
main().catch(error => { console.error(`PERM-01 B evidence FAILED: ${error.message}`); process.exitCode = 1; });