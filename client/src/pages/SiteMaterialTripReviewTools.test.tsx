// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import type { SiteMaterialTrip } from "@shared/schema";
import { queryClient } from "@/lib/queryClient";
import { MaterialSourceBackfillPage, SourceTransportReviewPage, TripArrangementReviewPage } from "./SiteMaterialTripReviewTools";

const state = vi.hoisted(() => ({
  search: "dateFrom=2025-03-02&dateTo=2025-03-06&site=Sample%20Site&material=Gravel&returnTo=%2Fsite%2Fstock",
  canEdit: true,
  canVerify: false,
  request: vi.fn(),
}));
vi.mock("wouter", () => ({
  useSearch: () => state.search,
  useLocation: () => ["/site/material-trips/review/source-transport", vi.fn()],
  Link: ({ href, children, ...props }: any) => <a href={href} {...props}>{children}</a>,
}));
vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({
    sectionCan: (_section: string, action: string) => action === "edit" && state.canEdit,
    featureCan: (_section: string, action: string) => action === "verify" && state.canVerify,
  }),
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/lib/queryClient", async original => ({
  ...await original<object>(),
  apiRequest: state.request,
}));

const fixtureTrip = {
  id: 88, date: "2025-03-04", time: "09:20", site: "Sample Site", material: "Gravel", quantity: 8,
  uom: "CFT", receiptNumber: "TEST-REC-4", vehicleNumber: "AB-1234", supplier: "Carrier Example",
  supplierVendorId: 82, materialSourceSupplier: "Vendor Example", materialSourceVendorId: 41,
  transportType: "agency_vendor", internalEquipmentId: null,
} as SiteMaterialTrip;
const hired = { id: 501, name: "Test tipper", registrationNumber: "AB-1234", ownerVendorId: 82, linkedVendorName: "Carrier Example" };

function renderPage() {
  return render(<QueryClientProvider client={queryClient}><SourceTransportReviewPage /></QueryClientProvider>);
}

beforeEach(() => {
  state.search = "dateFrom=2025-03-02&dateTo=2025-03-06&site=Sample%20Site&material=Gravel&returnTo=%2Fsite%2Fstock";
  state.canEdit = true;
  state.canVerify = false;
  state.request.mockReset();
  queryClient.clear();
  queryClient.setDefaultOptions({ queries: { retry: false, queryFn: async ({ queryKey }) => {
    const key = String(queryKey[0]);
    if (key.startsWith("/api/site-material-trips?")) return [fixtureTrip];
    if (key === "/api/vendor-master" || key === "/api/plant-module/equipment") return [];
    if (key.startsWith("/api/site-material-trips/suggestions")) return { materialSourceSuppliers: ["Borrow label prior"] };
    return [];
  } }, mutations: { retry: false } });
  state.request.mockImplementation(async (method: string, url: string) => ({
    json: async () => url.endsWith("/preview")
      ? {
        rows: [{
          trip: fixtureTrip, currentRole: "unresolved", proposedEquipment: hired,
          equipmentChoices: [hired], ownedEquipmentChoices: [], bill: { billNo: "D-17", status: "draft" },
          fingerprint: "server-preview-fingerprint", agencyBlockedReason: null,
        }],
        excluded: [], sourcePlaceSuggestions: ["Borrow label from preview"],
      }
      : { updatedCount: 1 },
  }));
});
afterEach(() => { cleanup(); queryClient.clear(); });

describe("material trip review tools", () => {
  it("gates review tools to edit users and carries review filters and returnTo into tool navigation", () => {
    state.canEdit = false;
    const denied = render(<QueryClientProvider client={queryClient}><TripArrangementReviewPage /></QueryClientProvider>);
    expect(screen.getByText("Edit permission required")).toBeInTheDocument();
    denied.unmount();

    state.canEdit = true;
    renderPage();
    expect(screen.getByLabelText("From date")).toHaveValue("2025-03-02");
    expect(screen.getByLabelText("Site")).toHaveValue("Sample Site");
    expect(screen.getByRole("link", { name: /Back to trip review/ })).toHaveAttribute(
      "href", "/site/material-trips/review?dateFrom=2025-03-02&dateTo=2025-03-06&site=Sample%20Site&material=Gravel&returnTo=%2Fsite%2Fstock",
    );
    expect(screen.getByLabelText("Source-place label")).toHaveValue("");
  });

  it("turns daily-hire date and vehicle parameters into review filters", () => {
    state.search = "hireDate=2025-04-03&hireVehicle=AB-1234&site=Sample%20Site&returnTo=%2Fsite%2Fstock";
    renderPage();
    expect(screen.getByLabelText("From date")).toHaveValue("2025-04-03");
    expect(screen.getByLabelText("To date")).toHaveValue("2025-04-03");
    expect(screen.getByLabelText("Vehicle number")).toHaveValue("AB-1234");
  });

  it("uses preview bill status and server fingerprint, and applies once without per-trip PATCHes", async () => {
    renderPage();
    const tripCheck = await screen.findByRole("checkbox", { name: /Sample Site.*Gravel/ });
    fireEvent.click(tripCheck);
    fireEvent.click(screen.getByRole("button", { name: "Preview 1 selected trips" }));

    expect(await screen.findByText("On draft bill #D-17 — re-pull that bill's trips to update it")).toBeInTheDocument();
    expect(screen.getByText(/Proposed \/ selected vehicle: AB-1234/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Source-place label"), { target: { value: "Borrow label from preview" } });
    fireEvent.change(screen.getByLabelText(/Reason for this correction/), { target: { value: "Receipt and plant record checked" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply to 1 selected trip" }));

    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("1 trip updated"));
    expect(state.request).toHaveBeenCalledWith("POST", "/api/site-material-trips/source-transport/preview", { tripIds: [88] });
    const applyCall = state.request.mock.calls.find((call: unknown[]) => call[1] === "/api/site-material-trips/source-transport/apply");
    expect(applyCall?.[2]).toMatchObject({
      expectedFingerprints: { "88": "server-preview-fingerprint" },
      tripIds: [88],
      materialSource: { type: "own_source", label: "Borrow label from preview" },
      transport: { type: "agency_vendor" },
      equipmentByTripId: { "88": 501 },
    });
    expect(state.request.mock.calls.map((call: unknown[]) => call[0])).toEqual(["POST", "POST"]);
    expect(state.request.mock.calls.some((call: unknown[]) => call[0] === "PATCH")).toBe(false);
  });

  it("keeps server-matched hired vehicles when the trip transporter has no direct vendor ID", async () => {
    const aliasTrip = { ...fixtureTrip, supplierVendorId: null };
    state.request.mockImplementation(async (_method: string, url: string) => ({
      json: async () => url.endsWith("/preview")
        ? {
          rows: [{
            trip: aliasTrip, currentRole: "unresolved", proposedEquipment: hired,
            equipmentChoices: [hired], ownedEquipmentChoices: [], bill: null,
            fingerprint: "alias-preview", agencyBlockedReason: null,
          }],
          excluded: [],
        }
        : { updatedCount: 1 },
    }));
    renderPage();
    fireEvent.click(await screen.findByRole("checkbox", { name: /Sample Site.*Gravel/ }));
    fireEvent.click(screen.getByRole("button", { name: "Preview 1 selected trips" }));
    const equipmentSelect = await screen.findByLabelText("Hired vehicle link");
    expect(within(equipmentSelect).getByRole("option", { name: /AB-1234 · Carrier Example/ })).toBeInTheDocument();
  });

  it("shows approved-bill exclusions from the authoritative preview and offers no editable trip row", async () => {
    state.request.mockImplementationOnce(async () => ({
      json: async () => ({
        rows: [],
        excluded: [{ tripId: 88, billNo: "A-22", status: "approved" }],
      }),
    }));
    renderPage();
    fireEvent.click(await screen.findByRole("checkbox", { name: /Sample Site.*Gravel/ }));
    fireEvent.click(screen.getByRole("button", { name: "Preview 1 selected trips" }));
    expect(await screen.findByTestId("source-transport-excluded")).toHaveTextContent("Trip #88 excluded — approved bill #A-22");
    expect(screen.queryByTestId("source-transport-preview-88")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Apply to 0 selected trips" })).toBeDisabled();
  });

  it("previews the unchanged material-source backfill and requires confirmation before saving", async () => {
    const ownTrip = { ...fixtureTrip, id: 89, materialSourceType: "own_source", materialSourceLabel: "Pit A" };
    state.request.mockImplementation(async (method: string, url: string) => ({
      json: async () => method === "GET"
        ? [fixtureTrip, ownTrip]
        : url.endsWith("/material-source/bulk")
          ? { updatedCount: 1 }
          : { rows: [], excluded: [] },
    }));
    render(<QueryClientProvider client={queryClient}><MaterialSourceBackfillPage /></QueryClientProvider>);
    fireEvent.change(screen.getByLabelText("Material source / supplier"), { target: { value: "Borrow Vendor" } });
    fireEvent.click(screen.getByRole("button", { name: "Preview matching trips" }));
    expect(await screen.findByTestId("material-source-backfill-preview")).toHaveTextContent("1 matching trip");
    fireEvent.click(screen.getByRole("button", { name: "Assign source to 1 matching trip" }));
    expect(await screen.findByRole("alertdialog")).toHaveTextContent("Assign material source to 1 trips?");
    expect(state.request).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Assign 1 trips" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("1 trip updated"));
    expect(state.request).toHaveBeenCalledTimes(2);
    expect(state.request).toHaveBeenLastCalledWith("POST", "/api/site-material-trips/material-source/bulk", expect.objectContaining({
      site: "Sample Site",
      materialSourceSupplier: "Borrow Vendor",
    }));
  });
});
