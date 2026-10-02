/*
 * Isolated B2 browser proof: real delivery-panel href -> real unmodified
 * SiteMaterialTrips banner and Quantity input. All API requests are intercepted
 * by main.tsx; this proves UI navigation only, never stock/database persistence.
 * Run from project root: node tests/fixtures/pi01/verify-b2.mjs
 */
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";
import WebSocket from "ws";

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const fixtureDir = path.dirname(new URL(import.meta.url).pathname);
const workspace = path.resolve(fixtureDir, "../../..");
const evidenceDir = path.join(workspace, "screenshots/pi01");
const vitePort = 4195;
const cdpPort = 9345;
const chromiumProfile = "/tmp/pi01-b2-chromium-profile";
mkdirSync(evidenceDir, { recursive: true });
rmSync(chromiumProfile, { recursive: true, force: true });
const children = [];
const stop = () => {
  for (const child of children.reverse()) {
    try { child.kill("SIGTERM"); } catch {}
  }
};
process.on("exit", stop);
process.on("SIGINT", () => { stop(); process.exit(130); });
process.on("SIGTERM", () => { stop(); process.exit(143); });
const vite = spawn(path.join(workspace, "node_modules/.bin/vite"), ["--config", path.join(fixtureDir, "vite.config.ts")], {
  cwd: workspace, stdio: ["ignore", "pipe", "pipe"],
});
children.push(vite);
let viteLog = "";
vite.stdout.on("data", chunk => { viteLog += chunk; });
vite.stderr.on("data", chunk => { viteLog += chunk; });
async function waitHttp(url, label) {
  for (let i = 0; i < 300; i += 1) {
    try { if ((await fetch(url)).ok) return; } catch {}
    await sleep(50);
  }
  throw new Error(`Timed out waiting for ${label}. ${viteLog.slice(-1200)}`);
}
let socket;
try {
  await waitHttp(`http://127.0.0.1:${vitePort}`, "PI-01 B2 Vite");
  const chromium = spawn("/repl/tools/bin/chromium", [
    "--headless=new", "--no-sandbox", "--disable-gpu", `--remote-debugging-port=${cdpPort}`,
    `--user-data-dir=${chromiumProfile}`, "--window-size=1280,1000", "about:blank",
  ], { cwd: workspace, stdio: "ignore" });
  children.push(chromium);
  await waitHttp(`http://127.0.0.1:${cdpPort}/json/version`, "Chromium CDP");
  const targets = await (await fetch(`http://127.0.0.1:${cdpPort}/json/list`)).json();
  const page = targets.find(target => target.type === "page");
  if (!page) throw new Error("No Chromium page target");
  socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.once("open", resolve); socket.once("error", reject); });
  let sequence = 0;
  const pending = new Map();
  const nativeApiRequests = [];
  const uncaughtExceptions = [];
  const interceptedRequests = [];
  socket.on("message", raw => {
    const message = JSON.parse(raw);
    if (message.method === "Network.requestWillBeSent" && new URL(message.params.request.url).pathname.startsWith("/api/")) nativeApiRequests.push(message.params.request);
    if (message.method === "Runtime.exceptionThrown") uncaughtExceptions.push(message.params.exceptionDetails);
    if (!message.id || !pending.has(message.id)) return;
    const request = pending.get(message.id);
    pending.delete(message.id);
    message.error ? request.reject(new Error(message.error.message)) : request.resolve(message.result);
  });
  const cdp = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++sequence;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async expression => {
    const result = await cdp("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result?.value;
  };
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  const waitFor = async (expression, label) => {
    for (let i = 0; i < 300; i += 1) {
      try { if (await evaluate(expression)) return; } catch (error) {
        if (!/navigated|context.*destroyed|cannot find context|execution context/i.test(error.message)) throw error;
      }
      await sleep(50);
    }
    throw new Error(`Timed out waiting for ${label}`);
  };
  const screenshot = async name => {
    await sleep(200);
    const result = await cdp("Page.captureScreenshot", { format: "png", fromSurface: true, captureBeyondViewport: false });
    const target = path.join(evidenceDir, `${name}.png`);
    writeFileSync(target, Buffer.from(result.data, "base64"));
    return target;
  };
  await cdp("Page.enable");
  await cdp("Runtime.enable");
  await cdp("Network.enable");
  const verified = [];
  const screenshots = [];
  for (const viewport of [
    { name: "desktop", width: 1280, height: 1000, mobile: false },
    { name: "mobile", width: 390, height: 844, mobile: true },
  ]) {
    await cdp("Emulation.setDeviceMetricsOverride", { width: viewport.width, height: viewport.height, deviceScaleFactor: 1, mobile: viewport.mobile });
    for (const scenario of [
      { id: 401, qty: "900", label: "partial" },
      { id: 402, qty: "0", label: "fully-delivered" },
      { id: 403, qty: "0", label: "overdelivered" },
      { id: 404, qty: "1.125", label: "fractional" },
    ]) {
      await cdp("Page.navigate", { url: `http://127.0.0.1:${vitePort}/?b2` });
      await waitFor("!!document.querySelector('[data-testid=\"delivery-path-401\"]')", "production delivery panels");
      const panelSnapshot = await evaluate(`(() => {
        const link = document.querySelector('[data-testid="delivery-path-${scenario.id}"]');
        return {
          href: link?.getAttribute('href'),
          progress: document.querySelector('[data-testid="delivery-progress-${scenario.id}"]')?.innerText,
          plant: document.querySelector('[data-testid="delivery-path-405"]')?.getAttribute('href'),
          absent: [406,407,408,409].map(id => !document.querySelector('[data-testid="delivery-path-'+id+'"]'))
        };
      })()`);
      assert(panelSnapshot.plant === "/plant/material-receipts?autoOpen=1&piRef=SYNTHETIC%2FPI%2F0091&piItemId=405&materialId=77", "Plant href changed or gained qty");
      assert(panelSnapshot.absent.every(Boolean), "Existing link visibility conditions changed");
      const generated = new URL(panelSnapshot.href, `http://127.0.0.1:${vitePort}`);
      assert(generated.pathname === "/site/material-trips", "Site link target changed");
      for (const [key, value] of Object.entries({ piIndentId: "91", piItemId: String(scenario.id), material: "WMM", uom: "MT", site: "ALLADURG", qty: scenario.qty })) {
        assert(generated.searchParams.get(key) === value, `${viewport.name}/${scenario.label}: ${key} mismatch in generated href: ${panelSnapshot.href}`);
      }
      await evaluate(`document.querySelector('[data-testid="delivery-path-${scenario.id}"]').click()`);
      await waitFor("!!document.querySelector('[data-testid=\"input-trip-quantity\"]')", "actual SiteMaterialTrips quantity input");
      const tripExpression = `(() => {
        const field = name => {
          const element = document.querySelector('[data-testid="select-trip-'+name+'"], [data-testid="input-trip-'+name+'"]');
          return element instanceof HTMLInputElement ? element.value : element?.innerText || "";
        };
        const params = Object.fromEntries(new URLSearchParams(window.location.search));
        const banner = [...document.querySelectorAll('div')].find(e => e.childElementCount > 0 && e.innerText.includes('Remaining:') && e.innerText.length < 350);
        return {
          pathname: window.location.pathname, params,
          quantity: document.querySelector('[data-testid="input-trip-quantity"]').value,
          banner: banner?.innerText,
          material: field("material"), uom: field("uom"), site: field("site"),
          requests: window.__PI01Fixture.requests
        };
      })()`;
      // Site SelectValue resolves its label only after the intercepted /api/sites
      // query finishes and Radix mounts the matching item. The Quantity input
      // mounts earlier, so its existence alone is not a settled-form signal.
      try {
        await waitFor(`(() => { const trip=${tripExpression}; return trip.material.includes("WMM") && trip.uom.includes("MT") && trip.site.includes("ALLADURG"); })()`, "settled site/material/UOM prefill");
      } catch (error) {
        const failure = { viewport: viewport.name, scenario, panel: panelSnapshot, trip: await evaluate(tripExpression) };
        const failurePath = path.join(evidenceDir, "b2-failure-evidence.json");
        writeFileSync(failurePath, `${JSON.stringify(failure, null, 2)}\n`);
        throw new Error(`${error.message}\nDiagnostic evidence: ${failurePath}\n${JSON.stringify(failure)}`);
      }
      const trip = await evaluate(tripExpression);
      assert(trip.pathname === "/site/material-trips", "Generated link did not navigate to production target");
      assert(trip.quantity === scenario.qty, `${viewport.name}/${scenario.label}: input ${trip.quantity} != ${scenario.qty}`);
      assert(trip.banner?.includes(`Remaining: ${scenario.qty} MT`), `${viewport.name}/${scenario.label}: missing Remaining banner: ${trip.banner}`);
      assert(trip.params.piIndentId === "91" && trip.params.piItemId === String(scenario.id), "PI identity not preserved");
      assert(trip.params.material === "WMM" && trip.params.uom === "MT" && trip.params.site === "ALLADURG", "Navigation context not preserved");
      assert(trip.material.includes("WMM") && trip.uom.includes("MT") && trip.site.includes("ALLADURG"), `Form context not prefilled: ${JSON.stringify({ viewport: viewport.name, scenario, panel: panelSnapshot, trip })}`);
      interceptedRequests.push(...trip.requests);
      verified.push({ viewport: viewport.name, scenario: scenario.label, expectedRemaining: scenario.qty, panel: panelSnapshot, trip });
      if (scenario.id === 401 || scenario.id === 404) {
        if (scenario.id === 401) {
          await evaluate("[...document.querySelectorAll('p')].find(e => e.innerText.includes('Remaining:'))?.scrollIntoView({block:'start'})");
          screenshots.push(await screenshot(`B2-${viewport.name}-partial-remaining-banner-SYNTHETIC`));
        }
        await evaluate("document.querySelector('[data-testid=\"input-trip-quantity\"]').scrollIntoView({block:'center'})");
        screenshots.push(await screenshot(`B2-${viewport.name}-${scenario.label}-site-trip-SYNTHETIC`));
      }
    }
  }
  assert(nativeApiRequests.length === 0, "API request escaped fixture interception");
  assert(uncaughtExceptions.length === 0, `Uncaught browser errors: ${JSON.stringify(uncaughtExceptions)}`);
  assert(interceptedRequests.every(request => request.method === "GET"), "Verification performed an API write");
  const evidence = {
    scenario: "PI-01 B2 production delivery-panel link -> production SiteMaterialTrips",
    limitation: "Synthetic intercepted browser UI evidence only; no backend or physical stock verification.",
    safety: { productionDatabaseUsed: false, productionApiWrites: false, nativeApiRequests, uncaughtExceptions },
    verified, screenshots, interceptedRequestCount: interceptedRequests.length,
  };
  writeFileSync(path.join(evidenceDir, "b2-evidence.json"), `${JSON.stringify(evidence, null, 2)}\n`);
  console.log(JSON.stringify(evidence, null, 2));
} finally {
  socket?.close();
  stop();
  await sleep(250);
  rmSync(chromiumProfile, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
}