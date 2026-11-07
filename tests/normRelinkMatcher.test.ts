import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseMorthSdbWorkbook } from "../server/snlMorthParser";
import {
  explainMorthRelinkNoMatch,
  matchMorthRelinkCandidate,
} from "../server/snlMorthRelinkMatcher";

describe("MoRTH re-link title matching", () => {
  const workbookItems = parseMorthSdbWorkbook(readFileSync(resolve(
    process.cwd(),
    "attached_assets/MoRTH_Standard-Data-Book-Road-Bridge_1782816790434.xlsx",
  )));
  const candidates = workbookItems.map(item => ({
    code: item.code,
    title: item.title,
    description: item.description,
    unit: item.unit,
    sector: item.sector,
  }));

  const matchCode = (description: string, unit = "CUM", sector = "ROAD") =>
    matchMorthRelinkCandidate(description, unit, candidates, sector)?.candidate.code ?? null;

  it("uses exact work phrases in workbook titles instead of nearby codes", () => {
    expect(matchCode("Clearing and grubbing including uprooting trees", "sqm")).toBe("2.3");
    expect(matchCode("Scarifying existing bituminous road surface", "sqm")).toBe("3.15");
    expect(matchCode("Construction of embankment with approved earth")).toBeNull();
    expect(explainMorthRelinkNoMatch("Construction of embankment with approved earth", candidates))
      .toContain("borrow pits (3.16) and roadway cutting (3.17)");
    expect(matchCode("Earthen shoulder construction including compaction")).toBe("3.18");
    expect(matchCode("Wet Mix Macadam (WMM), clause 406")).toBe("4.12");
    expect(matchCode("Prime coat with bitumen emulsion", "sqm")).toBe("5.1");
    expect(matchCode("Tack coat between bituminous layers", "sqm")).toBe("5.2");
    expect(matchCode("Tack coat over DGBM", "sqm")).toBe("5.2");
    expect(matchCode("Dense Graded Bituminous Macadam (DGBM), 50 mm")).toBe("5.6");
    expect(matchCode("Bituminous Concrete (BC), 40 mm")).toBe("5.8");
    expect(matchCode("PCC 1:3:6", "cum", "ROAD")).toBe("9.1");
  });

  it("does not guess where the BOQ omits a distinguishing application or row arrangement", () => {
    const m15 = "M15 concrete";
    expect(matchCode(m15)).toBeNull();
    expect(explainMorthRelinkNoMatch(m15, candidates))
      .toContain("does not state the application");

    const pipe = "1000 mm NP4 pipe";
    expect(matchCode(pipe, "m")).toBeNull();
    expect(explainMorthRelinkNoMatch(pipe, candidates))
      .toContain("single-row and double-row");
  });

  it("shows an exact title proposal but prevents applying incompatible units", () => {
    const result = matchMorthRelinkCandidate(
      "Clearing and grubbing road land",
      "sqm",
      candidates,
      "ROAD",
    );
    expect(result?.candidate.code).toBe("2.3");
    expect(result?.canApply).toBe(false);
    expect(result?.reason).toContain("BOQ sqm; MoRTH HECTARE");
  });
});
