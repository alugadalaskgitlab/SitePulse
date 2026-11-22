// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";

vi.mock("@tanstack/react-query", () => ({
  useQuery: (options: { queryKey?: unknown[] }) => {
    const key = options.queryKey?.[0];
    if (key === "/api/plant-module/plant-settings") return { data: { boilerFuelMeterMode: "dips_only" } };
    if (key === "/api/plant-module/heating-sessions") return { data: [{ id: 1, ldoTank1Consumed: 1800 }] };
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

describe("PLANT-03 heating mismatch dips-only state", () => {
  afterEach(cleanup);

  it("shows the dips-only note instead of a boiler meter mismatch warning", () => {
    render(<PlantHeatingMismatch />);
    expect(screen.getByText("Boiler meter not used — dips only")).toBeInTheDocument();
    expect(screen.queryByText(/Sessions claim/)).not.toBeInTheDocument();
  });
});
