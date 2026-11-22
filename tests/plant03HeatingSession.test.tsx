// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { getLdoVolumeAtDepth } from "@shared/ldo-dip-chart";

const mocks = vi.hoisted(() => ({
  settings: { boilerFuelMeterMode: "dips_only" as "working" | "dips_only" },
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: (options: { queryKey?: unknown[] }) => {
    const key = options.queryKey?.[0];
    if (key === "/api/plant-module/plant-settings") return { data: mocks.settings, isLoading: false };
    return { data: [], isLoading: false };
  },
  useMutation: () => ({ isPending: false, mutate: vi.fn(), mutateAsync: vi.fn() }),
}));
vi.mock("@/lib/queryClient", () => ({
  apiRequest: vi.fn(),
  queryClient: { invalidateQueries: vi.fn() },
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/components/DryerSourceFixDialog", () => ({ default: () => null }));

import { HeatingSessionDialog } from "../client/src/components/HeatingSessionDialog";

describe("PLANT-03 heating session fuel mode", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("uses Tank 1 dips for litres and hides the boiler meter when dips-only is selected", () => {
    mocks.settings = { boilerFuelMeterMode: "dips_only" };
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      json: async () => [],
    }) as Response));
    render(<HeatingSessionDialog open date="2026-11-22" plantName="Main Plant" onOpenChange={vi.fn()} />);

    expect(screen.queryByTestId("input-ldo-open")).not.toBeInTheDocument();
    expect(screen.queryByTestId("input-ldo-close")).not.toBeInTheDocument();
    expect(screen.getByTestId("input-ldo-dip-t1-open")).toBeInTheDocument();
    expect(screen.getByTestId("input-ldo-dip-t1-close")).toBeInTheDocument();

    fireEvent.change(screen.getByTestId("input-start-time"), { target: { value: "09:00" } });
    fireEvent.change(screen.getByTestId("input-end-time"), { target: { value: "10:00" } });
    fireEvent.change(screen.getByTestId("input-ldo-dip-t1-open"), { target: { value: "50" } });
    fireEvent.change(screen.getByTestId("input-ldo-dip-t1-close"), { target: { value: "40" } });

    const expected = Math.max(0, getLdoVolumeAtDepth(1, 50) - getLdoVolumeAtDepth(1, 40));
    expect(screen.getByTestId("text-ldo-consumed").textContent).toBe(expected.toFixed(1));
    expect(screen.getByTestId("text-ldo-lphr").textContent).toBe(expected.toFixed(2));
  });

  it("keeps the existing boiler meter fields when the setting is working", () => {
    mocks.settings = { boilerFuelMeterMode: "working" };
    render(<HeatingSessionDialog open date="2026-11-22" plantName="Main Plant" onOpenChange={vi.fn()} />);
    expect(screen.getByTestId("input-ldo-open")).toBeInTheDocument();
    expect(screen.getByTestId("input-ldo-close")).toBeInTheDocument();
  });
});
