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
const row: TankAssignmentPosition = { materialId: 41, materialName: "LDO", partyId: 7, partyName: "Fixture party", stockUom: "Liters",
  tank1: -6988.401, tank2: 0, unassigned: 6988.401, total: 0, packed: 0, packedCount: 0 };
function show(value = row) { return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}><TankAssignmentButton row={value} /></QueryClientProvider>); }
function open() { fireEvent.click(screen.getByRole("button", { name: "Correct tank stock" })); }
afterEach(() => { cleanup(); fx.owner = true; vi.resetAllMocks(); });
describe("TANK-01 Owner tank correction", () => {
  it("hides from non-Owners but allows correction when unassigned is zero", () => {
    fx.owner = false; show(); expect(screen.queryByRole("button", { name: "Correct tank stock" })).toBeNull();
    cleanup(); fx.owner = true; show({ ...row, tank1: 0, unassigned: 0 }); expect(screen.getByRole("button", { name: "Correct tank stock" })).toBeTruthy();
  });
  it("previews LDO, party, immutable barrels and not-in-a-tank zero without making requests", () => {
    show(); open(); expect(screen.getByText("Fixture party · LDO")).toBeTruthy();
    expect(screen.getByText("Barrels (0, read-only)")).toBeTruthy();
    const preview = within(screen.getByTestId("tank-assignment-preview"));
    expect(preview.getByText("-6,988.401 → 0")).toBeTruthy(); expect(preview.getByText("6,988.401 → 0")).toBeTruthy();
    expect(screen.getByText("Actual in Tank 1 (L)")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" })); expect(fx.request).not.toHaveBeenCalled();
  });
  it("sends chosen tank amounts, date and the complete before snapshot", async () => {
    fx.request.mockResolvedValue({}); show({ ...row, tank1: 10, unassigned: 0, total: 10 }); open();
    fireEvent.change(screen.getByLabelText("Actual in Tank 1"), { target: { value: "4" } });
    fireEvent.change(screen.getByLabelText("Actual in Tank 2"), { target: { value: "6" } });
    fireEvent.change(screen.getByLabelText("Assignment date"), { target: { value: "2026-11-26" } });
    fireEvent.click(screen.getByRole("button", { name: "Save", exact: true }));
    await waitFor(() => expect(fx.request).toHaveBeenCalledWith("POST", "/api/plant-module/tank-assignments", {
      materialId: 41, partyId: 7, date: "2026-11-26", uom: "Liters", actualTank1: 4, actualTank2: 6,
      preview: { tank1: 10, tank2: 0, packed: 0, packedCount: 0, unassigned: 0, total: 10 },
    }));
  });
  it("blocks a short total and explains that physical correction is separate", () => {
    show({ ...row, materialName: "BITUMEN", stockUom: "MT", tank1: 1, tank2: 0, unassigned: 0, total: 1 }); open();
    fireEvent.change(screen.getByLabelText("Actual in Tank 1"), { target: { value: "0.525" } });
    expect(screen.getByRole("alert").textContent).toBe("0.475 MT short — record a physical stock correction for that separately.");
    expect((screen.getByRole("button", { name: "Save", exact: true }) as HTMLButtonElement).disabled).toBe(true);
    expect(fx.request).not.toHaveBeenCalled();
  });
  it("shows a plain stale conflict and requires a new review", async () => {
    fx.request.mockRejectedValue(new Error('409: {"message":"Stock figures changed since preview — open the review again."}'));
    show(); open(); fireEvent.click(screen.getByRole("button", { name: "Save", exact: true }));
    expect((await screen.findByRole("alert")).textContent).toBe("Stock figures changed since preview — open the review again.");
    expect((screen.getByRole("button", { name: "Save", exact: true }) as HTMLButtonElement).disabled).toBe(true);
  });
  it("displays bitumen kilograms in MT without changing stored units", () => {
    show({ ...row, materialName: "BITUMEN VG-30", stockUom: "Kg" }); open();
    expect(screen.getByText("Actual in Tank 1 (MT)")).toBeTruthy();
    expect(within(screen.getByTestId("tank-assignment-preview")).getByText("-6.988401 → 0")).toBeTruthy();
  });
});
