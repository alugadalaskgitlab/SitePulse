import { describe, expect, it } from "vitest";
import { readDprWriteTokens, requireDprWriteTokens } from "../client/src/lib/dprSectionTokens";

describe("DPR-13 legacy editor write-token baseline", () => {
  const snapshot = () => ({
    headerToken: "h0",
    sectionTokens: { activity: "a0", equipment: "e0", labour: "l0", materials: "m0" },
  });
  it("copies the hydrated baseline rather than following mutations of cached query data", () => {
    const cached = snapshot();
    const baseline = readDprWriteTokens(cached);
    cached.sectionTokens.equipment = "e1";
    cached.headerToken = "h1";
    expect(requireDprWriteTokens(baseline)).toEqual(snapshot());
  });
  it("requires complete tokens and fails closed for an old/malformed response", () => {
    expect(readDprWriteTokens({ headerToken: "h0", sectionTokens: { activity: "a0" } })).toBeNull();
    expect(readDprWriteTokens(undefined)).toBeNull();
    expect(() => requireDprWriteTokens(null)).toThrow(/Reload the saved DPR/);
  });
  it("accepts a complete successful-persist receipt as a new explicit baseline", () => {
    const saved = snapshot();
    saved.headerToken = "h2";
    saved.sectionTokens.materials = "m2";
    expect(requireDprWriteTokens(readDprWriteTokens(saved))).toEqual(saved);
  });
});