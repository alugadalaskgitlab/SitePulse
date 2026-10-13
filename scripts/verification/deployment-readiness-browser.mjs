// Ordinary, authorized development login. No business-record or grant writes.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import pg from "pg";
import WebSocket from "ws";

const base = "http://127.0.0.1:5000";
const output = "/tmp/deployment-readiness-browser";
const db = new pg.Client({ connectionString: process.env.DEV_DATABASE_URL });
const cookies = {};
let deviceId, ws, loggedIn = false;
const evidence = { normalLogin: false, ordinaryAccount: false, pages: [], responses: [] };
await db.connect();
try {
  assert.equal((await db.query("SELECT current_database() n")).rows[0].n, "sitelog_dev");
  const account = (await db.query(`SELECT id, email, is_admin, is_owner,
    is_field_engineer, can_manage_permissions FROM users WHERE id=16`)).rows[0];
  assert(account, "Authorized development account is absent");
  assert.equal(account.email, "agent.verification@test.invalid");
  for (const flag of ["is_admin", "is_owner", "is_field_engineer", "can_manage_permissions"])
    assert.equal(account[flag], false, "Verification account must remain ordinary");
  assert(process.env.DEV_VERIFICATION_PASSWORD, "Verification secret is absent");
  const existingDevices = (await db.query("SELECT id FROM user_devices WHERE user_id=16")).rows.map(r => r.id);
  const api = async (path, body) => {
    const response = await fetch(base + path, {
      method: body === undefined ? "GET" : "POST",
      headers: { "Content-Type": "application/json",
        cookie: Object.entries(cookies).map(([name, value]) => `${name}=${value}`).join("; ") },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    for (const cookie of response.headers.getSetCookie()) {
      const pair = cookie.split(";")[0], split = pair.indexOf("=");
      cookies[pair.slice(0, split)] = pair.slice(split + 1);
    }
    return response;
  };
  const login = () => api("/api/auth/login", {
    identifier: "agent.verification@test.invalid", password: process.env.DEV_VERIFICATION_PASSWORD,
  });
  let response = await login();
  if (response.status === 202) {
    const tokens = Object.values(cookies).map(value => decodeURIComponent(value).split(".")[0]);
    const matches = (await db.query(`SELECT id FROM user_devices
      WHERE user_id=16 AND status='pending' AND device_token=ANY($1::text[])`, [tokens])).rows;
    assert.equal(matches.length, 1, "Pending device must match this login's cookie");
    deviceId = matches[0].id;
    assert(!existingDevices.includes(deviceId), "Cannot approve an existing device");
    await db.query(`UPDATE user_devices SET status='approved', approved_at=NOW()
      WHERE id=$1 AND user_id=16 AND status='pending'`, [deviceId]);
    response = await login();
  }
  assert.equal(response.status, 200, "Ordinary development login failed");
  loggedIn = true;
  assert.equal((await api("/api/auth/me")).status, 200);
  evidence.normalLogin = true;
  evidence.ordinaryAccount = true;
  for (const path of ["/api/vendor-bills", "/api/dprs/with-details"]) {
    const result = await api(path);
    evidence.responses.push({ path, status: result.status });
    assert([200, 403].includes(result.status), `Unexpected protected response for ${path}`);
  }

  const targets = await (await fetch("http://127.0.0.1:9232/json")).json();
  const page = targets.find(target => target.type === "page");
  assert(page, "Disposable Chromium page is absent");
  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.once("open", resolve); ws.once("error", reject); });
  let seq = 0;
  const pending = new Map();
  const mutations = [];
  ws.on("message", raw => {
    const message = JSON.parse(raw);
    if (message.method === "Network.requestWillBeSent") {
      const request = message.params.request;
      const path = new URL(request.url).pathname;
      if (request.url.startsWith(base + "/api/") && !["GET", "HEAD"].includes(request.method) &&
          !path.startsWith("/api/auth/") && path !== "/api/vendor-bills/check-duplicates")
        mutations.push({ path, method: request.method });
    }
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    message.error ? request.reject(new Error(message.error.message)) : request.resolve(message.result);
  });
  const call = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++seq;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async expression => {
    const result = await call("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    assert(!result.exceptionDetails, "Browser evaluation failed");
    return result.result?.value;
  };
  const wait = async expression => {
    for (let attempt = 0; attempt < 60; attempt++) {
      if (await evaluate(expression)) return;
      await new Promise(resolve => setTimeout(resolve, 300));
    }
    throw new Error("Signed-in screen did not become ready");
  };
  await call("Network.enable");
  await call("Network.setBypassServiceWorker", { bypass: true });
  await call("Network.setCacheDisabled", { cacheDisabled: true });
  for (const [name, value] of Object.entries(cookies))
    await call("Network.setCookie", { name, value, url: base });
  await fs.mkdir(output, { recursive: true });
  const capture = async name => {
    const shot = await call("Page.captureScreenshot", { format: "jpeg", quality: 75 });
    await fs.writeFile(`${output}/${name}.jpg`, Buffer.from(shot.data, "base64"));
  };
  await call("Page.navigate", { url: base + "/account" });
  await wait(`location.pathname === '/account' && document.body?.innerText.includes('Agent Verification')`);
  evidence.pages.push({ path: "/account", rendered: true });
  await capture("account");
  await call("Page.navigate", { url: base + "/plant/vendor-bills" });
  await wait(`!!document.querySelector('[data-testid="button-new-bill"]')`);
  evidence.pages.push({ path: "/plant/vendor-bills", rendered: true });
  await capture("vendor-bills");
  await evaluate(`document.querySelector('[data-testid="button-new-bill"]').click()`);
  await wait(`!!document.querySelector('[data-testid="input-period-from"]')`);
  evidence.pages.push({ path: "/plant/vendor-bills", newBillFormRendered: true, saved: false });
  await capture("new-bill");
  await evaluate(`document.querySelector('[data-testid="button-back-form"]').click()`);
  await wait(`!!document.querySelector('[data-testid="button-new-bill"]')`);
  await call("Page.navigate", { url: base + "/site/dashboard" });
  await wait(`location.pathname === '/site/dashboard' &&
    (Array.from(document.querySelectorAll('h1')).some(el => el.textContent.trim() === 'Site Reports') ||
      document.body?.innerText.includes("You don't have permission"))`);
  const denied = await evaluate(`document.body.innerText.includes("You don't have permission")`);
  evidence.pages.push({ path: "/site/dashboard", rendered: true, denied });
  await capture("dpr-dashboard");
  assert.deepEqual(mutations, [], "Read-only browser check attempted a business mutation");
  evidence.noBusinessWrites = true;
  await fs.writeFile(`${output}/result.json`, JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify(evidence));
} finally {
  try {
    if (loggedIn) {
      const logout = await fetch(base + "/api/auth/logout", { method: "POST",
        headers: { cookie: Object.entries(cookies).map(([name, value]) => `${name}=${value}`).join("; ") } });
      assert.equal(logout.status, 200, "Verification session logout failed");
    }
  } finally {
    ws?.close();
    try {
      if (deviceId)
        await db.query("DELETE FROM user_devices WHERE id=$1 AND user_id=16", [deviceId]);
    } finally {
      await db.end();
    }
  }
}
