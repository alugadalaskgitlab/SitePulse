import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("equipment usage form reorganisation contracts", () => {
  const guided = read("client/src/pages/GuidedDpr.tsx");
  const detailed = read("client/src/pages/SiteEntry.tsx");
  const edit = read("client/src/pages/SiteEdit.tsx");
  const compact = read("client/src/components/DprEquipmentCompact.tsx");
  const allocation = read("client/src/components/EquipmentActivityAllocationEditor.tsx");
  const submitted = read("client/src/pages/DprDetails.tsx");
  const report = read("client/src/pages/SiteReport.tsx");
  const plant = read("client/src/pages/PlantEquipmentUsage.tsx");

  it("uses creation-only local-time defaults without changing hydration helpers", () => {
    expect(guided).toContain("newGuidedEquipmentRowForCreation()");
    expect(guided).toContain("...newGuidedEquipmentRow(), ...e");
    expect(detailed).toContain("withEquipmentCreationStartTime(");
    expect(edit).toContain("withEquipmentCreationStartTime(");
    expect(edit).toContain("setEquipment((draft.equipment as EquipmentEntry[]).map(({ isNew: _isNew, editCreationKey: _key, ...row }) => row))");
  });

  it("keeps the canonical continuity lookup in Guided, Detailed and Edit DPR", () => {
    for (const source of [guided, detailed, edit]) {
      expect(source).toContain("fetchLatestPriorClosing(");
      expect(source).toContain("{ inclusive: true }");
    }
  });

  it("renders true fuel facts from one shared formula and labels physical confirmation clearly", () => {
    expect(compact).toContain("computeEquipmentFuelSummary");
    expect(compact).toContain("Physical Tank Balance Confirmed");
    expect(compact).toContain("Actual Consumed");
    expect(compact).toContain("Variance");
    expect(compact).toContain("Actual Consumption Rate");
    expect(plant).toContain("computeEquipmentFuelSummary");
    expect(plant).toContain("const consumed = fuel.actualConsumed");
  });

  it("renders physical activity segments once with one or more BOQ items", () => {
    expect(allocation).toContain("previous?.endTime");
    expect(allocation).toContain("parentStartTime");
    expect(allocation).toContain("parentEndTime");
    expect(allocation).toContain("bars.length === 1");
    expect(allocation).not.toContain("Which work reach?");
    expect(allocation).not.toContain("Choose the work reach");
    expect(allocation).not.toContain("workReachName");
    expect(allocation).not.toContain("Programme distinction");
    expect(allocation).toContain("formatEquipmentAllocationDuration");
    expect(allocation).not.toContain("Add another activity");
    expect(allocation).toContain("Assign Item");
    expect(allocation).toContain("Add Item");
    expect(allocation).toContain("Add BOQ Item");
    expect(allocation).toContain("Segment Duration");
    expect(allocation).toContain("boqItems:");
    expect(allocation).toContain("Work Assignment");
    expect(allocation).toContain("BOQ Item");
    expect(allocation).not.toContain(">Task<");
    expect(allocation).not.toContain("calendar-picker-indicator");
    expect(compact).toContain("row.activitySegments");
    expect(compact).toContain("row.activityAllocations");
    expect(compact).toContain("onChange?.({ activitySegments, activityAllocations: undefined })");
    for (const source of [guided, detailed, edit, submitted, report]) {
      expect(source).toContain("programmeBarId");
    }
    expect(guided).toContain("programmeBars={entries.flatMap");
    expect(detailed).toContain("programmeBars={progress.flatMap");
    expect(edit).toContain("programmeBars={progress.flatMap");
  });

  it("shows distinct usage and fuel performance facts in the condensed read-only grid", () => {
    expect(compact).toContain("Meter Working Hours");
    expect(compact).toContain("Clock Duration");
    expect(compact).toContain('testId={`equipment-compact-read-group-readings-${index}`}');
    expect(compact).not.toContain("<SectionHeading>Usage Summary</SectionHeading>");
    expect(compact).toContain("Fuel Performance");
    expect(compact).not.toContain('label={preview.totalKm != null ? "Distance" : "Operating time"}');
    expect(allocation).toContain("Assignment validation uses the machine-day Clock Duration");
    expect(compact).not.toContain("hoursWorked: preview.basis");
    expect(guided).not.toContain("input-eq-task-");
    expect(detailed).not.toContain("input-equipment-task-");
    expect(edit).not.toContain("input-equipment-task-");
    expect(allocation).not.toMatch(/text-\[(?:9|10)px\]/);
  });

  it("shows the same parent equipment summary in both submitted DPR views", () => {
    expect(submitted).toContain("<DprEquipmentCompact");
    expect(report).toContain("<DprEquipmentCompact");
    expect(compact).toContain('!editable && <div data-testid={`equipment-compact-readonly-${index}`}');
    expect(compact).toContain('testId={`equipment-compact-read-group-identity-${index}`}');
    expect(compact).toContain('testId={`equipment-compact-read-group-readings-${index}`}');
    expect(compact).toContain('className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3 lg:grid-cols-4"');
    expect(compact).toContain("<EquipmentActivityAllocationEditor");
    expect(compact).toContain("editable={editable}");
  });

  it("keeps completed-row accordion behavior while setup stays mounted in the two reorganized parents", () => {
    expect(compact).toContain('editable && !expanded ? "hidden" : undefined');
    expect(compact).toContain("<EquipmentActivityAllocationEditor");
    for (const source of [edit, guided]) {
      expect(source).not.toContain("Equipment setup and additional usage details");
      expect(source).not.toContain('<details className="group">');
      expect(source).not.toContain("<summary");
      expect(source).toContain("equipmentPickerSlot=");
    }
    expect(edit).toContain("hideIdentity");
    expect(guided).not.toContain("hideIdentity");
    // SiteEntry is intentionally outside Fix 2 and must not opt into the
    // identity-suppression prop.
    expect(detailed).not.toContain("hideIdentity");
  });

  it("keeps picker, hire/operator and diesel controls ordered in distinct compact slots", () => {
    const slotSection = (source: string, anchor: string) => {
      const start = source.indexOf(anchor);
      expect(start, `missing equipment-row anchor: ${anchor}`).toBeGreaterThanOrEqual(0);
      const end = source.indexOf("<DprEquipmentCompact", start);
      expect(end, `missing compact editor after: ${anchor}`).toBeGreaterThan(start);
      return source.slice(start, end);
    };
    const guidedEquipment = slotSection(guided, "const equipmentPickerSlot = (");
    const editEquipment = slotSection(edit, "const equipmentPickerSlot = (");
    for (const [section, machine, registration, hire, operator, source, purchase, trip, water] of [
      [guidedEquipment, "select-eq-machine-${i}", "text-eq-reg-${i}", "select-eq-entry-type-${i}",
        "input-eq-operator-${i}", "select-eq-diesel-source-${i}", "section-eq-purchase-${i}",
        "section-eq-trip-${i}", "section-eq-water-${i}"],
      [editEquipment, "select-equipment-${idx}", "text-equipment-reg-${idx}", "select-entry-type-${idx}",
        "input-operator-${idx}", "select-diesel-source-${idx}", "input-fuel-station-${idx}",
        "input-equipment-trips-${idx}", "input-equipment-water-qty-${idx}"],
    ]) {
      const positions = [machine, registration, hire, operator, source, purchase, trip, water].map(label => section.indexOf(label));
      expect(positions.every(position => position >= 0)).toBe(true);
      expect(positions.slice(1, 6)).toEqual([...positions.slice(1, 6)].sort((a, b) => a - b));
      expect(positions[5]).toBeLessThan(positions[6]);
      expect(positions[4]).toBeLessThan(positions[7]);
      expect(section).toContain("const ownerTypeSlot = (");
      expect(section).toContain("const dieselSourceSlot = (");
      expect(section).not.toContain("badge-eq-owner-");
      expect(section).not.toContain("text-equipment-owner-");
    }
    for (const source of [guided, edit]) {
      expect(source).toContain("equipmentPickerSlot=");
      expect(source).toContain("ownerTypeSlot={ownerTypeSlot}");
      expect(source).toContain("dieselSourceSlot={dieselSourceSlot}");
    }
    // Registration is only displayed once; owner/vendor is shown by compact,
    // rather than duplicated alongside the parent picker.
    expect((guided.match(/text-eq-reg-/g) ?? []).length).toBe(1);
    expect((edit.match(/text-equipment-reg-/g) ?? []).length).toBe(1);
    expect(compact).toContain('label="Owner / vendor"');
    expect(compact).toContain('label="Master default hire type"');
    expect(guided).not.toContain("hideIdentity");
    expect(edit).toContain("hideIdentity");
  });
});