/**
 * Initial confirmed scope correction — HTTP contract and authorization tests.
 *
 * Storage is mocked here so each response is attributable to the route guard,
 * parser, and error mapping.  The transaction-level no-write guarantees are
 * covered separately by initialScopeCorrectionStorage.test.ts.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express, { type NextFunction, type Request, type Response } from "express";
import { createServer } from "http";
import request from "supertest";

const fx = vi.hoisted(() => ({
  user: { id: 17, name: "Scope Admin", username: "scope-admin", role: "admin", isAdmin: true, isOwner: false },
  adminAllowed: true,
  eligibility: vi.fn(),
  correction: vi.fn(),
  getDpr: vi.fn(),
  getDprs: vi.fn(),
  createNotification: vi.fn(),
  getProjectScopeVersionToken: vi.fn(),
  submitDraftDpr: vi.fn(),
  BlockedClass: class extends Error {
    readonly code = "INITIAL_SCOPE_CORRECTION_BLOCKED";
    blockers: Array<{ code: string; message: string; count?: number; ids?: number[] }>;
    affectedDrafts: Array<{ id: number; date: string; site: string; affectedRows: number }>;
    constructor(
      blockers: Array<{ code: string; message: string; count?: number; ids?: number[] }>,
      affectedDrafts: Array<{ id: number; date: string; site: string; affectedRows: number }> = [],
    ) {
      super("Initial confirmed scope correction is not eligible");
      this.blockers = blockers;
      this.affectedDrafts = affectedDrafts;
    }
  },
}));

vi.mock("../server/storage", () => {
  const methods: Record<string, any> = {
    getInitialScopeCorrectionEligibility: fx.eligibility,
    correctInitialScopeSegment: fx.correction,
    getDpr: fx.getDpr,
    getProjectScopeVersionToken: fx.getProjectScopeVersionToken,
    submitDraftDpr: fx.submitDraftDpr,
    // registerRoutes starts a non-empty-data seed guard in the background.
    getDprs: fx.getDprs,
    createNotification: fx.createNotification,
  };
  const storage = new Proxy(methods, {
    get(target, key: string) {
      if (!(key in target)) target[key] = vi.fn().mockResolvedValue([]);
      return target[key];
    },
  });
  class GenericError extends Error {}
  return {
    storage,
    InitialScopeCorrectionBlockedError: fx.BlockedClass,
    DprProjectMismatchError: class extends Error {},
    ScopeChangedDuringPlanningError: class extends Error {},
    StockShortageError: GenericError,
    EquipmentIncomingConflictError: GenericError,
    InsufficientPlantStockError: GenericError,
    InvalidDieselPhysicalStockError: GenericError,
    InvalidStockTransferQuantityError: GenericError,
    InvalidDieselSourceError: GenericError,
    DieselReceiptExceedsRemainingError: GenericError,
    CutFillInsufficientAvailabilityError: GenericError,
    CutFillValidationError: GenericError,
    AttachmentReferenceError: GenericError,
    assertValidDieselPhysicalStock: vi.fn(),
  };
});

vi.mock("../server/push", () => ({
  sendPushToAll: vi.fn().mockResolvedValue(undefined),
  sendPushToAudience: vi.fn().mockResolvedValue(undefined),
  sendPushToSection: vi.fn().mockResolvedValue(undefined),
  sendPushToRaiser: vi.fn().mockResolvedValue(undefined),
  sendTestPush: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../server/auth", () => ({
  requireAuth: (req: Request, _res: Response, next: NextFunction) => {
    (req as any).authUser = fx.user;
    (req as any).authPermissions = {};
    next();
  },
  isPublicApiPath: vi.fn().mockReturnValue(false),
  isOptionalAuthPath: vi.fn().mockReturnValue(false),
  optionalAuth: (_req: Request, _res: Response, next: NextFunction) => next(),
  lookupSessionFromCookie: vi.fn(),
  loadUserPermissionsMatrix: vi.fn(),
}));

vi.mock("../server/auth-routes", () => ({
  registerAuthRoutes: vi.fn(),
  assertAdmin: (_req: Request, res: Response) => {
    if (!fx.adminAllowed) {
      res.status(403).json({ error: "admin_required" });
      return false;
    }
    return true;
  },
  assertEdit: () => true,
  assertView: () => true,
  assertViewEither: () => true,
  assertAuthed: () => true,
  assertCreate: () => true,
  assertCreateOrEdit: () => true,
  assertCreateEither: () => true,
  assertApprove: () => true,
  assertDeleteOrCancel: () => true,
  currentUserName: () => "Scope Admin",
}));

// Import only after module mocks are installed.
import { registerRoutes } from "../server/routes";

let app: express.Express;

const original = {
  id: 501,
  boqProjectId: 77,
  segmentType: "working_reach",
  chainageFrom: 0,
  chainageTo: 10,
  side: null,
  status: "confirmed",
  revisionOf: null,
  label: "Initial reach",
};

const corrected = {
  ...original,
  segmentType: "no_scope",
  chainageFrom: 1,
  chainageTo: 8,
  side: "lhs",
};

function eligibility(overrides: Record<string, unknown> = {}) {
  return {
    eligible: true,
    projectId: 77,
    segment: original,
    blockers: [],
    affectedDrafts: [],
    ...overrides,
  };
}

function correctionBody(overrides: Record<string, unknown> = {}) {
  return {
    segmentType: "no_scope",
    chainageFrom: 1,
    chainageTo: 8,
    side: "lhs",
    label: "Corrected initial reach",
    reason: "verified no-scope entry",
    applicability: "all_linear",
    categoryIds: null,
    itemIds: null,
    effectiveFrom: null,
    notes: "preserve imported project and BOQ",
    correctionReason: "Initial field-entry mistake confirmed by signed site note",
    ...overrides,
  };
}

beforeAll(async () => {
  app = express();
  app.use(express.json());
  await registerRoutes(createServer(app), app);
});

beforeEach(() => {
  vi.clearAllMocks();
  fx.adminAllowed = true;
  fx.user.isAdmin = true;
  fx.user.isOwner = false;
  fx.eligibility.mockResolvedValue(eligibility());
  fx.correction.mockResolvedValue({
    segment: corrected,
    before: original,
    affectedDrafts: [],
  });
  fx.getDprs.mockResolvedValue([{ id: 1 }]);
  fx.createNotification.mockResolvedValue({});
});

describe("initial correction authorization and eligibility", () => {
  it("returns a detailed eligible preflight only to an admin/owner", async () => {
    const response = await request(app)
      .get("/api/boq/projects/77/scope-segments/501/initial-correction-eligibility");

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      eligible: true,
      projectId: 77,
      segment: { id: 501, status: "confirmed", revisionOf: null },
      blockers: [],
    });
    expect(fx.eligibility).toHaveBeenCalledWith(501);
  });

  it("rejects a non-admin/non-owner before reading eligibility or mutating", async () => {
    fx.adminAllowed = false;
    fx.user.isAdmin = false;
    fx.user.isOwner = false;

    const preflight = await request(app)
      .get("/api/boq/projects/77/scope-segments/501/initial-correction-eligibility");
    const correction = await request(app)
      .post("/api/boq/scope-segments/501/correct-initial")
      .send(correctionBody());

    expect(preflight.status).toBe(403);
    expect(correction.status).toBe(403);
    expect(fx.eligibility).not.toHaveBeenCalled();
    expect(fx.correction).not.toHaveBeenCalled();
  });

  it("does not leak a segment from another project through the preflight URL", async () => {
    fx.eligibility.mockResolvedValue(eligibility({ projectId: 88 }));

    const response = await request(app)
      .get("/api/boq/projects/77/scope-segments/501/initial-correction-eligibility");

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: "scope_segment_not_found" });
  });

  it("returns specific downstream and affected-draft details from a blocked preflight", async () => {
    fx.eligibility.mockResolvedValue(eligibility({
      eligible: false,
      blockers: [{
        code: "DRAFT_EQUIPMENT_LINK_UNSAFE",
        message: "Draft DPR equipment link is not demonstrably provisional.",
        count: 1,
        ids: [3301],
      }],
      affectedDrafts: [{ id: 900, date: "2026-03-02", site: "ALIPUR", affectedRows: 2 }],
    }));

    const response = await request(app)
      .get("/api/boq/projects/77/scope-segments/501/initial-correction-eligibility");

    expect(response.status).toBe(200);
    expect(response.body.eligible).toBe(false);
    expect(response.body.blockers).toEqual([
      expect.objectContaining({ code: "DRAFT_EQUIPMENT_LINK_UNSAFE", ids: [3301] }),
    ]);
    expect(response.body.affectedDrafts).toEqual([
      { id: 900, date: "2026-03-02", site: "ALIPUR", affectedRows: 2, editUrl: "/site/edit/900?draft" },
    ]);
  });
});

describe("initial correction validation and mutation", () => {
  it("requires a correction reason and performs no storage write", async () => {
    const response = await request(app)
      .post("/api/boq/scope-segments/501/correct-initial")
      .send(correctionBody({ correctionReason: "   " }));

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("correction_reason_required");
    expect(fx.correction).not.toHaveBeenCalled();
  });

  it("does not substitute the scope reason for the dedicated correction reason", async () => {
    const response = await request(app)
      .post("/api/boq/scope-segments/501/correct-initial")
      .send(correctionBody({
        correctionReason: undefined,
        reason: "Business scope reason must not authorize correction",
      }));

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("correction_reason_required");
    expect(fx.correction).not.toHaveBeenCalled();
  });

  it("rejects invalid segment type and chainage before storage", async () => {
    const badType = await request(app)
      .post("/api/boq/scope-segments/501/correct-initial")
      .send(correctionBody({ segmentType: "made_up_type" }));
    const badRange = await request(app)
      .post("/api/boq/scope-segments/501/correct-initial")
      .send(correctionBody({ chainageFrom: 8, chainageTo: 1 }));

    expect(badType.status).toBe(400);
    expect(badType.body.error).toMatch(/segmentType/);
    expect(badRange.status).toBe(400);
    expect(badRange.body.error).toMatch(/chainage-to/);
    expect(fx.correction).not.toHaveBeenCalled();
  });

  it("rejects an overlong reason without opening the correction mutation", async () => {
    const response = await request(app)
      .post("/api/boq/scope-segments/501/correct-initial")
      .send(correctionBody({ correctionReason: "x".repeat(2001) }));

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("correction_reason_too_long");
    expect(fx.correction).not.toHaveBeenCalled();
  });

  it("returns the same confirmed row and reports drafts affected by the correction", async () => {
    fx.correction.mockResolvedValue({
      segment: corrected,
      before: original,
      affectedDrafts: [{ id: 901, date: "2026-03-04", site: "ALIPUR", affectedRows: 1 }],
    });

    const response = await request(app)
      .post("/api/boq/scope-segments/501/correct-initial")
      .send(correctionBody());

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      id: 501,
      boqProjectId: 77,
      correctedInPlace: true,
      status: "confirmed",
      revisionOf: null,
      before: { id: 501, status: "confirmed", revisionOf: null },
      affectedDrafts: [{ id: 901, affectedRows: 1, editUrl: "/site/edit/901?draft" }],
    });
    expect(fx.correction).toHaveBeenCalledWith(
      501,
      expect.objectContaining({
        segmentType: "no_scope",
        chainageFrom: 1,
        chainageTo: 8,
        side: "lhs",
      }),
      "Initial field-entry mistake confirmed by signed site note",
      { userId: 17, userName: "Scope Admin", userRole: "admin" },
    );
    // The project and imported BOQ are context, not editable correction input.
    expect(fx.correction.mock.calls[0][1]).not.toHaveProperty("boqProjectId");
    expect(fx.correction.mock.calls[0][1]).not.toHaveProperty("id");
  });

  it("does not materialize omitted stored fields as null during correction", async () => {
    const response = await request(app)
      .post("/api/boq/scope-segments/501/correct-initial")
      .send({
        segmentType: "no_scope",
        chainageFrom: 1,
        chainageTo: 8,
        side: "lhs",
        notes: "new correction note",
        correctionReason: "Verified against signed site note",
      });

    expect(response.status).toBe(200);
    expect(fx.correction.mock.calls[0][1]).toEqual({
      segmentType: "no_scope",
      chainageFrom: 1,
      chainageTo: 8,
      side: "lhs",
      notes: "new correction note",
    });
    for (const omitted of [
      "effectiveTo", "documentRef", "consentRef", "omittedQty",
      "omittedAmount", "originalScopeNote", "revisedScopeNote",
    ]) {
      expect(fx.correction.mock.calls[0][1]).not.toHaveProperty(omitted);
    }
  });

  it("maps a blocked race/dependency from storage to 409 and never presents an override", async () => {
    fx.correction.mockRejectedValueOnce(new fx.BlockedClass([
      {
        code: "PROGRAMME_BARS_EXIST",
        message: "Programme/work-program bars already exist for this project.",
        count: 3,
        ids: [1, 2, 3],
      },
    ]));

    const response = await request(app)
      .post("/api/boq/scope-segments/501/correct-initial")
      .send(correctionBody());

    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({
      error: "initial_scope_correction_blocked",
      code: "INITIAL_SCOPE_CORRECTION_BLOCKED",
      blockers: [{ code: "PROGRAMME_BARS_EXIST", ids: [1, 2, 3] }],
    });
    expect(response.body).not.toHaveProperty("override");
  });

  it("maps unexpected correction failures to 500 without fabricating success", async () => {
    fx.correction.mockRejectedValueOnce(new Error("transaction unavailable"));

    const response = await request(app)
      .post("/api/boq/scope-segments/501/correct-initial")
      .send(correctionBody());

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: "Failed to correct initial scope segment" });
  });
});

describe("draft submission scope-token handoff", () => {
  const draftPayload = {
    date: "2026-03-04",
    site: "ALIPUR",
    engineer: "FIELD ENGINEER",
    boqProjectId: 77,
    progress: [],
    structureItems: [],
    equipment: [],
    labour: [],
    materials: [],
    sitePurchases: [],
  };

  it("reads a fresh token and passes it into final draft submission", async () => {
    fx.getDpr.mockResolvedValue({
      id: 1200,
      dprStatus: "draft",
      site: "ALIPUR",
      boqProjectId: 77,
    });
    fx.getProjectScopeVersionToken.mockResolvedValue("scope-token-17");
    fx.submitDraftDpr.mockResolvedValue({
      id: 1200,
      dprStatus: "submitted",
      site: "ALIPUR",
      engineer: "FIELD ENGINEER",
    });

    const response = await request(app)
      .post("/api/dprs/1200/submit")
      .send(draftPayload);

    expect(response.status).toBe(200);
    expect(fx.getProjectScopeVersionToken).toHaveBeenCalledWith(77);
    expect(fx.submitDraftDpr).toHaveBeenCalledWith(
      1200,
      expect.objectContaining({ boqProjectId: 77, progress: [] }),
      undefined,
      expect.objectContaining({ userId: 17 }),
      "scope-token-17",
    );
  });

  it("maps a correction committed during validation to 409 and does not notify as submitted", async () => {
    fx.getDpr.mockResolvedValue({
      id: 1200,
      dprStatus: "draft",
      site: "ALIPUR",
      boqProjectId: 77,
    });
    fx.getProjectScopeVersionToken.mockResolvedValue("scope-token-old");
    const stale = new Error("Project scope changed while this DPR was being submitted");
    (stale as any).code = "SCOPE_CHANGED_DURING_PLANNING";
    fx.submitDraftDpr.mockRejectedValueOnce(stale);

    const response = await request(app)
      .post("/api/dprs/1200/submit")
      .send(draftPayload);

    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({ code: "SCOPE_CHANGED_DURING_SUBMIT" });
    expect(fx.createNotification).not.toHaveBeenCalled();
  });
});
