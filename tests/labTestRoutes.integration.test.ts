import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { getTableConfig, PgDialect, PgTable } from "drizzle-orm/pg-core";
import { eq, is, SQL } from "drizzle-orm";
import express from "express";
import request from "supertest";
import * as schema from "../shared/schema";

const testState = vi.hoisted(() => ({ db: null as any, owner: true }));
vi.mock("../server/db", () => ({ get db() { return testState.db; }, pool: {} }));
vi.mock("../server/auth-routes", () => ({
  assertView: () => true,
  assertCreate: () => true,
  assertEdit: () => true,
}));

const tableNames = [
  "sites", "boq_projects", "boq_items", "personnel", "plant_materials", "dprs", "progress_entries",
  "lab_tests", "lab_test_attachments", "lab_calibrations", "material_benchmarks", "level_sheets",
  "boq_item_quality_specs", "audit_logs",
];
let pg: PGlite;
let app: express.Express;
let siteId: number;
let projectId: number;
let itemId: number;
let staffId: number;
let inactiveStaffId: number;
let materialId: number;
let registerLabTestRoutes: typeof import("../server/labTestRoutes").registerLabTestRoutes;

async function createFixtureTable(table: PgTable, dialect: PgDialect) {
  const config = getTableConfig(table);
  const columns = config.columns.map(column => {
    let definition = `"${column.name}" ${column.getSQLType()}`;
    if (column.primary) definition += " PRIMARY KEY";
    else if (column.isUnique) definition += " UNIQUE";
    if (column.notNull) definition += " NOT NULL";
    if (column.default !== undefined) {
      const value = column.default;
      definition += " DEFAULT " + (is(value, SQL) ? dialect.sqlToQuery(value).sql
        : Array.isArray(value) && column.getSQLType().endsWith("[]") ? "'{}'"
        : typeof value === "string" ? `'${value.replace(/'/g, "''")}'`
        : typeof value === "object" ? `'${JSON.stringify(value)}'`
        : String(value));
    }
    return definition;
  });
  await pg.exec(`CREATE TABLE "${config.name}" (${columns.join(",")})`);
}

function baseInput(testType: string, readings: Record<string, any> = {}) {
  return {
    siteId,
    boqProjectId: projectId,
    testType,
    dateSampled: "2026-11-20",
    dateTested: "2026-11-20",
    place: "site_lab",
    boqItemId: itemId,
    layer: "WMM",
    layerNo: 1,
    chainageFrom: 1.2,
    chainageTo: 1.3,
    side: "LHS",
    sampleSourceKind: "site",
    sampleSourceName: "WMM trial section",
    materialId,
    siteEngineerPersonnelId: staffId,
    sampledByPersonnelId: staffId,
    testedByPersonnelId: staffId,
    header: { sampleLabel: "Synthetic fixture" },
    readings,
    remarks: "Synthetic fixture only",
  };
}

function completeReadings(testType: string) {
  if (testType === "field_density_sand") return {
    pits: [{ w1: 10500, w2: 6420, w3: 1520, wetSoilWeight: 3720, moistureMethod: "oven", w5: 25, w6: 137.36, w7: 125 }],
  };
  if (testType === "field_density_core_cutter") return {
    pits: [{ soilAndCutterWeight: 1870, cutterWeight: 370, cutterVolume: 750, moistureMethod: "oven", w5: 20, w6: 120, w7: 110 }],
  };
  if (testType === "moisture_content") return { moistureMethod: "oven", w5: 25, w6: 137.36, w7: 125 };
  if (testType === "proctor_light" || testType === "proctor_modified") return {
    trials: [
      { w1: 4250, w2: 8624, volumeCc: 2250, moistureMethod: "oven", w5: 30, w6: 130, w7: 122.59 },
      { w1: 4250, w2: 8854, volumeCc: 2250, moistureMethod: "oven", w5: 30, w6: 130, w7: 120.91 },
      { w1: 4250, w2: 9038, volumeCc: 2250, moistureMethod: "oven", w5: 30, w6: 130, w7: 119.29 },
      { w1: 4250, w2: 9072, volumeCc: 2250, moistureMethod: "oven", w5: 30, w6: 130, w7: 117.72 },
      { w1: 4250, w2: 9027, volumeCc: 2250, moistureMethod: "oven", w5: 30, w6: 130, w7: 116.21 },
    ],
    specificGravity: 2.65,
  };
  if (testType === "cbr") return {
    ringConstantKgPerDivision: 1.2,
    dialReadings: { "0": 0, "0.5": 22, "1": 45, "1.5": 70, "2": 95, "2.5": 118, "3": 138, "4": 170, "5": 195, "7.5": 240, "10": 270, "12.5": 290 },
    initialSwellGauge: 3.2, finalSwellGauge: 3.62, specimenHeightMm: 116.4,
  };
  return {
    liquidLimitTrials: [
      { blows: 15, moistureMethod: "speedy", speedyIndicated: 40 },
      { blows: 25, moistureMethod: "speedy", speedyIndicated: 35 },
      { blows: 35, moistureMethod: "speedy", speedyIndicated: 30 },
    ],
    plasticLimitTrials: [
      { moistureMethod: "speedy", speedyIndicated: 20 },
      { moistureMethod: "speedy", speedyIndicated: 22 },
    ],
  };
}

beforeAll(async () => {
  pg = new PGlite();
  const dialect = new PgDialect();
  const tables = Object.values(schema).filter((value): value is PgTable => is(value, PgTable)
    && tableNames.includes(getTableConfig(value).name));
  for (const table of tables) await createFixtureTable(table, dialect);
  await pg.exec(`
    CREATE UNIQUE INDEX lab_tests_project_test_no_uq ON lab_tests (boq_project_id, test_no);
    CREATE UNIQUE INDEX boq_item_quality_specs_item_test_uq ON boq_item_quality_specs (boq_item_id, test_type);
    ALTER TABLE lab_test_attachments ADD CONSTRAINT lab_test_attachments_lab_test_fk
      FOREIGN KEY (lab_test_id) REFERENCES lab_tests(id) ON DELETE CASCADE;
  `);
  testState.db = drizzle(pg, { schema });
  const [site] = await testState.db.insert(schema.sites).values({ name: "SYNTHETIC TEST SITE", isActive: 1 }).returning();
  siteId = site.id;
  const [project] = await testState.db.insert(schema.boqProjects).values({
    siteId, name: "SYNTHETIC SOIL TEST PROJECT", status: "active",
  }).returning();
  projectId = project.id;
  const [item] = await testState.db.insert(schema.boqItems).values({
    boqProjectId: projectId, itemCode: "TEST-1", itemName: "Synthetic WMM", description: "WMM fixture",
    unit: "cum", sortOrder: 1,
  }).returning();
  itemId = item.id;
  const [staff] = await testState.db.insert(schema.personnel).values({ name: "SYNTHETIC LAB TECH", role: "Lab technician", isActive: 1 }).returning();
  staffId = staff.id;
  const [inactive] = await testState.db.insert(schema.personnel).values({ name: "INACTIVE LAB TECH", role: "Lab technician", isActive: 0 }).returning();
  inactiveStaffId = inactive.id;
  const [material] = await testState.db.insert(schema.plantMaterials).values({ name: "SYNTHETIC WMM", isActive: 1 }).returning();
  materialId = material.id;
  await testState.db.insert(schema.labCalibrations).values([
    { siteId, kind: "sand_pouring_cylinder", equipmentNo: "SAND-01", values: { sandBulkDensityGcc: 1.45, sandInConeG: 1520 }, calibratedOn: "2026-10-01", validUntil: "2026-12-31" },
    { siteId, kind: "core_cutter", equipmentNo: "CORE-01", values: { cutterVolumeCc: 750, cutterWeightG: 370 }, calibratedOn: "2026-10-01", validUntil: "2026-12-31" },
    { siteId, kind: "proving_ring", equipmentNo: "RING-01", values: { ringConstantKgPerDivision: 1.2 }, calibratedOn: "2026-10-01", validUntil: "2026-12-31" },
    { siteId, kind: "speedy_moisture_meter", equipmentNo: "SPEEDY-01", values: { correctionPairs: [{ indicated: 10, corrected: 11 }, { indicated: 20, corrected: 21 }] }, calibratedOn: "2026-10-01", validUntil: "2026-12-31" },
  ]);
  await testState.db.insert(schema.materialBenchmarks).values({
    materialId, sourceName: "WMM trial section", boqProjectId: projectId, mddGcc: 1.9, omcPercent: 11.8, specificGravity: 2.65,
    effectiveFrom: "2026-10-01", isActive: true,
  });
  await testState.db.insert(schema.boqItemQualitySpecs).values([
    { boqItemId: itemId, testType: "field_density_sand", minValue: 97, frequencyQty: 500, frequencyUnit: "sqm" },
    { boqItemId: itemId, testType: "field_density_core_cutter", minValue: 90, frequencyQty: 500, frequencyUnit: "sqm" },
    { boqItemId: itemId, testType: "moisture_content", minValue: 9, maxValue: 14, frequencyQty: 500, frequencyUnit: "sqm" },
    { boqItemId: itemId, testType: "proctor_light", minValue: 1.8, frequencyQty: 1, frequencyUnit: "as_required" },
    { boqItemId: itemId, testType: "proctor_modified", minValue: 1.8, frequencyQty: 1, frequencyUnit: "as_required" },
    { boqItemId: itemId, testType: "cbr", minValue: 20, frequencyQty: 1, frequencyUnit: "as_required" },
    { boqItemId: itemId, testType: "atterberg", maxValue: 18, frequencyQty: 1, frequencyUnit: "as_required" },
  ]);
  const imported = await import("../server/labTestRoutes");
  registerLabTestRoutes = imported.registerLabTestRoutes;
  app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    req.authUser = { id: 1, fullName: "SYNTHETIC OWNER", isOwner: testState.owner, allSitesAccess: true };
    next();
  });
  registerLabTestRoutes(app);
}, 60_000);

afterAll(async () => { await pg?.close(); });

describe("soil test draft, submit and correction routes", () => {
  it("saves and restores a draft with staff and attachment, then submits all seven soil-test types", async () => {
    const firstDraft = await request(app).post("/api/lab-tests").send({
      ...baseInput("field_density_sand", { pits: [{ w1: 10500 }] }),
      status: "draft",
      attachment: { fileName: "fixture-sheet.pdf", objectPath: "/objects/test-fixtures/lab/fixture-sheet.pdf", mimeType: "application/pdf", fileSize: 4200 },
    });
    if (firstDraft.status !== 201) console.log("draft save error", firstDraft.status, firstDraft.body);
    expect(firstDraft.status).toBe(201);
    expect(firstDraft.body.attachments).toHaveLength(1);
    expect(firstDraft.body.status).toBe("draft");
    expect(firstDraft.body.readings.pits[0].w1).toBe(10500);
    expect(firstDraft.body.siteEngineerPersonnelId).toBe(staffId);
    expect(firstDraft.body.sampledByPersonnelId).toBe(staffId);
    expect(firstDraft.body.testedByPersonnelId).toBe(staffId);
    expect(firstDraft.body.layer).toBe("WMM");

    const draftList = await request(app).get(`/api/lab-tests?siteId=${siteId}&status=draft`).expect(200);
    const restored = draftList.body.find((row: any) => row.id === firstDraft.body.id);
    expect(restored.readings.pits[0].w1).toBe(10500);
    expect(restored.attachments[0].fileName).toBe("fixture-sheet.pdf");

    const types = [
      "field_density_sand", "field_density_core_cutter", "moisture_content",
      "proctor_light", "proctor_modified", "cbr", "atterberg",
    ];
    let failedCbrId: number | null = null;
    for (const type of types) {
      const created = await request(app).post("/api/lab-tests").send({
        ...baseInput(type, {}),
        status: "draft",
      }).expect(201);
      const submitResponse = await request(app).put(`/api/lab-tests/${created.body.id}`).send({
        ...baseInput(type, completeReadings(type)),
        status: "submitted",
      });
      if (submitResponse.status !== 200) console.log("submit error", type, submitResponse.status, submitResponse.body);
      const submitted = submitResponse;
      expect(submitted.status).toBe(200);
      expect(submitted.body.status).toBe("submitted");
      expect(submitted.body.testType).toBe(type);
      if (type === "proctor_light" || type === "proctor_modified") {
        expect(submitted.body.results.mddGcc).not.toBeNull();
        expect(submitted.body.results.omcPercent).not.toBeNull();
      } else expect(submitted.body.verdict).not.toBe("na");
      if (type === "cbr") {
        expect(submitted.body.verdict).toBe("fail");
        failedCbrId = submitted.body.id;
      }
    }
    expect(failedCbrId).not.toBeNull();
    const retest = await request(app).post(`/api/lab-tests/${failedCbrId}/retest`).send({}).expect(201);
    expect(retest.body.retestOfTestId).toBe(failedCbrId);
    const improvedReadings: any = completeReadings("cbr");
    improvedReadings.dialReadings["2.5"] = 300;
    improvedReadings.dialReadings["5"] = 450;
    const retestSubmitted = await request(app).put(`/api/lab-tests/${retest.body.id}`).send({
      ...baseInput("cbr", improvedReadings),
      status: "submitted",
    }).expect(200);
    expect(retestSubmitted.body.verdict).toBe("pass");
    const testList = await request(app).get(`/api/lab-tests?siteId=${siteId}`).expect(200);
    const retestListed = testList.body.find((row: any) => row.id === retest.body.id);
    expect(retestListed.retestOfTestId).toBe(failedCbrId);
    expect(testList.body.find((row: any) => row.id === retestListed.retestOfTestId).verdict).toBe("fail");
  });

  it("allows an Owner correction with a reason, records history, and cascades test attachments", async () => {
    const created = await request(app).post("/api/lab-tests").send({
      ...baseInput("field_density_sand", completeReadings("field_density_sand")),
      status: "submitted",
      attachment: { fileName: "correction-source.jpg", objectPath: "/objects/test-fixtures/lab/correction-source.jpg", mimeType: "image/jpeg", fileSize: 6000 },
    });
    if (created.status !== 201) console.log("submitted create error", created.status, created.body);
    expect(created.status).toBe(201);
    const id = created.body.id;
    await testState.db.update(schema.labTests).set({ siteEngineerPersonnelId: inactiveStaffId })
      .where(eq(schema.labTests.id, id));
    const corrected = await request(app).post(`/api/lab-tests/${id}/correct`).send({
      ...baseInput("field_density_sand", completeReadings("field_density_sand")),
      status: "submitted",
      remarks: "Corrected fixture",
      reason: "Fixture correction reason",
      siteEngineerPersonnelId: inactiveStaffId,
      attachment: { fileName: "correction-source.jpg", objectPath: "/objects/test-fixtures/lab/correction-source.jpg", mimeType: "image/jpeg", fileSize: 6000 },
    }).expect(200);
    expect(corrected.body.remarks).toBe("Corrected fixture");
    expect(corrected.body.siteEngineerPersonnelId).toBe(inactiveStaffId);
    const history = await request(app).get(`/api/lab-tests/${id}/history`).expect(200);
    expect(history.body.map((entry: any) => entry.action)).toEqual(expect.arrayContaining(["submit", "owner_correction"]));
    expect(history.body.find((entry: any) => entry.action === "owner_correction").reason).toBe("Fixture correction reason");
    const attachmentsBeforeDelete = await testState.db.select().from(schema.labTestAttachments)
      .where(eq(schema.labTestAttachments.labTestId, id));
    expect(attachmentsBeforeDelete).toHaveLength(1);
    await testState.db.delete(schema.labTests).where(eq(schema.labTests.id, id));
    const attachmentsAfterDelete = await testState.db.select().from(schema.labTestAttachments)
      .where(eq(schema.labTestAttachments.labTestId, id));
    expect(attachmentsAfterDelete).toHaveLength(0);
  });

  it("saves tray spray-rate results with the existing site sample-source value", async () => {
    await testState.db.insert(schema.boqItemQualitySpecs).values({
      boqItemId: itemId,
      testType: "tray_spray_rate",
      minValue: 0.55,
      maxValue: 0.65,
      targetTolerance: 0.05,
      frequencyQty: 1,
      frequencyUnit: "as_required",
    });
    const response = await request(app).post("/api/lab-tests").send({
      ...baseInput("tray_spray_rate", {
        coat: "Prime",
        appliedBy: "SYNTHETIC TACK SPRAYER",
        trays: [
          { measurementMode: "dimensions", chainage: "2+600", side: "LHS", lengthMm: 500, widthMm: 200, emptyWeightG: 100, afterSprayingWeightG: 160 },
          { measurementMode: "area", chainage: "2+700", side: "RHS", areaSqm: 0.1, emptyWeightG: 120, afterSprayingWeightG: 175 },
        ],
      }),
      sampleSourceKind: "quarry",
      status: "submitted",
    }).expect(201);
    expect(response.body.testType).toBe("tray_spray_rate");
    expect(response.body.sampleSourceKind).toBe("site");
    expect(response.body.results.averageRateKgSqm).toBe(0.575);
    expect(response.body.results.minRateKgSqm).toBe(0.55);
    expect(response.body.results.maxRateKgSqm).toBe(0.65);
    expect(response.body.verdict).toBe("pass");
  });

  it("uses matching saved level-sheet points for a read-only thickness check", async () => {
    await testState.db.insert(schema.boqItemQualitySpecs).values({
      boqItemId: itemId,
      testType: "layer_thickness",
      thicknessToleranceBelowMm: 10,
      thicknessToleranceAboveMm: 15,
      frequencyQty: 1,
      frequencyUnit: "as_required",
    });
    const [below] = await testState.db.insert(schema.levelSheets).values({
      siteId, layerName: "GSB", sheetDate: "2026-11-18", readingMode: "rl", status: "saved",
      readings: [{ chainageOursKm: 2.6, points: [{ side: "CL", distanceM: 0, value: 100 }] }],
    }).returning();
    const [top] = await testState.db.insert(schema.levelSheets).values({
      siteId, layerName: "WMM", sheetDate: "2026-11-20", readingMode: "rl", status: "saved",
      readings: [{ chainageOursKm: 2.6, points: [{ side: "CL", distanceM: 0, value: 100.12 }] }],
    }).returning();
    await testState.db.insert(schema.levelSheets).values({
      siteId, layerName: "Draft only", sheetDate: "2026-11-21", readingMode: "rl", status: "draft",
      readings: [{ chainageOursKm: 2.6, points: [{ side: "CL", distanceM: 0, value: 101 }] }],
    });
    const listed = await request(app).get(`/api/lab-tests/level-sheets?siteId=${siteId}`).expect(200);
    expect(listed.body).toHaveLength(2);
    expect(listed.body.find((row: any) => row.id === below.id).points[0].rl).toBe(100);
    expect(listed.body.find((row: any) => row.id === top.id).points[0].rl).toBe(100.12);

    const submitted = await request(app).post("/api/lab-tests").send({
      ...baseInput("layer_thickness", {
        sourceMode: "level_sheets", designThicknessMm: 120,
        belowSheetId: below.id, topSheetId: top.id,
      }),
      sampleSourceKind: "quarry",
      status: "submitted",
    }).expect(201);
    expect(submitted.body.sampleSourceKind).toBe("site");
    expect(submitted.body.results.belowSheetLabel).toBe("GSB · 2026-11-18");
    expect(submitted.body.results.topSheetLabel).toBe("WMM · 2026-11-20");
    expect(submitted.body.results.points).toEqual([expect.objectContaining({
      chainageOursKm: 2.6, side: "CL", offsetM: 0, belowRl: 100, topRl: 100.12,
      measuredThicknessMm: 120, differenceMm: 0, withinTolerance: true,
    })]);
    expect(submitted.body.results.averageThicknessMm).toBe(120);
    expect(submitted.body.verdict).toBe("pass");
  });

  it("returns only submitted tests for the DPR read-only block", async () => {
    const [submittedDpr] = await testState.db.insert(schema.dprs).values({
      date: "2026-11-20", site: "SYNTHETIC TEST SITE", engineer: "SYNTHETIC ENGINEER",
      dprStatus: "submitted", boqProjectId: projectId,
    }).returning();
    const [dpr] = await testState.db.select().from(schema.dprs).where(eq(schema.dprs.site, "SYNTHETIC TEST SITE")).limit(1);
    const response = await request(app).get(`/api/lab-tests/dpr/${dpr.id}`).expect(200);
    expect(response.body.every((row: any) => row.testName && row.siteEngineerName)).toBe(true);
    expect(response.body.length).toBeGreaterThan(0);

    const [draftDpr] = await testState.db.insert(schema.dprs).values({
      date: "2026-11-19", site: "SYNTHETIC TEST SITE", engineer: "SYNTHETIC ENGINEER",
      dprStatus: "draft", boqProjectId: projectId,
    }).returning();
    const [cancelledDpr] = await testState.db.insert(schema.dprs).values({
      date: "2026-11-18", site: "SYNTHETIC TEST SITE", engineer: "SYNTHETIC ENGINEER",
      dprStatus: "submitted", boqProjectId: projectId, isCancelled: true,
    }).returning();
    const [supersededDpr] = await testState.db.insert(schema.dprs).values({
      date: "2026-11-17", site: "SYNTHETIC TEST SITE", engineer: "SYNTHETIC ENGINEER",
      dprStatus: "submitted", boqProjectId: projectId, isSuperseded: true,
    }).returning();
    const progress = [
      { dprId: submittedDpr.id, quantity: 600, uom: "sqm", length: 20, width: 30, isIncidental: false, reworkNoNewMaterial: false },
      { dprId: submittedDpr.id, quantity: 1000, uom: "sqm", length: 20, width: 50, isIncidental: true, reworkNoNewMaterial: false },
      { dprId: submittedDpr.id, quantity: 1000, uom: "sqm", length: 20, width: 50, isIncidental: false, reworkNoNewMaterial: true },
      { dprId: draftDpr.id, quantity: 1000, uom: "sqm", length: 20, width: 50, isIncidental: false, reworkNoNewMaterial: false },
      { dprId: cancelledDpr.id, quantity: 1000, uom: "sqm", length: 20, width: 50, isIncidental: false, reworkNoNewMaterial: false },
      { dprId: supersededDpr.id, quantity: 1000, uom: "sqm", length: 20, width: 50, isIncidental: false, reworkNoNewMaterial: false },
    ].map(row => ({ ...row, activity: "FDD frequency fixture", boqItemId: itemId }));
    await testState.db.insert(schema.progressEntries).values(progress);
    const frequency = await request(app).get(`/api/lab-tests/frequency?projectId=${projectId}`).expect(200);
    const fdd = frequency.body.find((row: any) => row.boqItemId === itemId && row.testType === "field_density_sand");
    expect(fdd.quantityLaid).toBe(600);
    expect(fdd.testsRequired).toBe(2);
    expect(fdd.testsDone).toBeGreaterThanOrEqual(1);
  });

  it("keeps calibration, benchmark, and quality-spec setup Owner-only and audited", async () => {
    testState.owner = false;
    await request(app).post("/api/lab-tests/calibrations").send({}).expect(403);
    await request(app).post("/api/lab-tests/benchmarks").send({}).expect(403);
    await request(app).post(`/api/lab-tests/specs/${itemId}`).send({ specs: [] }).expect(403);
    testState.owner = true;

    const proctorReadings = {
      trials: [10, 11, 12, 13, 14].map((water, index) => ({
        w1: 1000, w2: 1000 + [2060, 2100, 2128, 2100, 2060][index], volumeCc: 1000,
        moistureMethod: "oven", w5: 20, w6: 120 + water, w7: 120,
      })),
    };
    const proctorResponse = await request(app).post("/api/lab-tests").send({
      ...baseInput("proctor_light", proctorReadings),
      testType: "proctor_light",
      status: "submitted",
      dateTested: "2026-11-02",
      sampleSourceKind: "borrow_area",
      sampleSourceName: "Synthetic Proctor source",
      materialId,
    });
    expect(proctorResponse.status, JSON.stringify(proctorResponse.body)).toBe(201);
    const proctor = proctorResponse;
    expect(proctor.body.results.mddGcc).toBeGreaterThan(0);
    const [automaticBenchmark] = await testState.db.select().from(schema.materialBenchmarks).where(eq(schema.materialBenchmarks.sourceTestId, proctor.body.id));
    expect(automaticBenchmark.sourceName).toBe("Synthetic Proctor source");

    const calibration = await request(app).post("/api/lab-tests/calibrations").send({
      siteId, kind: "speedy_moisture_meter", equipmentNo: "SYNTHETIC-SPEEDY-02",
      calibratedOn: "2026-11-01", validUntil: "2026-12-31", calibratedByPersonnelId: staffId,
      values: { correctionPairs: [{ indicated: 10, corrected: 11 }, { indicated: 20, corrected: 21 }] },
      attachment: { fileName: "calibration.pdf", objectPath: "/objects/test-fixtures/calibration.pdf", mimeType: "application/pdf", fileSize: 1000 },
    }).expect(201);
    expect(calibration.body.values.correctionPairs).toHaveLength(2);

    const benchmark = await request(app).post("/api/lab-tests/benchmarks").send({
      materialId, sourceName: "Synthetic borrow area", boqProjectId: projectId,
      mddGcc: 1.91, omcPercent: 12.1, specificGravity: 2.65,
      effectiveFrom: "2026-11-01", isActive: true,
    }).expect(201);
    const deactivated = await request(app).patch(`/api/lab-tests/benchmarks/${benchmark.body.id}`).send({
      isActive: false, reason: "Fixture deactivation",
    }).expect(200);
    expect(deactivated.body.isActive).toBe(false);

    const savedSpecs = await request(app).post(`/api/lab-tests/specs/${itemId}`).send({
      specs: [{ testType: "field_density_sand", minValue: 98, maxValue: null, frequencyQty: 1200, frequencyUnit: "sqm", note: "Fixture specification" }],
    }).expect(200);
    expect(savedSpecs.body.count).toBe(1);
    const actions = await testState.db.select().from(schema.auditLogs).where(eq(schema.auditLogs.module, "lab_test"));
    expect(actions.map((row: any) => row.action)).toEqual(expect.arrayContaining(["calibration_create", "benchmark_create", "benchmark_deactivate", "quality_specs_edit"]));
  });
});
