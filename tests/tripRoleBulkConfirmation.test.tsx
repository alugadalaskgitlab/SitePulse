// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { SiteMaterialTrip } from "@shared/schema";
import { TripRoleBulkConfirmation } from "../client/src/components/TripRoleBulkConfirmation";

function trip(id: number, overrides: Partial<SiteMaterialTrip> = {}): SiteMaterialTrip {
  return {
    id,
    site: "Site A",
    date: "2026-09-19",
    material: "Soil",
    materialSourceType: "vendor",
    materialSourceSupplier: "RAMESH MOHABATHPUR",
    materialSourceVendorId: 101,
    supplier: "G SANGANNA",
    supplierVendorId: 102,
    transportType: null,
    internalEquipmentId: null,
    vehicleNumber: `TS15UF${id}`,
    ...overrides,
  } as SiteMaterialTrip;
}

describe("trip role bulk confirmation", () => {
  it("previews a source/transporter group and confirms only after explicit approval", async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    render(<TripRoleBulkConfirmation trips={[
      trip(1, { date: "2026-09-18" }),
      trip(2, { date: "2026-09-19" }),
    ]} onConfirm={onConfirm} />);

    expect(screen.getByText("Confirm trip roles by source and transporter")).toBeTruthy();
    expect(screen.getByText("Different parties")).toBeTruthy();
    fireEvent.click(screen.getByTestId("button-review-trip-role-group-1"));
    expect(screen.getByRole("alertdialog")).toBeTruthy();
    expect(onConfirm).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Confirm this group" }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith({
      tripIds: [1, 2],
      role: "different_parties",
    }));
  });

  it("keeps conflicting vendor IDs out of bulk confirmation", () => {
    render(<TripRoleBulkConfirmation
      trips={[trip(3, {
        materialSourceSupplier: "SAME PARTY",
        materialSourceVendorId: 201,
        supplier: "SAME PARTY",
        supplierVendorId: 202,
      })]}
      onConfirm={vi.fn()}
    />);

    expect(screen.getByText(/Vendor IDs conflict with the recorded party names\./)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Review/ })).toBeNull();
  });
});
