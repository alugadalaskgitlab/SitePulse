import { describe, expect, it } from "vitest";
import {
  blocksExternalReceiptsForBoqItem,
  isExplicitCutMaterialConsumerDescription,
  isEditableMaterialReceiptSource,
  mergeMaterialTripLinkage,
  resolveApplicableArrangements,
} from "../shared/materialReceiptSummary";
import {
  EMPTY_WORK_CONTEXT,
  hasRequiredWorkContext,
  workContextForBoqItem,
} from "../client/src/components/ReceiptWorkContext";

const arrangement = (overrides: Record<string, unknown> = {}) => ({
  id: 10,
  status: "approved",
  arrangementType: "vendor_material_delivered",
  boqProjectId: 1,
  boqItemId: 20,
  ...overrides,
});

describe("DPR-02 Parts 1-3 material trip safeguards", () => {
  it("B: changing BOQ item clears stale programme and arrangement links", () => {
    expect(workContextForBoqItem({
      boqProjectId: 1,
      boqItemId: 19,
      programmeBarId: 90,
      earthworkArrangementId: 9,
    }, 20)).toEqual({
      boqProjectId: 1,
      boqItemId: 20,
      programmeBarId: null,
      earthworkArrangementId: null,
    });
  });

  it("C: exactly one applicable arrangement is prefilled; multiple are not guessed", () => {
    const one = resolveApplicableArrangements(
      [arrangement()],
      { boqProjectId: 1, boqItemId: 20 },
    );
    expect(one.prefill?.id).toBe(10);

    const multiple = resolveApplicableArrangements(
      [arrangement(), arrangement({ id: 11 })],
      { boqProjectId: 1, boqItemId: 20 },
    );
    expect(multiple.prefill).toBeNull();
    expect(multiple.requiresSelection).toBe(true);
  });

  it.each(["approved", "draft", "submitted"])(
    "D/E/F/G: %s reused-excavated destination hard-blocks external receipts",
    (status) => {
      expect(blocksExternalReceiptsForBoqItem([
        arrangement({ status, arrangementType: "reused_excavated" }),
      ], 20)).toBe(true);
    },
  );

  it("does not block the excavation source row or unrelated BOQ items", () => {
    const reuse = arrangement({
      arrangementType: "reused_excavated",
      sourceExcavationBoqItemId: 19,
    });
    expect(blocksExternalReceiptsForBoqItem([reuse], 19)).toBe(false);
    expect(blocksExternalReceiptsForBoqItem([reuse], 21)).toBe(false);
  });

  it.each([
    "Embankment - Borrow Earth",
    "Sub-grade",
    "GSB",
    "WMM",
    "Generic embankment fill",
  ])("H: generic external material item has no cut-material prompt: %s", (description) => {
    expect(isExplicitCutMaterialConsumerDescription(description)).toBe(false);
  });

  it.each([
    "Embankment - Excavated Earth",
    "Embankment using excavation material",
    "Cut-to-fill material",
    "Fill with reused excavated soil",
  ])("I: explicit cut-material equivalent remains plausible: %s", (description) => {
    expect(isExplicitCutMaterialConsumerDescription(description)).toBe(true);
  });

  it("new standalone context starts empty and requires deliberate project/item selection", () => {
    expect(hasRequiredWorkContext(EMPTY_WORK_CONTEXT)).toBe(false);
    expect(hasRequiredWorkContext({ ...EMPTY_WORK_CONTEXT, boqProjectId: 1 })).toBe(false);
    expect(hasRequiredWorkContext({ ...EMPTY_WORK_CONTEXT, boqProjectId: 1, boqItemId: 2 })).toBe(true);
  });

  it("same-row trip receipts are editable while pseudo receipt projections are not", () => {
    expect(isEditableMaterialReceiptSource("trip")).toBe(true);
    expect(isEditableMaterialReceiptSource("dpr")).toBe(false);
    expect(isEditableMaterialReceiptSource("equipment")).toBe(false);
  });

  it("server linkage transition accepts an atomic correction without hiding omitted stale links", () => {
    const existing = {
      boqProjectId: 1,
      boqItemId: 19,
      programmeBarId: 90,
      earthworkArrangementId: 9,
    };
    expect(mergeMaterialTripLinkage(existing, {
      boqProjectId: 1,
      boqItemId: 20,
      programmeBarId: null,
      earthworkArrangementId: 10,
    })).toEqual({
      boqProjectId: 1,
      boqItemId: 20,
      programmeBarId: null,
      earthworkArrangementId: 10,
    });
    expect(mergeMaterialTripLinkage(existing, { boqItemId: 20 })).toEqual({
      ...existing,
      boqItemId: 20,
    });
  });
});