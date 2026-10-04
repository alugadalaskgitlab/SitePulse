import fs from "node:fs/promises";
import assert from "node:assert/strict";
import * as xlsx from "xlsx";

// Session credentials stay in private /tmp files, never in evidence or logs.
const admin = JSON.parse(await fs.readFile("/tmp/vb-export-production-auth.json", "utf8"));
const accounts = JSON.parse(await fs.readFile("/tmp/vb-export-production-test-accounts.json", "utf8"));
const bills = JSON.parse(await fs.readFile("/tmp/vb-export-production-bills.json", "utf8"));
const results = { environment: "production", url: admin.base, generatedAt: new Date().toISOString(), checks: [], cleanup: [] };
const headers = actor => ({ "Content-Type": "application/json", Cookie: actor.cookies.join("; "), "User-Agent": actor.userAgent });
const request = (actor, path, options = {}) => fetch(admin.base + path, { ...options, headers: headers(actor) });
async function status(actor, path, expected) {
  const r = await request(actor, path);
  results.checks.push({ account: actor.name, path, expected, actual: r.status });
  return r;
}
function billNumbers(buffer, format) {
  const book = xlsx.read(buffer, { type: "buffer" });
  const sheet = format === "xlsx" ? book.Sheets.Detail : book.Sheets[book.SheetNames[0]];
  assert.ok(sheet);
  const rows = xlsx.utils.sheet_to_json(sheet, { header: 1 });
  const start = rows.findIndex(row => row[0] === "Bill No");
  assert.ok(start >= 0);
  return rows.slice(start + 1).filter(row => row[0] && !["TOTAL", "—"].includes(row[0])).map(row => String(row[0])).sort();
}
try {
  for (const actor of accounts) {
    const r = await request(actor, "/api/auth/login", { method: "POST", body: JSON.stringify({ identifier: actor.email, password: actor.password }) });
    assert.equal(r.status, 200, `${actor.name} login`);
    const data = await r.json();
    assert.equal(data.user.isAdmin, false);
    assert.equal(data.user.isOwner, false);
    for (const s of r.headers.getSetCookie()) {
      const v = s.split(";")[0];
      actor.cookies = actor.cookies.filter(c => c.split("=")[0] !== v.split("=")[0]);
      actor.cookies.push(v);
    }
    results.checks.push({ account: actor.name, signedIn: true, admin: false, owner: false });
  }
  const denied = accounts.find(a => a.name === "ZZ-TEST-NO-REPORTS");
  const restricted = accounts.find(a => a.name === "ZZ-TEST-SITE-ONLY");
  const change = await request(admin, `/api/auth/users/${restricted.id}/site-access`, {
    method: "PUT", body: JSON.stringify({ allSites: false, siteIds: [18] }),
  });
  assert.equal(change.status, 200);
  const expected = bills.filter(b => b.siteId === 18 || (b.siteId == null && b.items.length > 0 &&
    b.items.every(i => i.siteName === "SITE: TAKKADPALLY-SIRUR")));
  const excluded = bills.filter(b => !expected.some(e => e.id === b.id));
  assert.ok(expected.length > 0 && excluded.length > 0);
  results.scope = { siteId: 18, site: "TAKKADPALLY-SIRUR", administratorBillCount: bills.length,
    permittedBillCount: expected.length, excludedBillCount: excluded.length };
  for (const format of ["csv", "xlsx"]) {
    await status(denied, `/api/vendor-bills/export?format=${format}`, 403);
    for (const filter of ["", "&siteId=18"]) {
      const r = await status(restricted, `/api/vendor-bills/export?format=${format}${filter}`, 200);
      const numbers = billNumbers(Buffer.from(await r.arrayBuffer()), format);
      const exactPermittedBillSet = JSON.stringify(numbers) === JSON.stringify(expected.map(b => b.billNo).sort());
      results.checks.push({ format, selectedSite: !!filter, exactPermittedBillSet, rows: numbers.length,
        expectedRows: expected.length, unauthorizedRows: numbers.filter(n => !expected.some(b => b.billNo === n)).length });
    }
    await status(restricted, `/api/vendor-bills/export?format=${format}&siteId=14`, 403);
  }
  await status(denied, `/api/vendor-bills/${expected[0].id}/pdf`, 403);
  const pdf = await status(restricted, `/api/vendor-bills/${expected[0].id}/pdf`, 200);
  assert.equal(Buffer.from(await pdf.arrayBuffer()).subarray(0, 5).toString(), "%PDF-");
  await status(restricted, `/api/vendor-bills/${excluded[0].id}/pdf`, 403);
  const list = await (await status(restricted, "/api/vendor-bills", 200)).json();
  assert.deepEqual(list.map(b => b.id).sort((a, b) => a - b), expected.map(b => b.id).sort((a, b) => a - b));
  results.passed = results.checks.every(c =>
    (c.expected === undefined || c.expected === c.actual) && c.exactPermittedBillSet !== false);
  if (!results.passed) process.exitCode = 1;
} catch (error) {
  results.passed = false;
  results.error = error.message;
  process.exitCode = 1;
} finally {
  for (const actor of accounts) {
    const r = await request(admin, `/api/auth/users/${actor.id}`, { method: "PATCH", body: JSON.stringify({ isActive: false }) });
    results.cleanup.push({ account: actor.name, deactivationStatus: r.status });
    if (!r.ok) process.exitCode = 1;
  }
  const devicesResponse = await request(admin, "/api/auth/devices");
  if (devicesResponse.ok) {
    for (const device of (await devicesResponse.json()).filter(d => accounts.some(a => a.id === d.userId))) {
      const r = await request(admin, `/api/auth/devices/${device.id}/revoke`, { method: "POST" });
      results.cleanup.push({ deviceId: device.id, revokeStatus: r.status });
      if (!r.ok) process.exitCode = 1;
    }
  } else process.exitCode = 1;
  const users = await request(admin, "/api/auth/users");
  if (users.ok) {
    const selected = (await users.json()).filter(u => accounts.some(a => a.id === u.id));
    results.finalAccounts = selected.map(u => ({ name: u.fullName, active: u.isActive, admin: u.isAdmin }));
    if (selected.length !== 2 || selected.some(u => u.isActive)) process.exitCode = 1;
  } else process.exitCode = 1;
  await fs.mkdir(".agents/outputs/vb-export-verification", { recursive: true });
  await fs.writeFile(".agents/outputs/vb-export-verification/production-signed-in-results.json", JSON.stringify(results, null, 2));
  await fs.writeFile("/tmp/vb-export-production-test-accounts.json", JSON.stringify(accounts), { mode: 0o600 });
  console.log(JSON.stringify(results, null, 2));
}