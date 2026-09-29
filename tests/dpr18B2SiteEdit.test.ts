import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { withNewEquipmentWorkingDefault } from "../shared/equipmentUsage";

const source = readFileSync("client/src/pages/SiteEdit.tsx", "utf8");
const editor = source.slice(source.indexOf("const equipmentPickerSlot = ("), source.indexOf("return (\n            <div key={entry.editCreationKey", source.indexOf("const equipmentPickerSlot = (")));
const card = source.slice(source.indexOf("return (\n            <div key={entry.editCreationKey"), source.indexOf('data-testid={"equipment-row-" + idx}', source.indexOf("return (\n            <div key={entry.editCreationKey")) + 6000);

describe("DPR18 B2 SiteEdit equipment wiring", () => {
  it("places each existing editor in the intended compact group without rendering a second copy", () => {
    expect(editor).toContain("const equipmentPickerSlot = (");
    expect(editor).toContain("const ownerTypeSlot = (");
    expect(editor).toContain("const dieselSourceSlot = (");
    expect(editor).toContain("select-equipment-${idx}");
    expect(editor).toContain("select-entry-type-${idx}");
    expect(editor).toContain("input-operator-${idx}");
    for (const field of ["select-diesel-source", "input-fuel-station", "input-bill-number", "input-amount-paid",
      "input-equipment-trips", "input-equipment-trip-distance", "input-equipment-water-qty", "input-equipment-water-trips"]) {
      expect(editor).toContain(field);
    }
    expect(editor).not.toContain("text-equipment-owner");
    expect(card).toContain("equipmentPickerSlot={isVisibleEquipmentRow({ ...entry }) ? equipmentPickerSlot : undefined}");
    expect(card).toContain("{!isVisibleEquipmentRow({ ...entry }) && equipmentPickerSlot}");
    expect(card).toContain("ownerTypeSlot={ownerTypeSlot}");
    expect(card).toContain("dieselSourceSlot={dieselSourceSlot}");
    expect(card).toContain("stoppageSlot={stoppageSlot}");
    expect(editor.match(/<BreakdownStoppageEditor/g)).toHaveLength(1);
    expect(editor).toContain("value={entry.breakdowns ?? []}");
    expect(editor).toContain("draftOnly={isDraftMode}");
    expect(card).toContain("allowLinkedSourceEdit={isAdmin}");
    expect(card).toContain('enableTankContinuity={entry.dieselSource === "plant_stock"}');
    expect(editor).toContain("disabled={entry.plantUsageId != null && !isAdmin}");
  });

  it("defaults only new identified unlinked rows and never repairs hydrated historical nulls", () => {
    const row = { equipmentId: 12, usageStatus: null, persistedId: undefined, plantUsageId: null };
    expect(withNewEquipmentWorkingDefault(row, { isNew: true }).usageStatus).toBe("working");
    expect(withNewEquipmentWorkingDefault(row, { isNew: false }).usageStatus).toBeNull();
    expect(withNewEquipmentWorkingDefault({ ...row, persistedId: 4 }, { isNew: true }).usageStatus).toBeNull();
    expect(withNewEquipmentWorkingDefault({ ...row, plantUsageId: 15 }, { isNew: true }).usageStatus).toBeNull();
    expect(withNewEquipmentWorkingDefault({ ...row, equipmentId: null }, { isNew: true }).usageStatus).toBeNull();
    expect(withNewEquipmentWorkingDefault({ ...row, usageStatus: "breakdown" }, { isNew: true }).usageStatus).toBe("breakdown");
    expect(source).toContain("withNewEquipmentWorkingDefault(");
    expect(source).toContain("editCreationKey: newEntryKey()");
    expect(source).toContain("row.editCreationKey !== creationKey");
    expect(source).toContain("row.persistedId !== entry.persistedId");
    expect(source).toContain("(draft.equipment as EquipmentEntry[]).map(({ isNew: _isNew, editCreationKey: _key, ...row }) => row)");
    expect(source).toContain("equipment: equipment.map(({ isNew: _isNew, editCreationKey: _editCreationKey, ...row }) => row)");
    expect(source).toContain("editCreationKey: _editCreationKey,");
  });

  it("gives an equipment=[] draft fallback the same session provenance as Add Row, not hydrated records", () => {
    const mapped = source.slice(source.indexOf("const equipment: EquipmentEntry[] = dpr.equipment?.length"),
      source.indexOf("const labour: LabourEntry[]", source.indexOf("const equipment: EquipmentEntry[] = dpr.equipment?.length")));
    const [hydrated, fallback] = mapped.split("\n    : [{");
    expect(hydrated).toContain("usageStatus: e.usageStatus ?? null");
    expect(hydrated).not.toContain("isNew: true");
    expect(hydrated).not.toContain("editCreationKey:");
    expect(fallback).toContain("isNew: true, editCreationKey: newEntryKey()");
    expect(source).toContain("if (updated[idx].isNew && updated[idx].editCreationKey)");
    expect(source).toContain("withNewEquipmentWorkingDefault(");
    expect(source).toContain("{ isNew: true },");
    expect(source).toContain("editCreationKey: newEntryKey()");
    expect(withNewEquipmentWorkingDefault({ equipmentId: 12, usageStatus: null }, { isNew: true }).usageStatus).toBe("working");
    expect(withNewEquipmentWorkingDefault({ equipmentId: 12, usageStatus: null }, { isNew: false }).usageStatus).toBeNull();
  });

  it("keeps the established save paths, stoppage attachment upload, and version flow", () => {
    expect(source).toContain("prepareBreakdownAttachments");
    expect(source).toContain("normalizeSiteEditEquipmentPayload");
    expect(source).toContain("submitDraftMutation.mutate(payload)");
    expect(source).toContain("updateMutation.mutate(payload)");
  });
});