// Signed-in UI verification. Browser-only vendor/owner fixtures; no business writes.
// Reuses the approved ordinary dev login/device cleanup procedure.
import pg from "pg";
import WebSocket from "ws";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

let source = await fs.readFile("scripts/trip-vb-readonly-browser.mjs", "utf8");
source = source.replace(/^import .*;\n/gm, "");
source = source.replace('await cmd("Network.enable");', `
await cmd("Network.enable");
await cmd("Network.setBypassServiceWorker",{bypass:true});
await cmd("Network.setCacheDisabled",{cacheDisabled:true});
await cmd("Emulation.setDeviceMetricsOverride",{width:1280,height:950,deviceScaleFactor:1,mobile:false});
ws.on("message", async raw => {
  const message = JSON.parse(raw);
  if(message.method !== "Fetch.requestPaused") return;
  const {requestId,request} = message.params;
  const fixture = request.url.includes("/vendor-options") ? [
    {id:70001,name:"SARA MASTER",businessName:"SARAVANA METAL INDUSTRIES",isActive:true},
    {id:70002,name:"NARSI MASTER",businessName:"GANGARAM NARSIMULU",isActive:true}
  ] : [{id:30,vendorId:70002,linkedVendorName:"GANGARAM NARSIMULU",ownership:"hired",registrationNumber:"TS15UF 4308"}];
  await cmd("Fetch.fulfillRequest",{requestId,responseCode:200,responseHeaders:[{name:"Content-Type",value:"application/json"}],body:Buffer.from(JSON.stringify(fixture)).toString("base64")});
});
await cmd("Fetch.enable",{patterns:[
  {urlPattern:"*/api/site-material-trips/vendor-options*"},
  {urlPattern:"*/api/site-material-trips/hired-vehicle-options"}
]});
`);
source = source.replace('await new Promise(r=>setTimeout(r,1500));', `
await new Promise(r=>setTimeout(r,1800));
const pause = () => new Promise(r=>setTimeout(r,200));
const type = async (testId,text) => {
  assert(await evaluate(\`!!document.querySelector('[data-testid="\${testId}"]')\`),testId);
  await evaluate(\`(()=>{
    const el=document.querySelector('[data-testid="\${testId}"]');
    el.scrollIntoView({block:"center"});el.focus();
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set.call(el,\${JSON.stringify(text)});
    el.dispatchEvent(new Event("input",{bubbles:true}));
  })()\`);
  await pause();
};
const clickOption = async (text,touch=false) => {
  const rect=await evaluate(\`(()=>{
    const el=[...document.querySelectorAll('[role=option]')].find(e=>e.textContent.includes(\${JSON.stringify(text)}));
    if(!el)return null;el.scrollIntoView({block:"center"});const r=el.getBoundingClientRect();
    return {x:r.x+r.width/2,y:r.y+r.height/2};
  })()\`);
  assert(rect,"Missing option "+text);
  if(touch) {
    await cmd("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:[rect]});
    await cmd("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]});
  } else {
    await cmd("Input.dispatchMouseEvent",{type:"mousePressed",...rect,button:"left",clickCount:1});
    await cmd("Input.dispatchMouseEvent",{type:"mouseReleased",...rect,button:"left",clickCount:1});
  }
  await pause();
};
const screenshot=async name=>fs.writeFile("/tmp/ux02-"+name+".png",Buffer.from((await cmd("Page.captureScreenshot",{format:"png"})).data,"base64"));
const key=async key=>{await cmd("Input.dispatchKeyEvent",{type:"keyDown",key});await cmd("Input.dispatchKeyEvent",{type:"keyUp",key});await pause();};
await evaluate(\`document.querySelector('[data-testid="edit-trip-source-vendor"]').click()\`);
await pause();
await type("input-edit-trip-material-source-supplier","SARA");
console.log(await evaluate(\`JSON.stringify({value:document.querySelector('[data-testid="input-edit-trip-material-source-supplier"]')?.value,disabled:document.querySelector('[data-testid="input-edit-trip-material-source-supplier"]')?.disabled,expanded:document.querySelector('[data-testid="input-edit-trip-material-source-supplier"]')?.getAttribute("aria-expanded"),options:[...document.querySelectorAll('[role=option]')].map(e=>e.textContent),alerts:[...document.querySelectorAll('[role=alert]')].map(e=>e.textContent)})\`));
await screenshot("supplier");
assert(await evaluate(\`[...document.querySelectorAll('[role=option]')].some(e=>e.textContent.includes("SARAVANA METAL INDUSTRIES"))\`));
await screenshot("supplier");
await clickOption("SARAVANA");
assert.equal(await evaluate(\`document.querySelector('[data-testid="input-edit-trip-material-source-supplier"]').value\`),"SARAVANA METAL INDUSTRIES");
await evaluate(\`document.querySelector('[data-testid="edit-trip-role-different_parties"]').click()\`);
await pause();
await type("input-edit-trip-supplier","NARSI");
await key("ArrowDown");await key("Enter");
assert.equal(await evaluate(\`document.querySelector('[data-testid="input-edit-trip-supplier"]').value\`),"GANGARAM NARSIMULU");
await type("input-edit-trip-vehicle-search","4308");
await screenshot("vehicle");
await clickOption("4308");
assert.match(await evaluate(\`document.querySelector('[data-testid="input-edit-trip-vehicle-search"]').value\`),/4308.*Hired.*NARSIMULU/);
await type("input-edit-trip-material-source-supplier","SARA");
await key("Escape");
assert(await evaluate(\`!!document.querySelector('[data-testid="dialog-trip-roles"]')\`),"Escape closed the Edit dialog");
assert.equal(await evaluate(\`document.querySelector('[data-testid="input-edit-trip-material-source-supplier"]').getAttribute("aria-expanded")\`),"false");
await cmd("Emulation.setDeviceMetricsOverride",{width:390,height:844,deviceScaleFactor:1,mobile:true});
await cmd("Emulation.setTouchEmulationEnabled",{enabled:true});
await type("input-edit-trip-material-source-supplier","SARA");
await key("ArrowDown");
await screenshot("mobile-supplier");
await clickOption("SARAVANA",true);
assert.equal(await evaluate(\`document.querySelector('[data-testid="input-edit-trip-material-source-supplier"]').value\`),"SARAVANA METAL INDUSTRIES");
console.log(JSON.stringify({supplierMouse:true,transporterKeyboard:true,actualEquipment4308:true,mobileTouch:true,escapeKeepsDialog:true,browserOnlyVendorFixtures:true,noBusinessWrites:true}));
await key("Escape");
await new Promise(r=>setTimeout(r,400));
await cmd("Emulation.setDeviceMetricsOverride",{width:1280,height:950,deviceScaleFactor:1,mobile:false});
await evaluate(\`document.querySelector('[data-testid="select-trip-site"]').focus()\`);
await key("ArrowDown");await key("Enter");
await new Promise(r=>setTimeout(r,700));
await type("input-trip-material-source-supplier","SARA");
await screenshot("add-supplier");
await clickOption("SARAVANA");
assert.equal(await evaluate(\`document.querySelector('[data-testid="input-trip-material-source-supplier"]').value\`),"SARAVANA METAL INDUSTRIES");
console.log(JSON.stringify({addSupplierSelection:true}));
`);
await new Function("pg", "WebSocket", "assert", "fs", "return (async()=>{" + source + "})()")(pg, WebSocket, assert, fs);
