// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ allowed: false }));
vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ sectionCan: () => mocks.allowed }),
}));
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({
    data: {
      date: "2026-01-01",
      daily: { bitumenNormMt: 0.5, bitumenActualMt: 0.45, ldoNormL: 60, ldoActualL: 55 },
    },
    isError: false,
  }),
}));

import { PlantNormActualDaySummary } from "../client/src/components/PlantNormActualSummary";

describe("PLANT-06 confidential summary visibility", () => {
  afterEach(() => {
    cleanup();
    mocks.allowed = false;
  });

  it("renders nothing when the user has no explicit norm-vs-actual permission", () => {
    render(<PlantNormActualDaySummary date="2026-01-01" plantName="Test plant" />);
    expect(screen.queryByTestId("plant-norm-actual-day")).not.toBeInTheDocument();
    expect(screen.queryByText(/saved|excess/i)).not.toBeInTheDocument();
  });

  it("shows the HLC daily book/dips and norm/actual only when permitted", () => {
    mocks.allowed = true;
    render(<PlantNormActualDaySummary date="2026-01-01" plantName="Test plant" />);
    expect(screen.getByText("Bitumen: book 0.500 MT · dips 0.450 MT · 0.050 MT saved")).toBeInTheDocument();
    expect(screen.getByText("LDO: norm 60.0 L · actual 55.0 L · 5.0 L saved")).toBeInTheDocument();
  });
});
