// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { getLdoVolumeAtDepth } from "@shared/ldo-dip-chart";

vi.mock("@tanstack/react-query", () => ({
  useQuery: (options: { queryKey?: unknown[] }) => ({
    data: options.queryKey?.[0] === "/api/personnel"
      ? [
          { id: 1, name: "Active Plant Staff", isActive: 1 },
          { id: 2, name: "Saved Inactive Staff", isActive: 0 },
          { id: 3, name: "Other Inactive Staff", isActive: 0 },
        ]
      : [],
    isLoading: false,
  }),
  useMutation: () => ({ isPending: false, mutate: vi.fn(), mutateAsync: vi.fn() }),
}));
vi.mock("@/lib/queryClient", () => ({
  apiRequest: vi.fn(),
  queryClient: { invalidateQueries: vi.fn() },
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/components/DryerSourceFixDialog", () => ({ default: () => null }));

import { HeatingSessionDialog } from "../client/src/components/HeatingSessionDialog";

describe("PLANT-04 heating session fuel readings", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("uses both tank dip pairs for session litres, while keeping the meter fallback available", () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      json: async () => [],
    }) as Response));
    render(<HeatingSessionDialog open date="2026-11-22" plantName="Main Plant" onOpenChange={vi.fn()} />);

    expect(screen.getByTestId("input-ldo-open")).toBeInTheDocument();
    expect(screen.getByTestId("input-ldo-close")).toBeInTheDocument();
    expect(screen.getByTestId("input-ldo-dip-t1-open")).toBeInTheDocument();
    expect(screen.getByTestId("input-ldo-dip-t1-close")).toBeInTheDocument();
    expect(screen.getByTestId("input-ldo-dip-t2-open")).toBeInTheDocument();
    expect(screen.getByTestId("input-ldo-dip-t2-close")).toBeInTheDocument();

    fireEvent.change(screen.getByTestId("input-start-time"), { target: { value: "09:00" } });
    fireEvent.change(screen.getByTestId("input-end-time"), { target: { value: "10:00" } });
    fireEvent.change(screen.getByTestId("input-ldo-dip-t1-open"), { target: { value: "50" } });
    fireEvent.change(screen.getByTestId("input-ldo-dip-t1-close"), { target: { value: "40" } });
    fireEvent.change(screen.getByTestId("input-ldo-dip-t2-open"), { target: { value: "20" } });
    fireEvent.change(screen.getByTestId("input-ldo-dip-t2-close"), { target: { value: "10" } });

    const expected = Math.max(
      0,
      getLdoVolumeAtDepth(1, 50) - getLdoVolumeAtDepth(1, 40) +
        getLdoVolumeAtDepth(2, 20) - getLdoVolumeAtDepth(2, 10),
    );
    expect(screen.getByTestId("text-ldo-consumed").textContent).toBe(expected.toFixed(2));
    expect(screen.getByTestId("text-ldo-lphr").textContent).toBe(expected.toFixed(2));

    fireEvent.change(screen.getByTestId("input-ldo-open"), { target: { value: "100" } });
    fireEvent.change(screen.getByTestId("input-ldo-close"), { target: { value: "130" } });
    expect(screen.getByTestId("text-ldo-consumed").textContent).toBe(expected.toFixed(2));
    fireEvent.change(screen.getByTestId("input-ldo-dip-t1-open"), { target: { value: "" } });
    fireEvent.change(screen.getByTestId("input-ldo-dip-t1-close"), { target: { value: "" } });
    fireEvent.change(screen.getByTestId("input-ldo-dip-t2-open"), { target: { value: "" } });
    fireEvent.change(screen.getByTestId("input-ldo-dip-t2-close"), { target: { value: "" } });
    expect(screen.getByTestId("text-ldo-consumed").textContent).toBe("30.00");
  });

  it("keeps an old saved staff name visible on the staff picker", () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      json: async () => [],
    }) as Response));
    render(<HeatingSessionDialog
      open
      date="2026-11-22"
      plantName="Main Plant"
      onOpenChange={vi.fn()}
      session={{ id: 12, date: "2026-11-22", plantName: "Main Plant", sessionType: "NIGHT_PREHEAT", staffName: "Saved Inactive Staff" } as any}
    />);

    const staffSelect = screen.getByTestId("input-staff-name");
    expect(staffSelect).toHaveTextContent("Saved Inactive Staff");
  });
});
