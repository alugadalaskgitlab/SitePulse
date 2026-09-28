import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import WebSocket from "ws";

// Run after starting the isolated fixture Vite server on port 4198.
// CDP checks the real Home component and saves both time-of-day screenshots.
const port = Number(process.env.VITE_PORT || 4198);
const cdpPort = Number(process.env.CDP_PORT || 9398);
const base = `http://127.0.0.1:${port}`;
const evidence = path.resolve("tests/fixtures/home01-part-a/evidence");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const assert = (condition, message) => { if (!condition) throw new Error(message); };
mkdirSync(evidence, { recursive: true });

assert(await fetch(base).then((r) => r.ok).catch(() => false), `Start the fixture server at ${base} first`);
const chromium = spawn("/repl/tools/bin/chromium", [
  "--headless", "--no-sandbox", "--disable-gpu", "--hide-scrollbars",
  `--remote-debugging-port=${cdpPort}`,
  `--user-data-dir=/tmp/home01-part-a-${process.pid}`,
  `${base}/?time=morning`,
], { stdio: "ignore" });
let socket;
try {
  let page;
  for (let attempt = 0; attempt < 100; attempt++) {
    const targets = await fetch(`http://127.0.0.1:${cdpPort}/json/list`).then((r) => r.json()).catch(() => []);
    page = targets.find((t) => t.type === "page" && t.url.startsWith(base));
    if (page) break;
    await sleep(100);
  }
  assert(page, "Chromium fixture page did not start");
  socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.once("open", resolve); socket.once("error", reject); });
  let id = 0;
  const pending = new Map();
  socket.on("message", (raw) => {
    const message = JSON.parse(raw);
    if (!pending.has(message.id)) return;
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    message.error ? reject(new Error(message.error.message)) : resolve(message.result);
  });
  const cdp = (method, params = {}) => new Promise((resolve, reject) => {
    const current = ++id;
    pending.set(current, { resolve, reject });
    socket.send(JSON.stringify({ id: current, method, params }));
  });
  const evaluate = async (expression) => {
    const result = await cdp("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result?.value;
  };
  await cdp("Runtime.enable");
  await cdp("Page.enable");
  await cdp("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  for (const scenario of ["morning", "late"]) {
    await cdp("Page.navigate", { url: `${base}/?time=${scenario}` });
    let ready = false;
    for (let attempt = 0; attempt < 120; attempt++) {
      ready = await evaluate(`document.querySelector('[data-testid="dpr-status-11"]')?.lastElementChild?.textContent?.trim() === "Filed" && document.querySelector('[data-testid="dpr-status-12"]')?.lastElementChild?.textContent?.trim() === "In draft" && !!document.querySelector('[data-testid="dpr-status-13"]')`).catch(() => false);
      if (ready) break;
      await sleep(100);
    }
    assert(ready, `${scenario}: Site DPR list failed to render`);
    const state = await evaluate(`(() => {
      const row = (id) => document.querySelector('[data-testid="dpr-status-' + id + '"]');
      const badge = (id) => row(id)?.lastElementChild;
      return {
        filed: badge(11)?.textContent?.trim(),
        draft: badge(12)?.textContent?.trim(),
        waiting: badge(13)?.textContent?.trim(),
        inactive: !!row(14),
        draftAlarm: badge(12)?.classList.contains("text-rose-700"),
        waitingAlarm: badge(13)?.classList.contains("text-rose-700"),
        firstCard: !!document.querySelector('[data-testid="stat-dprs"]'),
        sites: document.querySelector('[data-testid="stat-sites"]')?.textContent,
        dprHistory: document.querySelector('[data-testid="link-today-dpr-history"]')?.getAttribute("href"),
        recentHistory: document.querySelector('[data-testid="link-recent-dpr-history"]')?.getAttribute("href"),
      };
    })()`);
    assert(state.filed === "Filed" && state.draft === "In draft" && state.waiting === "Not yet filed", `${scenario}: wrong submitted/draft/site status: ${JSON.stringify(state)}`);
    assert(!state.inactive && !state.firstCard, `${scenario}: inactive site or standalone DPR card present`);
    assert(state.sites?.includes("3") && state.sites?.includes("sites master"), `${scenario}: active-site definition missing`);
    assert(state.dprHistory === "/site/dashboard" && state.recentHistory === "/site/dashboard", `${scenario}: DPR history destination wrong`);
    assert(state.draftAlarm === (scenario === "late") && state.waitingAlarm === (scenario === "late"), `${scenario}: cutoff styling wrong`);
    assert(scenario === "late" ? state.sites?.includes("1 filed today") : state.sites?.includes("reporting in progress"), `${scenario}: active-site subline wrong`);
    const pendingState = await evaluate(`(() => ({
      duplicate: !!document.querySelector('[data-testid="stat-pending"]'),
      indents: [...document.querySelectorAll('[data-testid^="link-review-indent-"]')].map((el) => ({ id: el.dataset.testid, href: el.getAttribute("href"), age: el.textContent })),
      diesel: [...document.querySelectorAll('[data-testid^="link-review-diesel-"]')].map((el) => ({ id: el.dataset.testid, href: el.getAttribute("href"), age: el.textContent })),
      tile: document.querySelector('[data-testid="shortcut-site-requirements"]')?.textContent,
      tileHref: document.querySelector('[data-testid="shortcut-site-requirements"]')?.closest("a[href]")?.getAttribute("href"),
    }))()`);
    assert(!pendingState.duplicate, `${scenario}: duplicate Pending Approvals card remains`);
    assert(pendingState.indents[0]?.id === "link-review-indent-71" && pendingState.indents[1]?.id === "link-review-indent-72", `${scenario}: indent age ordering wrong`);
    assert(pendingState.diesel[0]?.id === "link-review-diesel-61" && pendingState.diesel[1]?.id === "link-review-diesel-62", `${scenario}: diesel age ordering wrong`);
    assert(pendingState.indents[0]?.href?.includes("indentId=71") && pendingState.diesel[0]?.href?.includes("dieselReqId=61"), `${scenario}: item deep link absent: ${JSON.stringify(pendingState)}`);
    assert(pendingState.diesel[0]?.age?.includes("days") && pendingState.indents[0]?.age?.includes("days"), `${scenario}: pending ages absent`);
    assert(pendingState.tile?.includes("Site Requirements & Arrangements") && pendingState.tile?.includes("raised requirements") && pendingState.tileHref?.startsWith("/site/requirements"), `${scenario}: queue copy/destination wrong`);
    const image = await cdp("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
    const filename = path.join(evidence, `${scenario}-actual-home.png`);
    writeFileSync(filename, Buffer.from(image.data, "base64"));
    if (scenario === "morning") {
      writeFileSync(path.join(evidence, "part-b-pending-actions.png"), Buffer.from(image.data, "base64"));
      writeFileSync(path.join(evidence, "part-d-requirements-tile.png"), Buffer.from(image.data, "base64"));
    }
    console.log(`PASS ${scenario}: ${filename}`);
  }
  await cdp("Page.navigate", { url: `${base}/site/hub?time=morning` });
  let hubReady = false;
  for (let attempt = 0; attempt < 120; attempt++) {
    hubReady = await evaluate(`(() => {
      const label = [...document.querySelectorAll("p")].find((el) => el.textContent.trim() === "Sites Reporting Today");
      return label?.parentElement?.textContent?.includes("Today1reporting");
    })()`).catch(() => false);
    if (hubReady) break;
    await sleep(100);
  }
  assert(hubReady, "Site Operations hub did not render");
  const hub = await evaluate(`(() => {
    const labels = [...document.querySelectorAll("p")];
    const card = (label) => labels.find((el) => el.textContent.trim() === label)?.parentElement;
    return {
      sites: card("Sites Reporting Today")?.textContent,
      dprs: card("DPRs Filed")?.textContent,
      dprClass: card("DPRs Filed")?.className,
      workforce: card("Workforce")?.textContent,
      workforceClass: card("Workforce")?.className,
    };
  })()`);
  assert(hub.sites?.includes("1") && hub.sites?.includes("reporting in progress"), `site meaning wrong: ${JSON.stringify(hub)}`);
  assert(hub.dprs?.includes("filing in progress") && !hub.dprClass?.includes("amber"), "morning DPR KPI is alarming");
  assert(hub.workforce?.includes("workforce reporting in progress") && !hub.workforceClass?.includes("amber"), "morning workforce KPI is alarming");
  const hubImage = await cdp("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
  const hubFilename = path.join(evidence, "morning-actual-site-hub.png");
  writeFileSync(hubFilename, Buffer.from(hubImage.data, "base64"));
  console.log(`PASS Site Operations hub: ${hubFilename}`);
} finally {
  socket?.close();
  chromium.kill();
}