// Batch 06E — material receipt ↔ arrangement ↔ DPR linkage seam tests.
import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ActivityReceiptStrip } from "../client/src/components/ActivityReceiptStrip";
import {
  resolveApplicableArrangements,
  resolveRequiredToday,
  aggregateReceived,
  buildReceiptComparison,
  classifyReceiptMatch,
  convertReceiptVolumeQty,
  receiptRelevanceForType,
  arrangementScopeLabel,
  resolveReusedExcavationSourceContexts,
  reusedExcavationConfigurationIssue,
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

describe("06X-HF2 reused-excavated context", () => {
  const renderStrip = (arrangements: ApplicableArrangementInput[], persistedArrangementId?: number | null) => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity } },
    });
    client.setQueryData(["earthwork-arrangements-item", 10, 100], arrangements);
    client.setQueryData(["arrangement-programme-allocations", 10], []);
    client.setQueryData(["/api/site-material-trips", "NH-44", "2026-08-11"], []);
    client.setQueryData(["/api/sites"], []);
    return renderToStaticMarkup(
      createElement(
        QueryClientProvider,
        { client },
        createElement(ActivityReceiptStrip, {
          siteName: "NH-44",
          date: "2026-08-11",
          boqProjectId: 10,
          boqItemId: 100,
          persistedArrangementId,
          activityMaterialHint: "Roadway excavation",
          testIdPrefix: "hf2",
        }),
      ),
    );
  };

  it("valid fill arrangement resolves on the fill item and exposes its explicit source relation", () => {
    const reuse = arr({
      arrangementType: "reused_excavated",
      boqItemId: 200,
      sourceExcavationBoqItemId: 100,
      sourceExcavationBoqItemLabel: "Roadway excavation",
      destinationBoqItemLabels: ["Embankment - excavated earth"],
      reachLabel: "Km 2 to Km 4",
    });
    expect(resolveApplicableArrangements([reuse], { boqProjectId: 10, boqItemId: 200 }).prefill?.id).toBe(1);
    expect(resolveReusedExcavationSourceContexts([reuse], 100)).toEqual([reuse]);
    expect(arrangementScopeLabel(reuse)).toBe("Km 2 to Km 4");
  });

  it("source rows receive context only and never resolve the fill arrangement as their own", () => {
    const reuse = arr({
      arrangementType: "reused_excavated",
      boqItemId: 200,
      sourceExcavationBoqItemId: 100,
    });
    expect(resolveApplicableArrangements([reuse], { boqProjectId: 10, boqItemId: 100 }).none).toBe(true);
    expect(resolveReusedExcavationSourceContexts([reuse], 100)).toHaveLength(1);
  });

  it("self-linked source/fill is reported invalid and never prefills", () => {
    const invalid = arr({
      arrangementType: "reused_excavated",
      boqItemId: 100,
      sourceExcavationBoqItemId: 100,
    });
    expect(reusedExcavationConfigurationIssue(invalid)).toMatch(/cannot be the same BOQ item/);
    expect(resolveApplicableArrangements([invalid], { boqProjectId: 10, boqItemId: 100 }).none).toBe(true);
  });

  it("source-less reused excavation remains visible as invalid but cannot prefill or suppress receipts", () => {
    const invalid = arr({
      arrangementType: "reused_excavated",
      boqItemId: 200,
      sourceExcavationBoqItemId: null,
    });
    expect(reusedExcavationConfigurationIssue(invalid)).toMatch(/must be configured/);
    expect(resolveApplicableArrangements([invalid], { boqProjectId: 10, boqItemId: 200 }).none).toBe(true);
  });

  it("self-linked legacy reuse renders the normal receipt workflow plus a warning", () => {
    const invalid = arr({
      arrangementType: "reused_excavated",
      boqItemId: 100,
      sourceExcavationBoqItemId: 100,
    });
    const html = renderStrip([invalid], invalid.id);
    expect(html).toContain('data-testid="hf2-receipt-strip"');
    expect(html).toContain('data-testid="hf2-reuse-configuration-warning"');
    expect(html).not.toContain('data-testid="hf2-source-reuse-context"');
    expect(html).not.toContain('data-testid="hf2-execution-only"');
  });

  it("source-less legacy reuse renders the normal receipt workflow plus a warning", () => {
    const invalid = arr({
      arrangementType: "reused_excavated",
      boqItemId: 100,
      sourceExcavationBoqItemId: null,
    });
    const html = renderStrip([invalid], invalid.id);
    expect(html).toContain('data-testid="hf2-receipt-strip"');
    expect(html).toContain('data-testid="hf2-reuse-configuration-warning"');
    expect(html).not.toContain('data-testid="hf2-execution-only"');
  });

  it("the receipt strip keeps source-side context read-only", async () => {
    const fs = await import("node:fs/promises");
    const source = await fs.readFile("client/src/components/ActivityReceiptStrip.tsx", "utf8");
    expect(source).toContain("resolveReusedExcavationSourceContexts");
    expect(source).toContain("validSourceReuseContexts");
    expect(source).toContain("resolution.applicable.some");
    expect(source).toContain("source-reuse-context");
    expect(source).toContain("fill-reuse-context");
    expect(source).toContain("reuse-configuration-warning");
    expect(source).toContain("persistedArrangementCandidate");
    expect(source).toContain("reusedExcavationConfigurationIssue(persistedArrangementCandidate) == null");
  });

  it("legacy invalid persisted reuse cannot drive execution-only/no-receipt semantics", async () => {
    const fs = await import("node:fs/promises");
    const source = await fs.readFile("client/src/components/ActivityReceiptStrip.tsx", "utf8");
    const persistedStart = source.indexOf("const persistedArrangementCandidate");
    const arrangementStart = source.indexOf("const arrangement =", persistedStart);
    const persistedBlock = source.slice(persistedStart, arrangementStart);
    expect(persistedBlock).toContain("reusedExcavationConfigurationIssue");
    expect(persistedBlock).toContain("? persistedArrangementCandidate");
    expect(source).toContain("invalidReuseArrangement");
    expect(source).toContain("reuse-configuration-warning");
  });

  it("cancelled/rejected persisted arrangements reopen as inactive while active persisted arrangements are unchanged", () => {
    for (const status of ["cancelled", "rejected"]) {
      const html = renderStrip([arr({ status })], 1);
      expect(html).toContain('data-testid="hf2-arrangement-unset"');
      expect(html).not.toContain('data-testid="hf2-arrangement-badge"');
      expect(html).not.toContain('data-testid="hf2-arranged-tag"');
    }

    const activeHtml = renderStrip([arr({ status: "in_progress" })], 1);
    expect(activeHtml).toContain('data-testid="hf2-arrangement-badge"');
    expect(activeHtml).toContain('data-testid="hf2-arranged-tag"');
    expect(activeHtml).not.toContain('data-testid="hf2-arrangement-unset"');
  });

  it("create and PATCH routes both enforce the shared explicit-source invariant", async () => {
    const fs = await import("node:fs/promises");
    const routes = await fs.readFile("server/routes.ts", "utf8");
    expect(routes).toContain("async function validateReusedExcavationSource");
    expect((routes.match(/validateReusedExcavationSource\(/g) ?? []).length).toBeGreaterThanOrEqual(3);
    expect(routes).toContain("INVALID_REUSED_EXCAVATION_SOURCE");
    expect(routes).toContain("eq(boqItems.boqProjectId, projectId)");
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

  it("converts CFT receipts to the CUM requirement basis and computes real variances", () => {
    expect(convertReceiptVolumeQty(35.3147, "CFT", "Cum")).toBe(1);
    const c = buildReceiptComparison({
      requiredQty: 300,
      requiredUom: "Cum",
      requiredSource: "arrangement_allocation",
      received: received(10_594.41, "CFT"),
      executedQty: 280,
      executedUom: "CUM",
    });
    expect(c.comparable).toBe(true);
    expect(c.receivedQty).toBe(300);
    expect(c.receivedUom).toBe("Cum");
    expect(c.varianceToRequired).toBe(0);
    expect(c.receivedLessExecuted).toBe(20);
    expect(c.comparisonReason).toMatch(/converted/i);
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
