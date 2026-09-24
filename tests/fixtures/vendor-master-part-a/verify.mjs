import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import WebSocket from "ws";

const root = path.resolve(new URL("../../..", import.meta.url).pathname);
const fixture = path.join(root, "tests/fixtures/vendor-master-part-a");
const evidence = path.join(fixture, "evidence");
const partD = process.env.VENDOR_PART_D === "1";
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
  chromium = spawn("/repl/tools/bin/chromium", ["--headless", "--no-sandbox", "--disable-gpu", `--remote-debugging-port=${cdpPort}`, `--user-data-dir=/tmp/vendor-a-${process.pid}`, `http://127.0.0.1:${vitePort}/${partD ? "?part=D" : ""}`], { stdio: "ignore" });
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
  if (partD) {
    await waitFor(`document.body.innerText.includes("SYNTHETIC GANGARAM") && !!document.querySelector('[data-testid="fixture-label"]')`, "actual VendorMaster D component");
    await clickText("button", "Link Vendors");
    await waitFor(`document.body.innerText.includes("SYNTHETIC Gangaram Narsimhulu")`, "synthetic variants");
    const screenshots = [await shot("D-before-synthetic-variants")];
    assert((await evaluate(`window.__vendorFixture.links.length`)) === 0, "Variants were auto-linked");
    await evaluate(`window.confirm = () => true`);
    for (const label of ["Select SYNTHETIC Gangaram Narasimhulu Trip transporter", "Select SYNTHETIC Gangaram Narsimhulu Trip transporter", "Select SYNTHETIC Gangaram Narsimhulu Trip material source"]) {
      assert(await evaluate(`(() => { const box=document.querySelector('input[aria-label=${JSON.stringify(label)}]'); box?.click(); return !!box; })()`), `Missing ${label}`);
    }
    assert(await evaluate(`(() => { const select=document.querySelector('select[aria-label="Master vendor for selected groups"]'); if (!select) return false; const setter=Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set; setter.call(select, '1'); select.dispatchEvent(new Event('change',{bubbles:true})); return true; })()`), "Missing explicit master target");
    await waitFor(`document.body.innerText.includes("3 group(s) selected") && !Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === "Confirm selected links")?.disabled`, "selected groups");
    screenshots.push(await shot("D-selected-synthetic-variants"));
    await clickText("button", "Confirm selected links");
    await waitFor(`window.__vendorFixture.links.length === 3`, "D batch confirm");
    assert((await evaluate(`window.__vendorFixture.aliases.length`)) === 2, "Aliases not saved exactly once");
    assert((await evaluate(`window.__vendorFixture.proposals.length`)) === 0, "Selected names still open");
    screenshots.push(await shot("D-after-synthetic-linked"));
    const result = { passed: true, syntheticFixture: true, screenshots, assertions: ["Actual VendorMaster component before and after explicit batch confirm", "Three role/name groups, two spellings, one master target", "Two deduplicated aliases", "No live API or database writes"] };
    writeFileSync(path.join(evidence, "D-verification-result.json"), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result, null, 2));
  } else {
  await waitFor(`document.body.innerText.includes("SYNTHETIC Metro Supplies") && !!document.querySelector('[data-testid="fixture-label"]')`, "actual VendorMaster list");
  const screenshots = [await shot("A-list-synthetic-actual-component")];

  await clickText("button", "Create vendor");
  await waitFor(`!!document.querySelector('form')`, "vendor creation form");
  for (const [label, value] of Object.entries({
    "Display name *": "saravana metal industries", "Business name": "Saravana Metal Trading",
    "GST number": "SYN-GST-NEW", "PAN number": "SYN-PAN-NEW", "Address": "2 Synthetic Road",
    "Contact person": "SYNTHETIC Manager", "Phone": "000-111-2222", "Email": "fleet@example.invalid",
    "Account holder": "SYNTHETIC Fleet Holder", "Account number": "SYN-ACCOUNT-NEW",
    "IFSC": "SYN-IFSC-NEW", "Bank name": "SYNTHETIC Fleet Bank",
  })) await input(label, value);
  const inputAppearance = await evaluate(`(() => {
    const fields = Array.from(document.querySelectorAll('form label'));
    const find = label => fields.find(x => x.querySelector('span')?.textContent.trim() === label)?.querySelector('input');
    const name = find('Display name *'), business = find('Business name'), gst = find('GST number');
    return { name: name?.value, business: business?.value, nameTransform: getComputedStyle(name).textTransform,
      businessTransform: getComputedStyle(business).textTransform, otherTransform: getComputedStyle(gst).textTransform };
  })()`);
  assert(inputAppearance.name === "saravana metal industries" && inputAppearance.business === "Saravana Metal Trading"
    && inputAppearance.nameTransform === "none" && inputAppearance.businessTransform === "none"
    && inputAppearance.otherTransform === "uppercase", `Unexpected input appearance: ${JSON.stringify(inputAppearance)}`);
  screenshots.push(await shot("VENDOR-02-A1-mixed-case-typing-synthetic"));
  await clickText("button", "Save vendor");
  await waitFor(`window.__vendorFixture.vendors.some(v => v.name === "SARAVANA METAL INDUSTRIES")`, "vendor create persisted to mocked API");
  assert((await evaluate(`window.__vendorFixture.vendors.find(v => v.name === "SARAVANA METAL INDUSTRIES").businessName`)) === "SARAVANA METAL TRADING", "business casing not normalized");
  await clickText("button", "SARAVANA METAL INDUSTRIES");
  await waitFor(`document.body.innerText.includes("SYN-GST-NEW") && document.body.innerText.includes("SYN-ACCOUNT-NEW")`, "A1 full vendor detail");
  screenshots.push(await shot("VENDOR-02-A1-uppercase-saved-synthetic"));
  await clickText("button", "Edit");
  await input("Display name *", "synthetic Metro supplies");
  await input("Business name", "synthetic Metro trading");
  const editedInput = await evaluate(`(() => { const el=Array.from(document.querySelectorAll('form label')).find(x=>x.querySelector('span')?.textContent.trim()==='Display name *')?.querySelector('input'); return { value:el?.value, transform:getComputedStyle(el).textTransform }; })()`);
  assert(editedInput.value === "synthetic Metro supplies" && editedInput.transform === "none", "Edit displayed fake uppercase");
  screenshots.push(await shot("VENDOR-02-A2-mixed-case-edit-synthetic"));
  await clickText("button", "Save vendor");
  await waitFor(`window.__vendorFixture.vendors.some(v => v.name === "SYNTHETIC METRO SUPPLIES")`, "A2 edit persisted uppercase");
  assert((await evaluate(`window.__vendorFixture.vendors[0].businessName`)) === "SYNTHETIC METRO TRADING", "Edit business casing not normalized");
  screenshots.push(await shot("VENDOR-02-A2-uppercase-edited-synthetic"));

  await clickText("button", "Link Vendors");
  await waitFor(`document.body.innerText.includes("SYNTHETIC Metro Ltd") && document.body.innerText.includes("Alias hint: synthetic metro supplies")`, "A2 alias hint");
  assert((await evaluate(`window.__vendorFixture.links.length`)) === 0, "Review silently linked an existing name");
  assert((await evaluate(`document.querySelector('select[aria-label="Master match for SYNTHETIC Metro Ltd bills"]')?.value`)) === "1", "Case-insensitive alias did not suggest edited uppercase master");
  screenshots.push(await shot("VENDOR-02-A3-case-insensitive-alias-synthetic"));
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
  assert((await evaluate(`window.__vendorFixture.vendors.find(v => v.name === "SYNTHETIC QUARRY PARTNER")?.gstNumber`)) === "SYN-GST-QUARRY", "A4 inline details lost");
  screenshots.push(await shot("A4-inline-linked-synthetic"));

  await clickText("button", "Vendors");
  await clickText("button", "SYNTHETIC METRO SUPPLIES");
  await waitFor(`document.body.innerText.includes("SYNTHETIC North Site") && document.body.innerText.includes("SYNTHETIC South Site")`, "A5 site summary");
  const activity = await evaluate(`document.body.innerText`);
  assert(activity.includes("Equipment hire 2 · Material supply 0 · Transport 1 · Labour 0"), "A5 North activities missing");
  assert(activity.includes("Equipment hire 0 · Material supply 3 · Transport 0 · Labour 1"), "A5 South activities missing");
  screenshots.push(await shot("A5-site-summary-synthetic"));
  const writes = await evaluate(`window.__vendorFixture.writes`);
  assert(writes.length === 4 && writes.every(w => w.path.startsWith("/api/vendor-master")), "Unexpected mocked API writes");
  const result = { passed: true, syntheticFixture: true, screenshots, inputAppearance, editedInput, assertions: ["VENDOR-02 A1 mixed-case typing has computed text-transform none for name and business while other fields retain uppercase CSS", "VENDOR-02 A1 uppercase saved and displayed", "VENDOR-02 A2 uppercase after mixed-case edit", "VENDOR-02 A3 alias hint matches edited uppercase master case-insensitively", "A3 explicit confirmation", "A4 inline create/link", "A5 equipment/material/transport/labour across two sites", "No real API or business writes"], mockedWrites: writes.map(w => `${w.method} ${w.path}`) };
  writeFileSync(path.join(evidence, "verification-result.json"), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  }
} finally {
  socket?.close();
  chromium?.kill("SIGTERM");
  vite.kill("SIGTERM");
}