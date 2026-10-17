// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { readFileSync } from "node:fs";
import AuditHistoryButton from "@/components/AuditHistoryButton";
import HistoryDialog from "@/components/HistoryDialog";

const authTestState = vi.hoisted(() => ({ isAdmin: true, isOwner: false }));
vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({
    isAdmin: authTestState.isAdmin,
    isOwner: authTestState.isOwner,
    user: { isAdmin: authTestState.isAdmin, isOwner: authTestState.isOwner },
  }),
}));

const historyPages = [
  "client/src/pages/VendorBills.tsx",
  "client/src/pages/SiteMaterialTrips.tsx",
  "client/src/pages/SitePurchasesReport.tsx",
  "client/src/pages/PlantMaterialReceipts.tsx",
  "client/src/pages/PlantMaintenance.tsx",
  "client/src/pages/SiteReport.tsx",
];

beforeEach(() => {
  authTestState.isAdmin = true;
  authTestState.isOwner = false;
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("vendor-bill history actions", () => {
  it("uses one Owner/Administrator-only history button on all six pages", () => {
    authTestState.isAdmin = false;
    authTestState.isOwner = false;
    const { rerender } = render(<AuditHistoryButton data-testid="gated-history-button">History</AuditHistoryButton>);
    expect(screen.queryByTestId("gated-history-button")).toBeNull();

    authTestState.isAdmin = true;
    rerender(<AuditHistoryButton data-testid="gated-history-button">History</AuditHistoryButton>);
    expect(screen.getByTestId("gated-history-button")).toBeTruthy();

    authTestState.isAdmin = false;
    authTestState.isOwner = true;
    rerender(<AuditHistoryButton data-testid="gated-history-button">History</AuditHistoryButton>);
    expect(screen.getByTestId("gated-history-button")).toBeTruthy();

    for (const page of historyPages) {
      const source = readFileSync(page, "utf8");
      expect(source).toContain("AuditHistoryButton");
      expect(source).toContain("<HistoryDialog");
    }
  });

  it("does not request or open audit history for a user who is neither Owner nor Administrator", async () => {
    authTestState.isAdmin = false;
    authTestState.isOwner = false;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <QueryClientProvider client={client}>
        <HistoryDialog open onOpenChange={() => {}} module="vendor_bills" transactionId={7} recordLabel="Bill VB-007" />
      </QueryClientProvider>,
    );
    await new Promise(resolve => setTimeout(resolve, 20));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.queryByTestId("list-audit-history")).toBeNull();
  });

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
