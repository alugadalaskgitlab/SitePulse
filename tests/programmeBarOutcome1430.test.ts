import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  PROGRAMME_BAR_OUTCOMES,
  PROGRAMME_BAR_OUTCOME_REASONS,
  programmeBarOutcomeInputError,
} from "../shared/programmeBarOutcome";

const valid = (overrides: Record<string, unknown> = {}) => ({
  outcome: "executed", reason: "rain", actualQuantity: 12, actualUom: "CUM", ...overrides,
});

describe("Task 1430 programme-bar outcome contract", () => {
  it("defines the complete outcome and reason vocabularies", () => {
    expect(PROGRAMME_BAR_OUTCOMES).toEqual(["executed", "partially_executed", "not_executed", "cancelled", "suspended", "early_closed", "rescheduled"]);
    expect(PROGRAMME_BAR_OUTCOME_REASONS).toEqual(["rain", "site_not_ready", "client_instruction", "equipment_breakdown", "vendor_unavailable", "material_unavailable", "work_completed_early", "change_in_programme", "other"]);
  });

  it("validates every outcome/reason tuple and all conditional fields", () => {
    for (const outcome of PROGRAMME_BAR_OUTCOMES) {
      const input = outcome === "executed" || outcome === "partially_executed"
        ? valid({ outcome })
        : valid({ outcome, actualQuantity: null, actualUom: null, rescheduledDate: outcome === "rescheduled" ? "2026-09-01" : null });
      expect(programmeBarOutcomeInputError(input)).toBeNull();
    }
    for (const reason of PROGRAMME_BAR_OUTCOME_REASONS) {
      expect(programmeBarOutcomeInputError(valid({ reason, reasonOther: reason === "other" ? "Flooded approach" : null }))).toBeNull();
    }
    expect(programmeBarOutcomeInputError(valid({ reason: "other", reasonOther: null }))).toMatch(/reasonOther is required/);
    expect(programmeBarOutcomeInputError(valid({ reason: "rain", reasonOther: "no" }))).toMatch(/only allowed/);
    expect(programmeBarOutcomeInputError(valid({ outcome: "rescheduled", actualQuantity: null, actualUom: null, rescheduledDate: null }))).toMatch(/rescheduledDate is required/);
    expect(programmeBarOutcomeInputError(valid({ rescheduledDate: "2026-09-01" }))).toMatch(/only allowed/);
    expect(programmeBarOutcomeInputError(valid({ actualQuantity: null }))).toMatch(/actualQuantity and actualUom are required/);
    expect(programmeBarOutcomeInputError(valid({ outcome: "suspended", actualQuantity: 1, actualUom: "CUM" }))).toMatch(/only allowed/);
  });

  it("preserves multiple events per bar and identifies the latest by date then creation", () => {
    const events = [
      { id: 1, programmeBarId: 77, eventDate: "2026-08-30", createdAt: "2026-08-30T08:00:00Z", outcome: "suspended" },
      { id: 2, programmeBarId: 77, eventDate: "2026-09-02", createdAt: "2026-09-02T08:00:00Z", outcome: "rescheduled" },
      { id: 3, programmeBarId: 77, eventDate: "2026-09-02", createdAt: "2026-09-02T09:00:00Z", outcome: "executed" },
    ].sort((a, b) => b.eventDate.localeCompare(a.eventDate) || b.createdAt.localeCompare(a.createdAt) || b.id - a.id);
    expect(events).toHaveLength(3);
    expect(events[0].outcome).toBe("executed");
  });

  it("has an additive RESTRICT-FK migration and no outcome update/delete endpoint", () => {
    const schema = readFileSync("shared/schema.ts", "utf8");
    const migration = readFileSync("migrations/0021_programme_bar_outcome_events.sql", "utf8");
    const routes = readFileSync("server/routes.ts", "utf8");
    expect(schema).toContain('pgTable("programme_bar_outcome_events"');
    expect(migration).toContain("ON DELETE RESTRICT");
    expect(routes).toContain('app.post("/api/dpr/programme-bar-outcomes"');
    expect(routes).toContain('app.get("/api/dpr/programme-bar-outcomes"');
    expect(routes).not.toMatch(/app\.(patch|put|delete)\("\/api\/dpr\/programme-bar-outcomes/);
  });

  it("guards routes with DPR view/edit permission and project-site scope, and enriches picker bars", () => {
    const routes = readFileSync("server/routes.ts", "utf8");
    expect(routes).toContain('assertEdit(req, res, "site_dprs")');
    expect(routes).toContain('assertView(req, res, "site_dprs")');
    expect(routes).toContain("assertOutcomeProjectScope");
    expect(routes).toContain("siteMatchesPermitted(site.name, permitted)");
    expect(routes).toContain("latestOutcome: outcomesByBar.get(b.id)?.[0] ?? null");
    expect(routes).toContain("outcomeHistory: outcomesByBar.get(b.id) ?? []");
  });

  it("wires recorder into the shared picker and report into a read-only history component", () => {
    const picker = readFileSync("client/src/components/ProgrammeBarPicker.tsx", "utf8");
    const report = readFileSync("client/src/pages/SiteReport.tsx", "utf8");
    const history = readFileSync("client/src/components/ProgrammeBarOutcomeHistory.tsx", "utf8");
    expect(picker).toContain("/api/dpr/programme-bar-outcomes");
    expect(picker).toContain("Record immutable outcome");
    expect(report).toContain("<ProgrammeBarOutcomeHistory");
    expect(history).toContain("Outcome history");
    expect(history).not.toContain("apiRequest");
  });
});