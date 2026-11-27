// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TankAssignmentButton } from "../client/src/components/TankAssignmentButton";
import type { TankAssignmentPosition } from "../shared/tankAssignment";

const fx = vi.hoisted(() => ({ owner: true, request: vi.fn(), invalidate: vi.fn() }));
vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ user: { isOwner: fx.owner } }) }));
vi.mock("@/lib/queryClient", () => ({ apiRequest: fx.request, queryClient: { invalidateQueries: fx.invalidate } }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
const row: TankAssignmentPosition = {
  materialId: 41, materialName: "LDO", partyId: 7, partyName: "Fixture party", stockUom: "Liters",
  tank1: -6988.401, tank2: 0, unassigned: 6988.401, total: 0,
};
function show(value = row) {
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}>
    <TankAssignmentButton row={value} />
  </QueryClientProvider>);
}
afterEach(() => { cleanup(); fx.owner = true; vi.resetAllMocks(); });
describe("FIX-BIT-01 explicit Owner review", () => {
  it("hides the action from non-Owners and on zero unassigned rows", () => {
    fx.owner = false; show();
    expect(screen.queryByRole("button", { name: "Move to tank" })).toBeNull();
    cleanup(); fx.owner = true; show({ ...row, unassigned: 0 });
    expect(screen.queryByRole("button", { name: "Move to tank" })).toBeNull();
  });
  it("previews the party/material, full amount and unchanged total before any request", () => {
    show(); fireEvent.click(screen.getByRole("button", { name: "Move to tank" }));
    expect(screen.getByText("Fixture party · LDO")).toBeTruthy();
    expect(screen.getByText("6,988.401 Liters")).toBeTruthy();
    expect((screen.getByLabelText("Tank") as HTMLSelectElement).value).toBe("1");
    expect((screen.getByLabelText("Assignment date") as HTMLInputElement).value).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const preview = screen.getByTestId("tank-assignment-preview");
    expect(within(preview).getByText("-6,988.401 → 0")).toBeTruthy();
    expect(within(preview).getByText("6,988.401 → 0")).toBeTruthy();
    expect(fx.request).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(fx.request).not.toHaveBeenCalled();
  });
  it("sends only the confirmed Tank 2 move and selected date", async () => {
    fx.request.mockResolvedValue({});
    show(); fireEvent.click(screen.getByRole("button", { name: "Move to tank" }));
    fireEvent.change(screen.getByLabelText("Tank"), { target: { value: "2" } });
    fireEvent.change(screen.getByLabelText("Assignment date"), { target: { value: "2026-11-26" } });
    expect(within(screen.getByTestId("tank-assignment-preview")).getByText("0 → 6,988.401")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(fx.request).toHaveBeenCalledWith("POST", "/api/plant-module/tank-assignments", {
      materialId: 41, partyId: 7, tankNumber: 2, date: "2026-11-26", amount: 6988.401, uom: "Liters",
    }));
  });
  it("shows a stale-preview refusal and requires reopening the review", async () => {
    fx.request.mockRejectedValue(new Error("Unassigned stock changed since preview — open the review again."));
    show(); fireEvent.click(screen.getByRole("button", { name: "Move to tank" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    expect(await screen.findByRole("alert")).toHaveProperty("textContent", "Unassigned stock changed since preview — open the review again.");
    expect((screen.getByRole("button", { name: "Confirm" }) as HTMLButtonElement).disabled).toBe(true);
  });
  it("previews bitumen in MT", () => {
    show({ ...row, materialName: "BITUMEN VG-30", stockUom: "MT", tank1: -6.988401, unassigned: 6.988401 });
    fireEvent.click(screen.getByRole("button", { name: "Move to tank" }));
    expect(screen.getByText("6.988401 MT")).toBeTruthy();
    expect(within(screen.getByTestId("tank-assignment-preview")).getByText("-6.988401 → 0")).toBeTruthy();
  });
});
