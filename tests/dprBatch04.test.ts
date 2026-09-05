/**
 * Batch 04 — DPR data integrity, UOM consistency & submit readiness.
 *
 * Covers spec §17:
 *  A–I  measurement/conversion/display (shared/dprGeometry.ts additions)
 *  J    Guided equipment round-trip (shared/guidedEquipment.ts)
 *  K–V  submit readiness mandatory vs advisory (shared/dprSubmitReadiness.ts —
 *       the SAME module the server routes consume, so frontend and server
 *       cannot disagree on mandatory/advisory classification)
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  calculateLengthFromChainage,
  calculateDprQuantity,
  resolveDprConversionFactor,
  boqProgressQty,
  formatDprDimensions,
  dprMeasurementSummary,
  formatDprMeasurement,
} from "../shared/dprGeometry";
import {
  splitGuidedEquipmentRow,
  buildGuidedEquipmentPayload,
  newGuidedEquipmentRow,
} from "../shared/guidedEquipment";
import { evaluateDprSubmitReadiness } from "../shared/dprSubmitReadiness";

const CG = { unit: "Ha", dprMeasurementMethod: null, dprConversionFactor: 0.0001 }; // real Clearing & Grubbing config
const CUM_ITEM = { unit: "Cum", dprMeasurementMethod: null, dprConversionFactor: null };

describe("Batch 04 — measurement & BOQ-unit conversion", () => {
  it("A — chainage 2.900–3.050 derives 150 m", () => {
    expect(calculateLengthFromChainage("2.900", "3.050")).toBeCloseTo(150, 6);
    expect(calculateLengthFromChainage("2+900", "3+050")).toBeCloseTo(150, 6);
  });

  it("B — area geometry: 150 × 1.5 = 225 SQM (physical measurement)", () => {
    expect(calculateDprQuantity(150, 1.5, null, CG)).toBeCloseTo(225, 6);
  });

  it("C — BOQ factor 0.0001 converts 225 SQM → 0.0225 Ha", () => {
    expect(boqProgressQty(225, CG)).toBeCloseTo(0.0225, 9);
  });

  it("C&G live case — 200 × 1.75 = 350 SQM and exactly one conversion gives 0.035 Ha", () => {
    const physicalQty = calculateDprQuantity(200, 1.75, null, CG);
    expect(physicalQty).toBe(350);
    expect(boqProgressQty(physicalQty, CG)).toBeCloseTo(0.035, 12);

    const summary = dprMeasurementSummary(
      { chainageFrom: "1.9", chainageTo: "2.1", width: 1.75, quantity: physicalQty, uom: "Ha" },
      CG,
    );
    expect(summary.measuredQty).toBe(350);
    expect(summary.measuredUom).toBe("SQM");
    expect(summary.boqQty).toBeCloseTo(0.035, 12);
    expect(summary.boqUom).toBe("Ha");
    expect(formatDprMeasurement(summary)).toBe("200 × 1.75 m = 350 SQM → 0.035 Ha");
    expect(summary.boqQty! < 1.468).toBe(true);
    expect(summary.boqQty).toBeCloseTo(summary.measuredQty! * summary.factor, 12);
  });

  it("reach balance and Plan-vs-Actual aggregate stored physical quantity in BOQ units", () => {
    const storage = readFileSync(new URL("../server/storage.ts", import.meta.url), "utf8");
    const reachAggregator = storage.slice(
      storage.indexOf("async getReportedQtyByBar"),
      storage.indexOf("async getWorkProgrammeExecutionEvidence"),
    );
    const planAggregator = storage.slice(
      storage.indexOf("async getPlanVsActual"),
      storage.indexOf("// --- Site Requirements"),
    );

    expect(reachAggregator).toContain(
      "sum(${progressEntries.quantity} * coalesce(${boqItems.dprConversionFactor}, 1.0))",
    );
    expect(planAggregator).toContain(
      "SUM(pe.quantity * COALESCE(bi.dpr_conversion_factor, 1.0))",
    );
  });

  it("D — dprConversionFactor is applied exactly once (summary uses raw stored qty)", () => {
    const m = dprMeasurementSummary(
      { chainageFrom: "2.900", chainageTo: "3.050", width: 1.5, quantity: 225, uom: "SQM" },
      CG,
    );
    expect(m.measuredQty).toBe(225);       // physical, unconverted
    expect(m.boqQty).toBeCloseTo(0.0225);  // converted once
    expect(m.factor).toBe(0.0001);
    // Feeding an already-converted value back through would double-convert —
    // the contract is: boqQty is ALWAYS measuredQty × factor, nothing else.
    expect(m.boqQty).toBeCloseTo(m.measuredQty! * m.factor, 12);
  });

  it("E — blank/default factor behaves as 1 (matches SQL COALESCE(factor,1))", () => {
    expect(resolveDprConversionFactor(null)).toBe(1);
    expect(resolveDprConversionFactor({ dprConversionFactor: null })).toBe(1);
    expect(resolveDprConversionFactor({ dprConversionFactor: 0 })).toBe(1);   // never zero out progress
    expect(boqProgressQty(27, CUM_ITEM)).toBe(27);
    const m = dprMeasurementSummary({ length: 90, width: 1, thickness: 0.3, quantity: 27, uom: "CUM" }, CUM_ITEM);
    expect(m.converted).toBe(false);
    expect(m.boqQty).toBe(27);
  });

  it("F — area display shows L × W only, never a fake thickness or zero", () => {
    const dims = formatDprDimensions({ chainageFrom: "2.900", chainageTo: "3.050", width: 1.5, uom: "SQM" }, CG);
    expect(dims).toBe("150 × 1.5 m");
    expect(dims).not.toMatch(/(^|\s)0 ×|× 0(\s|$)/); // no fabricated zero dims
    // Guided rows store length=null (chainage authoritative) — no "0 × 1.5 × 0"
    const summary = formatDprDimensions({ length: null, chainageFrom: "2.900", chainageTo: "3.050", width: 1.5, uom: "SQM" });
    expect(summary).toBe("150 × 1.5 m");
    // count/weighment items fabricate NO geometric dimensions
    expect(formatDprDimensions({ quantity: 12, uom: "MT" }, { unit: "MT", dprMeasurementMethod: "MT_manual" })).toBeNull();
    // linear items show meaningful length only
    expect(formatDprDimensions({ chainageFrom: "1+000", chainageTo: "1+150", uom: "RMT" })).toBe("150 m");
  });

  it("G — Summary and Detail share the same measurement representation", () => {
    const row = { length: null, chainageFrom: "2.900", chainageTo: "3.050", width: 1.5, quantity: 225, uom: "SQM" };
    const m = dprMeasurementSummary(row, CG);
    expect(formatDprMeasurement(m)).toBe("150 × 1.5 m = 225 SQM → 0.0225 Ha");
    // Without BOQ context (summary list) the dims string is identical:
    expect(formatDprDimensions(row)).toBe(m.dims);
  });

  it("H — Roadway Excavation stays 90 × 1 × 0.3 = 27 Cum", () => {
    expect(calculateDprQuantity(90, 1, 0.3, CUM_ITEM)).toBeCloseTo(27, 9);
    const m = dprMeasurementSummary({ length: 90, width: 1, thickness: 0.3, quantity: 27, uom: "CUM" }, CUM_ITEM);
    expect(m.dims).toBe("90 × 1 × 0.3 m");
    expect(m.boqQty).toBe(27);
  });

  it("I — Embankment stays 90 × 2.5 × 0.3 = 67.5 Cum", () => {
    expect(calculateDprQuantity(90, 2.5, 0.3, CUM_ITEM)).toBeCloseTo(67.5, 9);
  });
});

describe("Batch 04 — Guided equipment round-trip (J)", () => {
  const dbRow = {
    id: 77, dprId: 12, machine: "JCB", vehicleNo: "TS 09 AB 1234", operator: "RAMU", task: "EXCAVATION",
    entryType: "time_meter", startTime: "08:00", endTime: "", openingReading: 1523.5, closingReading: null,
    diesel: 40, dieselSource: "plant_stock", fuelStation: "", billNumber: "", amountPaid: null,
    numberOfTrips: null, tripDistance: null, totalKm: null, waterQuantity: null,
    equipmentId: 9, boqItemId: 13, structureId: null, plantUsageId: 41,
  };

  it("split keeps edited fields AND passthrough; payload round-trips everything", () => {
    const row = splitGuidedEquipmentRow(dbRow);
    expect(row.machine).toBe("JCB");
    expect(row.operator).toBe("RAMU");
    const payload = buildGuidedEquipmentPayload(row);
    // Previously-wiped fields now survive a Guided save untouched:
    expect(payload.startTime).toBe("08:00");
    expect(payload.openingReading).toBe(1523.5);
    expect(payload.diesel).toBe(40);
    expect(payload.equipmentId).toBe(9);
    expect(payload.plantUsageId).toBe(41);
    expect(payload.entryType).toBe("time_meter");
    // row identity is never echoed into a create/update payload
    expect(payload).not.toHaveProperty("id");
    expect(payload).not.toHaveProperty("dprId");
    // edits win over passthrough
    row.operator = "SOMESH";
    expect(buildGuidedEquipmentPayload(row).operator).toBe("SOMESH");
  });

  it("new rows fabricate NO fake ''/null fields", () => {
    const payload = buildGuidedEquipmentPayload({ ...newGuidedEquipmentRow(), machine: "ROLLER" });
    expect(Object.keys(payload).sort()).toEqual(["machine", "operator", "task", "vehicleNo"]);
  });
});

describe("Batch 04 — submit readiness (K–V)", () => {
  const completeProgress = { activity: "CLEARING AND GRUBBING", boqItemId: 13, chainageFrom: "2.900", chainageTo: "3.050", quantity: 225 };

  it("N/P — complete DPR is ready; readiness result is one consolidated object", () => {
    const r = evaluateDprSubmitReadiness({
      progress: [completeProgress],
      equipment: [{ machine: "JCB", openingReading: 100, closingReading: 108 }],
      labour: [{ category: "Skilled", count: 4 }],
      materials: [{ material: "HSD", quantity: 40, uom: "L" }],
    });
    expect(r.ready).toBe(true);
    expect(r.mandatory).toHaveLength(0);
  });

  it("K — draft leniency: readiness is simply not applied to drafts (module contract)", () => {
    // Draft endpoints never call the validator; the module itself would flag
    // this row, proving the gate exists only on Final Submit.
    const r = evaluateDprSubmitReadiness({ equipment: [{ machine: "JCB", openingReading: 100 }] });
    expect(r.ready).toBe(false);
  });

  it("L/Q — opening without closing reading is MANDATORY (server uses the same module)", () => {
    const r = evaluateDprSubmitReadiness({ progress: [completeProgress], equipment: [{ machine: "JCB", openingReading: 1523.5 }] });
    expect(r.ready).toBe(false);
    expect(r.mandatory.some((m) => m.section === "equipment" && /closing meter reading/i.test(m.message))).toBe(true);
  });

  it("M — startTime without endTime is MANDATORY", () => {
    const r = evaluateDprSubmitReadiness({ equipment: [{ machine: "GRADER", startTime: "08:00" }] });
    expect(r.mandatory.some((m) => /end time required/i.test(m.message))).toBe(true);
  });

  it("O — selected activity left without quantity appears as MANDATORY", () => {
    const r = evaluateDprSubmitReadiness({ progress: [{ activity: "EMBANKMENT", boqItemId: 5, chainageFrom: "1+000", chainageTo: "1+200", quantity: null }] });
    expect(r.mandatory.some((m) => m.section === "activities" && /quantity missing/i.test(m.message))).toBe(true);
    // half-filled chainage is also mandatory
    const r2 = evaluateDprSubmitReadiness({ progress: [{ activity: "GSB", quantity: 10, chainageFrom: "1+000", chainageTo: "" }] });
    expect(r2.mandatory.some((m) => /chainage is incomplete/i.test(m.message))).toBe(true);
  });

  it("06V — incidental work requires its own description and still requires physical quantity", () => {
    const bad = evaluateDprSubmitReadiness({
      progress: [{ activity: "DRAIN CLEANING", isIncidental: true, incidentalDescription: "", quantity: null }],
    });
    expect(bad.mandatory.some((m) => /description required for incidental/i.test(m.message))).toBe(true);
    expect(bad.mandatory.some((m) => /quantity missing/i.test(m.message))).toBe(true);

    const good = evaluateDprSubmitReadiness({
      progress: [{ activity: "DRAIN CLEANING", isIncidental: true, incidentalDescription: "FLOOD RESPONSE", quantity: 12 }],
    });
    expect(good.ready).toBe(true);
  });

  it("06V — No Site Work requires a reason but never requires physical quantity", () => {
    const bad = evaluateDprSubmitReadiness({
      progress: [{ activity: "EMBANKMENT", noSiteWork: true, noSiteWorkDescription: "", quantity: 100 }],
    });
    expect(bad.mandatory.some((m) => /reason required for no site work/i.test(m.message))).toBe(true);

    const good = evaluateDprSubmitReadiness({
      progress: [{ activity: "EMBANKMENT", noSiteWork: true, noSiteWorkDescription: "ACCESS BLOCKED", quantity: 100 }],
    });
    expect(good.ready).toBe(true);
  });

  it("P — multiple incomplete sections produce ONE consolidated result", () => {
    const r = evaluateDprSubmitReadiness({
      progress: [{ activity: "EMBANKMENT", quantity: null }],
      equipment: [{ machine: "JCB", openingReading: 5 }, { machine: "ROLLER" }],
      labour: [{ category: "Skilled", count: 0 }],
      materials: [{ material: "CEMENT", quantity: null, uom: "" }],
    });
    expect(r.mandatory.length).toBeGreaterThanOrEqual(4);
    expect(r.advisories.length).toBe(2); // ROLLER no-usage + CEMENT missing-UOM advisories
    const sections = new Set(r.mandatory.map((m) => m.section));
    expect(sections).toEqual(new Set(["activities", "equipment", "labour", "materials"]));
  });

  it("U — machine selected with NO usage is ADVISORY only and does NOT block", () => {
    const r = evaluateDprSubmitReadiness({ progress: [completeProgress], equipment: [{ machine: "SOIL COMPACTOR" }] });
    expect(r.ready).toBe(true); // V — advisory-only result is accepted
    expect(r.mandatory).toHaveLength(0);
    expect(r.advisories.some((a) => /no usage was recorded/i.test(a.message))).toBe(true);
  });

  it("blank placeholder labour/material/equipment rows never block (false-positive guard)", () => {
    const r = evaluateDprSubmitReadiness({
      progress: [completeProgress],
      equipment: [{ machine: "" }],
      labour: [{ category: "", count: null, task: "", contractor: "" }],
      materials: [{ material: "" }],
    });
    expect(r.ready).toBe(true);
    expect(r.advisories).toHaveLength(0);
  });

  it("labour with category but zero/blank count is MANDATORY (no masquerading records)", () => {
    const r = evaluateDprSubmitReadiness({ labour: [{ category: "Unskilled", count: 0 }] });
    expect(r.mandatory.some((m) => m.section === "labour" && /positive number/i.test(m.message))).toBe(true);
  });

  it("trip-based equipment: trips without distance is MANDATORY; complete trip entry passes", () => {
    const bad = evaluateDprSubmitReadiness({ equipment: [{ machine: "TIPPER", entryType: "trip_based", numberOfTrips: 8 }] });
    expect(bad.mandatory.some((m) => /trip entry incomplete/i.test(m.message))).toBe(true);
    const good = evaluateDprSubmitReadiness({ equipment: [{ machine: "TIPPER", entryType: "trip_based", numberOfTrips: 8, tripDistance: 12 }] });
    expect(good.ready).toBe(true);
  });

  it("water tanker: waterQuantity counts as usage and exempts the trip pair (false-positive guard)", () => {
    const r = evaluateDprSubmitReadiness({ equipment: [{ machine: "WATER TANKER", entryType: "trip_based", waterQuantity: 12000 }] });
    expect(r.ready).toBe(true);
    expect(r.advisories).toHaveLength(0); // usage evidence recognised
  });

  it("material without UOM is ADVISORY only (existing conventions don't enforce UOM)", () => {
    const r = evaluateDprSubmitReadiness({ materials: [{ material: "MURRUM", quantity: 30, uom: "" }] });
    expect(r.ready).toBe(true);
    expect(r.advisories.some((a) => a.section === "materials" && /UOM not specified/i.test(a.message))).toBe(true);
  });

  it("structure DPR (no road progress rows) is not blocked by chainage rules", () => {
    const r = evaluateDprSubmitReadiness({ workType: "structure", progress: [], equipment: [{ machine: "MIXER", hoursWorked: 6 }] });
    expect(r.ready).toBe(true);
  });

  it("S — pending-closing predicate itself unchanged: complete meter usage raises nothing", () => {
    const r = evaluateDprSubmitReadiness({ equipment: [{ machine: "JCB", openingReading: 100, closingReading: 106.5, startTime: "08:00", endTime: "17:30" }] });
    expect(r.ready).toBe(true);
    expect(r.advisories).toHaveLength(0);
  });
});
