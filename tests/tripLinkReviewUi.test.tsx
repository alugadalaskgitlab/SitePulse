// @vitest-environment jsdom
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TripRoleEditDialog } from "@/components/TripRoleEditDialog";
import { TripHireLinkReview } from "@/components/TripHireLinkDialog";
import { TripEquipmentPicker } from "@/components/TripEquipmentPicker";
import { TripTransportRoleFields, type TripRoleDraft } from "@/components/TripTransportRoleFields";
import type { SiteMaterialTrip } from "@shared/schema";

const holder = vi.hoisted(() => ({ canEdit: false, isAdmin: false, qc: null as any, request: vi.fn() }));
vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ sectionCan: () => holder.canEdit, isAdmin: holder.isAdmin, isOwner: false }),
}));
vi.mock("@/lib/queryClient", () => ({
  apiRequest: holder.request, get queryClient() { return holder.qc; },
}));
vi.mock("@/hooks/use-site-material-suggestions", async (importOriginal) => ({
  ...await importOriginal<Record<string, unknown>>(),
  useSiteMaterialSuggestions: () => ({ materialSourceSuppliers: [], suppliers: [], vehicles: [], error: null }),
  invalidateSiteMaterialSuggestions: vi.fn(),
}));
vi.mock("@/components/ReceiptWorkContext", () => ({ ReceiptWorkContext: () => <div>Work context</div> }));
vi.mock("@/hooks/use-trip-masters", () => ({
  useTripEquipmentMasters: () => ({ master: { data: equipment }, owners: { data: equipment } }),
}));

const vendors = [{ id: 11, name: "SARAVANA METAL INDUSTRIES", isActive: true }, { id: 12, name: "GANGARAM NARSIMHULU", isActive: true }];
const equipment = [{
  id: 41, name: "Tipper 07", equipmentType: "Tipper", registrationNumber: "TS15UE4470",
  vendorName: "NARSIMULU", vendorId: 12, linkedVendorName: "GANGARAM NARSIMHULU",
  ownership: "hired", isActive: true,
  hireBillingBasis: "daily", hireRate: 8731,
}];
const trip = {
  id: 737, date: "2026-10-01", site: "CHOUTUPPAL", material: "GSB", quantity: 184.5, uom: "CFT",
  materialSourceType: "vendor", materialSourceSupplier: "SARAVANA METAL INDUSTRIES", materialSourceVendorId: 11,
  supplier: "NARSIMULU", supplierVendorId: 12, vehicleNumber: "TS15UE4470",
  transportType: "agency_vendor", internalEquipmentId: null, materialSourceLabel: null,
} as SiteMaterialTrip;
let review: any;
function renderQuery(ui: React.ReactNode) {
  return render(<QueryClientProvider client={holder.qc}>{ui}</QueryClientProvider>);
}
function renderDetails(input = trip) {
  return renderQuery(<TripRoleEditDialog trip={input} vendors={vendors} equipment={[]} vendorsLoading={false}
    vendorsError={false} onRetryVendors={vi.fn()} onClose={vi.fn()} />);
}
beforeEach(() => {
  holder.canEdit = false; holder.isAdmin = false; holder.request.mockReset();
  review = {
    fingerprint: "before", version: 91, suggestedEquipmentId: 41, issue: null, equipment,
    trip: { ...trip, linkedTransporterName: "GANGARAM NARSIMHULU", linkedMaterialSupplierName: "SARAVANA METAL INDUSTRIES" },
    confirmation: { equipmentId: 41, actor: "R. Kumar", at: "2026-10-01T11:00:00Z", reason: "Owner checked", valid: true },
  };
  holder.qc = new QueryClient({ defaultOptions: {
    queries: { retry: false, queryFn: async () => review },
    mutations: { retry: false },
  } });
});
afterEach(() => { cleanup(); holder.qc.clear(); });

describe("one operational trip review", () => {
  it("opens one read-only ordinary form showing persisted master selections without reconfirming or exposing terms", async () => {
    renderDetails();
    await waitFor(() => expect(screen.getByLabelText("Vehicle / Tipper · Equipment Master")).toHaveValue("41"));
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(screen.getByTestId("input-edit-trip-material-source-supplier")).toHaveValue("SARAVANA METAL INDUSTRIES");
    expect(screen.getByTestId("input-edit-trip-supplier")).toHaveValue("GANGARAM NARSIMHULU");
    expect(screen.getByLabelText("Vehicle / Tipper · Equipment Master")).toBeDisabled();
    expect(screen.queryByText("Confirm vehicle link")).not.toBeInTheDocument();
    expect(screen.queryByText("Correct roles / work context")).not.toBeInTheDocument();
    expect(screen.queryByText("Confirm vendor links")).not.toBeInTheDocument();
    expect(document.body.textContent).not.toContain("8731");
    expect(document.body.textContent).not.toContain("daily");
    expect(holder.request).not.toHaveBeenCalled();
  });

  it("keeps a current link on reopening; an editor must explicitly choose Change link", async () => {
    holder.canEdit = true;
    const first = renderQuery(<TripHireLinkReview trip={trip} />);
    await screen.findByText("Vehicle Linked");
    expect(screen.queryByLabelText("Verification reason / reference")).not.toBeInTheDocument();
    first.unmount();
    renderQuery(<TripHireLinkReview trip={trip} />);
    const change = await screen.findByText("Change link");
    await waitFor(() => expect(change).not.toBeDisabled());
    fireEvent.click(change);
    fireEvent.change(screen.getByLabelText("Verification reason / reference"), { target: { value: "Reviewed registration and owner" } });
    holder.request.mockImplementation(async () => {
      review = { ...review, version: 92, confirmation: { ...review.confirmation, reason: "Reviewed registration and owner" } };
      return { json: async () => ({}) };
    });
    fireEvent.click(screen.getByText("Confirm vehicle link"));
    await waitFor(() => expect(holder.request).toHaveBeenCalledWith("POST", "/api/site-material-trips/737/hire-link", {
      equipmentId: 41, reason: "Reviewed registration and owner", acceptConflict: false, fingerprint: "before", version: 91,
    }));
    await waitFor(() => expect(screen.queryByText("Confirm vehicle link")).not.toBeInTheDocument());
    expect(screen.getByTestId("trip-hire-saved-result")).toHaveTextContent("Reviewed registration and owner");
  });

  it("admin confirms only IDs with expected previous IDs and keeps historical names intact", async () => {
    holder.canEdit = true; holder.isAdmin = true;
    const unlinked = { ...trip, supplierVendorId: null, materialSourceVendorId: null };
    review = { ...review, trip: unlinked, confirmation: null };
    holder.request.mockImplementation(async (_method, _url, body) => {
      const updated = { ...unlinked, supplierVendorId: body.supplierVendorId, materialSourceVendorId: body.materialSourceVendorId };
      review = { ...review, trip: updated };
      return { json: async () => updated };
    });
    renderDetails(unlinked);
    fireEvent.click(screen.getByText("Authorised identity corrections"));
    await screen.findByText("Vehicle Link Pending");
    await waitFor(() => expect(screen.getByLabelText("Transporter match · Vendor Master")).not.toBeDisabled());
    fireEvent.change(screen.getByLabelText("Material supplier match"), { target: { value: "SARA" } });
    fireEvent.change(screen.getByLabelText("Material supplier match · Vendor Master"), { target: { value: "11" } });
    fireEvent.change(screen.getByLabelText("Transporter match"), { target: { value: "GANG" } });
    fireEvent.change(screen.getByLabelText("Transporter match · Vendor Master"), { target: { value: "12" } });
    fireEvent.change(screen.getByLabelText("Vendor identity verification reason"), { target: { value: "Parties reviewed independently" } });
    fireEvent.click(screen.getByText("Confirm vendor links"));
    await waitFor(() => expect(holder.request).toHaveBeenCalledWith("POST", "/api/site-material-trips/737/identity-links", {
      supplierVendorId: 12, materialSourceVendorId: 11, expectedSupplierVendorId: null,
      expectedMaterialSourceVendorId: null, reason: "Parties reviewed independently",
      expectedSupplier: "NARSIMULU", expectedMaterialSourceSupplier: "SARAVANA METAL INDUSTRIES",
    }));
    await waitFor(() => expect(screen.getByText("Change vendor links")).toBeInTheDocument());
    expect(screen.getByTestId("trip-vendor-saved-results")).toHaveTextContent("NARSIMULU");
    expect(holder.request.mock.calls[0][2]).not.toHaveProperty("supplier");
    expect(holder.request.mock.calls[0][2]).not.toHaveProperty("vehicleNumber");
  });

  it("nonadmin editors save ordinary trip fields once and keep exceptional vendor confirmation separate", async () => {
    holder.canEdit = true;
    renderDetails();
    await waitFor(() => expect(screen.getByLabelText("Vehicle / Tipper · Equipment Master")).toHaveValue("41"));
    expect(screen.queryByText("Change vendor links")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Verification reason / reference")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Quantity"), { target: { value: "192.25" } });
    holder.request.mockImplementation(async (method, _url, body) => {
      if (method === "PATCH") {
        const updated = { ...trip, ...body };
        review = { ...review, trip: updated };
        return { json: async () => updated };
      }
      return { json: async () => ({}) };
    });
    fireEvent.click(screen.getByText("Save"));
    await waitFor(() => expect(holder.request).toHaveBeenCalledWith("PATCH", "/api/site-material-trips/737", expect.objectContaining({
      quantity: 192.25, supplier: "NARSIMULU", supplierVendorId: 12, vehicleNumber: "TS15UE4470",
    })));
    const patch = holder.request.mock.calls[0][2];
    expect(patch).not.toHaveProperty("masterSelection");
    expect(patch).not.toHaveProperty("fingerprint");
    expect(patch).not.toHaveProperty("reason");
    expect(holder.request).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByText("Authorised identity corrections"));
    expect(screen.queryByText("Confirm vendor links")).not.toBeInTheDocument();
  });
});

describe("new-entry selectors", () => {
  it("does not auto-select even a unique registration and supports searching with an outside fallback", () => {
    const onChange = vi.fn();
    render(<TripEquipmentPicker options={equipment} value="" onChange={onChange} registration="TS15UE4470" allowOutside />);
    expect(screen.getByLabelText("Equipment Master vehicle")).toHaveValue("");
    expect(screen.getByText(/Unique registration match/)).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Equipment Master · search registration"), { target: { value: "TS15UE9999" } });
    expect(screen.getByText(/No matching registration/)).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });
  it("supports a deliberate one-time transporter without creating a master or conflating material source", () => {
    function Draft() {
      const [value, setValue] = useState<TripRoleDraft>({ materialSourceType: "own_source", materialSourceLabel: "Borrow area",
        materialSourceSupplier: "", supplier: "", vehicleNumber: "", internalEquipmentId: null });
      return <><TripTransportRoleFields choice="different_parties" onChoice={vi.fn()} value={value} onChange={setValue}
        vendors={vendors} equipment={[]} sourceSuggestions={[]} supplierSuggestions={[]} vehicleSuggestions={[]} onRetryVendors={vi.fn()} allowManualParties />
        <output data-testid="draft">{JSON.stringify(value)}</output></>;
    }
    renderQuery(<Draft />);
    fireEvent.click(screen.getAllByLabelText("Other / Not in Master")[0]);
    fireEvent.change(screen.getByTestId("input-trip-supplier"), { target: { value: "Outside transporter" } });
    fireEvent.click(screen.getAllByLabelText("Other / Not in Master")[1]);
    fireEvent.change(screen.getByTestId("input-trip-vehicle"), { target: { value: "TS99AB1234" } });
    const draft = JSON.parse(screen.getByTestId("draft").textContent || "{}");
    expect(draft).toMatchObject({ supplierManual: true, supplierVendorId: null, supplier: "OUTSIDE TRANSPORTER",
      vehicleNumber: "TS99AB1234", materialSourceType: "own_source", materialSourceSupplier: "" });
    expect(screen.queryByLabelText("Transporter * · Vendor Master")).not.toBeInTheDocument();
    expect(holder.request).not.toHaveBeenCalled();
  });
});
