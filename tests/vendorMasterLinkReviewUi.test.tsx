// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import VendorMaster from "@/pages/VendorMaster";

const holder = vi.hoisted(() => ({ admin: true, request: vi.fn() }));
vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ isAdmin: holder.admin, isOwner: false }) }));
vi.mock("@/lib/queryClient", () => ({ apiRequest: holder.request }));

const vendors = [{ id: 12, name: "GANGARAM NARSIMHULU", isActive: true }];
const firstVehicle = {
  role: "equipment", name: "NARSIMULU", ids: [41], count: 1, registration: "TS15UE4470",
  linkedVendorId: 12, linkedVendorName: "GANGARAM NARSIMHULU", version: 91,
  suggestionId: null, hint: null, confirmedBy: "R. Kumar", confirmedAt: "2026-10-01T11:00:00Z",
};
let client: QueryClient;
let pending: any[];
let confirmed: any[];
let reads: string[];
function open() {
  render(<QueryClientProvider client={client}><VendorMaster /></QueryClientProvider>);
  fireEvent.click(screen.getByText("Link Vendors"));
}
beforeEach(() => {
  holder.admin = true; holder.request.mockReset();
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
afterEach(() => { cleanup(); client.clear(); });

describe("Vendor Master persisted link views", () => {
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
});
