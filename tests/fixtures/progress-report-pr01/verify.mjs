import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import WebSocket from "ws";

const root = path.resolve(new URL("../../..", import.meta.url).pathname);
const fixture = path.join(root, "tests/fixtures/progress-report-pr01");
const evidence = path.join(fixture, "evidence");
const vitePort = Number(process.env.VITE_PORT || 4197);
const cdpPort = Number(process.env.CDP_PORT || 9347);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const assert = (value, message) => { if (!value) throw new Error(message); };
mkdirSync(evidence, { recursive: true });

const vite = spawn(path.join(root, "node_modules/.bin/vite"), ["--config", path.join(fixture, "vite.config.ts"), "--host", "127.0.0.1", "--port", String(vitePort), "--strictPort"], { cwd: root, stdio: "ignore" });
let chromium;
let socket;
try {
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(`http://127.0.0.1:${vitePort}/`)).ok) break; } catch {}
    if (i === 99) throw new Error("Fixture Vite did not start");
    await sleep(100);
  }
  const url = `http://127.0.0.1:${vitePort}/reports/progress?projectId=7001&from=2026-09-01&to=2026-09-30`;
  chromium = spawn("/repl/tools/bin/chromium", ["--headless", "--no-sandbox", "--disable-gpu", `--remote-debugging-port=${cdpPort}`, `--user-data-dir=/tmp/pr01-${process.pid}`, url], { stdio: "ignore" });
  let targets;
  for (let i = 0; i < 100; i++) {
    try {
      targets = await (await fetch(`http://127.0.0.1:${cdpPort}/json/list`)).json();
      if (targets.some(target => target.type === "page")) break;
    } catch {}
    if (i === 99) throw new Error("Chromium CDP did not start");
    await sleep(100);
  }
  const page = targets.find(target => target.type === "page" && target.url.includes(String(vitePort)));
  socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.once("open", resolve); socket.once("error", reject); });
  let id = 0;
  const pending = new Map();
  socket.on("message", raw => {
    const msg = JSON.parse(raw);
    if (!msg.id || !pending.has(msg.id)) return;
    const request = pending.get(msg.id); pending.delete(msg.id);
    msg.error ? request.reject(new Error(msg.error.message)) : request.resolve(msg.result);
  });
  const cdp = (method, params = {}) => new Promise((resolve, reject) => { const requestId = ++id; pending.set(requestId, { resolve, reject }); socket.send(JSON.stringify({ id: requestId, method, params })); });
  const evalJs = async expression => {
    const result = await cdp("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result?.value;
  };
  const waitFor = async (expression, label) => {
    for (let i = 0; i < 300; i++) { if (await evalJs(expression).catch(() => false)) return; await sleep(50); }
    throw new Error(`Timed out: ${label}`);
  };
  const click = selector => evalJs(`document.querySelector(${JSON.stringify(selector)})?.click()`);
  const pointerClick = async selector => {
    const point = await evalJs(`(() => { const r=document.querySelector(${JSON.stringify(selector)})?.getBoundingClientRect(); return r ? {x:r.left+r.width/2,y:r.top+r.height/2} : null; })()`);
    assert(point, `Missing click target ${selector}`);
    await cdp("Input.dispatchMouseEvent", { type: "mousePressed", x: point.x, y: point.y, button: "left", clickCount: 1 });
    await cdp("Input.dispatchMouseEvent", { type: "mouseReleased", x: point.x, y: point.y, button: "left", clickCount: 1 });
  };
  const press = async key => {
    await cdp("Input.dispatchKeyEvent", { type: "keyDown", key, code: key });
    await cdp("Input.dispatchKeyEvent", { type: "keyUp", key, code: key });
  };
  const shot = async name => {
    await sleep(200);
    const result = await cdp("Page.captureScreenshot", { format: "png", fromSurface: true, captureBeyondViewport: false });
    const target = path.join(evidence, `${name}.png`);
    writeFileSync(target, Buffer.from(result.data, "base64"));
    return target;
  };
  await cdp("Page.enable"); await cdp("Runtime.enable");
  await cdp("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await waitFor(`!!document.querySelector('[data-testid="page-progress-report"]') && !!document.querySelector('[data-testid="fixture-label"]')`, "ProgressReport component");
  await waitFor(`!!document.querySelector('[data-testid="row-item-701"]')`, "synthetic report data");

  await pointerClick('[data-testid="select-site"]');
  if (!await evalJs(`document.querySelectorAll('[role="option"]').length`)) {
    await evalJs(`document.querySelector('[data-testid="select-site"]').focus()`);
    await press("ArrowDown");
  }
  await waitFor(`document.querySelectorAll('[role="option"]').length === 3`, "site options");
  const options = await evalJs(`Array.from(document.querySelectorAll('[role="option"]')).map(x => x.textContent.trim())`);
  assert(JSON.stringify(options) === JSON.stringify(["All Sites", "Site Alpha", "Site Beta"]), `Bad deduped options: ${JSON.stringify(options)}`);
  const z = await shot("Z-site-dropdown-deduped");
  await evalJs(`Array.from(document.querySelectorAll('[role="option"]')).find(x => x.textContent.trim() === "Site Alpha").setAttribute("data-pr01-target","site-alpha")`);
  await pointerClick('[data-pr01-target="site-alpha"]');
  await waitFor(`document.querySelector('[data-testid="select-site"]')?.textContent.includes("Site Alpha")`, "selected Site Alpha");
  await waitFor(`document.querySelectorAll('[data-testid^="row-item-"]').length === 1`, "filtered report");
  const z2 = await shot("Z2-selected-legacy-suffixed-site");

  await pointerClick('[data-testid="tab-chainage"]');
  await waitFor(`!!document.querySelector('[data-testid="input-ch-from"]')`, "selected-site chainage tab");
  await evalJs(`(() => { const a=document.querySelector('[data-testid="input-ch-from"]'); const b=document.querySelector('[data-testid="input-ch-to"]'); const set=(el,v)=>{const s=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set;s.call(el,v);el.dispatchEvent(new Event("input",{bubbles:true}));};set(a,"0+000");set(b,"5+000"); })()`);
  await waitFor(`document.querySelectorAll('[data-testid^="row-ch-"]').length === 2`, "selected-site chainage rows");
  assert(await evalJs(`document.querySelectorAll('[data-testid^="site-band-"]').length === 0`), "Selected-site view should not render grouping bands");
  const e = await shot("E-selected-site-no-group-band");
  await pointerClick('[data-testid="tab-item"]');
  await waitFor(`!!document.querySelector('[data-testid="row-item-701"]')`, "item tab after selected-site check");

  await pointerClick('[data-testid="select-site"]');
  await waitFor(`document.querySelectorAll('[role="option"]').length === 3`, "all-site option");
  await evalJs(`Array.from(document.querySelectorAll('[role="option"]')).find(x => x.textContent.trim() === "All Sites").setAttribute("data-pr01-target","all-sites")`);
  await pointerClick('[data-pr01-target="all-sites"]');
  await waitFor(`document.querySelector('[data-testid="select-site"]')?.textContent.includes("All Sites")`, "All Sites");
  await click('[data-testid="toggle-abstract"]');
  assert(await evalJs(`Array.from(document.querySelectorAll("th")).some(x => x.textContent.trim() === "BOQ Qty")`), "Abstract BOQ Qty missing");
  const a = await shot("A-abstract-BOQ-Qty");
  await click('[data-testid="toggle-measurement"]');
  await click('[data-testid="row-item-701"]');
  await waitFor(`!!document.querySelector('[data-testid="sort-measurement-direction"]')`, "measurement details");
  assert(await evalJs(`Array.from(document.querySelectorAll("th")).some(x => x.textContent.trim() === "Cumulative")`), "Detailed Cumulative missing");
  assert(await evalJs(`document.querySelectorAll('[data-testid^="site-band-"]').length === 2`), "Detailed site bands missing");
  const b = await shot("B-I-detailed-bands-mode-direction");
  await click('[data-testid="sort-date-chainage"]');
  await click('[data-testid="sort-measurement-direction"]');
  const i = await shot("I-detailed-date-mode-descending");

  await pointerClick('[data-testid="tab-chainage"]');
  await waitFor(`!!document.querySelector('[data-testid="input-ch-from"]')`, "chainage tab");
  await evalJs(`(() => { const a=document.querySelector('[data-testid="input-ch-from"]'); const b=document.querySelector('[data-testid="input-ch-to"]'); const set=(el,v)=>{const s=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set;s.call(el,v);el.dispatchEvent(new Event("input",{bubbles:true}));};set(a,"0+000");set(b,"5+000"); })()`);
  await waitFor(`document.querySelectorAll('[data-testid^="row-ch-"]').length === 4`, "chainage rows");
  assert(await evalJs(`document.querySelectorAll('[data-testid^="site-band-"]').length === 2`), "Chainage site bands missing");
  const dF = await shot("D-F-chainage-sites-ascending");
  const ascChainage = await evalJs(`Array.from(document.querySelectorAll('[data-testid^="row-ch-"]')).map(x => x.getAttribute("data-testid"))`);
  await click('[data-testid="sort-chainage-direction"]');
  const descChainage = await evalJs(`Array.from(document.querySelectorAll('[data-testid^="row-ch-"]')).map(x => x.getAttribute("data-testid"))`);
  assert(JSON.stringify(descChainage) === JSON.stringify([...ascChainage].reverse()), "Chainage order did not fully reverse");
  const fH = await shot("F-H-chainage-sites-descending");

  await pointerClick('[data-testid="tab-date"]');
  await waitFor(`!!document.querySelector('[data-testid="sort-date-direction"]')`, "date tab");
  assert(await evalJs(`document.querySelectorAll('[data-testid^="site-band-"]').length === 2`), "Date site bands missing");
  const dG = await shot("D-G-date-sites-ascending");
  const ascDate = await evalJs(`Array.from(document.querySelectorAll('[data-testid^="row-date-"]')).map(x => x.getAttribute("data-testid"))`);
  await click('[data-testid="sort-date-direction"]');
  const descDate = await evalJs(`Array.from(document.querySelectorAll('[data-testid^="row-date-"]')).map(x => x.getAttribute("data-testid"))`);
  assert(JSON.stringify(descDate) === JSON.stringify([...ascDate].reverse()), "Date order did not fully reverse");
  const gH = await shot("G-H-date-sites-descending");

  const result = { passed: true, options, screenshots: [z, z2, e, a, b, i, dF, fH, dG, gH] };
  writeFileSync(path.join(evidence, "verification-result.json"), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
} finally {
  socket?.close();
  chromium?.kill("SIGTERM");
  vite.kill("SIGTERM");
}