// @vitest-environment jsdom
import { afterEach, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { DieselTankDipSettings } from "@/components/DieselTankDipSettings";
import { equipmentTankDipSettingsSchema, type EquipmentTankDipSettings } from "@shared/equipmentTankDip";
import { insertEquipmentMasterSchema } from "@shared/schema";

afterEach(cleanup);

it("edits all optional master settings and retains them in the save schema", () => {
  function Form() {
    const [value, setValue] = useState<EquipmentTankDipSettings>({});
    return <><DieselTankDipSettings value={value} onChange={setValue} /><output>{JSON.stringify(value)}</output></>;
  }
  const view = render(<Form />);
  fireEvent.change(screen.getByLabelText("Litres per cm of dip"), { target: { value: "12.5" } });
  fireEvent.change(screen.getByLabelText("Outlet height from tank bottom (cm)"), { target: { value: "4" } });
  fireEvent.change(screen.getByLabelText("Tank capacity (L)"), { target: { value: "600" } });
  const settings = JSON.parse(view.container.querySelector("output")!.textContent!);
  expect(settings).toEqual({ dipLitersPerCm: 12.5, deadStockDepthCm: 4, tankCapacityLiters: 600 });
  const saved = insertEquipmentMasterSchema.parse({ name: "Fixture DG", meterType: "hour_meter", ...settings });
  expect(saved).toMatchObject(settings);
  fireEvent.change(screen.getByLabelText("Litres per cm of dip"), { target: { value: "" } });
  expect(JSON.parse(view.container.querySelector("output")!.textContent!).dipLitersPerCm).toBeNull();
});

it("accepts unset settings and rejects invalid calibration values", () => {
  expect(equipmentTankDipSettingsSchema.parse({})).toEqual({});
  for (const value of [0, -1, Infinity, NaN]) {
    expect(equipmentTankDipSettingsSchema.safeParse({ dipLitersPerCm: value }).success).toBe(false);
  }
  expect(equipmentTankDipSettingsSchema.safeParse({ deadStockDepthCm: 0 }).success).toBe(true);
});
