// Real-browser capability preflight. No push event or application-data writes.
import fs from "node:fs";
import crypto from "node:crypto";
import pg from "pg";
import WebSocket from "ws";

const out = `reports/perm-03b3/notify-rerun/${process.argv[2] === "loopback" ? "loopback" : "proxy"}`;
fs.mkdirSync(out, { recursive: true });
const save = (name, value) => fs.writeFileSync(`${out}/${name}.json`, JSON.stringify(value, null, 2));
const hash = value => crypto.createHash("sha256").update(value).digest("hex");
const pool = new pg.Pool({ connectionString: process.env.DEV_DATABASE_URL });
if ((await pool.query("select current_database() name")).rows[0].name !== "sitelog_dev") {
  await pool.end(); throw Error("Wrong database");
}
const snapshot = async () => {
  const users = (await pool.query("select * from users order by id")).rows;
  const permissions = (await pool.query("select * from user_permissions order by id")).rows;
  const subscriptions = (await pool.query("select * from push_subscriptions where user_id=2 or id in (4,5) order by id")).rows;
  return {
    users: { count: users.length, checksum: hash(JSON.stringify(users)) },
    permissions: { count: permissions.length, checksum: hash(JSON.stringify(permissions)) },
    ownerSubscriptions: subscriptions.map(s => ({ id: s.id, userId: s.user_id })),
    ownerSubscriptionChecksum: hash(JSON.stringify(subscriptions)),
    senderSha256: hash(fs.readFileSync("server/push.ts")),
  };
};
const before = await snapshot();
save("before", before);
const target = (await (await fetch("http://127.0.0.1:9232/json")).json()).find(t => t.type === "page");
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise(resolve => ws.once("open", resolve));
let seq = 0;
const pending = new Map();
ws.on("message", raw => {
  const message = JSON.parse(raw), entry = pending.get(message.id);
  if (entry) {
    pending.delete(message.id);
    message.error ? entry.reject(Error(message.error.message)) : entry.resolve(message.result);
  }
});
const call = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++seq; pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params }));
});
try {
  // Browser-only loopback is a secure context and reaches the actual app when
  // the development proxy currently selects the separate mockup workflow.
  const base = process.argv[2] === "loopback" ? "http://127.0.0.1:5000" : `https://${process.env.REPLIT_DEV_DOMAIN}`;
  await call("Browser.grantPermissions", { origin: base, permissions: ["notifications"] });
  await call("Page.navigate", { url: `${base}/account` });
  await new Promise(resolve => setTimeout(resolve, 6000));
  const result = await call("Runtime.evaluate", {
    awaitPromise: true, returnByValue: true,
    expression: `(async () => {
      const state = {secureContext:isSecureContext, permission:Notification.permission, pushManagerAvailable:typeof PushManager !== 'undefined'};
      try {
        const registration = await navigator.serviceWorker.register('/service-worker.js');
        await navigator.serviceWorker.ready;
        // This pre-login browser probe uses the app's public (non-secret) key.
        const publicKey = ${JSON.stringify(process.env.VAPID_PUBLIC_KEY || "")};
        state.vapidPublicKeyAvailable = !!publicKey;
        const raw = atob(publicKey.replace(/-/g,'+').replace(/_/g,'/'));
        const key = Uint8Array.from(raw, c=>c.charCodeAt(0));
        const subscription = await registration.pushManager.subscribe({userVisibleOnly:true, applicationServerKey:key});
        state.subscribed = true;
        state.providerHost = new URL(subscription.endpoint).hostname;
        // This is an unassigned capability probe, never stored in the app DB.
        state.probeUnsubscribed = await subscription.unsubscribe();
      } catch (error) {
        state.subscribed = false; state.errorName=error.name; state.errorMessage=error.message;
      }
      return state;
    })()`,
  });
  save("browser-capability", { ...result.result?.value, exception: result.exceptionDetails?.text ?? null,
    eventFired: false, applicationSubscriptionCreated: false });
  console.log(result.result?.value ?? { exception: result.exceptionDetails?.text });
  const shot = await call("Page.captureScreenshot", { format: "jpeg", quality: 75 });
  fs.writeFileSync(`${out}/browser-preflight.jpg`, Buffer.from(shot.data, "base64"));
} finally {
  save("after", await snapshot());
  ws.close(); await pool.end();
}
