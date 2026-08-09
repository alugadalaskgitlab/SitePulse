// ─────────────────────────────────────────────────────────────────────────────
// Geometry Batch 01 — spec §18 tests A–S for shared/roadGeometry.ts
// Engine-level: classification, default width rules, calculation math,
// UoM invariant, corridor gating, and isolation guarantees.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from "vitest";
import {
  GEOMETRY_LAYER_TYPES,
  defaultGeometryLayers,
  defaultLayerWidthM,
  applicableLayerWidthM,
  classifyItemForGeometry,
  computeGeometryPreview,
  type RoadGeometryProfileInput,
  type GeometryBoqItemLike,
  type GeometryItemResult,
} from "../shared/roadGeometry";

// ── helpers ──────────────────────────────────────────────────────────────────
let nextId = 1;
const item = (description: string, unit: string, extra: Partial<GeometryBoqItemLike> = {}): GeometryBoqItemLike => ({
  id: nextId++, description, unit, canonicalUnit: null, workCategory: null, ...extra,
});

function profile(overrides: Partial<RoadGeometryProfileInput> = {}): RoadGeometryProfileInput {
  return {
    enabled: true,
    carriagewayWidthM: 7.0,
    pavedShoulderLhsM: 1.5,
    pavedShoulderRhsM: 1.5,
    softShoulderLhsM: 1.0,
    softShoulderRhsM: 1.0,
    layers: GEOMETRY_LAYER_TYPES.map(layerType => ({
      layerType,
      enabled: true,
      thicknessMm: ({ subgrade: 500, gsb: 200, wmm: 250, dbm: 75, bc: 40 } as any)[layerType],
      overrideWidthM: null,
    })),
    ...overrides,
  };
}

const corridorOk = { chainageFrom: 100.0, chainageTo: 103.8, corridorConfirmed: true }; // 3800 m

const calcOne = (it: GeometryBoqItemLike, p = profile(), corridor = corridorOk): GeometryItemResult => {
  const pv = computeGeometryPreview(corridor, p, [it]);
  if (pv.status !== "ok") throw new Error(`expected ok preview, got ${pv.status}`);
  return pv.results[0];
};

// ── A. Classification into geometry layers ───────────────────────────────────
describe("A/B — item classification", () => {
  it("maps GSB / WMM / DBM / BC / prime / tack to layers", () => {
    expect(classifyItemForGeometry(item("Construction of Granular Sub Base by providing coarse graded material", "Cum")))
      .toMatchObject({ status: "calculable", layer: "gsb" });
    expect(classifyItemForGeometry(item("Providing Wet Mix Macadam base course", "Cum")))
      .toMatchObject({ status: "calculable", layer: "wmm" });
    expect(classifyItemForGeometry(item("Providing and laying Dense Bituminous Macadam with VG-40 bitumen", "MT")))
      .toMatchObject({ status: "calculable", layer: "dbm" });
    expect(classifyItemForGeometry(item("Providing and laying Bituminous Concrete wearing course with VG-40", "MT")))
      .toMatchObject({ status: "calculable", layer: "bc" });
    expect(classifyItemForGeometry(item("Providing and applying Prime Coat over granular surface", "Sqm")))
      .toMatchObject({ status: "calculable", layer: "prime_coat" });
    expect(classifyItemForGeometry(item("Providing and applying Tack Coat on bituminous surface", "Sqm")))
      .toMatchObject({ status: "calculable", layer: "tack_coat" });
  });

  it("accepts subgrade only when the description explicitly says subgrade", () => {
    expect(classifyItemForGeometry(item("Preparation and compaction of subgrade with material from roadway cutting", "Cum")))
      .toMatchObject({ status: "calculable", layer: "subgrade" });
    expect(classifyItemForGeometry(item("Construction of embankment with approved material from borrow pits", "Cum")).status)
      .toBe("unsupported"); // earthwork → Batch 02, never silently mapped
  });

  it("N/O — never guesses on uncertain pavement items; structures unsupported", () => {
    // pavement-smelling but unresolvable → needs_mapping, not a wrong calc
    const odd = classifyItemForGeometry(item("Supply of bituminous mixture for miscellaneous patching works", "LS"));
    expect(odd.status).toBe("needs_mapping");
    // structures / non-linear → unsupported
    expect(classifyItemForGeometry(item("Construction of RCC box culvert 2x2m", "Nos")).status).toBe("unsupported");
    expect(classifyItemForGeometry(item("Plain cement concrete M15 in foundation", "Cum")).status).toBe("unsupported");
  });

  it("N — medium-confidence category fallback never calculates (BITUMINOUS/SUBBASE_BASE)", () => {
    // workCategory=BITUMINOUS with no explicit DBM/BC evidence falls back to
    // bituminous_base at medium confidence — geometry must NOT accept it.
    const r1 = classifyItemForGeometry(item("Providing modified binder treatment course", "MT", { workCategory: "BITUMINOUS" }));
    expect(r1.status).not.toBe("calculable");
    // workCategory=SUBBASE_BASE without explicit GSB/WMM wording defaults to
    // gsb at medium confidence — must surface needs_mapping, not a GSB qty.
    const r2 = classifyItemForGeometry(item("Providing shoulder base course material", "Cum", { workCategory: "SUBBASE_BASE" }));
    expect(r2.status).not.toBe("calculable");
  });

  it("flags a recognised layer with a non-geometry unit as needs_mapping", () => {
    const r = classifyItemForGeometry(item("Providing Wet Mix Macadam base course", "Rmt"));
    expect(r.status).toBe("needs_mapping");
    expect(r.layer).toBe("wmm");
  });
});

// ── C. Default width rules (proposed, overridable) ───────────────────────────
describe("C — default applicable widths", () => {
  const p = profile();
  it("bituminous layers = carriageway + paved shoulders", () => {
    expect(defaultLayerWidthM("dbm", p)).toBeCloseTo(10.0);
    expect(defaultLayerWidthM("bc", p)).toBeCloseTo(10.0);
    expect(defaultLayerWidthM("tack_coat", p)).toBeCloseTo(10.0);
  });
  it("granular layers + prime = carriageway + paved shoulders", () => {
    expect(defaultLayerWidthM("gsb", p)).toBeCloseTo(10.0);
    expect(defaultLayerWidthM("wmm", p)).toBeCloseTo(10.0);
    expect(defaultLayerWidthM("prime_coat", p)).toBeCloseTo(10.0);
  });
  it("subgrade = full section incl. soft shoulders", () => {
    expect(defaultLayerWidthM("subgrade", p)).toBeCloseTo(12.0);
  });
  it("per-layer override wins over the default", () => {
    const p2 = profile();
    p2.layers.find(l => l.layerType === "gsb")!.overrideWidthM = 11.2;
    expect(applicableLayerWidthM("gsb", p2)).toBeCloseTo(11.2);
    expect(applicableLayerWidthM("wmm", p2)).toBeCloseTo(10.0); // others untouched
  });
  it("missing optional shoulders contribute zero, not NaN", () => {
    const p3 = profile({ pavedShoulderLhsM: null, pavedShoulderRhsM: null, softShoulderLhsM: null, softShoulderRhsM: null });
    expect(defaultLayerWidthM("bc", p3)).toBeCloseTo(7.0);
    expect(defaultLayerWidthM("subgrade", p3)).toBeCloseTo(7.0);
  });
});

// ── D/E/F. Volume + area math ────────────────────────────────────────────────
describe("D/E/F — quantity math", () => {
  it("Cum layer: length × width × thickness (mm→m)", () => {
    const r = calcOne(item("Providing Wet Mix Macadam base course", "Cum"));
    expect(r.status).toBe("calculated");
    if (r.status !== "calculated") return;
    expect(r.quantity).toBeCloseTo(3800 * 10.0 * 0.25, 2); // 9,500 Cum
    expect(r.unit).toBe("Cum");
    expect(r.basis.formula).toContain("×");
  });

  it("Sqm surface treatment: length × width, no thickness", () => {
    const r = calcOne(item("Providing and applying Tack Coat on bituminous surface", "Sqm"));
    expect(r.status).toBe("calculated");
    if (r.status !== "calculated") return;
    expect(r.quantity).toBeCloseTo(3800 * 10.0, 2); // 38,000 Sqm
    expect(r.basis.thicknessM).toBeNull();
  });

  it("Sqm thickness-layer item (e.g. WMM measured in Sqm) uses area math", () => {
    const r = calcOne(item("Providing Wet Mix Macadam base course", "Sqm"));
    expect(r.status).toBe("calculated");
    if (r.status !== "calculated") return;
    expect(r.quantity).toBeCloseTo(38000, 2);
    expect(r.unit).toBe("Sqm");
  });

  it("Cum bituminous item stays in Cum — work type never dictates the unit", () => {
    const r = calcOne(item("Providing and laying Bituminous Concrete wearing course with VG-40", "Cum"));
    expect(r.status).toBe("calculated");
    if (r.status !== "calculated") return;
    expect(r.unit).toBe("Cum");
    expect(r.quantity).toBeCloseTo(3800 * 10.0 * 0.04, 2); // 1,520 Cum
  });
});

// ── G/H. UoM invariant + MT without density ──────────────────────────────────
describe("G/H — UoM invariant", () => {
  it("output unit always equals the BOQ item's own unit (alias preserved)", () => {
    const r = calcOne(item("Providing Wet Mix Macadam base course", "cum", { canonicalUnit: "Cum" }));
    expect(r.status).toBe("calculated");
    if (r.status !== "calculated") return;
    expect(r.unit).toBe("cum"); // original display alias, not the canonical form
    expect(r.basis.outputUnit).toBe("cum");
    expect(r.basis.internalUnit).toBe("Cum");
  });

  it("MT item with no density → conversion_required, never a fabricated number", () => {
    const r = calcOne(item("Providing and laying Dense Bituminous Macadam with VG-40 bitumen", "MT"));
    expect(r.status).toBe("conversion_required");
    if (r.status !== "conversion_required") return;
    expect((r as any).quantity).toBeUndefined();
    expect(r.reason).toMatch(/density|conversion/i);
    expect(r.basis.internalUnit).toBe("Cum"); // volume basis is still shown transparently
  });
});

// ── I/J. Corridor gating ─────────────────────────────────────────────────────
describe("I/J — corridor handling", () => {
  const items = [item("Providing Wet Mix Macadam base course", "Cum")];
  it("unconfirmed corridor → no calculation at all", () => {
    const pv = computeGeometryPreview({ ...corridorOk, corridorConfirmed: false }, profile(), items);
    expect(pv.status).toBe("corridor_unconfirmed");
    expect((pv as any).results).toBeUndefined();
  });
  it("missing / zero / inverted chainages → corridor_unconfirmed, never zero-length math", () => {
    for (const c of [
      { chainageFrom: null, chainageTo: 103.8, corridorConfirmed: true },
      { chainageFrom: 100, chainageTo: 100, corridorConfirmed: true },
      { chainageFrom: 103.8, chainageTo: 100, corridorConfirmed: true },
    ]) {
      expect(computeGeometryPreview(c as any, profile(), items).status).toBe("corridor_unconfirmed");
    }
  });
  it("confirmed corridor derives length in metres from km chainages", () => {
    const pv = computeGeometryPreview(corridorOk, profile(), items);
    expect(pv.status).toBe("ok");
    if (pv.status !== "ok") return;
    expect(pv.lengthM).toBeCloseTo(3800);
  });
});

// ── K/L. Feature gating + layer configuration guards ─────────────────────────
describe("K/L — gating and configuration guards", () => {
  it("profile disabled → engine calculates nothing", () => {
    const pv = computeGeometryPreview(corridorOk, profile({ enabled: false }), [item("WMM base course wet mix macadam", "Cum")]);
    expect(pv.status).toBe("disabled");
  });
  it("fresh default layers are all disabled (off until configured)", () => {
    expect(defaultGeometryLayers().every(l => !l.enabled)).toBe(true);
  });
  it("layer disabled or missing thickness → layer_not_configured, not a wrong number", () => {
    const p = profile();
    p.layers.find(l => l.layerType === "gsb")!.enabled = false;
    const r1 = calcOne(item("Construction of Granular Sub Base coarse graded", "Cum"), p);
    expect(r1.status).toBe("layer_not_configured");

    const p2 = profile();
    p2.layers.find(l => l.layerType === "wmm")!.thicknessMm = null;
    const r2 = calcOne(item("Providing Wet Mix Macadam base course", "Cum"), p2);
    expect(r2.status).toBe("layer_not_configured");
  });
  it("no widths entered → layer_not_configured", () => {
    const p = profile({ carriagewayWidthM: null, pavedShoulderLhsM: null, pavedShoulderRhsM: null });
    const r = calcOne(item("Providing and laying Bituminous Concrete wearing course", "Cum"), p);
    expect(r.status).toBe("layer_not_configured");
  });
});

// ── M–S. Isolation, statuses, worked example ─────────────────────────────────
describe("M–S — isolation and end-to-end preview", () => {
  it("M — engine is pure: input objects are not mutated, nothing persisted", () => {
    const p = profile();
    const snapshot = JSON.stringify(p);
    const its = [item("Providing Wet Mix Macadam base course", "Cum")];
    const itemsSnapshot = JSON.stringify(its);
    computeGeometryPreview(corridorOk, p, its);
    expect(JSON.stringify(p)).toBe(snapshot);
    expect(JSON.stringify(its)).toBe(itemsSnapshot);
  });

  it("P — mixed BOQ produces per-item statuses without cross-contamination", () => {
    const pv = computeGeometryPreview(corridorOk, profile(), [
      item("Construction of Granular Sub Base coarse graded material", "Cum"),   // calculated
      item("Providing and laying Dense Bituminous Macadam VG-40", "MT"),          // conversion_required
      item("Construction of RCC box culvert 2x2m", "Nos"),                        // unsupported
      item("Supply of bituminous mixture for miscellaneous patching works", "LS"),// needs_mapping
      item("Construction of embankment with approved borrow material", "Cum"),    // unsupported (Batch 02)
    ]);
    expect(pv.status).toBe("ok");
    if (pv.status !== "ok") return;
    expect(pv.results.map(r => r.status)).toEqual([
      "calculated", "conversion_required", "unsupported", "needs_mapping", "unsupported",
    ]);
  });

  it("Q — worked example: GSB 3.8 km, 10.0 m, 200 mm = 7,600 Cum", () => {
    const r = calcOne(item("Construction of Granular Sub Base coarse graded material", "Cum"));
    expect(r.status).toBe("calculated");
    if (r.status !== "calculated") return;
    expect(r.quantity).toBeCloseTo(7600, 2);
    expect(r.basis.lengthM).toBeCloseTo(3800);
    expect(r.basis.widthM).toBeCloseTo(10.0);
    expect(r.basis.thicknessM).toBeCloseTo(0.2);
  });

  it("R/S — engine module has no imports from planning/sequencer/BOM modules", async () => {
    const fs = await import("node:fs");
    const src = fs.readFileSync("shared/roadGeometry.ts", "utf8");
    // Isolation guarantee: preview-only, feeds nothing downstream.
    for (const banned of ["planningEngine", "programmeSequencer", "quantityResolver", "workProgramBars", "plannedWidthM", "plannedThicknessMm"]) {
      expect(src.includes(banned), `roadGeometry.ts must not reference ${banned}`).toBe(false);
    }
  });
});
