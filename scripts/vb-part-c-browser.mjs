import fs from "node:fs/promises";
import assert from "node:assert/strict";
import { navigate, evaluate, input, click, call, pause, close } from "./vb02-browser.mjs";

const out = ".agents/outputs/vb-export-02-c";
const baseline = JSON.parse(await fs.readFile(`${out}/narasimhulu-before.json`, "utf8"));
const cardPath = "/api/vendor-rate-cards?vendorName=NARASIMHULU";
const cards = () => evaluate(`fetch(${JSON.stringify(cardPath)}).then(r=>r.json())`);
const shot = async name => fs.writeFile(`${out}/${name}.png`,
  Buffer.from((await call("Page.captureScreenshot", { format: "png" })).data, "base64"));
const readDialog = () => evaluate(`({
  rate:document.querySelector('#transport-rate-km').value,
  lead:document.querySelector('#transport-lead').value,
  payload:document.querySelector('#transport-payload').value,
  trip:document.querySelector('[data-testid="transport-per-trip"]').textContent,
  perMT:document.querySelector('[data-testid="transport-per-mt"]').textContent,
  twoWay:document.querySelector('[data-testid="transport-two-way"]').textContent,
  saveDisabled:document.querySelector('button[type="submit"]').disabled,
  text:document.querySelector('[role="dialog"]').textContent
})`);
const stripBasis = ({ leadDistanceKm, payloadMt, ratePerKm, ...row }) => row;
const button = 'button[aria-label="Rate setup for DUST - TRANSPORT"]';
const result = { states: {}, existingCardsUnchanged: false, cleanup: false };
let createdId;
try {
  await navigate("/plant/rate-cards?vendorName=NARASIMHULU");
  const initial = await cards();
  assert.deepEqual(initial.map(stripBasis), baseline);
  assert(initial.every(c => c.leadDistanceKm === null && c.payloadMt === null && c.ratePerKm === null));
  assert(!initial.some(c => c.itemKey === "EQ_DUST_TRIP" && c.category === "transport"));
  await shot("narasimhulu-after");
  await evaluate(`document.querySelector(${JSON.stringify(button)})?.scrollIntoView({block:'center'})`);
  await shot("narasimhulu-transport-after-null");
  await click(button);
  assert.equal((await readDialog()).payload, "30");
  await input("#transport-rate-km", "950");
  await input("#transport-lead", "12");
  let state = await readDialog();
  assert.equal(state.twoWay, "24 km");
  assert.equal(state.trip, "₹22,800");
  assert.equal(state.perMT, "₹760");
  result.states.example = state;
  await shot("rate-setup-950-12-30");
  await input("#transport-payload", "0");
  state = await readDialog();
  assert.equal(state.perMT, "");
  assert.equal(state.saveDisabled, true);
  assert(state.text.includes("Payload required for ₹/MT"));
  result.states.payloadZero = state;
  await shot("rate-setup-payload-zero");
  await input("#transport-payload", "30");
  await input("#transport-lead", "0");
  state = await readDialog();
  assert.equal(state.trip, "");
  assert.equal(state.perMT, "");
  result.states.leadZero = state;
  await shot("rate-setup-lead-zero");
  await input("#transport-lead", "12");
  await click('button[type="submit"]');
  await pause(1200);
  const afterSave = await cards();
  const created = afterSave.find(c => c.itemKey === "EQ_DUST_TRIP" && c.category === "transport");
  assert(created && !baseline.some(c => c.id === created.id));
  createdId = created.id;
  result.createdCard = created;
  assert.equal(created.rate, 0);
  assert.equal(created.ratePerKm, 950);
  assert.equal(created.leadDistanceKm, 12);
  assert.equal(created.payloadMt, 30);
  await evaluate(`document.querySelector(${JSON.stringify(button)})?.scrollIntoView({block:'center'})`);
  await shot("rate-setup-saved-row");
  await navigate("/plant/rate-cards?vendorName=NARASIMHULU");
  await click(button);
  state = await readDialog();
  assert.deepEqual([state.rate, state.lead, state.payload], ["950", "12", "30"]);
  result.states.reopened = state;
  await shot("rate-setup-reopened");
} finally {
  if (createdId) {
    const deleted = await evaluate(`fetch('/api/vendor-rate-cards/${createdId}',{method:'DELETE'}).then(r=>r.ok)`);
    assert.equal(deleted, true);
    result.cleanup = true;
  }
  const final = await cards();
  assert.deepEqual(final.map(stripBasis), baseline);
  assert(final.every(c => c.leadDistanceKm === null && c.payloadMt === null && c.ratePerKm === null));
  result.existingCardsUnchanged = true;
  await fs.writeFile(`${out}/narasimhulu-after.json`, JSON.stringify(final, null, 2));
  await fs.writeFile(`${out}/browser-verification.json`, JSON.stringify(result, null, 2));
  await navigate("/plant/rate-cards?vendorName=NARASIMHULU");
  close();
}
console.log({ passed: true, ...result, states: Object.keys(result.states) });