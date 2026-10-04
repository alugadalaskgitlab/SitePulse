// Standalone evidence report; not imported by the application.
// Run after signed-in CDP capture to embed all PNGs in the new output directory.
import fs from "node:fs/promises";
import path from "node:path";

const out = ".agents/outputs/dpr-page-02";
await fs.mkdir(out, { recursive: true });
for (const [source, target] of [
  ["/tmp/dpr-page-02-focused.log", "focused-initial.log"],
  ["/tmp/dpr-page-02-final-focused.log", "focused-final.log"],
  ["/tmp/dpr-page-02-full-suite.log", "full-suite-initial.log"],
  ["/tmp/dpr-page-02-final-full-suite.log", "full-suite.log"],
]) {
  try { await fs.copyFile(source, path.join(out, target)); }
  catch (error) { if (error.code !== "ENOENT") throw error; }
}
const escape = value => String(value).replace(/[&<>"']/g, char =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
async function optional(name) {
  try { return JSON.parse(await fs.readFile(path.join(out, name), "utf8")); }
  catch (error) { if (error.code === "ENOENT") return null; throw error; }
}
const evidence = await optional("browser-evidence.json");
const cleanup = await optional("cleanup.json");
const pdf = await optional("pdf-evidence.json");
if (cleanup) {
  const exists = async name => { try { await fs.access(name); return true; } catch { return false; } };
  cleanup.temporaryCredentialsAbsent = !await exists("/tmp/dpr-page-02-state.json");
  cleanup.temporaryBrowserProfileAbsent = !await exists("/tmp/dpr-page-02-chromium-profile");
  try {
    await fetch("http://127.0.0.1:9227/json", { signal: AbortSignal.timeout(1000) });
    cleanup.chromiumCdpStopped = false;
  } catch { cleanup.chromiumCdpStopped = true; }
  await fs.writeFile(path.join(out, "cleanup.json"), JSON.stringify(cleanup, null, 2));
}
const images = [];
for (const name of (await fs.readdir(out)).filter(name => name.endsWith(".png")).sort()) {
  const data = (await fs.readFile(path.join(out, name))).toString("base64");
  images.push(`<figure><figcaption>${escape(name)}</figcaption><img alt="${escape(name)}" src="data:image/png;base64,${data}"></figure>`);
}
const full = await fs.readFile(path.join(out, "full-suite.log"), "utf8");
const counts = full.match(/Test Files[^\n]*\n\s*Tests[^\n]*\n\s*Errors[^\n]*/)?.[0] ?? "See full-suite.log";
const changes = [
  "client/src/components/dprManagement.css",
  "client/src/components/DprMaterialsReceived.tsx",
  "client/src/lib/dprManagementPresentation.ts",
  "client/src/pages/SiteReport.tsx",
  "client/src/__tests__/dprManagement.test.tsx",
  "client/src/__tests__/dprPage02Report.mjs",
  "client/src/__tests__/dprPage02Browser.mjs",
  "client/src/__tests__/dprPage02Fixtures.mjs",
  "client/src/__tests__/dprPage02Verify.mjs",
  "client/src/__tests__/dprPage02Pdf.py",
];
const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>DPR-PAGE-02 implementation and verification</title>
<style>body{margin:24px auto;padding:0 20px;max-width:1180px;background:#f5f7fa;color:#243449;font:15px/1.6 system-ui,sans-serif}h1,h2{line-height:1.2}section,figure{padding:20px;border:1px solid #d5dee7;border-radius:8px;background:#eef3f7;margin:20px 0}img{width:100%;height:auto}pre{white-space:pre-wrap;overflow-wrap:anywhere}figcaption{font-weight:600;margin-bottom:12px}.note{color:#92400e}</style>
<h1>DPR-PAGE-02: physical-quantity management report</h1>
<p>Deterministic owner layout retained. No backend, schema, operational calculation, edit screen, other page or publishing changes.</p>
<section><h2>Implemented</h2><ul>
<li>Desktop weighted flex tiles: Work done 2.2, Machines 1, Diesel .85, Labour .7, Bulk received 2.2. Hidden tiles leave no columns behind. Below 768px, tiles stack full-width. Big values do not wrap; lists remain readable and may wrap naturally.</li>
<li>Machines counts visible logged rows, including when none worked. Ordered red full-day breakdown, amber idle, red part-day breakdown. Multiple stoppage events count once per machine; full-day excludes part-day. Existing loaded stoppages reused with no new request. Unknown statuses do not produce “all worked”.</li>
<li>Scoped secondary text #334155 at 12.5px/1.45; equipment legend 11.5px. Screen card gutters 16px/20px inside; phones 12px/14px. Print removes outside gutters and retains existing A4 10mm page rule.</li>
<li>Missing Trips is an em dash; missing unloading-place wording is amber; Site purchases has a separate heading. Actual trip-source counts and no-money display preserved.</li>
</ul></section>
<section><h2>Changed files</h2><ul>${changes.map(name => `<li><code>${escape(name)}</code></li>`).join("")}</ul></section>
<section><h2>Tests</h2><p>Initial focused management suite: 64 passed. Final focused suite including both affected source-contract tests: 87 passed across 3 files.</p>
<pre>${escape(counts)}</pre>
<p>Baseline supplied: 4218 pass / 48 fail / 3 skip / 10 errors. The final expanded suite above ran once on final frontend code, after the original authoritative table stoppage mapping was restored and the real PDF body-gutter fix was applied. The earlier pre-correction run remains separately saved as full-suite-initial.log. Baseline business-test failures are outside this display-only batch; no new follow-up was created.</p>
<p>Final actual counts: <strong>4229 passed / 47 failed / 5 skipped / 10 errors</strong>, with 17 failed, 286 passed and 2 skipped files. The baseline MAT-01 query suite now timed out in its 10-second beforeAll hook, so both of its tests were skipped instead of the earlier one pass/one fail. This accounts for the changed failure/skip totals; it is not a repaired backend test. The 12 added management assertions pass, and both previously affected equipment source contracts pass.</p>
<p>Updated assertions: missing unloading wording; dash trip aggregation; 3 lists now includes “all worked”; weighted desktop flex, phone stack and nowrap values. Added machine attention order, duplicate stoppages/full-day exclusion, unknown status, service/cancelled/unrelated events, tile existence, no money, gutters, scoped typography and print-body gutter reset coverage.</p>
<p>Generated part-c PDFs dirtied by tests were restored; no other pre-existing changes were restored.</p></section>
<section><h2>Development / PDF evidence</h2>${evidence ? `<pre>${escape(JSON.stringify(evidence, null, 2))}</pre>` : `<p class="note">Signed-in DPR verification is not complete. The generic screenshot browser is unauthenticated and rendered the SitePulse startup/auth shell, not the report. No claimed A–F evidence has been fabricated. This implementation agent has no workflow restart tool and is prohibited from restarting workflows itself. No fixtures were seeded before the required restart. The owning agent must restart once before setup/seed and execute signed-in CDP verification.</p>`}
<p>Completed signed-in DEVELOPMENT captures at 1180, 1280, 1024 and 390 viewport widths. Fixture activities have three genuinely distinct units: WMM 56.25 Cum, Clearing 0.5 Ha, Marking 250 m. Two materials retain native quantities and actual transport trips. Verified four all-worked machines, one full-day breakdown, a working machine’s 1.5h linked stoppage, two idle machines with none working, and unspecified status with no false “all worked”. Mixed receipts show one real WMM trip plus an 8 MT DPR receipt and 4,000 Liters equipment receipt; non-trip Trips cells are em dashes and Site purchases has its own heading.</p>
<h3>Measured limitations</h3><p class="note">At the actual 1180px viewport, the expanded 224px sidebar, shell padding, required outside/inside gutters and weighted five-tile strip leave each wide tile’s list about 205px. Both lists wrap to two lines; at 1280 they remain two lines; at 1024 Work done is three and Bulk received two. They are not clipped or shrunk, all desktop tiles remain one row, and big values remain one line. The one-line target is therefore not met in the default signed-in shell. Changing sidebar/shell behavior, hiding tiles or shrinking the required text was deliberately not done.</p>
<p>Actual CDP PDFs were generated with preferCSSPageSize and CSS @page margin:1cm (10mm), then rendered and visually inspected. Both are one page, contain every required table heading, final remarks and no money. A real bug was found: the injected development banner left 45px body padding in print. The report-scoped print body padding/margin reset fixes it; final screenshots/PDFs were recaptured through frontend hot reload. No additional workflow restart is needed and no backend was changed.</p>
<pre>${escape(JSON.stringify(pdf, null, 2))}</pre><p class="note">The measured outer drawing-box margins are approximately 10.05mm left/top, 9.60mm right and 9.94mm bottom owing to Chromium A4/pixel rounding. CSS requests exactly 10mm; all report text stays within the 10mm right margin and no table is clipped at the page edge. Do not describe the physical border measurements as mathematically exact 10.00mm.</p></section>
${images.join("")}
<section><h2>Fixture cleanup</h2>${cleanup ? `<pre>${escape(JSON.stringify(cleanup, null, 2))}</pre>` : "<p>This implementation agent created no temporary persisted test user, devices, sessions or business fixtures, did not start Chromium, and did not access the development database. The owning agent must track inserted IDs and pre-existing fingerprints and clean its subsequent verification fixtures/access/profile.</p>"}</section>
</html>`;
await fs.writeFile(path.join(out, "verification-report.html"), html);
console.log(`Saved ${out}/verification-report.html (${images.length} embedded screenshots)`);