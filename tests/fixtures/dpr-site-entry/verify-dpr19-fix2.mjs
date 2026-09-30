/*
 * DPR19 Fix2 — real SiteEntry/SiteEdit browser controls, fixture-only synthetic
 * GET and intercepted save responses. Parent starts Vite :4178 and CDP :9222.
 * node tests/fixtures/dpr-site-entry/verify-dpr19-fix2.mjs
 * No operational/customer endpoint is used.
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
  const msg = JSON.parse(raw);
  if (msg.method === "Runtime.exceptionThrown") exceptions.push(msg.params.exceptionDetails);
  // Native window.confirm is not the approved inline confirmation.
  if (msg.method === "Page.javascriptDialogOpening") void call("Page.handleJavaScriptDialog", { accept: false });
  const item = pending.get(msg.id);
  if (!item) return;
  clearTimeout(item.timer);
  pending.delete(msg.id);
  msg.error ? item.reject(new Error(`${item.method}: ${msg.error.message}`)) : item.resolve(msg.result);
});
function call(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++serial;
    const timer = setTimeout(() => reject(new Error(`CDP timeout: ${method}`)), 20000);
    pending.set(id, { method, resolve, reject, timer });
    socket.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const result = await call("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
  return result.result?.value;
}
async function wait(expression) {
  for (let i = 0; i < 250; i++) {
    if (await evaluate(expression)) return;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`Timeout ${expression}: ${JSON.stringify(await evaluate("({path:location.pathname,body:document.body.innerText.slice(-1800),requests:window.__DprSiteFixture?.requests.slice(-4)})"))}; exceptions: ${JSON.stringify(exceptions)}`);
}
function check(value, label, detail) {
  if (!value) throw new Error(`${label}: ${JSON.stringify(detail)}`);
}
async function assert(expression, label) {
  const value = await evaluate(expression);
  check(value, label, await evaluate("document.body.innerText.slice(-1200)"));
}
async function navigate(path) {
  await call("Page.navigate", { url: base + path });
  await wait("document.readyState === 'complete' && !!window.__DprSiteFixture");
}
async function click(selector) {
  await wait(`!!document.querySelector(${JSON.stringify(selector)})`);
  await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
}
async function fill(selector, value) {
  await wait(`!!document.querySelector(${JSON.stringify(selector)})`);
  await evaluate(`(() => {
    const node = document.querySelector(${JSON.stringify(selector)});
    const proto = node.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(node, ${JSON.stringify(value)});
    node.dispatchEvent(new Event('input', { bubbles: true }));
    node.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
}
async function select(selector, label) {
  await click(selector);
  await wait(`Array.from(document.querySelectorAll('[role="option"]')).some(n => n.textContent.includes(${JSON.stringify(label)}))`);
  await evaluate(`Array.from(document.querySelectorAll('[role="option"]')).find(n => n.textContent.includes(${JSON.stringify(label)})).click()`);
}
async function escape() {
  await call("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  await call("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
}
const row = '[data-testid="equipment-row-0"]';
const remove = '[data-testid="button-remove-equipment-0"]';
const toggle = '[data-testid="equipment-compact-0"] button[aria-label^="Expand"], [data-testid="equipment-compact-0"] button[aria-label^="Collapse"]';
const count = 'document.querySelectorAll(\'[data-testid^="equipment-row-"]\').length';
async function confirmButton(label) {
  const selector = await evaluate(`(() => {
    const container = document.querySelector(${JSON.stringify(row)});
    const buttons = Array.from(container?.querySelectorAll('button') || []);
    const node = buttons.find(button => (button.textContent.trim() === ${JSON.stringify(label)}
      || (${JSON.stringify(label)} === 'Remove' && button.textContent.trim() === 'Remove row'))
      && !button.matches(${JSON.stringify(remove)}));
    if (!node) return null;
    node.setAttribute('data-fix2-verifier-action', ${JSON.stringify(label)});
    return '[data-fix2-verifier-action="${label}"]';
  })()`);
  check(selector, `Inline ${label} equipment action missing`, await evaluate(`document.querySelector(${JSON.stringify(row)})?.innerText`));
  await click(selector);
}
async function layout(page, device) {
  const geometry = await evaluate(`(() => {
    const root = document.querySelector(${JSON.stringify(row)});
    const trigger = root?.querySelector(${JSON.stringify(toggle)});
    const deleteButton = root?.querySelector(${JSON.stringify(remove)});
    const box = node => { const b = node?.getBoundingClientRect(); return b && {
      left:b.left, right:b.right, top:b.top, bottom:b.bottom, width:b.width, height:b.height
    }; };
    return { row:box(root), trigger:box(trigger), delete:box(deleteButton),
      viewport:innerWidth, scrollWidth:document.documentElement.scrollWidth,
      overflowSources:Array.from(document.querySelectorAll('body *'))
        .filter(node => { const b=node.getBoundingClientRect(); return b.width > 0 && b.right > innerWidth + 2; })
        .slice(0, 6).map(node => ({ tag:node.tagName, testid:node.getAttribute('data-testid'),
          className:typeof node.className==='string' ? node.className.slice(0,100) : '',
          right:node.getBoundingClientRect().right })) };
  })()`);
  const overlap = (a, b) => a && b && Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1
    && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1;
  check(geometry.row && geometry.trigger && geometry.delete, `${page}/equipment/${device} actual controls`, geometry);
  check(!overlap(geometry.trigger, geometry.delete), `${page}/equipment/${device} delete overlaps toggle`, geometry);
  check(geometry.delete.width >= 44 && geometry.delete.height >= 44, `${page}/equipment/${device} delete touch target <44px`, geometry);
  check(geometry.delete.left >= geometry.row.left - 1 && geometry.delete.right <= geometry.row.right + 1
    && geometry.trigger.left >= geometry.row.left - 1 && geometry.trigger.right <= geometry.row.right + 1
    && geometry.row.left >= -1 && geometry.row.right <= geometry.viewport + 1,
    `${page}/equipment/${device} controls overflow card or viewport`, geometry);
  return geometry;
}
async function exercise(page, device) {
  const before = await evaluate(count);
  check(before === 2, `${page}/equipment expects exactly two populated rows`, before);
  const identityExpression = `document.querySelector(${JSON.stringify(row)})?.getAttribute('data-dpr-equipment-identity')`;
  const identity = await evaluate(identityExpression);
  const geometry = await layout(page, device);
  await click(remove);
  await wait(`!!document.querySelector('[data-testid="confirm-remove-equipment-0"]')`);
  check(await evaluate(count) === before, `${page}/equipment first click deleted row`);
  const confirmationGeometry = await evaluate(`(() => {
    const root=document.querySelector(${JSON.stringify(row)});
    const action=Array.from(root.querySelectorAll('button')).find(n=>n.textContent.trim()==='Cancel');
    const header=root.querySelector(${JSON.stringify(toggle)});
    const a=action?.getBoundingClientRect(), h=header?.getBoundingClientRect();
    const prompt=root.querySelector('[data-testid="confirm-remove-equipment-0"]');
    const label=prompt?.querySelector('span'), range=document.createRange();
    if(label)range.selectNodeContents(label);
    const textRect=Array.from(range.getClientRects()).map(b=>({left:b.left,right:b.right,top:b.top,bottom:b.bottom}));
    const controls=Array.from(prompt?.querySelectorAll('button') || []).map(n=>{
      const b=n.getBoundingClientRect(); return {left:b.left,right:b.right,top:b.top,bottom:b.bottom};
    });
    const textOverlapsControls=textRect.some(t=>controls.some(b=>
      Math.min(t.right,b.right)-Math.max(t.left,b.left)>1 &&
      Math.min(t.bottom,b.bottom)-Math.max(t.top,b.top)>1));
    return { cancelTop:a?.top, headerBottom:h?.bottom, inside:root.contains(action),
      textRect, controls, textOverlapsControls };
  })()`);
  check(confirmationGeometry.inside && confirmationGeometry.cancelTop >= confirmationGeometry.headerBottom - 1,
    `${page}/equipment confirmation must be inline below header`, confirmationGeometry);
  check(!confirmationGeometry.textOverlapsControls,
    `${page}/equipment/${device} confirmation text overlaps Cancel/Remove`, confirmationGeometry);
  await confirmButton("Cancel");
  await assert(`${count} === 2 && !document.querySelector('[data-testid="confirm-remove-equipment-0"]')`,
    `${page}/equipment Cancel must dismiss without deleting`);
  await click(remove);
  await escape();
  await assert(`${count} === 2 && !document.querySelector('[data-testid="confirm-remove-equipment-0"]')`,
    `${page}/equipment Escape must dismiss`);
  await click(remove);
  await click(toggle);
  await assert(`${count} === 2 && !document.querySelector('[data-testid="confirm-remove-equipment-0"]')`,
    `${page}/equipment toggle must dismiss`);
  await click(remove);
  await wait(`!!document.querySelector('[data-testid="confirm-remove-equipment-0"]')`);
  const evidenceDir = "tests/fixtures/dpr-site-entry/evidence";
  mkdirSync(evidenceDir, { recursive: true });
  await evaluate(`document.querySelector(${JSON.stringify(remove)}).scrollIntoView({block:'center',behavior:'instant'})`);
  const screenshot = `${evidenceDir}/dpr19-fix2-${page}-equipment-${device}.png`;
  const image = await call("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  writeFileSync(screenshot, Buffer.from(image.data, "base64"));
  // Keep a second confirmation pending across an index shift. The remove
  // callback must resolve immutable machine identity, never a captured index.
  await click('[data-testid="button-remove-equipment-1"]');
  await wait(`!!document.querySelector('[data-testid="confirm-remove-equipment-1"]')`);
  await confirmButton("Remove");
  await wait(`${count} === 1`);
  await assert(`${identityExpression} !== ${JSON.stringify(identity)}`,
    `${page}/equipment deleted wrong identity`);
  await assert(`document.querySelector(${JSON.stringify(remove)})?.disabled === true`,
    `${page}/equipment last row remove must be disabled`);
  await assert(`!document.querySelector('[data-testid="confirm-remove-equipment-0"]')`,
    `${page}/equipment reindexed surviving row must not expose stale confirmation`);
  return { page, type: "equipment", device, geometry, confirmationGeometry, screenshot };
}

const findings = [];
try {
  await call("Page.enable");
  await call("Runtime.enable");
  for (const [device, width, height] of [["desktop", 1440, 900], ["mobile", 390, 844]]) {
    await call("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });
    await navigate("/fixture/dpr16-b2-create?dpr16b2=1&fix2=1");
    await evaluate("sessionStorage.clear(); localStorage.clear()");
    for (const page of ["entry", "edit"]) {
      await navigate(page === "entry" ? "/fixture/dpr16-b2-create?dpr16b2=1&fix2=1" : "/site/edit/6340?dpr16b2=1&fix2=1");
      await wait('!!document.querySelector(\'[data-testid="button-add-equipment"]\')');
      if (page === "entry") {
        await select('[data-testid="input-site"]', "NARASIMHULU ROAD");
        await select('[data-testid="select-engineer"]', "SURESH KUMAR");
        await click('[data-testid="button-add-equipment"]');
        for (const i of [0, 1]) {
          await select(`[data-testid="select-equipment-${i}"]`, i ? "DAILY HIRE LOADER" : "DAILY HIRE ROLLER");
          if (i === 1) {
            if (await evaluate("!!document.querySelector('[data-testid=\"equipment-compact-1\"] button[aria-label^=\"Expand\"]')")) {
              await click('[data-testid="equipment-compact-1"] button[aria-label^="Expand"]');
            }
            await fill('[data-testid="input-equipment-operator-1"]', "SYNTHETIC KEEP OPERATOR");
          }
        }
      }
      findings.push(await exercise(page, device));
      // Deleting an unfilled placeholder must never retarget the populated
      // survivor (including after the prior index-0 deletion/reindex).
      {
        await click('[data-testid="button-add-equipment"]');
        await wait(`${count} === 2`);
        await click('[data-testid="button-remove-equipment-1"]');
        check(await evaluate(count) === 2, `${page}/equipment/${device} blank first click deleted a row`);
        const blankPrompt = '[data-testid="equipment-row-1"]';
        await wait(`document.querySelector(${JSON.stringify(blankPrompt)})?.innerText.includes('Cancel')`);
        await evaluate(`(() => { const root = document.querySelector(${JSON.stringify(blankPrompt)});
          const button = Array.from(root.querySelectorAll('button')).find(n => /^Remove(?: row)?$/.test(n.textContent.trim()));
          if (!button) throw new Error('Blank-row inline Remove action missing');
          button.click(); })()`);
        await wait(`${count} === 1`);
      }
      await assert(`document.querySelector('[data-testid="equipment-row-0"]')?.getAttribute('data-dpr-equipment-identity')?.includes(${JSON.stringify(page === "entry" ? "DAILY HIRE LOADER" : "FIX2-KEEP")})`,
        `${page}/${device} survivor equipment identity changed`);
      const beforeWrites = await evaluate("window.__DprSiteFixture.dprDraftPayloads.length");
      await click(page === "entry" ? '[data-testid="button-save-draft"]' : '[data-testid="button-save-draft-progress"]');
      await wait(`window.__DprSiteFixture.dprDraftPayloads.length > ${beforeWrites}`);
      const payload = await evaluate("window.__DprSiteFixture.dprDraftPayloads.at(-1)?.payload");
      const equipment = payload?.equipment || [];
      check(equipment.length === 1 && (page === "entry"
        ? equipment[0].machine?.includes("DAILY HIRE LOADER") && equipment[0].operator === "SYNTHETIC KEEP OPERATOR"
        : equipment[0].vehicleNo === "FIX2-KEEP" && equipment[0].operator === "SYNTHETIC KEEP OPERATOR"
          && Number(equipment[0].diesel) === 23),
      `${page}/${device} saved survivor equipment fields`, equipment);
      const writes = await evaluate("window.__DprSiteFixture.requests.filter(r => r.method !== 'GET').map(r => r.path)");
      check(writes.every(path => path.startsWith("/api/")), `${page}/${device} unexpected non-fixture writes`, writes);
      findings.push({ page, device, save: { equipment }, writes });
    }
  }
  check(!exceptions.length, "Browser exceptions", exceptions);
  mkdirSync("tests/fixtures/dpr-site-entry/evidence", { recursive: true });
  writeFileSync("tests/fixtures/dpr-site-entry/evidence/dpr19-fix2-result.json",
    JSON.stringify({ source: "actual pages / synthetic fixture only; no customer writes", findings }, null, 2));
  console.log("PASS DPR19 Fix2 actual-page desktop/mobile equipment delete layout, confirmation safety, and survivor save payload.");
} finally {
  socket.close();
  await fetch(`${cdp}/json/close/${target.id}`).catch(() => {});
}