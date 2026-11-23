// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";

vi.mock("@tanstack/react-query", () => ({
  useQuery: (options: { queryKey?: unknown[] }) => {
    const key = options.queryKey?.[0];
    if (key === "/api/plant-module/daily-reports") return {
      data: { ldo: { openingGap: { previousAt: "shift log 2026-11-21 18:00", currentAt: "2026-11-22T08:00", unaccountedLitres: 52, gaps: [] } } },
    };
    if (key === "/api/plant-module/heating-sessions") return { data: [{ id: 1, countsForDate: "2026-11-22", ldoTank1Consumed: 1800 }] };
    if (key === "/api/plant-module/shift-logs") return { data: [{ id: 2, plantName: "Main Plant", ldoTank1OpeningMeter: 10, ldoTank1ClosingMeter: 5 }] };
    return { data: [] };
  },
}));
vi.mock("wouter", () => ({
  Link: ({ href, children }: any) => <a href={href}>{children}</a>,
  useRoute: () => [true, { date: "2026-11-22" }],
}));
vi.mock("@/hooks/use-origin", () => ({
  useOrigin: () => ({
    appendPlantContext: (path: string) => path,
    getPlantBackLink: () => "/plant",
  }),
}));
vi.mock("@/lib/featureFlags", () => ({ useFeatureFlags: () => ({ defaultPlantName: "Main Plant" }) }));

import PlantHeatingMismatch from "../client/src/pages/PlantHeatingMismatch";

describe("PLANT-04 heating mismatch opening-gap check", () => {
  afterEach(cleanup);

  it("shows one net unaccounted-volume warning using the daily report calculation", () => {
    render(<PlantHeatingMismatch />);
    expect(screen.getByText(/52.0 L unaccounted between shift log 2026-11-21 18:00 and plant start/)).toBeInTheDocument();
    expect(screen.queryByText(/Sessions claim/)).not.toBeInTheDocument();
  });
});
