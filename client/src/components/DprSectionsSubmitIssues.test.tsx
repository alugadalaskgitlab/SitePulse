// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { DprSectionsSubmitIssues, describeSubmitOverlap, type DprSubmitIssue } from "./DprSectionsSubmitIssues";

afterEach(cleanup);

const issue: DprSubmitIssue = {
  section: "activities", rowKey: 0, label: "WET MIX MACADAM",
  message: "Possible chainage overlap requires a reason before submission.",
  overlaps: [{
    kind: "partial", source: "prior_dpr", segmentFromKm: 0.38, segmentToKm: 0.4,
    withDprId: 402, withDprDate: "2026-09-28", withEntryId: 17, withRowKey: null,
    withSide: "Full Width", withFromKm: 0.38, withToKm: 0.7, withQuantity: 180, withUom: "CUM",
  }],
};

describe("section-submit overlap guidance", () => {
  it("describes the conflict in plain language with the overlap length and prior DPR", () => {
    expect(describeSubmitOverlap(issue, issue.overlaps![0])).toBe(
      "WET MIX MACADAM 0+380–0+400 (20 m) is also in DPR #402 (28 Sep). Correct the chainage or give a reason.",
    );
  });
  it("offers chainage correction and reason actions for each conflict", () => {
    const onAction = vi.fn();
    render(<DprSectionsSubmitIssues issues={[issue]} onAction={onAction} />);
    fireEvent.click(screen.getByRole("button", { name: "Correct chainage" }));
    expect(onAction).toHaveBeenCalledWith(issue, "chainage");
    fireEvent.click(screen.getByRole("button", { name: "Give reason" }));
    expect(onAction).toHaveBeenLastCalledWith(issue, "reason");
    expect(screen.getByRole("alert").textContent).toContain("DPR #402 (28 Sep)");
  });
});
