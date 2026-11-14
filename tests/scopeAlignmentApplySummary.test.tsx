// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ScopeAlignmentApplySummary } from "../client/src/components/ScopeAlignmentApplySummary";

describe("scope alignment result summary", () => {
  it("splits update and outside-scope notices and opens the review", () => {
    const onReview = vi.fn();
    render(<ScopeAlignmentApplySummary
      updateCount={2}
      outsideRows={[{ rowKey: "bar-9", barLabel: "Bar 9", itemCode: "2.1", itemName: "WMM" }]}
      onReview={onReview}
    />);
    expect(screen.getByText("2 bars to update")).toBeTruthy();
    expect(screen.getByText("1 bars are outside the scope — remove them in the programme")).toBeTruthy();
    expect(screen.getByText("Bar 9 · [2.1] WMM")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Review and update bars" }));
    expect(onReview).toHaveBeenCalledOnce();
  });

  it("shows each failed row after Apply and hides empty notices", () => {
    const { rerender } = render(<ScopeAlignmentApplySummary updateCount={0} outsideRows={[]} onReview={vi.fn()} />);
    expect(screen.queryByTestId("scope-alignment-summary")).toBeNull();
    rerender(<ScopeAlignmentApplySummary
      updateCount={0}
      outsideRows={[]}
      result={{
        updatedCount: 2,
        notUpdated: [{ barId: 954, itemName: "Sand filling", reason: "No row was returned." }],
      }}
      onReview={vi.fn()}
    />);
    expect(screen.getByTestId("scope-alignment-result").textContent).toContain("2 bars updated");
    expect(screen.getByTestId("scope-alignment-result").textContent).toContain("#954 · Sand filling — No row was returned.");
  });
});
