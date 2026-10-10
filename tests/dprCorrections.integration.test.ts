import { afterAll, beforeAll, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { is, SQL, eq } from "drizzle-orm";
import { getTableConfig, PgDialect, PgTable } from "drizzle-orm/pg-core";
import * as schema from "../shared/schema";
import { dprCorrectionService } from "../server/dprCorrections";
import { planDprCorrection } from "../server/dprCorrectionPlan";
import ts from "typescript";
import { readFileSync } from "node:fs";
import { calculateLengthFromChainage } from "../shared/dprGeometry";
import { normalizeExcavationMaterialOutcome } from "../shared/cutFillReconciliation";
import { hydrateCutFillConsumptions } from "../client/src/lib/cutFillLedger";
let pg: PGlite, db: any, service: ReturnType<typeof dprCorrectionService>;
const author = { id: 1, fullName: "Fixture Author" };
const admin = { id: 2, isAdmin: true, fullName: "Fixture Reviewer" };
let serial = 900;
beforeAll(async () => {
  pg = new PGlite();
  const dialect = new PgDialect();
  for (const table of Object.values(schema).filter(v => is(v, PgTable)) as PgTable[]) {
    const config = getTableConfig(table);
    const columns = config.columns.map(c => {
      let text = `"${c.name}" ${c.getSQLType()}`;
      if (c.primary) text += " PRIMARY KEY";
      if (c.notNull) text += " NOT NULL";
      if (c.default !== undefined) {
        const d = c.default;
        text += " DEFAULT " + (is(d, SQL) ? dialect.sqlToQuery(d).sql : Array.isArray(d) && c.getSQLType().endsWith("[]") ? "'{}'"
          : typeof d === "string" ? `'${d.replaceAll("'", "''")}'` : typeof d === "object" ? `'${JSON.stringify(d)}'` : String(d));
      }
      return text;
    });
    await pg.exec(`CREATE TABLE "${config.name}" (${columns.join(",")})`);
  }
  db = drizzle(pg, { schema });
  service = dprCorrectionService(db, async () => {});
}, 60000);
afterAll(async () => pg?.close());

async function fixture() {
  const id = ++serial;
  await db.insert(schema.dprs).values({ id, site: "FIXTURE SITE", date: "2026-08-29", engineer: "FIXTURE", workType: "road", dprStatus: "submitted" });
  const [p] = await db.insert(schema.progressEntries).values({
    dprId: id, activity: "Earthwork", side: "LHS", chainageFrom: "1+000", chainageTo: "1+100", length: 100, quantity: 100, uom: "CUM",
  }).returning();
  const [e] = await db.insert(schema.equipmentLogs).values({
    dprId: id, machine: "FIXTURE MACHINE", plantUsageId: 188, openingReading: 18147.8, closingReading: 18154.3, hoursWorked: 6.5,
    startTime: null, endTime: null, openingDiesel: null, dieselBalanceInTank: null, diesel: 20, dieselSource: "plant_stock",
  }).returning();
  const dpr = await db.query.dprs.findFirst({ where: eq(schema.dprs.id, id) });
  const { correctionFields } = await import("../server/dprCorrectionPlan");
  const mapped = (row: any, section: string) => Object.fromEntries(correctionFields[section].map(k => [k, row[k]]));
  const form: any = {
    header: mapped(dpr, "header"), workType: "road", structureItems: [], labour: [], materials: [], sitePurchases: [],
    progress: [{ ...mapped(p, "progress"), persistedId: p.id, chainageFrom: "1+100", chainageTo: "1+200", chainageOverrideReason: "Site register correction" }],
    equipment: [{ ...mapped(e, "equipment"), persistedId: e.id, workAssignmentEdited: true }],
  };
  return { id, p, e, form };
}
const submit = async (f: any, actor = author) => {
  const review = await service.preview(f.id, f.form, actor);
  expect(review.blocked).toEqual([]);
  return service.submit(f.id, { form: f.form, baseHash: review.baseHash, reason: "Correct from site register", confirmImpact: true }, actor);
};
it("saves chainage-only on any submitted DPR and preserves missing usage, tanks and equipment identity", async () => {
  const f = await fixture();
  const result = await submit(f);
  expect(result.id).toBe(f.id);
  const [row] = await db.select().from(schema.equipmentLogs).where(eq(schema.equipmentLogs.id, f.e.id));
  expect(row).toEqual(f.e);
  expect((await db.select().from(schema.equipmentUsage))).toHaveLength(0);
  expect((await db.select().from(schema.stockLedger))).toHaveLength(0);
  expect((await db.select().from(schema.auditLogs).where(eq(schema.auditLogs.transactionId, f.id)))[0].newValues.revision).toBe(1);
});
it("site-register timing is staged then approved by another Administrator without updating a paid bill", async () => {
  const f = await fixture();
  await db.insert(schema.vendorBills).values({ id: f.id, billNo: `FIX-${f.id}`, vendorName: "FIXTURE VENDOR", billDate: "2026-08-29", billType: "equipment", status: "paid", totalAmount: "5850" });
  await db.insert(schema.vendorBillItems).values({ billId: f.id, source: `auto:dpr_equipment:${f.e.id}`, description: "Fixture paid hire", qty: 6.5, amount: 5850 });
  f.form.equipment[0].startTime = "08:00";
  f.form.equipment[0].endTime = "14:30";
  const beforeBill = await db.select().from(schema.vendorBills).where(eq(schema.vendorBills.id, f.id));
  const request: any = await submit(f);
  expect(request.pending).toBe(true);
  expect((await db.select().from(schema.equipmentLogs).where(eq(schema.equipmentLogs.id, f.e.id)))[0].startTime).toBeNull();
  await expect(service.decide(f.id, request.requestId, { approve: true, reason: "Checked source register", confirmImpact: true }, { ...author, isAdmin: true })).rejects.toThrow("own correction");
  await service.decide(f.id, request.requestId, { approve: true, reason: "Checked source register", confirmImpact: true }, admin);
  expect((await db.select().from(schema.equipmentLogs).where(eq(schema.equipmentLogs.id, f.e.id)))[0]).toMatchObject({ id: f.e.id, plantUsageId: 188, startTime: "08:00", hoursWorked: 6.5 });
  expect(await db.select().from(schema.vendorBills).where(eq(schema.vendorBills.id, f.id))).toEqual(beforeBill);
  await expect(service.decide(f.id, request.requestId, { approve: true, reason: "Checked source register", confirmImpact: true }, admin)).rejects.toThrow("no longer pending");
});
it("blank readings remain null; explicitly entered zeros are approved measurements", async () => {
  const f = await fixture();
  f.form.equipment[0].openingDiesel = 0;
  f.form.equipment[0].dieselBalanceInTank = 0;
  const pending: any = await submit(f);
  await service.decide(f.id, pending.requestId, { approve: true, reason: "Zero measurements confirmed", confirmImpact: true }, admin);
  const [row] = await db.select().from(schema.equipmentLogs).where(eq(schema.equipmentLogs.id, f.e.id));
  expect(row.openingDiesel).toBe(0); expect(row.dieselBalanceInTank).toBe(0); expect(row.diesel).toBe(20);
});
it("rejects stale review, unauthenticated save, non-admin approval and reassigned usage", async () => {
  const f = await fixture();
  const review = await service.preview(f.id, f.form, author);
  await db.update(schema.equipmentLogs).set({ task: "Changed meanwhile" }).where(eq(schema.equipmentLogs.id, f.e.id));
  await expect(service.submit(f.id, { form: f.form, baseHash: review.baseHash, reason: "Correct from register", confirmImpact: true }, author)).rejects.toThrow("changed since review");
  await expect(service.preview(f.id, f.form, {} as any)).rejects.toThrow("Authentication");
  await expect(service.decide(f.id, 1, { approve: true, reason: "Checked register", confirmImpact: true }, author)).rejects.toThrow("Administrator");
  f.form.equipment[0].plantUsageId = null;
  expect((await service.preview(f.id, f.form, author)).blocked.some(b => b.field === "plantUsageId")).toBe(true);
});
it("rejects a proposal made stale before approval, without modifying records", async () => {
  const f = await fixture(); f.form.equipment[0].openingDiesel = 0;
  const pending: any = await submit(f);
  await db.update(schema.dprs).set({ remarks: "Changed after proposal" }).where(eq(schema.dprs.id, f.id));
  await expect(service.decide(f.id, pending.requestId, { approve: true, reason: "Checked site register", confirmImpact: true }, admin)).rejects.toThrow("stale");
  expect((await db.select().from(schema.equipmentLogs).where(eq(schema.equipmentLogs.id, f.e.id)))[0].openingDiesel).toBeNull();
});
it("executes real SiteEdit hydration and accepts empty labour placeholders, raw flags and unchanged legacy nulls", async () => {
  const f = await fixture();
  const source = ts.createSourceFile("SiteEdit.tsx", readFileSync("client/src/pages/SiteEdit.tsx", "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const fn = source.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === "mapDprToFormState")!;
  const js = ts.transpileModule(fn.getText(source).replace("export function", "function"), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const map = new Function("calculateLengthFromChainage", "normalizeExcavationMaterialOutcome", "hydrateCutFillConsumptions", "newEntryKey", "newLabourRowKey", "readLabourWorkerNames", `${js};return mapDprToFormState;`)(
    calculateLengthFromChainage, normalizeExcavationMaterialOutcome, hydrateCutFillConsumptions, () => "fixture-entry", () => "fixture-worker", (r: any) => r.workerNames);
  const saved = await db.query.dprs.findFirst({ where: eq(schema.dprs.id, f.id), with: { progress: true, equipment: true, labour: true, materials: true, sitePurchases: true, structureItems: true } });
  const form = map(saved);
  // Match the live editor: its hidden road-mode structure placeholder is not
  // submitted as new structural evidence.
  form.structureItems = form.workType === "structure" || saved.structureItems.length ? form.structureItems : [];
  form.progress[0].chainageFrom = "1+100"; form.progress[0].chainageTo = "1+200";
  form.progress[0].chainageOverrideReason = "Confirmed source register";
  form.equipment[0].workAssignmentEdited = true;
  const review = await service.preview(f.id, JSON.parse(JSON.stringify(form)), author);
  expect(review.blocked).toEqual([]);
  expect(review.changes.every(c => c.section === "progress")).toBe(true);
  expect(review.requiresApproval).toBe(false);
});
it("rolls back correction and retains all evidence if its audit cannot be inserted", async () => {
  const f = await fixture();
  const before = await db.select().from(schema.progressEntries).where(eq(schema.progressEntries.id, f.p.id));
  await pg.exec("ALTER TABLE audit_logs ADD CONSTRAINT fail_correction_audit CHECK (action <> 'correction_applied') NOT VALID");
  try { await expect(submit(f)).rejects.toThrow(); }
  finally { await pg.exec("ALTER TABLE audit_logs DROP CONSTRAINT fail_correction_audit"); }
  expect(await db.select().from(schema.progressEntries).where(eq(schema.progressEntries.id, f.p.id))).toEqual(before);
});
