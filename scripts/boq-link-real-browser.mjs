// Development-only verification harness. No API stubs or authentication bypass.
import WebSocket from "ws";
import pg from "pg";
import fs from "node:fs/promises";
export const out = ".agents/outputs/boq-link-01-real";
export const origin = `https://${process.env.REPLIT_DEV_DOMAIN}`;
export const sleep = ms => new Promise(r => setTimeout(r, ms));
const targets = await (await fetch("http://127.0.0.1:9223/json")).json();
const target = targets.find(t => t.type === "page");
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise(r => ws.once("open", r));
let id = 0;
const pending = new Map();
ws.on("message", raw => {
  const m = JSON.parse(raw), p = pending.get(m.id);
  if (!p) return;
  clearTimeout(p.timer); pending.delete(m.id);
  m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result);
});
export function call(method, params = {}) {
  return new Promise((resolve, reject) => {
    const serial = ++id;
    const timer = setTimeout(() => { pending.delete(serial); reject(new Error(method+" timeout")); }, 45000);
    pending.set(serial, {resolve,reject,timer});
    ws.send(JSON.stringify({id:serial,method,params}));
  });
}
export async function evaluate(expression) {
  const r = await call("Runtime.evaluate", {expression,returnByValue:true,awaitPromise:true});
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ": " + r.exceptionDetails.exception?.description);
  return r.result?.value;
}
export async function go(path) {
  await call("Page.navigate", {url:origin+path}); await sleep(2500);
}
export async function click(selector) {
  const point = await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)}); if(!e) throw Error('Missing selector'); e.scrollIntoView({block:'center'}); const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
  await call("Input.dispatchMouseEvent", {type:"mousePressed",...point,button:"left",clickCount:1});
  await call("Input.dispatchMouseEvent", {type:"mouseReleased",...point,button:"left",clickCount:1}); await sleep(300);
}
export async function fill(selector,value) {
  await click(selector);
  await call("Input.dispatchKeyEvent",{type:"keyDown",key:"a",code:"KeyA",modifiers:2});
  await call("Input.dispatchKeyEvent",{type:"keyUp",key:"a",code:"KeyA",modifiers:2});
  await call("Input.insertText",{text:String(value)});
  await call("Input.dispatchKeyEvent",{type:"keyDown",key:"Tab",code:"Tab"});
  await call("Input.dispatchKeyEvent",{type:"keyUp",key:"Tab",code:"Tab"});await sleep(200);
}
export async function shot(name) {
  await sleep(400);
  const r=await call("Page.captureScreenshot",{format:"png",captureBeyondViewport:false});
  await fs.writeFile(`${out}/${name}.png`,Buffer.from(r.data,"base64"));
}
export async function api(path,body,method=body?"POST":"GET"){
  return evaluate(`(async()=>{const r=await fetch(${JSON.stringify(path)},{method:${JSON.stringify(method)},headers:{"Content-Type":"application/json"},${body?'body:'+JSON.stringify(JSON.stringify(body))+',':''}credentials:"include"});return {status:r.status,body:await r.json()}})()`);
}
export async function db() {
  const connection = process.env.DEV_DATABASE_URL || (() => {const u=new URL(process.env.DATABASE_URL);u.pathname="/sitelog_dev";return u.toString()})();
  const pool=new pg.Pool({connectionString:connection});
  const {rows}=await pool.query("select current_database() as db");
  if(rows[0].db!=="sitelog_dev") throw Error("Unsafe database target");
  return pool;
}
export async function close(){ws.close();}
await call("Page.enable");await call("Runtime.enable");
await call("Emulation.setDeviceMetricsOverride",{width:1440,height:1050,deviceScaleFactor:1,mobile:false});