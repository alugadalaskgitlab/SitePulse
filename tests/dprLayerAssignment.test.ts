import { afterAll, beforeAll, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq, is, SQL } from "drizzle-orm";
import { getTableConfig, PgDialect, PgTable } from "drizzle-orm/pg-core";
import express from "express";
import request from "supertest";
import * as schema from "../shared/schema";
import {
  calculateDprLayerAssignments,
  dprLayerSidesOverlap,
  summarizeDprLayerAssignments,
} from "../shared/dprLayerAssignment";
import { dprLayerAssignmentService, requireDprLayerAssignmentOwner } from "../server/dprLayerAssignment";

const base = {
  dprStatus: "submitted",
  dprIsDeleted: false,
  dprIsCancelled: false,
  dprIsSuperseded: false,
  itemUnit: "CUM",
  activity: "Embankment",
  side: "LHS",
  length: 100,
  width: 1,
  thickness: 0.25,
  quantity: 25,
  uom: "CUM",
  layerNo: null,
  noSiteWork: false,
  boqItemId: 1,
  itemName: "Embankment",
} as const;

function source(progressId: number, dprId: number, from: string, to: string, additions: Record<string, unknown> = {}) {
  return {
    ...base,
    progressId,
    dprId,
    dprDate: "2026-10-01",
    chainageFrom: from,
    chainageTo: to,
    ...additions,
  };
}

const assignmentOptions = {
  itemIds: [1],
  layerCount: 3,
  compactedThicknessMm: 250,
  roadLengthKm: 3.8,
};

it("assigns successive layers on same-side full and partial overlaps, with fresh stretches starting at layer 1", () => {
  const rows = calculateDprLayerAssignments([
    source(1, 1, "0+000", "0+100"),
    source(2, 2, "0+050", "0+150"),
    source(3, 3, "0+140", "0+200"),
    source(4, 4, "1+000", "1+100"),
  ], assignmentOptions);
  expect(rows.map((row) => row.proposedLayer)).toEqual([1, 2, 3, 1]);
});

it("keeps an Owner's explicit layer override", () => {
  const rows = calculateDprLayerAssignments([
    source(1, 1, "0+000", "0+100"),
    source(2, 2, "0+050", "0+150"),
  ], { ...assignmentOptions, layerOverrides: { 2: 3 } });
  expect(rows.map((row) => row.proposedLayer)).toEqual([1, 3]);
});

it("sorts Date objects chronologically before proposing overlapping layers", () => {
  const rows = calculateDprLayerAssignments([
    source(2, 2, "0+000", "0+100", { dprDate: new Date("2026-06-05T00:00:00.000Z") }),
    source(1, 1, "0+000", "0+100", { dprDate: new Date("2026-06-04T00:00:00.000Z") }),
  ], assignmentOptions);
  expect(rows.map((row) => row.dprId)).toEqual([1, 2]);
  expect(rows.map((row) => row.proposedLayer)).toEqual([1, 2]);
});

it("treats both-sides rows as overlapping either side but keeps LHS and RHS separate", () => {
  expect(dprLayerSidesOverlap("LHS", "RHS")).toBe(false);
  expect(dprLayerSidesOverlap("Both Sides", "RHS")).toBe(true);
  const rows = calculateDprLayerAssignments([
    source(1, 1, "0+000", "0+100", { side: "RHS" }),
    source(2, 2, "0+000", "0+100", { side: "LHS" }),
    source(3, 3, "0+000", "0+100", { side: "Both Sides" }),
    source(4, 4, "0+000", "0+100", { side: "LHS" }),
  ], assignmentOptions);
  expect(rows.map((row) => row.proposedLayer)).toEqual([1, 1, 2, 3]);
});

it("flags excess layers, non-BOQ units, geometry differences, missing dimensions and corridor overruns", () => {
  const rows = calculateDprLayerAssignments([
    source(1, 1, "3+700", "4+000", { layerNo: null, uom: "SQM", quantity: 200, length: 300, width: 2, thickness: 0.25 }),
    source(2, 2, "0+000", "0+100", { width: null, thickness: null }),
  ], { ...assignmentOptions, layerCount: 1 });
  expect(rows[0].flags).toEqual(expect.arrayContaining([
    "Unit not CUM",
    "Quantity ≠ length × width × thickness by +50 cum",
    "Outside corridor",
  ]));
  expect(rows[1].flags).toContain("No width / thickness");
});

it("keeps drafts visible but never counts them in layer summaries", () => {
  const rows = calculateDprLayerAssignments([
    source(1, 1, "0+000", "0+100"),
    source(2, 2, "0+000", "0+100", { dprStatus: "draft", dprIsSuperseded: true, isSuperseded: true }),
  ], assignmentOptions);
  expect(rows).toHaveLength(1); // Superseded drafts are not active and are not listed.
  const visibleDraft = calculateDprLayerAssignments([
    source(3, 3, "0+000", "0+100", { dprStatus: "draft", layerNo: 2 }),
  ], assignmentOptions);
  expect(visibleDraft[0]).toMatchObject({ counted: false, proposedLayer: null, flags: ["draft — not counted"] });
  expect(summarizeDprLayerAssignments(visibleDraft, [], assignmentOptions)).toEqual([]);
});

it("blocks non-Owners from the tool API and allows the Owner", async () => {
  const app = express();
  app.use((req: any, _res, next) => {
    req.authUser = { isOwner: req.get("x-owner") === "true" };
    next();
  });
  app.get("/layer-tool", requireDprLayerAssignmentOwner, (_req, res) => res.json({ ok: true }));
  expect((await request(app).get("/layer-tool")).status).toBe(403);
  expect((await request(app).get("/layer-tool").set("x-owner", "true")).body).toEqual({ ok: true });
});

let pg: PGlite;
let db: any;
let service: ReturnType<typeof dprLayerAssignmentService>;

beforeAll(async () => {
  pg = new PGlite();
  const dialect = new PgDialect();
  const tableNames = new Set(["boq_projects", "boq_items", "dprs", "progress_entries", "project_scope_segments", "audit_logs"]);
  const selectedTables = Object.values(schema).filter((value) =>
    is(value, PgTable) && tableNames.has(getTableConfig(value as PgTable).name),
  ) as PgTable[];
  for (const table of selectedTables) {
    const config = getTableConfig(table);
    const columns = config.columns.map((column) => {
      let text = `"${column.name}" ${column.getSQLType()}`;
      if (column.primary) text += " PRIMARY KEY";
      if (column.notNull) text += " NOT NULL";
      if (column.default !== undefined) {
        const value = column.default;
        text += " DEFAULT " + (is(value, SQL)
          ? dialect.sqlToQuery(value).sql
          : Array.isArray(value) && column.getSQLType().endsWith("[]")
            ? "'{}'"
            : typeof value === "string"
              ? `'${value.replaceAll("'", "''")}'`
              : typeof value === "object"
                ? `'${JSON.stringify(value)}'`
                : String(value));
      }
      return text;
    });
    await pg.exec(`CREATE TABLE "${config.name}" (${columns.join(",")})`);
  }
  db = drizzle(pg, { schema });
  service = dprLayerAssignmentService(db);
}, 60000);

afterAll(async () => pg?.close());

it("applies only layer and selected unit fields, audits each changed line, and never changes drafts", async () => {
  await db.insert(schema.boqProjects).values({ id: 901, name: "Fixture", roadLengthKm: 3.8 });
  await db.insert(schema.boqItems).values({
    id: 901, boqProjectId: 901, description: "Embankment", itemName: "Embankment", unit: "CUM",
  });
  await db.insert(schema.projectScopeSegments).values({
    id: 901, boqProjectId: 901, segmentType: "working_reach", label: "Reach 1",
    chainageFrom: 0, chainageTo: 1, side: null, status: "confirmed", applicability: "all_linear",
  });
  await db.insert(schema.dprs).values([
    { id: 901, date: "2026-10-01", site: "Fixture", engineer: "Fixture", boqProjectId: 901, dprStatus: "submitted" },
    { id: 902, date: "2026-10-02", site: "Fixture", engineer: "Fixture", boqProjectId: 901, dprStatus: "submitted" },
    { id: 903, date: "2026-10-03", site: "Fixture", engineer: "Fixture", boqProjectId: 901, dprStatus: "draft" },
  ]);
  const [first, second] = await db.insert(schema.progressEntries).values([
    { id: 901, dprId: 901, boqItemId: 901, activity: "Embankment", side: "LHS", chainageFrom: "0+000", chainageTo: "0+100", length: 100, width: 1, thickness: 0.25, quantity: 25, uom: "SQM" },
    { id: 902, dprId: 902, boqItemId: 901, activity: "Embankment", side: "LHS", chainageFrom: "0+050", chainageTo: "0+150", length: 100, width: 1, thickness: 0.25, quantity: 25, uom: "CUM" },
    { id: 903, dprId: 903, boqItemId: 901, activity: "Embankment", side: "LHS", chainageFrom: "0+050", chainageTo: "0+150", length: 100, width: 1, thickness: 0.25, quantity: 25, uom: "SQM" },
  ]).returning();

  const options = { groupName: "Embankment", itemIds: [901], layerCount: 3, compactedThicknessMm: 250 };
  const preview = await service.preview(901, options);
  expect(preview.rows.map((row: any) => row.proposedLayer)).toEqual([1, 2, null]);
  expect(preview.rows[2].flags).toContain("draft — not counted");
  const result = await service.apply(901, {
    previewToken: preview.previewToken,
    options,
    updates: [
      { progressId: first.id, layerNo: 1, correctUom: true },
      { progressId: second.id, layerNo: 3, correctUom: false },
    ],
    reason: "Checked against the signed layer register",
    confirm: true,
  }, { id: 55, isOwner: true, fullName: "Fixture Owner" });
  expect(result.updatedCount).toBe(2);

  const saved = await db.select().from(schema.progressEntries).orderBy(schema.progressEntries.id);
  expect(saved[0]).toMatchObject({ layerNo: 1, uom: "CUM", quantity: 25, length: 100, width: 1, thickness: 0.25, boqItemId: 901, dprId: 901 });
  expect(saved[1]).toMatchObject({ layerNo: 3, uom: "CUM", quantity: 25, length: 100, width: 1, thickness: 0.25, boqItemId: 901, dprId: 902 });
  expect(saved[2]).toMatchObject({ layerNo: null, uom: "SQM", quantity: 25, dprId: 903 });
  const audits = await db.select().from(schema.auditLogs);
  expect(audits).toHaveLength(2);
  expect(audits[0]).toMatchObject({
    module: "dpr", transactionId: 901, action: "layer_assignment_applied", userId: 55, userRole: "owner",
    reason: "Owner – assign layers tool: Checked against the signed layer register",
    oldValues: { progressId: 901, layerNo: null, uom: "SQM" },
    newValues: { progressId: 901, layerNo: 1, uom: "CUM" },
  });
});

it("rejects non-Owner Apply and stale previews without writing", async () => {
  const options = { groupName: "Embankment", itemIds: [901], layerCount: 3, compactedThicknessMm: 250 };
  const preview = await service.preview(901, options);
  const updates = preview.rows.filter((row: any) => row.counted).map((row: any) => ({
    progressId: row.progressId, layerNo: row.proposedLayer, correctUom: false,
  }));
  await expect(service.apply(901, {
    previewToken: preview.previewToken, options, updates,
    reason: "Non-owner must not apply", confirm: true,
  }, { id: 56, isOwner: false })).rejects.toMatchObject({ status: 403 });
  expect(await db.select().from(schema.auditLogs)).toHaveLength(2);

  await db.update(schema.progressEntries).set({ quantity: 26 }).where(eq(schema.progressEntries.id, 902));
  await expect(service.apply(901, {
    previewToken: preview.previewToken, options, updates,
    reason: "Reject when data changed", confirm: true,
  }, { id: 55, isOwner: true })).rejects.toThrow("DPR or project data changed since preview");
  expect(await db.select().from(schema.auditLogs)).toHaveLength(2);
});
