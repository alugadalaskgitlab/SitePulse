/*
 * DPR19 B1 — actual SiteDashboard browser assertions against isolated,
 * synthetic GET responses. No customer database. Parent starts fixture Vite
 * and Chromium CDP before running this verifier.
 * DPR_FIXTURE_URL=http://127.0.0.1:4178 CDP_URL=http://127.0.0.1:9222
 * node tests/fixtures/dpr-site-entry/verify-dpr19-b1.mjs
 */
import WebSocket from "ws";
import { mkdirSync, writeFileSync } from "node:fs";

const base = process.env.DPR_FIXTURE_URL || "http://127.0.0.1:4178";
const cdp = process.env.CDP_URL || "http://127.0.0.1:9222";
const target = await (await fetch(`${cdp}/json/new?about:blank`, { method: "PUT" })).json();
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { socket.once("open", resolve); socket.once("error", reject); });
let serial = 0;
const pending = new Map();
const exceptions = [];
socket.on("message", raw => {
  const msg = JSON.parse(raw);
  if (msg.method === "Runtime.exceptionThrown") exceptions.push(msg.params.exceptionDetails);
  if (msg.method === "Page.javascriptDialogOpening") void call("Page.handleJavaScriptDialog", { accept: true });
  const item = pending.get(msg.id);
  if (!item) return;
  clearTimeout(item.timer);
  pending.delete(msg.id);
  msg.error ? item.reject(new Error(`${item.method}: ${msg.error.message}`)) : item.resolve(msg.result);
});
function call(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++serial;
    const timer = setTimeout(() => reject(new Error(`CDP timeout: ${method}`)), 20000);
    pending.set(id, { method, resolve, reject, timer });
    socket.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const result = await call("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
  return result.result?.value;
}
async function wait(expression) {
  for (let i = 0; i < 200; i++) {
    if (await evaluate(expression)) return;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out: ${expression}; body: ${await evaluate("document.body.innerText.slice(-1800)")}; exceptions: ${JSON.stringify(exceptions)}`);
}
function check(condition, message, evidence) {
  if (!condition) throw new Error(`${message}: ${JSON.stringify(evidence)}`);
}

const output = "tests/fixtures/dpr-site-entry/evidence";
mkdirSync(output, { recursive: true });
await call("Page.enable");
await call("Runtime.enable");
const findings = [];
try {
  for (const [device, width, height] of [["desktop", 1440, 900], ["mobile", 390, 844]]) {
    if (device === "mobile") await evaluate(`sessionStorage.removeItem('siteDashboardState')`);
    await call("Emulation.setDeviceMetricsOverride", {
      // Fixture index has no viewport meta; narrow CSS viewport without
      // mobile emulation avoids Chromium's legacy 980px layout viewport.
      width, height, deviceScaleFactor: 1, mobile: false,
    });
    // Explicit empty reference filter wins over any prior localStorage state.
    await call("Page.navigate", { url: `${base}/site/dashboard?dpr19b1=1&reference=&origin=portal` });
    await wait('!!document.querySelector(\'[data-testid="card-report-6318"]\')');
    const evidence = await evaluate(`(() => {
      const ids = [6311,6312,6313,6314,6315,6316,6317,6318];
      const rows = Object.fromEntries(ids.map(id => {
        const card = document.querySelector('[data-testid="card-report-'+id+'"]');
        const text = key => card?.querySelector('[data-testid="'+key+'-'+id+'"]')?.textContent?.trim() || null;
        return [id, { present: !!card, draft: text('badge-draft'),
          readiness: text('badge-readiness'), reason: text('readiness-reason'),
          fix: text('button-fix'), pending: text('badge-pending-closing'),
          bounds: card ? { left: card.getBoundingClientRect().left, right: card.getBoundingClientRect().right } : null }];
      }));
      return { rows, viewport: innerWidth, documentWidth: document.documentElement.scrollWidth,
        get: window.__DprSiteFixture?.requests.filter(r => r.method === 'GET' && r.path.startsWith('/api/dprs/with-details')),
        writes: window.__DprSiteFixture?.requests.filter(r => r.method !== 'GET') };
    })()`);
    for (const id of [6311, 6312, 6313, 6314, 6315, 6316, 6317, 6318]) {
      check(evidence.rows[id].present, `Missing actual dashboard card ${id} on ${device}`, evidence);
      check(evidence.rows[id].bounds.left >= -1 && evidence.rows[id].bounds.right <= width + 1,
        `Card ${id} outside ${device} viewport`, evidence.rows[id]);
    }
    check(evidence.get?.length > 0 && !evidence.writes?.length, "Fixture must be read-only GET data", evidence);
    check(evidence.documentWidth <= width + 1, `${device} horizontal page overflow`, evidence);
    const readinessEvidence = await evaluate(`(async () => {
      const rows = await (await fetch('/api/dprs/with-details')).json();
      return Object.fromEntries(rows.map(row => [row.id, row.draftReadiness ?? null]));
    })()`);
    check(readinessEvidence[6311]?.state === "blocked" && readinessEvidence[6311].mandatory[0]?.message === evidence.rows[6311].reason
      && readinessEvidence[6312]?.state === "blocked" && readinessEvidence[6312].mandatory[0]?.message === evidence.rows[6312].reason
      && readinessEvidence[6313]?.state === "ready" && readinessEvidence[6313].mandatory.length === 0
      && readinessEvidence[6314]?.state === "ready" && readinessEvidence[6314].mandatory.length === 0
      && readinessEvidence[6314].advisories.length > 0 && readinessEvidence[6315]?.state === "unavailable",
    "Shared backend evaluator fixture contract / actual first reason / advisory-only", readinessEvidence);
    for (const id of [6311, 6312, 6313, 6314, 6315]) check(evidence.rows[id].draft === "Draft", `Draft badge ${id}`, evidence.rows[id]);
    check(evidence.rows[6311].readiness === "Not ready" && evidence.rows[6311].fix === "Fix"
      && /material|outcome/i.test(evidence.rows[6311].reason || ""), "Missing material outcome first reason/Fix", evidence.rows[6311]);
    check(evidence.rows[6312].readiness === "Not ready" && evidence.rows[6312].fix === "Fix"
      && /closing meter reading required/i.test(evidence.rows[6312].reason || "")
      && /Pending Closing/.test(evidence.rows[6312].pending || ""), "Closing meter readiness", evidence.rows[6312]);
    for (const id of [6313, 6314]) check(evidence.rows[id].readiness === "No readiness blockers"
      && !evidence.rows[id].fix && !evidence.rows[id].reason, `Ready/advisory-only must not show Fix ${id}`, evidence.rows[id]);
    check(evidence.rows[6315].readiness === "Readiness unavailable" && !evidence.rows[6315].fix,
      "Unavailable must not be reported as ready/blocked", evidence.rows[6315]);
    for (const id of [6316, 6317, 6318]) check(!evidence.rows[id].draft && !evidence.rows[id].readiness
      && !evidence.rows[id].fix, `Non-active draft must not get readiness action ${id}`, evidence.rows[id]);
    if (device === "mobile") {
      const layout = await evaluate(`(() => {
        const rect = node => { const r = node?.getBoundingClientRect(); return r && {
          left: r.left, right: r.right, top: r.top, bottom: r.bottom
        }; };
        return [6311, 6312].map(id => {
          const card = document.querySelector('[data-testid="card-report-'+id+'"]');
          const header = card.querySelector('[data-testid="header-report-'+id+'"]');
          const element = key => card.querySelector('[data-testid="'+key+'-'+id+'"]');
          return { id, card: rect(card), identity: rect(header.firstElementChild),
            reason: rect(element('readiness-reason')), fix: rect(element('button-fix')),
            expand: rect(element('button-expand')), view: rect(element('button-view')) };
        });
      })()`);
      const overlap = (a, b) => Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1
        && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1;
      for (const row of layout) {
        check(!overlap(row.identity, row.reason) && !overlap(row.reason, row.fix)
          && !overlap(row.fix, row.expand) && !overlap(row.fix, row.view)
          && !overlap(row.reason, row.expand) && !overlap(row.reason, row.view)
          && row.reason.left >= row.card.left - 1 && row.reason.right <= row.card.right + 1
          && row.view.right <= row.card.right + 1,
        `Mobile identity/reason/Fix/action overlap ${row.id}`, row);
      }
    }

    await evaluate(`document.querySelector('[data-testid="card-report-6311"]').scrollIntoView({ block: 'start', behavior: 'instant' })`);
    const image = await call("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
    const screenshot = `${output}/dpr19-b1-dashboard-${device}.png`;
    writeFileSync(screenshot, Buffer.from(image.data, "base64"));
    // Expand first so the real dashboard stores expandedReports as well as
    // scrollY before its Fix navigation (rather than checking a fake snapshot).
    await evaluate(`document.querySelector('[data-testid="button-expand-6311"]').click()`);
    await wait(`!document.querySelector('[data-testid="button-collapse-all"]')?.disabled`);
    await evaluate(`document.querySelector('[data-testid="button-fix-6311"]').click()`);
    await wait(`location.pathname === '/site/edit/6311'`);
    const navigation = await evaluate(`({
      path: location.pathname + location.search,
      saved: JSON.parse(sessionStorage.getItem('siteDashboardState') || 'null'),
      dprGet: window.__DprSiteFixture?.requests.some(r => r.method === 'GET' && r.path === '/api/dprs/6311')
    })`);
    check(navigation.path === "/site/edit/6311?origin=portal"
      && navigation.saved?.expandedReports?.includes(6311)
      && typeof navigation.saved?.scrollY === "number", "Fix edit route / dashboard snapshot", navigation);
    findings.push({ device, screenshot, rows: evidence.rows, navigation });
  }
  check(!exceptions.length, "Browser exceptions", exceptions);
  writeFileSync(`${output}/dpr19-b1-result.json`, JSON.stringify({ source: "isolated fixture, no customer DB", findings }, null, 2));
  console.log(JSON.stringify(findings, null, 2));
} finally {
  socket.close();
  await fetch(`${cdp}/json/close/${target.id}`);
}