import { afterEach, describe, expect, it, vi } from "vitest";
import {
  approveExecutionArrangement,
  canShowExecutionArrangementApprove,
} from "../client/src/lib/executionArrangementApproval";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("06Z-HF5 execution arrangement approval", () => {
  it("shows approval for an authorised submitted arrangement regardless of type", () => {
    expect(canShowExecutionArrangementApprove("submitted", true)).toBe(true);
    // The helper deliberately accepts no arrangement type: reused-excavated
    // and every other execution arrangement use the same lifecycle.
  });

  it("does not show approval to an unauthorised user", () => {
    expect(canShowExecutionArrangementApprove("submitted", false)).toBe(false);
  });

  it("does not alter actions for non-submitted arrangements", () => {
    for (const status of ["draft", "approved", "mobilisation_pending", "in_progress", "on_hold", "completed", "cancelled"]) {
      expect(canShowExecutionArrangementApprove(status, true)).toBe(false);
    }
  });

  it("approves through the canonical arrangement PATCH workflow", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 17, arrangementType: "reused_excavated", status: "approved" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(approveExecutionArrangement(17, "2026-08-20")).resolves.toMatchObject({
      id: 17,
      arrangementType: "reused_excavated",
      status: "approved",
    });
    expect(fetchMock).toHaveBeenCalledWith("/api/earthwork-arrangements/17", {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "approved", effectiveFrom: "2026-08-20" }),
    });
  });

  it("surfaces canonical endpoint authorization failures", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({ error: "Forbidden" }),
    }));

    await expect(approveExecutionArrangement(17, "2026-08-20")).rejects.toThrow("Forbidden");
  });
});