import { describe, expect, it } from "vitest";
import { detectBoqBillBoundary } from "../shared/boqImportParsing";

describe("detectBoqBillBoundary", () => {
  it.each([
    ["BILL No. 1", "Earthwork", "BILL-1", "Earthwork"],
    ["Bill No 2", "Granular sub-base", "BILL-2", "Granular sub-base"],
    ["", "BILL-II: Bituminous works", "BILL-II", "Bituminous works"],
    ["SCHEDULE B", "Road furniture", "SCHEDULE B", "Road furniture"],
    ["", "Schedule-B — Drainage", "SCHEDULE B", "Drainage"],
  ])("recognises explicit marker %s / %s", (item, description, billNo, title) => {
    expect(detectBoqBillBoundary(item, description)).toEqual({ billNo, title });
  });

  it("does not guess a Bill boundary from a general heading or item code", () => {
    expect(detectBoqBillBoundary("", "Bill of Quantities")).toBeNull();
    expect(detectBoqBillBoundary("2.01", "Earthwork in excavation")).toBeNull();
  });
});