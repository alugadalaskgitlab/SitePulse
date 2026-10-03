import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { withNewEquipmentWorkingDefault } from "../shared/equipmentUsage";

const siteEntry = readFileSync(new URL("../client/src/pages/SiteEntry.tsx", import.meta.url), "utf8");

describe("DPR18 B2 SiteEntry equipment integration", () => {
  it("wires the real equipment controls into each of the four compact slots", () => {
    expect(siteEntry).toContain("equipmentPickerSlot={equipmentPicker}");
    expect(siteEntry).toContain("ownerTypeSlot={ownerType}");
    expect(siteEntry).toContain("dieselSourceSlot={dieselSource}");
    expect(siteEntry).toMatch(/stoppageSlot=\{<BreakdownStoppageEditor usageStatus=\{entry.usageStatus\} draftOnly=\{!!sectionEditor\}/);
    expect(siteEntry).toContain("testId={`equipment-breakdown-${idx}`}");
    expect(siteEntry).toContain("!isVisibleEquipmentRow({ ...entry }) && equipmentPicker");
    expect(siteEntry).toContain("showTankBalance={false}");
    expect(siteEntry).toContain("requireConfirmationForConsumption={!!sectionEditor}");
    expect(siteEntry).toContain("enableTankContinuity={entry.dieselSource === \"plant_stock\"}");
    expect(siteEntry).not.toContain("Edit_Usage_Details");
    expect(siteEntry).toContain("disabled={entry.plantUsageId != null}");
    expect(siteEntry).toContain("...(updated[rowIdx][autoWorkingStatus] ? { usageStatus: null");
    expect(siteEntry).toContain('setEquipment(data.equipment.map(row => ({ ...row, [equipmentRowToken]: Symbol("equipment row") })))');
    expect(siteEntry).toContain("rows.filter((_, i) => i !== index)");
    expect(siteEntry).toContain("const rowToken = entry[equipmentRowToken]");
    expect(siteEntry).toContain("fetchOpenPlantRecord(selected.id, idx, rowToken)");
  });

  it("keeps provenance in a JSON-excluded symbol across spreads and row deletion", () => {
    const newRow = Symbol("new row");
    const rows = [{ machine: "Existing", usageStatus: null as string | null },
      { [newRow]: true, machine: "" }, { [newRow]: true, machine: "" }];
    const afterDelete = rows.filter((_, index) => index !== 1);
    const selected = { ...afterDelete[1], machine: "WATER TANKER" };
    const defaulted = withNewEquipmentWorkingDefault(selected, { isNew: selected[newRow] === true });
    expect(defaulted.usageStatus).toBe("working");
    expect(JSON.stringify(defaulted)).not.toContain("new row");
    expect(afterDelete[0].usageStatus).toBeNull();
    const hydrated = JSON.parse(JSON.stringify({ ...defaulted, usageStatus: null }));
    expect(withNewEquipmentWorkingDefault(hydrated, { isNew: hydrated[newRow] === true }).usageStatus).toBeNull();
  });

  it("never fills an existing, linked, or hydrated unspecified status", () => {
    for (const row of [
      { machine: "Roller", usageStatus: null },
      { machine: "Roller", plantUsageId: 7, usageStatus: null },
      { machine: "Roller", id: 31, usageStatus: null },
    ]) {
      const result = withNewEquipmentWorkingDefault(row, { isNew: row.id == null && row.plantUsageId == null && false });
      expect(result.usageStatus).toBeNull();
    }
    expect(withNewEquipmentWorkingDefault({ machine: "Roller", plantUsageId: 7, usageStatus: null }, { isNew: true }).usageStatus).toBeNull();
  });

  it("guards both asynchronous link and prior-closing callbacks against same-machine index reuse", () => {
    const fetchBody = siteEntry.slice(siteEntry.indexOf("const fetchOpenPlantRecord = async"), siteEntry.indexOf("// Returns true when all", siteEntry.indexOf("const fetchOpenPlantRecord = async")));
    expect(fetchBody).toContain("rowToken: symbol");
    expect(fetchBody).toMatch(/updated\[rowIdx\]\?\.\[equipmentRowToken\] === rowToken && updated\[rowIdx\]\.equipmentId === equipmentId/);
    expect(fetchBody).toMatch(/row\[equipmentRowToken\] === rowToken &&\s+row\.equipmentId === equipmentId &&\s+row\.plantUsageId == null &&\s+\(row\.openingReading === null \|\| row\.openingReading === undefined\)/);
    expect(siteEntry).toContain('[equipmentRowToken]: Symbol("equipment row"), [newEquipmentRow]: true');
    expect(siteEntry).toContain('setEquipment(st.equipment.map(e => ({ ...blankEq, ...e, [equipmentRowToken]: Symbol("equipment row") }))');

    const token = Symbol("row token");
    const original = { [token]: Symbol("original"), equipmentId: 12, openingReading: null as number | null, plantUsageId: null as number | null };
    const pendingToken = original[token];
    const replacement = { ...original, [token]: Symbol("replacement") };
    const canLink = (row: typeof original) => row[token] === pendingToken && row.equipmentId === 12;
    const canApplyPrior = (row: typeof original) =>
      row[token] === pendingToken && row.equipmentId === 12 && row.plantUsageId == null && row.openingReading == null;
    expect(canLink({ ...original })).toBe(true);
    expect(canApplyPrior({ ...original })).toBe(true);
    expect(canLink(replacement)).toBe(false);
    expect(canApplyPrior(replacement)).toBe(false);
    const hydrated = { ...JSON.parse(JSON.stringify(original)), [token]: Symbol("hydrated") };
    expect(canLink(hydrated)).toBe(false);
    expect(canApplyPrior(hydrated)).toBe(false);
    expect(JSON.stringify(original)).not.toContain("row token");
  });
});