import fs from "node:fs/promises";
import assert from "node:assert/strict";
import { connect, api, manifest, dir, privateDir, base } from "./permissions02c-browser.mjs";
const admin = JSON.parse(await fs.readFile(`${privateDir}/admin-session.json`, "utf8"));
const manager = JSON.parse(await fs.readFile(`${privateDir}/manager-session.json`, "utf8"));
const results = [];
const record = async (test, evidence) => {
  results.push({ test, evidence });
  await fs.writeFile(`${dir}/manager-results.json`, JSON.stringify(results, null, 2));
};
const b = await connect();
try {
  await b.cookies(manager);
  await b.send("Page.navigate", { url: base + "/admin/users" });
  await b.wait(`!!document.querySelector('[data-testid="button-perms-${manifest.subject.id}"]')`, 20000);
  await b.click(`[data-testid="button-perms-${manifest.subject.id}"]`);
  await b.wait(`!!document.querySelector('[data-testid="hierarchical-permissions-editor"]')`);
  assert.match(await b.evaluate(`document.querySelector('[role=dialog]').innerText`), /existing grants exceed your authority/i);
  assert.equal(await b.evaluate(`document.querySelector('[data-testid="button-save-perms"]').disabled`), true);
  await b.screenshot("14-manager-out-of-scope-preservation");
  await record("Partial manager cannot overwrite existing out-of-scope grants", { saveDisabled: true, preservationWarningShown: true });
  await b.textButton("Cancel");
  await b.click(`[data-testid="button-perms-${manifest.limitedTarget.id}"]`);
  await b.wait(`!!document.querySelector('[data-testid="hierarchical-permissions-editor"]')`);
  await b.fill('[aria-label="Search functions and actions"]', "DieselRequirements");
  await b.click(".authority-tree button");
  const allowed = 'input[aria-label="Diesel Requirements — View List — View"]';
  const forbidden = 'input[aria-label="Diesel Requirements (legacy) — View"]';
  assert.equal(await b.evaluate(`document.querySelector(${JSON.stringify(allowed)}).disabled`), false);
  assert.equal(await b.evaluate(`document.querySelector(${JSON.stringify(forbidden)}).disabled`), true);
  await b.click(allowed);
  await b.screenshot("15-manager-allowed-and-disabled-controls");
  await b.evaluate(`(()=>{[...document.querySelectorAll('.authority-editor button')].find(b=>/^Review \\d/.test(b.textContent)).click()})()`);
  await b.textButton("Confirm legacy change review"); await b.textButton("Save permissions");
  await b.wait(`!document.querySelector('[role=dialog]')`);
  const stored = (await api(admin, `/api/auth/users/${manifest.limitedTarget.id}/permissions`)).body.matrix;
  assert.equal(stored.diesel_req_view.view, true); assert.equal(stored.site_diesel.view, false);
  await record("Partial manager actual UI save within own grants", { allowedControlEnabled: true, outOfScopeControlDisabled: true, allowedViewPersisted: true, legacyViewRemainedOff: true });

  await b.cookies(admin); await b.send("Page.navigate", { url: base + "/admin/users" });
  await b.wait(`!!document.querySelector('[data-testid="button-perms-${manifest.administrator.id}"]')`, 20000);
  await b.click(`[data-testid="button-perms-${manifest.administrator.id}"]`);
  await b.wait(`!!document.querySelector('[data-testid="hierarchical-permissions-editor"]')`);
  assert.match(await b.evaluate(`document.querySelector('[role=dialog]').innerText`), /bypass/i);
  await b.screenshot("16-administrator-bypass-warning");
  await record("Administrator bypass is disclosed", { disposableAdministratorOnly: true, warningShown: true });
  await b.textButton("Cancel");
  await b.click(`[data-testid="button-perms-${manifest.subject.id}"]`);
  await b.wait(`!!document.querySelector('[data-testid="hierarchical-permissions-editor"]')`);
  for (const [id, name] of [
    ["SiteHub", "02b-site-operations-controls"], ["DieselRequirements", "03b-diesel-controls"],
    ["IrnListPage", "04b-irn-controls"], ["PurchaseIndents", "05b-purchase-indent-controls"],
    ["SiteMaterialTrips", "06b-material-trip-controls"], ["PlantMaintenance", "07b-maintenance-controls"],
    ["VendorBills", "08d-vendor-bill-controls"],
  ]) {
    await b.fill('[aria-label="Search functions and actions"]', id);
    await b.click(".authority-tree button");
    await b.evaluate(`document.querySelector('.authority-detail input[type=checkbox]').closest('.authority-action').scrollIntoView({block:'center',behavior:'instant'})`);
    await b.screenshot(name);
  }
  await b.textButton("Cancel");
  console.log("Restricted-manager UI, actual save and bypass warning verified");
} finally { b.close(); }
