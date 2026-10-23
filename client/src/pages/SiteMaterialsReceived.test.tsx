// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SiteMaterialTrip } from "@shared/schema";
import SiteMaterialsReceived from "./SiteMaterialsReceived";
import { apiRequest, queryClient } from "@/lib/queryClient";

const auth = vi.hoisted(() => ({ edit: true, admin: true }));
const permission = vi.hoisted(() => ({
  currentStatus: "idle", hasActivePermission: false, activeRequest: null as null | { id: number; expiresAt: string },
  isLoading: false, isRequesting: false, consumePermission: vi.fn(), requestEditPermission: vi.fn(),
}));
vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({
  isAdmin: auth.admin, isOwner: false, sectionCan: () => auth.edit,
}) }));
vi.mock("@/hooks/useEditPermission", () => ({ useEditPermission: () => permission }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/lib/queryClient", async () => {
  const { QueryClient } = await import("@tanstack/react-query");
  return { queryClient: new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } }), apiRequest: vi.fn() };
});
vi.mock("@/hooks/use-site-material-suggestions", () => ({ invalidateSiteMaterialSuggestions: vi.fn() }));
vi.mock("@/components/AttachmentGallery", () => ({ AttachmentGallery: () => <div>Receipt photos</div> }));
vi.mock("@/components/AttachmentUploader", () => ({ AttachmentUploader: () => <div>Add Photo</div> }));
vi.mock("@/components/ReceiptWorkContext", () => ({
  ReceiptWorkContext: () => <div>Existing BOQ context</div>,
  TripWorkContextSummary: () => <div>Linked BOQ activity</div>,
}));
vi.mock("@/components/TripIdentityLinks", () => ({ TripIdentityLinks: () => <div>Identity history</div> }));
vi.mock("@/components/TripHireLinkDialog", () => ({ TripHireLinkReview: () => <div>Vehicle history</div> }));

const vendors = [
  { id: 13, name: "Saravana", businessName: "SARAVANA METAL INDUSTRIES", isActive: true },
  { id: 27, name: "Gangaram Narsimulu", businessName: "G N Transport", isActive: true },
];
const equipment = [{ id: 30, name: "Tipper", registrationNumber: "TS15UF 4308", ownership: "hired", isActive: true }];
const full = {
  id: 71, date: "2026-08-17", time: "10:21", site: "NH-44", material: "Soil", quantity: 14, uom: "Cum",
  transportType: "agency_vendor", materialSourceType: "vendor", materialSourceSupplier: "Legacy source", materialSourceVendorId: null,
  supplier: "Legacy transporter", supplierVendorId: null, vehicleNumber: "OLD4470", internalEquipmentId: null,
  location: "Km 17+200", enteredBy: "Ravi", notes: "Receipt preserved", receiptNumber: "R-714",
  boqProjectId: 5, boqItemId: 9, programmeBarId: 11, earthworkArrangementId: 12, unloadedAt: "yard", yardLabel: "North yard",
} as SiteMaterialTrip;
let canonical: SiteMaterialTrip;
let confirmation: null | { equipmentId: number; valid: boolean };
const reads = vi.fn();
function mount(projection: Record<string, unknown> = {}) {
  // Deliberately omit identities, transport mode and non-report trip fields.
  queryClient.setQueryData(["/api/materials-received"], [{
    id: full.id, source: "trip", site: full.site, date: full.date, material: full.material,
    quantity: full.quantity, uom: full.uom, supplier: full.supplier, ...projection,
  }]);
  queryClient.setQueryData(["/api/sites"], [{ id: 1, name: "NH-44", isActive: true }]);
  queryClient.setQueryData(["/api/materials/suppliers?includeMaterialSources=true"], []);
  queryClient.setQueryData(["/api/plant-module/equipment"], equipment);
  queryClient.setQueryData(["/api/site-material-trips/hired-vehicle-options"], [{ id: 30, vendorId: 27, linkedVendorName: "G N Transport" }]);
  queryClient.setQueryData(["/api/site-material-trips/vendor-options?site=NH-44"], vendors);
  queryClient.setDefaultOptions({ queries: {
    retry: false, staleTime: Infinity, queryFn: async ({ queryKey }) => {
      reads(queryKey[0]);
      if (queryKey[0] === "/api/site-material-trips?site=NH-44") return [canonical];
      if (queryKey[0] === "/api/site-material-trips/71/hire-link") return { trip: canonical, confirmation };
      if (String(queryKey[0]).includes("vendor-options")) return vendors;
      if (queryKey[0] === "/api/site-material-trips/hired-vehicle-options") return [{ id: 30, vendorId: 27, linkedVendorName: "G N Transport" }];
      if (String(queryKey[0]).startsWith("/api/materials-received")) return [{ ...canonical, source: "trip" }];
      return [];
    },
  } });
  return render(<QueryClientProvider client={queryClient}><SiteMaterialsReceived /></QueryClientProvider>);
}
async function edit() {
  fireEvent.click(screen.getByTestId("button-view-71"));
  fireEvent.click(screen.getByTestId("btn-admin-edit"));
  await screen.findByTestId("dialog-trip-roles");
}
beforeEach(() => {
  vi.clearAllMocks(); window.localStorage.clear(); window.history.replaceState({}, "", "/site/materials-received");
  auth.admin = true; auth.edit = true;
  permission.currentStatus = "idle"; permission.hasActivePermission = false; permission.activeRequest = null;
  canonical = { ...full }; confirmation = null;
  vi.mocked(apiRequest).mockImplementation(async (_method, _url, payload) => {
    const patch = payload as any;
    canonical = { ...canonical, ...patch };
    if (patch.masterSelection) confirmation = { equipmentId: patch.masterSelection.equipmentId, valid: true };
    return { json: async () => canonical } as Response;
  });
});
afterEach(() => { cleanup(); queryClient.clear(); });
describe("Materials Received → View → shared Edit", () => {
  it("loads the full canonical trip rather than editing a report projection", async () => {
    mount(); await edit();
    expect((screen.getByLabelText("Location / Chainage") as HTMLInputElement).value).toBe("Km 17+200");
    expect((screen.getByLabelText("Entered By") as HTMLInputElement).value).toBe("Ravi");
    expect((screen.getByLabelText("Receipt Number") as HTMLInputElement).value).toBe("R-714");
    expect(screen.getByText("Existing BOQ context")).toBeTruthy();
    expect(reads.mock.calls.filter(([key]) => key === "/api/site-material-trips?site=NH-44")).toHaveLength(1);
    expect(reads.mock.calls.some(([key]) => String(key).includes("vendor-options"))).toBe(false);
  });
  it("selects supplier, transporter and vehicle in the real modal, saves once, and reopens their IDs", async () => {
    canonical = { ...full, materialSourceSupplier: "Saravana", supplier: "Gangaram Narsimulu" };
    mount(); await edit();
    fireEvent.change(screen.getByRole("combobox", { name: /Material Supplier/ }), { target: { value: "SARA" } });
    const supplier = screen.getByRole("option", { name: "SARAVANA METAL INDUSTRIES" });
    expect(screen.getByTestId("dialog-trip-roles").contains(supplier)).toBe(true);
    fireEvent.click(supplier);
    fireEvent.change(screen.getByRole("combobox", { name: /Transporter/ }), { target: { value: "NARSI" } });
    fireEvent.click(screen.getByRole("option", { name: "G N Transport" }));
    fireEvent.change(screen.getByRole("combobox", { name: /Vehicle \/ Tipper/ }), { target: { value: "4308" } });
    fireEvent.click(screen.getByRole("option", { name: /TS15UF 4308/ }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(apiRequest).toHaveBeenCalledTimes(1));
    expect(apiRequest).toHaveBeenCalledWith("PATCH", "/api/site-material-trips/71", expect.objectContaining({
      materialSourceSupplier: "Saravana", supplier: "Gangaram Narsimulu",
      materialSourceVendorId: 13, supplierVendorId: 27, masterSelection: { equipmentId: 30 },
      location: full.location, enteredBy: full.enteredBy, receiptNumber: full.receiptNumber,
    }));
    expect((vi.mocked(apiRequest).mock.calls[0][2] as any).boqItemId).toBeUndefined();
    await screen.findByText("Material Entry — Soil");
    expect(screen.getByTestId("detail-material-source-supplier").textContent).toBe("Saravana");
    fireEvent.click(screen.getByTestId("btn-admin-edit"));
    await screen.findByTestId("dialog-trip-roles");
    await waitFor(() => expect((screen.getByRole("combobox", { name: /Material Supplier/ }) as HTMLInputElement).value).toBe("Saravana"));
    expect((screen.getByRole("combobox", { name: /Transporter/ }) as HTMLInputElement).value).toBe("Gangaram Narsimulu");
    await waitFor(() => expect((screen.getByRole("combobox", { name: /Vehicle \/ Tipper/ }) as HTMLInputElement).value).toContain("TS15UF 4308"));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(apiRequest).toHaveBeenCalledTimes(2));
    expect(vi.mocked(apiRequest).mock.calls[1][2]).toMatchObject({ materialSourceVendorId: 13, supplierVendorId: 27 });
    expect((vi.mocked(apiRequest).mock.calls[1][2] as any).masterSelection).toBeUndefined();
  });
  it("preserves Own Source and its label in an ordinary receipt correction", async () => {
    canonical = { ...full, materialSourceType: "own_source", materialSourceSupplier: null, materialSourceVendorId: null, materialSourceLabel: "Borrow pit 4" };
    mount({ materialSourceType: "own_source", materialSourceLabel: "Borrow pit 4" }); await edit();
    expect((screen.getByRole("radio", { name: "Own Source" }) as HTMLInputElement).checked).toBe(true);
    expect(screen.queryByRole("combobox", { name: /Material Supplier/ })).toBeNull();
    fireEvent.change(screen.getByLabelText("Quantity"), { target: { value: "16.25" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(apiRequest).toHaveBeenCalledTimes(1));
    expect(vi.mocked(apiRequest).mock.calls[0][2]).toMatchObject({ materialSourceType: "own_source", materialSourceLabel: "Borrow pit 4", materialSourceVendorId: null, quantity: 16.25 });
  });
  it("retains report filters, return navigation and receipt/photos after cancel", async () => {
    window.history.replaceState({}, "", "/site/materials-received?from=management-report&site=NH-44&material=Soil&returnTo=%2Fmanagement-report");
    queryClient.setQueryData(["/api/materials-received?site=NH-44&material=Soil"], [{ ...full, source: "trip" }]);
    mount(); const url = window.location.href; window.scrollY = 483;
    await edit(); fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await screen.findByText("Material Entry — Soil");
    expect(screen.getAllByText("Receipt photos").length).toBeGreaterThan(0);
    expect(screen.getByTestId("button-back").getAttribute("href")).toBe("/management-report");
    expect(screen.getByTestId("select-material-filter").textContent).toBe("Soil");
    expect(window.location.href).toBe(url); expect(window.scrollY).toBe(483);
    expect(apiRequest).not.toHaveBeenCalled();
  });
  it("lets a section editor without admin role use the same shared editor", async () => {
    auth.admin = false; mount(); await edit();
    expect(screen.getByRole("button", { name: "Save" })).toBeTruthy();
  });
  it("does not open an editor or save for an unapproved read-only user", () => {
    auth.admin = false; auth.edit = false; mount();
    fireEvent.click(screen.getByTestId("button-view-71"));
    expect(screen.queryByTestId("btn-admin-edit")).toBeNull();
    fireEvent.click(screen.getByTestId("btn-request-edit"));
    expect(screen.getByText("Request Edit Permission")).toBeTruthy();
    expect(screen.queryByTestId("dialog-trip-roles")).toBeNull();
    expect(apiRequest).not.toHaveBeenCalled();
  });
  it("keeps pending approvals locked", () => {
    auth.admin = false; auth.edit = false; permission.currentStatus = "pending"; mount();
    fireEvent.click(screen.getByTestId("button-view-71"));
    expect((screen.getByTestId("btn-edit-pending") as HTMLButtonElement).disabled).toBe(true);
    expect(apiRequest).not.toHaveBeenCalled();
  });
  it("does not consume an approved grant at open/cancel or bypass the server section guard", async () => {
    auth.admin = false; auth.edit = false; permission.hasActivePermission = true;
    permission.activeRequest = { id: 8, expiresAt: "2099-08-17T12:00:00Z" }; mount();
    fireEvent.click(screen.getByTestId("button-view-71"));
    fireEvent.click(screen.getByTestId("btn-edit-permitted"));
    await screen.findByText("Material Trip Details");
    expect(screen.getByLabelText("Quantity").matches(":disabled")).toBe(true);
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(permission.consumePermission).not.toHaveBeenCalled(); expect(apiRequest).not.toHaveBeenCalled();
  });
  it("retains the shared editor and error when PATCH validation rejects a save", async () => {
    vi.mocked(apiRequest).mockRejectedValue(new Error("Trip site and BOQ item do not match."));
    mount(); await edit(); fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByText("Trip site and BOQ item do not match.");
    expect(screen.getByTestId("dialog-trip-roles")).toBeTruthy();
    expect(apiRequest).toHaveBeenCalledTimes(1);
  });
  it("dismisses an expanded supplier menu with Escape without leaving the shared modal", async () => {
    mount(); await edit();
    const input = screen.getByRole("combobox", { name: /Material Supplier/ });
    input.focus(); fireEvent.change(input, { target: { value: "SARA" } });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(screen.getByTestId("dialog-trip-roles")).toBeTruthy();
    expect(apiRequest).not.toHaveBeenCalled();
  });
  it("keeps DPR and equipment receipt sources display-only", () => {
    mount({ source: "dpr" }); fireEvent.click(screen.getByTestId("button-view-71"));
    expect(screen.queryByTestId("btn-admin-edit")).toBeNull();
    expect(screen.queryByTestId("btn-request-edit")).toBeNull();
    expect(screen.queryByTestId("dialog-trip-roles")).toBeNull();
    expect(apiRequest).not.toHaveBeenCalled();
  });
  it("never falls back to editing the projection when the full trip cannot be found", async () => {
    mount();
    queryClient.setQueryData(["/api/site-material-trips?site=NH-44"], []);
    fireEvent.click(screen.getByTestId("button-view-71"));
    fireEvent.click(screen.getByTestId("btn-admin-edit"));
    expect(screen.getByRole("alert").textContent).toContain("no longer available");
    expect(screen.queryByTestId("dialog-trip-roles")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await screen.findByTestId("dialog-trip-roles");
    expect(apiRequest).not.toHaveBeenCalled();
  });
});
