import { describe, it, expect } from "vitest";
import { derivePlanningMode, type PlanningModeBarInput } from "@shared/planningEngine";

// Task #1240 — non-breaking `planning_mode` classification. This never reads
// or writes the DB; it only classifies a BOQ item's bars for display.

describe("derivePlanningMode", () => {
  it("returns not_plannable_without_input for empty/missing bars", () => {
    expect(derivePlanningMode([])).toBe("not_plannable_without_input");
    expect(derivePlanningMode(undefined as unknown as PlanningModeBarInput[])).toBe("not_plannable_without_input");
  });

  it("returns structure_location when any bar is explicitly structure_location", () => {
    const bars: PlanningModeBarInput[] = [
      { planningMode: null, source: "auto", reachLabel: "Reach 1" },
      { planningMode: "structure_location", source: "structure_wizard", reachLabel: "Bridge Grp 1" },
    ];
    expect(derivePlanningMode(bars)).toBe("structure_location");
  });

  it("structure_location takes priority even if other bars are imported_schedule", () => {
    const bars: PlanningModeBarInput[] = [
      { planningMode: "imported_schedule" },
      { planningMode: "structure_location" },
    ];
    expect(derivePlanningMode(bars)).toBe("structure_location");
  });

  it("passes through explicit imported_schedule value", () => {
    const bars: PlanningModeBarInput[] = [{ planningMode: "imported_schedule" }];
    expect(derivePlanningMode(bars)).toBe("imported_schedule");
  });

  it("passes through explicit manual_planning value", () => {
    const bars: PlanningModeBarInput[] = [{ planningMode: "manual_planning" }];
    expect(derivePlanningMode(bars)).toBe("manual_planning");
  });

  it("classifies bars with source=import as imported_schedule when planningMode is null", () => {
    const bars: PlanningModeBarInput[] = [{ planningMode: null, source: "import", reachLabel: "Sheet1 Row3" }];
    expect(derivePlanningMode(bars)).toBe("imported_schedule");
  });

  it("classifies bars with source=schedule_import as imported_schedule", () => {
    const bars: PlanningModeBarInput[] = [{ planningMode: null, source: "schedule_import" }];
    expect(derivePlanningMode(bars)).toBe("imported_schedule");
  });

  it("classifies hand-placed manual bars with a custom label as manual_planning", () => {
    const bars: PlanningModeBarInput[] = [{ planningMode: null, source: "manual", reachLabel: "Near old bridge site" }];
    expect(derivePlanningMode(bars)).toBe("manual_planning");
  });

  it("does NOT classify manual bars with auto-generated labels as manual_planning", () => {
    const bars: PlanningModeBarInput[] = [{ planningMode: null, source: "manual", reachLabel: "Reach 3" }];
    expect(derivePlanningMode(bars)).toBe("road_reach");
  });

  it("defaults to road_reach for auto-sequenced bars with no source recorded (legacy)", () => {
    const bars: PlanningModeBarInput[] = [{ planningMode: null, source: null, reachLabel: "Full Length" }];
    expect(derivePlanningMode(bars)).toBe("road_reach");
  });

  it("defaults to road_reach for typical auto-generated chainage labels", () => {
    const bars: PlanningModeBarInput[] = [{ planningMode: null, source: "auto", reachLabel: "Struct. Front 2" }];
    expect(derivePlanningMode(bars)).toBe("road_reach");
  });
});
