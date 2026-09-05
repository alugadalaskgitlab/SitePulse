import { describe, expect, it } from "vitest";
import {
  blocksExternalReceiptsForBoqItem,
  isExplicitCutMaterialConsumerDescription,
  isEditableMaterialReceiptSource,
  mergeMaterialTripLinkage,
  resolveApplicableArrangements,
} from "../shared/materialReceiptSummary";
import {
  arrangementLabel,
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

  it("B/F: HLC self-execution is a real labelled arrangement and inactive rows never prefill", () => {
    expect(arrangementLabel(arrangement({
      arrangementType: "hlc_in_house",
      agencyName: null,
    }) as any)).toBe("HLC — In-house / Self Execution");
    for (const status of ["cancelled", "rejected", "on_hold", "completed", "returned"]) {
      const result = resolveApplicableArrangements(
        [arrangement({ status })],
        { boqProjectId: 1, boqItemId: 20 },
      );
      expect(result.prefill).toBeNull();
      expect(result.none).toBe(true);
    }
  });

  it("B/D: programme-bar context narrows multiple arrangements without showing another reach", () => {
    const candidates = [
      arrangement({ id: 10 }),
      arrangement({ id: 11 }),
      arrangement({ id: 12, boqItemId: 99 }),
    ];
    const result = resolveApplicableArrangements(
      candidates,
      { boqProjectId: 1, boqItemId: 20, programmeBarId: 501 },
      [
        { arrangementId: 10, programmeBarId: 501, allocatedQty: 100 },
        { arrangementId: 11, programmeBarId: 777, allocatedQty: 100 },
      ],
    );
    expect(result.applicable.map((row) => row.id)).toEqual([10]);
    expect(result.prefill?.id).toBe(10);
  });

  it("B/D: chainage context excludes another arrangement for the same BOQ item", () => {
    const result = resolveApplicableArrangements(
      [
        arrangement({ id: 10, chainageFrom: 1.25, chainageTo: 2.1 }),
        arrangement({ id: 11, chainageFrom: 2.5, chainageTo: 3.8 }),
      ],
      {
        boqProjectId: 1,
        boqItemId: 20,
        chainageFrom: 2.6,
        chainageTo: 3.2,
      },
    );
    expect(result.applicable.map((row) => row.id)).toEqual([11]);
    expect(result.prefill?.id).toBe(11);
  });

  it("B/D: scoped arrangements are not offered until matching reach context exists", () => {
    const scoped = arrangement({ chainageFrom: 2.5, chainageTo: 3.8 });
    expect(resolveApplicableArrangements(
      [scoped],
      { boqProjectId: 1, boqItemId: 20 },
    ).none).toBe(true);
    expect(resolveApplicableArrangements(
      [scoped],
      { boqProjectId: 1, boqItemId: 20, reachLabel: "unrelated reach" },
    ).none).toBe(true);
  });

  it("Part 2/4 UI reuses one arrangement context and preserves historical inactive labels", async () => {
    const fs = await import("node:fs/promises");
    const context = await fs.readFile("client/src/components/ReceiptWorkContext.tsx", "utf8");
    const siteEntry = await fs.readFile("client/src/pages/SiteEntry.tsx", "utf8");
    const siteEdit = await fs.readFile("client/src/pages/SiteEdit.tsx", "utf8");
    const guidedDpr = await fs.readFile("client/src/pages/GuidedDpr.tsx", "utf8");
    const sitePreview = await fs.readFile("client/src/pages/SitePreview.tsx", "utf8");
    const dprDetail = await fs.readFile("client/src/pages/DprDetails.tsx", "utf8");
    expect(context).toContain("historicalInactiveArrangement");
    expect(context).toContain("arrangement-historical");
    expect(context).toContain("No execution arrangement linked");
    for (const editableDpr of [siteEntry, siteEdit, guidedDpr]) {
      expect(editableDpr).toContain("<ActivityReceiptStrip");
      expect(editableDpr).toContain("onArrangementResolved=");
    }
    expect(siteEntry).not.toMatch(/readOnly persistedArrangementId=\{entry\.earthworkArrangementId\}/);
    expect(siteEdit).not.toMatch(/readOnly persistedArrangementId=\{entry\.earthworkArrangementId\}/);
    expect(sitePreview).toContain("<ActivityReceiptStrip");
    expect(sitePreview).toContain("persistedArrangementId={item.earthworkArrangementId ?? null}");
    expect(sitePreview).toContain("testIdPrefix={`dpr-preview-");
    expect(sitePreview).toContain("readOnly");
    expect(dprDetail).toContain("<ActivityReceiptStrip");
    expect(dprDetail).toContain("persistedArrangementId={item.earthworkArrangementId ?? null}");
    expect(dprDetail).toContain("readOnly");
  });

  it("ensures incidental DPR columns before startup queries can reload a draft", async () => {
    const fs = await import("node:fs/promises");
    const routes = await fs.readFile("server/routes.ts", "utf8");
    expect(routes).toContain("await ensureProgressIncidentalColumns()");
    expect(routes).toContain("ADD COLUMN IF NOT EXISTS is_incidental boolean NOT NULL DEFAULT false");
    expect(routes).toContain("ADD COLUMN IF NOT EXISTS incidental_description text");
    expect(routes).toContain('console.error("GET /api/dprs/:id failed:", err)');
    expect(routes).toContain('res.status(500).json({ message: "Failed to fetch DPR details" })');
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