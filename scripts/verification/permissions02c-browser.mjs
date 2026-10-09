import fs from "node:fs/promises";
import WebSocket from "ws";
export const dir = "reports/user-perm-redesign02c";
export const privateDir = "/tmp/permissions02c-private";
export const base = "http://127.0.0.1:5000";
export const manifest = JSON.parse(await fs.readFile(`${dir}/disposable-manifest.json`, "utf8"));
export const saveManifest = () => fs.writeFile(`${dir}/disposable-manifest.json`, JSON.stringify(manifest, null, 2));
export async function api(cookies, path, method = "GET", data) {
  const r = await fetch(base + path, {
    method, headers: { "Content-Type": "application/json", Cookie: cookies.join("; "),
      "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36" },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  });
  for (const line of r.headers.getSetCookie()) {
    const cookie = line.split(";")[0], key = cookie.split("=")[0];
    const idx = cookies.findIndex(c => c.startsWith(key + "="));
    if (idx < 0) cookies.push(cookie); else cookies[idx] = cookie;
  }
  const body = await r.json();
  return { status: r.status, body };
}
export async function adminSession() {
  const cookies = JSON.parse(await fs.readFile(`${privateDir}/cookies.json`, "utf8")).map(c => c.split(";")[0]);
  const r = await api(cookies, "/api/auth/login", "POST", {
    identifier: manifest.administrator.email, password: process.env.DEV_VERIFICATION_PASSWORD,
  });
  if (r.status !== 200) throw new Error(`Normal admin login status ${r.status}`);
  const me = await api(cookies, "/api/auth/me");
  if (me.body.user?.id !== manifest.administrator.id) throw new Error("Wrong authenticated user");
  await fs.writeFile(`${privateDir}/admin-session.json`, JSON.stringify(cookies), { mode: 0o600 });
  return cookies;
}
export async function connect() {
  const targets = await (await fetch("http://127.0.0.1:9223/json")).json();
  const target = targets.find(t => t.type === "page");
  if (!target) throw new Error("No browser page");
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise(resolve => ws.on("open", resolve));
  let seq = 0;
  const pending = new Map();
  const events = [];
  ws.on("message", raw => {
    const m = JSON.parse(raw);
    if (m.id) {
      const p = pending.get(m.id); pending.delete(m.id);
      m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result);
    } else {
      events.push(m);
      if (m.method === "Page.javascriptDialogOpening")
        void send("Page.handleJavaScriptDialog", { accept: true });
    }
  });
  function send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++seq; pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  }
  async function evaluate(expression) {
    const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ": " + r.exceptionDetails.exception?.description);
    return r.result?.value;
  }
  async function wait(expression, timeout = 12000) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      if (await evaluate(expression)) return;
      await new Promise(r => setTimeout(r, 150));
    }
    throw new Error("Timed out: " + expression);
  }
  async function click(selector) {
    await wait(`!!document.querySelector(${JSON.stringify(selector)})`);
    await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(e.disabled)throw Error('Control is disabled');e.scrollIntoView({block:'center',behavior:'instant'});e.click()})()`);
    await new Promise(r => setTimeout(r, 250));
  }
  async function textButton(text) {
    const selector = await evaluate(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(text)});if(!b)throw Error('button missing'); b.dataset.acceptanceClick='true';return '[data-acceptance-click="true"]'})()`);
    await click(selector);
    await evaluate(`document.querySelector('[data-acceptance-click]')?.removeAttribute('data-acceptance-click')`);
  }
  async function fill(selector, value) {
    await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)}); const p=e.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(p,'value').set.call(e,${JSON.stringify(value)}); e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    await new Promise(r => setTimeout(r, 200));
  }
  async function screenshot(name) {
    await new Promise(r => setTimeout(r, 350));
    const shot = await send("Page.captureScreenshot", { format: "png" });
    await fs.mkdir(`${dir}/screenshots`, { recursive: true });
    await fs.writeFile(`${dir}/screenshots/${name}.png`, Buffer.from(shot.data, "base64"));
  }
  async function cookies(values) {
    await send("Network.clearBrowserCookies");
    for (const c of values) {
      const i = c.indexOf("=");
      await send("Network.setCookie", { name: c.slice(0, i), value: c.slice(i + 1), url: base, httpOnly: true, sameSite: "Lax" });
    }
  }
  await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 1500, height: 1100, deviceScaleFactor: 1, mobile: false });
  return { send, evaluate, wait, click, textButton, fill, screenshot, cookies, events, close: () => ws.close() };
}
