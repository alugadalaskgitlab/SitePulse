// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { getLdoVolumeAtDepth } from "@shared/ldo-dip-chart";

const mocks = vi.hoisted(() => ({
  mode: "dips_only" as "working" | "dips_only",
  navigate: vi.fn(),
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: (options: { queryKey?: unknown[] }) => {
    const key = String(options.queryKey?.[0] ?? "");
    if (key === "/api/plant-module/plant-settings") {
      return { data: { boilerFuelMeterMode: mocks.mode }, isLoading: false, refetch: vi.fn() };
    }
    return { data: [], isLoading: false, refetch: vi.fn() };
  },
  useMutation: () => ({ isPending: false, mutate: vi.fn(), mutateAsync: vi.fn() }),
}));

vi.mock("wouter", () => ({
  Link: ({ href, children, ...props }: any) => <a href={href} {...props}>{children}</a>,
  useRoute: () => [true, { date: "2026-11-22" }],
  useLocation: () => ["/plant/heating-sessions/2026-11-22", mocks.navigate],
}));
vi.mock("@/lib/featureFlags", () => ({ useFeatureFlags: () => ({ defaultPlantName: "Main Plant" }) }));
vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ featureCan: () => true }) }));
vi.mock("@/hooks/use-origin", () => ({
  useOrigin: () => ({
    appendPlantContext: (path: string) => path,
    getPlantBackLink: () => "/plant/hub",
  }),
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/lib/queryClient", () => ({
  apiRequest: vi.fn(),
  queryClient: { invalidateQueries: vi.fn() },
}));

import PlantHeatingSessions from "../client/src/pages/PlantHeatingSessions";

describe("PLANT-03 heating session page fuel mode", () => {
  beforeEach(() => {
    mocks.mode = "dips_only";
    mocks.navigate.mockClear();
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const body = url.includes("/plant-settings/")
        ? { boilerFuelMeterMode: mocks.mode }
        : url.includes("/shift-logs/by-date/")
          ? { dryerFedFrom: "TANK_2" }
          : [];
      return { ok: true, json: async () => body } as Response;
    }));
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  async function openNewSession() {
    render(<PlantHeatingSessions />);
    fireEvent.click(await screen.findByTestId("button-new-session"));
  }

  it("shows Tank 1 dips, hides boiler meter, and calculates session litres and rate", async () => {
    await openNewSession();

    expect(screen.queryByTestId("input-ldo-open")).not.toBeInTheDocument();
    expect(screen.queryByTestId("input-ldo-close")).not.toBeInTheDocument();
    expect(screen.getByTestId("input-ldo-dip-t1-open")).toBeInTheDocument();
    expect(screen.getByTestId("input-ldo-dip-t1-close")).toBeInTheDocument();
    expect(screen.getByText("LDO tank 1 dips — boiler meter not used")).toBeInTheDocument();

    fireEvent.change(screen.getByTestId("input-start-time"), { target: { value: "09:00" } });
    fireEvent.change(screen.getByTestId("input-end-time"), { target: { value: "10:00" } });
    fireEvent.change(screen.getByTestId("input-ldo-dip-t1-open"), { target: { value: "50" } });
    fireEvent.change(screen.getByTestId("input-ldo-dip-t1-close"), { target: { value: "40" } });

    const expectedLitres = Math.max(0, getLdoVolumeAtDepth(1, 50) - getLdoVolumeAtDepth(1, 40));
    expect(screen.getByTestId("text-ldo-consumed")).toHaveTextContent(expectedLitres.toFixed(1));
    expect(screen.getByTestId("text-ldo-lphr")).toHaveTextContent(expectedLitres.toFixed(2));
  });

  it("keeps the meter form when boiler fuel mode is working", async () => {
    mocks.mode = "working";
    await openNewSession();
    expect(screen.getByTestId("input-ldo-open")).toBeInTheDocument();
    expect(screen.getByTestId("input-ldo-close")).toBeInTheDocument();
  });
});
