import WebSocket from "ws";
import pg from "pg";
import fs from "node:fs/promises";
export const out = ".agents/outputs/dpr-page-01";
export const origin = `https://${process.env.REPLIT_DEV_DOMAIN}`;
export const sleep = ms => new Promise(r => setTimeout(r, ms));
const targets = await (await fetch("http://127.0.0.1:9227/json")).json();
const ws = new WebSocket(targets.find(t => t.type === "page").webSocketDebuggerUrl);
await new Promise(r => ws.once("open", r));
let id = 0;
const pending = new Map();
export const events = [];
let dialogAnswer;
export function answerDialogs(accept) { dialogAnswer=accept; }
ws.on("message", raw => {
  const m = JSON.parse(raw), p = pending.get(m.id);
  if(m.method==="Page.javascriptDialogOpening") {
    events.push(m.params);
    if(dialogAnswer!==undefined) void call("Page.handleJavaScriptDialog",{accept:dialogAnswer});
  }
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
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result?.value;
}
export async function go(path) { await call("Page.navigate", {url:origin+path}); await sleep(2300); }
export async function click(selector) {
  const point = await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw Error('Missing '+${JSON.stringify(selector)});e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
  await call("Input.dispatchMouseEvent", {type:"mousePressed",...point,button:"left",clickCount:1});
  await call("Input.dispatchMouseEvent", {type:"mouseReleased",...point,button:"left",clickCount:1}); await sleep(350);
}
export const tid = s => `[data-testid="${s}"]`;
export async function textClick(text, exact = true) {
  const selector = await evaluate(`(()=>{const e=[...document.querySelectorAll('button,[role="option"],a,summary')].find(e=>${exact ? "e.innerText.trim()===" : "e.innerText.includes("}${JSON.stringify(text)}${exact ? "" : ")"});if(!e)throw Error('Missing text '+${JSON.stringify(text)}); e.setAttribute('data-ux-test-target','yes');return '[data-ux-test-target="yes"]'})()`);
  await click(selector); await evaluate(`document.querySelector('[data-ux-test-target="yes"]')?.removeAttribute('data-ux-test-target')`);
}
export async function option(text) {
  await evaluate(`(()=>{const e=[...document.querySelectorAll('[role="option"]')].find(e=>e.innerText.trim()===${JSON.stringify(text)});if(!e)throw Error('Missing option');e.setAttribute('data-ux-option','yes')})()`);
  await click('[data-ux-option="yes"]');
}
export async function fill(selector,value) {
  await click(selector);
  await call("Input.dispatchKeyEvent",{type:"keyDown",key:"a",code:"KeyA",modifiers:2,windowsVirtualKeyCode:65});
  await call("Input.dispatchKeyEvent",{type:"keyUp",key:"a",code:"KeyA",modifiers:2,windowsVirtualKeyCode:65});
  if(String(value)==="") await key("Backspace");
  else await call("Input.insertText",{text:String(value)});
  await key("Tab"); await sleep(150);
}
export async function key(key) {
  const code=/^\d$/.test(key)?`Digit${key}`:/^[a-z]$/.test(key)?`Key${key.toUpperCase()}`:key;
  const windowsVirtualKeyCode=({Backspace:8,Tab:9,Enter:13,Escape:27,Home:36,ArrowLeft:37,ArrowUp:38,ArrowRight:39,ArrowDown:40,Delete:46})[key] || (key.length===1?key.toUpperCase().charCodeAt(0):0);
  await call("Input.dispatchKeyEvent",{type:"keyDown",key,code,windowsVirtualKeyCode,...(key.length===1?{text:key,unmodifiedText:key}:{})});
  await call("Input.dispatchKeyEvent",{type:"keyUp",key,code,windowsVirtualKeyCode});
}
export async function section(name) {
  await evaluate(`document.querySelectorAll('button').forEach(e=>{if(e.querySelector('h2')?.textContent===${JSON.stringify(name)})e.setAttribute('data-ux-section','yes')})`);
  await click('[data-ux-section="yes"]'); await sleep(900);
}
export async function expand(index=0) {
  if(await evaluate(`!!document.querySelector('[data-testid="equipment-compact-${index}"] button[aria-label^="Expand"]')`))
    await click(`[data-testid="equipment-compact-${index}"] button[aria-label^="Expand"]`);
}
export async function time(selector, value) {
  await click(selector);
  // Chromium's segmented time control does not accept CDP insertText.
  // Set its native DOM value and deliver the real bubbling input event.
  await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}))})()`);
  await key("Tab");
}
export async function shot(name, full=false) {
  await sleep(350);
  let extra = {};
  if(full){const {cssContentSize:r}=await call("Page.getLayoutMetrics");extra={clip:{x:0,y:0,width:r.width,height:r.height,scale:1}};}
  const r=await call("Page.captureScreenshot",{format:"png",captureBeyondViewport:full,...extra});
  await fs.writeFile(`${out}/${name}.png`,Buffer.from(r.data,"base64"));
}
export async function api(path,body,method=body?"POST":"GET"){
  return evaluate(`(async()=>{const r=await fetch(${JSON.stringify(path)},{method:${JSON.stringify(method)},headers:{"Content-Type":"application/json"},${body?'body:'+JSON.stringify(JSON.stringify(body))+',':''}credentials:"include"});return {status:r.status,body:await r.json()}})()`);
}
export async function db() {
  const connection=process.env.DEV_DATABASE_URL || (()=>{const u=new URL(process.env.DATABASE_URL);u.pathname="/sitelog_dev";return u.toString()})();
  const pool=new pg.Pool({connectionString:connection});
  const {rows}=await pool.query("select current_database() as db");
  if(rows[0].db!=="sitelog_dev")throw Error("Unsafe database target");
  return pool;
}
export async function save(name,value){await fs.writeFile(`${out}/${name}.json`,JSON.stringify(value,null,2));}
export async function close(){ws.close();}
await call("Page.enable"); await call("Runtime.enable");