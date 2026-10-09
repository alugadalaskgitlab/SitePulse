import fs from "node:fs/promises";
import pg from "pg";
import assert from "node:assert/strict";
export const dir = process.argv.includes("--recovery") ? "reports/user-perm-redesign03b-recovery" : "reports/user-perm-redesign03b";
export const privateDir = process.argv.includes("--recovery") ? "/tmp/permissions03b-recovery-private" : "/tmp/permissions03b-private";
export const base = "http://127.0.0.1:5000";
export const manifest = JSON.parse(await fs.readFile(`${dir}/disposable-manifest.json`, "utf8"));
export const saveManifest = () => fs.writeFile(`${dir}/disposable-manifest.json`, JSON.stringify(manifest, null, 2));
export async function developmentDb() {
  const config = await fs.readFile(".replit", "utf8");
  const db = new pg.Client({ connectionString: process.env.DEV_DATABASE_URL ??
    config.match(/^DEV_DATABASE_URL\s*=\s*"([^"]+)"/m)?.[1] });
  await db.connect();
  assert.equal((await db.query("select current_database() as name")).rows[0].name, "sitelog_dev");
  return db;
}
export async function api(cookies, path, method = "GET", data) {
  const r = await fetch(base + path, {
    method, headers: { "Content-Type": "application/json", Cookie: cookies.join("; "),
      "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36" },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  });
  for (const line of r.headers.getSetCookie()) {
    const c = line.split(";")[0], key = c.split("=")[0];
    const index = cookies.findIndex(v => v.startsWith(key + "="));
    if (index < 0) cookies.push(c); else cookies[index] = c;
  }
  const text = await r.text();
  let body; try { body = JSON.parse(text); } catch { body = text; }
  return { status: r.status, body };
}
export async function signIn(role, admin) {
  const file = `${privateDir}/${role}-session.json`;
  let cookies = [];
  try { cookies = JSON.parse(await fs.readFile(file, "utf8")); } catch {}
  if (role === "administrator" && !cookies.length)
    cookies = JSON.parse(await fs.readFile(`${privateDir}/cookies.json`, "utf8")).map(c => c.split(";")[0]);
  const login = () => api(cookies, "/api/auth/login", "POST", {
    identifier: manifest[role].email, password: process.env.DEV_VERIFICATION_PASSWORD,
  });
  let response = await login();
  if (response.status === 202 && admin) {
    const db = await developmentDb();
    try {
      const devices = (await db.query("select id from user_devices where user_id=$1 and status='pending'", [manifest[role].id])).rows;
      assert.equal(devices.length, 1);
      const approve = await api(admin, `/api/auth/devices/${devices[0].id}/approve`, "POST");
      assert.equal(approve.status, 200);
    } finally { await db.end(); }
    response = await login();
  }
  assert.equal(response.status, 200, `${role} ordinary login failed`);
  const me = await api(cookies, "/api/auth/me");
  assert.equal(me.body.user.id, manifest[role].id);
  await fs.writeFile(file, JSON.stringify(cookies), { mode: 0o600 });
  return cookies;
}
export const emptyMatrix = (matrix) => Object.fromEntries(Object.entries(matrix).map(([key, actions]) =>
  [key, Object.fromEntries(Object.keys(actions).map(a => [a, false]))]));
