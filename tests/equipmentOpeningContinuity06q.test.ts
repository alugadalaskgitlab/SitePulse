/**
 * INSTRUCTION 06Q — Equipment / Machinery opening-reading continuity.
 *
 * Pure unit tests for the canonical cross-source pick (shared/equipmentContinuity.ts),
 * route-level tests against the REAL registered handler (registerRoutes,
 * storage mocked — 028B pattern), and source pins on the SQL ordering and
 * the four wired client surfaces.
 *
 * Covers Claude 06Q core rules plus 06Q correction tests:
 *  R. same-date multiple logs — deterministic per-source ordering pins and
 *     cross-source same-date comparison.
 *  S. SiteEdit new row — continuity for isNew rows; existing rows never
 *     recalculated on load.
 */
import { vi, describe, it, expect, beforeAll } from "vitest";
import express from "express";
import { createServer } from "http";
import request from "supertest";
import fs from "fs";
import { pickLatestClosing } from "../shared/equipmentContinuity";

const fx: { role: string } = { role: "admin" };

vi.mock("../server/push", () => ({
  sendPushToAll: vi.fn().mockResolvedValue(undefined),
  sendTestPush: vi.fn().mockResolvedValue(undefined),
  sendPushToAudience: vi.fn().mockResolvedValue(undefined),
  initPush: vi.fn(),
}));

vi.mock("../server/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../server/auth")>();
  const inject = (req: any, _res: any, next: any) => {
    req.authUser = { id: 9, username: "test-user", fullName: "test-user", isAdmin: fx.role === "admin", isActive: true };
    req.authPermissions = {};
    req.session = { role: fx.role, username: "test-user", userId: 9 };
    next();
  };
  return { ...actual, requireAuth: inject, optionalAuth: inject };
});

vi.mock("../server/storage", () => {
  const methods: Record<string, ReturnType<typeof vi.fn>> = {};
  const storageProxy = new Proxy(methods, {
    get(target, prop: string) {
      if (!(prop in target)) target[prop] = vi.fn().mockResolvedValue([]);
      return target[prop];
    },
  });
  methods.resolveLatestPriorClosing = vi.fn(async () => ({
    closingReading: 1291.2, sourceDate: "2026-08-17", source: "plant_usage", recordId: 7,
  }));
  return { storage: storageProxy };
});

let app: express.Express;
let storage: any;

beforeAll(async () => {
  ({ storage } = await import("../server/storage"));
  const { registerRoutes } = await import("../server/routes");
  app = express();
  app.use(express.json({ limit: "5mb" }));
  const server = createServer(app);
  await registerRoutes(server, app);
});

// ─────────────────────────────────────────────────────────────────────────
// Pure cross-source comparison
// ─────────────────────────────────────────────────────────────────────────
describe("06Q pickLatestClosing — cross-source comparison", () => {
  const plant = (over: any = {}) => ({ source: "plant_usage" as const, date: "2026-08-14", closingReading: 1284.7, recordId: 10, ...over });
  const dpr = (over: any = {}) => ({ source: "dpr_log" as const, date: "2026-08-14", closingReading: 1284.7, recordId: 55, plantUsageId: null, ...over });

  it("no candidates → null", () => {
    expect(pickLatestClosing(null, null)).toBeNull();
  });
  it("single-source candidates pass through", () => {
    expect(pickLatestClosing(plant(), null)!.source).toBe("plant_usage");
    expect(pickLatestClosing(null, dpr())!.source).toBe("dpr_log");
  });
  it("later business date wins (Friday → Monday carry-forward)", () => {
    // Friday 14-Aug plant closing vs Wednesday 12-Aug DPR closing; Monday
    // 17-Aug opening resolves to Friday's closing.
    const r = pickLatestClosing(plant({ date: "2026-08-14", closingReading: 900 }), dpr({ date: "2026-08-12", closingReading: 9999 }));
    expect(r).toMatchObject({ source: "plant_usage", sourceDate: "2026-08-14", closingReading: 900 });
  });
  it("zero is a valid closing reading", () => {
    const r = pickLatestClosing(plant({ date: "2026-08-16", closingReading: 0 }), dpr({ date: "2026-08-12", closingReading: 500 }));
    expect(r!.closingReading).toBe(0);
  });
  it("same date + mirrored pair (log.plantUsageId === usage.id) is ONE event, not two", () => {
    const r = pickLatestClosing(
      plant({ date: "2026-08-17", closingReading: 1291.2, recordId: 77 }),
      dpr({ date: "2026-08-17", closingReading: 1291.2, plantUsageId: 77 }),
    );
    expect(r).toMatchObject({ source: "plant_usage", recordId: 77, closingReading: 1291.2 });
  });
  it("R: same date, distinct events across sources → higher (later) meter closing wins", () => {
    // 17-Aug morning closing 1284.7 (plant), 17-Aug evening closing 1291.2
    // (DPR) → 18-Aug opening = 1291.2.
    const r = pickLatestClosing(
      plant({ date: "2026-08-17", closingReading: 1284.7 }),
      dpr({ date: "2026-08-17", closingReading: 1291.2 }),
    );
    expect(r).toMatchObject({ source: "dpr_log", closingReading: 1291.2 });
    // Symmetric: plant has the later closing.
    const r2 = pickLatestClosing(
      plant({ date: "2026-08-17", closingReading: 1291.2 }),
      dpr({ date: "2026-08-17", closingReading: 1284.7 }),
    );
    expect(r2).toMatchObject({ source: "plant_usage", closingReading: 1291.2 });
  });
  it("same date exact tie → plant_usage (deterministic)", () => {
    const r = pickLatestClosing(
      plant({ date: "2026-08-17", closingReading: 1291.2 }),
      dpr({ date: "2026-08-17", closingReading: 1291.2 }),
    );
    expect(r!.source).toBe("plant_usage");
  });
});

// ─────────────────────────────────────────────────────────────────────────
// R: deterministic per-source "latest prior" ordering — SQL source pins
// ─────────────────────────────────────────────────────────────────────────
describe("06Q resolver SQL — deterministic ordering & validity filters (source pins)", () => {
  const src = fs.readFileSync("server/storage.ts", "utf8");
  const block = src.slice(src.indexOf("async resolveLatestPriorClosing"), src.indexOf("async resolveLatestPriorClosing") + 4000);

  it("equipment_usage tie-break: date DESC, created_at DESC NULLS LAST, id DESC", () => {
    expect(block).toContain("desc(equipmentUsage.date)");
    expect(block).toContain("DESC NULLS LAST");
    expect(block).toContain("equipmentUsage.createdAt");
    expect(block).toContain("desc(equipmentUsage.id)");
  });
  it("equipment_logs tie-break: dprs.date DESC, equipment_logs.id DESC (no new timestamp column)", () => {
    expect(block).toContain("desc(dprs.date), desc(equipmentLogs.id)");
  });
  it("null closings skipped in BOTH sources (zero remains valid — no > 0 filter)", () => {
    expect(block).toContain("isNotNull(equipmentUsage.closingReading)");
    expect(block).toContain("isNotNull(equipmentLogs.closingReading)");
    expect(block).not.toMatch(/closingReading[^,\n]*>\s*0/);
  });
  it("DPR candidates only from live submitted DPRs (not deleted / superseded / draft)", () => {
    expect(block).toContain("eq(dprs.isDeleted, false)");
    expect(block).toContain("eq(dprs.isSuperseded, false)");
    expect(block).toContain('ne(dprs.dprStatus, "draft")');
  });
  it("strictly-before by default, on-or-before only when inclusive", () => {
    expect(block).toContain("lt(equipmentUsage.date, beforeDate)");
    expect(block).toContain("lte(equipmentUsage.date, beforeDate)");
    expect(block).toContain("lt(dprs.date, beforeDate)");
    expect(block).toContain("lte(dprs.date, beforeDate)");
    expect(block).toContain("opts?.inclusive");
  });
  it("cross-source pick delegates to the ONE canonical pickLatestClosing", () => {
    expect(block).toContain("pickLatestClosing(");
  });
  it("no schema change: no new timestamp column added to equipment_logs", () => {
    const schema = fs.readFileSync("shared/schema.ts", "utf8");
    const logsBlock = schema.slice(schema.indexOf('pgTable("equipment_logs"'), schema.indexOf('pgTable("equipment_logs"') + 2500);
    expect(logsBlock).not.toContain("createdAt");
    expect(logsBlock).not.toContain("timestamp(");
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Endpoint
// ─────────────────────────────────────────────────────────────────────────
describe("06Q GET /api/equipment/:equipmentId/latest-closing", () => {
  it("400 without beforeDate / malformed date", async () => {
    expect((await request(app).get("/api/equipment/5/latest-closing")).status).toBe(400);
    expect((await request(app).get("/api/equipment/5/latest-closing?beforeDate=17-08-2026")).status).toBe(400);
  });
  it("returns the resolver result; strict (non-inclusive) by default", async () => {
    const res = await request(app).get("/api/equipment/5/latest-closing?beforeDate=2026-08-18");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ closingReading: 1291.2, sourceDate: "2026-08-17", source: "plant_usage" });
    const [eqId, beforeDate, opts] = storage.resolveLatestPriorClosing.mock.calls.at(-1);
    expect(eqId).toBe(5);
    expect(beforeDate).toBe("2026-08-18");
    expect(opts).toEqual({ inclusive: false });
  });
  it("inclusive=1 passes through (Plant module same-day continuity)", async () => {
    await request(app).get("/api/equipment/5/latest-closing?beforeDate=2026-08-18&inclusive=1");
    expect(storage.resolveLatestPriorClosing.mock.calls.at(-1)[2]).toEqual({ inclusive: true });
  });
  it("no prior closing → explicit null shape (never fabricated)", async () => {
    storage.resolveLatestPriorClosing.mockResolvedValueOnce(null);
    const res = await request(app).get("/api/equipment/5/latest-closing?beforeDate=2026-08-18");
    expect(res.body).toEqual({ closingReading: null, sourceDate: null, source: null });
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Client wiring pins — all four surfaces use the ONE client helper
// ─────────────────────────────────────────────────────────────────────────
describe("06Q client wiring (source pins)", () => {
  const read = (p: string) => fs.readFileSync(p, "utf8");

  it("one canonical client helper hits the canonical endpoint", () => {
    const lib = read("client/src/lib/equipmentContinuity.ts");
    expect(lib).toContain("/latest-closing?beforeDate=");
  });
  it("SiteEntry: same-day open Plant linkage first, resolver fallback with stale + manual-override guards", () => {
    const s = read("client/src/pages/SiteEntry.tsx");
    const fn = s.slice(s.indexOf("const fetchOpenPlantRecord"), s.indexOf("const fetchOpenPlantRecord") + 3000);
    expect(fn).toContain("open-today");
    expect(fn).toContain("fetchLatestPriorClosing(equipmentId, header.date)");
    // linkage priority: resolver only runs when no open record
    expect(fn.indexOf("return;")).toBeLessThan(fn.indexOf("fetchLatestPriorClosing"));
    // stale guard + manual-override guard
    expect(fn).toContain("row.equipmentId === equipmentId");
    expect(fn).toContain("row.openingReading === null");
  });
  it("Guided DPR: open-usage link priority, resolver fallback guarded by equipmentId + blank opening", () => {
    const s = read("client/src/pages/GuidedDpr.tsx");
    expect(s).toContain("nextPt.plantUsageId = open.id");
    expect(s).toContain("fetchLatestPriorClosing(sel.id, date)");
    expect(s).toContain("pt?.equipmentId !== sel.id");
    expect(s).toContain("pt.plantUsageId != null");
  });
  it("Plant Equipment Usage: cross-source resolver (inclusive), stale-sequence guard, manual edits win, diesel previous-balance untouched", () => {
    const s = read("client/src/pages/PlantEquipmentUsage.tsx");
    expect(s).toContain("fetchLatestPriorClosing(Number(value), date, { inclusive: true })");
    expect(s).toContain("openingFetchSeqRef");
    expect(s).toContain("!userModifiedOpening");
    expect(s).toContain("previous-balance"); // diesel logic still uses its own endpoint
    expect(s).toContain("data.previousBalance"); // opening diesel still from previousBalance
  });
});

// ─────────────────────────────────────────────────────────────────────────
// S: SiteEdit — new rows wired, existing rows never recalculated on load
// ─────────────────────────────────────────────────────────────────────────
describe("06Q Test S — SiteEdit (source pins)", () => {
  const s = fs.readFileSync("client/src/pages/SiteEdit.tsx", "utf8");

  it("rows added in the edit session are flagged isNew and get continuity on equipment select", () => {
    expect(s).toMatch(/setEquipment\(\[\.\.\.equipment[\s\S]{0,600}isNew: true/);
    expect(s).toContain("fetchLatestPriorClosing(selectedEquip.id, header.date)");
    // new rows only fill a blank opening — manual entry never overwritten
    expect(s).toContain("row.isNew && row.openingReading != null");
  });
  it("existing DPR rows load their stored openingReading verbatim — no resolver call in hydration", () => {
    const mapFn = s.slice(s.indexOf("mapDprToFormState"), s.indexOf("mapDprToFormState") + 6000);
    expect(mapFn).toContain("openingReading: e.openingReading ?? null");
    expect(mapFn).not.toContain("fetchLatestPriorClosing");
    // hydrated rows are NOT marked isNew (only the empty-DPR fallback row is)
  });
  it("changing equipment on an EXISTING row requires explicit confirmation before replacing the stored opening", () => {
    expect(s).toContain("window.confirm(");
    expect(s).toMatch(/wasExistingWithReading[\s\S]{0,400}window\.confirm/);
  });
  it("isNew is client-only — stripped from the save payload", () => {
    expect(s).toMatch(/const \{ isNew: _isNew, \.\.\.rest \} = eq;/);
  });
});
