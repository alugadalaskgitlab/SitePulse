import { expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { planDpr314Correction, saveDpr314Correction } from "../server/dpr314Correction";
import { auditLogs, progressEntries } from "../shared/schema";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import ts from "typescript";
import { calculateLengthFromChainage } from "../shared/dprGeometry";
import { normalizeExcavationMaterialOutcome } from "../shared/cutFillReconciliation";
import { hydrateCutFillConsumptions } from "../client/src/lib/cutFillLedger";

// Execute the actual production mapper, not a hand-maintained payload copy.
// Extracting just the pure function avoids mounting the entire routed editor.
function sourceFunction(path: string, name: string, dependencies: Record<string, any> = {}) {
  const source = ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const fn = source.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === name)!;
  const code = ts.transpileModule(fn.getText(source).replace("export function", "function"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return new Function(...Object.keys(dependencies), `${code}; return ${name};`)(...Object.values(dependencies));
}
const mapRealForm = sourceFunction("client/src/pages/SiteEdit.tsx", "mapDprToFormState", {
  calculateLengthFromChainage, normalizeExcavationMaterialOutcome, hydrateCutFillConsumptions,
  newEntryKey: () => "test-entry", newLabourRowKey: () => "test-labour",
  readLabourWorkerNames: sourceFunction("client/src/components/LabourWorkerNames.tsx", "readLabourWorkerNames"),
});

function hydratedFixture() {
  const { saved } = fixture();
  saved.progress[0].uom = "CUM";
  saved.equipment[0].entryType = null; // actual mapper supplies time_meter
  saved.labour = [{ id: 5, category: null, gender: null, count: 2, workerNames: ["Worker"] }];
  saved.materials = [{ id: 6, type: null, material: "Stone", quantity: "12.000", uom: "MT" }];
  saved.sitePurchases = [{ id: 7, itemDescription: "Consumable", amount: "50.00", quantity: "2.000" }];
  const form = mapRealForm(saved);
  // Match the dedicated SiteEdit POST body, which deliberately uses raw state.
  form.structureItems = [];
  form.baselineProgress = structuredClone(saved.progress);
  form.progress[0].chainageFrom = "1+100";
  form.progress[0].chainageTo = "1+200";
  form.progress[0].chainageOverrideReason = "Correct overlap";
  return { saved, form };
}

it("accepts actual hydrated/JSON-submitted SiteEdit rows with sticky session flags but unchanged facts", () => {
  const { saved, form } = hydratedFixture();
  expect(form.equipment[0].workAssignmentEdited).toBeUndefined();
  expect(form.equipment[0].isNew).toBeUndefined();
  // The assignment callback marks touched-then-cleared work as edited; draft
  // restoration retains it. No persisted assignment exists in this fixture.
  form.equipment[0].workAssignmentEdited = true;
  form.equipment[0].activitySegments = [];
  form.equipment[0].resourceScope = null;
  for (const section of ["equipment", "labour", "materials", "sitePurchases"]) form[section][0].isNew = true;
  const before = structuredClone(saved);
  expect(planDpr314Correction(saved, JSON.parse(JSON.stringify(form)), admin, confirmation)).toHaveLength(1);
  expect(saved).toEqual(before);
});
it.each(["boqItemId", "resourceScope", "structureId", "activitySegments"])("rejects actual assignment change %s in real mapped payload", field => {
  const { saved, form } = hydratedFixture();
  form.equipment[0].workAssignmentEdited = true;
  form.equipment[0][field] = field === "activitySegments"
    ? [{ startTime: "09:00", endTime: "10:00", boqItems: [{ boqItemId: 123 }] }]
    : field === "resourceScope" ? "general" : 123;
  expect(() => planDpr314Correction(saved, form, admin, confirmation)).toThrow(`equipment[0] (saved row 741)`);
});
it.each([["labour", "count"], ["materials", "quantity"], ["sitePurchases", "amount"], ["equipment", "plantUsageId"], ["equipment", "persistedId"]])(
  "rejects real mapped %s.%s changes even with session flags", (section, field) => {
    const { saved, form } = hydratedFixture();
    form[section][0][field] = 999;
    expect(() => planDpr314Correction(saved, form, admin, confirmation)).toThrow(field);
  },
);

const admin = { id: 2, isAdmin: true, fullName: "Test Administrator" };
const confirmation = { confirmed: true, equipmentLogId: 741, missingUsageId: 188, reason: "Correct overlapping chainages only" };
function fixture() {
  const saved: any = {
    id: 314, date: "2026-08-29", site: "TAKKADPALLY-SIRUR", engineer: "Test engineer",
    workType: "road", dprStatus: "submitted", boqProjectId: 1,
    equipment: [{ id: 741, machine: "JCB", plantUsageId: 188, openingReading: 18147.8, closingReading: 18154.3, dieselSource: "plant_stock" }],
    labour: [], materials: [], sitePurchases: [], structureItems: [],
    progress: [{ id: 99, activity: "Earthwork", side: "LHS", chainageFrom: "1+000", chainageTo: "1+100", quantity: 100, length: 100 }],
  };
  const form: any = {
    header: { date: saved.date, site: saved.site, engineer: saved.engineer, boqProjectId: 1 },
    workType: "road", structureItems: [], labour: [], materials: [], sitePurchases: [],
    equipment: saved.equipment.map(({ id, ...r }: any) => ({ ...r, persistedId: id })),
    baselineProgress: structuredClone(saved.progress),
    progress: saved.progress.map(({ id, ...r }: any) => ({
      ...r, persistedId: id, chainageFrom: "1+100", chainageTo: "1+200", chainageOverrideReason: "Corrected overlap",
    })),
  };
  return { saved, form };
}
it("accepts representative DPR 314 chainage correction without changing equipment", () => {
  const { saved, form } = fixture();
  const before = structuredClone(saved);
  expect(planDpr314Correction(saved, form, admin, confirmation)[0].patch.chainageFromKm).toBe(1.1);
  expect(saved).toEqual(before);
});
it.each(["plantUsageId", "closingReading", "diesel", "task"])("rejects equipment change %s", key => {
  const { saved, form } = fixture(); form.equipment[0][key] = 999;
  expect(() => planDpr314Correction(saved, form, admin, confirmation)).toThrow();
});
it("rejects non-Administrator and missing explicit confirmation", () => {
  const { saved, form } = fixture();
  expect(() => planDpr314Correction(saved, form, { id: 2, isAdmin: false }, confirmation)).toThrow("Administrator");
  expect(() => planDpr314Correction(saved, form, admin, { ...confirmation, confirmed: false })).toThrow("Confirm");
});
it("rejects unrelated header, row additions, other DPRs and stale progress", () => {
  for (const mutate of [
    (s: any, f: any) => { f.header.site = "OTHER"; },
    (s: any, f: any) => { f.labour.push({ category: "Skilled", count: 1 }); },
    (s: any) => { s.id = 316; },
    (s: any) => { s.progress[0].chainageTo = "9+000"; },
  ]) {
    const { saved, form } = fixture(); mutate(saved, form);
    expect(() => planDpr314Correction(saved, form, admin, confirmation)).toThrow();
  }
});
function transactionFixture() {
  const { saved, form } = fixture();
  const writes: any[] = [];
  const tx: any = {
    execute: vi.fn(async () => ({ rows: [{ missing: true, paid: true, no_allocations: true, no_segments: true }] })),
    query: { dprs: { findFirst: vi.fn(async () => structuredClone(saved)) } },
    update: vi.fn(table => ({ set: (value: any) => ({ where: async () => { writes.push({ table, value }); } }) })),
    insert: vi.fn(table => ({ values: async (value: any) => { writes.push({ table, value }); } })),
  };
  const database = { transaction: async (fn: any) => fn(tx) };
  return { saved, form, writes, tx, database };
}
it("writes only existing progress and audit; retains paid-bill identity and all operational records", async () => {
  const { form, writes, database, tx } = transactionFixture();
  const validate = vi.fn(async () => {});
  const result = await saveDpr314Correction(database, form, admin, confirmation, validate);
  expect(validate).toHaveBeenCalledOnce();
  expect(writes.map(w => w.table)).toEqual([progressEntries, auditLogs]);
  expect(writes[1].value).toMatchObject({ userId: 2, oldValues: { missingUsageId: 188, equipmentLogId: 741 }, newValues: { retainedMissingUsageId: 188 } });
  expect(result.equipment[0]).toMatchObject({ id: 741, plantUsageId: 188, closingReading: 18154.3 });
  expect(tx.update).toHaveBeenCalledOnce();
  expect(tx.insert).toHaveBeenCalledOnce();
});
it("normal overlap rejection prevents every write", async () => {
  const { form, writes, database } = transactionFixture();
  await expect(saveDpr314Correction(database, form, admin, confirmation, async () => { throw Error("overlap"); })).rejects.toThrow("overlap");
  expect(writes).toEqual([]);
});
it("normal DPR versioning and submitted finalizer paths remain wired", () => {
  const routes = readFileSync("server/routes.ts", "utf8");
  const client = readFileSync("client/src/pages/SiteEdit.tsx", "utf8");
  expect(routes).toContain('app.post("/api/dprs/:id/version"');
  expect(routes).toContain("await storage.createVersionDpr(");
  expect(client).toContain('Number(id) === 314 && isAdmin');
  expect(client).toContain('`/api/dprs/${id}/version`');
});

it("real PostgreSQL-compatible transaction preserves log/bill identities and rolls progress back if audit fails", async () => {
  const client = new PGlite();
  try {
    await client.exec(`
      CREATE TABLE boq_projects(id integer PRIMARY KEY);
      CREATE TABLE dprs(id integer PRIMARY KEY, boq_project_id integer);
      CREATE TABLE equipment_logs(id integer PRIMARY KEY,dpr_id integer,plant_usage_id integer,opening_reading real,closing_reading real);
      CREATE TABLE equipment_usage(id integer PRIMARY KEY,source_usage_id integer);
      CREATE TABLE vendor_bills(id integer PRIMARY KEY,status text);
      CREATE TABLE vendor_bill_items(id integer PRIMARY KEY,bill_id integer,source text,qty real,amount real);
      CREATE TABLE equipment_activity_allocations(equipment_log_id integer);
      CREATE TABLE equipment_activity_segments(equipment_log_id integer);
      CREATE TABLE progress_entries(id integer PRIMARY KEY,dpr_id integer,chainage_from text,chainage_to text,length real,quantity real,
        chainage_override_reason text,length_override_reason text,quantity_source text,quantity_source_note text,chainage_from_km real,chainage_to_km real,chainage_review_status text);
      CREATE TABLE audit_logs(id serial PRIMARY KEY,module text,transaction_id integer,action text,user_id integer,user_name text,user_role text,
        old_values jsonb,new_values jsonb,reason text,stock_impact text,created_at timestamp DEFAULT now());
      INSERT INTO boq_projects VALUES(1);
      INSERT INTO dprs VALUES(314,1);
      INSERT INTO equipment_logs VALUES(741,314,188,18147.8,18154.3);
      INSERT INTO vendor_bills VALUES(48,'paid');
      INSERT INTO vendor_bill_items VALUES(438,48,'auto:dpr_equipment:741',6.5,5850);
      INSERT INTO progress_entries(id,dpr_id,chainage_from,chainage_to,length,quantity) VALUES(99,314,'1+000','1+100',100,100);
    `);
    const { saved, form } = fixture();
    const real = drizzle(client);
    const database = {
      transaction: (fn: any) => real.transaction(async tx => {
        // The fixture's relational read has the same shape as the real reader.
        // SQL locks, guards, UPDATE, INSERT and rollback all run in PGlite.
        (tx as any).query = { dprs: { findFirst: async () => structuredClone(saved) } };
        return fn(tx);
      }),
    };
    const before = await client.query("SELECT row_to_json(e) AS row FROM equipment_logs e");
    const paid = await client.query("SELECT row_to_json(i) AS row FROM vendor_bill_items i");
    await saveDpr314Correction(database, form, admin, confirmation, async () => {});
    expect((await client.query("SELECT row_to_json(e) AS row FROM equipment_logs e")).rows).toEqual(before.rows);
    expect((await client.query("SELECT row_to_json(i) AS row FROM vendor_bill_items i")).rows).toEqual(paid.rows);
    expect((await client.query("SELECT status FROM vendor_bills")).rows).toEqual([{ status: "paid" }]);
    expect((await client.query("SELECT count(*)::int AS n FROM equipment_usage")).rows).toEqual([{ n: 0 }]);
    expect((await client.query("SELECT created_at IS NOT NULL AS stamped FROM audit_logs")).rows).toEqual([{ stamped: true }]);
    await client.exec("ALTER TABLE audit_logs ADD CONSTRAINT fail_audit CHECK (false) NOT VALID");
    const committed = (await client.query("SELECT row_to_json(p) AS row FROM progress_entries p")).rows;
    form.progress[0].chainageTo = "1+300";
    await expect(saveDpr314Correction(database, form, admin, confirmation, async () => {})).rejects.toThrow();
    expect((await client.query("SELECT row_to_json(p) AS row FROM progress_entries p")).rows).toEqual(committed);
  } finally {
    await client.close();
  }
}, 30000);
