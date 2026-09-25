import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import WebSocket from "ws";

// Browser evidence from the real PermissionsDialog with a synthetic, local-only
// API. Start with `node tests/fixtures/perm01-matrix/verify.mjs`; it starts and
// stops its own isolated Vite server unless one is already listening.
const root = path.resolve(new URL("../../..", import.meta.url).pathname);
const fixture = path.join(root, "tests/fixtures/perm01-matrix");
const evidence = path.join(fixture, "evidence");
const port = Number(process.env.VITE_PORT || 4197);
const cdpPort = Number(process.env.CDP_PORT || 9377);
const base = `http://127.0.0.1:${port}`;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const assert = (condition, message) => { if (!condition) throw new Error(message); };
mkdirSync(evidence, { recursive: true });

let vite, chromium, socket;
try {
  let ready = await fetch(base).then(r => r.ok).catch(() => false);
  if (!ready) {
    vite = spawn(path.join(root, "node_modules/.bin/vite"), [
      "--config", path.join(fixture, "vite.config.ts"), "--host", "127.0.0.1",
      "--port", String(port), "--strictPort",
    ], { cwd: root, stdio: "ignore" });
    for (let attempt = 0; attempt < 100 && !ready; attempt++) {
      await sleep(100);
      ready = await fetch(base).then(r => r.ok).catch(() => false);
    }
  }
  assert(ready, "Isolated fixture server did not start");
  chromium = spawn("/repl/tools/bin/chromium", [
    "--headless", "--no-sandbox", "--disable-gpu", "--hide-scrollbars",
    `--remote-debugging-port=${cdpPort}`,
    `--user-data-dir=/tmp/perm01-matrix-cdp-${process.pid}`,
    `${base}/?case=A`,
  ], { stdio: "ignore" });
  let page;
  for (let attempt = 0; attempt < 100; attempt++) {
    const targets = await fetch(`http://127.0.0.1:${cdpPort}/json/list`).then(r => r.json()).catch(() => []);
    page = targets.find(t => t.type === "page" && t.url.startsWith(base));
    if (page) break;
    await sleep(100);
  }
  assert(page, "Chromium fixture page did not start");
  socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.once("open", resolve); socket.once("error", reject); });
  const pending = new Map();
  let id = 0;
  socket.on("message", raw => {
    const message = JSON.parse(raw);
    if (!message.id || !pending.has(message.id)) return;
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    message.error ? reject(new Error(message.error.message)) : resolve(message.result);
  });
  const cdp = (method, params = {}) => new Promise((resolve, reject) => {
    const current = ++id;
    pending.set(current, { resolve, reject });
    socket.send(JSON.stringify({ id: current, method, params }));
  });
  const evaluate = async expression => {
    const result = await cdp("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result?.value;
  };
  const waitFor = async (expression, label) => {
    for (let attempt = 0; attempt < 200; attempt++) {
      if (await evaluate(expression).catch(() => false)) return;
      await sleep(80);
    }
    throw new Error(`Timed out: ${label}`);
  };
  await cdp("Runtime.enable");
  await cdp("Page.enable");
  await cdp("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  const states = [
    ["A", "A-hub-access", `document.querySelector('[data-testid="checkbox-site_hub-access"]')?.getAttribute('data-state') === 'checked' && document.querySelectorAll('[data-testid="row-perm-site_hub"] [role="checkbox"]').length === 1`],
    ["B", "B-home-view-edit", `document.querySelector('[data-testid="checkbox-dashboard-edit"]') && !document.querySelector('[data-testid="checkbox-dashboard-create"]')`],
    ["C", "C-legacy-compatibility", `document.querySelector('[data-testid="note-admin_settings"]')?.textContent.includes('Compatibility') && document.querySelector('[data-testid="note-reports"]')?.textContent.includes('still grants access')`],
    ["D", "D-unused-legacy", `document.querySelector('[data-testid="note-hmp_operations"]')?.textContent.includes('Not currently used') && !document.querySelector('[data-testid="checkbox-hmp_operations-view"]')`],
    ["E", "E-save-revoke-roundtrip", `window.perm01Fixture?.writes === 1 && window.perm01Fixture.saved?.site_hub.export === false && window.perm01Fixture.saved?.dashboard.create === true && document.querySelector('[data-testid="checkbox-site_hub-access"]')?.getAttribute('data-state') === 'unchecked'`],
  ];
  for (const [state, filename, condition] of states) {
    if (state !== "A") await cdp("Page.navigate", { url: `${base}/?case=${state}` });
    await waitFor(condition, `state ${state}`);
    if (state === "E") {
      await cdp("Page.reload");
      await waitFor(`document.querySelector('[data-testid="checkbox-site_hub-access"]')?.getAttribute('data-state') === 'unchecked' && document.querySelector('[data-testid="checkbox-dashboard-edit"]') && JSON.parse(sessionStorage.getItem('perm01-fixture-save')).dashboard.create === true`, "E: reload retained revoke and hidden dashboard grant");
    }
    if (state === "C" || state === "D") {
      await sleep(600); // Radix accordion opening animation changes scroll height.
      const selector = state === "C" ? "reports" : "hmp_operations";
      await evaluate(`document.querySelector('[data-testid="row-perm-${selector}"]').scrollIntoView({block:'center'})`);
    }
    await sleep(250);
    const image = await cdp("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
    const target = path.join(evidence, `${filename}.png`);
    writeFileSync(target, Buffer.from(image.data, "base64"));
    console.log(`PASS ${state}: ${target}`);
  }
} finally {
  socket?.close();
  chromium?.kill();
  vite?.kill();
}