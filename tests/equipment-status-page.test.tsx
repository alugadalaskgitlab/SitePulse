// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";

vi.mock("@tanstack/react-query", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-query")>();
  return { ...actual, useQuery: vi.fn() };
});

import { useQuery } from "@tanstack/react-query";
import EquipmentStatus from "../client/src/pages/EquipmentStatus";

const report = {
  dateFrom: "2025-05-01",
  dateTo: "2025-05-05",
  equipment: [{
    equipmentId: 7,
    name: "Excavator EX-01",
    ownership: "hired",
    vendorName: "Acme Plant Hire",
    meterType: "hour_meter",
    summary: { working: 1, idleNoWork: 1, idleNoOperator: 0, breakdown: 1, loggedUnspecified: 1, notLogged: 1 },
    days: [
      { date: "2025-05-01", status: "working" },
      { date: "2025-05-02", status: "idle_no_work", reason: "Front not released" },
      { date: "2025-05-03", status: "breakdown", reason: "Hydraulic hose" },
      { date: "2025-05-04", status: "logged_unspecified", legacyLogged: true },
      {
        date: "2025-05-05",
        status: "not_logged",
        conflict: true,
        records: [{ source: "DPR", status: "working" }, { source: "Plant", status: "breakdown" }],
      },
    ],
  }],
};

beforeEach(() => {
  vi.mocked(useQuery).mockReturnValue({
    data: report,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof useQuery>);
});

describe("EquipmentStatus", () => {
  it("shows summary counts and keeps Not Logged separate from Idle", () => {
    render(<EquipmentStatus />);
    expect(screen.getByText("Excavator EX-01")).toBeInTheDocument();
    expect(screen.getAllByText("Not Logged").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Logged . No Status/).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Idle").length).toBeGreaterThan(0);
  });

  it("expands dates, reasons, legacy unspecified status and conflict records", () => {
    render(<EquipmentStatus />);
    fireEvent.click(screen.getByRole("button", { name: /Excavator EX-01/i }));
    expect(screen.getByText(/Front not released/)).toBeInTheDocument();
    expect(screen.getByText("Legacy log · status unspecified")).toBeInTheDocument();
    expect(screen.getByText("Conflicting records")).toBeInTheDocument();
    expect(screen.getByText("Source records (2)")).toBeInTheDocument();
  });

  it("filters by machine or vendor", () => {
    render(<EquipmentStatus />);
    fireEvent.change(screen.getByLabelText("Machine or vendor"), { target: { value: "missing" } });
    expect(screen.getByText("No equipment matches these filters")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Machine or vendor"), { target: { value: "Acme" } });
    expect(screen.getByText("Excavator EX-01")).toBeInTheDocument();
  });

  it("renders loading and error states", () => {
    vi.mocked(useQuery).mockReturnValueOnce({
      data: undefined, isLoading: true, isError: false, refetch: vi.fn(),
    } as unknown as ReturnType<typeof useQuery>);
    const { unmount } = render(<EquipmentStatus />);
    expect(screen.getByLabelText("Loading equipment status")).toBeInTheDocument();
    unmount();

    vi.mocked(useQuery).mockReturnValueOnce({
      data: undefined, isLoading: false, isError: true, refetch: vi.fn(),
    } as unknown as ReturnType<typeof useQuery>);
    render(<EquipmentStatus />);
    expect(screen.getByRole("alert")).toHaveTextContent("Equipment status could not be loaded");
  });
});