import { describe, it, expect } from "vitest";
import { unitNorm, classifyItem, detectAnomalies } from "../client/src/lib/resourceReview";

// ─── unitNorm ─────────────────────────────────────────────────────────────────

describe("unitNorm — cubic metre variants", () => {
  it("handles plain CUM", () => expect(unitNorm("CUM")).toBe("CUM"));
  it("handles Cum (mixed case)", () => expect(unitNorm("Cum")).toBe("CUM"));
  it("handles cum (lowercase)", () => expect(unitNorm("cum")).toBe("CUM"));
  it("handles '1 Cum' prefix", () => expect(unitNorm("1 Cum")).toBe("CUM"));
  it("handles '1.00 Cum' prefix", () => expect(unitNorm("1.00 Cum")).toBe("CUM"));
  it("handles '1.00Cum' no-space prefix", () => expect(unitNorm("1.00Cum")).toBe("CUM"));
  it("handles Cu.m", () => expect(unitNorm("Cu.m")).toBe("CUM"));
  it("handles 'Cu M' with space", () => expect(unitNorm("Cu M")).toBe("CUM"));
  it("handles m3", () => expect(unitNorm("m3")).toBe("CUM"));
  it("handles M3 (uppercase)", () => expect(unitNorm("M3")).toBe("CUM"));
  it("handles 'cubic metre'", () => expect(unitNorm("cubic metre")).toBe("CUM"));
  it("handles 'cubic meter'", () => expect(unitNorm("cubic meter")).toBe("CUM"));
  it("handles 'Cubic Metres'", () => expect(unitNorm("Cubic Metres")).toBe("CUM"));
  it("does not mangle SQM", () => expect(unitNorm("SQM")).toBe("SQM"));
  it("does not mangle RMT", () => expect(unitNorm("RMT")).toBe("RMT"));
  it("does not mangle MT", () => expect(unitNorm("MT")).toBe("MT"));
  it("does not mangle NOS", () => expect(unitNorm("NOS")).toBe("NOS"));
  it("strips '1 NOS' prefix", () => expect(unitNorm("1 NOS")).toBe("NOS"));
});

// ─── classifyItem — earthwork descriptions ────────────────────────────────────

const tankerEq = [{ equipmentName: "Water tanker" }];

describe("classifyItem — embankment items (the four false-flag items)", () => {
  it("embankment with excavated roadway earth → earthwork", () => {
    expect(classifyItem({ description: "Embankment with excavated roadway earth", unit: "1 Cum" })).toBe("earthwork");
  });
  it("embankment with borrowed earth → earthwork", () => {
    expect(classifyItem({ description: "Embankment with Borrowed earth from approved Borrow pits", unit: "Cum" })).toBe("earthwork");
  });
  it("subgrade with approved borrow material → earthwork", () => {
    expect(classifyItem({ description: "Subgrade with approved borrow material", unit: "1.00 Cum" })).toBe("earthwork");
  });
  it("earthen shoulders with selected soil → earthwork", () => {
    expect(classifyItem({ description: "Earthen Shoulders with selected soil", unit: "Cu.m" })).toBe("earthwork");
  });
});

describe("classifyItem — earthwork terms", () => {
  it("roadway excavation → earthwork", () => {
    expect(classifyItem({ description: "Roadway excavation in ordinary rock", unit: "CUM" })).toBe("earthwork");
  });
  it("earthwork excavation → earthwork", () => {
    expect(classifyItem({ description: "Earthwork excavation in all types of soil", unit: "CUM" })).toBe("earthwork");
  });
  it("earth filling → earthwork", () => {
    expect(classifyItem({ description: "Earth filling behind abutments with approved material", unit: "CUM" })).toBe("earthwork");
  });
  it("filling with excavated earth → earthwork", () => {
    expect(classifyItem({ description: "Filling with excavated earth in layers", unit: "CUM" })).toBe("earthwork");
  });
  it("borrow pits → earthwork", () => {
    expect(classifyItem({ description: "Borrowing earth from approved borrow pits", unit: "CUM" })).toBe("earthwork");
  });
  it("selected soil → earthwork", () => {
    expect(classifyItem({ description: "Filling with selected soil in layers and compacting", unit: "CUM" })).toBe("earthwork");
  });
  it("earthen shoulder → earthwork", () => {
    expect(classifyItem({ description: "Earthen shoulder construction", unit: "CUM" })).toBe("earthwork");
  });
});

describe("classifyItem — unit variants still classify correctly", () => {
  it("embankment with 'm3' unit → earthwork", () => {
    expect(classifyItem({ description: "Embankment with excavated earth", unit: "m3" })).toBe("earthwork");
  });
  it("embankment with 'Cu M' unit → earthwork", () => {
    expect(classifyItem({ description: "Embankment with borrowed earth", unit: "Cu M" })).toBe("earthwork");
  });
  it("earthwork with '1.00 Cum' unit → earthwork", () => {
    expect(classifyItem({ description: "Earth work excavation in hard rock", unit: "1.00 Cum" })).toBe("earthwork");
  });
});

describe("classifyItem — workCategory hint", () => {
  it("EARTHWORK category with unusual unit → earthwork", () => {
    expect(classifyItem({ description: "Fill material", unit: "1Cbm", workCategory: "EARTHWORK" })).toBe("earthwork");
  });
  it("SHOULDERS_MEDIANS category → earthwork", () => {
    expect(classifyItem({ description: "Shoulder construction", unit: "1 Cum", workCategory: "SHOULDERS_MEDIANS" })).toBe("earthwork");
  });
});

// ─── classifyItem — non-earthwork sanity checks ───────────────────────────────

describe("classifyItem — other classes unaffected", () => {
  it("prime coat → spray", () => {
    expect(classifyItem({ description: "Prime coat with bituminous emulsion", unit: "SQM" })).toBe("spray");
  });
  it("WMM → pavement", () => {
    expect(classifyItem({ description: "Wet Mix Macadam sub-base course", unit: "CUM" })).toBe("pavement");
  });
  it("PCC → concrete", () => {
    expect(classifyItem({ description: "PCC M20 grade plain cement concrete", unit: "CUM" })).toBe("concrete");
  });
  it("NOS unit → counted", () => {
    expect(classifyItem({ description: "Supply of guard post", unit: "NOS" })).toBe("counted");
  });
  it("LS unit → lumpsum", () => {
    expect(classifyItem({ description: "Mobilization charges", unit: "LS" })).toBe("lumpsum");
  });
  it("bridge → structural", () => {
    expect(classifyItem({ description: "Construction of bridge deck slab", unit: "CUM" })).toBe("structural");
  });
  it("culvert drain → structural", () => {
    // Use a description without RCC/PCC prefix so it is not captured by the concrete check first
    expect(classifyItem({ description: "Box culvert construction in concrete", unit: "CUM" })).toBe("structural");
  });
});

// ─── detectAnomalies — water tanker ──────────────────────────────────────────

describe("detectAnomalies — water tanker on earthwork must NOT be flagged", () => {
  it("embankment with excavated earth + tanker → no tanker flag", () => {
    const flags = detectAnomalies({
      description: "Embankment with excavated roadway earth", unit: "1 Cum",
      equipment: tankerEq, labour: [], materials: [],
    });
    expect(flags.some(f => f.code === "tanker")).toBe(false);
  });

  it("embankment with borrowed earth + tanker → no tanker flag", () => {
    const flags = detectAnomalies({
      description: "Embankment with Borrowed earth", unit: "Cum",
      equipment: tankerEq, labour: [], materials: [],
    });
    expect(flags.some(f => f.code === "tanker")).toBe(false);
  });

  it("subgrade with borrow material + tanker → no tanker flag", () => {
    const flags = detectAnomalies({
      description: "Subgrade with approved borrow material", unit: "1.00 Cum",
      equipment: tankerEq, labour: [], materials: [],
    });
    expect(flags.some(f => f.code === "tanker")).toBe(false);
  });

  it("earthen shoulders with selected soil + tanker → no tanker flag", () => {
    const flags = detectAnomalies({
      description: "Earthen Shoulders with selected soil", unit: "Cu.m",
      equipment: tankerEq, labour: [], materials: [],
    });
    expect(flags.some(f => f.code === "tanker")).toBe(false);
  });

  it("pavement item + tanker → no tanker flag", () => {
    const flags = detectAnomalies({
      description: "Dense Bituminous Macadam layer", unit: "CUM",
      layerType: "bituminous", equipment: tankerEq, labour: [], materials: [],
    });
    expect(flags.some(f => f.code === "tanker")).toBe(false);
  });

  it("concrete item + tanker → no tanker flag", () => {
    const flags = detectAnomalies({
      description: "PCC M15 concrete", unit: "CUM",
      equipment: tankerEq, labour: [], materials: [],
    });
    expect(flags.some(f => f.code === "tanker")).toBe(false);
  });
});

describe("detectAnomalies — water tanker on genuinely unrelated items MUST be flagged", () => {
  it("counted item (NOS) + tanker → tanker flag raised", () => {
    const flags = detectAnomalies({
      description: "Supply of guard rails", unit: "NOS",
      equipment: tankerEq, labour: [], materials: [],
    });
    expect(flags.some(f => f.code === "tanker")).toBe(true);
  });

  it("lump-sum item + tanker → tanker flag raised", () => {
    const flags = detectAnomalies({
      description: "Preliminary expenses", unit: "LS",
      equipment: tankerEq, labour: [], materials: [],
    });
    expect(flags.some(f => f.code === "tanker")).toBe(true);
  });

  it("structural item (abutment) + tanker → tanker flag raised", () => {
    // Abutment has no RCC/PCC/concrete keyword, so it is correctly classified as structural
    const flags = detectAnomalies({
      description: "Bridge abutment construction including form work", unit: "CUM",
      equipment: tankerEq, labour: [], materials: [],
    });
    expect(flags.some(f => f.code === "tanker")).toBe(true);
  });
});

describe("detectAnomalies — warning grammar is correct", () => {
  it("tanker flag message uses 'an item classified as' phrasing", () => {
    const flags = detectAnomalies({
      description: "Supply of guard rails", unit: "NOS",
      equipment: tankerEq, labour: [], materials: [],
    });
    const msg = flags.find(f => f.code === "tanker")?.message ?? "";
    expect(msg).toMatch(/an item classified as/i);
    expect(msg).not.toMatch(/\ba other\b/i);
    expect(msg).not.toMatch(/\ba other\b/i);
  });
});
