// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildTallyExportReadiness,
  defaultTallyVoucherMappings,
  emptyTallyComponentLedgerMappings,
} from "@shared/tallyExportReadiness";
import VendorTallyReadiness from "./VendorTallyReadiness";

const mockReport = buildTallyExportReadiness({
  config: {
    companyName: "High Lane Constructions Pvt Ltd - SK 2025-26",
    cutoverDate: "2026-01-31",
    projectCategory: "Projects",
    resourceCategory: "Resources",
    homeStateCode: null,
    voucherMappings: defaultTallyVoucherMappings,
    componentLedgerMappings: emptyTallyComponentLedgerMappings,
  },
  vendors: [{ id: 4, name: "Example Vendor", tallyLedgerName: null }],
  sites: [{ id: 8, name: "North Site", tallyCostCentreName: null }],
  hiredMachines: [],
  bills: [
    { id: 10, billNo: "POST-10", billDate: "2026-01-15", periodFrom: "2026-02-01", periodTo: "2026-02-01", status: "approved", vendorId: 4, siteId: 8 },
    { id: 11, billNo: "PRE-11", billDate: "2026-03-11", periodFrom: "2026-01-25", periodTo: "2026-01-30", status: "paid", vendorId: 4, siteId: 8 },
    { id: 12, billNo: "STRADDLE-12", billDate: "2026-03-11", periodFrom: "2026-01-25", periodTo: "2026-02-01", status: "approved", vendorId: 4, siteId: 8 },
    { id: 13, billNo: "NO-PERIOD-13", billDate: "2025-12-30", periodFrom: null, periodTo: null, status: "approved", vendorId: 4, siteId: 8 },
  ],
});
const readyMockReport = {
  ...buildTallyExportReadiness({
    config: {
      companyName: "High Lane Constructions Pvt Ltd - SK 2025-26",
      cutoverDate: "2026-01-31",
      projectCategory: "Projects",
      resourceCategory: "Resources",
      homeStateCode: "36",
      voucherMappings: defaultTallyVoucherMappings,
      componentLedgerMappings: emptyTallyComponentLedgerMappings,
    },
    vendors: [{ id: 4, name: "Example Vendor", tallyLedgerName: "VENDOR-TALLY" }],
    sites: [{ id: 8, name: "North Site", tallyCostCentreName: "NORTH-CC" }],
    hiredMachines: [],
    bills: [{
      id: 20,
      billNo: "POST-20",
      billDate: "2026-02-05",
      periodFrom: "2026-02-01",
      periodTo: "2026-02-04",
      status: "approved",
      vendorId: 4,
      siteId: 8,
    }],
  }),
  canConfirmMappings: false,
  canExportXml: true,
};

vi.mock("@/components/HubShell", () => ({
  HubShell: ({ children }: { children: any }) => <div>{children}</div>,
}));

vi.mock("wouter", () => ({
  Link: ({ href, children }: { href: string; children: any }) => <a href={href}>{children}</a>,
}));

describe("Vendor Tally Readiness page", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockReport,
    }));
  });

  afterEach(() => {
    cleanup();
    queryClient.clear();
    vi.unstubAllGlobals();
  });

  it("renders an explicit zero-ready report and all blockers when mappings are blank", async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <VendorTallyReadiness />
      </QueryClientProvider>,
    );

    const readiness = await screen.findByRole("region", { name: "Bill readiness" });
    expect((screen.getByRole("textbox", { name: "HLC home-state GST code" }) as HTMLInputElement).value).toBe("36");
    expect((screen.getByRole("textbox", { name: "Input GST — CGST ledger" }) as HTMLInputElement).value).toBe("ITC CGST");
    const readyLabel = within(readiness).getByText("Ready");
    expect(readyLabel.parentElement?.querySelector(".text-2xl")?.textContent).toBe("0");
    expect(within(readiness).getByText("Post-cutover").parentElement?.querySelector(".text-2xl")?.textContent).toBe("1");
    expect(within(readiness).getByText("Blocked").parentElement?.querySelector(".text-2xl")?.textContent).toBe("1");
    expect(within(readiness).getByText("Pre-cutover").parentElement?.querySelector(".text-2xl")?.textContent).toBe("1");
    expect(within(readiness).getByText("Straddles cutover").parentElement?.querySelector(".text-2xl")?.textContent).toBe("1");
    expect(within(readiness).getByText("Period not recorded").parentElement?.querySelector(".text-2xl")?.textContent).toBe("1");
    expect(await screen.findByText('Vendor "Example Vendor" has no Name in Tally.')).toBeTruthy();
    expect(screen.getByText('Site "North Site" has no Name in Tally.')).toBeTruthy();
    expect(screen.getByText(/PRE-11/)).toBeTruthy();
    expect(screen.getByText(/STRADDLE-12/)).toBeTruthy();
    expect(screen.getByText(/NO-PERIOD-13/)).toBeTruthy();
    expect(screen.getByText(/This is a review item, not a bill error/)).toBeTruthy();
    expect(screen.getByText(/These are review items, not bill errors/)).toBeTruthy();
    expect(screen.getByText(/The bill date is not used as a fallback/)).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("requires a per-bill not-already-in-Tally confirmation before enabling XML download", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async (url: string) => ({
      ok: true,
      json: async () => String(url).includes("tally-export-preview")
        ? {
          vouchers: [{
            billId: 20,
            billNo: "POST-20",
            billDate: "2026-02-05",
            vendorName: "Example Vendor",
            voucherType: "Purchase",
            netPayable: 100,
            debits: 100,
            credits: 100,
            entries: [],
          }],
          blocked: [],
          fileOnly: true,
          companyName: "High Lane Constructions Pvt Ltd - SK 2025-26",
        }
        : readyMockReport,
    })));

    render(
      <QueryClientProvider client={queryClient}>
        <VendorTallyReadiness />
      </QueryClientProvider>,
    );

    const billSelector = await screen.findByRole("checkbox", { name: /POST-20/ });
    fireEvent.click(billSelector);
    fireEvent.click(screen.getByRole("button", { name: "Preview selected bills" }));

    const confirmation = await screen.findByRole("checkbox", {
      name: /I verified bill POST-20 is not already in Tally/,
    });
    const downloadButton = screen.getByRole("button", { name: "Download confirmed XML" });
    expect((downloadButton as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(confirmation);
    expect((downloadButton as HTMLButtonElement).disabled).toBe(false);
  });

  it("saves the suggested home-state code when the Owner confirms mappings", async () => {
    const ownerReport = { ...mockReport, canConfirmMappings: true };
    const fetchMock = vi.fn().mockImplementation(async (url: string) =>
      url.includes("tally-posting-mappings")
        ? { ok: true }
        : { ok: true, json: async () => ownerReport },
    );
    vi.stubGlobal("fetch", fetchMock);

    render(
      <QueryClientProvider client={queryClient}>
        <VendorTallyReadiness />
      </QueryClientProvider>,
    );

    await screen.findByRole("button", { name: "Save confirmed mappings" });
    fireEvent.click(screen.getByRole("button", { name: "Save confirmed mappings" }));
    await waitFor(() => {
      const saveCall = fetchMock.mock.calls.find(([url]) => String(url).includes("tally-posting-mappings"));
      expect(saveCall).toBeDefined();
      expect(JSON.parse(String(saveCall?.[1]?.body)).homeStateCode).toBe("36");
    });
  });
});
