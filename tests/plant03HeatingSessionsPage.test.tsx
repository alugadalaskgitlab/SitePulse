// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { getLdoVolumeAtDepth } from "@shared/ldo-dip-chart";

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  sessions: [] as any[],
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: (options: { queryKey?: unknown[] }) => {
    const key = String(options.queryKey?.[0] ?? "");
    if (key === "/api/plant-module/heating-sessions") {
      return { data: mocks.sessions, isLoading: false, refetch: vi.fn() };
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

describe("PLANT-04 heating session page fuel readings", () => {
  beforeEach(() => {
    mocks.navigate.mockClear();
    mocks.sessions = [];
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const body = url.includes("/shift-logs/by-date/")
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

  it("shows both tank dip pairs and the automatic meter fallback", async () => {
    await openNewSession();

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

    const expectedLitres = Math.max(
      0,
      getLdoVolumeAtDepth(1, 50) - getLdoVolumeAtDepth(1, 40) +
        getLdoVolumeAtDepth(2, 20) - getLdoVolumeAtDepth(2, 10),
    );
    expect(screen.getByTestId("text-ldo-consumed")).toHaveTextContent(expectedLitres.toFixed(1));
    expect(screen.getByTestId("text-ldo-lphr")).toHaveTextContent(expectedLitres.toFixed(2));
  });

  it("does not use the saved legacy boiler meter mode to hide fields", async () => {
    await openNewSession();
    expect(screen.getByTestId("input-ldo-open")).toBeInTheDocument();
    expect(screen.getByTestId("input-ldo-dip-t2-open")).toBeInTheDocument();
  });

  it("labels each session with its production day or waiting state", async () => {
    mocks.sessions = [
      {
        id: 21, date: "2026-11-22", countsForDate: "2026-11-23",
        plantName: "Main Plant", sessionType: "NIGHT_PREHEAT",
        startTime: "22:00", endTime: "06:00", durationHours: 8,
        ldoTank1Consumed: 165.6, dgMode: "none", generatorLogId: null,
      },
      {
        id: 22, date: "2026-11-22", countsForDate: null,
        plantName: "Main Plant", sessionType: "NIGHT_PREHEAT",
        startTime: "20:00", endTime: "21:00", durationHours: 1,
        ldoTank1Consumed: 0, dgMode: "none", generatorLogId: null,
      },
    ];
    render(<PlantHeatingSessions />);

    expect(await screen.findByText("Counts for: 23 Nov 2026")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("button-toggle-date-2026-11-22"));
    expect(await screen.findByText("Waiting for next production day")).toBeInTheDocument();
  });
});
