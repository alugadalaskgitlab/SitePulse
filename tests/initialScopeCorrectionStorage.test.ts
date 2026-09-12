/**
 * Initial confirmed scope correction — storage transaction behaviour.
 *
 * These tests intentionally use a deterministic transaction double instead of
 * a shared database.  The production database is not safe to mutate from the
 * test runner, while the observable contract here is the transaction boundary:
 * dependency checks happen before any update, the project row is locked, and
 * the only write on success is the in-place scope update plus its audit row.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const fx = vi.hoisted(() => {
  const transaction = vi.fn();
  const db = {
    transaction,
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    execute: vi.fn(),
  };
  return { transaction, db };
});

vi.mock("../server/db", () => ({ db: fx.db }));

import {
  InitialScopeCorrectionBlockedError,
  storage,
} from "../server/storage";
import { boqProjects, projectScopeSegments } from "@shared/schema";

const PROJECT_ID = 77;
const TARGET_ID = 501;

function target(overrides: Record<string, unknown> = {}) {
  return {
    id: TARGET_ID,
    boqProjectId: PROJECT_ID,
    segmentType: "working_reach",
    label: "Initial reach",
    chainageFrom: 0,
    chainageTo: 10,
    side: null,
    reason: "original confirmation",
    applicability: "all_linear",
    categoryIds: null,
    itemIds: null,
    effectiveFrom: null,
    effectiveTo: null,
    deptReference: null,
    documentRef: null,
    notes: "keep this note",
    withdrawalOrderRef: null,
    consentRef: null,
    omittedQty: null,
    omittedAmount: null,
    originalScopeNote: null,
    revisedScopeNote: null,
    status: "confirmed",
    revisionOf: null,
    approvedBy: 9,
    approvedAt: new Date("2026-01-02T03:04:05.000Z"),
    createdBy: 8,
    createdAt: new Date("2026-01-01T03:04:05.000Z"),
    updatedAt: new Date("2026-01-02T03:04:05.000Z"),
    ...overrides,
  };
}

type TxSetup = {
  tx: any;
  selectCalls: number;
  updateSpy: ReturnType<typeof vi.fn>;
  insertSpy: ReturnType<typeof vi.fn>;
  lockCalls: string[];
};

/**
 * The correction inspection has a stable sequence of reads.  Returning rows
 * by sequence keeps this fake independent from Drizzle's internal SQL shape,
 * while still exercising the real storage method and its dependency logic.
 *
 * getInitialScopeCorrectionEligibility:
 *   1 target, 2 project, 3 history, 4 bars, 5 arrangements,
 *   6/7/8/9/10 committed DPR classes, 11 current scope, 12 drafts,
 *   13 cut/fill, 14/15 equipment links.
 *
 * correctInitialScopeSegment adds the locked target/project/target reads
 * before that same inspection (so its inspection starts at read 4).
 */
function setupTransaction(
  mode: "eligibility" | "correction",
  overrides: {
    history?: any[];
    bars?: any[];
    arrangements?: any[];
    committedDprs?: any[];
    committedStructureDprs?: any[];
    committedEquipmentDprs?: any[];
    committedEquipmentAllocationDprs?: any[];
    committedEquipmentSegmentDprs?: any[];
    currentScope?: any[];
    target?: any;
    draftRows?: any[];
    draftConsumptions?: any[];
    equipmentLinks?: any[];
    equipmentSegments?: any[];
    updated?: any;
  } = {},
): TxSetup {
  const row = overrides.target ?? target();
  const inspectionReads = [
    [row],
    [{ id: PROJECT_ID }],
    overrides.history ?? [],
    overrides.bars ?? [],
    overrides.arrangements ?? [],
    overrides.committedDprs ?? [],
    overrides.committedStructureDprs ?? [],
    overrides.committedEquipmentDprs ?? [],
    overrides.committedEquipmentAllocationDprs ?? [],
    overrides.committedEquipmentSegmentDprs ?? [],
    overrides.currentScope ?? [row],
    overrides.draftRows ?? [],
    overrides.draftConsumptions ?? [],
    overrides.equipmentLinks ?? [],
    overrides.equipmentSegments ?? [],
  ];
  const results = mode === "eligibility"
    ? inspectionReads
    : [[row], [{ id: PROJECT_ID }], [row], ...inspectionReads];

  let selectCalls = 0;
  const lockCalls: string[] = [];
  const builder = (result: any[]) => {
    const q: any = {
      from(table: any) {
        lockCalls.push(String(table?.[Symbol.for("drizzle:Name")] ?? "unknown"));
        return q;
      },
      leftJoin() { return q; },
      innerJoin() { return q; },
      where() { return q; },
      groupBy() { return q; },
      orderBy() { return q; },
      limit() { return q; },
      for(kind: string) {
        lockCalls.push(`FOR ${kind}`);
        return q;
      },
      then(resolve: (value: any) => unknown, reject?: (error: unknown) => unknown) {
        return Promise.resolve(result).then(resolve, reject);
      },
    };
    return q;
  };

  const updateSpy = vi.fn(() => {
    const q: any = {
      set(values: any) {
        q.values = values;
        return q;
      },
      where() { return q; },
      returning: vi.fn(async () => [overrides.updated ?? {
        ...row,
        chainageFrom: 1,
        chainageTo: 8,
        side: "lhs",
      }]),
    };
    return q;
  });
  const insertSpy = vi.fn(() => ({
    values: vi.fn(async (values: any) => values),
  }));

  const tx: any = {
    select: vi.fn(() => {
      const result = results[selectCalls] ?? [];
      selectCalls += 1;
      return builder(result);
    }),
    update: updateSpy,
    insert: insertSpy,
  };
  fx.transaction.mockImplementationOnce(async (callback: (tx: any) => Promise<unknown>) => callback(tx));
  return { tx, selectCalls, updateSpy, insertSpy, lockCalls };
}

function setupScopeUpdateTransaction(status: "draft" | "confirmed") {
  const existing = target({ status });
  const revision = target({
    id: TARGET_ID + 1,
    status: "draft",
    revisionOf: TARGET_ID,
  });
  const selectResults = [
    [{ projectId: PROJECT_ID }],
    [{ id: PROJECT_ID }],
    [existing],
  ];
  const selections: Array<{ projection: any; table: any }> = [];
  let selectCalls = 0;
  const select = vi.fn((projection?: any) => {
    const result = selectResults[selectCalls] ?? [];
    selectCalls += 1;
    const q: any = {
      from(table: any) {
        selections.push({ projection, table });
        return q;
      },
      where() { return q; },
      for() { return q; },
      limit() { return q; },
      then(resolve: (value: any) => unknown, reject?: (error: unknown) => unknown) {
        return Promise.resolve(result).then(resolve, reject);
      },
    };
    return q;
  });
  const returning = vi.fn(async () => status === "confirmed" ? [revision] : [existing]);
  const update = vi.fn(() => {
    const q: any = {
      set() { return q; },
      where() { return q; },
      returning,
    };
    return q;
  });
  const insertReturning = vi.fn(async () => [revision]);
  const insertValues = vi.fn(() => ({ returning: insertReturning }));
  const insert = vi.fn(() => ({ values: insertValues }));
  const tx = { select, update, insert };
  fx.transaction.mockImplementationOnce(async (callback: (value: any) => Promise<unknown>) => callback(tx));
  return { tx, selections, update, insert, insertValues, insertReturning };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("scope segment update preliminary project lookup", () => {
  it.each(["draft", "confirmed"] as const)(
    "uses the scope-segment project column when updating a %s segment",
    async (status) => {
      const tx = setupScopeUpdateTransaction(status);

      const result = await storage.updateProjectScopeSegment(
        TARGET_ID,
        { chainageTo: 8 },
        44,
      );

      expect(result.revised).toBe(status === "confirmed");
      const preliminary = tx.selections[0];
      expect(preliminary.table).toBe(projectScopeSegments);
      expect(preliminary.projection.projectId).toBe(projectScopeSegments.boqProjectId);
      expect(preliminary.projection.projectId.table).toBe(preliminary.table);
      expect(preliminary.projection.projectId.table).not.toBe(boqProjects);
    },
  );
});

describe("eligibility dependency policy", () => {
  it("allows an original confirmed row with imported-BOQ-compatible ordinary draft history", async () => {
    setupTransaction("eligibility", {
      draftRows: [{
        dprId: 800,
        date: "2026-03-01",
        site: "ALIPUR",
        entryId: 801,
        boqItemId: 900,
        categoryId: 3,
        itemProjectId: PROJECT_ID,
        chainageFrom: "20",
        chainageTo: "21",
        chainageFromKm: 20,
        chainageToKm: 21,
        side: null,
        entryKey: "draft-row",
      }],
    });

    const result = await storage.getInitialScopeCorrectionEligibility(TARGET_ID);

    expect(result.eligible).toBe(true);
    expect(result.blockers).toEqual([]);
    expect(result.projectId).toBe(PROJECT_ID);
    expect(result.segment).toMatchObject({ id: TARGET_ID, status: "confirmed", revisionOf: null });
    expect(result.affectedDrafts).toEqual([]);
  });

  it.each([
    ["revision history", { history: [{ id: 502 }] }, "SCOPE_REVISION_HISTORY"],
    ["programme bars", { bars: [{ id: 601 }] }, "PROGRAMME_BARS_EXIST"],
    ["arrangements", { arrangements: [{ id: 701 }] }, "ARRANGEMENTS_EXIST"],
    ["submitted DPR history", { committedDprs: [{ id: 801 }] }, "SUBMITTED_DPRS_EXIST"],
  ])("fails closed when %s exists and reports its blocker", async (_label, deps, code) => {
    setupTransaction("eligibility", deps);

    const result = await storage.getInitialScopeCorrectionEligibility(TARGET_ID);

    expect(result.eligible).toBe(false);
    expect(result.blockers).toEqual(expect.arrayContaining([
      expect.objectContaining({ code }),
    ]));
  });

  it("allows a draft cut/fill link only when it is proven unaffected", async () => {
    setupTransaction("eligibility", {
      draftRows: [{
        dprId: 810,
        date: "2026-03-02",
        site: "ALIPUR",
        entryId: 811,
        boqItemId: 900,
        categoryId: 3,
        itemProjectId: PROJECT_ID,
        chainageFrom: "20",
        chainageTo: "21",
        chainageFromKm: 20,
        chainageToKm: 21,
        side: null,
      }],
      draftConsumptions: [{
        id: 901,
        dprId: 810,
        sourceProgressId: 1201,
        sourceDprId: 810,
        sourceDprStatus: "draft",
        sourceDprProjectId: PROJECT_ID,
        sourceBoqItemId: 901,
        sourceItemProjectId: PROJECT_ID,
        sourceChainageFrom: "20",
        sourceChainageTo: "21",
        sourceChainageFromKm: 20,
        sourceChainageToKm: 21,
        sourceSide: null,
        boqItemId: 900,
        categoryId: 3,
        itemProjectId: PROJECT_ID,
        chainageFrom: "20",
        chainageTo: "21",
        chainageFromKm: 20,
        chainageToKm: 21,
        side: null,
      }],
    });

    const result = await storage.getInitialScopeCorrectionEligibility(TARGET_ID);

    expect(result.eligible).toBe(true);
    expect(result.blockers).toEqual([]);
  });

  it("evaluates the source BOQ category when checking a cut/fill link", async () => {
    setupTransaction("correction", {
      // Keep a separate working reach so the projected correction still has
      // a configured working-reach domain; evaluateDprScope intentionally
      // treats a project with no working reaches as out of scope setup.
      currentScope: [
        target(),
        target({ id: 502, chainageFrom: 20, chainageTo: 30 }),
      ],
      draftConsumptions: [{
        id: 904,
        dprId: 812,
        sourceProgressId: 1212,
        sourceDprId: 812,
        sourceDprStatus: "draft",
        sourceDprProjectId: PROJECT_ID,
        sourceBoqItemId: 912,
        sourceCategoryId: 42,
        sourceItemProjectId: PROJECT_ID,
        sourceChainageFrom: 2,
        sourceChainageTo: 3,
        sourceChainageFromKm: 2,
        sourceChainageToKm: 3,
        sourceSide: null,
        boqItemId: 902,
        categoryId: 7,
        itemProjectId: PROJECT_ID,
        chainageFrom: 20,
        chainageTo: 21,
        chainageFromKm: 20,
        chainageToKm: 21,
        side: null,
      }],
    });

    await expect(storage.correctInitialScopeSegment(
      TARGET_ID,
      {
        segmentType: "no_scope",
        chainageFrom: 1,
        chainageTo: 8,
        applicability: "categories",
        categoryIds: [42],
      },
      "verified source category correction",
      { userId: 4, userName: "Admin User", userRole: "admin" },
    )).rejects.toMatchObject({
      code: "INITIAL_SCOPE_CORRECTION_BLOCKED",
      blockers: expect.arrayContaining([
        expect.objectContaining({ code: "DRAFT_CUT_FILL_LINK_UNSAFE", ids: [904] }),
      ]),
    });
  });

  it("evaluates each original confirmed row independently when multiple originals coexist", async () => {
    const second = target({
      id: 502,
      segmentType: "working_reach",
      label: "Independent reach",
      chainageFrom: 20,
      chainageTo: 30,
    });
    setupTransaction("eligibility", { currentScope: [target(), second] });

    const result = await storage.getInitialScopeCorrectionEligibility(TARGET_ID);

    expect(result.eligible).toBe(true);
    expect(result.blockers).toEqual([]);
  });

  it("does not treat an unrelated original no-scope row as a project-wide uniqueness blocker", async () => {
    const noScope = target({
      id: 503,
      segmentType: "no_scope",
      label: "No scope",
      chainageFrom: 40,
      chainageTo: 40,
    });
    setupTransaction("eligibility", { currentScope: [target(), noScope] });

    const result = await storage.getInitialScopeCorrectionEligibility(TARGET_ID);

    expect(result.eligible).toBe(true);
    expect(result.blockers).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "INITIAL_CONFIRMED_SCOPE_NOT_UNIQUE" }),
    ]));
  });

  it("blocks an unproven draft cut/fill link with a specific blocker and no mutation", async () => {
    const tx = setupTransaction("correction", {
      draftConsumptions: [{
        id: 902,
        dprId: 820,
        boqItemId: null,
        itemProjectId: PROJECT_ID,
        chainageFromKm: null,
        chainageToKm: null,
      }],
    });

    await expect(storage.correctInitialScopeSegment(
      TARGET_ID,
      { chainageFrom: 1, chainageTo: 8 },
      "verified chainage entry error",
      { userId: 4, userName: "Admin User", userRole: "admin" },
    )).rejects.toMatchObject({
      code: "INITIAL_SCOPE_CORRECTION_BLOCKED",
      blockers: expect.arrayContaining([
        expect.objectContaining({ code: "DRAFT_CUT_FILL_LINK_UNSAFE", ids: [902] }),
      ]),
    });
    expect(tx.updateSpy).not.toHaveBeenCalled();
    expect(tx.insertSpy).not.toHaveBeenCalled();
  });

  it("blocks a cut/fill link when its source endpoint belongs to another project", async () => {
    const tx = setupTransaction("correction", {
      draftConsumptions: [{
        id: 903,
        dprId: 820,
        sourceProgressId: 1203,
        sourceDprId: 821,
        sourceDprStatus: "draft",
        sourceDprProjectId: PROJECT_ID + 1,
        sourceBoqItemId: 901,
        sourceItemProjectId: PROJECT_ID + 1,
        sourceChainageFrom: 20,
        sourceChainageTo: 21,
        sourceChainageFromKm: 20,
        sourceChainageToKm: 21,
        boqItemId: 900,
        itemProjectId: PROJECT_ID,
        chainageFromKm: 20,
        chainageToKm: 21,
      }],
    });

    await expect(storage.correctInitialScopeSegment(
      TARGET_ID,
      { chainageFrom: 1, chainageTo: 8 },
      "verified source project mismatch",
      { userId: 4, userName: "Admin User", userRole: "admin" },
    )).rejects.toMatchObject({
      code: "INITIAL_SCOPE_CORRECTION_BLOCKED",
      blockers: expect.arrayContaining([
        expect.objectContaining({ code: "DRAFT_CUT_FILL_LINK_UNSAFE", ids: [903] }),
      ]),
    });
    expect(tx.updateSpy).not.toHaveBeenCalled();
  });

  it("blocks draft equipment allocation links rather than rewriting them", async () => {
    const tx = setupTransaction("correction", {
      equipmentLinks: [{ id: 1001, programmeBarId: 44, dprId: 830 }],
    });

    await expect(storage.correctInitialScopeSegment(
      TARGET_ID,
      { segmentType: "no_scope", chainageFrom: 1, chainageTo: 8 },
      "verified initial classification error",
      { userId: 4, userName: "Admin User", userRole: "admin" },
    )).rejects.toMatchObject({
      blockers: expect.arrayContaining([
        expect.objectContaining({ code: "DRAFT_EQUIPMENT_LINK_UNSAFE", ids: [1001] }),
      ]),
    });
    expect(tx.updateSpy).not.toHaveBeenCalled();
    expect(tx.insertSpy).not.toHaveBeenCalled();
  });

  it("blocks a committed DPR referenced only by a legacy equipment allocation", async () => {
    setupTransaction("eligibility", {
      // The legacy DPR header and equipment log carry no usable BOQ item;
      // the allocation's BOQ link is the only project evidence.
      committedEquipmentAllocationDprs: [{ id: 804 }],
      committedEquipmentSegmentDprs: [{ id: 805 }],
    });

    const result = await storage.getInitialScopeCorrectionEligibility(TARGET_ID);

    expect(result.eligible).toBe(false);
    expect(result.blockers).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: "SUBMITTED_DPRS_EXIST",
        ids: expect.arrayContaining([804, 805]),
      }),
    ]));
  });
});

describe("correctInitialScopeSegment transaction", () => {
  it("updates the same row, preserves confirmed lifecycle fields, and writes before/after audit facts", async () => {
    const updated = {
      ...target(),
      segmentType: "no_scope",
      chainageFrom: 1,
      chainageTo: 8,
      side: "lhs",
      status: "confirmed",
      revisionOf: null,
      effectiveTo: "2026-12-31",
      documentRef: "SIGNED-NOTE-17",
      consentRef: "CONSENT-17",
      omittedQty: "12.5",
      omittedAmount: "4500",
      originalScopeNote: "original hidden note",
      revisedScopeNote: "revised hidden note",
    };
    const tx = setupTransaction("correction", { updated });

    const result = await storage.correctInitialScopeSegment(
      TARGET_ID,
      {
        segmentType: "no_scope",
        chainageFrom: 1,
        chainageTo: 8,
        side: "lhs",
        label: "Corrected initial stretch",
      },
      "  verified initial-entry mistake from approved field note 17  ",
      { userId: 44, userName: "Owner User", userRole: "owner" },
    );

    expect(result.segment).toMatchObject({
      id: TARGET_ID,
      boqProjectId: PROJECT_ID,
      status: "confirmed",
      revisionOf: null,
      segmentType: "no_scope",
    });
    expect(result.before).toMatchObject({
      id: TARGET_ID,
      segmentType: "working_reach",
      status: "confirmed",
    });
    expect(tx.updateSpy).toHaveBeenCalledTimes(1);
    const updateValues = tx.updateSpy.mock.results[0].value.values;
    expect(updateValues).toMatchObject({
      segmentType: "no_scope",
      chainageFrom: 1,
      chainageTo: 8,
      side: "lhs",
      status: "confirmed",
      revisionOf: null,
    });
    expect(updateValues).not.toHaveProperty("id");
    expect(updateValues).not.toHaveProperty("boqProjectId");
    for (const preserved of [
      "effectiveTo", "documentRef", "consentRef", "omittedQty",
      "omittedAmount", "originalScopeNote", "revisedScopeNote", "notes",
    ]) {
      expect(updateValues).not.toHaveProperty(preserved);
      expect((result.segment as any)[preserved]).toBe((updated as any)[preserved]);
    }

    expect(tx.insertSpy).toHaveBeenCalledTimes(1);
    const auditValues = tx.insertSpy.mock.results[0].value.values.mock.calls[0][0];
    expect(auditValues).toMatchObject({
      module: "project_scope",
      transactionId: PROJECT_ID,
      action: "initial_scope_corrected",
      userId: 44,
      userName: "Owner User",
      userRole: "owner",
      reason: "verified initial-entry mistake from approved field note 17",
      oldValues: expect.objectContaining({
        id: TARGET_ID,
        segmentType: "working_reach",
        status: "confirmed",
        revisionOf: null,
      }),
      newValues: expect.objectContaining({
        id: TARGET_ID,
        segmentType: "no_scope",
        status: "confirmed",
        revisionOf: null,
      }),
    });
  });

  it("reports draft rows whose scope-readiness changes and leaves their values untouched", async () => {
    const tx = setupTransaction("correction", {
      currentScope: [target()],
      draftRows: [{
        dprId: 840,
        date: "2026-03-05",
        site: "ALIPUR",
        entryId: 841,
        boqItemId: 900,
        categoryId: 3,
        itemProjectId: PROJECT_ID,
        chainageFrom: "1",
        chainageTo: "2",
        chainageFromKm: 1,
        chainageToKm: 2,
        side: null,
        entryKey: "draft-preserved-row",
      }],
    });

    const result = await storage.correctInitialScopeSegment(
      TARGET_ID,
      { chainageFrom: 0, chainageTo: 0.5 },
      "corrected initial reach end",
      { userId: 4, userName: "Admin User", userRole: "admin" },
    );

    expect(result.affectedDrafts).toEqual([
      { id: 840, date: "2026-03-05", site: "ALIPUR", affectedRows: 1, editUrl: "/site/edit/840?draft" },
    ]);
    expect(tx.updateSpy).toHaveBeenCalledTimes(1);
    // No draft update/delete query exists in this transaction.
    expect(tx.insertSpy).toHaveBeenCalledTimes(1);
  });

  it("does not report structure-scheduled draft rows as affected by an all-linear correction", async () => {
    const tx = setupTransaction("correction", {
      target: target({ segmentType: "no_scope", chainageFrom: 1, chainageTo: 8 }),
      currentScope: [
        target({ segmentType: "no_scope", chainageFrom: 1, chainageTo: 8 }),
        target({ id: 502, segmentType: "working_reach", chainageFrom: 0, chainageTo: 10 }),
      ],
      draftRows: [
        {
          dprId: 850,
          date: "2026-03-06",
          site: "ALIPUR",
          entryId: 851,
          boqItemId: 901,
          categoryId: 3,
          categoryName: "Bridge Works",
          description: "Miscellaneous BOQ work",
          unit: "CUM",
          workCategory: null,
          planningWorkType: "road",
          itemProjectId: PROJECT_ID,
          chainageFromKm: 4,
          chainageToKm: 5,
          side: null,
        },
        {
          dprId: 852,
          date: "2026-03-06",
          site: "ALIPUR",
          entryId: 853,
          boqItemId: 902,
          categoryId: 4,
          categoryName: "Roadworks",
          description: "Construction of RCC approach slab",
          unit: "CUM",
          workCategory: "EARTHWORK",
          planningWorkType: "road",
          itemProjectId: PROJECT_ID,
          chainageFromKm: 4,
          chainageToKm: 5,
          side: null,
        },
      ],
    });

    const result = await storage.correctInitialScopeSegment(
      TARGET_ID,
      { segmentType: "no_scope", chainageFrom: 2, chainageTo: 3 },
      "verified structure classification correction",
      { userId: 4, userName: "Admin User", userRole: "admin" },
    );

    expect(result.affectedDrafts).toEqual([]);
    expect(tx.updateSpy).toHaveBeenCalledTimes(1);
  });

  it("does not block cut/fill links when either endpoint is structure-scheduled", async () => {
    const tx = setupTransaction("correction", {
      target: target({ segmentType: "no_scope", chainageFrom: 1, chainageTo: 8 }),
      currentScope: [
        target({ segmentType: "no_scope", chainageFrom: 1, chainageTo: 8 }),
        target({ id: 502, segmentType: "working_reach", chainageFrom: 0, chainageTo: 10 }),
      ],
      draftConsumptions: [
        {
          id: 905,
          dprId: 854,
          sourceProgressId: 1215,
          sourceDprId: 855,
          sourceDprStatus: "draft",
          sourceDprProjectId: PROJECT_ID,
          sourceBoqItemId: 915,
          sourceItemProjectId: PROJECT_ID,
          sourceCategoryId: 5,
          sourceCategoryName: "Roadworks",
          sourceDescription: "Roadway excavation",
          sourceUnit: "CUM",
          sourceWorkCategory: "EARTHWORK",
          sourcePlanningWorkType: "road",
          sourceChainageFromKm: 9,
          sourceChainageToKm: 9.5,
          sourceSide: null,
          boqItemId: 905,
          itemProjectId: PROJECT_ID,
          categoryId: 6,
          categoryName: "Bridge Works",
          description: "Miscellaneous BOQ work",
          unit: "CUM",
          workCategory: null,
          planningWorkType: "road",
          chainageFromKm: 4,
          chainageToKm: 5,
          side: null,
        },
        {
          id: 906,
          dprId: 856,
          sourceProgressId: 1216,
          sourceDprId: 857,
          sourceDprStatus: "draft",
          sourceDprProjectId: PROJECT_ID,
          sourceBoqItemId: 916,
          sourceItemProjectId: PROJECT_ID,
          sourceCategoryId: 7,
          sourceCategoryName: "Structures",
          sourceDescription: "Concrete abutment",
          sourceUnit: "CUM",
          sourceWorkCategory: "EARTHWORK",
          sourcePlanningWorkType: "road",
          sourceChainageFromKm: 4,
          sourceChainageToKm: 5,
          sourceSide: null,
          boqItemId: 906,
          itemProjectId: PROJECT_ID,
          categoryId: 8,
          categoryName: "Roadworks",
          description: "Roadway embankment",
          unit: "CUM",
          workCategory: "EARTHWORK",
          planningWorkType: "road",
          chainageFromKm: 9,
          chainageToKm: 9.5,
          side: null,
        },
      ],
    });

    const result = await storage.correctInitialScopeSegment(
      TARGET_ID,
      { segmentType: "no_scope", chainageFrom: 2, chainageTo: 3 },
      "verified cut fill structure classification correction",
      { userId: 4, userName: "Admin User", userRole: "admin" },
    );

    expect(result.affectedDrafts).toEqual([]);
    expect(tx.updateSpy).toHaveBeenCalledTimes(1);
  });

  it("locks the project before the dependency recheck and does not create a revision row", async () => {
    const tx = setupTransaction("correction");

    await storage.correctInitialScopeSegment(
      TARGET_ID,
      { chainageFrom: 2, chainageTo: 9 },
      "verified correction",
      { userId: 1, userName: "Admin User", userRole: "admin" },
    );

    expect(tx.lockCalls).toContain("FOR update");
    expect(tx.lockCalls.indexOf("FOR update")).toBeGreaterThanOrEqual(0);
    expect(tx.updateSpy).toHaveBeenCalledTimes(1);
    // The only insert is auditLogs; no second scope row/revision is inserted.
    expect(tx.insertSpy).toHaveBeenCalledTimes(1);
  });

  it("fails validation before opening a transaction when the reason is blank", async () => {
    await expect(storage.correctInitialScopeSegment(
      TARGET_ID,
      { chainageFrom: 1, chainageTo: 2 },
      "   ",
      { userId: 1, userName: "Admin User", userRole: "admin" },
    )).rejects.toThrow("CORRECTION_REASON_REQUIRED");
    expect(fx.transaction).not.toHaveBeenCalled();
  });

  it("fails closed on an inspection error before any update or audit write", async () => {
    const updateSpy = vi.fn();
    fx.transaction.mockImplementationOnce(async (callback: (tx: any) => Promise<unknown>) => callback({
      select: vi.fn(() => {
        throw new Error("dependency check unavailable");
      }),
      update: updateSpy,
      insert: vi.fn(),
    }));

    await expect(storage.correctInitialScopeSegment(
      TARGET_ID,
      { chainageFrom: 1, chainageTo: 2 },
      "verified correction",
      { userId: 1, userName: "Admin User", userRole: "admin" },
    )).rejects.toThrow("dependency check unavailable");
    expect(updateSpy).not.toHaveBeenCalled();
  });
});

describe("draft submission concurrency guard", () => {
  it("locks the project and rejects a stale scope token before touching the DPR row", async () => {
    const execute = vi.fn()
      .mockResolvedValueOnce({ rows: [{ token: "new-token" }] }); // scope token recheck
    const updateSpy = vi.fn();
    const select = vi.fn(() => {
      const q: any = {
        from() { return q; },
        where() { return q; },
        for() { return q; },
        limit() { return q; },
        then(resolve: (value: any) => unknown, reject?: (error: unknown) => unknown) {
          return Promise.resolve([{ id: 1200, dprStatus: "draft", boqProjectId: PROJECT_ID }]).then(resolve, reject);
        },
      };
      return q;
    });
    fx.transaction.mockImplementationOnce(async (callback: (tx: any) => Promise<unknown>) => callback({
      execute,
      select,
      update: updateSpy,
    }));
    vi.spyOn(storage, "getDpr").mockResolvedValueOnce({
      id: 1200,
      dprStatus: "draft",
    } as any);

    await expect(storage.submitDraftDpr(
      1200,
      {
        date: "2026-03-04",
        site: "ALIPUR",
        engineer: "FIELD ENGINEER",
        boqProjectId: PROJECT_ID,
        progress: [],
        structureItems: [],
        equipment: [],
        labour: [],
        materials: [],
        sitePurchases: [],
      } as any,
      undefined,
      { userId: 4, userName: "Field Engineer" },
      "old-token",
    )).rejects.toMatchObject({ code: "SCOPE_CHANGED_DURING_SUBMIT" });

    expect(execute).toHaveBeenCalledTimes(1);
    expect(updateSpy).not.toHaveBeenCalled();
  });
});