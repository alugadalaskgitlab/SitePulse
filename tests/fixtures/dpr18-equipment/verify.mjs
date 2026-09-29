// Run only after the DPR18 component changes land. Starts/stops its own isolated
// fixture server and Chromium; captures evidence under this fixture directory.
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import WebSocket from "ws";

const root = path.resolve(new URL("../../..", import.meta.url).pathname);
const fixture = path.join(root, "tests/fixtures/dpr18-equipment");
const port = Number(process.env.VITE_PORT || 4198);
const cdpPort = Number(process.env.CDP_PORT || 9348);
const url = `http://127.0.0.1:${port}/`;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const vite = spawn(path.join(root, "node_modules/.bin/vite"), [
  "--config", path.join(fixture, "vite.config.ts"), "--host", "127.0.0.1",
  "--port", String(port), "--strictPort",
], { cwd: root, stdio: "ignore" });
let chromium;
let socket;
try {
  let ready = false;
  for (let i = 0; i < 120; i++) {
    try { if ((await fetch(url)).ok) { ready = true; break; } } catch {}
    await sleep(100);
  }
  assert(ready, `Fixture did not start at ${url}`);
  chromium = spawn("/repl/tools/bin/chromium", [
    "--headless", "--no-sandbox", "--disable-gpu",
    `--remote-debugging-port=${cdpPort}`,
    `--user-data-dir=/tmp/dpr18-equipment-${process.pid}`, url,
  ], { stdio: "ignore" });
  let page;
  for (let i = 0; i < 120; i++) {
    try {
      const targets = await (await fetch(`http://127.0.0.1:${cdpPort}/json/list`)).json();
      page = targets.find(target => target.type === "page" && target.url.startsWith(url));
      if (page) break;
    } catch {}
    await sleep(100);
  }
  assert(page, "Chromium page target did not start");
  socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.once("open", resolve); socket.once("error", reject); });
  let serial = 0;
  const pending = new Map();
  const exceptions = [];
  socket.on("message", raw => {
    const message = JSON.parse(raw);
    if (message.method === "Runtime.exceptionThrown") exceptions.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    message.error ? request.reject(new Error(message.error.message)) : request.resolve(message.result);
  });
  const cdp = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++serial;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`Timed out: ${method}`)); }, 20000);
    pending.set(id, { resolve: value => { clearTimeout(timer); resolve(value); }, reject: error => { clearTimeout(timer); reject(error); } });
    socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async expression => {
    const response = await cdp("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text);
    return response.result?.value;
  };
  const wait = async (expression, label) => {
    for (let i = 0; i < 200; i++) {
      if (await evaluate(expression)) return;
      await sleep(75);
    }
    throw new Error(`Timed out waiting for ${label}`);
  };
  const click = selector => evaluate(`document.querySelector(${JSON.stringify(selector)})?.click()`);
  const shot = async name => {
    mkdirSync(path.join(fixture, "evidence"), { recursive: true });
    const image = await cdp("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
    writeFileSync(path.join(fixture, "evidence", `${name}.png`), Buffer.from(image.data, "base64"));
  };
  const selector = (name) => `[data-fixture="${name}"]`;
  const checkOrder = async (name, groupNames, index) => {
    const order = await evaluate(`(() => {
      const root = document.querySelector(${JSON.stringify(selector(name))} + ' article');
      return ${JSON.stringify(groupNames)}.map(group => {
        const node = root.querySelector('[data-testid="equipment-compact-${name === "working" || name === "legacy" ? "group" : "read-group"}-' + group + '-${index}"]')
          || (group === 'work' ? root.querySelector('[data-testid="equipment-compact-group-work-${index}"]') : null);
        return node ? { group, visible: node.getClientRects().length > 0, top: node.getBoundingClientRect().top, text: node.textContent.slice(0, 100) } : { group, missing: true };
      });
    })()`);
    assert(order.every(slot => !slot.missing && slot.visible), `${name}: missing/hidden groups ${JSON.stringify(order)}`);
    assert(order.every((slot, i) => i === 0 || order[i - 1].top < slot.top), `${name}: groups out of visual order ${JSON.stringify(order)}`);
    return order;
  };
  const assertSlot = async (name, index, group, slot, label) => {
    assert(await evaluate(`(() => {
      const group = document.querySelector('${selector(name)} [data-testid="equipment-compact-group-${group}-${index}"]');
      const slot = group?.querySelector('[data-fixture-slot="${slot}"]');
      return !!slot && slot.getClientRects().length > 0 && slot.innerText.includes(${JSON.stringify(label)});
    })()`), `${name}: visible ${slot} slot/label missing from ${group} group`);
  };
  await cdp("Page.enable");
  await cdp("Runtime.enable");
  for (const [width, height, mobile] of [[1280, 900, false], [390, 844, true]]) {
    await cdp("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile });
    await wait("!!window.__Dpr18Fixture && !!document.querySelector('[data-fixture=\"working\"] article')", "real compact component");
    assert(await evaluate(`window.__Dpr18Fixture.rows().working.usageStatus === 'working' && window.__Dpr18Fixture.rows().legacy.usageStatus === null`), "Stored Working or legacy null status was mutated on mount");
    await click(`${selector("working")} button[aria-label^="Expand"]`);
    await click(`${selector("legacy")} button[aria-label^="Expand"]`);
    await wait(`!!document.querySelector('${selector("working")} [data-testid="equipment-compact-usage-status-0"]')`, "expanded status selector");
    assert(await evaluate(`window.__Dpr18Fixture.rows().working.usageStatus === 'working' && window.__Dpr18Fixture.rows().legacy.usageStatus === null && window.__Dpr18Fixture.patches().length === 0`), "Expanding changed stored or legacy status");
    await checkOrder("working", ["picker", "owner", "readings", "diesel", "stoppage", "work"], 0);
    for (const [group, slot, label] of [
      ["picker", "picker", "Choose equipment"], ["owner", "owner", "Daily hire override"],
      ["diesel", "diesel", "Diesel source"],
    ]) await assertSlot("working", 0, group, slot, label);
    assert(await evaluate(`document.querySelector('${selector("working")} [data-testid="equipment-compact-group-stoppage-0"] [data-testid="fixture-stoppage-0-editor"]')?.innerText.includes('Add stoppage')`), "Real BreakdownStoppageEditor missing inside stoppage slot");
    for (const [name, index] of [["readonly-empty", 2], ["staged", 3], ["submitted", 4]]) {
      await checkOrder(name, ["identity", "readings", "diesel", "performance", "work"], index);
    }
    assert(await evaluate(`!document.querySelector('${selector("readonly-empty")} [data-testid="equipment-compact-read-group-breakdowns-2"]')`), "Empty read-only breakdown group should be omitted");
    for (const [name, index] of [["staged", 3], ["submitted", 4]]) {
      await checkOrder(name, ["identity", "readings", "diesel", "performance", "work", "breakdowns"], index);
      assert(await evaluate(`(() => {
        const details = document.querySelector('${selector(name)} [data-testid="equipment-compact-breakdown-${index}-0"]')?.innerText || '';
        return ['Hydraulic hose','10:00 AM–11:30 AM','1 h 30 min','Responsibility: vendor','Repair/payment scope: hlc','Debitable to vendor: Yes','Repaired at site','Saved attachment: repair.pdf'].every(text => details.includes(text));
      })()`), `${name}: read-only breakdown detail missing`);
    }
    assert(await evaluate(`(() => {
      const max = document.documentElement.clientWidth;
      return document.documentElement.scrollWidth <= max + 1
        && [...document.querySelectorAll('[data-fixture="working"] [data-fixture-slot]')]
          .every(el => el.getBoundingClientRect().right <= max + 1 && el.getBoundingClientRect().left >= -1);
    })()`), `${width}px horizontal overflow in fixture slots`);
    await shot(`dpr18-${mobile ? "mobile" : "desktop"}-slots`);
  }

  // Exercise a caller-owned Radix select, then the actual staged stoppage editor.
  await click('[data-testid="fixture-hire-0"]');
  await wait(`!![...document.querySelectorAll('[role="option"]')].find(n => n.textContent.includes('Monthly hire'))`, "monthly hire option");
  await evaluate(`[...document.querySelectorAll('[role="option"]')].find(n => n.textContent.includes('Monthly hire')).click()`);
  await wait("window.__Dpr18Fixture.rows().working.entryType === 'monthly'", "hire override patch");
  await click('[data-testid="fixture-stoppage-0-add"]');
  await wait("window.__Dpr18Fixture.rows().working.breakdowns.length === 1", "staged stoppage append");
  assert(await evaluate(`!!document.querySelector('[data-testid="fixture-stoppage-0-reason-0"]') && window.__Dpr18Fixture.rows().legacy.breakdowns.length === 0`), "Stoppage editor did not stage isolated row");

  // Exercise Radix's real status dropdown on the stored Working row.
  await click(`${selector("working")} [data-testid="equipment-compact-usage-status-0"]`);
  await wait(`!![...document.querySelectorAll('[role="option"]')].find(n => n.textContent.includes('Operator Unavailable'))`, "operator-unavailable option");
  await evaluate(`[...document.querySelectorAll('[role="option"]')].find(n => n.textContent.includes('Operator Unavailable')).click()`);
  await wait("window.__Dpr18Fixture.rows().working.usageStatus === 'idle_no_operator'", "idle_no_operator patch");
  assert(await evaluate(`window.__Dpr18Fixture.rows().legacy.usageStatus === null && !document.querySelector('${selector("working")} [data-testid="equipment-compact-usage-reason-0"]')`), "Idle without operator requested a reason or mutated legacy null");
  await click(`${selector("working")} [data-testid="equipment-compact-usage-status-0"]`);
  await wait(`!![...document.querySelectorAll('[role="option"]')].find(n => n.textContent.includes('No Work Available'))`, "no-work option");
  await evaluate(`[...document.querySelectorAll('[role="option"]')].find(n => n.textContent.includes('No Work Available')).click()`);
  await wait("window.__Dpr18Fixture.rows().working.usageStatus === 'idle_no_work'", "idle_no_work patch");
  assert(await evaluate(`document.querySelector('${selector("working")} [data-testid="equipment-compact-usage-reason-0"]')?.required === true`), "No-work status did not require reason input");
  assert(exceptions.length === 0, `Browser exceptions: ${exceptions.join("; ")}`);
  console.log(`PASS DPR18 real component desktop/mobile slot order, Working/null preservation, idle reason rules, read-only breakdown. Screenshots: ${path.join(fixture, "evidence")}. Screenshot URL: ${url}`);
} finally {
  socket?.close();
  chromium?.kill();
  vite.kill();
}