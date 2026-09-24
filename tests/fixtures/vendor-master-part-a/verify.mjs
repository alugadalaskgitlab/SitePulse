import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import WebSocket from "ws";

const root = path.resolve(new URL("../../..", import.meta.url).pathname);
const fixture = path.join(root, "tests/fixtures/vendor-master-part-a");
const evidence = path.join(fixture, "evidence");
const vitePort = Number(process.env.VITE_PORT || 4217);
const cdpPort = Number(process.env.CDP_PORT || 9367);
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
  chromium = spawn("/repl/tools/bin/chromium", ["--headless", "--no-sandbox", "--disable-gpu", `--remote-debugging-port=${cdpPort}`, `--user-data-dir=/tmp/vendor-a-${process.pid}`, `http://127.0.0.1:${vitePort}/`], { stdio: "ignore" });
  let targets;
  for (let i = 0; i < 100; i++) {
    try {
      targets = await (await fetch(`http://127.0.0.1:${cdpPort}/json/list`)).json();
      if (targets.some(target => target.type === "page" && target.url.includes(String(vitePort)))) break;
    } catch {}
    if (i === 99) throw new Error("Chromium CDP did not start");
    await sleep(100);
  }
  const page = targets.find(target => target.type === "page" && target.url.includes(String(vitePort)));
  socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.once("open", resolve); socket.once("error", reject); });
  let seq = 0;
  const pending = new Map();
  socket.on("message", raw => {
    const message = JSON.parse(raw);
    if (!message.id || !pending.has(message.id)) return;
    const request = pending.get(message.id);
    pending.delete(message.id);
    message.error ? request.reject(new Error(message.error.message)) : request.resolve(message.result);
  });
  const cdp = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++seq; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async expression => {
    const result = await cdp("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result?.value;
  };
  const waitFor = async (expression, label) => {
    for (let i = 0; i < 150; i++) { if (await evaluate(expression).catch(() => false)) return; await sleep(100); }
    throw new Error(`Timed out: ${label}; text=${(await evaluate("document.body.innerText")).slice(0, 900)}`);
  };
  const clickText = async (selector, text) => {
    const clicked = await evaluate(`(() => { const el=Array.from(document.querySelectorAll(${JSON.stringify(selector)})).find(x => x.textContent.trim() === ${JSON.stringify(text)}); el?.click(); return !!el; })()`);
    assert(clicked, `Missing ${selector}: ${text}`);
  };
  const input = async (label, value) => {
    const changed = await evaluate(`(() => { const label=Array.from(document.querySelectorAll('label')).find(x => x.querySelector('input') && x.querySelector('span')?.textContent.trim() === ${JSON.stringify(label)}); const el=label?.querySelector('input'); if(!el) return false; const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set; setter.call(el, ${JSON.stringify(value)}); el.dispatchEvent(new Event('input',{bubbles:true})); return true; })()`);
    assert(changed, `Missing field ${label}`);
  };
  const shot = async name => {
    await sleep(150);
    const png = await cdp("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
    const file = path.join(evidence, `${name}.png`);
    writeFileSync(file, Buffer.from(png.data, "base64"));
    return file;
  };
  await cdp("Page.enable"); await cdp("Runtime.enable");
  await cdp("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await waitFor(`document.body.innerText.includes("SYNTHETIC Metro Supplies") && !!document.querySelector('[data-testid="fixture-label"]')`, "actual VendorMaster list");
  const screenshots = [await shot("A-list-synthetic-actual-component")];

  await clickText("button", "Create vendor");
  await waitFor(`!!document.querySelector('form')`, "vendor creation form");
  for (const [label, value] of Object.entries({
    "Display name *": "SYNTHETIC Fleet Co", "Business name": "SYNTHETIC Fleet Trading",
    "GST number": "SYN-GST-NEW", "PAN number": "SYN-PAN-NEW", "Address": "2 Synthetic Road",
    "Contact person": "SYNTHETIC Manager", "Phone": "000-111-2222", "Email": "fleet@example.invalid",
    "Account holder": "SYNTHETIC Fleet Holder", "Account number": "SYN-ACCOUNT-NEW",
    "IFSC": "SYN-IFSC-NEW", "Bank name": "SYNTHETIC Fleet Bank",
  })) await input(label, value);
  screenshots.push(await shot("A1-full-fields-before-save-synthetic"));
  await clickText("button", "Save vendor");
  await waitFor(`window.__vendorFixture.vendors.some(v => v.name === "SYNTHETIC Fleet Co")`, "vendor create persisted to mocked API");
  assert((await evaluate(`window.__vendorFixture.vendors.find(v => v.name === "SYNTHETIC Fleet Co").bankAccountNumber`)) === "SYN-ACCOUNT-NEW", "A1 bank details not saved");
  await clickText("button", "SYNTHETIC Fleet Co");
  await waitFor(`document.body.innerText.includes("SYN-GST-NEW") && document.body.innerText.includes("SYN-ACCOUNT-NEW")`, "A1 full vendor detail");
  screenshots.push(await shot("A1-saved-detail-synthetic"));
  await clickText("button", "Edit");
  await input("Contact person", "SYNTHETIC Edited Contact");
  await clickText("button", "Save vendor");
  await waitFor(`window.__vendorFixture.vendors.some(v => v.contactPersonName === "SYNTHETIC Edited Contact")`, "A1 edit persisted");
  screenshots.push(await shot("A1-edited-detail-synthetic"));

  await clickText("button", "Link Vendors");
  await waitFor(`document.body.innerText.includes("SYNTHETIC Metro Ltd") && document.body.innerText.includes("Alias hint: SYNTHETIC Metro Supplies")`, "A2 alias hint");
  assert((await evaluate(`window.__vendorFixture.links.length`)) === 0, "Review silently linked an existing name");
  screenshots.push(await shot("A2-proposals-alias-hint-synthetic"));
  await clickText("button", "Confirm link");
  await waitFor(`window.__vendorFixture.links.length === 1`, "A3 explicit confirmation");
  assert((await evaluate(`window.__vendorFixture.links[0].vendorId`)) === 1, "A3 alias hint selected wrong master");
  screenshots.push(await shot("A3-confirmed-link-synthetic"));

  await clickText("button", "Create new");
  await waitFor(`document.body.innerText.includes("Create & link: SYNTHETIC Quarry Partner")`, "A4 inline editor");
  await input("GST number", "SYN-GST-QUARRY");
  screenshots.push(await shot("A4-inline-create-synthetic"));
  await clickText("button", "Save vendor");
  await waitFor(`window.__vendorFixture.links.length === 2`, "A4 inline create and explicit link");
  assert((await evaluate(`window.__vendorFixture.vendors.find(v => v.name === "SYNTHETIC Quarry Partner")?.gstNumber`)) === "SYN-GST-QUARRY", "A4 inline details lost");
  screenshots.push(await shot("A4-inline-linked-synthetic"));

  await clickText("button", "Vendors");
  await clickText("button", "SYNTHETIC Metro Supplies");
  await waitFor(`document.body.innerText.includes("SYNTHETIC North Site") && document.body.innerText.includes("SYNTHETIC South Site")`, "A5 site summary");
  const activity = await evaluate(`document.body.innerText`);
  assert(activity.includes("Equipment hire 2 · Material supply 0 · Transport 1 · Labour 0"), "A5 North activities missing");
  assert(activity.includes("Equipment hire 0 · Material supply 3 · Transport 0 · Labour 1"), "A5 South activities missing");
  screenshots.push(await shot("A5-site-summary-synthetic"));
  const writes = await evaluate(`window.__vendorFixture.writes`);
  assert(writes.length === 4 && writes.every(w => w.path.startsWith("/api/vendor-master")), "Unexpected mocked API writes");
  const result = { passed: true, syntheticFixture: true, screenshots, assertions: ["A1 create/save/edit full structured fields", "A2 alias suggestion without silent linking", "A3 explicit confirmation", "A4 inline create/link", "A5 equipment/material/transport/labour across two sites", "No real API or business writes"], mockedWrites: writes.map(w => `${w.method} ${w.path}`) };
  writeFileSync(path.join(evidence, "verification-result.json"), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
} finally {
  socket?.close();
  chromium?.kill("SIGTERM");
  vite.kill("SIGTERM");
}