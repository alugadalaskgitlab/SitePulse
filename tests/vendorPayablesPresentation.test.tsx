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
    Link: ({ href, children, onClick, ...props }: any) => React.createElement("a", {
      href,
      ...props,
      onClick: (event: React.MouseEvent<HTMLAnchorElement>) => {
        event.preventDefault();
        onClick?.(event);
      },
    }, children),
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

type LinkedBillFixture = {
  id: number;
  billNo: string;
  vendorId: number;
  vendorName: string;
  net: number;
  status: string;
  paid?: number | null;
  billDate?: string;
  periodFrom?: string;
  periodTo?: string;
};

const linkedFixture = ({
  id, billNo, vendorId, vendorName, net, status, paid = null,
  billDate = "2026-03-09", periodFrom = "2026-02-04", periodTo = "2026-02-05",
}: LinkedBillFixture) => linkedBill({
  id, billNo, vendorId, vendorName, linkedVendorName: vendorName, status,
  billDate, periodFrom, periodTo, totalAmount: net, netPayableAmount: net,
  amountPaid: paid, items: [{ category: "equipment", amount: net }],
});

const gangaramBills = [
  ...Array.from({ length: 10 }, (_, index) => linkedFixture({
    id: 81 + index,
    billNo: `HLC/VB/2026/${String(index + 1).padStart(4, "0")}`,
    vendorId: 4,
    vendorName: "GANGARAM NARSIMHULU",
    net: 50000,
    status: "paid",
    billDate: `2026-03-${String(9 + index).padStart(2, "0")}`,
  })),
  linkedFixture({
    id: 91, billNo: "HLC/VB/2026/0011", vendorId: 4, vendorName: "GANGARAM NARSIMHULU",
    net: 51986.99, status: "paid", billDate: "2026-03-19",
  }),
  linkedFixture({
    id: 92, billNo: "HLC/VB/2026/0012", vendorId: 4, vendorName: "GANGARAM NARSIMHULU",
    net: 389888.41, status: "draft", billDate: "2026-03-20",
  }),
];

const sangannaBills = [
  linkedFixture({
    id: 201, billNo: "HLC/VB/S-01", vendorId: 5, vendorName: "G SANGANNA",
    net: 60000, status: "paid",
  }),
  linkedFixture({
    id: 202, billNo: "HLC/VB/S-02", vendorId: 5, vendorName: "G SANGANNA",
    net: 63420, status: "paid",
  }),
  linkedFixture({
    id: 203, billNo: "HLC/VB/S-03", vendorId: 5, vendorName: "G SANGANNA",
    net: 110544, status: "draft",
  }),
];

const mahprovisional = [
  { net: 13535, paid: 13535 },
  { net: 13535, paid: 13535 },
  { net: 1000, paid: 0 },
  ...Array.from({ length: 19 }, () => ({ net: 14184.6, paid: null })),
  { net: 14184.5, paid: null },
];
const unlinkedNames = [
  "BAKKANNA", "BALARAJU", "BALARAJU SANGAPUR",
  ...Array.from({ length: 13 }, (_, index) => `UNLINKED PARTY ${String(index + 4).padStart(2, "0")}`),
];
const unlinkedBills = mahprovisional.map((item, index) => linkedBill({
  id: 99 + index,
  billNo: `HLC/VB/2026/${String(99 + index).padStart(4, "0")}`,
  billDate: index === 0 ? "2026-10-09" : `2026-04-${String(index + 1).padStart(2, "0")}`,
  vendorId: null,
  vendorName: unlinkedNames[index % unlinkedNames.length],
  status: item.paid == null ? "draft" : "paid",
  totalAmount: item.net,
  netPayableAmount: item.net,
  amountPaid: item.paid,
  items: [{ category: "material", amount: item.net }],
}));

const bills = [
  ...gangaramBills,
  ...sangannaBills,
  linkedFixture({
    id: 301, billNo: "HLC/VB/O-01", vendorId: 6, vendorName: "ORSU VENKANNA",
    net: 107600, status: "draft", paid: 0,
  }),
  linkedFixture({
    id: 401, billNo: "HLC/VB/N-01", vendorId: 7, vendorName: "NAFEEZ",
    net: 75768.17, status: "approved", paid: 50000,
  }),
  linkedFixture({
    id: 402, billNo: "HLC/VB/N-02", vendorId: 7, vendorName: "NAFEEZ",
    net: 0, status: "paid", paid: 0,
  }),
  linkedFixture({
    id: 54, billNo: "HLC/VB/2026/0054", vendorId: 3, vendorName: "MAHIPAL KALPAGURI",
    net: 87008.69, status: "approved", paid: 75155, billDate: "2026-10-09",
    periodFrom: "2026-10-01", periodTo: "2026-10-31",
  }),
  linkedFixture({
    id: 55, billNo: "HLC/VB/2026/0055", vendorId: 3, vendorName: "MAHIPAL KALPAGURI",
    net: 0, status: "paid", paid: 0,
  }),
  linkedFixture({
    id: 80, billNo: "HLC/VB/2026/0062", vendorId: 3, vendorName: "MAHIPAL KALPAGURI",
    net: 0, status: "paid", paid: 0,
  }),
  ...unlinkedBills,
];

let queryClient: QueryClient;

function setRoute(path: string) {
  state.location = path;
  window.history.replaceState(null, "", path);
}

function mount() {
  return render(<QueryClientProvider client={queryClient}><VendorPayables /></QueryClientProvider>);
}

function expectNoTruncatedCurrency(container: HTMLElement) {
  expect(container.textContent).not.toMatch(/₹[^\n₹]*(?:…|\.{3})/);
  const currencyNodes = Array.from(container.querySelectorAll<HTMLElement>("*"))
    .filter((node) => node.children.length === 0 && /^₹/.test(node.textContent?.trim() ?? ""));
  expect(currencyNodes.length).toBeGreaterThan(0);
  for (const node of currencyNodes) {
    expect(node.textContent).toMatch(/^₹[\d,]+\.\d{2}\*?$/);
    expect(node.className).not.toMatch(/\btruncate\b/);
  }
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
  it("keeps the readable linked-vendor amounts unchanged and gives full amounts room", async () => {
    const { container } = mount();
    const row = await screen.findByTitle("GANGARAM NARSIMHULU");
    const expectedRows: [string, string[]][] = [
      ["GANGARAM NARSIMHULU", ["₹9,41,875.40", "₹0.00", "₹0.00", "₹3,89,888.41", "₹3,89,888.41"]],
      ["G SANGANNA", ["₹2,33,964.00", "₹0.00", "₹0.00", "₹1,10,544.00", "₹1,10,544.00"]],
      ["ORSU VENKANNA", ["₹1,07,600.00", "₹0.00", "₹0.00", "₹1,07,600.00", "₹1,07,600.00"]],
      ["NAFEEZ", ["₹75,768.17", "₹50,000.00", "₹25,768.17", "₹0.00", "₹25,768.17"]],
      ["MAHIPAL KALPAGURI", ["₹87,008.69", "₹75,155.00", "₹11,853.69", "₹0.00", "₹11,853.69"]],
    ];
    for (const [name, expected] of expectedRows) {
      const vendorLink = name === "GANGARAM NARSIMHULU" ? row : screen.getByTitle(name);
      const cells = Array.from(vendorLink.closest("tr")!.querySelectorAll("td")).map(cell => cell.textContent?.trim() ?? "");
      expect(cells.slice(2, 7)).toEqual(expected);
      expect(vendorLink.getAttribute("title")).toBe(name);
    }

    const table = screen.getByRole("table");
    expect(table.className).toContain("table-fixed");
    expect(table.className).toContain("min-w-[1120px]");
    expect(table.className).not.toContain("lg:min-w-0");
    expect(table.querySelector("thead th")?.className).toContain("sticky");
    expect(table.querySelector("thead th:last-child")?.className).toContain("whitespace-nowrap");

    const metricsGrid = screen.getByText("Linked vendors", { selector: "p" }).parentElement!.parentElement!;
    expect(metricsGrid.className).toContain("xl:grid-cols-4");
    for (const label of ["Payable now", "Coming up", "Total liability"]) {
      const labelNode = within(metricsGrid).getByText(label);
      const metric = labelNode.parentElement!;
      const value = metric.querySelector("p:nth-of-type(2)")!;
      const detail = metric.querySelector("p:nth-of-type(3)")!;
      expect(value.textContent).toMatch(/^₹[\d,]+\.\d{2}$/);
      expect(value.className).toContain("whitespace-nowrap");
      expect(value.className).not.toContain("truncate");
      expect(detail.className).not.toContain("truncate");
    }
    expect(within(metricsGrid).getByText("Approved bills")).toBeTruthy();
    expect(within(metricsGrid).getByText("Provisional bills")).toBeTruthy();
    expect(within(metricsGrid).getByText("Excludes unlinked")).toBeTruthy();
    expectNoTruncatedCurrency(container);
  });

  it("shows unlinked totals on their tab and keeps the excluded position visible on the linked tab", async () => {
    const { container } = mount();
    const notice = await screen.findByText(/23 unlinked bills/);
    expect(notice.parentElement?.textContent).toContain("₹2,84,691.90 balance");
    expect(notice.parentElement?.textContent).toContain("not included in the totals above");
    expect(notice.parentElement?.querySelector("a")?.getAttribute("href")).toContain("tab=unlinked");

    fireEvent.click(screen.getByRole("tab", { name: "Unlinked bills" }));
    await screen.findByText(/Masters → Vendors → Link Vendors → Pending Links/);
    expect(screen.getAllByText("₹3,11,761.90").length).toBeGreaterThan(0);
    expect(screen.getAllByText("₹27,070.00").length).toBeGreaterThan(0);
    expect(screen.getAllByText("₹2,84,691.90").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Unlinked").length).toBeGreaterThan(0);
    expect(screen.queryByText(/Link this bill/)).toBeNull();
    expectNoTruncatedCurrency(container);
  });

  it("keeps bill number, bill period, status tags, and return links separate in both ledgers", async () => {
    for (const route of [
      { path: "/reports/vendor-payables/vendor/4?dateFrom=2026-01-01&dateTo=2026-12-31", billNo: "HLC/VB/2026/0001", periodFrom: "04 Feb 2026", periodTo: "05 Feb 2026" },
      { path: "/reports/vendor-payables/unlinked/99?dateFrom=2026-01-01&dateTo=2026-12-31", billNo: "HLC/VB/2026/0099", periodFrom: "01 Oct 2026", periodTo: "31 Oct 2026" },
    ]) {
      cleanup();
      queryClient.clear();
      queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      setRoute(route.path);
      const { container } = mount();
      const billLink = await screen.findByRole("link", { name: route.billNo });
      const table = screen.getByRole("table");
      expect(table.className).toContain("min-w-[1240px]");
      expect(table.className).not.toContain("lg:min-w-0");
      expect(table.querySelector("colgroup col:nth-child(2)")?.getAttribute("style")).toContain("20%");
      const cells = Array.from(billLink.closest("tr")!.querySelectorAll("td"));
      expect(cells[1].className).toContain("whitespace-nowrap");
      expect(cells[2].className).toContain("whitespace-normal");
      expect(cells[2].textContent).toContain(route.periodFrom);
      expect(cells[2].textContent).toContain(route.periodTo);
      expect(cells[3].querySelector("div")?.className).toContain("flex-col");
      expectNoTruncatedCurrency(container);
    }
  });

  it("exports both sheets and includes the same unlinked count and totals as the tab", async () => {
    mount();
    await screen.findByRole("tab", { name: "Linked vendors" });
    fireEvent.click(screen.getByRole("button", { name: "Export Excel" }));

    await waitFor(() => expect(state.sheets).toHaveLength(2));
    expect(state.sheets.map(sheet => sheet.name)).toEqual(["Linked summary", "Unlinked bills"]);
    const exported = state.sheets[1].rows[0];
    expect(exported).toMatchObject({
      "Typed vendor name": "TOTAL — UNLINKED BILLS",
      "Bill count": 23,
    });
    expect(Number(exported.Net)).toBeCloseTo(311761.9, 2);
    expect(Number(exported.Paid)).toBeCloseTo(27070, 2);
    expect(Number(exported.Balance)).toBeCloseTo(284691.9, 2);
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
