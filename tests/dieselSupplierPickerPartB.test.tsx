// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { DieselSupplierPicker } from "../client/src/components/DieselSupplierPicker";

describe("DIESEL-PUR-01B fuel station / vendor picker", () => {
  it("shows Master matches first and keeps earlier purchase names typed", () => {
    const onChange = vi.fn();
    render(
      <PickerHarness onChange={onChange} />,
    );

    const input = screen.getByTestId("input-purchase-supplier");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "ur" } });

    const options = screen.getAllByRole("option");
    expect(options[0].textContent).toContain("Durga Fuels");
    expect(options[0].textContent).toContain("Master");
    expect(options[1].textContent).toContain("Durga Station");
    expect(options[1].textContent).toContain("Previous purchase");
    expect(screen.queryByText("Inactive Fuel")).toBeNull();

    fireEvent.click(options[0]);
    expect(onChange).toHaveBeenLastCalledWith("Durga Fuels", 1);

    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "ur" } });
    const previous = screen.getAllByRole("option").find((option) => option.textContent?.includes("Durga Station"));
    expect(previous).toBeTruthy();
    fireEvent.click(previous!);
    expect(onChange).toHaveBeenLastCalledWith("Durga Station", null);
  });
});

function PickerHarness({ onChange }: { onChange: (name: string, vendorId: number | null) => void }) {
  const [value, setValue] = useState("");
  const [vendorId, setVendorId] = useState<number | null>(null);
  return (
    <DieselSupplierPicker
      value={value}
      vendorId={vendorId}
      vendors={[
        { id: 1, name: "Durga Fuels", isActive: true },
        { id: 2, name: "Inactive Fuel", isActive: false },
      ]}
      aliases={[{ canonicalName: "Durga Fuels", alias: "Durga Petroleum" }]}
      previousNames={["Durga Station", "Kurnool Fuels"]}
      vendorsLoading={false}
      vendorsError={false}
      testId="input-purchase-supplier"
      onChange={(name, id) => {
        setValue(name);
        setVendorId(id);
        onChange(name, id);
      }}
    />
  );
}
