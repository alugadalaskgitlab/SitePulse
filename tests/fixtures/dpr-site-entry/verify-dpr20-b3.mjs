/*
 * DPR20 B3: verify the existing SiteReport Lifecycle display and Send onward.
 * No production change is required. Uses the isolated B1 synthetic fixture.
 * Parent owns Vite :4178 and Chromium CDP :9222; no server/config changes here.
 */
import WebSocket from "ws";
import { mkdirSync, writeFileSync } from "node:fs";

const base = process.env.DPR_FIXTURE_URL || "http://127.0.0.1:4178";
const cdp = process.env.CDP_URL || "http://127.0.0.1:9222";
const output = "tests/fixtures/dpr-site-entry/evidence";
mkdirSync(output, { recursive: true });
const target = await (await fetch(`${cdp}/json/new?about:blank`, { method: "PUT" })).json();
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.once("open", resolve);
  socket.once("error", reject);
});
let serial = 0;
const pending = new Map();
const exceptions = [];
const blockedNativeApiRequests = [];
socket.on("message", raw => {
  const message = JSON.parse(raw);
  if (message.method === "Runtime.exceptionThrown") exceptions.push(message.params.exceptionDetails);
  if (message.method === "Fetch.requestPaused") {
    // Every API must be resolved by the fixture's fetch interceptor. Block any
    // accidental native API traffic before it can reach a server/database.
    blockedNativeApiRequests.push(message.params.request);
    void call("Fetch.fulfillRequest", {
      requestId: message.params.requestId,
      responseCode: 418,
      responseHeaders: [{ name: "Content-Type", value: "application/json" }],
      body: Buffer.from(JSON.stringify({ message: "B3 verifier blocks native API traffic" })).toString("base64"),
    }).catch(error => exceptions.push({ description: error.message }));
  }
  const item = pending.get(message.id);
  if (!item) return;
  clearTimeout(item.timer);
  pending.delete(message.id);
  message.error ? item.reject(new Error(message.error.message)) : item.resolve(message.result);
});
function call(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++serial;
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`CDP timeout: ${method}`));
    }, 25000);
    pending.set(id, { resolve, reject, timer });
    socket.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const result = await call("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
  return result.result?.value;
}
async function wait(expression) {
  for (let i = 0; i < 300; i++) {
    if (await evaluate(expression)) return;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out: ${expression}; ${await evaluate("document.body.innerText.slice(-1200)")}`);
}
function check(condition, message, evidence) {
  if (!condition) throw new Error(`${message}: ${JSON.stringify(evidence)}`);
}
async function screenshot(name, selector = '[data-testid="row-equipment-0"] > td:last-child') {
  await evaluate(`document.querySelector(${JSON.stringify(selector)})?.scrollIntoView({
    block:'start',inline:'end',behavior:'instant'
  })`);
  await evaluate("window.scrollBy({top:-80,behavior:'instant'})");
  const shot = await call("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  const path = `${output}/dpr20-b3-${name}.png`;
  writeFileSync(path, Buffer.from(shot.data, "base64"));
  return path;
}
async function navigate(role = "manager") {
  await call("Page.navigate", { url: `${base}/site/report/20601?dpr20b1=1&role=${role}` });
  await wait(`document.querySelectorAll('[data-testid^="row-equipment-"]').length===4
    && !!document.querySelector('[data-testid="badge-equipment-lifecycle-0"]')
    && !!document.querySelector('[data-testid="badge-equipment-lifecycle-1"]')
    && !!document.querySelector('[data-testid="badge-equipment-lifecycle-2"]')`);
}
async function lifecycleEvidence() {
  return evaluate(`(() => {
    const rows=Array.from(document.querySelectorAll('[data-testid^="row-equipment-"]'));
    const table=rows[0].closest('table');
    return {
      equipmentTables:new Set(rows.map(r=>r.closest('table'))).size,
      compactCards:document.querySelectorAll('[data-testid^="equipment-compact-readonly-"],[data-testid^="equipment-compact-read-group-"]').length,
      nestedEquipmentTables:table.querySelectorAll('table').length,
      headers:Array.from(table.querySelectorAll('thead th')).map(h=>h.textContent.trim()),
      cellCounts:rows.map(r=>r.querySelectorAll(':scope > td').length),
      lifecycle:rows.map(r=>({
        text:r.lastElementChild.textContent.trim(),
        badge:r.lastElementChild.querySelector('[data-testid^="badge-equipment-lifecycle-"]')?.textContent ?? null,
        move:!!r.lastElementChild.querySelector('[data-testid^="button-move-equipment-"]'),
        buttons:r.lastElementChild.querySelectorAll('button').length,
        displayed:getComputedStyle(r.lastElementChild).display,
      })),
      linkedIds:window.__DprSiteFixture.requests.filter(r=>r.path.startsWith('/api/equipment-usage/lifecycle?'))
        .map(r=>new URL(r.path,location.origin).searchParams.get('ids')),
      writes:window.__DprSiteFixture.requests.filter(r=>r.method!=='GET'),
      viewport:innerWidth,
    };
  })()`);
}
function verifyLifecycle(evidence, role, device) {
  check(evidence.equipmentTables === 1 && evidence.compactCards === 0 && evidence.nestedEquipmentTables === 0,
    `Exactly one equipment table (${device}, ${role})`, evidence);
  check(evidence.headers.join("|") === "Machine|Vehicle No|Operator|Task|Time/Meter|Operating Quantity|Diesel (L)|Expected Diesel|Norm / Efficiency|Breakdown / Stoppage|Diesel Source|Lifecycle"
    && evidence.cellCounts.every(count => count === 12),
  "All 12 existing columns and Lifecycle retained", evidence);
  const [closed, open, completed, unlinked] = evidence.lifecycle;
  check(closed.badge === "Closed by Synthetic operator" && closed.move === (role === "manager")
    && closed.buttons === (role === "manager" ? 1 : 0),
    "Closed linked source eligibility unchanged", closed);
  check(open.badge === "Pending at SITE: NARASIMHULU ROAD" && !open.move,
    "Open linked source retains Pending destination without action", open);
  check(completed.badge === "Completed at HMP" && !completed.move,
    "Closed source with successor retains Completed without action", completed);
  check(unlinked.text === "—" && unlinked.badge === null && !unlinked.move && unlinked.buttons === 0,
    "Free-text unlinked row is literal neutral dash, no badge/action", unlinked);
  check(evidence.lifecycle.every(cell => cell.displayed !== "none"),
    "Lifecycle remains visible on screen", evidence.lifecycle);
  check(evidence.linkedIds.length > 0 && evidence.linkedIds.every(ids => ids === "20801,20802,20803"),
    "Only genuine linked usage IDs requested; free-text row excluded", evidence.linkedIds);
  check(evidence.writes.length === 0, "Read-only view makes no writes", evidence.writes);
}

await call("Page.enable");
await call("Runtime.enable");
await call("Fetch.enable", { patterns: [{ urlPattern: "*/api/*", requestStage: "Request" }] });
const result = [];
try {
  for (const [device, width, height] of [["desktop", 1440, 1000], ["mobile", 390, 844]]) {
    // No viewport meta in fixture: mobile:false gives actual narrow CSS width.
    await call("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });
    await call("Emulation.setEmulatedMedia", { media: "screen" });
    for (const role of ["manager", "viewer"]) {
      await navigate(role);
      const evidence = await lifecycleEvidence();
      verifyLifecycle(evidence, role, device);
      check(evidence.viewport === width, "Actual requested CSS viewport", evidence.viewport);
      const screenshots = [
        await screenshot(`${device}-${role}-linked`),
        await screenshot(`${device}-${role}-unlinked`, '[data-testid="row-equipment-3"] > td:last-child'),
      ];
      result.push({ device, role, evidence, screenshots });
    }
  }

  await navigate("manager");
  await call("Emulation.setEmulatedMedia", { media: "print" });
  const print = await evaluate(`(() => {
    const rows=Array.from(document.querySelectorAll('[data-testid^="row-equipment-"]'));
    const table=rows[0].closest('table');
    return {
      lifecycleHidden:rows.every(r=>getComputedStyle(r.lastElementChild).display==='none'),
      headerHidden:getComputedStyle(table.querySelector('thead th:last-child')).display==='none',
      visibleHeaders:Array.from(table.querySelectorAll('thead th')).filter(h=>getComputedStyle(h).display!=='none').map(h=>h.textContent.trim()),
      movesHidden:Array.from(document.querySelectorAll('[data-testid^="button-move-equipment-"]')).every(b=>getComputedStyle(b).display==='none'),
    };
  })()`);
  check(print.lifecycleHidden && print.headerHidden && print.movesHidden && print.visibleHeaders.length === 11,
    "Original print behavior: 11 audit columns, Lifecycle and action hidden", print);
  result.push({ print });
  await call("Emulation.setEmulatedMedia", { media: "screen" });
  await call("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });

  for (const [label, destinationType, destinationSite] of [
    ["HMP Plant", "hmp", undefined],
    ["RMC Plant", "rmc", undefined],
    ["NARASIMHULU ROAD", "site", "NARASIMHULU ROAD"],
  ]) {
    await navigate("manager");
    await evaluate(`document.querySelector('[data-testid="button-move-equipment-0"]').click()`);
    await wait(`!!document.querySelector('[data-testid="select-move-destination-0"]')`);
    check(await evaluate(`document.querySelector('[data-testid="button-confirm-move-0"]').disabled`),
      "Existing Send disabled until destination selected", label);
    check(await evaluate(`document.querySelector('[data-testid="input-successor-date-0"]').value==='2026-08-05'`),
      "Existing Send initializes successor date from DPR", label);
    await evaluate(`document.querySelector('[data-testid="select-move-destination-0"]').click()`);
    await wait(`Array.from(document.querySelectorAll('[role="option"]')).some(o=>o.textContent.includes(${JSON.stringify(label)}))`);
    await evaluate(`Array.from(document.querySelectorAll('[role="option"]')).find(o=>o.textContent.includes(${JSON.stringify(label)})).click()`);
    await evaluate(`(() => {
      const input=document.querySelector('[data-testid="input-successor-date-0"]');
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'2026-08-06');
      input.dispatchEvent(new Event('input',{bubbles:true}));
      input.dispatchEvent(new Event('change',{bubbles:true}));
    })()`);
    check(!await evaluate(`document.querySelector('[data-testid="button-confirm-move-0"]').disabled`),
      "Selected destination enables original Send", label);
    const controlsScreenshot = await screenshot(`send-${destinationType}`, '[data-testid="select-move-destination-0"]');
    await evaluate(`document.querySelector('[data-testid="button-confirm-move-0"]').click()`);
    await wait(`window.__DprSiteFixture.requests.some(r=>r.method==='POST'&&r.path==='/api/equipment-usage/20801/move')
      && !document.querySelector('[data-testid="button-confirm-move-0"]')`);
    const writes = await evaluate(`window.__DprSiteFixture.requests.filter(r=>r.method!=='GET')`);
    const body = { destinationType, ...(destinationSite ? { destinationSite } : {}), successorDate: "2026-08-06" };
    check(writes.length === 1 && writes[0].method === "POST" && writes[0].path === "/api/equipment-usage/20801/move"
      && JSON.stringify(writes[0].body) === JSON.stringify(body),
    "Unchanged canonical move endpoint and exact payload (synthetic only)", writes);
    result.push({ destination: label, writes, screenshot: controlsScreenshot });
  }
  check(blockedNativeApiRequests.length === 0, "All APIs resolved by synthetic fixture; no native API traffic", blockedNativeApiRequests);
  check(exceptions.length === 0, "No uncaught browser exceptions", exceptions);
  writeFileSync(`${output}/dpr20-b3-result.json`, JSON.stringify({
    source: "isolated B1 synthetic fixture, real SiteReport and move UI, intercepted APIs, no customer writes",
    productionChanges: false,
    blockedNativeApiRequests,
    result,
  }, null, 2));
  console.log(JSON.stringify(result, null, 2));
} finally {
  socket.close();
  await fetch(`${cdp}/json/close/${target.id}`);
}