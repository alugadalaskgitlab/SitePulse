// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EquipmentMasterType, SiteMaterialTrip } from "@shared/schema";
import { TripRoleEditDialog } from "./TripRoleEditDialog";
import { apiRequest, queryClient } from "@/lib/queryClient";

vi.mock("@/lib/queryClient", async () => {
  const { QueryClient } = await import("@tanstack/react-query");
  return { queryClient: new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } }), apiRequest: vi.fn() };
});
vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ sectionCan: () => true, isAdmin: true, isOwner: false }) }));
vi.mock("@/hooks/use-site-material-suggestions", () => ({ invalidateSiteMaterialSuggestions: vi.fn() }));
vi.mock("./ReceiptWorkContext", () => ({ ReceiptWorkContext: () => <div>Existing BOQ context</div> }));
vi.mock("./TripIdentityLinks", () => ({ TripIdentityLinks: () => <div>Exceptional vendor correction</div> }));
vi.mock("./TripHireLinkDialog", () => ({ TripHireLinkReview: () => <div>Exceptional vehicle correction</div> }));
vi.mock("@/hooks/use-trip-masters", () => ({
  useTripEquipmentMasters: () => ({
    master: { data: [{ id: 41, name: "Tipper", registrationNumber: "TS15UE4470", ownership: "hired", isActive: true }] },
    owners: { data: [{ id: 41, vendorId: 27, linkedVendorName: "G N Transport" }] },
  }),
}));
const vendors = [
  { id: 13, name: "Saravana", businessName: "SARAVANA METAL INDUSTRIES", isActive: true },
  { id: 27, name: "Gangaram Narsimulu", businessName: "G N Transport", isActive: true },
];
const original = {
  id: 71, date: "2026-08-17", time: "10:21", site: "NH-44", material: "Soil", quantity: 14, uom: "Cum",
  transportType: "agency_vendor", materialSourceType: "vendor", materialSourceSupplier: "Legacy source", materialSourceVendorId: null,
  supplier: "Legacy transporter", supplierVendorId: null, vehicleNumber: "OLD4470", internalEquipmentId: null,
} as SiteMaterialTrip;
const close = vi.fn();
function open(trip = original, confirmation: unknown = null) {
  queryClient.setQueryData([`/api/site-material-trips/${trip.id}/hire-link`], { trip, confirmation });
  return render(<QueryClientProvider client={queryClient}><TripRoleEditDialog trip={trip} vendors={vendors} equipment={[] as EquipmentMasterType[]} vendorsLoading={false} vendorsError={false} onRetryVendors={() => {}} onClose={close} /></QueryClientProvider>);
}
beforeEach(() => { vi.clearAllMocks(); vi.mocked(apiRequest).mockResolvedValue({ json: async () => ({ trip: original }) } as Response); });
afterEach(() => { cleanup(); queryClient.clear(); });
describe("ordinary historical trip Edit → Save", () => {
  it("opens directly in editable normal trip fields without confirmation UI", () => {
    open();
    expect((screen.getByLabelText("Date") as HTMLInputElement).value).toBe(original.date);
    expect(screen.getByRole("button", { name: "Save" })).toBeTruthy();
    expect(screen.queryByText("Exceptional vendor correction")).toBeNull();
    expect(screen.getByText(/Recorded \/ unselected value: Legacy source/)).toBeTruthy();
  });
  it("saves quantity in one PATCH without guessing legacy associations", async () => {
    open();
    fireEvent.change(screen.getByLabelText("Quantity"), { target: { value: "16.25" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(apiRequest).toHaveBeenCalledTimes(1));
    const payload = vi.mocked(apiRequest).mock.calls[0][2] as any;
    expect(payload).toMatchObject({ quantity: 16.25, supplierVendorId: null, materialSourceVendorId: null });
    expect(payload.masterSelection).toBeUndefined();
  });
  it("saves selected supplier, transporter and hired equipment together", async () => {
    open();
    fireEvent.change(screen.getByTestId("input-edit-trip-material-source-supplier"), { target: { value: "SARA" } });
    fireEvent.change(screen.getByRole("combobox", { name: /Material Supplier/ }), { target: { value: "13" } });
    fireEvent.change(screen.getByTestId("input-edit-trip-supplier"), { target: { value: "NARSI" } });
    fireEvent.change(screen.getByRole("combobox", { name: /Transporter/ }), { target: { value: "27" } });
    fireEvent.change(screen.getByRole("combobox", { name: "Vehicle / Tipper · Equipment Master" }), { target: { value: "41" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(apiRequest).toHaveBeenCalledTimes(1));
    const payload = vi.mocked(apiRequest).mock.calls[0][2] as any;
    expect(payload).toMatchObject({ supplierVendorId: 27, materialSourceVendorId: 13, internalEquipmentId: null, masterSelection: { equipmentId: 41 } });
    expect(payload.reason).toBeUndefined();
    expect(payload.fingerprint).toBeUndefined();
  });
  it("reopens linked evidence preselected and keeps its link on ordinary save", async () => {
    open({ ...original, materialSourceSupplier: "Saravana", materialSourceVendorId: 13, supplier: "Gangaram Narsimulu", supplierVendorId: 27, vehicleNumber: "TS15UE4470" }, { equipmentId: 41, valid: true });
    await waitFor(() => expect((screen.getByRole("combobox", { name: "Vehicle / Tipper · Equipment Master" }) as HTMLSelectElement).value).toBe("41"));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(apiRequest).toHaveBeenCalledTimes(1));
    expect((vi.mocked(apiRequest).mock.calls[0][2] as any).masterSelection).toBeUndefined();
  });
  it("retains exceptional authorised corrections separately", () => {
    open();
    fireEvent.click(screen.getByRole("button", { name: "Authorised identity corrections" }));
    expect(screen.getByText("Exceptional vendor correction")).toBeTruthy();
    expect(screen.getByText("Exceptional vehicle correction")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
  });
});
