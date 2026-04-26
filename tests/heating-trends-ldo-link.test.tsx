// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";

vi.mock("@tanstack/react-query", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-query")>();
  return {
    ...actual,
    useQuery: vi.fn(),
  };
});

vi.mock("wouter", () => ({
  useSearch: () => "",
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode; [key: string]: unknown }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  LineChart: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Line: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
  Legend: () => null,
  ReferenceLine: () => null,
}));

import { useQuery } from "@tanstack/react-query";
import PlantHeatingTrends from "../client/src/pages/PlantHeatingTrends";

const emptyBucket = {
  count: 0,
  hours: 0,
  ldoT1L: 0,
  dgDieselL: 0,
  lPerHour: null,
  lPerMT: null,
};

const MISMATCH_DATE = "2025-04-10";

const mockTrendsData = {
  dateFrom: "2025-04-01",
  dateTo: "2025-04-10",
  plantName: "Main Plant",
  targetLPerMT: 1.5,
  hotOilEndTempMinC: 240,
  hotOilDeltaMinC: 15,
  mismatchThresholdL: 5,
  rows: [
    {
      date: MISMATCH_DATE,
      productionMT: 100,
      night: { ...emptyBucket, count: 1, ldoT1L: 150 },
      day: { ...emptyBucket },
      total: { count: 1, hours: 3, ldoT1L: 150, dgDieselL: 0, lPerHour: 50, lPerMT: 1.5 },
      hotOilEndAvgC: 245,
      hotOilEndMinC: 240,
      hotOilEndMaxC: 250,
      hotOilEndSampleCount: 1,
      hotOilEndBelowThreshold: false,
      hotOilSupplyAvgC: 260,
      hotOilReturnAvgC: 240,
      hotOilDeltaAvgC: 20,
      hotOilDeltaSampleCount: 1,
      hotOilDeltaBelowThreshold: false,
      shiftMeterT1L: 200,
      shiftMeterLPerMT: 2.0,
      mismatchL: 50,
      mismatchFlag: true,
    },
  ],
  summary: {
    days: 1,
    sessionCount: 1,
    totalHours: 3,
    totalLdoT1L: 150,
    dgDieselL: 0,
    totalProductionMT: 100,
    lPerHour: 50,
    lPerMT: 1.5,
    hotOilEndAvgC: 245,
    hotOilEndMinC: 240,
    hotOilEndMaxC: 250,
    hotOilFlaggedDays: 0,
    hotOilSupplyAvgC: 260,
    hotOilReturnAvgC: 240,
    hotOilDeltaAvgC: 20,
    hotOilDeltaMinObservedC: 20,
    hotOilDeltaFlaggedDays: 0,
    totalShiftMeterT1L: 200,
    shiftMeterLPerMT: 2.0,
    mismatchDays: 1,
    daysWithShiftMeter: 1,
  },
};

beforeEach(() => {
  vi.mocked(useQuery).mockReturnValue({
    data: mockTrendsData,
    isLoading: false,
    isError: false,
    error: null,
  } as ReturnType<typeof useQuery>);
});

describe("PlantHeatingTrends — mismatch cell LDO Ledger link", () => {
  it("renders the Sessions vs Shift badge link when mismatchFlag is true", () => {
    render(<PlantHeatingTrends />);
    expect(screen.getByTestId(`link-mismatch-${MISMATCH_DATE}`)).toBeInTheDocument();
  });

  it("renders the LDO Ledger badge link when mismatchFlag is true", () => {
    render(<PlantHeatingTrends />);
    expect(screen.getByTestId(`link-ldo-ledger-${MISMATCH_DATE}`)).toBeInTheDocument();
  });

  it("LDO Ledger link href contains /plant/ldo-mismatch/:date", () => {
    render(<PlantHeatingTrends />);
    const link = screen.getByTestId(`link-ldo-ledger-${MISMATCH_DATE}`);
    expect(link.getAttribute("href")).toContain(`/plant/ldo-mismatch/${MISMATCH_DATE}`);
  });

  it("LDO Ledger link href contains the correct plant query param", () => {
    render(<PlantHeatingTrends />);
    const link = screen.getByTestId(`link-ldo-ledger-${MISMATCH_DATE}`);
    const href = link.getAttribute("href") ?? "";
    expect(href).toContain("plant=Main%20Plant");
  });

  it("Sessions vs Shift link href contains /plant/heating-mismatch/:date with correct plant param", () => {
    render(<PlantHeatingTrends />);
    const link = screen.getByTestId(`link-mismatch-${MISMATCH_DATE}`);
    const href = link.getAttribute("href") ?? "";
    expect(href).toContain(`/plant/heating-mismatch/${MISMATCH_DATE}`);
    expect(href).toContain("plant=Main%20Plant");
  });

  it("LDO Ledger badge text is visible", () => {
    render(<PlantHeatingTrends />);
    expect(screen.getByTestId(`badge-ldo-ledger-${MISMATCH_DATE}`)).toBeInTheDocument();
  });
});
