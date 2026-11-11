// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { DprDraftSubmitDialog, draftReviewSummary } from "./DprDraftSubmitDialog";

const locationState = vi.hoisted(() => ({ setLocation: vi.fn() }));
vi.mock("wouter", () => ({ useLocation: () => ["/", locationState.setLocation] }));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const overlap = {
  section: "activities" as const,
  label: "WET MIX MACADAM",
  rowKey: 0,
  message: "Possible chainage overlap requires a reason before submission.",
  overlaps: [{
    kind: "partial" as const, source: "prior_dpr" as const,
    segmentFromKm: 0.38, segmentToKm: 0.4, withDprId: 402, withDprDate: "2026-09-28",
    withEntryId: 17, withRowKey: null, withSide: "Full Width", withFromKm: 0.38, withToKm: 0.7,
    withQuantity: 180, withUom: "CUM",
  }],
};

function draftSnapshot(overlapIssue = false) {
  const blockers = overlapIssue ? [overlap] : [];
  return {
    dpr: {
      id: 405, date: "2026-09-29", dprStatus: "draft",
      progress: [{ activity: "WET MIX MACADAM", chainageFrom: "0+280", chainageTo: "0+400", quantity: 67.5, uom: "CUM" }],
      equipment: [{ machine: "ROLLER", diesel: 12 }],
      labour: [{ category: "Unskilled", count: 4 }],
    },
    sectionTokens: { activity: "activity-token" },
    headerToken: "header-token",
    draftReadiness: { state: overlapIssue ? "blocked" : "ready", mandatory: blockers, advisories: [] },
    chainageOverlapIssues: blockers,
  };
}

describe("draft submit review sheet", () => {
  beforeEach(() => {
    locationState.setLocation.mockClear();
  });

  it("reviews saved data and submits without saving any section again", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => draftSnapshot() })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 405, dprStatus: "submitted" }) });
    vi.stubGlobal("fetch", fetchMock);
    render(<DprDraftSubmitDialog dprId={405} returnTo="/site/dashboard" />);

    fireEvent.click(screen.getByRole("button", { name: "Submit" }));
    expect(await screen.findByText(/WET MIX MACADAM · 0\+280 → 0\+400 · 67.5 CUM/)).toBeTruthy();
    const reviewText = screen.getByTestId("draft-submit-review-405").textContent ?? "";
    expect(reviewText).toContain("Equipment count: 1");
    expect(reviewText).toContain("Labour count: 4");
    expect(reviewText).toContain("Diesel: 12 L");
    fireEvent.click(screen.getByRole("button", { name: "Submit DPR" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock.mock.calls[1][0]).toBe("/api/dpr-sections/405/submit");
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toMatchObject({
      sectionTokens: { activity: "activity-token" }, headerToken: "header-token",
    });
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/api/dpr-sections/activity"))).toBe(false);
    await waitFor(() => expect(locationState.setLocation).toHaveBeenCalledWith("/site/dashboard?focusDpr=405"));
  });

  it("shows the same prior-DPR overlap and routes correction to the matching activity", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true, json: async () => draftSnapshot(true),
    }));
    render(<DprDraftSubmitDialog dprId={405} />);
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));

    expect(await screen.findByText(/is also in DPR #402/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Submit DPR" }).hasAttribute("disabled")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Correct chainage" }));
    expect(locationState.setLocation).toHaveBeenCalledWith(expect.stringContaining("/site/edit/405?"));
    expect(locationState.setLocation.mock.calls[0][0]).toContain("issueRow=0");
    expect(locationState.setLocation.mock.calls[0][0]).toContain("issueAction=chainage");
  });

  it("summarizes the saved date, activity, equipment, labour, and diesel", () => {
    expect(draftReviewSummary(draftSnapshot().dpr)).toEqual({
      date: "2026-09-29",
      activities: [{ label: "WET MIX MACADAM", from: "0+280", to: "0+400", quantity: "67.5 CUM" }],
      equipmentCount: 1, labourCount: 4, dieselLitres: 12,
    });
  });
});
