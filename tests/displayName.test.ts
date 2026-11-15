import { describe, expect, it } from "vitest";
import { displayName } from "../shared/displayName";

describe("displayName", () => {
  it("uppercases display text without changing the source value", () => {
    const storedName = "Md Fasiuddin";
    expect(displayName(storedName)).toBe("MD FASIUDDIN");
    expect(storedName).toBe("Md Fasiuddin");
  });

  it("preserves empty values", () => {
    expect(displayName(null)).toBe("");
    expect(displayName(undefined)).toBe("");
  });
});
