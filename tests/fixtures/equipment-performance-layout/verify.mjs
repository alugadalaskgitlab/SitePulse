import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import WebSocket from "ws";

const root = path.resolve(new URL("../../..", import.meta.url).pathname);
const fixture = path.join(root, "tests/fixtures/equipment-performance-layout");
const evidence = path.join(fixture, "evidence");
const vitePort = Number(process.env.VITE_PORT || 4193);
const cdpPort = Number(process.env.CDP_PORT || 9343);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
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
      if (attempt === 99) throw new Error("Fixture server did not start");
    }
    await sleep(100);
  }

  chromium = spawn("/repl/tools/bin/chromium", [
    "--headless",
    "--no-sandbox",
    "--disable-gpu",
    `--remote-debugging-port=${cdpPort}`,
    `--user-data-dir=/tmp/equipment-performance-layout-${process.pid}`,
    `http://127.0.0.1:${vitePort}/reports/equipment-performance`,
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
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result?.value;
  };
  const waitFor = async (expression, label) => {
    for (let attempt = 0; attempt < 300; attempt += 1) {
      if (await evaluate(expression).catch(() => false)) return;
      await sleep(50);
    }
    throw new Error(`Timed out waiting for ${label}`);
  };
  const viewport = (width, height, mobile = false) =>
    cdp("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile });
  const screenshot = async name => {
    await sleep(250);
    const image = await cdp("Page.captureScreenshot", {
      format: "png",
      fromSurface: true,
      captureBeyondViewport: false,
    });
    const target = path.join(evidence, `${name}.png`);
    writeFileSync(target, Buffer.from(image.data, "base64"));
    return target;
  };
  const click = selector => evaluate(`(() => {
    const element = document.querySelector(${JSON.stringify(selector)});
    if (!element) return false;
    element.click();
    return true;
  })()`);
  const press = async key => {
    await cdp("Input.dispatchKeyEvent", { type: "keyDown", key, code: key });
    await cdp("Input.dispatchKeyEvent", { type: "keyUp", key, code: key });
  };

  await cdp("Page.enable");
  await cdp("Runtime.enable");
  await viewport(1024, 620);
  await waitFor("!!document.querySelector('[data-testid=\"page-equipment-performance\"]')", "actual report page");
  await waitFor("!!document.querySelector('tbody tr[role=\"button\"]')", "equipment row");

  assert(await evaluate(`document.querySelector('[data-testid="notice-equipment-identification"]')?.innerText.includes("across all accessible dates and projects")`),
    "Independent all-record identification disclosure missing");
  assert(await evaluate(`document.querySelectorAll('input[type="date"]').length === 2 && Array.from(document.querySelectorAll('input[type="date"]')).every(input => input.getBoundingClientRect().right <= input.closest("section").getBoundingClientRect().right + 1)`),
    "Date controls overflow their responsive filter panel");
  const bannerScreenshot = await screenshot("after-report-banner-1024x620");
  await cdp("Page.navigate", {
    url: `http://127.0.0.1:${vitePort}/masters/section/equipment?review=identification#equipment-needing-identification`,
  });
  await waitFor("!!document.querySelector('[data-testid=\"identification-reason-9701\"]')", "unnamed identification review reason");
  assert(await evaluate(`document.querySelector('[data-testid="identification-reason-9701"]').innerText.includes("name")`),
    "Unnamed review reason is not disclosed");
  assert(await evaluate(`document.querySelector('[data-testid="identification-evidence-9701"]').innerText.includes("Loading reclaimed material")`),
    "Representative source evidence is not shown");
  assert(await evaluate(`document.querySelector('[data-testid="child-evidence-9701"]').innerText.includes("2")`),
    "Linked child evidence counts are not shown");
  assert(await evaluate(`(() => {
    const text = document.querySelector('[data-testid="identification-evidence-9701"]').innerText;
    return text.includes("RAW-CHILD-9701") && text.includes("84 L") && text.includes("46 L")
      && text.includes("Hydraulic hose inspection recorded");
  })()`), "Raw vehicle, tank, or linked breakdown evidence is not shown");
  const reviewScreenshot = await screenshot("after-unnamed-review-evidence-1024x620");
  await cdp("Page.navigate", { url: `http://127.0.0.1:${vitePort}/reports/equipment-performance` });
  await waitFor("!!document.querySelector('tbody tr[role=\"button\"]')", "equipment row after review evidence");

  await click('tbody tr[role="button"]');
  await waitFor("!!document.querySelector('[role=\"dialog\"]')", "equipment popup");
  const layerContract = await evaluate(`(() => {
    const dialog = document.querySelector('[role="dialog"]');
    const sidebar = document.querySelector('aside');
    const rect = dialog.getBoundingClientRect();
    return {
      dialogZ: Number(getComputedStyle(dialog).zIndex),
      sidebarZ: Number(getComputedStyle(sidebar).zIndex),
      bounded: rect.top >= 0 && rect.bottom <= innerHeight && rect.left >= 0 && rect.right <= innerWidth,
    };
  })()`);
  assert(layerContract.dialogZ > layerContract.sidebarZ, "Popup is not above desktop navigation");
  assert(layerContract.bounded, "Popup escapes the 1024x620 viewport");

  const initialScroll = await evaluate(`(() => {
    const scroll = document.querySelector('[data-testid="equipment-daily-table-scroll"]');
    scroll.focus();
    const rect = scroll.getBoundingClientRect();
    return {
      x: scroll.scrollLeft, y: scroll.scrollTop,
      horizontal: scroll.scrollWidth > scroll.clientWidth,
      vertical: scroll.scrollHeight > scroll.clientHeight,
      cx: rect.left + rect.width / 2, cy: rect.top + rect.height / 2,
    };
  })()`);
  assert(initialScroll.horizontal && initialScroll.vertical, "Daily table does not expose both scroll axes");
  await cdp("Input.dispatchMouseEvent", {
    type: "mouseWheel",
    x: initialScroll.cx,
    y: initialScroll.cy,
    deltaX: 420,
    deltaY: 320,
  });
  await sleep(200);
  const wheelScroll = await evaluate(`(() => {
    const scroll = document.querySelector('[data-testid="equipment-daily-table-scroll"]');
    return { x: scroll.scrollLeft, y: scroll.scrollTop };
  })()`);
  assert(wheelScroll.x > initialScroll.x && wheelScroll.y > initialScroll.y, "Wheel did not move both table axes");
  const desktopScreenshot = await screenshot("after-popup-1024x620");

  await press("Escape");
  await waitFor("!document.querySelector('[role=\"dialog\"]')", "Escape popup close");
  assert(await evaluate(`document.activeElement === document.querySelector('tbody tr[role="button"]')`),
    "Popup close did not restore focus to its equipment row");
  await press("Enter");
  await waitFor("!!document.querySelector('[role=\"dialog\"]')", "keyboard popup reopen");
  const sourceToggle = await evaluate(`(() => {
    const button = Array.from(document.querySelectorAll('[role="dialog"] button')).find(item => item.textContent.includes("Source Records"));
    button?.click();
    return !!button;
  })()`);
  assert(sourceToggle, "Source records toggle missing");
  await waitFor("!!document.querySelector('[data-testid=\"equipment-source-records\"]')", "source records");
  assert(await evaluate(`(() => {
    const sources = document.querySelector('[data-testid="equipment-source-records"]');
    return sources.scrollHeight > sources.clientHeight && sources.tabIndex === 0;
  })()`), "Source records are not keyboard-focusable and scrollable");

  await viewport(768, 720);
  await sleep(350);
  const tabletBounds = await evaluate(`(() => {
    const dialog = document.querySelector('[role="dialog"]').getBoundingClientRect();
    return { left: dialog.left, right: dialog.right, top: dialog.top, bottom: dialog.bottom, width: innerWidth, height: innerHeight };
  })()`);
  assert(tabletBounds.left >= -1 && tabletBounds.right <= tabletBounds.width + 1
    && tabletBounds.top >= -1 && tabletBounds.bottom <= tabletBounds.height + 1,
  `Tablet popup is not viewport bounded: ${JSON.stringify(tabletBounds)}`);
  const tabletScreenshot = await screenshot("after-popup-tablet-768x720");
  await press("Escape");

  await viewport(390, 844, true);
  await sleep(350);
  await waitFor("!document.querySelector('[role=\"dialog\"]')", "tablet popup close");
  assert(await click('[data-testid="button-menu"]'), "Mobile menu button missing");
  await sleep(350);
  assert(await evaluate(`(() => {
    const nav = Array.from(document.querySelectorAll("aside")).find(item => getComputedStyle(item).display !== "none");
    return nav && Number(getComputedStyle(nav).zIndex) === 40 && Math.abs(nav.getBoundingClientRect().left) < 1;
  })()`), "Mobile navigation did not open on its lowered layer");
  await click("div.fixed.inset-0");
  await click('tbody tr[role="button"]');
  await waitFor("!!document.querySelector('[role=\"dialog\"]')", "phone popup");
  assert(await evaluate(`(() => {
    const dialog = document.querySelector('[role="dialog"]').getBoundingClientRect();
    return dialog.left >= -1 && dialog.right <= innerWidth + 1 && dialog.top >= -1 && dialog.bottom <= innerHeight + 1;
  })()`), "Phone popup is not viewport bounded");
  const phoneScreenshot = await screenshot("after-popup-phone-390x844");

  await viewport(1440, 900);
  await cdp("Page.navigate", {
    url: `http://127.0.0.1:${vitePort}/reports/equipment-performance?acceptanceHarness=1`,
  });
  await waitFor("!!document.querySelector('[data-testid=\"harness-open-outer\"]')", "shared overlay harness");
  await click('[data-testid="harness-open-outer"]');
  await waitFor("!!document.querySelector('[data-testid=\"harness-outer-dialog\"]')", "outer shared dialog");
  assert(await evaluate(`(() => {
    const dialog = document.querySelector('[data-testid="harness-outer-dialog"]');
    const sidebar = document.querySelector("aside");
    return Number(getComputedStyle(dialog).zIndex) > Number(getComputedStyle(sidebar).zIndex);
  })()`), "Shared dialog is not above HubShell navigation");
  await click('[data-testid="harness-select"]');
  await waitFor("!!document.querySelector('[data-testid=\"harness-select-content\"]')", "shared select dropdown");
  assert(await evaluate(`(() => {
    const select = document.querySelector('[data-testid="harness-select-content"]');
    const sidebar = document.querySelector("aside");
    const rect = select.getBoundingClientRect();
    return Number(getComputedStyle(select).zIndex) > Number(getComputedStyle(sidebar).zIndex)
      && rect.left >= 0 && rect.right <= innerWidth && rect.top >= 0 && rect.bottom <= innerHeight;
  })()`), "Shared select dropdown is not above HubShell or viewport bounded");
  const selectScreenshot = await screenshot("after-shared-select-desktop-1440x900");
  await click('[role="option"]');
  await waitFor("!document.querySelector('[data-testid=\"harness-select-content\"]')", "shared select close");
  assert(await evaluate(`document.activeElement === document.querySelector('[data-testid="harness-select"]')`),
    "Shared select did not restore focus to its trigger");

  await click('[data-testid="harness-open-inner"]');
  await waitFor("document.querySelectorAll('[role=\"dialog\"]').length === 2", "nested shared dialog");
  assert(await evaluate(`(() => {
    const dialogs = Array.from(document.querySelectorAll('[role="dialog"]'));
    const inner = document.querySelector('[data-testid="harness-inner-dialog"]');
    return dialogs.includes(inner) && Number(getComputedStyle(inner).zIndex) === 50;
  })()`), "Nested dialog did not retain the shared overlay contract");
  for (let index = 0; index < 8; index += 1) await press("Tab");
  assert(await evaluate(`document.querySelector('[data-testid="harness-inner-dialog"]').contains(document.activeElement)`),
    "Nested dialog focus trap allowed focus to escape");
  const nestedScreenshot = await screenshot("after-nested-dialog-desktop-1440x900");
  await press("Escape");
  await waitFor("document.querySelectorAll('[role=\"dialog\"]').length === 1", "nested dialog Escape close");
  assert(await evaluate(`document.activeElement === document.querySelector('[data-testid="harness-open-inner"]')`),
    "Nested dialog did not restore focus to its trigger");
  await press("Escape");
  await waitFor("!document.querySelector('[role=\"dialog\"]')", "outer dialog Escape close");
  assert(await evaluate(`document.activeElement === document.querySelector('[data-testid="harness-open-outer"]')`),
    "Outer dialog did not restore focus to its trigger");

  await click('tbody tr[role="button"]');
  await waitFor("!!document.querySelector('[data-testid=\"equipment-daily-table-scroll\"]')", "large desktop equipment popup");
  assert(await evaluate(`(() => {
    const dialog = document.querySelector('[role="dialog"]').getBoundingClientRect();
    const scroll = document.querySelector('[data-testid="equipment-daily-table-scroll"]');
    return dialog.left >= 0 && dialog.right <= innerWidth && dialog.top >= 0 && dialog.bottom <= innerHeight
      && scroll.scrollWidth > scroll.clientWidth && scroll.scrollHeight > scroll.clientHeight;
  })()`), "Large desktop popup bounds or scroll axes regressed");
  const largeDesktopScreenshot = await screenshot("after-popup-desktop-1440x900");

  const result = {
    passed: true,
    assertions: [
      "actual App and HubShell fixture rendered",
      "independent all-accessible-record banner rendered",
      "unnamed review reason and representative source evidence rendered",
      "raw tank, child-count, and linked breakdown evidence rendered",
      "date controls fit responsive panel",
      "dialog layer is above desktop and mobile navigation",
      "dialog is bounded at desktop, tablet, and phone",
      "wheel scroll moved horizontal and vertical table axes",
      "Escape restored focus and keyboard reopened popup",
      "source records are focusable and vertically scrollable",
      "shared standard dialog z-50 contract remained unchanged",
      "shared select dropdown remained above HubShell and restored focus",
      "nested dialog trapped focus and restored focus across Escape closes",
      "large desktop popup remained bounded with both table axes",
    ],
    screenshots: [
      bannerScreenshot,
      reviewScreenshot,
      desktopScreenshot,
      tabletScreenshot,
      phoneScreenshot,
      selectScreenshot,
      nestedScreenshot,
      largeDesktopScreenshot,
    ],
  };
  writeFileSync(path.join(evidence, "verification-result.json"), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
} finally {
  socket?.close();
  chromium?.kill("SIGTERM");
  vite.kill("SIGTERM");
}