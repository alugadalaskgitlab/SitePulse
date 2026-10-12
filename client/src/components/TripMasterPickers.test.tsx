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
      { id: 30, name: "Tipper", equipmentType: "Tipper", registrationNumber: "TS15UF 4308", ownership: "hired", isActive: true },
      { id: 42, name: "Tipper", registrationNumber: "TS15AB4308", ownership: "owned", isActive: true },
      { id: 43, name: "Inactive", registrationNumber: "TS15AB4308", ownership: "hired", isActive: false },
    ] },
    owners: { data: [{ id: 30, vendorId: 27, linkedVendorName: "G N Transport" }] },
  }),
}));
afterEach(cleanup);
const vendors = [
  { id: 13, name: "Saravana", businessName: "SARAVANA METAL INDUSTRIES", isActive: true },
  { id: 27, name: "Gangaram Narsimulu", businessName: "G N Transport", isActive: true },
];
function Vendor({ label = "Material Supplier" }: { label?: string }) {
  const [value, setValue] = useState({ name: "Legacy supplier", id: null as number | null });
  return <><TripVendorPicker label={label} name={value.name} vendorId={value.id} vendors={vendors}
    onChange={(name, id) => setValue({ name, id })} />
    <output data-testid="vendor">{JSON.stringify(value)}</output></>;
}
function Vehicle({ selected = false }: { selected?: boolean }) {
  const [draft, setDraft] = useState<TripRoleDraft>({ materialSourceType: "own_source", materialSourceSupplier: "", supplier: selected ? "Saravana" : "", supplierVendorId: selected ? 13 : null, vehicleNumber: "LEGACY4308", internalEquipmentId: null });
  return <><TripMasterVehicleField value={draft} onChange={setDraft} onChoice={() => {}} choice="different_parties" vendors={vendors} allowOutside testIdPrefix="test" /><output data-testid="draft">{JSON.stringify(draft)}</output></>;
}
describe("Master comboboxes", () => {
  it.each(["Material Supplier", "Transporter"])("%s uses one editable input and searches Master and Business Name", label => {
    render(<Vendor label={label} />);
    const input = screen.getByRole("combobox", { name: label });
    expect((input as HTMLInputElement).value).toBe("Legacy supplier");
    expect(document.querySelector("select")).toBeNull();
    fireEvent.change(input, { target: { value: "S" } });
    expect(screen.queryByRole("listbox")).toBeNull();
    fireEvent.change(input, { target: { value: "SARA" } });
    fireEvent.click(screen.getByRole("option", { name: "SARAVANA METAL INDUSTRIES" }));
    expect((input as HTMLInputElement).value).toBe("SARAVANA METAL INDUSTRIES");
    expect(JSON.parse(screen.getByTestId("vendor").textContent!).id).toBe(13);
    fireEvent.change(input, { target: { value: "NARSI" } });
    expect(JSON.parse(screen.getByTestId("vendor").textContent!).id).toBeNull();
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(input.getAttribute("aria-activedescendant")).toBeTruthy();
    fireEvent.keyDown(input, { key: "Enter" });
    expect((input as HTMLInputElement).value).toBe("G N Transport");
    expect(JSON.parse(screen.getByTestId("vendor").textContent!).id).toBe(27);
    fireEvent.change(input, { target: { value: "METAL" } });
    expect(screen.getByRole("option", { name: "SARAVANA METAL INDUSTRIES" })).toBeTruthy();
  });
  it("handles ArrowUp, Escape, no matches and blur without silently selecting typed text", () => {
    render(<Vendor />);
    const input = screen.getByRole("combobox");
    fireEvent.change(input, { target: { value: "SARA" } });
    fireEvent.keyDown(input, { key: "ArrowUp" });
    expect(input.getAttribute("aria-activedescendant")).toBeTruthy();
    fireEvent.keyDown(input, { key: "Escape" });
    expect(screen.queryByRole("listbox")).toBeNull();
    fireEvent.change(input, { target: { value: "UNKNOWN" } });
    expect(screen.getByText("No active Master match.")).toBeTruthy();
    fireEvent.blur(input);
    expect(screen.queryByText("No active Master match.")).toBeNull();
    expect(JSON.parse(screen.getByTestId("vendor").textContent!).id).toBeNull();
  });
  it("4308 finds active registration substrings; touch selection stores the ID and typing clears it", () => {
    render(<Vehicle />);
    const input = screen.getByRole("combobox");
    fireEvent.change(input, { target: { value: "4308" } });
    expect(screen.getAllByRole("option")).toHaveLength(2);
    expect(screen.queryByRole("option", { name: /LEGACY|Inactive/ })).toBeNull();
    const option = screen.getByRole("option", { name: /TS15UF 4308.*Hired.*G N Transport/ });
    fireEvent.pointerDown(option, { pointerType: "touch" });
    fireEvent.pointerUp(option, { pointerType: "touch" });
    fireEvent.click(option);
    expect(JSON.parse(screen.getByTestId("draft").textContent!)).toMatchObject({ equipmentId: 30, supplierVendorId: 27, internalEquipmentId: null });
    fireEvent.change(input, { target: { value: "4308" } });
    expect(JSON.parse(screen.getByTestId("draft").textContent!)).toMatchObject({ equipmentId: null, internalEquipmentId: null });
  });
  it("keeps different transporter and shows one concise mismatch warning", () => {
    render(<Vehicle selected />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "4308" } });
    fireEvent.click(screen.getByRole("option", { name: /TS15UF 4308/ }));
    expect(JSON.parse(screen.getByTestId("draft").textContent!).supplierVendorId).toBe(13);
    expect(screen.getByText(/Transporter differs/).getAttribute("role")).toBe("status");
  });
  it("separates outside registration from Master results", () => {
    render(<Vehicle />);
    fireEvent.click(screen.getByRole("checkbox"));
    expect(screen.queryByRole("combobox")).toBeNull();
    fireEvent.change(screen.getByTestId("input-test-vehicle"), { target: { value: "OUTSIDE4308" } });
    expect(JSON.parse(screen.getByTestId("draft").textContent!)).toMatchObject({ equipmentId: null, vehicleManual: true, vehicleNumber: "OUTSIDE4308" });
  });
});
