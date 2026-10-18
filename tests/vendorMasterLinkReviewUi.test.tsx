// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import VendorMaster from "@/pages/VendorMaster";

const holder = vi.hoisted(() => ({ admin: true, request: vi.fn() }));
vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ isAdmin: holder.admin, isOwner: false }) }));
vi.mock("@/lib/queryClient", () => ({ apiRequest: holder.request }));

const vendors = [
  { id: 12, name: "GANGARAM NARSIMHULU", businessName: "Ganga Civil Supplies", gstNumber: "29GANGA0012", contactPhone: "9876543210", isActive: true },
  { id: 15, name: "ALPHA BUILDERS", businessName: "Alpha Aggregates", gstNumber: "29ALPHA0015", contactPhone: "9876543215", isActive: true },
  { id: 20, name: "BETA TRANSPORT", businessName: "Beta Haulage", gstNumber: "29BETA0020", contactPhone: "9876543220", isActive: true },
];
const billProposals = [
  { role: "bills", name: "Visible One", ids: [201], count: 1, hint: null, suggestionId: null },
  { role: "bills", name: "Visible Two", ids: [202], count: 1, hint: null, suggestionId: null },
  { role: "bills", name: "Visible Three", ids: [203], count: 1, hint: null, suggestionId: null },
  { role: "bills", name: "Hidden Fourth", ids: [204], count: 1, hint: null, suggestionId: null },
];
const firstVehicle = {
  role: "equipment", name: "NARSIMULU", ids: [41], count: 1, registration: "TS15UE4470",
  linkedVendorId: 12, linkedVendorName: "GANGARAM NARSIMHULU", version: 91,
  suggestionId: null, hint: null, confirmedBy: "R. Kumar", confirmedAt: "2026-10-01T11:00:00Z",
};
let client: QueryClient;
let pending: any[];
let confirmed: any[];
let reads: string[];
const billRows = [201, 202, 203, 204].map((id, index) => ({
  id, billType: "material", status: "approved", totalAmount: (index + 1) * 1000,
  netPayableAmount: (index + 1) * 1000, amountPaid: 0, items: [{ amount: (index + 1) * 1000, category: "material" }],
}));
function open() {
  render(<QueryClientProvider client={client}><VendorMaster /></QueryClientProvider>);
  fireEvent.click(screen.getByText("Link Vendors"));
}
beforeEach(() => {
  holder.admin = true; holder.request.mockReset();
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => billRows })));
  reads = [];
  pending = [{ ...firstVehicle, linkedVendorId: null, linkedVendorName: null, confirmedBy: null, confirmedAt: null, suggestionId: 12 }];
  confirmed = [firstVehicle, { ...firstVehicle, ids: [42], registration: "TS15UE4471", name: "G NARSIMHULU" }];
  client = new QueryClient({ defaultOptions: { queries: { retry: false, queryFn: async ({ queryKey }) => {
    const url = String(queryKey[0]); reads.push(url);
    if (url === "/api/vendor-master") return vendors;
    if (url.endsWith("status=pending")) return pending;
    if (url.endsWith("status=confirmed")) return confirmed;
    throw new Error(`Unexpected query: ${url}`);
  } } } });
});
afterEach(() => { cleanup(); client.clear(); vi.unstubAllGlobals(); });

describe("Vendor Master persisted link views", () => {
  it("searches master records by name, business, GST, and phone while sorting and counting results", async () => {
    render(<QueryClientProvider client={client}><VendorMaster /></QueryClientProvider>);
    const alpha = await screen.findByText("ALPHA BUILDERS");
    const beta = screen.getByText("BETA TRANSPORT");
    const gangaram = screen.getByText("GANGARAM NARSIMHULU");
    expect(alpha.compareDocumentPosition(beta) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(beta.compareDocumentPosition(gangaram) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByText("Showing 3 vendors")).toBeInTheDocument();

    const search = screen.getByLabelText("Search vendors");
    fireEvent.change(search, { target: { value: "haulage" } });
    expect(screen.getByText("BETA TRANSPORT")).toBeInTheDocument();
    expect(screen.queryByText("ALPHA BUILDERS")).not.toBeInTheDocument();
    expect(screen.getByText("Showing 1 of 3 vendors")).toBeInTheDocument();

    fireEvent.change(search, { target: { value: "29ALPHA0015" } });
    expect(screen.getByText("ALPHA BUILDERS")).toBeInTheDocument();
    expect(screen.queryByText("BETA TRANSPORT")).not.toBeInTheDocument();
    fireEvent.change(search, { target: { value: "beta transport" } });
    expect(screen.getByText("BETA TRANSPORT")).toBeInTheDocument();
    expect(screen.queryByText("ALPHA BUILDERS")).not.toBeInTheDocument();
    fireEvent.change(search, { target: { value: "9876543210" } });
    expect(screen.getByText("GANGARAM NARSIMHULU")).toBeInTheDocument();
    fireEvent.change(search, { target: { value: "missing vendor" } });
    expect(screen.getByText("Showing 0 of 3 vendors")).toBeInTheDocument();
    expect(screen.getByText("No vendors match “missing vendor”.")).toBeInTheDocument();
  });

  it("defaults to Pending Links and moves a successful confirmation out of pending after refreshing", async () => {
    holder.request.mockImplementation(async () => { pending = []; return { json: async () => ({}) }; });
    open();
    expect(screen.getByText("Pending Links")).toHaveAttribute("aria-pressed", "true");
    expect(await screen.findByText("NARSIMULU")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Verification reason TS15UE4470"), { target: { value: "Owner verified" } });
    fireEvent.click(screen.getByText("Confirm link"));
    await waitFor(() => expect(holder.request).toHaveBeenCalledWith("POST", "/api/vendor-master/review/confirm", expect.objectContaining({
      role: "equipment", ids: [41], vendorId: 12, version: 91, reason: "Owner verified",
    })));
    await screen.findByText("No vendor identities need review");
    fireEvent.click(screen.getByText("Confirmed Links"));
    expect(await screen.findByText("TS15UE4470")).toBeInTheDocument();
    expect(screen.queryByText("Confirm link")).not.toBeInTheDocument();
    expect(reads).toContain("/api/vendor-master/review?status=pending");
    expect(reads).toContain("/api/vendor-master/review?status=confirmed");
  });

  it("keeps several vehicles linked to one party, locally searchable by canonical vendor and registration", async () => {
    open();
    fireEvent.click(screen.getByText("Confirmed Links"));
    await screen.findByText("TS15UE4471");
    expect(screen.getAllByText("Vendor Master: GANGARAM NARSIMHULU")).toHaveLength(2);
    const count = reads.filter(url => url.endsWith("status=confirmed")).length;
    fireEvent.change(screen.getByLabelText("Search vendor or registration"), { target: { value: "TS15UE4470" } });
    expect(screen.getByText("TS15UE4470")).toBeInTheDocument();
    expect(screen.queryByText("TS15UE4471")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Search vendor or registration"), { target: { value: "GANGARAM NARSIMHULU" } });
    expect(screen.getByText("TS15UE4471")).toBeInTheDocument();
    expect(reads.filter(url => url.endsWith("status=confirmed"))).toHaveLength(count);
    expect(screen.getAllByText(/Confirmed by R. Kumar/)).toHaveLength(2);
    expect(holder.request).not.toHaveBeenCalled();
  });

  it("keeps both pending and confirmed Vendor Master reviews restricted to Administrator / Owner", async () => {
    holder.admin = false;
    open();
    expect(screen.getByText(/Only Administrator \/ Owner reviewers/)).toBeInTheDocument();
    expect(screen.queryByText("Pending Links")).not.toBeInTheDocument();
    expect(screen.queryByText("Confirmed Links")).not.toBeInTheDocument();
    expect(screen.queryByText("Confirm link")).not.toBeInTheDocument();
    expect(screen.queryByText("Create new")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Verification reason TS15UE4470")).not.toBeInTheDocument();
    expect(reads).not.toContain("/api/vendor-master/review?status=pending");
    expect(reads).not.toContain("/api/vendor-master/review?status=confirmed");
    expect(holder.request).not.toHaveBeenCalled();
  });

  it("prefills both editable name fields for a single create-and-link dialog", async () => {
    pending = [{ role: "bills", name: "Typed Bill Co", ids: [201], count: 1, hint: null, suggestionId: null }];
    holder.request.mockResolvedValue({ json: async () => ({}) });
    open();
    fireEvent.change(await screen.findByLabelText("Filter vendor links by role"), { target: { value: "bills" } });
    fireEvent.click(await screen.findByText("Create new"));
    const displayName = screen.getByLabelText("Display name *") as HTMLInputElement;
    const businessName = screen.getByLabelText("Business name") as HTMLInputElement;
    expect(displayName).toHaveValue("Typed Bill Co");
    expect(businessName).toHaveValue("Typed Bill Co");
    fireEvent.change(businessName, { target: { value: "Editable business name" } });
    expect(businessName).toHaveValue("Editable business name");
    expect(displayName).toHaveValue("Typed Bill Co");
    fireEvent.click(screen.getByText("Save vendor"));
    await waitFor(() => expect(holder.request).toHaveBeenCalledWith("POST", "/api/vendor-master/review/confirm", expect.objectContaining({
      newVendor: expect.objectContaining({ name: "Typed Bill Co", businessName: "Editable business name" }),
    })));
  });

  it("filters by role and search, previews bill totals, and sends one sequential confirm request per visible proposal", async () => {
    pending = [...billProposals, { ...firstVehicle, role: "equipment", ids: [41] }];
    const calls: string[] = [];
    holder.request.mockImplementation(async (_method: string, _url: string, body: any) => {
      calls.push(body.name);
      return { json: async () => ({}) };
    });
    open();
    const role = await screen.findByLabelText("Filter vendor links by role");
    expect(Array.from((role as HTMLSelectElement).options).map(option => option.text)).toContain("Vendor bills (4)");
    fireEvent.change(role, { target: { value: "bills" } });
    fireEvent.change(screen.getByLabelText("Search vendor or registration"), { target: { value: "Visible" } });
    expect(await screen.findByText("Visible Three")).toBeInTheDocument();
    expect(screen.queryByText("Hidden Fourth")).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Select all visible proposals"));
    expect(await screen.findByText(/Billed total: ₹1,000\.00/)).toBeInTheDocument();
    expect(screen.getByText(/Billed total: ₹2,000\.00/)).toBeInTheDocument();
    expect(screen.getByText(/Billed total: ₹3,000\.00/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Create master and link" }));
    await screen.findByText(/All selected proposals were processed/);
    expect(calls).toEqual(["Visible One", "Visible Two", "Visible Three"]);
    expect(holder.request).toHaveBeenCalledTimes(3);
    for (const proposal of billProposals.slice(0, 3)) {
      expect(holder.request).toHaveBeenCalledWith("POST", "/api/vendor-master/review/confirm", expect.objectContaining({
        role: "bills", name: proposal.name, ids: proposal.ids,
        newVendor: expect.objectContaining({ name: proposal.name, businessName: proposal.name }),
      }));
    }
    expect(holder.request.mock.calls.map(call => call[1])).toEqual(Array(3).fill("/api/vendor-master/review/confirm"));
  });

  it("stops a stale multi-proposal run and reports completed, failed, and untouched proposals", async () => {
    pending = billProposals.slice(0, 3);
    holder.request
      .mockResolvedValueOnce({ json: async () => ({}) })
      .mockRejectedValueOnce(new Error('409: {"message":"Review is stale. Refresh proposals and confirm again."}'));
    open();
    fireEvent.change(await screen.findByLabelText("Filter vendor links by role"), { target: { value: "bills" } });
    fireEvent.click(screen.getByLabelText("Select all visible proposals"));
    fireEvent.click(screen.getByRole("button", { name: "Create master and link" }));
    const result = await screen.findByRole("alert");
    expect(result).toHaveTextContent("Created and linked: Visible One (1 record).");
    expect(result).toHaveTextContent("Failed: Visible Two — Review is stale. Refresh proposals and confirm again.");
    expect(result).toHaveTextContent("Not attempted: Visible Three.");
    expect(holder.request).toHaveBeenCalledTimes(2);
  });

  it("excludes suggested masters from select-all, names the suggestion, and keeps near-duplicate names separate", async () => {
    pending = [
      { role: "bills", name: "Co. Ltd.", ids: [211], count: 1, hint: null, suggestionId: null },
      { role: "bills", name: "CO LTD", ids: [212], count: 1, hint: null, suggestionId: 12 },
      { role: "bills", name: "Unmatched", ids: [213], count: 1, hint: null, suggestionId: null },
    ];
    open();
    fireEvent.change(await screen.findByLabelText("Filter vendor links by role"), { target: { value: "bills" } });
    expect(await screen.findByText(/Similar typed names are grouped for review only/)).toBeInTheDocument();
    expect(screen.getByText(/not merged: Co\. Ltd\. · CO LTD/)).toBeInTheDocument();
    expect(screen.getByText(/Suggested existing master: GANGARAM NARSIMHULU/)).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Select all visible proposals"));
    expect(screen.getByLabelText("Select Co. Ltd.")).toBeChecked();
    expect(screen.getByLabelText("Select CO LTD")).not.toBeChecked();
    expect(screen.getByLabelText("Select Unmatched")).toBeChecked();
    expect(screen.getByLabelText("Select all visible proposals")).toBeChecked();
  });

  it("refuses HLC/self/own placeholder proposals rather than offering creation", async () => {
    pending = [{ role: "bills", name: "HLC", ids: [214], count: 1, hint: null, suggestionId: null }];
    open();
    fireEvent.change(await screen.findByLabelText("Filter vendor links by role"), { target: { value: "bills" } });
    expect(await screen.findByText("Not eligible: HLC/self/own placeholder names cannot be added to the Vendor Master.")).toBeInTheDocument();
    expect(screen.getByText("Creation refused")).toBeInTheDocument();
    expect(screen.getByLabelText("Select HLC")).toBeDisabled();
    expect(screen.queryByText("Create new")).not.toBeInTheDocument();
    expect(holder.request).not.toHaveBeenCalled();
  });
});
