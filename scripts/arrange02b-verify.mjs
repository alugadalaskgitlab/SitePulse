import fs from "node:fs";
import assert from "node:assert/strict";
import pg from "pg";
import WebSocket from "ws";
const p=new pg.Client({connectionString:process.env.DEV_DATABASE_URL});await p.connect();
assert.equal((await p.query("select current_database() n")).rows[0].n,"sitelog_dev");
const root="reports/arrange02b", base="http://127.0.0.1:5000", vendor="ARR02B DISPOSABLE", start=1900000400;
const save=(name,data)=>fs.writeFileSync(`${root}/${name}.json`,JSON.stringify(data,null,2));
const beforeSessions=(await p.query("select id from user_sessions where user_id=16")).rows.map(r=>r.id);
const beforeDevices=(await p.query("select id from user_devices where user_id=16")).rows.map(r=>r.id);
const cookies={},bills=[],arrs=[],trips=[];let inspector,browser;
async function connect(port){
 const targets=await(await fetch(`http://127.0.0.1:${port}/json`)).json();
 const ws=new WebSocket((targets.find(t=>t.type==="page")??targets[0]).webSocketDebuggerUrl);
 await new Promise(r=>ws.once("open",r));let n=0;const pending=new Map();
 ws.on("message",raw=>{const m=JSON.parse(raw);if(pending.has(m.id)){pending.get(m.id)(m);pending.delete(m.id);}});
 const call=(method,params={})=>new Promise((resolve,reject)=>{const id=++n;pending.set(id,m=>m.error?reject(Error(m.error.message)):resolve(m.result));ws.send(JSON.stringify({id,method,params}));});
 const evaluate=async expression=>{const r=await call("Runtime.evaluate",{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description);return r.result?.value;};
 return {ws,call,evaluate};
}
async function api(path,body,method=body?"POST":"GET"){
 const r=await fetch(base+path,{method,headers:{"Content-Type":"application/json",cookie:Object.entries(cookies).map(([k,v])=>`${k}=${v}`).join("; ")},body:body?JSON.stringify(body):undefined});
 for(const c of r.headers.getSetCookie()){const s=c.split(";")[0],i=s.indexOf("=");cookies[s.slice(0,i)]=s.slice(i+1);}
 return {status:r.status,data:await r.json()};
}
const mapped=r=>({...r,source:r.sourceType?`auto:${r.sourceType}:${r.sourceId}`:`auto:${r.sourceId}`});
const body=items=>({billNo:"",billDate:"2026-10-08",billType:"all",vendorName:vendor,periodFrom:"2026-10-08",periodTo:"2026-10-08",siteId:16,items,totalAmount:items.reduce((s,r)=>s+(r.amount||0),0)});
try{
 inspector=await connect(9229);
 await inspector.evaluate(`(()=>{const s=process.getBuiltinModule("module").createRequire(process.cwd()+"/package.json")("web-push"),original=s.sendNotification;globalThis.__arr02b={s,original,blocked:0};s.sendNotification=function(sub,payload,...args){let d;try{d=JSON.parse(payload)}catch{}if(d?.title==="New Vendor Bill"&&d.body?.includes("ARR02B DISPOSABLE")){globalThis.__arr02b.blocked++;return Promise.resolve({statusCode:204})}return original.call(this,sub,payload,...args)}})()`);
 const loginBody={identifier:"agent.verification@test.invalid",password:process.env.DEV_VERIFICATION_PASSWORD};
 let login=await api("/api/auth/login",loginBody);
 if(login.status===202){
  const tokens=Object.values(cookies).map(v=>decodeURIComponent(v).split(".")[0].replace(/^s:/,""));
  const devices=(await p.query("select id from user_devices where user_id=16 and status='pending' and device_token=any($1::text[])",[tokens])).rows;
  assert.equal(devices.length,1);assert(!beforeDevices.includes(devices[0].id));
  await p.query("update user_devices set status='approved',approved_at=now() where id=$1",[devices[0].id]);
  login=await api("/api/auth/login",loginBody);
 }
 assert.equal(login.status,200);save("login",{status:200,userId:16});
 const terms=[["full_service","trip"],null,["transport_only","trip"],["full_service","cum"],["full_service","mt"],["full_service","km"]];
 const template=(await p.query("select to_jsonb(a) v from earthwork_arrangements a where id=2")).rows[0].v;
 for(let i=0;i<terms.length;i++){
  const id=start+i+1,t=terms[i];
  const value={...template,id,agency_name:vendor,billing_terms:t?{scope:t[0],basis:t[1]}:null,agreed_rate:100,trip_rates:[300,600,800,1000].map((quantity,j)=>({quantity,uom:"CFT",rate:1000+j*250}))};
  await p.query("insert into earthwork_arrangements select * from jsonb_populate_record(null::earthwork_arrangements,$1::jsonb)",[JSON.stringify(value)]);arrs.push(id);
 }
 let k=0;
 for(const [index,sizes]of [[0,[300,600,600,800,1000,700]],[1,[600]],[2,[600]],[3,[600]],[4,[600]],[5,[600]]]){
  for(const size of sizes){
   const id=start+100+(++k);await p.query(`insert into site_material_trips
   (id,date,site,material,quantity,uom,supplier,vehicle_number,material_source_type,material_source_supplier,transport_type,boq_project_id,boq_item_id,earthwork_arrangement_id)
   values ($1,'2026-10-08','THAKADPALLY - SIRUR','Soil',$2,'CFT',$3,'ARR02B','own_source',null,'agency_vendor',2,1151,$4)`,[id,size,vendor,arrs[index]]);trips.push(id);
  }
 }
 const autoPath=`/api/vendor-bills/auto-items?vendorName=${encodeURIComponent(vendor)}&billType=all&periodFrom=2026-10-08&periodTo=2026-10-08&siteId=16`;
 await p.query("update site_material_trips set material_source_type='vendor',material_source_supplier='ARR02B SELLER',earthwork_arrangement_id=null where id=$1",[trips[7]]);
 const sellerPath=autoPath.replace(encodeURIComponent(vendor),encodeURIComponent("ARR02B SELLER"));
 const beforeTransport=await api(autoPath),beforeMaterial=await api(sellerPath);
 assert(beforeTransport.data.some(r=>r.sourceType==="site_material_trip_transport"&&r.sourceId===trips[7]));
 await p.query("update site_material_trips set earthwork_arrangement_id=$2 where id=$1",[trips[7],arrs[2]]);
 const afterTransport=await api(autoPath),afterMaterial=await api(sellerPath);
 assert.deepEqual(beforeMaterial,afterMaterial);
 assert(afterTransport.data.some(r=>r.sourceType==="site_material_trip_arrangement"&&r.sourceId===trips[7]));
 save("P4-before-after",{beforeTransport:beforeTransport.data.filter(r=>r.sourceId===trips[7]),afterTransport:afterTransport.data.filter(r=>r.sourceId===trips[7]),beforeMaterial,afterMaterial});
 const auto=await api(autoPath);save("P1-P6-candidates",auto);assert.equal(auto.status,200);
 const rows=auto.data.filter(r=>r.arrangementPricing);
 assert.equal(rows.length,11);assert.equal(rows.filter(r=>r.arrangementPricing.arrangementId===arrs[0]&&r.rate>0).reduce((s,r)=>s+r.amount,0),6750);
 assert(rows.find(r=>r.arrangementPricing.tripQuantity===700).arrangementPricing.reason);
 const selected=rows.filter(r=>r.arrangementPricing.arrangementId===arrs[0]&&r.rate>0).map(mapped);
 const created=await api("/api/vendor-bills",body(selected));save("P7-save",created);assert.equal(created.status,201);bills.push(created.data.id);
 const duplicate=await api("/api/vendor-bills/check-duplicates",{vendorName:vendor,items:selected});save("P7-pull-again-duplicates",duplicate);assert.equal(duplicate.status,200);assert.equal(duplicate.data.length,selected.length);
 const duplicateSave=await api("/api/vendor-bills",body(selected.map(row=>({...row,source:row.source.toUpperCase()}))));
 save("P7-duplicate-case-refused",duplicateSave);assert.equal(duplicateSave.status,409);
 const direct=await api("/api/vendor-bills",body([{...selected[0],source:`auto:site_material_trip_transport:${selected[0].sourceId}`,arrangementPricing:null,category:"transport"}]));save("P7-direct-transport-refused",direct);assert([400,409].includes(direct.status));
 await p.query("update earthwork_arrangements set trip_rates=$2 where id=$1",[arrs[0],JSON.stringify([{quantity:600,uom:"CFT",rate:9999}])]);
 const original600=selected.find(row=>row.arrangementPricing.tripQuantity===600);
 const rewritten={...original600,source:original600.source.toUpperCase(),rate:9999,amount:9999,arrangementPricing:{...original600.arrangementPricing,rateApplied:9999}};
 const tampered=await api(`/api/vendor-bills/${created.data.id}`,body([rewritten]),"PUT");
 save("P8-case-reprice-refused",tampered);assert.equal(tampered.status,409);
 const read=await api(`/api/vendor-bills/${created.data.id}`);save("P8-reopened",read);assert.equal(read.status,200);assert.equal(read.data.totalAmount,created.data.totalAmount);assert.deepEqual(read.data.items.map(i=>[i.rate,i.amount,i.arrangementPricing]),created.data.items.map(i=>[i.rate,i.amount,i.arrangementPricing]));
 // Same-party conflict: only our temporary trip changes; retain its landed row.
 await p.query("update site_material_trips set material_source_type='vendor',material_source_supplier=$2 where id=$1",[trips[7],vendor]);
 const conflicts=await api(autoPath);const conflict=conflicts.data.find(r=>r.arrangementPricing?.conflict);assert(conflict);assert.equal(conflict.category,"material");assert.equal(conflict.rate,0);save("P4-conflict",conflict);
 const reviewItems=conflicts.data.filter(r=>r.arrangementPricing && (r.arrangementPricing.arrangementId!==arrs[0] || r.arrangementPricing.tripQuantity===700)).map(mapped);
 const review=await api("/api/vendor-bills",body(reviewItems));save("P2-P6-review-save",review);assert.equal(review.status,201);bills.push(review.data.id);
 browser=await connect(9234);await browser.call("Network.enable");
 const browserResponses=[];
 browser.ws.on("message",raw=>{const m=JSON.parse(raw);if(m.method==="Network.responseReceived"&&m.params.response.url.includes("/api/vendor-bills"))browserResponses.push({url:m.params.response.url.replace(base,""),status:m.params.response.status});});
 for(const[name,value]of Object.entries(cookies))await browser.call("Network.setCookie",{name,value,url:base});
 await browser.call("Emulation.setDeviceMetricsOverride",{width:1440,height:1100,deviceScaleFactor:1,mobile:false});
 await browser.call("Page.navigate",{url:base+"/plant/vendor-bills"});
 const wait=async expression=>{for(let i=0;i<240;i++){if(await browser.evaluate(expression))return;await new Promise(r=>setTimeout(r,500));}throw Error("Browser timeout "+expression);};
 await wait(`!!document.querySelector('[data-testid="card-bill-${created.data.id}"]')`);
 save("browser-visible-text",await browser.evaluate("document.body.innerText"));
 fs.writeFileSync(`${root}/signed-in-bills.jpg`,Buffer.from((await browser.call("Page.captureScreenshot",{format:"jpeg",quality:85})).data,"base64"));
 for(const [label,bill] of [["P1-P8-frozen",created],["P3-P6-review",review]]){
  await browser.call("Page.navigate",{url:base+"/plant/vendor-bills"});
  await wait(`!!document.querySelector('[data-testid="card-bill-${bill.data.id}"]')`);
  await browser.evaluate(`document.querySelector('[data-testid="card-bill-${bill.data.id}"]').click()`);
  await wait(`!!document.querySelector('[data-testid="button-edit-bill"]')`);
  await browser.evaluate(`document.querySelector('[data-testid="button-edit-bill"]').click()`);
  await wait(`!!document.querySelector('[data-testid^="arrangement-bill-group-"]')`);
  await browser.evaluate(`document.querySelector('[data-testid^="arrangement-bill-group-"]').scrollIntoView({block:"start"})`);
  await new Promise(r=>setTimeout(r,700));
  fs.writeFileSync(`${root}/${label}.jpg`,Buffer.from((await browser.call("Page.captureScreenshot",{format:"jpeg",quality:85})).data,"base64"));
  if(label==="P1-P8-frozen"){
   await browser.evaluate(`document.querySelector('[data-testid="button-save-bill"]').click()`);
   await new Promise(r=>setTimeout(r,1500));
   const reopened=await api(`/api/vendor-bills/${bill.data.id}`);assert.equal(reopened.data.totalAmount,6750);
   save("P8-after-ui-update",reopened);
  }
 }
 save("proof-ids",{bills,arrangements:arrs,trips});
 save("browser-responses",browserResponses);
}finally{
 browser?.ws.close();
 if(inspector){save("notification-fence",await inspector.evaluate("(()=>{const s=globalThis.__arr02b;s.s.sendNotification=s.original;delete globalThis.__arr02b;return {blocked:s.blocked,restored:s.s.sendNotification===s.original}})()"));inspector.ws.close();}
 await p.query("delete from vendor_bill_items where bill_id=any($1::int[])",[bills]);
 await p.query("delete from vendor_bills where id=any($1::int[])",[bills]);
 await p.query("delete from site_material_trips where id=any($1::int[])",[trips]);
 await p.query("delete from earthwork_arrangements where id=any($1::int[])",[arrs]);
 const devices=(await p.query("delete from user_devices where user_id=16 and not(id=any($1::int[])) returning id",[beforeDevices])).rows;
 await p.query("delete from user_sessions where user_id=16 and not(id=any($1::int[]))",[beforeSessions]);
 save("removed",{bills,arrangements:arrs,trips,devices});
 await p.end();
}
