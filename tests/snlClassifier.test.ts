import { describe, it, expect } from "vitest";
import { classifyBoqItem } from "../server/snlAutoMapper";

describe("classifyBoqItem — 9-category BOQ classifier", () => {
  // ── Reinforcement ────────────────────────────────────────────────────────────
  it("Fe 500 HYSD reinforcement → reinforcement", () => {
    expect(classifyBoqItem("Providing and placing Fe 500 HYSD bars in RCC works")).toBe("reinforcement");
  });

  it("TMT bars → reinforcement", () => {
    expect(classifyBoqItem("Supply and fixing TMT bars for foundation")).toBe("reinforcement");
  });

  it("Fe 415 deformed bars → reinforcement", () => {
    expect(classifyBoqItem("Reinforcement steel Fe-415 deformed bar for structures")).toBe("reinforcement");
  });

  it("Reinforcement in pile cap → reinforcement (not bridge_structure)", () => {
    // Must return reinforcement because TMT/HYSD rule fires before concrete rule
    expect(classifyBoqItem("HYSD bars in pile cap")).toBe("reinforcement");
  });

  // ── Drainage ─────────────────────────────────────────────────────────────────
  it("Chute drain → drainage", () => {
    expect(classifyBoqItem("Construction of chute drain in RCC M20 at toe of embankment")).toBe("drainage");
  });

  it("Energy dissipation chamber → drainage", () => {
    expect(classifyBoqItem("Construction of Energy dissipation chamber at outlet of culvert")).toBe("drainage");
  });

  it("Catch pit → drainage", () => {
    expect(classifyBoqItem("Providing and constructing catch pit at roadside")).toBe("drainage");
  });

  it("Open drain → drainage", () => {
    expect(classifyBoqItem("Construction of open drain with cement concrete lining")).toBe("drainage");
  });

  // ── Retaining wall ────────────────────────────────────────────────────────────
  it("PCC M15 in retaining wall → retaining_wall", () => {
    expect(classifyBoqItem("Providing and laying PCC M15 in retaining wall including form work")).toBe("retaining_wall");
  });

  it("PCC in toe wall → retaining_wall", () => {
    expect(classifyBoqItem("Plain cement concrete M10 in toe wall and foundation")).toBe("retaining_wall");
  });

  it("Stone pitching → retaining_wall", () => {
    expect(classifyBoqItem("Dry stone pitching for slope protection behind abutment")).toBe("retaining_wall");
  });

  // ── Road pavement ─────────────────────────────────────────────────────────────
  it("Granular sub-base (GSB) → road_pavement", () => {
    expect(classifyBoqItem("Providing and laying granular sub-base material")).toBe("road_pavement");
  });

  it("Wet mix macadam (WMM) → road_pavement", () => {
    expect(classifyBoqItem("Construction of Wet Mix Macadam layer 200mm thick")).toBe("road_pavement");
  });

  it("Dense bituminous macadam (DBM) → road_pavement", () => {
    expect(classifyBoqItem("Providing, laying and compacting DBM Gr II for wearing course")).toBe("road_pavement");
  });

  it("Bituminous concrete → road_pavement", () => {
    expect(classifyBoqItem("Bituminous Concrete (BC) 40mm wearing course")).toBe("road_pavement");
  });

  it("Prime coat → road_pavement", () => {
    expect(classifyBoqItem("Applying prime coat with bituminous primer")).toBe("road_pavement");
  });

  // ── Earthwork ─────────────────────────────────────────────────────────────────
  it("Excavation → earthwork", () => {
    expect(classifyBoqItem("Earthwork in excavation in ordinary soil")).toBe("earthwork");
  });

  it("Embankment formation → earthwork", () => {
    expect(classifyBoqItem("Construction of embankment with approved material from borrow pit")).toBe("earthwork");
  });

  // ── Pipe culvert ──────────────────────────────────────────────────────────────
  it("RCC hume pipe culvert → pipe_culvert", () => {
    expect(classifyBoqItem("Construction of RCC hume pipe culvert NP3 600mm dia")).toBe("pipe_culvert");
  });

  it("HDPE pipe → pipe_culvert", () => {
    expect(classifyBoqItem("Supply and laying of HDPE pipe 300mm dia")).toBe("pipe_culvert");
  });

  it("Box culvert → pipe_culvert", () => {
    expect(classifyBoqItem("Construction of box culvert 1.5m x 1.5m")).toBe("pipe_culvert");
  });

  // ── Bridge / structure ────────────────────────────────────────────────────────
  it("Bridge abutment → bridge_structure", () => {
    expect(classifyBoqItem("RCC M30 for bridge abutment and pier")).toBe("bridge_structure");
  });

  it("Elastomeric bearing → bridge_structure", () => {
    expect(classifyBoqItem("Providing and placing elastomeric bearing pad 400x450mm")).toBe("bridge_structure");
  });

  it("Deck slab → bridge_structure", () => {
    expect(classifyBoqItem("Construction of RCC deck slab of bridge")).toBe("bridge_structure");
  });

  // ── Road furniture ────────────────────────────────────────────────────────────
  it("Crash barrier → road_furniture", () => {
    expect(classifyBoqItem("Providing and fixing metal beam crash barrier with posts")).toBe("road_furniture");
  });

  it("Kilometre stone → road_furniture", () => {
    expect(classifyBoqItem("Providing and erecting RCC kilometre stone at every km")).toBe("road_furniture");
  });

  it("Thermoplastic road marking → road_furniture", () => {
    expect(classifyBoqItem("Applying thermoplastic marking paint on road surface 150mm wide")).toBe("road_furniture");
  });

  // ── Electrical misc ──────────────────────────────────────────────────────────
  it("Street light → electrical_misc", () => {
    expect(classifyBoqItem("Supply and installation of LED street light with pole")).toBe("electrical_misc");
  });

  // ── Unknown misc (fallback) ───────────────────────────────────────────────────
  it("Unrecognised scope → unknown_misc (NOT electrical_misc)", () => {
    expect(classifyBoqItem("Providing temporary office accommodation for site staff")).toBe("unknown_misc");
  });

  it("Generic concrete without context → bridge_structure (structural default)", () => {
    // PCC without retaining/drain/road context → structural default
    expect(classifyBoqItem("Providing and laying plain cement concrete M15")).toBe("bridge_structure");
  });

  // ── Fallback not electrical ──────────────────────────────────────────────────
  it("Random text does NOT fall back to electrical_misc", () => {
    const result = classifyBoqItem("Dewatering and de-silting of irrigation channel");
    expect(result).not.toBe("electrical_misc");
  });
});
