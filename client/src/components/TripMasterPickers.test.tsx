// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { TripVendorPicker } from "./TripVendorPicker";
import { TripMasterVehicleField } from "./TripMasterVehicleField";
import type { TripRoleDraft } from "./TripTransportRoleFields";

vi.mock("@/hooks/use-trip-masters", () => ({
  useTripEquipmentMasters: () => ({
    master: { data: [
      { id: 41, name: "Tipper", equipmentType: "Tipper", registrationNumber: "TS15UE4470", ownership: "hired", isActive: true },
      { id: 42, name: "Tipper", registrationNumber: "TS15AB4470", ownership: "owned", isActive: true },
      { id: 43, name: "Inactive", registrationNumber: "TS15AB4470", ownership: "hired", isActive: false },
    ] },
    owners: { data: [{ id: 41, vendorId: 27, linkedVendorName: "G N Transport" }] },
  }),
}));
afterEach(cleanup);
const vendors = [
  { id: 13, name: "Saravana", businessName: "SARAVANA METAL INDUSTRIES", isActive: true },
  { id: 27, name: "Gangaram Narsimulu", businessName: "G N Transport", isActive: true },
];
function Vehicle({ selected = false }: { selected?: boolean }) {
  const [draft, setDraft] = useState<TripRoleDraft>({ materialSourceType: "own_source", materialSourceSupplier: "", supplier: selected ? "Saravana" : "", supplierVendorId: selected ? 13 : null, vehicleNumber: "LEGACY4470", internalEquipmentId: null });
  return <><TripMasterVehicleField value={draft} onChange={setDraft} onChoice={() => {}} choice="different_parties" vendors={vendors} allowOutside testIdPrefix="test" /><output data-testid="draft">{JSON.stringify(draft)}</output></>;
}
describe("Master pickers", () => {
  it("two-character substring search is native keyboard-selectable and shows business names", () => {
    const change = vi.fn();
    const { rerender } = render(<TripVendorPicker label="Material Supplier" name="S" vendors={vendors} onChange={change} />);
    expect(screen.queryByRole("option", { name: /SARAVANA METAL/ })).toBeNull();
    rerender(<TripVendorPicker label="Material Supplier" name="SARA" vendors={vendors} onChange={change} />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "13" } });
    expect(change).toHaveBeenCalledWith("Saravana", 13);
  });
  it("4470 finds all active registrations and no historical suggestion", () => {
    render(<Vehicle />);
    fireEvent.change(screen.getByTestId("input-test-vehicle-search"), { target: { value: "4470" } });
    expect(screen.getAllByRole("option")).toHaveLength(3);
    expect(screen.queryByRole("option", { name: /LEGACY|Inactive/ })).toBeNull();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "41" } });
    expect(JSON.parse(screen.getByTestId("draft").textContent!)).toMatchObject({ equipmentId: 41, supplierVendorId: 27, internalEquipmentId: null });
  });
  it("keeps different transporter and shows one concise mismatch warning", () => {
    render(<Vehicle selected />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "41" } });
    expect(JSON.parse(screen.getByTestId("draft").textContent!).supplierVendorId).toBe(13);
    expect(screen.getByText(/Transporter differs/).getAttribute("role")).toBe("status");
  });
  it("separates outside registration from Master results", () => {
    render(<Vehicle />);
    fireEvent.click(screen.getByRole("checkbox"));
    expect(screen.queryByRole("combobox")).toBeNull();
    fireEvent.change(screen.getByTestId("input-test-vehicle"), { target: { value: "OUTSIDE4470" } });
    expect(JSON.parse(screen.getByTestId("draft").textContent!)).toMatchObject({ equipmentId: null, vehicleManual: true, vehicleNumber: "OUTSIDE4470" });
  });
});
