import assert from "node:assert/strict";
import fs from "node:fs/promises";
import {go,call,evaluate,sleep,shot,click,tid,save,close,out} from "./browser.mjs";
const {cases}=JSON.parse(await fs.readFile(`${out}/seed.json`));
const results={realSignedInDevelopment:true,mockedReportApis:false,cases:{}};
async function load(name,width=1280){
  await call("Emulation.setDeviceMetricsOverride",{width,height:1000,deviceScaleFactor:1,mobile:width<640});
  await go(`/site/report/${cases[name]}`);await sleep(4500);
  return await evaluate('[...document.querySelectorAll(".dpr-management-summary > div")].map(e=>e.innerText)');
}
async function strip(name){
  await evaluate("window.scrollTo(0,0)");
  const clip=await evaluate('(()=>{const r=document.querySelector(".dpr-management-summary").getBoundingClientRect();const h=document.querySelector(".dpr-management-header").getBoundingClientRect();return {x:Math.max(0,h.x-8),y:Math.max(0,h.y-8),width:Math.min(innerWidth-h.x+8,h.width+16),height:r.bottom-h.y+16,scale:1}})()');
  const r=await call("Page.captureScreenshot",{format:"png",captureBeyondViewport:true,clip});
  await fs.writeFile(`${out}/${name}.png`,Buffer.from(r.data,"base64"));
}
async function share(){
  // No API mocking: intercept only the external WhatsApp/clipboard transport.
  await evaluate('window.__summaryShare={};Object.defineProperty(navigator,"share",{configurable:true,value:undefined});window.open=url=>{window.__summaryShare.url=url;return null};Object.defineProperty(navigator,"clipboard",{configurable:true,value:{writeText:async text=>{window.__summaryShare.text=text}}})');
  await click(tid("button-share-whatsapp"));await sleep(250);
  return evaluate("window.__summaryShare");
}
try{
  let tiles=await load("A");
  assert(tiles[0].startsWith("56.25 Cum"));
  assert(tiles[0].includes("Work done · Wet Mix Macadam"));
  assert(tiles.at(-1).includes("Bulk received · WMM · 5 trips"));
  results.cases.A=tiles;await strip("A-F-single-desktop");
  tiles=await load("BE");
  for(const s of ["3 items","56.25 Cum","120 Cum","0.5 Ha"])assert(tiles[0].includes(s),s);
  assert(tiles.at(-1).includes("2 materials"));
  for(const s of ["WMM 141.03 MT (5 trips)","Soil 60 MT (3 trips)"])assert(tiles.at(-1).includes(s),s);
  const geometry=await evaluate('[...document.querySelectorAll(".dpr-management-summary > div")].map(e=>({y:e.getBoundingClientRect().y,big:getComputedStyle(e.querySelector("strong")).fontSize}))');
  assert(geometry.every(g=>Math.abs(g.y-geometry[0].y)<1),"desktop tiles must stay top-aligned in one row");
  results.desktopGeometry=geometry;results.cases.BE=tiles;await strip("B-E-three-activities-two-materials-desktop");await shot("B-E-full-page",true);
  const beShare=await share();assert(beShare.text.includes("0.5 Ha"));assert(beShare.text.includes("5 trips"));assert(beShare.text.includes("3 trips"));results.shareBE=beShare;await shot("H-share-confirmation",false);
  tiles=await load("C");
  assert(tiles[0].includes("5 items"));assert(tiles[0].includes("+2 more"));assert(!tiles[0].includes("Diversion"));assert(!tiles[0].includes("250 m"));
  assert(tiles.at(-1).includes("5 materials"));assert(tiles.at(-1).includes("+2 more"));assert(!tiles.at(-1).includes("Aggregate"));
  results.cases.C=tiles;await strip("C-five-activities-five-materials");
  const cShare=await share();
  for(const s of ["Diversion","(incidental)","Road marking","Aggregate","Stone","4 trips"])assert(cShare.text.includes(s),s);
  assert(!cShare.text.includes("more"));results.shareC=cShare;
  tiles=await load("D");assert(tiles[0].includes("2 items"));assert(!tiles[0].includes("No-work excluded marker"));results.cases.D=tiles;await strip("D-no-site-work-excluded");
  const dShare=await share();assert(!dShare.text.includes("No-work excluded marker"));
  tiles=await load("NoWork");assert(tiles[0].includes("No site work"));assert(!tiles[0].includes("items"));results.cases.NoWork=tiles;await strip("D-all-no-site-work");
  tiles=await load("BE",390);
  assert(await evaluate("document.documentElement.scrollWidth<=innerWidth"),"phone overflow");
  await strip("G-phone-three-activities-two-materials");
  await shot("G-phone-full-page",true);
  const listStyles=await evaluate('[...document.querySelectorAll(".dpr-management-summary *")].filter(e=>e.textContent.includes("120 Cum")&&!e.querySelector("strong")&&e.children.length===0).map(e=>({size:getComputedStyle(e).fontSize,color:getComputedStyle(e).color}))');
  results.phoneListStyles=listStyles;
  for(const t of Object.values(results.cases))assert(!/[₹]|rate|amount/i.test(t.join(" ")));
  await save("browser-evidence",results);
  console.log("A-H passed: desktop/phone, one/three/five activities, No Work filtering, material trips, screen truncation, untruncated share.");
}finally{await close();}