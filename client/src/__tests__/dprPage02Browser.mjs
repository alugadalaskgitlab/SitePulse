import WebSocket from "ws";
import pg from "pg";
import fs from "node:fs/promises";
export const out = ".agents/outputs/dpr-page-02";
export const statePath = "/tmp/dpr-page-02-state.json";
export const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const targets = await (await fetch("http://127.0.0.1:9227/json")).json();
const ws = new WebSocket(targets.find(target => target.type === "page").webSocketDebuggerUrl);
await new Promise(resolve => ws.once("open", resolve));
let serial = 0;
const pending = new Map();
ws.on("message", raw => {
  const message = JSON.parse(raw), request = pending.get(message.id);
  if (!request) return;
  clearTimeout(request.timer); pending.delete(message.id);
  message.error ? request.reject(new Error(message.error.message)) : request.resolve(message.result);
});
export function call(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++serial;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(method + " timeout")); }, 45000);
    pending.set(id, { resolve, reject, timer });
    ws.send(JSON.stringify({ id, method, params }));
  });
}
export async function evaluate(expression) {
  const result = await call("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result?.value;
}
export async function go(path) {
  await call("Page.navigate", { url: `https://${process.env.REPLIT_DEV_DOMAIN}${path}` });
  await sleep(6000);
}
export async function api(path, body) {
  return evaluate(`(async()=>{const r=await fetch(${JSON.stringify(path)},{method:${JSON.stringify(body ? "POST" : "GET")},headers:{"Content-Type":"application/json"},${body ? "body:" + JSON.stringify(JSON.stringify(body)) + "," : ""}credentials:"include"});return {status:r.status,body:await r.json()}})()`);
}
export async function shot(name, full = false) {
  await evaluate("window.scrollTo(0,0)"); await sleep(300);
  const extra = full ? { clip: { x: 0, y: 0, ...(await call("Page.getLayoutMetrics")).cssContentSize, scale: 1 } } : {};
  const result = await call("Page.captureScreenshot", { format: "png", captureBeyondViewport: full, ...extra });
  await fs.writeFile(`${out}/${name}.png`, Buffer.from(result.data, "base64"));
}
export async function db() {
  const connectionString = process.env.DEV_DATABASE_URL || (() => { const url = new URL(process.env.DATABASE_URL); url.pathname = "/sitelog_dev"; return url.toString(); })();
  const pool = new pg.Pool({ connectionString });
  const { rows } = await pool.query("select current_database() as db");
  if (rows[0].db !== "sitelog_dev") throw new Error("Unsafe database target");
  return pool;
}
export async function save(name, value) { await fs.writeFile(`${out}/${name}.json`, JSON.stringify(value, null, 2)); }
export async function close() { ws.close(); }
await call("Page.enable");
await call("Runtime.enable");