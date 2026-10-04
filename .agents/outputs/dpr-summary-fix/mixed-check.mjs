import fs from "node:fs/promises";
import assert from "node:assert/strict";
import {go,evaluate,call,shot,sleep,save,close,out} from "./browser.mjs";
const {cases}=JSON.parse(await fs.readFile(`${out}/seed.json`));
try {
  await call("Emulation.setDeviceMetricsOverride",{width:1280,height:1100,deviceScaleFactor:1,mobile:false});
  await go(`/site/report/${cases.Mixed}`);await sleep(4000);
  const text=await evaluate('document.querySelector(".dpr-management").innerText');
  assert(text.includes("WMM 20 MT (1 trips)"));
  assert(text.includes("Water 4,000 LITERS (0 trips)"));
  assert(text.includes("Safety gloves")&&text.includes("Development vendor")&&text.includes("6 Pairs"));
  assert(!text.includes("₹")&&!text.includes("987654")&&!text.includes("9,87,654"));
  const tableTrips=await evaluate('[...document.querySelectorAll(\'table[aria-label="Materials received"] td[data-label="Trips"]\')].reduce((a,e)=>a+Number(e.innerText),0)');
  assert.equal(tableTrips,1);
  await shot("mixed-sources-no-money",true);
  await call("Emulation.setEmulatedMedia",{media:"print"});
  await shot("mixed-sources-no-money-print",true);
  await save("mixed-evidence",{passed:true,tableTrips,text});
  await call("Emulation.setEmulatedMedia",{media:"screen"});
  console.log("Mixed trip/DPR/equipment receipts and amount-bearing purchases verified in signed-in app.");
}finally{await close();}