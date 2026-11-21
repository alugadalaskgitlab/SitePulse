import type { Express } from "express";
import { and, asc, desc, eq, gte, ilike, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "./db";
import {
  auditLogs, boqItemQualitySpecs, boqItems, boqProjects, dprs, labCalibrations,
  labTestAttachments, labTests, materialBenchmarks, personnel, plantMaterials,
  progressEntries, sites, userSiteAccess,
} from "@shared/schema";
import { assertCreate, assertEdit, assertView } from "./auth-routes";
import { calculateSoilLabTest, soilQualityDefaultsForWork, type LabCalculationContext, type SoilLabTestType } from "@shared/labTests";
import { getUnitConversionFactor } from "@shared/planningEngine";

const testTypes = [
  "field_density_sand", "field_density_core_cutter", "moisture_content",
  "proctor_light", "proctor_modified", "cbr", "atterberg",
] as const;
const TEST_CODES: Record<SoilLabTestType, string> = {
  field_density_sand: "FDD",
  field_density_core_cutter: "FDD",
  moisture_content: "MC",
  proctor_light: "LP",
  proctor_modified: "MP",
  cbr: "CBR",
  atterberg: "ATL",
};
const calibrationKindForTest: Partial<Record<SoilLabTestType, string>> = {
  field_density_sand: "sand_pouring_cylinder",
  field_density_core_cutter: "core_cutter",
  cbr: "proving_ring",
  moisture_content: "speedy_moisture_meter",
  atterberg: "speedy_moisture_meter",
  proctor_light: "speedy_moisture_meter",
  proctor_modified: "speedy_moisture_meter",
};

function numeric(value: unknown): number | null {
  if (value == null || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function projectCode(project: any): string {
  const source = String(project?.contractNo || project?.name || "SITE");
  const compact = source.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return (compact.slice(0, 4) || "SITE").padEnd(3, "X");
}

function safeAttachment(input: any) {
  if (!input) return null;
  if (typeof input.fileName !== "string" || !input.fileName.trim()
      || typeof input.objectPath !== "string" || !input.objectPath.startsWith("/objects/")
      || (input.mimeType && !String(input.mimeType).startsWith("image/") && input.mimeType !== "application/pdf")
      || (input.fileSize != null && (!Number.isInteger(input.fileSize) || input.fileSize < 0 || input.fileSize > 15 * 1024 * 1024))) {
    throw Object.assign(new Error("Choose an image or PDF up to 15 MB."), { status: 422 });
  }
  return {
    fileName: input.fileName.trim(),
    objectPath: input.objectPath,
    mimeType: input.mimeType || null,
    fileSize: input.fileSize ?? null,
  };
}

async function allowedSiteIds(req: any): Promise<number[] | null> {
  if (req.authUser?.isOwner || req.authUser?.allSitesAccess) return null;
  const rows = await db.select({ siteId: userSiteAccess.siteId }).from(userSiteAccess)
    .where(eq(userSiteAccess.userId, req.authUser.id));
  return rows.map(row => Number(row.siteId));
}

async function siteAllowed(req: any, res: any, siteId: number): Promise<boolean> {
  const ids = await allowedSiteIds(req);
  if (ids === null || ids.includes(siteId)) return true;
  res.status(403).json({ error: "forbidden", message: "Access denied for this site." });
  return false;
}

async function validateReferences(input: any, res: any, current?: any) {
  if (input.boqItemId != null) {
    const [item] = await db.select({ id: boqItems.id }).from(boqItems).where(and(
      eq(boqItems.id, Number(input.boqItemId)),
      eq(boqItems.boqProjectId, Number(input.boqProjectId)),
    )).limit(1);
    if (!item) {
      res.status(422).json({ error: "boq_item_not_in_project" });
      return false;
    }
  }
  if (input.materialId != null) {
    const [material] = await db.select({ id: plantMaterials.id }).from(plantMaterials)
      .where(and(eq(plantMaterials.id, Number(input.materialId)), eq(plantMaterials.isActive, 1))).limit(1);
    if (!material) {
      res.status(422).json({ error: "material_not_active" });
      return false;
    }
  }
  const fields = [
    ["siteEngineerPersonnelId", "siteEngineerPersonnelId"],
    ["sampledByPersonnelId", "sampledByPersonnelId"],
    ["testedByPersonnelId", "testedByPersonnelId"],
  ] as const;
  for (const [inputKey, currentKey] of fields) {
    const value = input[inputKey];
    if (value == null || (current && Number(value) === Number(current[currentKey]))) continue;
    const [person] = await db.select({ id: personnel.id }).from(personnel).where(and(
      eq(personnel.id, Number(value)), eq(personnel.isActive, 1),
    )).limit(1);
    if (!person) {
      res.status(422).json({ error: "personnel_not_active", field: inputKey });
      return false;
    }
  }
  return true;
}

async function getProject(projectId: number) {
  const [project] = await db.select({
    id: boqProjects.id,
    name: boqProjects.name,
    siteId: boqProjects.siteId,
    contractNo: boqProjects.contractNo,
    client: boqProjects.client,
    clientName: boqProjects.clientName,
    consultantName: boqProjects.consultantName,
  }).from(boqProjects).where(eq(boqProjects.id, projectId)).limit(1);
  return project;
}

async function projectAllowed(req: any, res: any, projectId: number, expectedSiteId?: number) {
  const project = await getProject(projectId);
  if (!project) {
    res.status(404).json({ error: "project_not_found" });
    return null;
  }
  if (!project.siteId || (expectedSiteId != null && Number(project.siteId) !== expectedSiteId)) {
    res.status(422).json({ error: "project_site_mismatch" });
    return null;
  }
  if (!await siteAllowed(req, res, Number(project.siteId))) return null;
  return project;
}

async function getTestWithAttachment(id: number) {
  const [test] = await db.select().from(labTests).where(eq(labTests.id, id)).limit(1);
  if (!test) return null;
  const attachments = await db.select().from(labTestAttachments)
    .where(eq(labTestAttachments.labTestId, id)).orderBy(asc(labTestAttachments.id));
  return { ...test, attachments };
}

async function contextForTest(input: any): Promise<LabCalculationContext> {
  const context: LabCalculationContext = {};
  const testType = input.testType as SoilLabTestType;
  const sampleDate = String(input.dateTested || input.dateSampled || new Date().toISOString().slice(0, 10));
  const calibrationKind = calibrationKindForTest[testType];
  if (calibrationKind) {
    const calibration = await db.select().from(labCalibrations)
      .where(and(
        eq(labCalibrations.kind, calibrationKind),
        or(eq(labCalibrations.siteId, Number(input.siteId)), isNull(labCalibrations.siteId)),
        lte(labCalibrations.calibratedOn, sampleDate),
        or(isNull(labCalibrations.validUntil), gte(labCalibrations.validUntil, sampleDate)),
      ))
      .orderBy(desc(labCalibrations.calibratedOn), desc(labCalibrations.id))
      .limit(1);
    const values: any = calibration[0]?.values ?? {};
    if (calibrationKind === "sand_pouring_cylinder") {
      context.sandBulkDensityGcc = numeric(values.sandBulkDensityGcc);
      context.sandInConeG = numeric(values.sandInConeG);
    } else if (calibrationKind === "proving_ring") {
      context.ringConstantKgPerDivision = numeric(values.ringConstantKgPerDivision ?? values.ringConstant);
    } else if (calibrationKind === "speedy_moisture_meter") {
      context.speedyCorrection = Array.isArray(values.correctionPairs) ? values.correctionPairs : [];
    }
  }

  const materialId = input.materialId == null ? null : Number(input.materialId);
  const sourceName = String(input.sampleSourceName ?? "").trim();
  const benchmarkConditions = [
    eq(materialBenchmarks.isActive, true),
    lte(materialBenchmarks.effectiveFrom, sampleDate),
    materialId != null ? eq(materialBenchmarks.materialId, materialId) : isNull(materialBenchmarks.materialId),
  ];
  benchmarkConditions.push(sourceName ? ilike(materialBenchmarks.sourceName, sourceName) : isNull(materialBenchmarks.sourceName));
  const projectBenchmarks = input.boqProjectId == null ? [] : await db.select().from(materialBenchmarks)
    .where(and(...benchmarkConditions, eq(materialBenchmarks.boqProjectId, Number(input.boqProjectId))))
    .orderBy(desc(materialBenchmarks.effectiveFrom), desc(materialBenchmarks.id))
    .limit(1);
  const globalBenchmarks = projectBenchmarks.length || input.boqProjectId == null ? [] : await db.select().from(materialBenchmarks)
    .where(and(...benchmarkConditions, isNull(materialBenchmarks.boqProjectId)))
    .orderBy(desc(materialBenchmarks.effectiveFrom), desc(materialBenchmarks.id))
    .limit(1);
  const benchmark = projectBenchmarks[0] ?? globalBenchmarks[0];
  if (benchmark) {
    context.mddGcc = benchmark.mddGcc;
    context.omcPercent = benchmark.omcPercent;
    context.specificGravity = benchmark.specificGravity;
  }

  if (input.boqItemId != null) {
    const itemId = Number(input.boqItemId);
    const specs = await db.select().from(boqItemQualitySpecs)
      .where(and(eq(boqItemQualitySpecs.boqItemId, itemId), eq(boqItemQualitySpecs.testType, testType)))
      .limit(1);
    const itemSpecs = specs[0];
    if (itemSpecs) {
      context.minValue = itemSpecs.minValue;
      context.maxValue = itemSpecs.maxValue;
    } else {
      const [item] = await db.select({ description: boqItems.description, itemName: boqItems.itemName })
        .from(boqItems).where(eq(boqItems.id, itemId)).limit(1);
      const defaults = soilQualityDefaultsForWork(`${item?.itemName ?? ""} ${item?.description ?? ""}`);
      const compatible = defaults.find(spec => spec.testType === testType);
      if (compatible) {
        context.minValue = compatible.minValue;
        context.maxValue = compatible.maxValue;
      }
    }
  }
  if (testType === "field_density_sand" || testType === "field_density_core_cutter") {
    context.requiredPercent = context.minValue;
  }
  return context;
}

function validateInput(input: any) {
  const bodySchema = z.object({
    boqProjectId: z.number().int().positive(),
    siteId: z.number().int().positive(),
    testType: z.enum(testTypes),
    dateSampled: z.string().min(1),
    dateTested: z.string().nullable().optional(),
    place: z.enum(["on_site", "site_lab", "plant_lab", "outside_lab"]),
    boqItemId: z.number().int().positive().nullable().optional(),
    layerNo: z.number().int().positive().nullable().optional(),
    chainageFrom: z.number().finite().nullable().optional(),
    chainageTo: z.number().finite().nullable().optional(),
    side: z.enum(["Centre", "LHS", "RHS", "Both"]).nullable().optional(),
    sampleSourceKind: z.enum(["site", "borrow_area", "quarry", "plant", "stockpile", "other"]),
    sampleSourceName: z.string().nullable().optional(),
    materialId: z.number().int().positive().nullable().optional(),
    siteEngineerPersonnelId: z.number().int().positive().nullable().optional(),
    sampledByPersonnelId: z.number().int().positive().nullable().optional(),
    testedByPersonnelId: z.number().int().positive().nullable().optional(),
    header: z.record(z.string(), z.unknown()).optional(),
    readings: z.record(z.string(), z.unknown()),
    status: z.enum(["draft", "submitted"]).optional(),
    useAsBenchmark: z.boolean().optional(),
    remarks: z.string().nullable().optional(),
    attachment: z.object({
      fileName: z.string(),
      objectPath: z.string(),
      mimeType: z.string().nullable().optional(),
      fileSize: z.number().int().nonnegative().nullable().optional(),
    }).nullable().optional(),
  });
  return bodySchema.safeParse(input);
}

function testNameForType(testType: string) {
  return ({
    field_density_sand: "Field density (sand replacement)",
    field_density_core_cutter: "Field density (core cutter)",
    moisture_content: "Moisture content (oven / speedy)",
    proctor_light: "Light Proctor",
    proctor_modified: "Modified Proctor",
    cbr: "CBR",
    atterberg: "Atterberg limits",
  } as Record<string, string>)[testType] ?? testType;
}

async function nextNumbers(tx: any, project: any, testType: SoilLabTestType, itemId: number | null) {
  const rows = await tx.select({ testNo: labTests.testNo, sampleNo: labTests.sampleNo })
    .from(labTests)
    .where(eq(labTests.boqProjectId, Number(project.id)))
    .orderBy(desc(labTests.id));
  const code = projectCode(project);
  const testPrefix = `${code}/${TEST_CODES[testType]}/`;
  const testSequence = rows
    .filter((row: any) => String(row.testNo).startsWith(testPrefix))
    .map((row: any) => Number(String(row.testNo).slice(testPrefix.length)))
    .filter(Number.isFinite)
    .reduce((max: number, value: number) => Math.max(max, value), 0) + 1;
  let sampleNo: string | null = null;
  if (itemId != null) {
    const [item] = await tx.select({ itemCode: boqItems.itemCode, itemName: boqItems.itemName })
      .from(boqItems).where(eq(boqItems.id, itemId)).limit(1);
    const itemCode = String(item?.itemCode || item?.itemName || `ITEM${itemId}`)
      .toUpperCase().replace(/[^A-Z0-9]+/g, "").slice(0, 10) || `ITEM${itemId}`;
    const prefix = `${code}/${itemCode}/`;
    const sampleSequence = rows
      .filter((row: any) => String(row.sampleNo ?? "").startsWith(prefix))
      .map((row: any) => Number(String(row.sampleNo).slice(prefix.length)))
      .filter(Number.isFinite)
      .reduce((max: number, value: number) => Math.max(max, value), 0) + 1;
    sampleNo = `${prefix}${String(sampleSequence).padStart(4, "0")}`;
  }
  return { testNo: `${testPrefix}${String(testSequence).padStart(4, "0")}`, sampleNo };
}

async function writeAttachment(tx: any, testId: number, raw: any) {
  const attachment = safeAttachment(raw);
  await tx.delete(labTestAttachments).where(eq(labTestAttachments.labTestId, testId));
  if (attachment) await tx.insert(labTestAttachments).values({ labTestId: testId, ...attachment });
}

function actorName(req: any) {
  return String(req.authUser?.fullName ?? req.authUser?.email ?? `User ${req.authUser?.id ?? ""}`).trim();
}

function actorRole(req: any) {
  return req.authUser?.isOwner ? "owner" : req.authUser?.isAdmin ? "admin" : "manager";
}

async function attachBenchmarkFromProctor(tx: any, test: any, results: any) {
  const mdd = numeric(results?.mddGcc);
  const omc = numeric(results?.omcPercent);
  if (mdd == null || omc == null) return;
  const materialId = test.materialId == null ? null : Number(test.materialId);
  const sourceName = String(test.sampleSourceName ?? "").trim() || null;
  const clauses = [
    eq(materialBenchmarks.isActive, true),
    test.boqProjectId != null ? eq(materialBenchmarks.boqProjectId, test.boqProjectId) : isNull(materialBenchmarks.boqProjectId),
  ];
  if (materialId != null) clauses.push(eq(materialBenchmarks.materialId, materialId));
  else clauses.push(isNull(materialBenchmarks.materialId));
  if (sourceName) clauses.push(ilike(materialBenchmarks.sourceName, sourceName));
  else clauses.push(isNull(materialBenchmarks.sourceName));
  const existing = await tx.select().from(materialBenchmarks).where(and(...clauses)).limit(1);
  const values = {
    materialId,
    sourceName,
    boqProjectId: test.boqProjectId,
    mddGcc: mdd,
    omcPercent: omc,
    specificGravity: numeric(results.specificGravity),
    sourceTestId: test.id,
    effectiveFrom: test.dateTested || test.dateSampled,
    isActive: true,
    updatedAt: new Date(),
  };
  if (existing[0]) await tx.update(materialBenchmarks).set(values).where(eq(materialBenchmarks.id, existing[0].id));
  else await tx.insert(materialBenchmarks).values(values);
}

export function registerLabTestRoutes(app: Express) {
  app.get("/api/lab-tests/bootstrap", async (req: any, res) => {
    if (!assertView(req, res, "lab_tests")) return;
    const siteIds = await allowedSiteIds(req);
    try {
      const siteRows = await db.select().from(sites).where(and(eq(sites.isActive, 1), siteIds ? inArray(sites.id, siteIds) : sql`true`)).orderBy(asc(sites.name));
      const projects = await db.select({
        id: boqProjects.id, name: boqProjects.name, siteId: boqProjects.siteId,
        contractNo: boqProjects.contractNo, client: boqProjects.client,
        clientName: boqProjects.clientName, consultantName: boqProjects.consultantName,
      }).from(boqProjects)
        .where(and(eq(boqProjects.status, "active"), siteIds ? inArray(boqProjects.siteId, siteIds) : sql`true`))
        .orderBy(asc(boqProjects.name));
      const staff = await db.select({ id: personnel.id, name: personnel.name, role: personnel.role })
        .from(personnel).where(eq(personnel.isActive, 1)).orderBy(asc(personnel.name));
      const materials = await db.select({ id: plantMaterials.id, name: plantMaterials.name })
        .from(plantMaterials).where(eq(plantMaterials.isActive, 1)).orderBy(asc(plantMaterials.name));
      const projectId = Number(req.query.projectId);
      let items: any[] = [];
      if (Number.isInteger(projectId) && projectId > 0) {
        const project = await projectAllowed(req, res, projectId);
        if (!project) return;
        items = await db.select({ id: boqItems.id, itemCode: boqItems.itemCode, itemName: boqItems.itemName, description: boqItems.description, unit: boqItems.unit, layerConfig: boqItems.layerConfig })
          .from(boqItems).where(eq(boqItems.boqProjectId, projectId)).orderBy(asc(boqItems.sortOrder), asc(boqItems.id));
      }
      res.json({ sites: siteRows, projects, personnel: staff, materials, items });
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Could not load test setup." });
    }
  });

  app.get("/api/lab-tests/setup", async (req: any, res) => {
    if (!assertView(req, res, "lab_tests")) return;
    try {
      const siteId = Number(req.query.siteId);
      const projectId = Number(req.query.projectId);
      if (!Number.isInteger(siteId) || !Number.isInteger(projectId)) return res.status(400).json({ error: "Choose a site and BOQ project." });
      if (!await siteAllowed(req, res, siteId)) return;
      const project = await projectAllowed(req, res, projectId, siteId);
      if (!project) return;
      const calibrations = await db.select().from(labCalibrations)
        .where(or(eq(labCalibrations.siteId, siteId), isNull(labCalibrations.siteId)))
        .orderBy(desc(labCalibrations.calibratedOn), desc(labCalibrations.id));
      const benchmarks = await db.select().from(materialBenchmarks)
        .where(or(eq(materialBenchmarks.boqProjectId, projectId), isNull(materialBenchmarks.boqProjectId)))
        .orderBy(desc(materialBenchmarks.effectiveFrom));
      const specs = await db.select().from(boqItemQualitySpecs)
        .innerJoin(boqItems, eq(boqItemQualitySpecs.boqItemId, boqItems.id))
        .where(eq(boqItems.boqProjectId, projectId));
      res.json({ calibrations, benchmarks, specs: specs.map(row => row.boq_item_quality_specs) });
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Could not load test setup." });
    }
  });

  app.get("/api/lab-tests", async (req: any, res) => {
    if (!assertView(req, res, "lab_tests")) return;
    try {
      const conditions: any[] = [eq(labTests.isDeleted, false), eq(labTests.isCancelled, false)];
      const siteId = req.query.siteId ? Number(req.query.siteId) : null;
      const projectId = req.query.projectId ? Number(req.query.projectId) : null;
      const from = req.query.dateFrom ? String(req.query.dateFrom) : null;
      const to = req.query.dateTo ? String(req.query.dateTo) : null;
      const testType = req.query.testType ? String(req.query.testType) : null;
      const itemId = req.query.boqItemId ? Number(req.query.boqItemId) : null;
      const layerNo = req.query.layerNo ? Number(req.query.layerNo) : null;
      const verdict = req.query.verdict ? String(req.query.verdict) : null;
      const status = req.query.status ? String(req.query.status) : null;
      if (siteId) {
        if (!await siteAllowed(req, res, siteId)) return;
        conditions.push(eq(labTests.siteId, siteId));
      } else {
        const ids = await allowedSiteIds(req);
        if (ids?.length === 0) return res.json([]);
        if (ids) conditions.push(inArray(labTests.siteId, ids));
      }
      if (projectId) conditions.push(eq(labTests.boqProjectId, projectId));
      if (from) conditions.push(gte(labTests.dateSampled, from));
      if (to) conditions.push(lte(labTests.dateSampled, to));
      if (testType) conditions.push(eq(labTests.testType, testType));
      if (itemId) conditions.push(eq(labTests.boqItemId, itemId));
      if (layerNo) conditions.push(eq(labTests.layerNo, layerNo));
      if (verdict) conditions.push(eq(labTests.verdict, verdict));
      if (status) conditions.push(eq(labTests.status, status));
      const rows = await db.select({
        test: labTests,
        projectName: boqProjects.name,
        siteName: sites.name,
        itemName: boqItems.itemName,
        itemDescription: boqItems.description,
        engineerName: personnel.name,
      }).from(labTests)
        .innerJoin(boqProjects, eq(labTests.boqProjectId, boqProjects.id))
        .innerJoin(sites, eq(labTests.siteId, sites.id))
        .leftJoin(boqItems, eq(labTests.boqItemId, boqItems.id))
        .leftJoin(personnel, eq(labTests.siteEngineerPersonnelId, personnel.id))
        .where(and(...conditions))
        .orderBy(desc(labTests.dateSampled), desc(labTests.id))
        .limit(500);
      const ids = rows.map(row => row.test.id);
      const attachments = ids.length
        ? await db.select().from(labTestAttachments).where(inArray(labTestAttachments.labTestId, ids))
        : [];
      res.json(rows.map(row => ({
        ...row.test,
        projectName: row.projectName,
        siteName: row.siteName,
        itemLabel: row.itemName || row.itemDescription || "",
        engineerName: row.engineerName,
        attachments: attachments.filter(file => file.labTestId === row.test.id),
      })));
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Could not load tests." });
    }
  });

  app.get("/api/lab-tests/dpr/:dprId", async (req: any, res) => {
    if (!assertView(req, res, "site_dprs")) return;
    try {
      const dprId = Number(req.params.dprId);
      const [dpr] = await db.select().from(dprs).where(eq(dprs.id, dprId)).limit(1);
      if (!dpr) return res.status(404).json({ error: "dpr_not_found" });
      const [site] = await db.select().from(sites).where(ilike(sites.name, dpr.site)).limit(1);
      if (site && !await siteAllowed(req, res, site.id)) return;
      const rows = await db.select({
        id: labTests.id,
        testNo: labTests.testNo,
        testType: labTests.testType,
        boqItemId: labTests.boqItemId,
        layerNo: labTests.layerNo,
        chainageFrom: labTests.chainageFrom,
        chainageTo: labTests.chainageTo,
        verdict: labTests.verdict,
        results: labTests.results,
        itemName: boqItems.itemName,
        description: boqItems.description,
      }).from(labTests)
        .leftJoin(boqItems, eq(labTests.boqItemId, boqItems.id))
        .where(and(
          eq(labTests.siteId, site?.id ?? -1),
          eq(labTests.dateSampled, String(dpr.date).slice(0, 10)),
          eq(labTests.status, "submitted"),
          eq(labTests.isCancelled, false),
          eq(labTests.isDeleted, false),
        ))
        .orderBy(asc(labTests.testNo));
      res.json(rows.map(row => ({ ...row, testName: testNameForType(row.testType), itemLabel: row.itemName || row.description || "" })));
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Could not load DPR tests." });
    }
  });

  app.post("/api/lab-tests", async (req: any, res) => {
    if (!assertCreate(req, res, "lab_tests")) return;
    const parsed = validateInput(req.body);
    if (!parsed.success) return res.status(422).json({ error: "invalid_test", details: parsed.error.flatten() });
    const input = parsed.data;
    try {
      if (!await siteAllowed(req, res, input.siteId)) return;
      const project = await projectAllowed(req, res, input.boqProjectId, input.siteId);
      if (!project) return;
      if (!await validateReferences(input, res)) return;
      const calculationContext = await contextForTest(input);
      const calculation = calculateSoilLabTest(input.testType, input.readings, calculationContext);
      const attachment = safeAttachment(input.attachment);
      const status = input.status === "submitted" ? "submitted" : "draft";
      if (status === "submitted" && calculation.errors.length) {
        return res.status(422).json({ error: "test_incomplete", details: calculation.errors });
      }
      const saved = await db.transaction(async tx => {
        await tx.select({ id: boqProjects.id }).from(boqProjects)
          .where(eq(boqProjects.id, input.boqProjectId)).for("update");
        const numbers = await nextNumbers(tx, project, input.testType, input.boqItemId ?? null);
        const [row] = await tx.insert(labTests).values({
          boqProjectId: input.boqProjectId,
          siteId: input.siteId,
          testType: input.testType,
          testNo: numbers.testNo,
          sampleNo: numbers.sampleNo,
          dateSampled: input.dateSampled,
          dateTested: input.dateTested || null,
          place: input.place,
          boqItemId: input.boqItemId ?? null,
          layerNo: input.layerNo ?? null,
          chainageFrom: input.chainageFrom ?? null,
          chainageTo: input.chainageTo ?? null,
          side: input.side ?? null,
          sampleSourceKind: input.sampleSourceKind,
          sampleSourceName: input.sampleSourceName ?? null,
          materialId: input.materialId ?? null,
          siteEngineerPersonnelId: input.siteEngineerPersonnelId ?? null,
          sampledByPersonnelId: input.sampledByPersonnelId ?? null,
          testedByPersonnelId: input.testedByPersonnelId ?? null,
          header: input.header ?? {},
          readings: input.readings,
          results: calculation.results,
          verdict: calculation.verdict,
          status,
          remarks: input.remarks ?? null,
          createdByUserId: req.authUser.id,
          updatedAt: new Date(),
        }).returning();
        if (!row) throw new Error("Test save returned no row.");
        if (attachment) await tx.insert(labTestAttachments).values({ labTestId: row.id, ...attachment });
        if (status === "submitted" && input.useAsBenchmark && req.authUser?.isOwner === true
            && (row.testType === "proctor_light" || row.testType === "proctor_modified")) {
          await attachBenchmarkFromProctor(tx, row, calculation.results);
        }
        await tx.insert(auditLogs).values({
          module: "lab_test",
          transactionId: row.id,
          action: status === "submitted" ? "submit" : "create",
          userId: req.authUser.id,
          userName: actorName(req),
          userRole: actorRole(req),
          oldValues: null,
          newValues: { testNo: row.testNo, testType: row.testType, status },
        });
        return { ...row, attachments: attachment ? [{ id: 0, labTestId: row.id, ...attachment }] : [] };
      });
      res.status(201).json(saved);
    } catch (error: any) {
      res.status(error.status || 500).json({ error: error.message || "Could not save test." });
    }
  });

  async function replaceDraft(req: any, res: any, id: number, correction: boolean) {
    const parsed = validateInput(req.body);
    if (!parsed.success) return res.status(422).json({ error: "invalid_test", details: parsed.error.flatten() });
    const input = parsed.data;
    const [current] = await db.select().from(labTests).where(eq(labTests.id, id)).limit(1);
    if (!current) return res.status(404).json({ error: "test_not_found" });
    if (current.status !== "draft" && !correction) return res.status(409).json({ error: "submitted_read_only" });
    if (correction && (current.status !== "submitted" || current.isDeleted || current.isCancelled)) {
      return res.status(409).json({ error: "owner_correction_requires_active_submitted_test" });
    }
    if (!await siteAllowed(req, res, Number(current.siteId))) return;
    const project = await projectAllowed(req, res, input.boqProjectId, input.siteId);
    if (!project) return;
    if (!await validateReferences(input, res, current)) return;
    const calculationContext = await contextForTest(input);
    const calculation = calculateSoilLabTest(input.testType, input.readings, calculationContext);
    const attachment = safeAttachment(input.attachment);
    const status = correction ? "submitted" : input.status === "submitted" ? "submitted" : "draft";
    if (status === "submitted" && calculation.errors.length) {
      return res.status(422).json({ error: "test_incomplete", details: calculation.errors });
    }
    const saved = await db.transaction(async tx => {
      const [updated] = await tx.update(labTests).set({
        boqProjectId: input.boqProjectId,
        siteId: input.siteId,
        testType: input.testType,
        dateSampled: input.dateSampled,
        dateTested: input.dateTested || null,
        place: input.place,
        boqItemId: input.boqItemId ?? null,
        layerNo: input.layerNo ?? null,
        chainageFrom: input.chainageFrom ?? null,
        chainageTo: input.chainageTo ?? null,
        side: input.side ?? null,
        sampleSourceKind: input.sampleSourceKind,
        sampleSourceName: input.sampleSourceName ?? null,
        materialId: input.materialId ?? null,
        siteEngineerPersonnelId: input.siteEngineerPersonnelId ?? null,
        sampledByPersonnelId: input.sampledByPersonnelId ?? null,
        testedByPersonnelId: input.testedByPersonnelId ?? null,
        header: input.header ?? {},
        readings: input.readings,
        results: calculation.results,
        verdict: calculation.verdict,
        status,
        remarks: input.remarks ?? null,
        updatedAt: new Date(),
      }).where(eq(labTests.id, id)).returning();
      if (!updated) throw Object.assign(new Error("Test was not updated; reload and try again."), { status: 409 });
      await writeAttachment(tx, id, input.attachment);
      await tx.insert(auditLogs).values({
        module: "lab_test",
        transactionId: id,
        action: correction ? "owner_correction" : "edit",
        userId: req.authUser.id,
        userName: actorName(req),
        userRole: actorRole(req),
        oldValues: current,
        newValues: updated,
        reason: correction ? String(req.body.reason).trim() : null,
      });
      if (status === "submitted" && input.useAsBenchmark && req.authUser?.isOwner === true
          && (updated.testType === "proctor_light" || updated.testType === "proctor_modified")) {
        await attachBenchmarkFromProctor(tx, updated, calculation.results);
      }
      const attachments = await tx.select().from(labTestAttachments).where(eq(labTestAttachments.labTestId, id));
      return { ...updated, attachments };
    });
    return res.json(saved);
  }

  app.put("/api/lab-tests/:id", async (req: any, res) => {
    if (!assertEdit(req, res, "lab_tests")) return;
    try {
      const id = Number(req.params.id);
      const [current] = await db.select().from(labTests).where(eq(labTests.id, id)).limit(1);
      if (!current) return res.status(404).json({ error: "test_not_found" });
      if (current.status !== "draft") return res.status(409).json({ error: "submitted_read_only" });
      return await replaceDraft(req, res, id, false);
    } catch (error: any) {
      res.status(error.status || 500).json({ error: error.message || "Could not update draft." });
    }
  });

  app.post("/api/lab-tests/:id/correct", async (req: any, res) => {
    if (req.authUser?.isOwner !== true) return res.status(403).json({ error: "owner_required" });
    if (typeof req.body?.reason !== "string" || !req.body.reason.trim()) return res.status(422).json({ error: "reason_required" });
    try {
      return await replaceDraft(req, res, Number(req.params.id), true);
    } catch (error: any) {
      res.status(error.status || 500).json({ error: error.message || "Could not correct test." });
    }
  });

  app.post("/api/lab-tests/:id/cancel", async (req: any, res) => {
    if (req.authUser?.isOwner !== true) return res.status(403).json({ error: "owner_required" });
    const reason = String(req.body?.reason ?? "").trim();
    if (!reason) return res.status(422).json({ error: "reason_required" });
    try {
      const id = Number(req.params.id);
      const [test] = await db.select().from(labTests).where(eq(labTests.id, id)).limit(1);
      if (!test) return res.status(404).json({ error: "test_not_found" });
      if (!await siteAllowed(req, res, Number(test.siteId))) return;
      const [saved] = await db.update(labTests).set({
        isCancelled: true,
        cancelledAt: new Date(),
        cancelledBy: req.authUser.id,
        cancellationReason: reason,
        updatedAt: new Date(),
      }).where(eq(labTests.id, id)).returning();
      await db.insert(auditLogs).values({
        module: "lab_test", transactionId: id, action: "cancel",
        userId: req.authUser.id, userName: actorName(req), userRole: actorRole(req),
        oldValues: { isCancelled: test.isCancelled }, newValues: { isCancelled: true }, reason,
      });
      res.json(saved);
    } catch (error: any) {
      res.status(error.status || 500).json({ error: error.message || "Could not cancel test." });
    }
  });

  app.get("/api/lab-tests/:id/history", async (req: any, res) => {
    if (!assertView(req, res, "lab_tests")) return;
    try {
      const id = Number(req.params.id);
      const [test] = await db.select().from(labTests).where(eq(labTests.id, id)).limit(1);
      if (!test) return res.status(404).json({ error: "test_not_found" });
      if (!await siteAllowed(req, res, Number(test.siteId))) return;
      const history = await db.select().from(auditLogs).where(and(
        eq(auditLogs.module, "lab_test"), eq(auditLogs.transactionId, id),
      )).orderBy(asc(auditLogs.createdAt), asc(auditLogs.id));
      res.json(history);
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Could not load test history." });
    }
  });

  app.post("/api/lab-tests/:id/retest", async (req: any, res) => {
    if (!assertCreate(req, res, "lab_tests")) return;
    try {
      const original = await getTestWithAttachment(Number(req.params.id));
      if (!original) return res.status(404).json({ error: "test_not_found" });
      if (!await siteAllowed(req, res, Number(original.siteId))) return;
      const body = {
        boqProjectId: original.boqProjectId,
        siteId: original.siteId,
        testType: original.testType,
        dateSampled: new Date().toISOString().slice(0, 10),
        dateTested: null,
        place: original.place,
        boqItemId: original.boqItemId,
        layerNo: original.layerNo,
        chainageFrom: original.chainageFrom,
        chainageTo: original.chainageTo,
        side: original.side,
        sampleSourceKind: original.sampleSourceKind,
        sampleSourceName: original.sampleSourceName,
        materialId: original.materialId,
        siteEngineerPersonnelId: original.siteEngineerPersonnelId,
        sampledByPersonnelId: original.sampledByPersonnelId,
        testedByPersonnelId: original.testedByPersonnelId,
        header: original.header,
        readings: {},
        remarks: null,
        attachment: null,
      };
      const project = await projectAllowed(req, res, Number(original.boqProjectId), Number(original.siteId));
      if (!project) return;
      const saved = await db.transaction(async tx => {
        await tx.select({ id: boqProjects.id }).from(boqProjects)
          .where(eq(boqProjects.id, original.boqProjectId)).for("update");
        const numbers = await nextNumbers(tx, project, original.testType as SoilLabTestType, original.boqItemId);
        const [row] = await tx.insert(labTests).values({
          ...body,
          testNo: numbers.testNo,
          sampleNo: numbers.sampleNo,
          status: "draft",
          verdict: "na",
          results: {},
          createdByUserId: req.authUser.id,
          retestOfTestId: original.id,
        }).returning();
        if (!row) throw new Error("Retest was not created.");
        return row;
      });
      res.status(201).json(saved);
    } catch (error: any) {
      res.status(error.status || 500).json({ error: error.message || "Could not create retest." });
    }
  });

  app.post("/api/lab-tests/calibrations", async (req: any, res) => {
    if (req.authUser?.isOwner !== true) return res.status(403).json({ error: "owner_required" });
    try {
      const kind = String(req.body?.kind ?? "");
      if (!["sand_pouring_cylinder", "speedy_moisture_meter", "proving_ring", "core_cutter"].includes(kind)) {
        return res.status(422).json({ error: "invalid_calibration_kind" });
      }
      const attachment = safeAttachment(req.body?.attachment);
      const [row] = await db.insert(labCalibrations).values({
        siteId: req.body.siteId == null ? null : Number(req.body.siteId),
        kind,
        equipmentNo: String(req.body.equipmentNo ?? "").trim(),
        values: req.body.values ?? {},
        calibratedOn: String(req.body.calibratedOn ?? ""),
        validUntil: req.body.validUntil || null,
        calibratedByPersonnelId: req.body.calibratedByPersonnelId ? Number(req.body.calibratedByPersonnelId) : null,
        ...(attachment ?? { fileName: null, objectPath: null, mimeType: null, fileSize: null }),
      }).returning();
      if (!row) throw new Error("Calibration was not saved.");
      res.status(201).json(row);
    } catch (error: any) {
      res.status(422).json({ error: error.message || "Could not save calibration." });
    }
  });

  app.post("/api/lab-tests/benchmarks", async (req: any, res) => {
    if (req.authUser?.isOwner !== true) return res.status(403).json({ error: "owner_required" });
    try {
      const projectId = req.body.boqProjectId == null ? null : Number(req.body.boqProjectId);
      if (projectId != null) {
        const project = await projectAllowed(req, res, projectId);
        if (!project) return;
      }
      const [row] = await db.insert(materialBenchmarks).values({
        materialId: req.body.materialId == null ? null : Number(req.body.materialId),
        sourceName: req.body.sourceName ? String(req.body.sourceName).trim() : null,
        boqProjectId: projectId,
        mddGcc: Number(req.body.mddGcc),
        omcPercent: Number(req.body.omcPercent),
        specificGravity: req.body.specificGravity == null ? null : Number(req.body.specificGravity),
        sourceTestId: req.body.sourceTestId == null ? null : Number(req.body.sourceTestId),
        effectiveFrom: String(req.body.effectiveFrom ?? ""),
        isActive: req.body.isActive !== false,
      }).returning();
      res.status(201).json(row);
    } catch (error: any) {
      res.status(422).json({ error: error.message || "Could not save benchmark." });
    }
  });

  app.patch("/api/lab-tests/benchmarks/:id", async (req: any, res) => {
    if (req.authUser?.isOwner !== true) return res.status(403).json({ error: "owner_required" });
    const reason = String(req.body?.reason ?? "").trim();
    if (!reason) return res.status(422).json({ error: "reason_required" });
    try {
      const id = Number(req.params.id);
      const [current] = await db.select().from(materialBenchmarks).where(eq(materialBenchmarks.id, id)).limit(1);
      if (!current) return res.status(404).json({ error: "benchmark_not_found" });
      const projectId = req.body.boqProjectId === undefined ? current.boqProjectId
        : req.body.boqProjectId == null ? null : Number(req.body.boqProjectId);
      if (projectId != null && !await projectAllowed(req, res, projectId)) return;
      const patch: any = { updatedAt: new Date() };
      for (const key of ["materialId", "sourceName", "boqProjectId", "mddGcc", "omcPercent", "specificGravity", "effectiveFrom", "isActive"] as const) {
        if (!(key in req.body)) continue;
        if (key === "materialId" || key === "boqProjectId" || key === "specificGravity") {
          patch[key] = req.body[key] == null || req.body[key] === "" ? null : Number(req.body[key]);
        } else if (key === "mddGcc" || key === "omcPercent") patch[key] = Number(req.body[key]);
        else if (key === "sourceName") patch[key] = String(req.body[key] ?? "").trim() || null;
        else if (key === "isActive") patch[key] = req.body[key] === true;
        else patch[key] = String(req.body[key]);
      }
      const [updated] = await db.update(materialBenchmarks).set(patch).where(eq(materialBenchmarks.id, id)).returning();
      if (!updated) return res.status(409).json({ error: "benchmark_update_returned_no_row" });
      await db.insert(auditLogs).values({
        module: "lab_test", transactionId: id, action: updated.isActive ? "benchmark_edit" : "benchmark_deactivate",
        userId: req.authUser.id, userName: actorName(req), userRole: actorRole(req),
        oldValues: current, newValues: updated, reason,
      });
      res.json(updated);
    } catch (error: any) {
      res.status(422).json({ error: error.message || "Could not update benchmark." });
    }
  });

  app.post("/api/lab-tests/specs/:boqItemId", async (req: any, res) => {
    if (req.authUser?.isOwner !== true) return res.status(403).json({ error: "owner_required" });
    const itemId = Number(req.params.boqItemId);
    const rows = Array.isArray(req.body?.specs) ? req.body.specs : [];
    try {
      const [item] = await db.select().from(boqItems).where(eq(boqItems.id, itemId)).limit(1);
      if (!item) return res.status(404).json({ error: "boq_item_not_found" });
      const project = await projectAllowed(req, res, Number(item.boqProjectId));
      if (!project) return;
      const normalized = rows.map((row: any) => ({
        testType: String(row.testType),
        minValue: row.minValue == null || row.minValue === "" ? null : Number(row.minValue),
        maxValue: row.maxValue == null || row.maxValue === "" ? null : Number(row.maxValue),
        frequencyQty: Number(row.frequencyQty),
        frequencyUnit: String(row.frequencyUnit),
        note: row.note ? String(row.note) : null,
      }));
      await db.transaction(async tx => {
        for (const spec of normalized) {
          const [saved] = await tx.insert(boqItemQualitySpecs).values({ boqItemId: itemId, ...spec, updatedAt: new Date() })
            .onConflictDoUpdate({
              target: [boqItemQualitySpecs.boqItemId, boqItemQualitySpecs.testType],
              set: { ...spec, updatedAt: new Date() },
            }).returning();
          if (!saved) throw new Error(`Could not save ${spec.testType} quality specification.`);
        }
      });
      res.json({ ok: true, count: normalized.length });
    } catch (error: any) {
      res.status(422).json({ error: error.message || "Could not save quality specifications." });
    }
  });

  app.get("/api/lab-tests/layer-register", async (req: any, res) => {
    if (!assertView(req, res, "lab_tests")) return;
    try {
      const projectId = Number(req.query.projectId);
      const boqItemId = Number(req.query.boqItemId);
      const project = await projectAllowed(req, res, projectId);
      if (!project) return;
      const conditions: any[] = [
        eq(labTests.boqProjectId, projectId),
        eq(labTests.boqItemId, boqItemId),
        inArray(labTests.testType, ["field_density_sand", "field_density_core_cutter"]),
        eq(labTests.status, "submitted"),
        eq(labTests.isCancelled, false),
        eq(labTests.isDeleted, false),
      ];
      const rows = await db.select().from(labTests).where(and(...conditions))
        .orderBy(desc(labTests.dateTested), desc(labTests.id));
      const latest = new Map<string, any>();
      for (const test of rows) {
        const pits = Array.isArray((test.readings as any)?.pits) ? (test.readings as any).pits : [];
        const results = Array.isArray((test.results as any)?.pits) ? (test.results as any).pits : [];
        const locations = pits.length
          ? pits.map((pit: any, index: number) => ({ chainage: numeric(pit.chainage) ?? test.chainageFrom, result: results[index] ?? null }))
          : [{ chainage: test.chainageFrom, result: (test.results as any)?.pits?.[0] ?? null }];
        for (const location of locations) {
          if (location.chainage == null) continue;
          const km = Number(location.chainage);
          const from = req.query.chainageFrom == null ? null : Number(req.query.chainageFrom);
          const to = req.query.chainageTo == null ? null : Number(req.query.chainageTo);
          if (from != null && km < from || to != null && km >= to) continue;
          const key = `${Math.floor(km * 10) / 10}:${test.layerNo ?? ""}`;
          if (!latest.has(key)) latest.set(key, {
            ...test,
            chainageFrom: km,
            verdict: location.result?.verdict ?? test.verdict,
            results: location.result ?? test.results,
          });
        }
      }
      res.json(Array.from(latest.values()));
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Could not load the layer register." });
    }
  });

  app.get("/api/lab-tests/frequency", async (req: any, res) => {
    if (!assertView(req, res, "lab_tests")) return;
    try {
      const projectId = Number(req.query.projectId);
      const project = await projectAllowed(req, res, projectId);
      if (!project) return;
      const items = await db.select().from(boqItems).where(eq(boqItems.boqProjectId, projectId)).orderBy(asc(boqItems.sortOrder), asc(boqItems.id));
      const output = [];
      for (const item of items) {
        const savedSpecs = await db.select().from(boqItemQualitySpecs).where(eq(boqItemQualitySpecs.boqItemId, item.id));
        const specs = savedSpecs.length ? savedSpecs : soilQualityDefaultsForWork(`${item.itemName ?? ""} ${item.description ?? ""}`)
          .map(spec => ({
            boqItemId: item.id, testType: spec.testType, minValue: spec.minValue,
            maxValue: spec.maxValue, frequencyQty: spec.frequencyQty, frequencyUnit: spec.frequencyUnit, note: spec.note,
          }));
        for (const spec of specs) {
          const progress = await db.select({
            quantity: progressEntries.quantity,
            uom: progressEntries.uom,
            length: progressEntries.length,
            width: progressEntries.width,
            dprStatus: dprs.dprStatus,
            isDeleted: dprs.isDeleted,
            isCancelled: dprs.isCancelled,
            isSuperseded: dprs.isSuperseded,
            isIncidental: progressEntries.isIncidental,
            reworkNoNewMaterial: progressEntries.reworkNoNewMaterial,
          })
            .from(progressEntries).innerJoin(dprs, eq(progressEntries.dprId, dprs.id))
            .where(and(
              eq(dprs.boqProjectId, projectId),
              eq(dprs.dprStatus, "submitted"),
              or(eq(dprs.isDeleted, false), isNull(dprs.isDeleted)),
              or(eq(dprs.isCancelled, false), isNull(dprs.isCancelled)),
              or(eq(dprs.isSuperseded, false), isNull(dprs.isSuperseded)),
              eq(progressEntries.boqItemId, item.id),
              eq(progressEntries.isIncidental, false),
              or(eq(progressEntries.reworkNoNewMaterial, false), isNull(progressEntries.reworkNoNewMaterial)),
            ));
          const unitKey = (unit: unknown) => String(unit ?? "").trim().toLowerCase().replace(/[\s²³]/g, "").replace("m³", "cum");
          const targetKey = unitKey(spec.frequencyUnit);
          let quantityLaid = 0;
          let comparable = true;
          for (const row of progress) {
            const rowUnit = unitKey(row.uom || item.unit);
            let quantity = Number(row.quantity) || 0;
            if (targetKey === "sqm" && row.length != null && row.width != null) {
              quantity = Number(row.length) * Number(row.width);
            } else if (rowUnit !== targetKey) {
              const factor = getUnitConversionFactor(String(row.uom || item.unit), String(spec.frequencyUnit), {
                densityTPerCum: null,
                thicknessMm: numeric((item.layerConfig as any)?.thicknessMm ?? (item.layerConfig as any)?.thickness),
              });
              if (factor == null) comparable = false;
              else quantity *= factor;
            }
            quantityLaid += quantity;
          }
          const tests = await db.select().from(labTests).where(and(
            eq(labTests.boqProjectId, projectId), eq(labTests.boqItemId, item.id),
            eq(labTests.testType, spec.testType), eq(labTests.status, "submitted"),
            eq(labTests.isCancelled, false), eq(labTests.isDeleted, false),
          ));
          const required = spec.frequencyUnit === "as_required" ? 0 : Math.ceil(quantityLaid / Number(spec.frequencyQty));
          output.push({
            boqItemId: item.id, itemName: item.itemName || item.description,
            testType: spec.testType, frequencyQty: spec.frequencyQty, frequencyUnit: spec.frequencyUnit,
            quantityLaid: comparable ? Math.round(quantityLaid * 100) / 100 : null,
            quantityUnit: spec.frequencyUnit, quantityComparable: comparable,
            testsRequired: comparable ? required : null, testsDone: tests.length,
            testsPassed: tests.filter(test => test.verdict === "pass").length,
            shortfall: comparable ? Math.max(0, required - tests.length) : null,
          });
        }
      }
      res.json(output);
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Could not calculate test frequency." });
    }
  });
}
