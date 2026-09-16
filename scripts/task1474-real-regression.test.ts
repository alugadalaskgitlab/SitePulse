/**
 * Task 1474 — opt-in PostgreSQL-backed DPR recovery regression.
 *
 * This file intentionally lives outside vitest.config.ts's default include
 * pattern.  It is an integration harness, not a normal suite test:
 *
 *   NODE_ENV=development TASK1474_REAL_DB=1 \
 *     npx vitest run --config scripts/task1474-vitest.config.ts --no-file-parallelism
 *
 * The harness connects using the same development-database selection as
 * server/db.ts, creates a private shadow schema containing the current public
 * table shapes, and points the imported application pool at that schema via
 * search_path.  No public table is mutated.  The schema is dropped in
 * afterAll, including when an assertion fails.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import express from "express";
import { createServer, type Server } from "node:http";
import pg from "pg";
import request from "supertest";

// Authentication is the only application boundary mocked here. Storage, db,
// route registration, validation, and every SQL query remain real.
vi.mock("../server/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../server/auth")>();
  const fakeAdmin = {
    id: 1474,
    username: "task1474-test-admin",
    fullName: "Task 1474 Test Admin",
    isAdmin: true,
    isOwner: false,
    isActive: true,
    sessionPolicy: "sticky",
  };
  const inject = (req: any, _res: any, next: any) => {
    req.authUser = fakeAdmin;
    req.authPermissions = {};
    next();
  };
  return { ...actual, requireAuth: inject, optionalAuth: inject };
});

const { Pool } = pg;
const REAL_DB_ENABLED = process.env.TASK1474_REAL_DB === "1";
const suite = describe.skipIf(!REAL_DB_ENABLED);

const SITE_ID = 1_474_101;
const PROJECT_ID = 1_474_201;
const ITEM_ID = 1_474_301;
const BAR_ID = 1_474_401;
const EMPTY_DPR_ID = 1_474_501;
const NESTED_DPR_ID = 1_474_502;
const NOREF_DPR_ID = 1_474_503;
const FOREIGN_DPR_ID = 1_474_504;
const PINNED_DPR_ID = 1_474_505;
const PERSISTED_DPR_ID = 1_474_506;
const SUBMIT_DPR_ID = 1_474_507;
const VERSION_DPR_ID = 1_474_508;
const CLEARED_DPR_ID = 1_474_509;
const FOREIGN_SITE_ID = 1_474_106;
const DUPLICATE_SITE_ID = 1_474_107;
const FOREIGN_PROJECT_ID = 1_474_206;
const FOREIGN_ITEM_ID = 1_474_306;
const EQUIPMENT_ID = 1_474_601;
const PERSISTED_EQUIPMENT_ID = 1_474_602;
const SEGMENT_ID = 1_474_701;
const PERSISTED_SEGMENT_ID = 1_474_702;
const SEGMENT_ITEM_ID = 1_474_801;
const PERSISTED_SEGMENT_ITEM_ID = 1_474_802;
const SENTINEL_DPR_ID = 1_474_901;
const SENTINEL_PLANT_MATERIAL_ID = 1_474_902;
const SENTINEL_PLANNING_EQUIPMENT_ID = 1_474_903;
const SENTINEL_SETTING_ID = 1_474_904;
const SNL_SOURCE_BASE_ID = 1_474_910;
const CLEARED_PROGRESS_ID = 1_474_920;

const SITE_NAME = "TASK1474-SAME-SITE";
const FOREIGN_SITE_NAME = "TASK1474-OTHER-SITE";
const REPORT_DATE = "2026-09-14";
const NESTED_REPORT_DATE = "2026-09-15";
const VERSION_REPORT_DATE = "2026-09-16";

let schemaName = "";
let adminPool: pg.Pool | undefined;
let applicationPool: pg.Pool | undefined;
let applicationUrlKey: "DEV_DATABASE_URL" | "DATABASE_URL" | undefined;
let applicationUrlBefore: string | undefined;
let app: express.Express;
let httpServer: Server;
let storage: (typeof import("../server/storage"))["storage"];
let registerRoutes: (typeof import("../server/routes"))["registerRoutes"];

function quoteIdentifier(identifier: string): string {
  if (!/^[a-z_][a-z0-9_]*$/i.test(identifier)) {
    throw new Error(`Unsafe SQL identifier in test harness: ${identifier}`);
  }
  return `"${identifier.replace(/"/g, `""`)}"`;
}

function appSearchPathUrl(base: string, schema: string): string {
  const parsed = new URL(base);
  parsed.searchParams.set("options", `-c search_path=${schema},public`);
  return parsed.toString();
}

async function clonePublicTablesIntoShadowSchema(): Promise<void> {
  if (!adminPool) throw new Error("Admin pool was not initialized");
  const schema = quoteIdentifier(schemaName);
  await adminPool.query(`CREATE SCHEMA ${schema}`);

  const tables = await adminPool.query<{ tablename: string }>(`
    SELECT tablename
    FROM pg_catalog.pg_tables
    WHERE schemaname = 'public'
    ORDER BY tablename
  `);
  for (const { tablename } of tables.rows) {
    await adminPool.query(
      `CREATE TABLE ${schema}.${quoteIdentifier(tablename)}
       (LIKE public.${quoteIdentifier(tablename)}
        INCLUDING DEFAULTS INCLUDING CONSTRAINTS INCLUDING INDEXES)`,
    );
  }

  // LIKE copies serial defaults verbatim, which would otherwise point at
  // public sequences. Replace every nextval default with a schema-local
  // sequence before application code is imported.
  const sequenceColumns = await adminPool.query<{
    table_name: string;
    column_name: string;
  }>(`
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND column_default LIKE 'nextval(%'
    ORDER BY table_name, ordinal_position
  `);
  for (let i = 0; i < sequenceColumns.rows.length; i++) {
    const { table_name: tableName, column_name: columnName } = sequenceColumns.rows[i];
    const sequenceName = `task1474_seq_${String(i).padStart(4, "0")}`;
    await adminPool.query(`CREATE SEQUENCE ${schema}.${quoteIdentifier(sequenceName)}`);
    await adminPool.query(`
      ALTER TABLE ${schema}.${quoteIdentifier(tableName)}
      ALTER COLUMN ${quoteIdentifier(columnName)}
      SET DEFAULT nextval('${schemaName}.${sequenceName}'::regclass)
    `);
  }
}

async function seedSyntheticRows(): Promise<void> {
  if (!adminPool) throw new Error("Admin pool was not initialized");
  const schema = quoteIdentifier(schemaName);
  const insert = (table: string, columns: string, values: unknown[]) =>
    adminPool!.query(
      `INSERT INTO ${schema}.${quoteIdentifier(table)} (${columns}) VALUES (${values.map((_, i) => `$${i + 1}`).join(", ")})`,
      values,
    );

  // These sentinels prevent registerRoutes' asynchronous startup seeders from
  // importing fixtures or creating an example DPR in the isolated schema.
  await insert("dprs", "id, date, site, engineer, dpr_status, work_type, is_superseded, is_deleted, is_cancelled", [
    SENTINEL_DPR_ID, REPORT_DATE, "TASK1474-STARTUP-SENTINEL", "TASK1474", "submitted", "road", false, false, false,
  ]);
  await insert("plant_materials", "id, name, is_active", [
    SENTINEL_PLANT_MATERIAL_ID, "TASK1474 STARTUP SENTINEL", 1,
  ]);
  await insert("planning_equipment_types", "id, name, is_active", [
    SENTINEL_PLANNING_EQUIPMENT_ID, "TASK1474 STARTUP SENTINEL", true,
  ]);
  await insert("app_settings", "id, key, value", [
    SENTINEL_SETTING_ID, "snl_seed_version", "v4-sdb-multi-sector",
  ]);
  const sourceCodes = ["SDB_ROAD", "SDB_STRUCTURES", "SDB_IRRIGATION", "SDB_GATES"];
  for (let i = 0; i < sourceCodes.length; i++) {
    await insert("snl_sources", "id, code, name, authority, is_active", [
      SNL_SOURCE_BASE_ID + i, sourceCodes[i], `Task 1474 ${sourceCodes[i]}`, "Task 1474", true,
    ]);
  }

  await insert("sites", "id, name, is_active", [SITE_ID, SITE_NAME, 1]);
  await insert("sites", "id, name, is_active", [FOREIGN_SITE_ID, FOREIGN_SITE_NAME, 1]);
  await insert("boq_projects", "id, site_id, name, status", [
    PROJECT_ID, SITE_ID, "Task 1474 Same-Site Project", "active",
  ]);
  await insert("boq_projects", "id, site_id, name, status", [
    FOREIGN_PROJECT_ID, FOREIGN_SITE_ID, "Task 1474 Foreign Project", "active",
  ]);
  await insert(
    "boq_items",
    "id, boq_project_id, item_code, description, unit, boq_qty, current_qty, dpr_measurement_method",
    [ITEM_ID, PROJECT_ID, "TASK-300-CUM", "Task 1474 concrete 300 CUM", "CUM", 1_000, 1_000, "CUM_LWT"],
  );
  await insert(
    "boq_items",
    "id, boq_project_id, item_code, description, unit, boq_qty, current_qty, dpr_measurement_method",
    [FOREIGN_ITEM_ID, FOREIGN_PROJECT_ID, "TASK-FOREIGN", "Task 1474 foreign item", "CUM", 1_000, 1_000, "CUM_LWT"],
  );
  await insert(
    "work_program_bars",
    "id, boq_project_id, boq_item_id, chainage_from, chainage_to, start_month, end_month, planned_qty, scheduled, side, planned_width_m, planned_thickness_mm",
    [BAR_ID, PROJECT_ID, ITEM_ID, 0, 0.8, 1, 2, 300, true, "rhs", 1.5, 250],
  );

  await insert(
    "dprs",
    "id, date, site, engineer, dpr_status, work_type, boq_project_id, is_superseded, is_deleted, is_cancelled",
    [EMPTY_DPR_ID, REPORT_DATE, SITE_NAME, "TASK1474 ENGINEER", "draft", "road", null, false, false, false],
  );
  await insert(
    "dprs",
    "id, date, site, engineer, dpr_status, work_type, boq_project_id, is_superseded, is_deleted, is_cancelled",
    [NESTED_DPR_ID, NESTED_REPORT_DATE, SITE_NAME, "TASK1474 ENGINEER", "draft", "road", null, false, false, false],
  );
  await insert(
    "dprs",
    "id, date, site, engineer, dpr_status, work_type, boq_project_id, is_superseded, is_deleted, is_cancelled",
    [NOREF_DPR_ID, REPORT_DATE, SITE_NAME, "TASK1474 ENGINEER", "draft", "road", null, false, false, false],
  );
  await insert(
    "dprs",
    "id, date, site, engineer, dpr_status, work_type, boq_project_id, is_superseded, is_deleted, is_cancelled",
    [FOREIGN_DPR_ID, REPORT_DATE, SITE_NAME, "TASK1474 ENGINEER", "draft", "road", null, false, false, false],
  );
  await insert(
    "dprs",
    "id, date, site, engineer, dpr_status, work_type, boq_project_id, is_superseded, is_deleted, is_cancelled",
    [PINNED_DPR_ID, REPORT_DATE, SITE_NAME, "TASK1474 ENGINEER", "draft", "road", PROJECT_ID, false, false, false],
  );
  await insert(
    "dprs",
    "id, date, site, engineer, dpr_status, work_type, boq_project_id, is_superseded, is_deleted, is_cancelled",
    [PERSISTED_DPR_ID, NESTED_REPORT_DATE, SITE_NAME, "TASK1474 ENGINEER", "draft", "road", null, false, false, false],
  );
  await insert(
    "dprs",
    "id, date, site, engineer, dpr_status, work_type, boq_project_id, is_superseded, is_deleted, is_cancelled",
    [SUBMIT_DPR_ID, REPORT_DATE, SITE_NAME, "TASK1474 ENGINEER", "draft", "road", null, false, false, false],
  );
  await insert(
    "dprs",
    "id, date, site, engineer, dpr_status, work_type, boq_project_id, is_superseded, is_deleted, is_cancelled",
    [VERSION_DPR_ID, VERSION_REPORT_DATE, SITE_NAME, "TASK1474 ENGINEER", "submitted", "road", null, false, false, false],
  );
  await insert(
    "dprs",
    "id, date, site, engineer, dpr_status, work_type, boq_project_id, is_superseded, is_deleted, is_cancelled",
    [CLEARED_DPR_ID, REPORT_DATE, SITE_NAME, "TASK1474 ENGINEER", "draft", "road", null, false, false, false],
  );
  await insert(
    "progress_entries",
    "id, dpr_id, activity, boq_item_id",
    [CLEARED_PROGRESS_ID, CLEARED_DPR_ID, "PERSISTED WORK TO CLEAR", ITEM_ID],
  );
  await insert(
    "equipment_logs",
    "id, dpr_id, machine",
    [EQUIPMENT_ID, NESTED_DPR_ID, "TASK1474 PAVER"],
  );
  await insert(
    "equipment_activity_segments",
    "id, equipment_log_id, start_time, end_time, hours_worked",
    [SEGMENT_ID, EQUIPMENT_ID, "08:00", "09:00", 1],
  );
  await insert(
    "equipment_activity_segment_boq_items",
    "id, segment_id, boq_item_id, programme_bar_id",
    [SEGMENT_ITEM_ID, SEGMENT_ID, FOREIGN_ITEM_ID, null],
  );
  await insert(
    "equipment_logs",
    "id, dpr_id, machine",
    [PERSISTED_EQUIPMENT_ID, PERSISTED_DPR_ID, "TASK1474 PAVER"],
  );
  await insert(
    "equipment_activity_segments",
    "id, equipment_log_id, start_time, end_time, hours_worked",
    [PERSISTED_SEGMENT_ID, PERSISTED_EQUIPMENT_ID, "08:00", "09:00", 1],
  );
  await insert(
    "equipment_activity_segment_boq_items",
    "id, segment_id, boq_item_id, programme_bar_id",
    [PERSISTED_SEGMENT_ITEM_ID, PERSISTED_SEGMENT_ID, ITEM_ID, BAR_ID],
  );
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function targetProgress(activity: string) {
  return {
    activity,
    chainageFrom: "0",
    chainageTo: "0.8",
    side: "RHS",
    length: 800,
    width: 1.5,
    thickness: 0.25,
    quantity: 300,
    uom: "CUM",
    boqItemId: ITEM_ID,
    programmeBarId: BAR_ID,
  };
}

suite("Task 1474 real storage/query and route regression", () => {
  beforeAll(async () => {
    if (process.env.NODE_ENV !== "development") {
      throw new Error("Refusing Task 1474 integration test outside NODE_ENV=development");
    }
    const baseUrl =
      process.env.DEV_DATABASE_URL || process.env.DATABASE_URL;
    if (!baseUrl) throw new Error("DATABASE_URL or DEV_DATABASE_URL is required");

    schemaName = `task1474_${process.pid}_${Math.floor(Math.random() * 1_000_000)}`;
    adminPool = new Pool({ connectionString: baseUrl });
    await clonePublicTablesIntoShadowSchema();
    await seedSyntheticRows();

    applicationUrlKey = process.env.DEV_DATABASE_URL ? "DEV_DATABASE_URL" : "DATABASE_URL";
    applicationUrlBefore = process.env[applicationUrlKey];
    process.env[applicationUrlKey] = appSearchPathUrl(baseUrl, schemaName);

    // Dynamic imports are deliberate: server/db.ts chooses its connection
    // string at module evaluation time, after the isolated search_path exists.
    ({ pool: applicationPool } = await import("../server/db"));
    ({ storage } = await import("../server/storage"));
    ({ registerRoutes } = await import("../server/routes"));

    app = express();
    app.use(express.json());
    httpServer = createServer(app);
    await registerRoutes(httpServer, app);
    // registerRoutes starts idempotent migrations/seeds in the background.
    // Sentinels make those no-op; allow their reads to drain before assertions.
    await sleep(1_000);
  }, 60_000);

  afterAll(async () => {
    // Let registerRoutes' intentionally detached startup work finish before
    // dropping its search-path tables.
    await sleep(1_000);
    if (schemaName && adminPool) {
      await adminPool.query(`DROP SCHEMA IF EXISTS ${quoteIdentifier(schemaName)} CASCADE`);
    }
    await applicationPool?.end();
    await adminPool?.end();
    if (applicationUrlKey) {
      if (applicationUrlBefore === undefined) delete process.env[applicationUrlKey];
      else process.env[applicationUrlKey] = applicationUrlBefore;
    }
  }, 60_000);

  it("proves site_purchases has no boq_item_id and the invalid legacy query fails", async () => {
    const columns = await adminPool!.query(
      `
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = $1
          AND table_name = 'site_purchases'
          AND column_name = 'boq_item_id'
      `,
      [schemaName],
    );
    expect(columns.rows).toHaveLength(0);

    await expect(
      adminPool!.query(
        `SELECT boq_item_id FROM ${quoteIdentifier(schemaName)}."site_purchases" LIMIT 1`,
      ),
    ).rejects.toMatchObject({ code: "42703" });
  });

  it("PATCHes an empty null-project draft, then GETs the same persisted project/item/programme geometry", async () => {
    const emptyBefore = await request(app)
      .get(`/api/dprs/${EMPTY_DPR_ID}`)
      .expect(200);
    expect(emptyBefore.body.boqProjectId).toBeNull();
    expect(emptyBefore.body.progress).toEqual([]);

    const recoveryPayload = {
      date: REPORT_DATE,
      site: SITE_NAME,
      engineer: "TASK1474 ENGINEER",
      dprStatus: "draft",
      workType: "road",
      boqProjectId: PROJECT_ID,
      progress: [{
        activity: "CONCRETE 300 CUM",
        chainageFrom: "0",
        chainageTo: "0.8",
        side: "RHS",
        length: 800,
        width: 1.5,
        thickness: 0.25,
        quantity: 300,
        uom: "CUM",
        boqItemId: ITEM_ID,
        programmeBarId: BAR_ID,
      }],
      equipment: [],
      labour: [],
      materials: [],
      sitePurchases: [],
      structureItems: [],
    };

    const saved = await request(app)
      .patch(`/api/dprs/${EMPTY_DPR_ID}/draft`)
      .send(recoveryPayload)
      .expect(200);
    expect(saved.body.id).toBe(EMPTY_DPR_ID);
    expect(saved.body.boqProjectId).toBe(PROJECT_ID);

    const reopened = await request(app)
      .get(`/api/dprs/${EMPTY_DPR_ID}`)
      .expect(200);
    expect(reopened.body.boqProjectId).toBe(PROJECT_ID);
    expect(reopened.body.site).toBe(SITE_NAME);
    expect(reopened.body.progress).toHaveLength(1);
    expect(reopened.body.progress[0]).toEqual(expect.objectContaining({
      boqItemId: ITEM_ID,
      programmeBarId: BAR_ID,
      side: "RHS",
      chainageFrom: "0",
      chainageTo: "0.8",
      length: 800,
      width: 1.5,
      thickness: 0.25,
      quantity: 300,
      uom: "CUM",
    }));
  });

  it("submits a saved-null draft with incoming same-project BOQ evidence", async () => {
    const submitted = await request(app)
      .post(`/api/dprs/${SUBMIT_DPR_ID}/submit`)
      .send({
        date: REPORT_DATE,
        site: SITE_NAME,
        engineer: "TASK1474 ENGINEER",
        dprStatus: "draft",
        workType: "road",
        boqProjectId: PROJECT_ID,
        progress: [targetProgress("SUBMITTED 300 CUM")],
        equipment: [],
        labour: [],
        materials: [],
        sitePurchases: [],
        structureItems: [],
      })
      .expect(200);
    expect(submitted.body.boqProjectId).toBe(PROJECT_ID);
    expect(submitted.body.dprStatus).toBe("submitted");

    const reopened = await request(app)
      .get(`/api/dprs/${SUBMIT_DPR_ID}`)
      .expect(200);
    expect(reopened.body.boqProjectId).toBe(PROJECT_ID);
    expect(reopened.body.progress[0]).toEqual(expect.objectContaining({
      boqItemId: ITEM_ID,
      programmeBarId: BAR_ID,
      quantity: 300,
    }));
  });

  it("versions a saved-null submitted DPR with incoming same-project BOQ evidence", async () => {
    const versioned = await request(app)
      .post(`/api/dprs/${VERSION_DPR_ID}/version`)
      .send({
        data: {
          date: VERSION_REPORT_DATE,
          site: SITE_NAME,
          engineer: "TASK1474 ENGINEER",
          role: "manager",
          workType: "road",
          boqProjectId: PROJECT_ID,
          progress: [targetProgress("VERSIONED 300 CUM")],
          equipment: [],
          labour: [],
          materials: [],
          sitePurchases: [],
          structureItems: [],
        },
      })
      .expect(201);
    expect(versioned.body.boqProjectId).toBe(PROJECT_ID);

    const reopened = await request(app)
      .get(`/api/dprs/${versioned.body.id}`)
      .expect(200);
    expect(reopened.body.boqProjectId).toBe(PROJECT_ID);
    expect(reopened.body.progress[0]).toEqual(expect.objectContaining({
      boqItemId: ITEM_ID,
      programmeBarId: BAR_ID,
      quantity: 300,
    }));
  });

   it("keeps a saved null project null when the replacement has no BOQ evidence", async () => {
     const response = await request(app)
       .patch(`/api/dprs/${NOREF_DPR_ID}/draft`)
       .send({
         date: REPORT_DATE,
         site: SITE_NAME,
         engineer: "TASK1474 ENGINEER",
         dprStatus: "draft",
         workType: "road",
         boqProjectId: PROJECT_ID,
         progress: [],
         equipment: [],
         labour: [],
         materials: [],
         sitePurchases: [],
         structureItems: [],
       })
       .expect(200);
     expect(response.body.boqProjectId).toBeNull();
     const reopened = await request(app).get(`/api/dprs/${NOREF_DPR_ID}`).expect(200);
     expect(reopened.body.boqProjectId).toBeNull();
   });

    it("does not recover when replacement clears all persisted BOQ references", async () => {
      // Startup's normal null-header backfill intentionally repairs simple
      // progress links. Recreate the saved-null state after startup so this
      // test exercises replacement clearing rather than migration behavior.
      await adminPool!.query(
        `UPDATE ${quoteIdentifier(schemaName)}."dprs"
         SET boq_project_id = NULL, is_superseded = FALSE
         WHERE id = $1`,
        [CLEARED_DPR_ID],
      );
      const before = await request(app)
        .get(`/api/dprs/${CLEARED_DPR_ID}`)
        .expect(200);
      expect(before.body.boqProjectId).toBeNull();
      expect(before.body.progress).toEqual(expect.arrayContaining([
        expect.objectContaining({ boqItemId: ITEM_ID }),
      ]));

      const response = await request(app)
        .patch(`/api/dprs/${CLEARED_DPR_ID}/draft`)
        .send({
          date: REPORT_DATE,
          site: SITE_NAME,
          engineer: "TASK1474 ENGINEER",
          dprStatus: "draft",
          workType: "road",
          boqProjectId: PROJECT_ID,
          progress: [],
          equipment: [],
          labour: [],
          materials: [],
          sitePurchases: [],
          structureItems: [],
        })
        .expect(200);
      expect(response.body.boqProjectId).toBeNull();

      const reopened = await request(app)
        .get(`/api/dprs/${CLEARED_DPR_ID}`)
        .expect(200);
      expect(reopened.body.boqProjectId).toBeNull();
      expect(reopened.body.progress).toEqual([]);
    });

    it("rejects wrong and mixed incoming references which do not all belong to the target project", async () => {
     await request(app)
       .patch(`/api/dprs/${FOREIGN_DPR_ID}/draft`)
       .send({
         date: REPORT_DATE,
         site: SITE_NAME,
         engineer: "TASK1474 ENGINEER",
         dprStatus: "draft",
         workType: "road",
         boqProjectId: PROJECT_ID,
          progress: [
            {
              activity: "FOREIGN ITEM",
              chainageFrom: "0",
              chainageTo: "0.8",
              side: "RHS",
              length: 800,
              width: 1.5,
              thickness: 0.25,
              quantity: 300,
              uom: "CUM",
              boqItemId: FOREIGN_ITEM_ID,
            },
            {
              activity: "TARGET ITEM MIXED WITH FOREIGN ITEM",
              chainageFrom: "0",
              chainageTo: "0.8",
              side: "RHS",
              length: 800,
              width: 1.5,
              thickness: 0.25,
              quantity: 300,
              uom: "CUM",
              boqItemId: ITEM_ID,
            },
          ],
          equipment: [],
         labour: [],
         materials: [],
         sitePurchases: [],
         structureItems: [],
       })
       .expect(400)
       .expect((response) => {
         expect(response.body.code).toBe("DPR_PROJECT_MISMATCH");
       });
     const reopened = await request(app).get(`/api/dprs/${FOREIGN_DPR_ID}`).expect(200);
     expect(reopened.body.boqProjectId).toBeNull();
     expect(reopened.body.progress).toHaveLength(0);
   });

   it("keeps a positive project pin immutable", async () => {
     const response = await request(app)
       .patch(`/api/dprs/${PINNED_DPR_ID}/draft`)
       .send({
         date: REPORT_DATE,
         site: SITE_NAME,
         engineer: "TASK1474 ENGINEER",
         dprStatus: "draft",
         workType: "road",
         boqProjectId: FOREIGN_PROJECT_ID,
         progress: [],
         equipment: [],
         labour: [],
         materials: [],
         sitePurchases: [],
         structureItems: [],
       })
       .expect(200);
     expect(response.body.boqProjectId).toBe(PROJECT_ID);
     const reopened = await request(app).get(`/api/dprs/${PINNED_DPR_ID}`).expect(200);
     expect(reopened.body.boqProjectId).toBe(PROJECT_ID);
   });

    it("rejects a target project when its normalized site name is not unique", async () => {
      await adminPool!.query(
        `INSERT INTO ${quoteIdentifier(schemaName)}."sites" (id, name, is_active)
         VALUES ($1, $2, $3)`,
        [DUPLICATE_SITE_ID, ` ${SITE_NAME.toLowerCase()} `, 1],
      );
      try {
        await request(app)
          .patch(`/api/dprs/${NOREF_DPR_ID}/draft`)
          .send({
            date: REPORT_DATE,
            site: SITE_NAME,
            engineer: "TASK1474 ENGINEER",
            dprStatus: "draft",
            workType: "road",
            boqProjectId: PROJECT_ID,
            progress: [{
              activity: "DUPLICATE SITE GUARD",
              boqItemId: ITEM_ID,
            }],
            equipment: [],
            labour: [],
            materials: [],
            sitePurchases: [],
            structureItems: [],
          })
          .expect(400)
          .expect((response) => {
            expect(response.body.code).toBe("DPR_PROJECT_MISMATCH");
          });
      } finally {
        await adminPool!.query(
          `DELETE FROM ${quoteIdentifier(schemaName)}."sites" WHERE id = $1`,
          [DUPLICATE_SITE_ID],
        );
      }
      const reopened = await request(app).get(`/api/dprs/${NOREF_DPR_ID}`).expect(200);
      expect(reopened.body.boqProjectId).toBeNull();
    });

   it("revalidates a persisted nested foreign BOQ reference and blocks recovery", async () => {
    const nestedBefore = await request(app)
      .get(`/api/dprs/${NESTED_DPR_ID}`)
      .expect(200);
    expect(nestedBefore.body.boqProjectId).toBeNull();
    expect(nestedBefore.body.equipment[0].activitySegments[0].boqItems[0]).toEqual(expect.objectContaining({
       boqItemId: FOREIGN_ITEM_ID,
       programmeBarId: null,
    }));

    const nestedPayload = {
      date: NESTED_REPORT_DATE,
      site: SITE_NAME,
      engineer: "TASK1474 ENGINEER",
      dprStatus: "draft",
      workType: "road",
      boqProjectId: PROJECT_ID,
      progress: [],
      equipment: [{ persistedId: EQUIPMENT_ID, machine: "TASK1474 PAVER" }],
      labour: [],
      materials: [],
      sitePurchases: [],
      structureItems: [],
    };

    await request(app)
      .patch(`/api/dprs/${NESTED_DPR_ID}/draft`)
      .send(nestedPayload)
      .expect(400)
      .expect((response) => {
       expect(response.body.code).toBe("DPR_PROJECT_MISMATCH");
      });

    // The route guard above proves the read-model's nested reference. Calling
     // the real exported storage method additionally exercises the
     // transactional persisted-reference query.
    await expect(
      storage.updateDraftDpr(
        NESTED_DPR_ID,
        nestedPayload as any,
        1474,
        undefined,
        true,
      ),
    ).rejects.toMatchObject({ code: "DPR_PROJECT_MISMATCH" });
  });

   it("automatically recovers a null project from persisted same-project nested BOQ evidence", async () => {
     const persistedBefore = await request(app)
       .get(`/api/dprs/${PERSISTED_DPR_ID}`)
       .expect(200);
     expect(persistedBefore.body.boqProjectId).toBeNull();
     expect(persistedBefore.body.equipment[0].activitySegments[0].boqItems[0]).toEqual(expect.objectContaining({
       boqItemId: ITEM_ID,
       programmeBarId: BAR_ID,
     }));

     // Omit activitySegments deliberately. Replacement storage must retain the
     // persisted nested evidence, validate it under the project lock, and
     // recover the null header without a client confirmation flag.
     const persistedPayload = {
       date: NESTED_REPORT_DATE,
       site: SITE_NAME,
       engineer: "TASK1474 ENGINEER",
       dprStatus: "draft",
       workType: "road",
       boqProjectId: PROJECT_ID,
       progress: [],
       equipment: [{ persistedId: PERSISTED_EQUIPMENT_ID, machine: "TASK1474 PAVER" }],
       labour: [],
       materials: [],
       sitePurchases: [],
       structureItems: [],
     };

     const recovered = await request(app)
       .patch(`/api/dprs/${PERSISTED_DPR_ID}/draft`)
       .send(persistedPayload)
       .expect(200);
     expect(recovered.body.boqProjectId).toBe(PROJECT_ID);

     const reopened = await request(app)
       .get(`/api/dprs/${PERSISTED_DPR_ID}`)
       .expect(200);
     expect(reopened.body.boqProjectId).toBe(PROJECT_ID);
     expect(reopened.body.equipment[0].activitySegments[0].boqItems[0]).toEqual(expect.objectContaining({
       boqItemId: ITEM_ID,
       programmeBarId: BAR_ID,
     }));
   });

  it("keeps the generic PATCH response while logging only safe 42703 metadata", async () => {
    const wrappedStorageError = Object.assign(
      new Error("storage wrapper: password=not-a-log-value secret sql"),
      {
        cause: Object.assign(
          new Error("column text contains private customer data"),
          { code: "42703", column: "boq_item_id", detail: "sensitive detail" },
        ),
      },
    );
    const updateSpy = vi.spyOn(storage, "updateDraftDpr")
      .mockRejectedValue(wrappedStorageError);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    try {
      const response = await request(app)
        .patch(`/api/dprs/${EMPTY_DPR_ID}/draft`)
        .send({
          date: REPORT_DATE,
          site: SITE_NAME,
          engineer: "TASK1474 ENGINEER",
          dprStatus: "draft",
          workType: "road",
          boqProjectId: PROJECT_ID,
          progress: [],
          equipment: [],
          labour: [],
          materials: [],
          sitePurchases: [],
          structureItems: [],
        })
        .expect(500);

      expect(response.body).toEqual({ message: "Failed to update draft DPR" });
      const logCall = errorSpy.mock.calls.find(
        ([message]) => message === "[DPR draft save] Unexpected failure",
      );
      expect(logCall).toBeDefined();
      expect(logCall?.[1]).toEqual(expect.objectContaining({
        operation: "PATCH /api/dprs/:id/draft",
        dprId: EMPTY_DPR_ID,
        actorUserId: 1474,
        errorType: "Error",
        sqlState: "42703",
        column: "boq_item_id",
      }));
      const serializedLogs = JSON.stringify(errorSpy.mock.calls);
      expect(serializedLogs).not.toContain("password=not-a-log-value");
      expect(serializedLogs).not.toContain("private customer data");
      expect(serializedLogs).not.toContain("sensitive detail");
    } finally {
      errorSpy.mockRestore();
      updateSpy.mockRestore();
    }
  });
});