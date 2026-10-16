// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import HistoryDialog from "@/components/HistoryDialog";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("vendor-bill history actions", () => {
  it("renders the edit and the standalone status reset with old and new states", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify([
      {
        id: 1, module: "vendor_bills", transactionId: 7, action: "update", userId: 9,
        userName: "Audit User", userRole: "admin", oldValues: { status: "approved" },
        newValues: { billDate: "2026-10-05", status: "draft" }, reason: null, stockImpact: null,
        createdAt: "2026-10-05T10:00:00.000Z",
      },
      {
        id: 2, module: "vendor_bills", transactionId: 7, action: "status_reset", userId: 9,
        userName: "Audit User", userRole: "admin", oldValues: { status: "approved" },
        newValues: { status: "draft" }, reason: null, stockImpact: null,
        createdAt: "2026-10-05T10:00:00.000Z",
      },
    ]), { status: 200 })));

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <HistoryDialog open onOpenChange={() => {}} module="vendor_bills" transactionId={7} recordLabel="Bill VB-007" />
      </QueryClientProvider>,
    );

    expect(await screen.findByText("Edited")).toBeTruthy();
    expect(await screen.findByText("Status reset")).toBeTruthy();
    expect(screen.getByTestId("audit-status-reset-2").textContent).toContain("APPROVED");
    expect(screen.getByTestId("audit-status-reset-2").textContent).toContain("DRAFT");
  });

  it("shows the bill-date change in readable old-to-new order with its actor", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify([{
      id: 3, module: "vendor_bills", transactionId: 7, action: "bill_date_changed", userId: 9,
      userName: "Date Editor", userRole: "admin",
      oldValues: { billDate: "2026-10-09" }, newValues: { billDate: "2026-08-31" },
      reason: "Correcting ledger order", stockImpact: null, createdAt: "2026-10-16T10:00:00.000Z",
    }]), { status: 200 })));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <HistoryDialog open onOpenChange={() => {}} module="vendor_bills" transactionId={7} recordLabel="Bill VB-007" />
      </QueryClientProvider>,
    );
    expect(await screen.findByText("Bill date changed")).toBeTruthy();
    const change = screen.getByTestId("audit-bill-date-change-3");
    expect(change.textContent).toContain("09-Oct-2026");
    expect(change.textContent).toContain("31-Aug-2026");
    expect(await screen.findByText("Date Editor")).toBeTruthy();
    expect(await screen.findByText("Correcting ledger order", { exact: false })).toBeTruthy();
  });
});
