import { mkdirSync, writeFileSync } from "node:fs";
import WebSocket from "ws";

const vitePort = Number(process.env.VITE_PORT || 4210);
const cdpPort = Number(process.env.CDP_PORT || 9360);
const evidenceDir = "screenshots/vb28";
mkdirSync(evidenceDir, { recursive: true });
const targets = await (await fetch(`http://127.0.0.1:${cdpPort}/json/list`)).json();
const page = targets.find(target => target.type === "page");
if (!page) throw Error("No Chromium page target");
const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { socket.once("open", resolve); socket.once("error", reject); });
let sequence = 0;
const pending = new Map();
socket.on("message", raw => {
  const message = JSON.parse(raw);
  const request = pending.get(message.id);
  if (!request) return;
  pending.delete(message.id);
  message.error ? request.reject(Error(message.error.message)) : request.resolve(message.result);
});
const cdp = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++sequence;
  pending.set(id, { resolve, reject });
  socket.send(JSON.stringify({ id, method, params }));
});
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const evaluate = async expression => {
  const result = await cdp("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw Error(result.exceptionDetails.text);
  return result.result?.value;
};
const quote = JSON.stringify;
const node = id => `document.querySelector('[data-testid=${quote(id)}]')`;
const assert = (condition, message) => { if (!condition) throw Error(message); };
const waitFor = async (expression, label, attempts = 400) => {
  for (let i = 0; i < attempts; i++) {
    try { if (await evaluate(`!!(${expression})`)) return; } catch {}
    await sleep(50);
  }
  throw Error(`Timed out waiting for ${label}`);
};
const click = async id => {
  await waitFor(node(id), id);
  assert(await evaluate(`(() => { const n=${node(id)}; if(n.disabled)return false;n.click();return true })()`), `Could not click ${id}`);
  await sleep(100);
};
const input = async (id, value) => {
  await waitFor(node(id), id);
  await evaluate(`(() => { const n=${node(id)};Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set.call(n,${quote(value)});n.dispatchEvent(new Event("input",{bubbles:true}));n.dispatchEvent(new Event("change",{bubbles:true})) })()`);
};
const select = async (id, label) => {
  await click(id);
  const option = `[...document.querySelectorAll('[role="option"]')].find(n=>n.textContent.trim()===${quote(label)})`;
  await waitFor(option, `${label} option`);
  await evaluate(`${option}.click()`);
  await sleep(100);
};
const text = id => evaluate(`${node(id)}?.innerText||""`);
const value = id => evaluate(`${node(id)}?.value??""`);
const screenshot = async name => {
  await sleep(200);
  const result = await cdp("Page.captureScreenshot", { format: "png", fromSurface: true });
  const path = `${evidenceDir}/${name}.png`;
  writeFileSync(path, Buffer.from(result.data, "base64"));
  return path;
};
const focus = async id => { await evaluate(`${node(id)}?.scrollIntoView({block:"center"})`); await sleep(150); };
const load = async path => {
  await cdp("Page.navigate", { url: `http://127.0.0.1:${vitePort}${path}` });
  await waitFor(node("vb28-disclosure"), "fixture disclosure");
};

const shots = [], checks = [];
const edit = async id => {
  await load('/plant/vendor-bills');
  await click('card-bill-'+id);
  await click('button-edit-bill');
  await waitFor(node('button-collapse-all-dates'), 'edit groups');
};
await cdp('Page.enable'); await cdp('Runtime.enable'); await cdp('Network.enable');
const nativeApis=[], exceptions=[];
socket.on('message',raw=>{const m=JSON.parse(raw);if(m.method==='Network.requestWillBeSent'&&new URL(m.params.request.url).pathname.startsWith('/api/'))nativeApis.push(m.params.request.url);if(m.method==='Runtime.exceptionThrown')exceptions.push(m.params.exceptionDetails);});
try {
for (const [viewport,width,height] of [['desktop',1440,1000],['mobile',390,844]]) {
  await cdp('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:viewport==='mobile'});
  for(const [billId,scope,date,labour] of [[2801,'edit-all','2027-03-01',false],[2802,'edit-material','2027-03-01',false],[2802,'edit-labour-labour-other','2027-03-01',false],[2802,'other','',true]]) {
    await edit(billId);
    const removeId=labour?'button-remove-labour-source-other':'button-remove-date-group-'+scope+'-'+date;
    const toggleId='button-date-group-'+scope+'-'+date;
    await waitFor(node(removeId),removeId);
    if(!labour){
      await click('button-collapse-all-dates');
      await click(toggleId);
      assert(await evaluate(node(toggleId)+'.getAttribute("aria-expanded")==="true"'),'toggle expand');
      await click(toggleId);
      assert(await evaluate(node(toggleId)+'.getAttribute("aria-expanded")==="false"'),'toggle collapse');
      assert(await evaluate('window.__VB28Fixture.confirms.length===0'),'toggle invoked removal');
    }
    await focus(removeId);
    // Existing wide table scrolls horizontally on phones; show the trailing edge.
    await evaluate(node(removeId)+'.scrollIntoView({block:"center",inline:"end"})');
    const geometry=await evaluate(`(() => {const r=REMOVE;const area=r.parentElement;const td=area.parentElement;const t=TOGGLE;const rr=r.getBoundingClientRect(), ar=area.getBoundingClientRect(); const tr=t?.getBoundingClientRect();return {height:rr.height,rightGap:td.getBoundingClientRect().right-rr.right,gap:tr?rr.top-tr.bottom:null,divider:getComputedStyle(area).borderTopWidth,margin:getComputedStyle(area).marginTop,padding:getComputedStyle(area).paddingTop};})()`.replace('REMOVE',node(removeId)).replace('TOGGLE',labour?'null':node(toggleId)));
    assert(geometry.height>=44,'touch height below44');
    assert(geometry.divider==='1px'&&geometry.margin==='12px'&&geometry.padding==='12px','separation missing');
    if(!labour)assert(geometry.gap>=24,'toggle/removal gap');
    shots.push(await screenshot(viewport+'-'+scope+'-SYNTHETIC'));
    await click(removeId);
    assert(await evaluate('window.__VB28Fixture.confirms.length===1'),'no confirmation');
    assert(await evaluate('!!'+node(removeId)),'cancel removed group');
    await evaluate('window.__VB28Fixture.accept=true');
    await click(removeId);
    assert(await evaluate('!'+node(removeId)),'confirmation did not remove group');
    const state=await evaluate('window.__VB28Fixture');
    assert(state.confirms.length===2,'wrong confirm count');
    assert(state.requests.every(r=>r.method==='GET'||r.path==='/api/vendor-bills/check-duplicates'),'unexpected write');
    checks.push({viewport,scope,geometry,confirmText:state.confirms[0],cancelPreserved:true,confirmRemoved:true});
  }
}
assert(!nativeApis.length,'live API request escaped interception');assert(!exceptions.length,'browser exception');
writeFileSync(evidenceDir+'/evidence.json',JSON.stringify({synthetic:true,productionComponent:'VendorBills',liveWrites:false,checks,shots,nativeApis,exceptions},null,2));
console.log(JSON.stringify({checks,shots},null,2));
} finally {socket.close();}
