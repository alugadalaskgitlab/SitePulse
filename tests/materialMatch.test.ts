import { describe, it, expect } from "vitest";
import { canonMaterialName } from "../shared/materialMatch";

describe("canonMaterialName", () => {
  it("normalises common variants", () => {
    expect(canonMaterialName("GSB")).toBe("GSB");
    expect(canonMaterialName("GSB Material")).toBe("GSB");
    expect(canonMaterialName("20 MM Aggregate")).toBe("20MM");
    expect(canonMaterialName("6mm Down")).toBe("6MMDOWN");
    expect(canonMaterialName("WMM")).toBe("WMM");
  });
});
