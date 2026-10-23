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
    master: { data: [{ id: 30, name: "Tipper", registrationNumber: "TS15UF 4308", ownership: "hired", isActive: true }] },
    owners: { data: [{ id: 30, vendorId: 27, linkedVendorName: "G N Transport" }] },
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
  it("dismisses suggestions with Escape without closing the real Edit dialog", () => {
    open({ ...original, materialSourceSupplier: "Saravana" });
    const input = screen.getByRole("combobox", { name: /Material Supplier/ });
    input.focus();
    fireEvent.change(input, { target: { value: "SARA" } });
    expect(screen.getByRole("option", { name: "SARAVANA METAL INDUSTRIES" })).toBeTruthy();
    fireEvent.keyDown(input, { key: "Escape" });
    expect(close).not.toHaveBeenCalled();
    expect(screen.queryByRole("listbox")).toBeNull();
  });
  it("opens directly in editable normal trip fields without confirmation UI", () => {
    open();
    expect((screen.getByLabelText("Date") as HTMLInputElement).value).toBe(original.date);
    expect(screen.getByRole("button", { name: "Save" })).toBeTruthy();
    expect(screen.queryByText("Exceptional vendor correction")).toBeNull();
    expect((screen.getByRole("combobox", { name: /Material Supplier/ }) as HTMLInputElement).value).toBe("Legacy source");
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
    const matchedNamesTrip = { ...original, materialSourceSupplier: "Saravana", supplier: "Gangaram Narsimulu" } as SiteMaterialTrip;
    const view = open(matchedNamesTrip);
    fireEvent.change(screen.getByTestId("input-edit-trip-material-source-supplier"), { target: { value: "SARA" } });
    const supplierOption = screen.getByRole("option", { name: "SARAVANA METAL INDUSTRIES" });
    expect(screen.getByRole("dialog").contains(supplierOption)).toBe(true);
    fireEvent.click(supplierOption);
    fireEvent.change(screen.getByTestId("input-edit-trip-supplier"), { target: { value: "NARSI" } });
    fireEvent.keyDown(screen.getByRole("combobox", { name: /Transporter/ }), { key: "ArrowDown" });
    fireEvent.keyDown(screen.getByRole("combobox", { name: /Transporter/ }), { key: "Enter" });
    fireEvent.change(screen.getByRole("combobox", { name: /Vehicle \/ Tipper/ }), { target: { value: "4308" } });
    const vehicleOption = screen.getByRole("option", { name: /TS15UF 4308/ });
    fireEvent.pointerDown(vehicleOption, { pointerType: "touch" });
    fireEvent.pointerUp(vehicleOption, { pointerType: "touch" });
    fireEvent.click(vehicleOption);
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(apiRequest).toHaveBeenCalledTimes(1));
    const payload = vi.mocked(apiRequest).mock.calls[0][2] as any;
    expect(payload).toMatchObject({ supplierVendorId: 27, materialSourceVendorId: 13, internalEquipmentId: null, masterSelection: { equipmentId: 30 } });
    expect(payload.reason).toBeUndefined();
    expect(payload.fingerprint).toBeUndefined();
    view.unmount();
    open({ ...matchedNamesTrip, ...payload }, { equipmentId: payload.masterSelection.equipmentId, valid: true });
    expect((screen.getByRole("combobox", { name: /Material Supplier/ }) as HTMLInputElement).value).toBe("Saravana");
    expect((screen.getByRole("combobox", { name: /Transporter/ }) as HTMLInputElement).value).toBe("Gangaram Narsimulu");
    await waitFor(() => expect((screen.getByRole("combobox", { name: /Vehicle \/ Tipper/ }) as HTMLInputElement).value).toContain("TS15UF 4308"));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(apiRequest).toHaveBeenCalledTimes(2));
    expect(vi.mocked(apiRequest).mock.calls[1][2]).toMatchObject({ materialSourceVendorId: 13, supplierVendorId: 27 });
    expect((vi.mocked(apiRequest).mock.calls[1][2] as any).masterSelection).toBeUndefined();
  });
  it("reopens linked evidence preselected and keeps its link on ordinary save", async () => {
    open({ ...original, materialSourceSupplier: "Saravana", materialSourceVendorId: 13, supplier: "Gangaram Narsimulu", supplierVendorId: 27, vehicleNumber: "TS15UF 4308" }, { equipmentId: 30, valid: true });
    await waitFor(() => expect((screen.getByRole("combobox", { name: /Vehicle \/ Tipper/ }) as HTMLInputElement).value).toContain("TS15UF 4308"));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(apiRequest).toHaveBeenCalledTimes(1));
    expect((vi.mocked(apiRequest).mock.calls[0][2] as any).masterSelection).toBeUndefined();
  });
  it("discards unselected search text and preserves the exact recorded name without guessing an ID", async () => {
    const searches = ["Saravana", "UNKNOWN PARTY"];
    for (let index = 0; index < searches.length; index++) {
      const search = searches[index];
      const view = open();
      const input = screen.getByRole("combobox", { name: /Material Supplier/ });
      fireEvent.change(input, { target: { value: search } });
      fireEvent.blur(input);
      expect((input as HTMLInputElement).value).toBe("Legacy source");
      fireEvent.click(screen.getByRole("button", { name: "Save" }));
      await waitFor(() => expect(apiRequest).toHaveBeenCalledTimes(index + 1));
      const payload = vi.mocked(apiRequest).mock.calls[index][2] as any;
      expect(payload).toMatchObject({ materialSourceSupplier: "Legacy source", materialSourceVendorId: null });
      view.unmount();
    }
  });
  it("retains exceptional authorised corrections separately", () => {
    open();
    fireEvent.click(screen.getByRole("button", { name: "Authorised identity corrections" }));
    expect(screen.getByText("Exceptional vendor correction")).toBeTruthy();
    expect(screen.getByText("Exceptional vehicle correction")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
  });
});
