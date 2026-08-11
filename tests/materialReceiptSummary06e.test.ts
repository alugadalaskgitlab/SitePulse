// Batch 06E — material receipt ↔ arrangement ↔ DPR linkage seam tests.
import { describe, it, expect } from "vitest";
import {
  resolveApplicableArrangements,
  resolveRequiredToday,
  aggregateReceived,
  buildReceiptComparison,
  classifyReceiptMatch,
  receiptRelevanceForType,
  APPLICABLE_ARRANGEMENT_STATUSES,
  COMPARISON_BASES_DIFFER,
  type ApplicableArrangementInput,
  type SuggestableTrip,
} from "../shared/materialReceiptSummary";
import { insertSiteMaterialTripSchema, siteMaterialTrips } from "../shared/schema";

const arr = (over: Partial<ApplicableArrangementInput> = {}): ApplicableArrangementInput => ({
  id: 1,
  status: "approved",
  arrangementType: "vendor_material_delivered",
  boqProjectId: 10,
  boqItemId: 100,
  agencyName: "ABC Earthworks",
  materialLabel: "Earth / Borrow Soil",
  ...over,
});

const trip = (over: Partial<SuggestableTrip> = {}): SuggestableTrip => ({
  id: 1,
  date: "2026-08-11",
  site: "NH-44",
  material: "Earth / Borrow Soil",
  quantity: 15,
  uom: "Cum",
  isCancelled: false,
  isDeleted: false,
  ...over,
});

describe("06E arrangement resolution (spec §5/E)", () => {
  const ctx = { boqProjectId: 10, boqItemId: 100 };

  it("J/K: exactly one applicable arrangement → prefill (supplier + materialLabel come from it)", () => {
    const r = resolveApplicableArrangements([arr()], ctx);
    expect(r.prefill?.id).toBe(1);
    expect(r.prefill?.agencyName).toBe("ABC Earthworks");
    expect(r.prefill?.materialLabel).toBe("Earth / Borrow Soil");
    expect(r.requiresSelection).toBe(false);
    expect(r.none).toBe(false);
  });

  it("L: multiple applicable arrangements require user selection — never guess", () => {
    const r = resolveApplicableArrangements([arr(), arr({ id: 2, agencyName: "XYZ Carting" })], ctx);
    expect(r.prefill).toBeNull();
    expect(r.requiresSelection).toBe(true);
    expect(r.applicable).toHaveLength(2);
  });

  it("M: no applicable arrangement → none=true (receipt still allowed by callers)", () => {
    const r = resolveApplicableArrangements([arr({ boqItemId: 999 })], ctx);
    expect(r.none).toBe(true);
    expect(r.prefill).toBeNull();
  });

  it("filters by operational status — draft/rejected/completed never prefill", () => {
    for (const status of ["draft", "submitted", "rejected", "cancelled", "completed", "on_hold", "returned"]) {
      expect(resolveApplicableArrangements([arr({ status })], ctx).none).toBe(true);
    }
    for (const status of APPLICABLE_ARRANGEMENT_STATUSES) {
      expect(resolveApplicableArrangements([arr({ status })], ctx).prefill?.id).toBe(1);
    }
  });

  it("multi-item arrangement matches via boqItemAllocations; empty allocations never guess", () => {
    const multi = arr({ boqItemId: null, boqItemAllocations: [{ boqItemId: 100 }, { boqItemId: 101 }] });
    expect(resolveApplicableArrangements([multi], ctx).prefill?.id).toBe(1);
    const empty = arr({ boqItemId: null, boqItemAllocations: [] });
    expect(resolveApplicableArrangements([empty], ctx).none).toBe(true);
  });

  it("bar allocations narrow multiple arrangements to the allocated one", () => {
    const r = resolveApplicableArrangements(
      [arr(), arr({ id: 2 })],
      { ...ctx, programmeBarId: 55 },
      [{ arrangementId: 2, programmeBarId: 55, allocatedQty: 300 }],
    );
    expect(r.prefill?.id).toBe(2);
  });

  it("respects arrangementType relevance — reused_excavated prompts no external receipt", () => {
    expect(receiptRelevanceForType("reused_excavated")).toBe("none");
    expect(receiptRelevanceForType("client_supplied")).toBe("context");
    expect(receiptRelevanceForType("vendor_material_delivered")).toBe("primary");
    expect(receiptRelevanceForType("fully_outsourced_composite")).toBe("evidence");
  });
});

describe("06E Required Today priority (approved correction — NO prorating)", () => {
  it("P/1: arrangement allocation wins; multi-day bar plannedQty is NEVER divided by days", () => {
    const r = resolveRequiredToday({ arrangementAllocationQty: 300, dayProgrammeQty: 250, bomRequirementQty: 200, uom: "Cum" });
    expect(r).toEqual({ requiredQty: 300, requiredUom: "Cum", requiredSource: "arrangement_allocation" });
  });

  it("2: falls to day-specific programme qty, then BOM", () => {
    expect(resolveRequiredToday({ dayProgrammeQty: 250, bomRequirementQty: 200, uom: "Cum" }).requiredSource).toBe("day_programme");
    expect(resolveRequiredToday({ bomRequirementQty: 200, uom: "Cum" }).requiredSource).toBe("bom_requirement");
  });

  it("2/3: with no authoritative source → Not determined (bar total is context only, not an input here)", () => {
    const r = resolveRequiredToday({ uom: "Cum" });
    expect(r.requiredQty).toBeNull();
    expect(r.requiredSource).toBe("not_determined");
    // There is deliberately NO parameter for bar plannedQty or day count:
    // equal daily prorating cannot be expressed through this resolver.
    expect(resolveRequiredToday.length).toBe(1);
  });

  it("zero/negative/NaN quantities are not authoritative", () => {
    expect(resolveRequiredToday({ arrangementAllocationQty: 0, uom: "Cum" }).requiredSource).toBe("not_determined");
    expect(resolveRequiredToday({ arrangementAllocationQty: NaN, dayProgrammeQty: 5, uom: "Cum" }).requiredSource).toBe("day_programme");
  });
});

describe("06E Received aggregation (spec §F/N/O + approved test 4/5)", () => {
  it("O: two vehicle trips in the same UoM aggregate with trip count", () => {
    const agg = aggregateReceived([trip({ quantity: 150 }), trip({ id: 2, quantity: 135 })]);
    expect(agg.receivedQty).toBe(285);
    expect(agg.receivedUom).toBe("Cum");
    expect(agg.tripCount).toBe(2);
    expect(agg.mixedUoms).toBe(false);
  });

  it("N/5: cancelled and deleted receipts are excluded from Received totals", () => {
    const agg = aggregateReceived([
      trip({ quantity: 100 }),
      trip({ id: 2, quantity: 50, isCancelled: true }),
      trip({ id: 3, quantity: 25, isDeleted: true }),
    ]);
    expect(agg.receivedQty).toBe(100);
    expect(agg.tripCount).toBe(1);
  });

  it("4: mixed UoMs are never summed into one false quantity", () => {
    const agg = aggregateReceived([trip({ quantity: 100, uom: "Cum" }), trip({ id: 2, quantity: 40, uom: "MT" })]);
    expect(agg.mixedUoms).toBe(true);
    expect(agg.receivedQty).toBeNull();
    expect(agg.receivedUom).toBeNull();
    expect(agg.byUom).toHaveLength(2);
  });

  it("UoM comparison is case/space-insensitive (Cum vs CUM is one basis)", () => {
    const agg = aggregateReceived([trip({ uom: "Cum" }), trip({ id: 2, uom: " CUM " })]);
    expect(agg.mixedUoms).toBe(false);
    expect(agg.receivedQty).toBe(30);
  });
});

describe("06E comparison safety (spec §G/R/S)", () => {
  const received = (qty: number, uom = "Cum") => aggregateReceived([trip({ quantity: qty, uom })]);

  it("S: fully comparable CUM shows both variances with neutral semantics", () => {
    const c = buildReceiptComparison({
      requiredQty: 300, requiredUom: "Cum", requiredSource: "arrangement_allocation",
      received: received(285), executedQty: 260, executedUom: "CUM",
    });
    expect(c.comparable).toBe(true);
    expect(c.varianceToRequired).toBe(-15);
    expect(c.receivedLessExecuted).toBe(25);
  });

  it("R: differing bases (MT receipt vs CUM BOQ) → no numerical variance, bases-differ reason", () => {
    const c = buildReceiptComparison({
      requiredQty: 300, requiredUom: "Cum", requiredSource: "arrangement_allocation",
      received: received(500, "MT"), executedQty: 260, executedUom: "Cum",
    });
    expect(c.comparable).toBe(false);
    expect(c.varianceToRequired).toBeNull();
    expect(c.receivedLessExecuted).toBeNull();
    expect(c.comparisonReason).toBe(COMPARISON_BASES_DIFFER);
  });

  it("mixed receipt UoMs are non-comparable regardless of other bases", () => {
    const mixed = aggregateReceived([trip(), trip({ id: 2, uom: "MT" })]);
    const c = buildReceiptComparison({
      requiredQty: 300, requiredUom: "Cum", requiredSource: "arrangement_allocation",
      received: mixed, executedQty: 260, executedUom: "Cum",
    });
    expect(c.comparable).toBe(false);
    expect(c.varianceToRequired).toBeNull();
  });

  it("fewer than two quantities present → nothing to compare", () => {
    const c = buildReceiptComparison({
      requiredQty: null, requiredUom: null, requiredSource: "not_determined",
      received: aggregateReceived([]), executedQty: 260, executedUom: "Cum",
    });
    expect(c.comparable).toBe(false);
  });
});

describe("06E existing-receipt matching (spec §12/13/D/G/H)", () => {
  const ctx = {
    siteName: "NH-44", date: "2026-08-11", boqProjectId: 10, boqItemId: 100,
    programmeBarId: 55, earthworkArrangementId: 7, materialLabel: "Earth / Borrow Soil",
  };

  it("G: stable-ID matches classify as linked (arrangement id, or boq item + bar)", () => {
    expect(classifyReceiptMatch(trip({ earthworkArrangementId: 7 }), ctx)).toBe("linked");
    expect(classifyReceiptMatch(trip({ boqItemId: 100, programmeBarId: 55 }), ctx)).toBe("linked");
    expect(classifyReceiptMatch(trip({ boqItemId: 100, programmeBarId: null }), ctx)).toBe("linked");
  });

  it("H/D: unlinked same-site/date/material receipt is a SUGGESTION requiring user action", () => {
    expect(classifyReceiptMatch(trip(), ctx)).toBe("suggested");
  });

  it("13: no fuzzy auto-link — supplier/material text never yields 'linked'", () => {
    const textOnly = trip({ supplier: "ABC Earthworks" });
    expect(classifyReceiptMatch(textOnly, ctx)).toBe("suggested");
    // Receipt already ID-linked to a DIFFERENT item is neither linked nor suggested here.
    expect(classifyReceiptMatch(trip({ boqItemId: 999 }), ctx)).toBeNull();
    expect(classifyReceiptMatch(trip({ boqItemId: 100, programmeBarId: 77 }), ctx)).toBeNull();
  });

  it("wrong site/date or cancelled/deleted receipts never match", () => {
    expect(classifyReceiptMatch(trip({ site: "Other" }), ctx)).toBeNull();
    expect(classifyReceiptMatch(trip({ date: "2026-08-10" }), ctx)).toBeNull();
    expect(classifyReceiptMatch(trip({ isCancelled: true, earthworkArrangementId: 7 }), ctx)).toBeNull();
    expect(classifyReceiptMatch(trip({ isDeleted: true, earthworkArrangementId: 7 }), ctx)).toBeNull();
  });
});

describe("06E schema safety (spec §4/M, approved tests 6/7/AB)", () => {
  it("A/AB: exactly the four intended nullable linkage columns exist on site_material_trips", () => {
    const cols = siteMaterialTrips;
    expect(cols.boqProjectId.name).toBe("boq_project_id");
    expect(cols.boqItemId.name).toBe("boq_item_id");
    expect(cols.programmeBarId.name).toBe("programme_bar_id");
    expect(cols.earthworkArrangementId.name).toBe("earthwork_arrangement_id");
    for (const c of [cols.boqProjectId, cols.boqItemId, cols.programmeBarId, cols.earthworkArrangementId]) {
      expect(c.notNull).toBe(false); // nullable — historical rows stay valid
    }
  });

  it("A: plain trip creation payload still validates without any linkage (test A/F — no DPR id anywhere)", () => {
    const parsed = insertSiteMaterialTripSchema.parse({
      date: "2026-08-11", site: "NH-44", material: "WMM", quantity: 120, uom: "CFT",
    });
    expect(parsed.boqItemId).toBeUndefined();
    expect("dprId" in insertSiteMaterialTripSchema.shape).toBe(false);
  });

  it("B/C/D/E/7: linked payload keeps every normal field AND the procurement links intact", () => {
    const parsed = insertSiteMaterialTripSchema.parse({
      date: "2026-08-11", time: "09:10", site: "NH-44", material: "Earth / Borrow Soil",
      supplier: "ABC Earthworks", vehicleNumber: "MH12AB1234", quantity: 15, uom: "Cum",
      location: "RHS Ch. 2+000", receiptNumber: "CH-991", enteredBy: "Supervisor", notes: "n",
      workType: "road", indentId: 1, indentItemId: 2, piTransactionId: 3, pendingReceiptId: 4,
      boqProjectId: 10, boqItemId: 100, programmeBarId: 55, earthworkArrangementId: 7,
    });
    expect(parsed.indentId).toBe(1);
    expect(parsed.piTransactionId).toBe(3);
    expect(parsed.boqProjectId).toBe(10);
    expect(parsed.earthworkArrangementId).toBe(7);
    expect(parsed.receiptNumber).toBe("CH-991");
  });
});
