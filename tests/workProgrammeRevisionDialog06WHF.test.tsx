// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { ScheduleRevisionActions } from "@/pages/WorkProgramme";
import { apiRequest, queryClient } from "@/lib/queryClient";

vi.mock("@/lib/queryClient", () => ({
  apiRequest: vi.fn(),
  queryClient: { invalidateQueries: vi.fn() },
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

const BAR = {
  id: 77,
  startDate: "2026-08-01",
  endDate: "2026-08-10",
  executionState: "not_started",
  revisionHistory: [
    {
      revisionId: "r1",
      type: "schedule_revision",
      originalStartDate: "2026-07-25",
      originalEndDate: "2026-08-05",
      revisedStartDate: "2026-08-01",
      revisedEndDate: "2026-08-10",
      reason: "Access handover delayed",
      actorName: "Planner",
      createdAt: "2026-08-01T08:00:00.000Z",
      delta: 6,
    },
  ],
} as any;

const PREVIEW = {
  previewToken: "preview-token",
  source: {
    before: { startDate: "2026-08-01", endDate: "2026-08-10" },
    after: { startDate: "2026-08-03", endDate: "2026-08-12" },
    executionState: "not_started",
  },
  deltaDays: 2,
  cascade: true,
  shifted: [
    {
      before: { barId: 88, reachLabel: "Next stretch", startDate: "2026-08-10" },
      after: { barId: 88, reachLabel: "Next stretch", startDate: "2026-08-12" },
    },
  ],
  notShifted: [],
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function TransientTriggerHarness({ action }: { action: "revise" | "history" }) {
  const [requestedAction, setRequestedAction] = useState<"revise" | "history" | null>(null);
  const [triggerMounted, setTriggerMounted] = useState(true);
  return (
    <>
      {triggerMounted && (
        <button
          type="button"
          data-testid="transient-menu-trigger"
          onClick={() => {
            setRequestedAction(action);
            setTriggerMounted(false);
          }}
        >
          {action === "revise" ? "Revise Schedule" : "Schedule History"}
        </button>
      )}
      <ScheduleRevisionActions
        bar={BAR}
        projectId={5}
        variant="dialog-only"
        requestedAction={requestedAction}
        onRequestedActionHandled={() => setRequestedAction(null)}
      />
    </>
  );
}

function enterRevisionInputs() {
  fireEvent.change(screen.getByTestId("input-revision-start-77"), {
    target: { value: "2026-08-03" },
  });
  fireEvent.change(screen.getByTestId("input-revision-finish-77"), {
    target: { value: "2026-08-12" },
  });
  fireEvent.change(screen.getByTestId("input-revision-reason-77"), {
    target: { value: "Access handover delayed" },
  });
}

describe("06W-HF rendered schedule revision flow", () => {
  it("keeps the revision dialog mounted after the transient menu trigger unmounts; Preview, Back and Cancel work", async () => {
    vi.mocked(apiRequest).mockResolvedValueOnce({
      json: async () => PREVIEW,
    } as any);
    render(<TransientTriggerHarness action="revise" />);

    fireEvent.click(screen.getByTestId("transient-menu-trigger"));

    expect(screen.queryByTestId("transient-menu-trigger")).toBeNull();
    expect(await screen.findByTestId("dialog-revise-schedule-77")).toBeTruthy();
    expect(screen.getByTestId("checkbox-revision-cascade-77")).toHaveProperty("checked", true);

    enterRevisionInputs();
    fireEvent.click(screen.getByText("Preview revision"));

    expect(await screen.findByText("Successors shifted (1)")).toBeTruthy();
    expect(screen.getByTestId("dialog-revise-schedule-77")).toBeTruthy();
    fireEvent.click(screen.getByText("Back"));
    expect(await screen.findByText("Preview revision")).toBeTruthy();

    fireEvent.click(screen.getByText("Cancel"));
    await waitFor(() => expect(screen.queryByTestId("dialog-revise-schedule-77")).toBeNull());
  });

  it("keeps preview open and Confirm & commit uses the existing endpoints", async () => {
    vi.mocked(apiRequest)
      .mockResolvedValueOnce({ json: async () => PREVIEW } as any)
      .mockResolvedValueOnce({ json: async () => ({ ok: true }) } as any);
    render(<TransientTriggerHarness action="revise" />);

    fireEvent.click(screen.getByTestId("transient-menu-trigger"));
    await screen.findByTestId("dialog-revise-schedule-77");
    enterRevisionInputs();
    fireEvent.click(screen.getByText("Preview revision"));
    await screen.findByText("Confirm & commit");
    fireEvent.click(screen.getByText("Confirm & commit"));

    await waitFor(() => expect(screen.queryByTestId("dialog-revise-schedule-77")).toBeNull());
    expect(apiRequest).toHaveBeenNthCalledWith(
      1,
      "POST",
      "/api/boq/programme/bars/77/revision-preview",
      expect.objectContaining({ reason: "Access handover delayed", cascade: true }),
    );
    expect(apiRequest).toHaveBeenNthCalledWith(
      2,
      "POST",
      "/api/boq/programme/bars/77/revise-schedule",
      expect.objectContaining({ previewToken: "preview-token" }),
    );
    expect(queryClient.invalidateQueries).toHaveBeenCalled();
  });

  it("keeps Schedule History mounted after the transient menu trigger unmounts", async () => {
    render(<TransientTriggerHarness action="history" />);

    fireEvent.click(screen.getByTestId("transient-menu-trigger"));

    expect(screen.queryByTestId("transient-menu-trigger")).toBeNull();
    expect(await screen.findByTestId("dialog-schedule-history-77")).toBeTruthy();
    expect(screen.getByText("Access handover delayed")).toBeTruthy();
  });

  it("keeps the inline structure/location action behavior unchanged", async () => {
    render(<ScheduleRevisionActions bar={BAR} projectId={5} />);

    fireEvent.click(screen.getByText("Revise"));

    expect(await screen.findByTestId("dialog-revise-schedule-77")).toBeTruthy();
  });
});

// ─── Revision panel context header (read-only "Revising" section) ────────────

const CONTEXT_BAR = {
  ...BAR,
  itemCode: "C&G",
  description: "Clearing and grubbing road land including uprooting",
  reachLabel: "Reach 3",
  chainageFrom: 2.5,
  chainageTo: 3.8,
  side: "both_sides",
  plannedQty: 1.3,
  unit: "Ha",
  startDate: "2026-05-26",
  endDate: "2026-05-31",
} as any;

describe("revision context header", () => {
  it("F: shows item, reach, chainage, side, qty + UoM, current schedule, duration and status", async () => {
    render(<ScheduleRevisionActions bar={CONTEXT_BAR} projectId={5} />);
    fireEvent.click(screen.getByText("Revise"));
    const context = await screen.findByTestId("revision-context-77");
    const text = context.textContent ?? "";
    expect(text).toContain("Revising:");
    expect(text).toMatch(/Clearing and grubbing/i);
    expect(text).toContain("Reach 3");
    expect(text).toContain("Ch 2.5 → 3.8");
    expect(text).toContain("Both Sides");
    expect(text).toContain("1.3 Ha");
    expect(text).toContain("26/05/2026 → 31/05/2026");
    expect(text).toContain("6 days");
    expect(text).toContain("Status: Not Started");
  });

  it("F: shows revised duration and the +/- day change once a new finish is entered", async () => {
    render(<ScheduleRevisionActions bar={CONTEXT_BAR} projectId={5} />);
    fireEvent.click(screen.getByText("Revise"));
    await screen.findByTestId("dialog-revise-schedule-77");
    // Initial dates mirror the current schedule → no change.
    expect(screen.getByTestId("revision-duration-77").textContent).toContain("Revised duration: 6 days");
    expect(screen.getByTestId("revision-duration-77").textContent).toContain("no change");
    fireEvent.change(screen.getByTestId("input-revision-finish-77"), {
      target: { value: "2026-06-02" },
    });
    const line = screen.getByTestId("revision-duration-77").textContent ?? "";
    expect(line).toContain("Revised duration: 8 days");
    expect(line).toContain("+2 days vs current");
  });

  it("E: a started bar locks actual start, shows it separately when it differs, and revises only the finish", async () => {
    const startedBar = {
      ...CONTEXT_BAR,
      executionState: "started",
      actualStartDate: "2026-05-28",
    } as any;
    render(<ScheduleRevisionActions bar={startedBar} projectId={5} />);
    fireEvent.click(screen.getByText("Revise"));
    await screen.findByTestId("dialog-revise-schedule-77");
    const context = screen.getByTestId("revision-context-77").textContent ?? "";
    expect(context).toContain("Status: In Progress");
    // Programme start (26/05) differs from actual start (28/05) → shown separately.
    expect(context).toContain("Current: 26/05/2026 → 31/05/2026");
    expect(context).toContain("Actual start: 28/05/2026 (locked)");
    const startInput = screen.getByTestId("input-revision-start-77") as HTMLInputElement;
    expect(startInput.disabled).toBe(true);
    expect(startInput.value).toBe("2026-05-28");
    // Finish stays editable.
    const finishInput = screen.getByTestId("input-revision-finish-77") as HTMLInputElement;
    expect(finishInput.disabled).toBe(false);
  });

  it("E: a started bar with actual start equal to programme start does not repeat it", async () => {
    const startedBar = {
      ...CONTEXT_BAR,
      executionState: "started",
      actualStartDate: "2026-05-26",
    } as any;
    render(<ScheduleRevisionActions bar={startedBar} projectId={5} />);
    fireEvent.click(screen.getByText("Revise"));
    await screen.findByTestId("dialog-revise-schedule-77");
    const context = screen.getByTestId("revision-context-77").textContent ?? "";
    expect(context).not.toContain("Actual start:");
  });
});