// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/featureFlags", () => ({
  useFeatureFlags: () => ({ companyName: "HLC", logoFile: "logo.png" }),
}));

vi.mock("@tanstack/react-query", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-query")>();
  return { ...actual, useQuery: vi.fn() };
});

vi.mock("@/hooks/use-dpr-boq-items", () => ({
  useDprBoqItems: () => ({ items: [] }),
}));

vi.mock("@/components/DprPhotoGroups", () => ({
  DprPhotoGroups: () => <div data-testid="preview-photos" />,
}));

vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ open, children }: { open: boolean; children: React.ReactNode }) => open ? <div>{children}</div> : null,
  DialogContent: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => <div {...props}>{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => <h2 {...props}>{children}</h2>,
  DialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
}));

import { useQuery } from "@tanstack/react-query";
import { ReportHeader } from "../client/src/components/ReportHeader";
import { DprPreviewDialog } from "../client/src/components/DprPreviewDialog";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("task 1482 DPR report identity header", () => {
  it("prominently renders a saved positive DPR ID and draft status", () => {
    render(
      <ReportHeader
        dprId={1482}
        date="2025-06-12"
        site="North Site"
        engineer="Engineer One"
        dprStatus="draft"
      />,
    );

    expect(screen.getByTestId("text-report-dpr-id")).toHaveTextContent(/^DPR-1482$/);
    expect(screen.getByTestId("text-report-dpr-id")).toHaveClass("text-xl");
    expect(screen.getByTestId("badge-report-status")).toHaveTextContent("Draft — not submitted");
  });

  it("renders submitted status while retaining the saved reference and actor history", () => {
    render(
      <ReportHeader
        dprId={93}
        date="2025-06-12"
        site="North Site"
        engineer="Engineer One"
        dprStatus="submitted"
        createdAt="2025-06-12T08:00:00"
        authorName="Creator"
        lastEditedAt="2025-06-12T09:00:00"
        lastEditedByName="Editor"
        submittedAt="2025-06-12T10:00:00"
        submittedByName="Submitter"
      />,
    );

    expect(screen.getByTestId("text-report-dpr-id")).toHaveTextContent(/^DPR-93$/);
    expect(screen.getByTestId("badge-report-status")).toHaveTextContent("Submitted");
    expect(screen.getByTestId("text-report-created")).toHaveTextContent("Draft created by Creator");
    expect(screen.getByTestId("text-report-last-edited")).toHaveTextContent("Last edited by Editor");
    expect(screen.getByTestId("text-report-submitted")).toHaveTextContent("Submitted by Submitter");
  });

  it.each([undefined, null, 0, -8, 2.5])("never renders an unsaved DPR reference for %s", (dprId) => {
    render(
      <ReportHeader
        dprId={dprId}
        date="2025-06-12"
        site="North Site"
        engineer="Engineer One"
        dprStatus="draft"
      />,
    );

    expect(screen.queryByTestId("text-report-dpr-id")).not.toBeInTheDocument();
  });
});

const fetchedDpr = {
  id: 86,
  date: "2025-06-12",
  site: "North Site",
  engineer: "Engineer One",
  progress: [],
  equipment: [],
};

describe("task 1482 DPR preview identity", () => {
  it("uses the fetched saved DPR ID in the title instead of the requested lineage ID", () => {
    vi.mocked(useQuery).mockImplementation((options: any) => {
      if (options.queryKey[0] === "/api/dprs") {
        return { data: fetchedDpr, isLoading: false, isError: false } as ReturnType<typeof useQuery>;
      }
      return { data: [], isLoading: false, isError: false } as ReturnType<typeof useQuery>;
    });

    render(<DprPreviewDialog dprId={41} onClose={vi.fn()} />);

    expect(screen.getByRole("heading")).toHaveTextContent("DPR-86");
    expect(screen.getByRole("heading")).not.toHaveTextContent("DPR-41");
  });

  it("may show the requested saved ID while the fetched report is loading", () => {
    vi.mocked(useQuery).mockImplementation((options: any) => {
      if (options.queryKey[0] === "/api/dprs") {
        return { data: undefined, isLoading: true, isError: false } as ReturnType<typeof useQuery>;
      }
      return { data: [], isLoading: false, isError: false } as ReturnType<typeof useQuery>;
    });

    render(<DprPreviewDialog dprId={41} onClose={vi.fn()} />);

    expect(screen.getByRole("heading")).toHaveTextContent("DPR-41");
    expect(screen.getByText("Loading…")).toBeInTheDocument();
  });

  it.each([null, 0, -1])("does not open or query an unsaved reference for %s", (dprId) => {
    vi.mocked(useQuery).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useQuery>);

    render(<DprPreviewDialog dprId={dprId} onClose={vi.fn()} />);

    expect(screen.queryByTestId("dpr-preview-dialog")).not.toBeInTheDocument();
    expect(vi.mocked(useQuery).mock.calls[0]?.[0]).toMatchObject({ enabled: false });
  });
});