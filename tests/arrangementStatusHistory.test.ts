import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  appendArrangementStatusChange,
  hasRecordedArrangementStatusChange,
  isValidArrangementEffectiveDate,
  latestRecordedArrangementStatusChange,
  arrangementStatusAsOf,
  cancelledEffectiveFromAsOf,
  isArrangementOperationalAsOf,
} from "../shared/arrangementStatusHistory";

describe("execution arrangement status history foundation", () => {
  it("appends a typed cancellation event without rewriting prior history", () => {
    const prior = [{ type: "material", outcome: "approved", marker: "keep" }];
    const next = appendArrangementStatusChange(prior, {
      previousStatus: "in_progress",
      status: "cancelled",
      effectiveFrom: "2026-08-20",
      recordedAt: "2026-09-06T10:00:00.000Z",
      changedBy: 42,
      reason: "Vendor arrangement cancelled",
    });

    expect(next).toEqual([
      prior[0],
      {
        eventType: "status_change",
        previousStatus: "in_progress",
        status: "cancelled",
        effectiveFrom: "2026-08-20",
        recordedAt: "2026-09-06T10:00:00.000Z",
        changedBy: 42,
        reason: "Vendor arrangement cancelled",
      },
    ]);
    expect(prior).toEqual([{ type: "material", outcome: "approved", marker: "keep" }]);
  });

  it("rejects missing or impossible effective dates", () => {
    expect(isValidArrangementEffectiveDate("2026-08-20")).toBe(true);
    expect(isValidArrangementEffectiveDate("2026-02-30")).toBe(false);
    expect(() => appendArrangementStatusChange([], {
      previousStatus: "approved",
      status: "on_hold",
      effectiveFrom: "20/08/2026",
      recordedAt: "2026-09-06T10:00:00.000Z",
      changedBy: 42,
      reason: null,
    })).toThrow("INVALID_ARRANGEMENT_STATUS_EFFECTIVE_DATE");
  });

  it("marks legacy confirmation complete after the first dated cancellation event", () => {
    expect(hasRecordedArrangementStatusChange([], "cancelled")).toBe(false);
    const confirmed = appendArrangementStatusChange([], {
      previousStatus: "cancelled",
      status: "cancelled",
      effectiveFrom: "2026-08-20",
      recordedAt: "2026-09-06T10:00:00.000Z",
      changedBy: 42,
      reason: "Confirmed from vendor cancellation letter",
    });
    expect(hasRecordedArrangementStatusChange(confirmed, "cancelled")).toBe(true);
    expect(hasRecordedArrangementStatusChange(confirmed, "approved")).toBe(false);
    expect(latestRecordedArrangementStatusChange(confirmed, "cancelled")?.effectiveFrom).toBe("2026-08-20");
  });

  it("resolves the cancellation boundary by effective date, not mutable status", () => {
    const arrangement = {
      status: "cancelled",
      revisionHistory: [{
        eventType: "status_change",
        previousStatus: "in_progress",
        status: "cancelled",
        effectiveFrom: "2026-08-20",
        recordedAt: "2026-09-06T10:00:00.000Z",
        changedBy: 42,
        reason: null,
      }],
    };
    expect(arrangementStatusAsOf(arrangement, "2026-08-19")).toBe("in_progress");
    expect(arrangementStatusAsOf(arrangement, "2026-08-20")).toBe("cancelled");
    expect(arrangementStatusAsOf(arrangement, "2026-08-21")).toBe("cancelled");
    expect(isArrangementOperationalAsOf(arrangement, "2026-08-19", ["in_progress"])).toBe(true);
    expect(isArrangementOperationalAsOf(arrangement, "2026-08-20", ["in_progress"])).toBe(false);
    expect(cancelledEffectiveFromAsOf(arrangement, "2026-08-19")).toBeNull();
    expect(cancelledEffectiveFromAsOf(arrangement, "2026-08-20")).toBe("2026-08-20");
  });

  it("orders status events by effectiveFrom and supports a later reactivation", () => {
    const arrangement = {
      status: "in_progress",
      revisionHistory: [
        { eventType: "status_change", previousStatus: "cancelled", status: "in_progress", effectiveFrom: "2026-09-01", recordedAt: "2026-08-25" },
        { eventType: "status_change", previousStatus: "approved", status: "cancelled", effectiveFrom: "2026-08-20", recordedAt: "2026-08-26" },
      ],
    };
    expect(arrangementStatusAsOf(arrangement, "2026-08-19")).toBe("approved");
    expect(arrangementStatusAsOf(arrangement, "2026-08-20")).toBe("cancelled");
    expect(arrangementStatusAsOf(arrangement, "2026-09-01")).toBe("in_progress");
    expect(cancelledEffectiveFromAsOf(arrangement, "2026-09-01")).toBeNull();
  });

  it("keeps inactive persisted cut-fill IDs out of operational controls in every DPR flow", () => {
    for (const path of [
      "client/src/pages/GuidedDpr.tsx",
      "client/src/pages/SiteEntry.tsx",
      "client/src/pages/SiteEdit.tsx",
    ]) {
      const source = readFileSync(path, "utf8");
      expect(source).toMatch(/\.filter\(\(arrangement\) => isArrangementOperationalAsOf\(arrangement, [^)]+, APPLICABLE_ARRANGEMENT_STATUSES\)\)/);
      expect(source).toContain("const operationalCutFillArrangementId =");
      expect(source).toMatch(/arrangementId=\{operationalCutFillArrangementId\((?:e|entry)\.earthworkArrangementId\)\}/);
    }
  });

  it("enforces the foundation at the canonical lifecycle routes and legacy PM/Admin control", () => {
    const routes = readFileSync("server/routes.ts", "utf8");
    const patch = routes.slice(
      routes.indexOf('app.patch("/api/earthwork-arrangements/:id"'),
      routes.indexOf('app.delete("/api/earthwork-arrangements/:id"'),
    );
    const remove = routes.slice(
      routes.indexOf('app.delete("/api/earthwork-arrangements/:id"'),
      routes.indexOf("// ── Instruction 026 §4/§19"),
    );
    expect(patch).toContain("STATUS_EFFECTIVE_FROM_REQUIRED");
    expect(patch).toContain("confirmExistingStatus");
    expect(patch).toContain('current.status === "cancelled"');
    expect(patch).toContain("STATUS_CONFIRMATION_NOT_ALLOWED");
    expect(patch).toContain("currentStatusDateRecorded");
    expect(patch).toContain('hasRecordedArrangementStatusChange((row as any).revisionHistory, "cancelled")');
    expect(patch).toContain("assertOutcomeManagerAuthority");
    expect(patch).toContain("appendArrangementStatusChange");
    expect(remove).toContain("STATUS_EFFECTIVE_FROM_REQUIRED");
    expect(remove).toContain("appendArrangementStatusChange");
    expect(remove).toContain("ARRANGEMENT_ALREADY_CANCELLED");
    expect(remove).toContain('row.status === "rejected" || row.status === "completed"');

    const register = readFileSync("client/src/pages/ExecutionArrangements.tsx", "utf8");
    expect(register).toContain('data-testid="legacy-status-effective-date"');
    expect(register).toContain("confirmExistingStatus: true");
    expect(register).toContain('!hasRecordedArrangementStatusChange(a.revisionHistory, "cancelled")');
    expect(register).toContain("latestRecordedArrangementStatusChange(a.revisionHistory, a.status)");
    expect(register).toContain("from {r.lifecycleStatusEvent.effectiveFrom}");
    expect(register).toContain("Arrangement: {a.status.replace");
    expect(register).not.toContain('.filter(a => !["cancelled"].includes(a.status))');

    const lifecycleForm = readFileSync("client/src/components/EarthworkArrangementDialog.tsx", "utf8");
    const inProgressControls = lifecycleForm.slice(
      lifecycleForm.indexOf('{arr.status === "in_progress"'),
      lifecycleForm.indexOf('{arr.status === "on_hold"'),
    );
    const onHoldControls = lifecycleForm.slice(
      lifecycleForm.indexOf('{arr.status === "on_hold"'),
      lifecycleForm.indexOf("</div>", lifecycleForm.indexOf('{arr.status === "on_hold"')),
    );
    expect(inProgressControls).toContain('requestStatusChange("cancelled")');
    expect(onHoldControls).toContain('requestStatusChange("cancelled")');
  });
});