// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import VendorPayables from "@/pages/VendorPayables";

const state = vi.hoisted(() => ({
  location: "/reports/vendor-payables",
  sheets: [] as Array<{ name: string; rows: Record<string, unknown>[] }>,
}));

vi.mock("wouter", async () => {
  const React = await import("react");
  return {
    Link: ({ href, children, ...props }: any) => React.createElement("a", { href, ...props }, children),
    useLocation: () => [state.location, vi.fn()],
  };
});
vi.mock("@/components/HubShell", async () => {
  const React = await import("react");
  return { HubShell: ({ children }: any) => React.createElement("div", null, children) };
});
vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ user: { id: 7 }, sectionVisible: () => true, sectionCan: () => true }),
}));
vi.mock("xlsx", () => ({
  utils: {
    book_new: () => ({ SheetNames: [] as string[], Sheets: {} as Record<string, unknown> }),
    json_to_sheet: (rows: Record<string, unknown>[]) => ({ rows }),
    book_append_sheet: (workbook: any, sheet: { rows: Record<string, unknown>[] }, name: string) => {
      state.sheets.push({ name, rows: sheet.rows });
      workbook.SheetNames.push(name);
      workbook.Sheets[name] = sheet;
    },
  },
  writeFile: vi.fn(),
}));

const linkedBill = (bill: Record<string, unknown>) => ({
  billDate: "2026-10-09",
  periodFrom: "2026-10-01",
  periodTo: "2026-10-31",
  totalAmount: 1000,
  amountPaid: 0,
  items: [{ category: "material", amount: 1000 }],
  ...bill,
});

const bills = [
  linkedBill({
    id: 54, billNo: "HLC/VB/2026/0054", vendorId: 3, vendorName: "MAHIPAL KALPAGURI",
    linkedVendorName: "MAHIPAL KALPAGURI", status: "approved", totalAmount: 58000,
    netPayableAmount: 56840, amountPaid: 50000, items: [{ category: "equipment", amount: 58000 }],
  }),
  linkedBill({
    id: 55, billNo: "HLC/VB/2026/0055", vendorId: 3, vendorName: "MAHIPAL KALPAGURI",
    linkedVendorName: "MAHIPAL KALPAGURI", status: "approved", totalAmount: 56130,
    netPayableAmount: 5007.4, amountPaid: 0, items: [{ category: "equipment", amount: 56130 }],
  }),
  linkedBill({
    id: 80, billNo: "HLC/VB/2026/0062", vendorId: 3, vendorName: "MAHIPAL KALPAGURI",
    linkedVendorName: "MAHIPAL KALPAGURI", status: "draft", totalAmount: 25161.29,
    netPayableAmount: 25161.29, amountPaid: 0, items: [{ category: "equipment", amount: 25161.29 }],
  }),
  linkedBill({
    id: 81, billNo: "HLC/VB/G-01", vendorId: 4, vendorName: "GANGARAM NARSIMHULU",
    linkedVendorName: "GANGARAM NARSIMHULU", status: "paid", totalAmount: 551986.99,
    netPayableAmount: 551986.99, amountPaid: 551986.99,
  }),
  linkedBill({
    id: 82, billNo: "HLC/VB/G-02", vendorId: 4, vendorName: "GANGARAM NARSIMHULU",
    linkedVendorName: "GANGARAM NARSIMHULU", status: "draft", totalAmount: 389888.41,
    netPayableAmount: 389888.41, amountPaid: 0,
  }),
  linkedBill({
    id: 99, billNo: "HLC/VB/2026/0099", vendorId: null, vendorName: "RATNAM",
    status: "draft", totalAmount: 1200, netPayableAmount: 1200, amountPaid: 200,
    items: [{ category: "material", amount: 1200 }],
  }),
];

let queryClient: QueryClient;

function setRoute(path: string) {
  state.location = path;
  window.history.replaceState(null, "", path);
}

function mount() {
  render(<QueryClientProvider client={queryClient}><VendorPayables /></QueryClientProvider>);
}

beforeEach(() => {
  state.sheets = [];
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  setRoute("/reports/vendor-payables");
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(bills), { status: 200 })));
});

afterEach(() => {
  cleanup();
  queryClient.clear();
  vi.unstubAllGlobals();
});

describe("VB-PAY-02 payables presentation", () => {
  it("keeps linked amounts unchanged and constrains the vendor column at desktop widths", async () => {
    mount();
    const row = await screen.findByTitle("GANGARAM NARSIMHULU");
    const gangaram = row.closest("tr")!;
    expect(within(gangaram).getByText("₹9,41,875.40")).toBeTruthy();
    expect(within(gangaram).getAllByText("₹3,89,888.41")).toHaveLength(2);
    expect(within(gangaram).getByText("₹0.00")).toBeTruthy();
    expect(row.className).toContain("truncate");
    expect(row.getAttribute("title")).toBe("GANGARAM NARSIMHULU");

    const table = screen.getByRole("table");
    expect(table.className).toContain("table-fixed");
    expect(table.className).toContain("lg:min-w-0");
    expect(table.querySelector("thead th")?.className).toContain("sticky");
    expect(screen.getAllByText("₹37,008.69").length).toBeGreaterThan(0);
  });

  it("shows unlinked totals on their tab and keeps the excluded position visible on the linked tab", async () => {
    mount();
    const notice = await screen.findByText(/1 unlinked bill/);
    expect(notice.parentElement?.textContent).toContain("₹1,000.00 balance");
    expect(notice.parentElement?.textContent).toContain("not included in the totals above");
    expect(notice.parentElement?.querySelector("a")?.getAttribute("href")).toContain("tab=unlinked");

    fireEvent.click(screen.getByRole("tab", { name: "Unlinked bills" }));
    await screen.findByText(/Masters → Vendors → Link Vendors → Pending Links/);
    expect(screen.getAllByText("₹1,200.00").length).toBeGreaterThan(0);
    expect(screen.getByText("₹200.00")).toBeTruthy();
    expect(screen.getAllByText("₹1,000.00").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Unlinked").length).toBeGreaterThan(0);
    expect(screen.queryByText(/Link this bill/)).toBeNull();
  });

  it("exports both sheets and includes the same unlinked count and totals as the tab", async () => {
    mount();
    await screen.findByRole("tab", { name: "Linked vendors" });
    fireEvent.click(screen.getByRole("button", { name: "Export Excel" }));

    await waitFor(() => expect(state.sheets).toHaveLength(2));
    expect(state.sheets.map(sheet => sheet.name)).toEqual(["Linked summary", "Unlinked bills"]);
    expect(state.sheets[1].rows[0]).toMatchObject({
      "Typed vendor name": "TOTAL — UNLINKED BILLS",
      "Bill count": 1,
      Net: 1200,
      Paid: 200,
      Balance: 1000,
    });
  });

  it("adds the exact date-filtered originating ledger as the bill return marker", async () => {
    setRoute("/reports/vendor-payables/vendor/3?dateFrom=2026-10-01&dateTo=2026-10-31");
    mount();
    const link = await screen.findByRole("link", { name: "HLC/VB/2026/0054" });
    const detail = new URL(link.getAttribute("href")!, window.location.origin);
    const params = new URLSearchParams(detail.search);
    expect(detail.pathname).toBe("/finance/vendor-bills");
    expect(params.get("billId")).toBe("54");
    expect(params.get("returnTo")).toBe("/reports/vendor-payables/vendor/3?dateFrom=2026-10-01&dateTo=2026-10-31");
  });

  it("returns unlinked bill links to the exact unlinked ledger and active date range", async () => {
    setRoute("/reports/vendor-payables/unlinked/99?dateFrom=2026-10-01&dateTo=2026-10-31");
    mount();
    const link = await screen.findByRole("link", { name: "HLC/VB/2026/0099" });
    const detail = new URL(link.getAttribute("href")!, window.location.origin);
    const params = new URLSearchParams(detail.search);
    expect(params.get("returnTo")).toBe("/reports/vendor-payables/unlinked/99?dateFrom=2026-10-01&dateTo=2026-10-31");
  });
});
