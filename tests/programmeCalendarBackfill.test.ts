/**
 * Legacy programme-bar calendar-date backfill.
 *
 * Bars created by auto-sequence before calendar-date persistence carry only
 * month indexes (start_date/end_date NULL) although the Gantt displays them.
 * The schedule-revision guard therefore rejected them with
 * CALENDAR_SCHEDULE_REQUIRED even though the user could see a schedule.
 *
 * Covers:
 *  A. valid month indexes + null dates → safely normalised via the canonical
 *     calendar-axis conversion (never a second formula);
 *  B. existing non-null calendar dates are never overwritten;
 *  C. invalid/unresolvable bars are reported, not guessed;
 *  D. the reproduced Takkadpally-sirur C&G bar reaches a normal revision
 *     preview after normalisation — and the guard is NOT weakened for bars
 *     that genuinely have no committed schedule;
 *  G. cascade behaviour is unchanged (successors use stored pre-revision dates).
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import { createServer } from "http";
import request from "supertest";
import { deriveMissingBarCalendarDates } from "../shared/programmeRevision";
import { monthIndexToDateCal, displayFinishDateCal } from "../shared/calendarAxis";

const iso = (d: Date) => [
  d.getFullYear(),
  String(d.getMonth() + 1).padStart(2, "0"),
  String(d.getDate()).padStart(2, "0"),
].join("-");

// ─── Pure normalisation rules ────────────────────────────────────────────────

describe("deriveMissingBarCalendarDates", () => {
  // Reproduced production shape: Takkadpally-sirur C&G Reach 1,
  // startMonth 1 → endMonth 1.08, dates never persisted.
  const PROJECT_START = "2026-07-01";

  it("A: fills null dates from month indexes using the canonical converters", () => {
    const result = deriveMissingBarCalendarDates(
      { startMonth: 1, endMonth: 1.08, startDate: null, endDate: null },
      PROJECT_START,
    );
    expect(result).toEqual({
      action: "fill",
      startDate: iso(monthIndexToDateCal(1, PROJECT_START)),
      endDate: iso(displayFinishDateCal(1.08, PROJECT_START, 1)),
    });
    // M1 = project start exactly (engine invariant).
    expect((result as any).startDate).toBe("2026-07-01");
    // Displayed finish = boundary − 1 day; never precedes the start.
    expect((result as any).endDate >= (result as any).startDate).toBe(true);
  });

  it("A: normalisation is idempotent — a filled bar is skipped on the next run", () => {
    const first = deriveMissingBarCalendarDates(
      { startMonth: 1.84, endMonth: 1.92, startDate: null, endDate: null },
      PROJECT_START,
    );
    expect(first.action).toBe("fill");
    const second = deriveMissingBarCalendarDates(
      { startMonth: 1.84, endMonth: 1.92, ...(first as any) },
      PROJECT_START,
    );
    expect(second).toEqual({ action: "skip", reason: "already has committed calendar dates" });
  });

  it("B: never overwrites existing non-null dates (partial fill keeps them)", () => {
    const result = deriveMissingBarCalendarDates(
      { startMonth: 1, endMonth: 2, startDate: "2026-07-05", endDate: null },
      PROJECT_START,
    );
    expect(result.action).toBe("fill");
    expect((result as any).startDate).toBe("2026-07-05"); // untouched
    expect((result as any).endDate).toBe(iso(displayFinishDateCal(2, PROJECT_START, 1)));
  });

  it("C: refuses impossible calendar dates instead of letting Date arithmetic roll them over", () => {
    for (const start of ["2026-02-31", "2027-02-29", "2026-13-01", "2026-04-31"]) {
      const result = deriveMissingBarCalendarDates(
        { startMonth: 1, endMonth: 2, startDate: null, endDate: null },
        start,
      );
      expect(result).toEqual({ action: "skip", reason: "project has no valid start date" });
    }
    // Leap day on an actual leap year is a real date and must pass.
    const leap = deriveMissingBarCalendarDates(
      { startMonth: 1, endMonth: 2, startDate: null, endDate: null },
      "2028-02-29",
    );
    expect(leap.action).toBe("fill");
  });

  it("C: refuses a malformed persisted partial date instead of pairing a derived date with it", () => {
    const result = deriveMissingBarCalendarDates(
      { startMonth: 1, endMonth: 2, startDate: "garbage", endDate: null },
      PROJECT_START,
    );
    expect(result).toEqual({ action: "skip", reason: "derived date is invalid" });
  });

  it("C: refuses when the project has no valid start date", () => {
    for (const start of [null, undefined, "", "not-a-date"]) {
      const result = deriveMissingBarCalendarDates(
        { startMonth: 1, endMonth: 2, startDate: null, endDate: null },
        start as any,
      );
      expect(result.action).toBe("skip");
      expect((result as any).reason).toMatch(/start date/i);
    }
  });

  it("C: refuses invalid month indexes instead of guessing", () => {
    const cases: Array<{ startMonth: any; endMonth: any }> = [
      { startMonth: NaN, endMonth: 2 },
      { startMonth: null, endMonth: 2 },
      { startMonth: 0, endMonth: 2 },
      { startMonth: -1, endMonth: 2 },
      { startMonth: 2, endMonth: NaN },
      { startMonth: 2, endMonth: null },
      { startMonth: 3, endMonth: 2 }, // inverted
    ];
    for (const c of cases) {
      const result = deriveMissingBarCalendarDates(
        { ...c, startDate: null, endDate: null },
        PROJECT_START,
      );
      expect(result.action).toBe("skip");
    }
  });

  it("C: refuses a derived range that inverts against a persisted date", () => {
    // Legacy persisted start far after the month-derived finish.
    const result = deriveMissingBarCalendarDates(
      { startMonth: 1, endMonth: 1.08, startDate: "2026-12-01", endDate: null },
      PROJECT_START,
    );
    expect(result).toEqual({
      action: "skip",
      reason: expect.stringMatching(/inverted/),
    });
  });

  it("equal start/end month indexes normalise to a one-day bar, not an error", () => {
    const result = deriveMissingBarCalendarDates(
      { startMonth: 1.5, endMonth: 1.5, startDate: null, endDate: null },
      PROJECT_START,
    );
    expect(result.action).toBe("fill");
    expect((result as any).endDate).toBe((result as any).startDate);
  });
});

// ─── Route behaviour: guard intact, normalised bar becomes revision-capable ──

const PROJECT_ID = 870001;

const fx = {
  bars: [] as any[],
  evidence: new Map<number, { reportedQty: number; earliestProgressDate: string | null }>(),
  projectStartDate: "2026-07-01" as string | null,
};

const calls = { commits: [] as any[] };

vi.mock("../server/push", () => ({
  sendPushToSection: vi.fn().mockResolvedValue(undefined),
  sendTestPush: vi.fn().mockResolvedValue(undefined),
  sendPushToAudience: vi.fn().mockResolvedValue(undefined),
  initPush: vi.fn(),
}));

vi.mock("../server/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../server/auth")>();
  const inject = (req: any, _res: any, next: any) => {
    req.authUser = {
      id: 91,
      username: "programme-admin",
      name: "Programme Admin",
      isAdmin: true,
      isActive: true,
      sessionPolicy: "sticky",
    };
    req.authPermissions = {};
    next();
  };
  return { ...actual, requireAuth: inject, optionalAuth: inject };
});

vi.mock("../server/storage", () => {
  const methods: Record<string, ReturnType<typeof vi.fn>> = {};
  const proxy = new Proxy(methods, {
    get(target, prop: string) {
      if (!(prop in target)) target[prop] = vi.fn().mockResolvedValue([]);
      return target[prop];
    },
  });
  methods.getWorkProgramBar = vi.fn(async (id: number) => fx.bars.find((bar) => bar.id === id));
  methods.getWorkProgramBars = vi.fn(async (projectId: number) =>
    fx.bars.filter((bar) => bar.boqProjectId === projectId),
  );
  methods.getWorkProgrammeExecutionEvidence = vi.fn(async () => fx.evidence);
  methods.getBoqProject = vi.fn(async (id: number) =>
    id === PROJECT_ID ? { id, startDate: fx.projectStartDate } : undefined,
  );
  methods.commitWorkProgrammeScheduleRevision = vi.fn(async (input: any) => {
    calls.commits.push(input);
    return {
      source: fx.bars.find((bar) => bar.id === input.source.id),
      shifted: input.shifted,
    };
  });
  methods.getDprs = vi.fn(async () => [{ id: 1 }]);
  return { storage: proxy };
});

let app: express.Express;

function cgBar(overrides: Record<string, unknown> = {}) {
  // Mirrors the reproduced bar: C&G Reach 1, months 1 → 1.08, null dates.
  return {
    id: 26128,
    boqProjectId: PROJECT_ID,
    boqItemId: 13,
    itemCode: "C&G",
    description: "Clearing and grubbing road land including uprooting",
    reachLabel: "Reach 1",
    chainageFrom: 0,
    chainageTo: 1.9,
    side: null,
    startMonth: 1,
    endMonth: 1.08,
    startDate: null,
    endDate: null,
    baselineStartDate: null,
    baselineEndDate: null,
    revisionHistory: [],
    plannedQty: 1.9,
    source: "auto-sequence",
    scheduled: true,
    ...overrides,
  };
}

function normalise(bar: any) {
  const result = deriveMissingBarCalendarDates(bar, fx.projectStartDate);
  if (result.action !== "fill") throw new Error(`expected fill, got ${JSON.stringify(result)}`);
  return { ...bar, startDate: result.startDate, endDate: result.endDate };
}

beforeAll(async () => {
  const { registerRoutes } = await import("../server/routes");
  app = express();
  app.use(express.json());
  await registerRoutes(createServer(app), app);
});

beforeEach(() => {
  fx.bars = [cgBar()];
  fx.evidence = new Map();
  fx.projectStartDate = "2026-07-01";
  calls.commits = [];
});

describe("revision preview after calendar backfill", () => {
  it("guard NOT weakened: a bar with no committed schedule still returns 409 CALENDAR_SCHEDULE_REQUIRED", async () => {
    const res = await request(app)
      .post("/api/boq/programme/bars/26128/revision-preview")
      .send({ endDate: "2026-07-10", reason: "Recovery plan", cascade: true });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe("CALENDAR_SCHEDULE_REQUIRED");
  });

  it("D: the reproduced C&G bar reaches a normal preview once normalised", async () => {
    fx.bars = [normalise(cgBar())];
    const res = await request(app)
      .post("/api/boq/programme/bars/26128/revision-preview")
      .send({
        startDate: "2026-07-01",
        endDate: "2026-07-10",
        reason: "Access handover delayed",
        cascade: true,
      });
    expect(res.status).toBe(200);
    expect(res.body.previewToken).toMatch(/^[a-f0-9]{64}$/);
    expect(res.body.source.before.startDate).toBe("2026-07-01");
    expect(res.body.source.after.endDate).toBe("2026-07-10");
    expect(calls.commits).toHaveLength(0);
  });

  it("E: a started normalised bar locks actual start and allows finish revision", async () => {
    fx.bars = [normalise(cgBar())];
    fx.evidence = new Map([[26128, { reportedQty: 0.5, earliestProgressDate: "2026-07-02" }]]);
    const res = await request(app)
      .post("/api/boq/programme/bars/26128/revision-preview")
      .send({ endDate: "2026-07-15", reason: "Extended clearing", cascade: true });
    expect(res.status).toBe(200);
    expect(res.body.source.executionState).toBe("started");
    expect(res.body.source.actualStartDate).toBe("2026-07-02");
    // Actual start is locked: the revised start snaps to the earliest
    // progress date, and only the finish moves to the requested value.
    expect(res.body.source.after.startDate).toBe("2026-07-02");
    expect(res.body.source.after.endDate).toBe("2026-07-15");
  });

  it("G: cascade still shifts an unstarted overlapping successor by the calendar-day delta", async () => {
    const source = normalise(cgBar());
    // Cascade candidates must truly chainage-overlap the source (touching
    // ranges don't count) and start on/after its pre-revision finish.
    const successor = normalise(cgBar({
      id: 26138,
      reachLabel: "Reach 2",
      chainageFrom: 1.0,
      chainageTo: 3.8,
      startMonth: 1.84,
      endMonth: 1.92,
    }));
    fx.bars = [source, successor];
    const res = await request(app)
      .post(`/api/boq/programme/bars/${source.id}/revision-preview`)
      .send({
        startDate: source.startDate,
        endDate: "2026-08-05", // finish pushed past the successor's start
        reason: "Monsoon slippage",
        cascade: true,
      });
    expect(res.status).toBe(200);
    const shifted = res.body.shifted.find((row: any) => row.before.id === 26138);
    expect(shifted).toBeTruthy();
    // Successor candidates use the stored pre-revision dates as the baseline.
    expect(shifted.before.startDate).toBe(successor.startDate);
    const deltaDays = res.body.deltaDays;
    expect(deltaDays).toBeGreaterThan(0);
    const shiftMs = Date.parse(`${shifted.after.startDate}T00:00:00Z`)
      - Date.parse(`${shifted.before.startDate}T00:00:00Z`);
    expect(Math.round(shiftMs / 86400000)).toBe(deltaDays);
  });

  it("G: a started successor remains protected from the cascade", async () => {
    const source = normalise(cgBar());
    const successor = normalise(cgBar({
      id: 26138,
      reachLabel: "Reach 2",
      chainageFrom: 1.0,
      chainageTo: 3.8,
      startMonth: 1.84,
      endMonth: 1.92,
    }));
    fx.bars = [source, successor];
    fx.evidence = new Map([[26138, { reportedQty: 0.4, earliestProgressDate: "2026-07-28" }]]);
    const res = await request(app)
      .post(`/api/boq/programme/bars/${source.id}/revision-preview`)
      .send({ startDate: source.startDate, endDate: "2026-08-05", reason: "Monsoon slippage", cascade: true });
    expect(res.status).toBe(200);
    expect(res.body.shifted).toHaveLength(0);
    expect(res.body.notShifted).toEqual([
      expect.objectContaining({
        bar: expect.objectContaining({ id: 26138 }),
        executionState: "started",
      }),
    ]);
  });
});
