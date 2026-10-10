// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { DprCorrectionDialog } from "./DprCorrectionDialog";
import { DprCorrectionHistory } from "./DprCorrectionHistory";
import type { DprCorrectionRequest, DprCorrectionReview } from "@/lib/dprCorrections";

afterEach(cleanup);
const review: DprCorrectionReview = {
  baseHash: "fact-7", revision: 7, blocked: [], requiresApproval: false,
  impact: ["Equipment log identity and the original canonical usage reference are retained."],
  changes: [{ section: "progress", rowId: 28, field: "chainageTo", oldValue: "2+275", newValue: "2+248", requiresApproval: false }],
};
const props = { open: true, dprId: 427, review, loading: false, saving: false, onClose: vi.fn(), onRetry: vi.fn(), onSubmit: vi.fn() };

describe("DPR correction review dialog", () => {
  it("shows exact old/new facts and requires a reason and explicit consequence confirmation", () => {
    const onSubmit = vi.fn();
    render(<DprCorrectionDialog {...props} onSubmit={onSubmit} />);
    expect(screen.getByText("2+275")).toBeTruthy();
    expect(screen.getByText("2+248")).toBeTruthy();
    expect(screen.getByText("Permitted immediately")).toBeTruthy();
    const submit = screen.getByRole("button", { name: "Confirm & save correction" }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Correction reason (required)"), { target: { value: "Site register rechecked" } });
    expect(submit.disabled).toBe(true);
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(submit);
    expect(onSubmit).toHaveBeenCalledWith("Site register rechecked");
  });
  it("makes commercially significant changes approval-only and distinguishes null from zero", () => {
    render(<DprCorrectionDialog {...props} review={{ ...review, requiresApproval: true, changes: [
      { section: "equipment", rowId: 741, field: "openingDiesel", oldValue: null, newValue: 0, requiresApproval: true },
      { section: "equipment", rowId: 741, field: "startTime", oldValue: null, newValue: "07:35", requiresApproval: true },
    ], impact: ["Paid vendor bill is retained. Financial adjustment requires separate review."] }} />);
    expect(screen.getAllByText("Not recorded")).toHaveLength(2);
    expect(screen.getByText("0")).toBeTruthy();
    expect(screen.getByText("07:35")).toBeTruthy();
    expect(screen.getAllByText("Requires approval")).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Submit for approval" })).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain("recorded DPR remains unchanged");
  });
  it("shows the server's exact integrity restriction and cannot save a blocked row removal", () => {
    render(<DprCorrectionDialog {...props} review={{ ...review, blocked: [{ section: "equipment", rowId: 741, field: "row", message: "Equipment row #741 is referenced by paid bill #48; row deletion is blocked." }] }} />);
    expect(screen.getByRole("alert").textContent).toContain("paid bill #48");
    fireEvent.change(screen.getByLabelText("Correction reason (required)"), { target: { value: "Fix register" } });
    fireEvent.click(screen.getByRole("checkbox"));
    expect((screen.getByRole("button", { name: "Confirm & save correction" }) as HTMLButtonElement).disabled).toBe(true);
  });
  it("retains the entered reason on failed preview/save and requires a fresh explicit confirmation after retry", () => {
    const onRetry = vi.fn();
    const { rerender } = render(<DprCorrectionDialog {...props} onRetry={onRetry} />);
    fireEvent.change(screen.getByLabelText("Correction reason (required)"), { target: { value: "Register checked" } });
    fireEvent.click(screen.getByRole("checkbox"));
    rerender(<DprCorrectionDialog {...props} error="DPR changed since review" onRetry={onRetry} />);
    expect((screen.getByLabelText("Correction reason (required)") as HTMLTextAreaElement).value).toBe("Register checked");
    expect(screen.getByRole("alert").textContent).toContain("entries have been retained");
    fireEvent.click(screen.getByRole("button", { name: "Review again" }));
    expect(onRetry).toHaveBeenCalledOnce();
    expect(screen.getByRole("checkbox").getAttribute("data-state")).toBe("unchecked");
  });
});

const request: DprCorrectionRequest = {
  id: 83, requestedBy: 17, requestedByName: "Kiran Rao", status: "pending",
  requestReason: "Timings entered from contemporaneous site register",
  changes: review.changes, impact: review.impact, createdAt: "2026-08-29T09:25:00Z",
};
const historyProps = { requests: [request], loading: false, isAdmin: true, userId: 29, busy: false, onRetry: vi.fn(), onDecide: vi.fn().mockResolvedValue({}) };
describe("Administrator correction decisions", () => {
  it("prevents self-approval and exposes awaiting-approval history", () => {
    render(<DprCorrectionHistory {...historyProps} userId={17} />);
    expect(screen.getByText("Awaiting approval")).toBeTruthy();
    expect(screen.getByText(/self-approval is not permitted/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Approve correction" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Deny correction" })).toBeNull();
  });
  it.each([true, false])("requires reason and confirmation for administrator decision approve=%s", async (approve) => {
    const onDecide = vi.fn().mockResolvedValue({});
    render(<DprCorrectionHistory {...historyProps} onDecide={onDecide} />);
    const action = screen.getByRole("button", { name: approve ? "Approve correction" : "Deny correction" }) as HTMLButtonElement;
    expect(action.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Administrator decision reason (required)"), { target: { value: "Register and impact checked" } });
    expect(action.disabled).toBe(true);
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(action);
    await waitFor(() => expect(onDecide).toHaveBeenCalledWith(83, approve, "Register and impact checked"));
  });
  it("keeps the decision reason available when an unauthorized or stale review fails", async () => {
    render(<DprCorrectionHistory {...historyProps} onDecide={vi.fn().mockRejectedValue(new Error('409: {"message":"Correction is no longer pending"}'))} />);
    fireEvent.change(screen.getByLabelText("Administrator decision reason (required)"), { target: { value: "Register checked" } });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Approve correction" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("no longer pending"));
    expect((screen.getByLabelText("Administrator decision reason (required)") as HTMLTextAreaElement).value).toBe("Register checked");
  });
});
