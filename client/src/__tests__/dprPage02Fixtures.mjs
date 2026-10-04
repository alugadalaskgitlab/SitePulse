import fs from "node:fs/promises";
import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { db, go, api, save, close, out, statePath } from "./dprPage02Browser.mjs";
const pool = await db();
const tables = ["sites", "boq_projects", "boq_items", "dprs", "progress_entries", "labour_logs", "equipment_master", "equipment_logs", "equipment_maintenance_logs", "site_material_trips", "material_logs", "site_purchases", "plant_stock_ledger", "plant_stock_balances"];
const fingerprint = rows => createHash("sha256").update(JSON.stringify(rows)).digest("hex");
try {
  if (process.argv[2] === "cleanup") {
    const auth = JSON.parse(await fs.readFile(statePath));
    const { created } = JSON.parse(await fs.readFile(`${out}/seed.json`));
    const before = JSON.parse(await fs.readFile(`${out}/before.json`));
    await pool.query("BEGIN");
    for (const table of ["equipment_maintenance_logs", "site_purchases", "material_logs", "site_material_trips", "labour_logs", "equipment_logs", "progress_entries", "dprs", "equipment_master", "boq_items", "boq_projects", "sites"]) {
      if (created[table]?.length) await pool.query(`delete from ${table} where id=ANY($1::int[])`, [created[table]]);
    }
    await pool.query("update user_sessions set logged_out_at=now() where user_id=$1", [auth.userId]);
    await pool.query("update user_devices set status='revoked' where user_id=$1", [auth.userId]);
    await pool.query("update users set is_active=false,is_admin=false where id=$1", [auth.userId]);
    await pool.query("COMMIT");
    const comparison = {}, remaining = {};
    for (const [table, previous] of Object.entries(before)) {
      const { rows } = await pool.query(`select * from ${table} where id=ANY($1::int[]) order by id`, [previous.ids]);
      comparison[table] = fingerprint(rows) === previous.hash;
      if (created[table]?.length) remaining[table] = Number((await pool.query(`select count(*) from ${table} where id=ANY($1::int[])`, [created[table]])).rows[0].count);
    }
    const user = (await pool.query("select id,is_active,is_admin from users where id=$1", [auth.userId])).rows[0];
    const devices = (await pool.query("select id,status from user_devices where user_id=$1", [auth.userId])).rows;
    const sessions = (await pool.query("select count(*) from user_sessions where user_id=$1 and logged_out_at is null", [auth.userId])).rows[0].count;
    await save("cleanup", { database: "sitelog_dev", existingBusinessRowsUnchanged: comparison, remainingInsertedRows: remaining, testUser: user, devices, activeSessions: Number(sessions), credentialsRemoved: true });
    await fs.rm(statePath);
    console.log("Fixtures removed; fingerprints", comparison);
  } else {
    const schema = (await pool.query("select column_name,data_type,is_nullable from information_schema.columns where table_name='equipment_maintenance_logs' order by ordinal_position")).rows;
    await save("stoppage-schema", schema);
    const before = {};
    for (const table of tables) {
      if (!(await pool.query("select to_regclass($1) as name", [table])).rows[0].name) continue;
      const { rows } = await pool.query(`select * from ${table} order by id`);
      before[table] = { ids: rows.map(row => row.id), hash: fingerprint(rows) };
    }
    await save("before", before);
    const identifier = `dpr-page02-${randomBytes(8).toString("hex")}@example.invalid`;
    const password = randomBytes(30).toString("base64url");
    const hash = await bcrypt.hash(password, 12);
    const user = (await pool.query("insert into users(email,password_hash,full_name,is_active,is_admin,notifications_enabled) values($1,$2,$3,true,true,false) returning id", [identifier, hash, "DPR Page 02 Development Verification"])).rows[0];
    await fs.writeFile(statePath, JSON.stringify({ userId: user.id, identifier, password }), { mode: 0o600 });
    await go("/login");
    const first = await api("/api/auth/login", { identifier, password });
    if (first.status !== 202) throw new Error(`Expected pending device: ${first.status}`);
    const devices = (await pool.query("update user_devices set status='approved',approved_at=now() where user_id=$1 and status='pending' returning id,status", [user.id])).rows;
    if (devices.length !== 1) throw new Error("Unexpected device count");
    const second = await api("/api/auth/login", { identifier, password });
    if (second.status !== 200 || second.body.status !== "ok") throw new Error("Normal login failed");
    await save("auth-evidence", { database: "sitelog_dev", userId: user.id, firstStatus: first.status, secondStatus: second.status, devices, authBypass: false });
    const created = {}, cases = {};
    const insert = async (table, values) => {
      const keys = Object.keys(values);
      const row = (await pool.query(`insert into ${table}(${keys.join(",")}) values(${keys.map((_, i) => `$${i + 1}`).join(",")}) returning *`, Object.values(values))).rows[0];
      (created[table] ??= []).push(row.id); return row;
    };
    await pool.query("BEGIN");
    try {
      const site = await insert("sites", { name: `DPR PAGE 02 · Development ${randomBytes(3).toString("hex")}` });
      const project = await insert("boq_projects", { name: site.name, site_id: site.id, status: "active" });
      const activities = [["WMM", 56.25, "Cum"], ["Clearing", .5, "Ha"], ["Marking", 250, "m"]];
      const items = [];
      for (const [name, , unit] of activities) items.push(await insert("boq_items", { boq_project_id: project.id, description: name, item_name: name, unit, boq_qty: 1000, current_qty: 1000 }));
      const masters = [];
      for (const name of ["Roller", "Grader", "Excavator", "Water tanker"]) masters.push(await insert("equipment_master", { name, meter_type: "hour_meter", ownership: "hired", vendor_name: "Development contractor", is_active: 1 }));
      for (const [n, label] of ["AllWorked", "FullBreakdown", "PartDay", "TwoIdle", "Mixed", "Unknown"].entries()) {
        const date = `2026-11-${10 + n}`;
        const dpr = await insert("dprs", { site: site.name, date, engineer: "Development verification", role: "engineer", dpr_status: "submitted", submitted_at: `${date}T18:00:00Z`, boq_project_id: project.id, author_user_id: user.id, work_type: "road", remarks: "Physical quantities only. Development verification." });
        cases[label] = dpr.id;
        for (let i = 0; i < activities.length; i++) {
          const [activity, quantity, uom] = activities[i];
          await insert("progress_entries", { dpr_id: dpr.id, activity, quantity, uom, boq_item_id: items[i].id, quantity_source: "measured" });
        }
        const machineCount = label === "TwoIdle" ? 2 : label === "Unknown" ? 1 : 4;
        for (let i = 0; i < machineCount; i++) {
          const usageStatus = label === "FullBreakdown" && i === 0 ? "breakdown" : label === "TwoIdle" ? (i ? "idle_no_operator" : "idle_no_work") : label === "Unknown" ? null : "working";
          const log = await insert("equipment_logs", { dpr_id: dpr.id, machine: masters[i].name, equipment_id: masters[i].id, operator: "Development operator", hours_worked: usageStatus === "working" ? 6.5 : 0, diesel: i === 0 ? 2 : 0, diesel_source: "contractor", usage_status: usageStatus, usage_status_reason: usageStatus === "breakdown" ? "Hydraulic leak" : label === "TwoIdle" ? "No task / operator" : null, ...(label === "Mixed" && i === 3 ? { water_quantity: 4000 } : {}) });
          if ((label === "PartDay" || label === "FullBreakdown") && i === 0) await insert("equipment_maintenance_logs", { date, equipment_id: masters[i].id, event_type: "breakdown", description: "Hydraulic repair", downtime_hours: label === "PartDay" ? 1.5 : 8, from_time: "10:00", to_time: label === "PartDay" ? "11:30" : "18:00", source_type: "dpr_log", source_record_id: log.id, responsibility: "vendor", repair_scope: "vendor", status: "resolved" });
        }
        await insert("labour_logs", { dpr_id: dpr.id, contractor: "Development gang", category: "Skilled", count: 7 });
        for (const [material, trips, total, uom] of (label === "Mixed" ? [["WMM", 1, 12, "MT"]] : [["WMM", 5, 141.03, "MT"], ["Soil", 3, 60, "MT"]])) {
          for (let i = 0; i < trips; i++) await insert("site_material_trips", { date, site: site.name, material, quantity: total / trips, uom, supplier: "Development supplier", unloaded_at: "stretch", boq_project_id: project.id });
        }
        if (label === "Mixed") {
          await insert("material_logs", { dpr_id: dpr.id, type: "Received", material: "WMM", quantity: 8, uom: "MT" });
          await insert("site_purchases", { dpr_id: dpr.id, item_description: "Safety gloves", vendor: "Development vendor", quantity: 6, uom: "Pairs", amount: 987654.32 });
        }
      }
      await pool.query("COMMIT");
      await save("seed", { created, cases, site: site.name });
      console.log("Development fixtures seeded", cases);
    } catch (error) { await pool.query("ROLLBACK"); throw error; }
  }
} finally { await pool.end(); await close(); }