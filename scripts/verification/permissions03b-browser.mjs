import fs from "node:fs/promises";
import WebSocket from "ws";
import assert from "node:assert/strict";
import { dir, base, signIn } from "./permissions03b-runtime.mjs";
const cookies = await signIn("subject");
const targets = await (await fetch("http://127.0.0.1:9224/json")).json();
const ws = new WebSocket(targets.find(t => t.type === "page").webSocketDebuggerUrl);
await new Promise(r => ws.on("open", r));
let seq = 0;
const pending = new Map(), failures = [], evidence = [];
ws.on("message", raw => {
  const m = JSON.parse(raw);
  if (m.id) {
    const p = pending.get(m.id); pending.delete(m.id);
    m.error ? p.reject(Error(m.error.message)) : p.resolve(m.result);
  } else if (m.method === "Network.responseReceived" && m.params.response.status >= 400) {
    const { url, status } = m.params.response;
    failures.push({ url: url.replace(base, ""), status });
  }
});
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++seq; pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params }));
});
const evaluate = async expression => {
  const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw Error(r.exceptionDetails.text);
  return r.result?.value;
};
try {
  await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 1450, height: 1000, deviceScaleFactor: 1, mobile: false });
  for (const cookie of cookies) {
    const i = cookie.indexOf("=");
    await send("Network.setCookie", { name: cookie.slice(0, i), value: cookie.slice(i + 1), url: base, httpOnly: true });
  }
  await fs.mkdir(`${dir}/screenshots`, { recursive: true });
  for (const [name, path] of [["diesel-granular", "/plant/diesel-requirements"], ["maintenance-granular", "/plant/maintenance"]]) {
    await send("Page.navigate", { url: base + path });
    await new Promise(r => setTimeout(r, 5000));
    let text = await evaluate("document.body.innerText");
    const shot = await send("Page.captureScreenshot", { format: "png" });
    await fs.writeFile(`${dir}/screenshots/${name}.png`, Buffer.from(shot.data, "base64"));
    evidence.push({ name, path, text, failures: [...failures] });
    if (name.startsWith("maintenance")) {
      assert.ok(text.includes("PERM03B MACHINE A"), "own machine missing");
      assert.ok(!text.includes("PERM03B MACHINE B"), "foreign machine exposed");
    }
    assert.ok(!text.includes("You don't have access"), "page gate refused");
    if (name.startsWith("diesel")) {
      await evaluate(`document.querySelector('[data-testid^="card-requirement-"]').click()`);
      await new Promise(r => setTimeout(r, 1500));
      assert.ok(await evaluate(`Array.from(document.querySelectorAll('[data-testid^="input-approve-qty-"]')).every(input => input.disabled)`), "read-only approval fields must be disabled");
      const detail = await send("Page.captureScreenshot", { format: "png" });
      await fs.writeFile(`${dir}/screenshots/diesel-detail.png`, Buffer.from(detail.data, "base64"));
    }
    if (name.startsWith("maintenance")) {
      await evaluate(`Array.from(document.querySelectorAll('[role="tab"]')).find(el => el.textContent.includes('Health')).click()`);
      await new Promise(r => setTimeout(r, 1500));
      const healthText = await evaluate("document.body.innerText");
      assert.ok(healthText.includes("PERM03B MACHINE A"));
      assert.ok(!healthText.includes("PERM03B MACHINE B"));
      const shot = await send("Page.captureScreenshot", { format: "png" });
      await fs.writeFile(`${dir}/screenshots/maintenance-health.png`, Buffer.from(shot.data, "base64"));
      evidence.push({ name: "maintenance-health", text: healthText, failures: [...failures] });
    }
  }
} finally {
  await fs.writeFile(`${dir}/browser-results.json`, JSON.stringify(evidence, null, 2));
  ws.close();
}
console.log("Signed-in browser screenshots captured");
