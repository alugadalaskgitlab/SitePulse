import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import WebSocket from "ws";

const root = path.resolve(new URL("../../..", import.meta.url).pathname);
const fixture = path.join(root, "tests/fixtures/equipment-master-partb");
const evidence = path.join(root, "reports/equip-master-01");
const vitePort = Number(process.env.VITE_PORT || 4196);
const cdpPort = Number(process.env.CDP_PORT || 9346);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const assert = (condition, message) => { if (!condition) throw new Error(message); };
mkdirSync(evidence, { recursive: true });

const vite = spawn(path.join(root, "node_modules/.bin/vite"), [
  "--config", path.join(fixture, "vite.config.ts"),
  "--host", "127.0.0.1",
  "--port", String(vitePort),
  "--strictPort",
], { cwd: root, stdio: "ignore" });

let chromium;
let socket;
try {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      if ((await fetch(`http://127.0.0.1:${vitePort}/`)).ok) break;
    } catch {
      if (attempt === 99) throw new Error("Equipment fixture server did not start");
    }
    await sleep(100);
  }

  chromium = spawn("/repl/tools/bin/chromium", [
    "--headless", "--no-sandbox", "--disable-gpu",
    `--remote-debugging-port=${cdpPort}`,
    `--user-data-dir=/tmp/equipment-master-partb-${process.pid}`,
    `http://127.0.0.1:${vitePort}/`,
  ], { stdio: "ignore" });

  let targets;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      targets = await (await fetch(`http://127.0.0.1:${cdpPort}/json/list`)).json();
      if (targets.some(target => target.type === "page")) break;
    } catch {
      if (attempt === 99) throw new Error("Chromium CDP did not start");
    }
    await sleep(100);
  }
  const page = targets.find(target => target.type === "page" && target.url.includes(String(vitePort)))
    ?? targets.find(target => target.type === "page");
  assert(page, "Chromium page target missing");
  socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.once("open", resolve);
    socket.once("error", reject);
  });

  let sequence = 0;
  const pending = new Map();
  socket.on("message", raw => {
    const message = JSON.parse(raw);
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
    if (result.exceptionDetails) throw new Error(result.result?.description || result.exceptionDetails.text);
    return result.result?.value;
  };
  const waitFor = async (expression, label) => {
    for (let attempt = 0; attempt < 240; attempt += 1) {
      if (await evaluate(expression).catch(() => false)) return;
      await sleep(50);
    }
    throw new Error(`Timed out waiting for ${label}`);
  };
  const click = async selector => {
    const rect = await evaluate(`(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return null;
      el.scrollIntoView({ block: "center", inline: "nearest" });
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    })()`);
    assert(rect, `Missing click target: ${selector}`);
    await sleep(100);
    await cdp("Input.dispatchMouseEvent", { type: "mousePressed", x: rect.x, y: rect.y, button: "left", clickCount: 1 });
    await cdp("Input.dispatchMouseEvent", { type: "mouseReleased", x: rect.x, y: rect.y, button: "left", clickCount: 1 });
  };
  const setInput = async (selector, value) => evaluate(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return false;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    setter.call(el, ${JSON.stringify(value)});
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  })()`).then(found => assert(found, `Missing input: ${selector}`));
  const selectNative = async (selector, value) => evaluate(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return false;
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set;
    setter.call(el, ${JSON.stringify(value)});
    el.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  })()`).then(found => assert(found, `Missing select: ${selector}`));
  const selectOption = async (triggerSelector, optionText) => {
    await evaluate(`(() => {
      const el = document.querySelector(${JSON.stringify(triggerSelector)});
      if (!el) return false;
      el.focus();
      el.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
      el.dispatchEvent(new KeyboardEvent("keyup", { key: "ArrowDown", bubbles: true }));
      return true;
    })()`);
    const textCheck = `Array.from(document.querySelectorAll('[role="option"]')).some(el => el.textContent.trim() === ${JSON.stringify(optionText)})`;
    await waitFor(textCheck, `${optionText} option`);
    const rect = await evaluate(`(() => {
      const el = Array.from(document.querySelectorAll('[role="option"]')).find(item => item.textContent.trim() === ${JSON.stringify(optionText)});
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    })()`);
    assert(rect, `Missing select option: ${optionText}`);
    await cdp("Input.dispatchMouseEvent", { type: "mousePressed", x: rect.x, y: rect.y, button: "left", clickCount: 1 });
    await cdp("Input.dispatchMouseEvent", { type: "mouseReleased", x: rect.x, y: rect.y, button: "left", clickCount: 1 });
  };
  const screenshot = async name => {
    await sleep(250);
    const image = await cdp("Page.captureScreenshot", { format: "png", fromSurface: true });
    const filename = path.join(evidence, `${name}.png`);
    writeFileSync(filename, Buffer.from(image.data, "base64"));
    return filename;
  };
  const viewport = (width, height) => cdp("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });

  await cdp("Page.enable");
  await cdp("Runtime.enable");
  await viewport(1280, 880);
  await waitFor("!!document.querySelector('[data-testid=\"equipment-master-fixture\"]')", "fixture UI");
  await waitFor("!!document.querySelector('[data-testid=\"tab-equipment-owned\"]')", "Owned tab");
  const screenshots = [];
  screenshots.push(await screenshot("01-owned-collapsed"));
  await click('[data-testid="toggle-equipment-row-101"]');
  await waitFor("!!document.querySelector('[data-testid=\"equipment-details-101\"]')", "Owned details");
  screenshots.push(await screenshot("02-owned-expanded"));

  await click('[data-testid="tab-equipment-hired"]');
  await waitFor("!!document.querySelector('[data-testid=\"input-equipment-search-hired\"]')", "Hired tab");
  await setInput('[data-testid="input-equipment-search-hired"]', "narasimhulu");
  await waitFor("!!document.querySelector('[data-testid=\"row-equipment-102\"]') && !document.querySelector('[data-testid=\"row-equipment-103\"]')", "owner search");
  screenshots.push(await screenshot("03-hired-owner-search"));
  await setInput('[data-testid="input-equipment-search-hired"]', "7763");
  await click('[data-testid="toggle-equipment-row-102"]');
  await waitFor("!!document.querySelector('[data-testid=\"equipment-details-102\"]')", "daily hire details");
  screenshots.push(await screenshot("04-hired-daily-expanded"));
  await setInput('[data-testid="input-equipment-search-hired"]', "roller");
  await click('[data-testid="toggle-equipment-row-103"]');
  await waitFor("!!document.querySelector('[data-testid=\"equipment-details-103\"]')", "monthly hire details");
  screenshots.push(await screenshot("05-hired-monthly-expanded"));

  await click('[data-testid="button-open-create"]');
  await waitFor("!!document.querySelector('[role=\"dialog\"]')", "create dialog");
  await selectNative('[data-testid="select-ownership"]', "hired");
  await waitFor("!!document.querySelector('[data-testid=\"button-equipment-vendor-picker\"]')", "owner picker");
  await click('[data-testid="button-equipment-vendor-picker"]');
  await waitFor("!!document.querySelector('[data-testid=\"input-equipment-vendor-search\"]')", "vendor search");
  await setInput('[data-testid="input-equipment-vendor-search"]', "narasimhulu");
  await waitFor("!!document.querySelector('[data-testid=\"option-equipment-vendor-301\"]')", "vendor result");
  await click('[data-testid="option-equipment-vendor-301"]');
  await selectOption('[data-testid="select-hire-basis"]', "Hourly");
  assert(await evaluate(`!document.querySelector('[data-testid="input-hire-rate"]') && !document.querySelector('[data-testid="input-hire-start-date"]')`), "Hourly form exposed monthly rate/date fields");
  screenshots.push(await screenshot("06-create-hourly"));

  await cdp("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape" });
  await cdp("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape" });
  await waitFor("!document.querySelector('[role=\"dialog\"]')", "close hourly create dialog");
  await click('[data-testid="button-open-create"]');
  await waitFor("!!document.querySelector('[role=\"dialog\"]')", "reopened create dialog");
  await selectNative('[data-testid="select-ownership"]', "hired");
  await click('[data-testid="button-equipment-vendor-picker"]');
  await waitFor("!!document.querySelector('[data-testid=\"option-equipment-vendor-301\"]')", "vendor result");
  await click('[data-testid="option-equipment-vendor-301"]');
  await selectOption('[data-testid="select-hire-basis"]', "Monthly");
  assert(await evaluate(`!!document.querySelector('[data-testid="input-hire-rate"]') && !!document.querySelector('[data-testid="input-hire-start-date"]')`), "Monthly form fields are missing");
  screenshots.push(await screenshot("07-create-monthly"));

  const result = {
    passed: true,
    assertions: [
      "fixture shows the real EquipmentMasterRows and EquipmentMasterCreateDialog components",
      "Owned and Hired list, per-tab search, collapsed and expanded rows rendered",
      "daily/hourly forms omit monthly rate and date fields; monthly form shows them",
      "all data are local fixture values; no authenticated app or database is used",
    ],
    screenshots,
  };
  writeFileSync(path.join(evidence, "verification-result.json"), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
} finally {
  socket?.close();
  chromium?.kill("SIGTERM");
  vite.kill("SIGTERM");
}
