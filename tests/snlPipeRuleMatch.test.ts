import { describe, expect, it } from "vitest";
import { detectCompositeComponents, ruleMatchSnl } from "../server/snlAutoMapper";

const candidates = [
  { id: 1, description: "RCC hume pipe NP3 600mm", shortLabel: "NP3 600mm", unit: "RM" },
  { id: 2, description: "RCC pipe NP4 1000mm on first class bedding in single row", shortLabel: "NP4 1000mm single row", unit: "RM" },
  { id: 3, description: "RCC pipe NP4 1000mm on first class bedding in double row", shortLabel: "NP4 1000mm double row", unit: "RM" },
  { id: 4, description: "RCC pipe NP4 1200mm on first class bedding in single row", shortLabel: "NP4 1200mm single row", unit: "RM" },
];

describe("pipe-culvert deterministic rule matching", () => {
  it("selects the exact diameter, class, and row arrangement at the unchanged rule confidence", () => {
    expect(ruleMatchSnl(
      "PIPE_CULVERT",
      candidates,
      "Laying 1000 mm dia NP4 RCC pipe on first class bedding in single row",
    )).toEqual({ snlItemId: 2, confidence: 0.82 });
  });

  it("never substitutes a different diameter or NP class", () => {
    expect(ruleMatchSnl(
      "PIPE_CULVERT",
      candidates.filter(candidate => candidate.id !== 2 && candidate.id !== 3),
      "Laying 1000 mm dia NP4 RCC pipe",
    )).toBeNull();
  });

  it("treats RCC as the pipe product rather than a spurious concrete component", () => {
    expect(detectCompositeComponents(
      "Providing and laying reinforced cement concrete Hume pipes of 1000 mm dia NP4 class for pipe culverts",
    )).toBeNull();
  });

  it("uses one-vent section context to select the 9.2 single-row candidate", () => {
    expect(ruleMatchSnl(
      "PIPE_CULVERT",
      candidates,
      "Laying 1000 mm dia NP4 RCC Hume pipe · HP Culvert 1V",
    )).toEqual({ snlItemId: 2, confidence: 0.82 });
  });
});