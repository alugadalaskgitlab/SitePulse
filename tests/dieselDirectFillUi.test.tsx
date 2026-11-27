// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DieselDirectFillReview, directFillStatus } from "../client/src/components/DieselDirectFillReview";
import type { DieselDirectFillView } from "../shared/schema";

const mocks = vi.hoisted(() => ({ request: vi.fn().mockResolvedValue({}), toast: vi.fn() }));
vi.mock("../client/src/lib/queryClient", () => ({ apiRequest: mocks.request }));
vi.mock("../client/src/hooks/use-toast", () => ({ useToast: () => ({ toast: mocks.toast }) }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
const fill: DieselDirectFillView = {
  requirementId: 1, itemId: 11, equipmentId: 21, equipmentName: "Vehicle A",
  requirementDate: "2026-03-31", date: "2026-11-27", quantity: 60, appliedQuantity: 0,
  conflicts: [{ usageId: 3, quantity: 60, source: "plant_stock", signature: "fixture-signature" }],
};
function show(fills: DieselDirectFillView[], editable = true) {
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <DieselDirectFillReview fills={fills} editable={editable} fromUsage />
  </QueryClientProvider>);
}
describe("direct-fill status and explicit choices", () => {
  it("shows pending choice without sending any request", () => {
    show([fill]);
    expect(screen.getByText(/Needs your choice/)).toBeTruthy();
    expect(screen.getByText(/already has 60 L entered on 2026-11-27 \(store stock\)/)).toBeTruthy();
    expect(mocks.request).not.toHaveBeenCalled();
  });
  it.each([
    ["Same diesel — keep the purchase fill", "keep_purchase"],
    ["Same diesel — keep the usage entry", "keep_usage"],
    ["Different fills — keep both", "different"],
  ])("sends only the selected decision: %s", async (label, choice) => {
    show([fill]);
    fireEvent.click(screen.getByRole("button", { name: label }));
    await waitFor(() => expect(mocks.request).toHaveBeenCalledWith("POST", "/api/diesel-requirements/1/direct-fill-choice", {
      itemId: 11, usageId: 3, signature: "fixture-signature", choice, fromUsage: true,
    }));
  });
  it("shows applied litres as read-only and no unresolved choices", () => {
    show([{ ...fill, appliedQuantity: 60, conflicts: [] }]);
    expect(screen.getByText(/Filled directly: 60 L \(diesel purchase DSL-REQ\/25-26\/0001\)/)).toBeTruthy();
    expect(screen.queryAllByRole("textbox")).toHaveLength(0);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });
  it("keeps register review read-only and labels usage-retained diesel", () => {
    show([fill], false);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(directFillStatus([{ ...fill, conflicts: [{ ...fill.conflicts[0], choice: "keep_usage" }] }])).toBe("Issued through vehicle entry");
    expect(directFillStatus([{ ...fill, conflicts: [{ ...fill.conflicts[0], choice: "different" }] }])).toBe("Filled directly — received and issued");
  });
  it("uses the requirement date, not the fill date, for pending-choice numbers", () => {
    show([fill]);
    expect(screen.getByText(/diesel purchase DSL-REQ\/25-26\/0001/)).toBeTruthy();
    expect(screen.getByText(/Needs your choice/)).toBeTruthy();
    expect(screen.queryByText(/DSL-REQ\/26-27/)).toBeNull();
  });
});
