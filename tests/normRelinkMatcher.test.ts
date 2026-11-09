import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { mergeMorthSnlNotes, parseMorthSdbWorkbook } from "../server/snlMorthParser";
import {
  explainMorthRelinkNoMatch,
  getMorthUnitConversion,
  matchMorthRelinkCandidate,
  matchMorthRelinkCandidates,
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
    specClause: item.specClause,
    sector: item.sector,
  }));

  const matchCode = (description: string, unit = "CUM", sector = "ROAD") =>
    matchMorthRelinkCandidate(description, unit, candidates, sector)?.candidate.code ?? null;

  it("uses exact work phrases in workbook titles instead of nearby codes", () => {
    expect(matchCode("Clearing and grubbing including uprooting trees", "sqm")).toBeNull();
    expect(matchCode("Clearing and grubbing by manual means in light jungle", "sqm")).toBe("2.3-i-A");
    expect(matchCode("Scarifying existing bituminous road surface", "sqm")).toBe("3.15");
    expect(matchCode("Construction of embankment with approved earth")).toBeNull();
    expect(explainMorthRelinkNoMatch("Construction of embankment with approved earth", candidates))
      .toContain("borrow pits (3.16) and roadway cutting (3.17)");
    expect(matchCode("Earthen shoulder construction including compaction")).toBe("3.18");
    expect(matchCode("Wet Mix Macadam (WMM), clause 406")).toBe("4.12");
    expect(matchCode("Wet Mix Macadam (WMM) layer")).toBe("4.12");
    expect(matchCode("Prime coat with bitumen emulsion", "sqm")).toBe("5.1");
    expect(matchCode("Tack coat between bituminous layers", "sqm")).toBe("5.2");
    expect(matchCode("Tack coat over DGBM", "sqm")).toBe("5.2");
    expect(matchMorthRelinkCandidates("Dense Graded Bituminous Macadam (DGBM), 50 mm", "CUM", candidates)
      .map(row => row.candidate.code)).toEqual(["5.6-i", "5.6-ii"]);
    expect(matchMorthRelinkCandidates("Bituminous Concrete (BC), 40 mm", "CUM", candidates)
      .map(row => row.candidate.code)).toEqual(["5.8-i", "5.8-ii"]);
    expect(matchCode("PCC 1:3:6", "cum", "ROAD")).toBe("9.1");
  });

  it("does not guess where the BOQ omits a distinguishing application or row arrangement", () => {
    const m15 = "M15 concrete";
    expect(matchCode(m15)).toBeNull();
    expect(matchMorthRelinkCandidates(m15, "CUM", candidates, "ROAD")
      .map(row => row.candidate.code)).toEqual(["12.8-A", "12.11-I", "13.5-A"]);
    expect(explainMorthRelinkNoMatch(m15, candidates))
      .toContain("does not state the application");

    const pipe = "1000 mm NP4 pipe";
    expect(matchCode(pipe, "m")).toBeNull();
    expect(explainMorthRelinkNoMatch(pipe, candidates))
      .toContain("single-row and double-row");
  });

  it("supports the explicit square-metre to hectare conversion for clearing", () => {
    const result = matchMorthRelinkCandidate(
      "Clearing and grubbing road land by manual means in light jungle",
      "sqm",
      candidates,
      "ROAD",
    );
    expect(result?.candidate.code).toBe("2.3-i-A");
    expect(result?.canApply).toBe(true);
    expect(result?.normUnitsPerBoqUnit).toBeCloseTo(0.0001);
    expect(result?.reason).toContain("1 hectare = 10,000 sqm");
    expect(getMorthUnitConversion("HECTARE", "sqm")?.normUnitsPerBoqUnit).toBe(10_000);
  });

  it("offers all four clearing cases when the BOQ omits method and ground cover", () => {
    const choices = matchMorthRelinkCandidates(
      "Clearing and grubbing road land",
      "sqm",
      candidates,
      "ROAD",
    );
    expect(choices.map(choice => choice.candidate.code)).toEqual([
      "2.3-i-A",
      "2.3-i-B",
      "2.3-ii-A",
      "2.3-ii-B",
    ]);
    expect(choices.every(choice => choice.canApply && choice.normUnitsPerBoqUnit === 0.0001)).toBe(true);
    expect(matchCode("Clearing and grubbing road land")).toBeNull();
    expect(matchCode(
      "Clearing and grubbing road land by mechanical means in light jungle",
      "sqm",
    )).toBe("2.3-ii-A");
  });

  it("uses workbook spec clauses before title similarity and never guesses a missing BOQ unit", () => {
    expect(workbookItems.find(item => item.code === "4.12")?.specClause).toBe("406");
    expect(workbookItems.find(item => item.code === "5.1")?.specClause).toBe("502");
    expect(workbookItems.find(item => item.code === "5.2")?.specClause).toBe("503");
    expect(matchCode("Wet mix macadam, clause 406", "CUM")).toBe("4.12");
    expect(mergeMorthSnlNotes("MoRTH spec note: stale note", {
      specClauseNote: "Item 202 (b) and (c)",
    })).toBe("MoRTH spec note: Item 202 (b) and (c)");

    const noUnit = matchMorthRelinkCandidates("Clearing and grubbing road land", "", candidates);
    expect(noUnit).toHaveLength(4);
    expect(noUnit.every(row => !row.canApply && row.blockedReason === "Unit missing in BOQ")).toBe(true);
  });

  it("uses title-word matching for broader wording, honors grading details, and excludes foundation sand for pavers", () => {
    expect(matchCode("Wet mix macadam layer with vibratory compaction, clause 406", "CUM")).toBe("4.12");
    expect(matchCode("Dense graded bituminous macadam, grading II", "CUM")).toBe("5.6-ii");
    expect(matchCode("Girth size above 300mm upto 600mm", "Nos")).toBe("2.1-i");
    expect(matchCode("Girth size above 600mm upto 900mm", "Nos")).toBe("2.1-ii");
    expect(getMorthUnitConversion("Rmt", "METRE")?.normUnitsPerBoqUnit).toBe(1);
    const paverSand = matchMorthRelinkCandidates("Sand filling beneath concrete pavers", "CUM", candidates);
    expect(paverSand.map(row => row.candidate.code)).toEqual(["7.3", "14.18-iv"]);
    expect(paverSand.every(row => row.reason.includes("not"))).toBe(true);
  });
});
