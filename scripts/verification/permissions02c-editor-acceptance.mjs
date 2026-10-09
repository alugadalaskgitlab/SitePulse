import fs from "node:fs/promises";
import assert from "node:assert/strict";
import { connect, api, manifest, dir, privateDir } from "./permissions02c-browser.mjs";
const cookies = JSON.parse(await fs.readFile(`${privateDir}/admin-session.json`, "utf8"));
const results = [];
const record = async (test, evidence) => {
  results.push({ test, evidence });
  await fs.writeFile(`${dir}/editor-results.json`, JSON.stringify(results, null, 2));
};
const b = await connect();
const subject = manifest.subject.id;
const read = () => api(cookies, `/api/auth/users/${subject}/permissions`);
async function selectNode(id) {
  await b.fill('[aria-label="Search functions and actions"]', id);
  await b.wait(`!!document.querySelector('.authority-tree button')`);
  await b.click(".authority-tree button");
  await b.wait(`document.querySelector('.authority-detail')?.innerText.includes(${JSON.stringify(id + " ·")})`);
  await b.evaluate(`document.querySelector('.authority-detail h3').scrollIntoView({block:'center',behavior:'instant'})`);
}
async function open() {
  await b.click(`[data-testid="button-perms-${subject}"]`);
  await b.wait(`!!document.querySelector('[data-testid="hierarchical-permissions-editor"]')`);
}
async function check(label) {
  await b.click(`input[aria-label="${label}"]`);
}
async function save() {
  await b.evaluate(`(()=>{const x=[...document.querySelectorAll('.authority-editor button')].find(b=>/^Review \\d/.test(b.textContent));x.click()})()`);
  await b.textButton("Confirm legacy change review");
  await b.screenshot("09-reviewed-save");
  await b.textButton("Save permissions");
  await b.wait(`!document.querySelector('[role="dialog"]')`);
  assert.match(await b.evaluate("document.body.innerText"), /Existing permissions saved/);
}
try {
  if (!(await b.evaluate(`!!document.querySelector('[data-testid="hierarchical-permissions-editor"]')`))) await open();
  for (const [id, name] of [
    ["SiteHub", "02-site-operations"], ["DieselRequirements", "03-diesel-requirements"],
    ["IrnListPage", "04-irns"], ["PurchaseIndents", "05-purchase-indents"],
    ["SiteMaterialTrips", "06-material-trips"], ["PlantMaintenance", "07-equipment-maintenance"],
    ["VendorBills", "08-vendor-bills"],
  ]) {
    await selectNode(id);
    await b.screenshot(name);
    await record(`Signed-in module: ${id}`, { screenshot: `screenshots/${name}.png` });
  }
  const before = (await read()).body;
  await selectNode("DieselRequirements");
  await check("Diesel Requirements — View List — View");
  assert.equal((await read()).body.matrix.diesel_req_view.view, true);
  await b.evaluate(`(()=>{const x=[...document.querySelectorAll('.authority-detail .authority-action')].find(x=>x.innerText.includes('Still allowed on compatible OR paths'));if(!x)throw Error('Missing legacy alternative explanation');x.scrollIntoView({block:'center',behavior:'instant'})})()`);
  await b.screenshot("08b-legacy-alternative");
  await record("Editing does not save; legacy alternative disclosed", { storedBeforeSave: true, staged: false, alternative: "site_diesel.view" });

  const selects = await b.evaluate(`[...document.querySelectorAll('.authority-detail select')].map(e=>e.getAttribute('aria-label'))`);
  assert.ok(selects.length >= 3);
  await b.fill(`select[aria-label="${selects[0]}"]`, "allow");
  await b.fill(`select[aria-label="${selects[1]}"]`, "deny");
  await b.fill(`select[aria-label="${selects[2]}"]`, "allow");
  await b.fill(`select[aria-label="${selects[2]}"]`, "inherit");
  await b.evaluate(`document.querySelector('.authority-detail select').scrollIntoView({block:'center',behavior:'instant'})`);
  await b.screenshot("08c-proposed-preview-only");
  assert.match(await b.evaluate("document.querySelector('.authority-detail').innerText"), /simulation only; backend unchanged/);
  assert.deepEqual((await read()).body, before);
  await save();
  const after = (await read()).body;
  assert.equal(after.matrix.diesel_req_view.view, false);
  assert.equal(after.matrix.site_diesel.view, true);
  const puts = b.events.filter(e => e.method === "Network.requestWillBeSent" &&
    e.params.request.method === "PUT" && e.params.request.url.endsWith(`/users/${subject}/permissions`));
  assert.equal(puts.length, 1);
  const payload = JSON.parse(puts[0].params.request.postData);
  assert.deepEqual(payload, after.matrix);
  await record("Real UI save → API read-back", {
    status: 200, diesel_req_view: false, site_diesel: true,
    payloadOnlyLegacyMatrix: true, proposedOverridesExcluded: true,
    readBackRequests: b.events.filter(e => e.method === "Network.requestWillBeSent" &&
      e.params.request.method === "GET" && e.params.request.url.endsWith(`/users/${subject}/permissions`)).length,
  });
  await open(); await selectNode("DieselRequirements");
  assert.equal(await b.evaluate(`document.querySelector('input[aria-label="Diesel Requirements — View List — View"]').checked`), false);
  assert.ok((await b.evaluate(`[...document.querySelectorAll('.authority-detail select')].map(e=>e.value)`)).every(v => v === "inherit"));
  await b.screenshot("10-reopened-persistence");
  await record("Reopened persistence and preview reset", { legacyOffPersisted: true, previewsAllInherit: true });
  await check("Diesel Requirements — View List — View");
  await b.textButton("Cancel");
  await b.wait(`!document.querySelector('[role="dialog"]')`);
  assert.deepEqual((await read()).body, after);
  await open(); await selectNode("DieselRequirements");
  assert.equal(await b.evaluate(`document.querySelector('input[aria-label="Diesel Requirements — View List — View"]').checked`), false);
  await record("Cancel/discard", { confirmedDiscard: true, databaseUnchanged: true, reopenedOff: true });
  await b.click('[data-testid="select-role-template"]');
  await b.click('[data-testid="template-site_engineer"]');
  await b.wait(`!!document.querySelector('[data-testid="role-change-preview"]')`);
  assert.deepEqual((await read()).body, after);
  await b.screenshot("11-template-preview-unsaved");
  console.log("Role action buttons", await b.evaluate(`[...document.querySelectorAll('[data-testid="role-change-preview"] button')].map(e=>({text:e.textContent,id:e.getAttribute('data-testid')}))`));
  await record("Template selection is preview only", { databaseUnchanged: true, role: "site_engineer" });
} finally {
  b.close();
}
