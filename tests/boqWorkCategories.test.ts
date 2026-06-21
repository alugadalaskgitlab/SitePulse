import { describe, it, expect } from "vitest";
import { suggestWorkCategory } from "../shared/boqWorkCategories";

describe("suggestWorkCategory", () => {
  it("returns null for null/undefined/empty input", () => {
    expect(suggestWorkCategory(null)).toBeNull();
    expect(suggestWorkCategory(undefined)).toBeNull();
    expect(suggestWorkCategory("")).toBeNull();
  });

  it("maps chapter 1.x to PRELIM", () => {
    expect(suggestWorkCategory("1.01")).toBe("PRELIM");
    expect(suggestWorkCategory("1-05")).toBe("PRELIM");
  });

  it("maps chapter 2.x to SITE_CLEARANCE", () => {
    expect(suggestWorkCategory("2.03")).toBe("SITE_CLEARANCE");
  });

  it("maps chapter 3.x to EARTHWORK", () => {
    expect(suggestWorkCategory("3.01")).toBe("EARTHWORK");
    expect(suggestWorkCategory("3.10")).toBe("EARTHWORK");
  });

  it("maps chapter 4.x to SUBBASE_BASE", () => {
    expect(suggestWorkCategory("4.01")).toBe("SUBBASE_BASE");
  });

  it("maps chapter 5.x to BITUMINOUS", () => {
    expect(suggestWorkCategory("5.4.1")).toBe("BITUMINOUS");
    expect(suggestWorkCategory("5_2")).toBe("BITUMINOUS");
  });

  it("maps chapter 6.x to CONCRETE", () => {
    expect(suggestWorkCategory("6.01")).toBe("CONCRETE");
  });

  it("maps chapter 7.x to DRAINAGE", () => {
    expect(suggestWorkCategory("7.03")).toBe("DRAINAGE");
  });

  it("maps chapter 8.x to ROAD_FURNITURE", () => {
    expect(suggestWorkCategory("8.01")).toBe("ROAD_FURNITURE");
  });

  it("maps chapter 9.x to CROSS_DRAINAGE", () => {
    expect(suggestWorkCategory("9.01")).toBe("CROSS_DRAINAGE");
  });

  it("maps chapter 10.x to MAJOR_BRIDGES", () => {
    expect(suggestWorkCategory("10.01")).toBe("MAJOR_BRIDGES");
  });

  it("maps chapter 11.x to BUILDINGS", () => {
    expect(suggestWorkCategory("11.01")).toBe("BUILDINGS");
  });

  it("maps chapter 12.x to ELECTRICAL", () => {
    expect(suggestWorkCategory("12.01")).toBe("ELECTRICAL");
  });

  it("maps chapter 13.x to ENVIRONMENTAL", () => {
    expect(suggestWorkCategory("13.01")).toBe("ENVIRONMENTAL");
  });

  it("returns null for unrecognized chapter numbers (not MISCELLANEOUS)", () => {
    expect(suggestWorkCategory("14.01")).toBeNull();
    expect(suggestWorkCategory("99.01")).toBeNull();
    expect(suggestWorkCategory("0.01")).toBeNull();
    expect(suggestWorkCategory("20.01")).toBeNull();
  });

  it("returns null for non-numeric item codes", () => {
    expect(suggestWorkCategory("ABC-001")).toBeNull();
    expect(suggestWorkCategory("SH/01")).toBeNull();
  });
});
