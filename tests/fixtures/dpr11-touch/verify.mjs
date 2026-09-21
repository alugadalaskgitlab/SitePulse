/*
 * Real-component DPR-11 touch regression fixture.
 *
 * The parent agent starts this fixture on 4192 and touch-capable Chromium with
 * remote debugging on 9342. This script never saves a DPR or calls an API.
 *
 *   npx vite --config tests/fixtures/dpr11-touch/vite.config.ts --host 127.0.0.1
 *   chromium --headless --remote-debugging-port=9342 ...
 *   node tests/fixtures/dpr11-touch/verify.mjs before
 *   node tests/fixtures/dpr11-touch/verify.mjs after
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import WebSocket from "ws";

const mode = process.argv[2] || "after";
if (!["before", "after"].includes(mode)) throw new Error("Mode must be before or after");
const baseUrl = process.env.DPR11_BASE_URL || "http://127.0.0.1:4192";
const cdpPort = process.env.DPR11_CDP_PORT || "9342";
const evidenceDir = path.resolve(new URL(".", import.meta.url).pathname, "evidence");
mkdirSync(evidenceDir, { recursive: true });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const targets = await (await fetch(`http://127.0.0.1:${cdpPort}/json/list`)).json();
let page = targets.find((target) => target.type === "page");
if (!page) {
  await fetch(`http://127.0.0.1:${cdpPort}/json/new?about:blank`, { method: "PUT" });
  page = (await (await fetch(`http://127.0.0.1:${cdpPort}/json/list`)).json())
    .find((target) => target.type === "page");
}
if (!page) throw new Error("No Chromium page target");

const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.once("open", resolve);
  socket.once("error", reject);
});
let sequence = 0;
const pending = new Map();
socket.on("message", (raw) => {
  const message = JSON.parse(raw);
  const callback = pending.get(message.id);
  if (!callback) return;
  pending.delete(message.id);
  message.error ? callback.reject(new Error(message.error.message)) : callback.resolve(message.result);
});
const cdp = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++sequence;
  pending.set(id, { resolve, reject });
  socket.send(JSON.stringify({ id, method, params }));
});
const evaluate = async (expression) => {
  const result = await cdp("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result.value;
};
const waitFor = async (expression) => {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (await evaluate(expression)) return;
    await sleep(50);
  }
  throw new Error(`Timed out: ${expression}`);
};
const click = (testId) => evaluate(`document.querySelector('[data-testid="${testId}"]')?.click()`);
const bringIntoView = async (testId) => {
  await evaluate(`document.querySelector('[data-testid="${testId}"]')?.scrollIntoView({ block: "center" })`);
  await sleep(100);
};
const metrics = (selector) => evaluate(`(() => {
  const node = document.querySelector(${JSON.stringify(selector)});
  if (!node) return null;
  const rect = node.getBoundingClientRect();
  const style = getComputedStyle(node);
  return {
    scrollTop: node.scrollTop,
    scrollHeight: node.scrollHeight,
    clientHeight: node.clientHeight,
    overflowY: style.overflowY,
    touchAction: style.touchAction,
    webkitOverflowScrolling: style.webkitOverflowScrolling,
    x: rect.left + rect.width / 2,
    y: rect.top + Math.min(rect.height - 20, rect.height * 0.8),
  };
})()`);
const touchDrag = async (selector) => {
  const box = await metrics(selector);
  if (!box) throw new Error(`Missing touch target ${selector}`);
  const endY = Math.max(20, box.y - Math.min(260, box.clientHeight * 0.6));
  await cdp("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: box.x, y: box.y, radiusX: 2, radiusY: 2, force: 1 }],
  });
  for (let step = 1; step <= 8; step += 1) {
    await cdp("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{
        x: box.x,
        y: box.y + ((endY - box.y) * step) / 8,
        radiusX: 2,
        radiusY: 2,
        force: 1,
      }],
    });
    await sleep(25);
  }
  await cdp("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await sleep(350);
  return { before: box, after: await metrics(selector) };
};
const touchToBottom = async (selector) => {
  const first = await metrics(selector);
  let current = first;
  for (let drag = 0; drag < 20; drag += 1) {
    await touchDrag(selector);
    current = await metrics(selector);
    if (current.scrollTop >= current.scrollHeight - current.clientHeight - 2) break;
  }
  return { before: first, after: current };
};
const touchTap = async (selector) => {
  const point = await evaluate(`(() => {
    const node = document.querySelector(${JSON.stringify(selector)});
    if (!node) return null;
    const rect = node.getBoundingClientRect();
    return {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
      visible: rect.top >= 0 && rect.bottom <= innerHeight,
    };
  })()`);
  if (!point?.visible) throw new Error(`Touch target is not fully visible: ${selector}`);
  await cdp("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: point.x, y: point.y, radiusX: 2, radiusY: 2, force: 1 }],
  });
  await sleep(80);
  await cdp("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await sleep(250);
};
const wheel = async (selector) => {
  await evaluate(`document.querySelector(${JSON.stringify(selector)}).scrollTop = 0`);
  const box = await metrics(selector);
  for (let step = 0; step < 4; step += 1) {
    await cdp("Input.dispatchMouseEvent", {
      type: "mouseWheel",
      x: box.x,
      y: box.y,
      deltaX: 0,
      deltaY: 180,
    });
    await sleep(80);
  }
  await sleep(250);
  return { before: box, after: await metrics(selector) };
};
const screenshot = async (name) => {
  const result = await cdp("Page.captureScreenshot", { format: "png", fromSurface: true });
  const file = path.join(evidenceDir, name);
  writeFileSync(file, Buffer.from(result.data, "base64"));
  return file;
};

const emulateOldCss = () => evaluate(`(() => {
  const viewport = document.querySelector('[data-radix-select-viewport]');
  const content = viewport?.parentElement;
  if (content) content.style.overflowY = "auto";
  if (viewport) {
    viewport.style.touchAction = "auto";
    viewport.style.overscrollBehavior = "auto";
    viewport.style.webkitOverflowScrolling = "auto";
  }
  const list = document.querySelector('[cmdk-list]');
  if (list) {
    list.removeAttribute("data-vaul-no-drag");
    list.style.maxHeight = "60vh";
    list.style.touchAction = "auto";
    list.style.overscrollBehavior = "auto";
    list.style.webkitOverflowScrolling = "auto";
  }
})()`);

const verifyTouchWidth = async (width, height, label) => {
  await cdp("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: 2,
    mobile: true,
  });
  await cdp("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
  await cdp("Page.navigate", { url: baseUrl });
  await waitFor("document.readyState === 'complete'");

  await bringIntoView("equipment-trigger");
  await click("equipment-trigger");
  await waitFor("!!document.querySelector('[data-radix-select-viewport]')");
  await sleep(500);
  if (mode === "before") await emulateOldCss();
  const equipmentTouch = await touchToBottom('[data-radix-select-viewport]');
  const equipmentLastVisible = await evaluate(`(() => {
    const node = document.querySelector('[data-testid="equipment-option-60"]');
    if (!node) return false;
    const rect = node.getBoundingClientRect();
    return rect.top >= 0 && rect.bottom <= innerHeight;
  })()`);
  if (!equipmentLastVisible) throw new Error(`${label}: equipment last option not visible at scroll bottom`);
  await touchTap('[data-testid="equipment-option-60"]');
  await waitFor("document.querySelector('[data-testid=\"equipment-trigger\"]')?.textContent?.includes('Equipment 60')");
  await bringIntoView("equipment-trigger");
  await click("equipment-trigger");
  await waitFor("!!document.querySelector('[data-radix-select-viewport]')");
  await sleep(500);
  if (mode === "before") await emulateOldCss();
  const equipmentWheel = await wheel('[data-radix-select-viewport]');
  await cdp("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape" });
  await cdp("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape" });

  await bringIntoView("touch-boq-item-select");
  await click("touch-boq-item-select");
  await waitFor("!!document.querySelector('[cmdk-list]')");
  await sleep(500);
  if (mode === "before") await emulateOldCss();
  const boqTouch = await touchToBottom('[cmdk-list]');
  const boqLastState = await evaluate(`(() => {
    const node = document.querySelector('[data-testid="option-boq-item-1059"]');
    const list = document.querySelector('[cmdk-list]');
    if (!node || !list) return null;
    const rect = node.getBoundingClientRect();
    return {
      visible: rect.top >= 0 && rect.bottom <= innerHeight,
      rect: { top: rect.top, bottom: rect.bottom },
      list: { scrollTop: list.scrollTop, scrollHeight: list.scrollHeight, clientHeight: list.clientHeight },
      innerHeight,
    };
  })()`);
  const boqSelectedLast = !!boqLastState?.visible;
  if (!boqSelectedLast && mode === "after") {
    throw new Error(`${label}: BOQ last option not visible at scroll bottom: ${JSON.stringify(boqLastState)}`);
  }
  if (boqSelectedLast) {
    await touchTap('[data-testid="option-boq-item-1059"]');
    await waitFor("document.querySelector('[data-testid=\"touch-boq-item-select\"]')?.textContent?.includes('BOQ-60')");
  } else {
    await cdp("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape" });
    await cdp("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape" });
  }
  await bringIntoView("touch-boq-item-select");
  await click("touch-boq-item-select");
  await waitFor("!!document.querySelector('[cmdk-list]')");
  await sleep(500);
  if (mode === "before") await emulateOldCss();
  const boqWheel = await wheel('[cmdk-list]');
  const image = await screenshot(`${mode}-${label}.png`);

  return {
    viewport: { width, height },
    billItemPresentation: width < 768 ? "Drawer" : "Popover",
    equipment: { touchToBottom: equipmentTouch, wheel: equipmentWheel, selectedLast: true },
    boq: { touchToBottom: boqTouch, wheel: boqWheel, selectedLast: boqSelectedLast, lastState: boqLastState },
    screenshot: image,
  };
};

// 767px exercises BillItemPicker's mobile Drawer branch. 768px is the exact
// iPad portrait CSS width and exercises its Popover branch; 1024px covers
// iPad landscape. SiteEdit itself has no enclosing Dialog/Drawer/scroll lock.
const touchMobileDrawer = await verifyTouchWidth(767, 900, "mobile-767");
const touchIpadPortrait = await verifyTouchWidth(768, 1024, "ipad-portrait-768");
const touchIpadLandscape = await verifyTouchWidth(1024, 768, "ipad-landscape-1024");

// A separate non-mobile render exercises the actual desktop branches:
// Radix Select plus BillItemPicker's Popover (rather than its mobile Drawer).
await cdp("Emulation.setTouchEmulationEnabled", { enabled: false });
await cdp("Emulation.setDeviceMetricsOverride", {
  width: 1440,
  height: 900,
  deviceScaleFactor: 1,
  mobile: false,
});
await cdp("Page.navigate", { url: baseUrl });
await waitFor("document.readyState === 'complete'");
await bringIntoView("equipment-trigger");
await click("equipment-trigger");
await waitFor("!!document.querySelector('[data-radix-select-viewport]')");
await sleep(500);
if (mode === "before") await emulateOldCss();
const equipmentDesktopWheel = await wheel('[data-radix-select-viewport]');
await cdp("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape" });
await cdp("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape" });
await bringIntoView("touch-boq-item-select");
await click("touch-boq-item-select");
await waitFor("!!document.querySelector('[cmdk-list]')");
await sleep(500);
if (mode === "before") await emulateOldCss();
const boqDesktopWheel = await wheel('[cmdk-list]');
const desktopImage = await screenshot(`${mode}-desktop-wheel.png`);

const result = {
  mode,
  touchMobileDrawer,
  touchIpadPortrait,
  touchIpadLandscape,
  desktop: {
    equipmentWheel: equipmentDesktopWheel,
    boqWheel: boqDesktopWheel,
  },
  desktopScreenshot: desktopImage,
};
writeFileSync(path.join(evidenceDir, `${mode}-result.json`), JSON.stringify(result, null, 2));

if (mode === "after") {
  for (const scenario of [touchMobileDrawer, touchIpadPortrait, touchIpadLandscape]) {
    for (const [name, evidence] of Object.entries({ equipment: scenario.equipment, boq: scenario.boq })) {
      const { before, after } = evidence.touchToBottom;
      if (after.scrollTop < after.scrollHeight - after.clientHeight - 2) {
        throw new Error(`${scenario.viewport.width}px ${name} did not reach the full list bottom`);
      }
      if (after.scrollTop <= before.scrollTop || !evidence.selectedLast) {
        throw new Error(`${scenario.viewport.width}px ${name} did not touch-scroll and select the last item`);
      }
    }
  }
  if (equipmentDesktopWheel.after.scrollTop <= equipmentDesktopWheel.before.scrollTop) {
    throw new Error("equipment regressed desktop mouse-wheel scrolling");
  }
  if (boqDesktopWheel.after.scrollTop <= boqDesktopWheel.before.scrollTop) {
    throw new Error("BOQ regressed desktop mouse-wheel scrolling");
  }
}

console.log(JSON.stringify(result, null, 2));
socket.close();