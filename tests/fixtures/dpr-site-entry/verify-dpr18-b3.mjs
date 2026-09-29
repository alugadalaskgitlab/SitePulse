/*
 * Real DprDetails/SiteReport browser render against isolated synthetic GET
 * responses; no production database access or writes. Parent starts the
 * existing Vite fixture :4178 and Chromium CDP :9222 before running this.
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
  const message = JSON.parse(raw);
  if (message.method === "Runtime.exceptionThrown") exceptions.push(message.params.exceptionDetails);
  const item = pending.get(message.id);
  if (!item) return;
  clearTimeout(item.timer);
  pending.delete(message.id);
  message.error ? item.reject(new Error(message.error.message)) : item.resolve(message.result);
});
function call(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++serial;
    const timer = setTimeout(() => reject(new Error(`CDP timeout: ${method}`)), 20000);
    pending.set(id, { resolve, reject, timer });
    socket.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const result = await call("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
  return result.result?.value;
}
async function waitForRows() {
  for (let i = 0; i < 300; i++) {
    if (await evaluate(`document.querySelectorAll('[data-testid^="equipment-compact-readonly-"]').length === 3
      && !!document.querySelector('[data-testid="equipment-compact-group-work-0"]')?.innerText.includes('GSB')`)) return;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`Equipment rows did not load: ${JSON.stringify(await evaluate("document.body.innerText.slice(-1500)"))}`);
}
const output = "tests/fixtures/dpr-site-entry/evidence";
mkdirSync(output, { recursive: true });
await call("Page.enable");
await call("Runtime.enable");
const result = [];
try {
  for (const [page, path] of [["details", "/dpr"], ["site-report", "/site/report"]]) {
    for (const [status, id] of [["draft", 6291], ["submitted", 6292]]) {
      for (const [device, width, height, scale] of [["desktop", 1440, 900, 1], ["mobile", 390, 844, 1]]) {
        await call("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: scale, mobile: device === "mobile" });
        const url = `${base}${path}/${id}?dpr18b3=1`;
        await call("Page.navigate", { url });
        await waitForRows();
        const evidence = await evaluate(`(() => {
          const rows = [0, 1, 2].map(i => document.querySelector('[data-testid="equipment-compact-'+i+'"]'));
          return {
            rows: rows.map((row, i) => ({
              breakdownSection: !!row?.querySelector('[data-testid="equipment-compact-read-group-breakdowns-'+i+'"]'),
              text: row?.innerText || "",
            })),
            writes: window.__DprSiteFixture?.requests.filter(r => r.method !== "GET"),
            // The unrelated legacy SiteReport audit table is intentionally
            // unchanged; measure only the compact cards' responsive bounds.
            compactOverflow: rows.some(row => row && row.scrollWidth > row.clientWidth + 1),
          };
        })()`);
        if (evidence.rows.length !== 3 || evidence.rows[0].breakdownSection || !evidence.rows[1].breakdownSection || evidence.rows[2].breakdownSection
          || !evidence.rows[0].text.includes("Incidental diversion") || !evidence.rows[0].text.includes("GSB")
          || !evidence.rows[0].text.includes("Actual Consumed") || !evidence.rows[1].text.includes("Synthetic hydraulic hose")
          || !evidence.rows[2].text.includes("Breakdown") || evidence.writes?.length || evidence.compactOverflow) {
          throw new Error(`Read-only B3 mismatch ${url} ${device}: ${JSON.stringify(evidence)}`);
        }
        await evaluate(`document.querySelector('[data-testid="equipment-compact-0"]')
          .scrollIntoView({ block: 'start', behavior: 'instant' })`);
        const screenshot = await call("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
        const file = `${output}/dpr18-b3-${page}-${status}-${device}.png`;
        writeFileSync(file, Buffer.from(screenshot.data, "base64"));
        await evaluate(`document.querySelector('[data-testid="equipment-compact-read-group-breakdowns-1"]')
          .scrollIntoView({ block: 'center', behavior: 'instant' })`);
        const breakdownScreenshot = await call("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
        const breakdownFile = `${output}/dpr18-b3-${page}-${status}-${device}-breakdown.png`;
        writeFileSync(breakdownFile, Buffer.from(breakdownScreenshot.data, "base64"));
        result.push({ url, device, screenshot: file, breakdownScreenshot: breakdownFile, breakdownSections: evidence.rows.map(row => row.breakdownSection) });
      }
    }
  }
  if (exceptions.length) throw new Error(`Browser exceptions: ${JSON.stringify(exceptions)}`);
  writeFileSync(`${output}/dpr18-b3-result.json`, JSON.stringify({ source: "isolated fixture, not customer DB", result }, null, 2));
  console.log(JSON.stringify(result, null, 2));
} finally {
  socket.close();
  await fetch(`${cdp}/json/close/${target.id}`);
}