// Real authenticated development browser helper; no API response stubs.
import fs from "node:fs/promises";
import WebSocket from "ws";
export const out = ".agents/outputs/vb-export-02-a";
await fs.mkdir(out, { recursive: true });
const auth = JSON.parse(await fs.readFile("/tmp/vb02-dev-auth.json", "utf8"));
const target = (await (await fetch("http://127.0.0.1:9230/json")).json()).find(t => t.type === "page");
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise(r => ws.once("open", r));
let serial = 0;
const pending = new Map();
export const call = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++serial;
  const timer = setTimeout(() => { pending.delete(id); reject(new Error(`${method} timeout`)); }, 45000);
  pending.set(id, { resolve, reject, timer }); ws.send(JSON.stringify({ id, method, params }));
});
ws.on("message", raw => {
  const m = JSON.parse(raw), p = pending.get(m.id);
  if (!p) return;
  clearTimeout(p.timer); pending.delete(m.id);
  m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result);
});
export const pause = ms => new Promise(r => setTimeout(r, ms));
export async function evaluate(expression) {
  const result = await call("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  return result.result.value;
}
export async function click(selector) {
  const point = await evaluate(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});if(!el)throw Error("Missing "+${JSON.stringify(selector)});el.scrollIntoView({block:"center"});const r=el.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
  await call("Input.dispatchMouseEvent", { type: "mousePressed", ...point, button: "left", clickCount: 1 });
  await call("Input.dispatchMouseEvent", { type: "mouseReleased", ...point, button: "left", clickCount: 1 });
  await pause(250);
}
export async function input(selector, value) {
  await evaluate(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});if(!el)throw Error("Missing input");
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set.call(el,${JSON.stringify(value)});
    el.dispatchEvent(new Event("input",{bubbles:true}));el.dispatchEvent(new Event("change",{bubbles:true}));})()`);
  await pause(200);
}
export async function screenshot(name) {
  const image = await call("Page.captureScreenshot", { format: "png" });
  await fs.writeFile(`${out}/${name}.png`, Buffer.from(image.data, "base64"));
}
export async function navigate(path) {
  await call("Page.navigate", { url: auth.origin + path }); await pause(5000);
}
export function close() { ws.close(); }
await call("Page.enable"); await call("Runtime.enable"); await call("Network.enable");
await call("Network.setUserAgentOverride", { userAgent: "SitePulse VB-EXPORT-02 Development Verification" });
await call("Network.setBypassServiceWorker", { bypass: true });
const cookies = new Map(auth.cookies.map(raw => {
  const pair = raw.split(";")[0], at = pair.indexOf("=");
  return [pair.slice(0, at), pair.slice(at + 1)];
}));
for (const [name, value] of cookies) await call("Network.setCookie", { name, value, url: auth.origin, secure: true, httpOnly: true });
await call("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1050, deviceScaleFactor: 1, mobile: false });
await call("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: `${process.cwd()}/${out}/downloads` });