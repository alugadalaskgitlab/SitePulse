/**
 * Batch 06F — Tomorrow's Requirement daily fulfilment seam tests (spec §20).
 * Covers: lineKey stability, entry matching across reorder/insert/delete,
 * legacy index fallback, resolution priority (exact bar → reach → item →
 * HLC default), on_hold flagging, fulfilment validation, receipt suggestion
 * derivation, and the no-mutation guarantees.
 */
import { describe, it, expect } from "vitest";
import {
  newLineKey,
  findAllocationEntry,
  validateFulfilment,
  fulfilmentLabel,
  resolveRequirementArrangements,
  standingArrangementExceptionNote,
  receiptSuggestionFromFulfilment,
  HOLD_STATUS,
  type AllocationEntryLike,
} from "../shared/requirementFulfilment";

describe("newLineKey", () => {
  it("generates unique, prefixed keys", () => {
    const keys = new Set(Array.from({ length: 200 }, () => newLineKey()));
    expect(keys.size).toBe(200);
    for (const k of keys) expect(k).toMatch(/^rl_[a-z0-9]{10}$/);
  });
});

describe("findAllocationEntry — lineKey-first matching", () => {
  const entries: AllocationEntryLike[] = [
    { lineKey: "rl_aaa", index: 0, status: "arranged" },
    { lineKey: "rl_bbb", index: 1, status: "not_available" },
    { index: 2, status: "expected_at_site" }, // legacy unkeyed entry
  ];

  it("matches by lineKey regardless of current index (reorder-safe)", () => {
    // Line rl_bbb has moved from index 1 to index 0 after a reorder.
    const found = findAllocationEntry(entries, { lineKey: "rl_bbb" }, 0);
    expect(found?.status).toBe("not_available");
  });

  it("insert/delete does not move allocations between keyed lines", () => {
    // A new line was inserted at position 0; original rl_aaa now at index 1.
    const found = findAllocationEntry(entries, { lineKey: "rl_aaa" }, 1);
    expect(found?.status).toBe("arranged");
    // The new line (fresh key, index 0) gets nothing — not rl_aaa's entry.
    const fresh = findAllocationEntry(entries, { lineKey: "rl_new" }, 0);
    expect(fresh).toBeNull(); // entry at index 0 is keyed → not claimable by index
  });

  it("keyed line falls back to a LEGACY (unkeyed) entry at its index", () => {
    const found = findAllocationEntry(entries, { lineKey: "rl_zzz" }, 2);
    expect(found?.status).toBe("expected_at_site");
  });

  it("unkeyed (historical) line matches only unkeyed entries by index", () => {
    expect(findAllocationEntry(entries, {}, 2)?.status).toBe("expected_at_site");
    // index 0 entry is keyed → historical line at index 0 must NOT claim it
    expect(findAllocationEntry(entries, {}, 0)).toBeNull();
    expect(findAllocationEntry(entries, null, 2)?.status).toBe("expected_at_site");
  });

  it("handles empty/missing entry arrays", () => {
    expect(findAllocationEntry(null, { lineKey: "rl_aaa" }, 0)).toBeNull();
    expect(findAllocationEntry([], { lineKey: "rl_aaa" }, 0)).toBeNull();
  });
});

describe("validateFulfilment", () => {
  it("absent fulfilment is valid (optional feature)", () => {
    const r = validateFulfilment({});
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.fulfilmentType).toBeNull();
  });

  it("rejects arrangementId without a type", () => {
    const r = validateFulfilment({ arrangementId: 5 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("ARRANGEMENT_WITHOUT_TYPE");
  });

  it("arrangement requires arrangementId", () => {
    const bad = validateFulfilment({ fulfilmentType: "arrangement" });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.code).toBe("ARRANGEMENT_ID_REQUIRED");
    const good = validateFulfilment({ fulfilmentType: "arrangement", arrangementId: 7, agencyNameSnapshot: "XYZ Infra" });
    expect(good.ok).toBe(true);
    if (good.ok) expect(good.value.arrangementId).toBe(7);
  });

  it("other_agency requires agency name and NEVER carries an arrangementId", () => {
    const bad = validateFulfilment({ fulfilmentType: "other_agency" });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.code).toBe("AGENCY_NAME_REQUIRED");
    const good = validateFulfilment({ fulfilmentType: "other_agency", agencyNameSnapshot: "ABC Suppliers", arrangementId: 99 });
    expect(good.ok).toBe(true);
    if (good.ok) {
      expect(good.value.arrangementId).toBeNull(); // forced null
      expect(good.value.agencyNameSnapshot).toBe("ABC Suppliers");
    }
  });

  it("hlc clears arrangement id and agency", () => {
    const r = validateFulfilment({ fulfilmentType: "hlc", arrangementId: 3, agencyNameSnapshot: "X" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.arrangementId).toBeNull();
      expect(r.value.agencyNameSnapshot).toBeNull();
    }
  });

  it("rejects unknown types", () => {
    const r = validateFulfilment({ fulfilmentType: "vendor" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("INVALID_FULFILMENT_TYPE");
  });
});

describe("resolveRequirementArrangements — priority + on_hold", () => {
  const arr = (id: number, over: any = {}) => ({
    id, status: "in_progress", arrangementType: "vendor_material_delivered",
    allocatedQty: 100, agencyName: `Agency ${id}`, boqItemId: 10,
    boqItemAllocations: null, chainageFrom: 5, chainageTo: 8, ...over,
  });

  it("no arrangement → HLC default, never an error", () => {
    const r = resolveRequirementArrangements([], [], { boqItemId: 10 });
    expect(r.hlcDefault).toBe(true);
    expect(r.suggested).toBeNull();
    expect(r.candidates).toHaveLength(0);
  });

  it("exact programmeBarId beats reach beats item", () => {
    const arrangements = [arr(1, { chainageFrom: null, chainageTo: null }), arr(2), arr(3)];
    const r = resolveRequirementArrangements(arrangements, [{ arrangementId: 3, programmeBarId: 77 }], {
      boqItemId: 10, programmeBarId: 77, chainageFrom: 6, chainageTo: 7,
    });
    expect(r.candidates.map(c => [c.arrangement.id, c.matchLevel])).toEqual([
      [3, "exact_bar"], [2, "reach"], [1, "item"],
    ]);
    expect(r.suggested?.arrangement.id).toBe(3);
  });

  it("bar allocations are ignored when programmeBarId is not genuinely known", () => {
    const r = resolveRequirementArrangements([arr(3)], [{ arrangementId: 3, programmeBarId: 77 }], {
      boqItemId: 10, programmeBarId: null,
    });
    expect(r.candidates[0].matchLevel).not.toBe("exact_bar");
  });

  it("on_hold arrangements are listed + flagged but never suggested", () => {
    const r = resolveRequirementArrangements([arr(1, { status: HOLD_STATUS })], [], { boqItemId: 10, chainageFrom: 6, chainageTo: 7 });
    expect(r.candidates).toHaveLength(1);
    expect(r.candidates[0].onHold).toBe(true);
    expect(r.suggested).toBeNull();
    expect(r.hlcDefault).toBe(false); // context exists, just on hold
  });

  it("excludes non-applicable statuses and other items", () => {
    const r = resolveRequirementArrangements(
      [arr(1, { status: "draft" }), arr(2, { status: "completed" }), arr(3, { boqItemId: 99 })],
      [], { boqItemId: 10 },
    );
    expect(r.candidates).toHaveLength(0);
    expect(r.hlcDefault).toBe(true);
  });

  it("matches items via boqItemAllocations (multi-item arrangements)", () => {
    const r = resolveRequirementArrangements(
      [arr(1, { boqItemId: null, boqItemAllocations: [{ boqItemId: 10, qty: 50 }] })],
      [], { boqItemId: 10 },
    );
    expect(r.candidates).toHaveLength(1);
  });
});

describe("standingArrangementExceptionNote", () => {
  const suggested = { arrangement: { id: 4, agencyName: "XYZ Infra" } };

  it("warns (info only) when HLC chosen over a standing arrangement", () => {
    expect(standingArrangementExceptionNote({ fulfilmentType: "hlc" }, suggested)).toMatch(/XYZ Infra/);
  });
  it("warns for other_agency exceptions", () => {
    expect(standingArrangementExceptionNote({ fulfilmentType: "other_agency", agencyNameSnapshot: "ABC" }, suggested)).toMatch(/one-day exception/);
  });
  it("silent when the suggested arrangement itself is chosen or no suggestion", () => {
    expect(standingArrangementExceptionNote({ fulfilmentType: "arrangement", arrangementId: 4 }, suggested)).toBeNull();
    expect(standingArrangementExceptionNote({ fulfilmentType: "hlc" }, null)).toBeNull();
  });
  it("notes a different compatible arrangement", () => {
    expect(standingArrangementExceptionNote({ fulfilmentType: "arrangement", arrangementId: 9 }, suggested)).toMatch(/different compatible arrangement/);
  });
});

describe("receiptSuggestionFromFulfilment", () => {
  it("arrangement → agency + arrangementId", () => {
    const s = receiptSuggestionFromFulfilment({ fulfilmentType: "arrangement", arrangementId: 12, agencyNameSnapshot: "XYZ Infra" });
    expect(s).toEqual(expect.objectContaining({ supplierSuggestion: "XYZ Infra", arrangementId: 12 }));
  });
  it("other_agency → agency only, NEVER fabricates an arrangementId", () => {
    const s = receiptSuggestionFromFulfilment({ fulfilmentType: "other_agency", agencyNameSnapshot: "ABC" });
    expect(s?.supplierSuggestion).toBe("ABC");
    expect(s?.arrangementId).toBeNull();
  });
  it("hlc → internal note, no supplier", () => {
    const s = receiptSuggestionFromFulfilment({ fulfilmentType: "hlc" });
    expect(s?.supplierSuggestion).toBeNull();
    expect(s?.arrangementId).toBeNull();
  });
  it("no fulfilment → no suggestion (never auto-creates anything)", () => {
    expect(receiptSuggestionFromFulfilment(null)).toBeNull();
    expect(receiptSuggestionFromFulfilment({ status: "arranged" })).toBeNull();
  });
});

describe("fulfilmentLabel", () => {
  it("labels each type; null when absent", () => {
    expect(fulfilmentLabel({ fulfilmentType: "hlc" })).toBe("HLC / Internally Arranged");
    expect(fulfilmentLabel({ fulfilmentType: "arrangement", agencyNameSnapshot: "XYZ" })).toBe("XYZ (Arrangement)");
    expect(fulfilmentLabel({ fulfilmentType: "other_agency", agencyNameSnapshot: "ABC" })).toMatch(/daily exception/);
    expect(fulfilmentLabel({})).toBeNull();
  });
});
