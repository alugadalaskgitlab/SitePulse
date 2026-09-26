// Real production App/router/sidebar, served by the running dev server.
// All /api requests are fulfilled in CDP: no login credentials or business writes.
import WebSocket from "ws";
import { mkdirSync, writeFileSync } from "node:fs";

const base = process.env.HMP_BASE_URL || "http://127.0.0.1:5000";
const cdpBase = process.env.HMP_CDP_URL || "http://127.0.0.1:9224";
const out = new URL("./evidence/", import.meta.url);
mkdirSync(out, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = [];
const logs = [];
const mocks = path => {
  if (path === "/api/auth/me") return {
    user: { id: 990001, email: "hmp-browser-fixture@example.invalid", fullName: "HMP Browser Fixture", isAdmin: true, isOwner: true, isActive: true, isFieldEngineer: false, sessionPolicy: "sticky", canManagePermissions: true },
    permissions: {},
  };
  if (path === "/api/config") return { rmcEnabled: true, licensedModules: [], companyName: "Isolated HMP Browser Evidence", companyShortName: "TEST", logoFile: "hlc-logo.jpg" };
  if (path.includes("unassigned")) return { dieselRequirements: [], purchaseIndents: [] };
  if (path.includes("count")) return { count: 0, unreadCount: 0 };
  return [];
};

for (const start of [
  { label: "Dashboard", path: "/", delayed: "/api/dprs" },
  { label: "Stores & Inventory", path: "/stores/hub", delayed: "/api/stores/stock-summary" },
  { label: "Procurement & Billing", path: "/finance/hub", delayed: "/api/purchase-indents" },
]) {
  for (const mode of ["normal", "prior-fetch-delayed"]) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      const id = `${start.label.split(" ")[0].toLowerCase()}-${mode}-${attempt}`;
      const contextSocket = new WebSocket((await (await fetch(`${cdpBase}/json/version`)).json()).webSocketDebuggerUrl);
      await new Promise(r => contextSocket.once("open", r));
      let seq = 0;
      const pending = new Map();
      const command = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
        const n = ++seq;
        pending.set(n, { resolve, reject });
        contextSocket.send(JSON.stringify({ id: n, method, params, sessionId }));
      });
      let session;
      const held = [];
      const trialLog = [];
      contextSocket.on("message", raw => {
        const event = JSON.parse(raw);
        if (event.id) {
          const p = pending.get(event.id);
          if (p) { pending.delete(event.id); event.error ? p.reject(new Error(event.error.message)) : p.resolve(event.result); }
          return;
        }
        if (["Runtime.exceptionThrown", "Runtime.consoleAPICalled", "Network.loadingFailed"].includes(event.method)) {
          trialLog.push({ time: Date.now(), event: event.method, details: event.params });
        }
        if (event.method === "Network.responseReceived") {
          const { response } = event.params;
          trialLog.push({ time: Date.now(), event: "response", url: response.url, status: response.status, mime: response.mimeType });
        }
        if (event.method === "Fetch.requestPaused") {
          const { request, requestId } = event.params;
          const url = new URL(request.url);
          const record = { time: Date.now(), event: "mock-api", url: request.url, method: request.method, released: false };
          trialLog.push(record);
          const release = async () => {
            record.released = true;
            record.releaseTime = Date.now();
            await command("Fetch.fulfillRequest", {
              requestId, responseCode: request.method === "GET" ? 200 : 405,
              responseHeaders: [{ name: "Content-Type", value: "application/json" }],
              body: Buffer.from(JSON.stringify(request.method === "GET" ? mocks(url.pathname) : { error: "Writes prohibited in browser evidence" })).toString("base64"),
            }, session);
          };
          if (mode === "prior-fetch-delayed" && url.pathname === start.delayed) held.push(release);
          else void release();
        }
      });
      const { browserContextId } = await command("Target.createBrowserContext");
      const { targetId } = await command("Target.createTarget", { url: "about:blank", browserContextId });
      session = (await command("Target.attachToTarget", { targetId, flatten: true })).sessionId;
      const cdp = (method, params = {}) => command(method, params, session);
      const evaluate = async expression => {
        const result = await cdp("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
        if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
        return result.result?.value;
      };
      const wait = async (expression, timeout = 45000) => {
        const since = Date.now();
        while (Date.now() - since < timeout) { if (await evaluate(expression)) return; await sleep(100); }
        throw new Error(`Timeout ${id}: ${expression}`);
      };
      try {
        await cdp("Runtime.enable");
        await cdp("Network.enable");
        await cdp("Network.setBypassServiceWorker", { bypass: true });
        await cdp("Network.setCacheDisabled", { cacheDisabled: true });
        await cdp("Page.enable");
        await cdp("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
        await cdp("Fetch.enable", { patterns: [{ urlPattern: "*/api/*", requestStage: "Request" }] });
        await cdp("Page.addScriptToEvaluateOnNewDocument", { source: `sessionStorage.setItem("sp_splash_shown","1");localStorage.setItem("sitelog.workspaceMode.u990001","classic");` });
        await cdp("Page.navigate", { url: base + start.path });
        await wait(`!![...document.querySelectorAll('a[href="/plant/hub"]')].find(a=>a.getBoundingClientRect().width>0) && !document.body.innerText.includes("Loading page")`);
        if (mode === "prior-fetch-delayed") {
          for (let n = 0; !held.length && n < 100; n++) await sleep(50);
          if (!held.length) throw new Error("Required prior-page fetch was not intercepted");
        }
        const priorRequestsInFlight = held.length;
        const before = await evaluate(`({path:location.pathname, headings:[...document.querySelectorAll("h1,h2")].map(e=>e.textContent)})`);
        const began = Date.now();
        const point = await evaluate(`(()=>{const a=[...document.querySelectorAll('a[href="/plant/hub"]')].find(a=>a.getBoundingClientRect().width>0);const r=a.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
        await cdp("Input.dispatchMouseEvent", { type: "mousePressed", ...point, button: "left", clickCount: 1 });
        await cdp("Input.dispatchMouseEvent", { type: "mouseReleased", ...point, button: "left", clickCount: 1 });
        await wait(`location.pathname === "/plant/hub" && [...document.querySelectorAll("h1,h2")].some(e=>e.textContent==="HMP Operations") && !document.body.innerText.includes("Loading page")`);
        const hmpRenderMs = Date.now() - began;
        // Keep the old request unresolved for five seconds after HMP renders.
        if (held.length) await sleep(5000);
        const renderedWhilePriorPending = await evaluate(`document.body.innerText.includes("Hot-mix plant") && !document.body.innerText.includes("Loading page")`);
        for (const release of held) await release();
        await sleep(1000);
        const after = await evaluate(`({path:location.pathname,loading:document.body.innerText.includes("Loading page"),hmp:document.body.innerText.includes("Hot-mix plant"),text:document.body.innerText.slice(-1200)})`);
        const screenshot = `${id}.png`;
        writeFileSync(new URL(screenshot, out), Buffer.from((await cdp("Page.captureScreenshot", { format: "png" })).data, "base64"));
        results.push({ id, start: start.label, mode, attempt, before, priorRequestsInFlight, hmpRenderMs, renderedWhilePriorPending, after, screenshot, pass: after.hmp && !after.loading });
      } catch (error) {
        results.push({ id, pass: false, error: String(error) });
      } finally {
        logs.push({ id, events: trialLog });
        await command("Target.disposeBrowserContext", { browserContextId });
        contextSocket.close();
        writeFileSync(new URL("results.json", out), JSON.stringify(results, null, 2));
        writeFileSync(new URL("browser-network-log.json", out), JSON.stringify(logs, null, 2));
        console.log(JSON.stringify(results.at(-1)));
      }
    }
  }
}
console.log(`${results.filter(r => r.pass).length}/${results.length} completed without stuck loading`);
if (results.some(r => !r.pass)) process.exitCode = 1;