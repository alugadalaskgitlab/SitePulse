import { expect, it } from "vitest";
import { hireGroupRequestSchema } from "../shared/schema";

const hireGroup = {
  equipmentId: 1,
  periodFrom: "2026-10-01",
  periodTo: "2026-10-31",
  basis: "monthly",
  rate: 90000,
  adjustments: {
    advanceAdjustment: 1200,
    advanceAdjustmentReason: "Matched to verified advance",
  },
};

it("accepts an optional valid advance payment date in the existing hire adjustment payload", () => {
  expect(hireGroupRequestSchema.safeParse(hireGroup).success).toBe(true);
  expect(hireGroupRequestSchema.safeParse({
    ...hireGroup,
    adjustments: { ...hireGroup.adjustments, advanceAdjustmentDate: "2026-10-24" },
  }).success).toBe(true);
  expect(hireGroupRequestSchema.safeParse({
    ...hireGroup,
    adjustments: { ...hireGroup.adjustments, advanceAdjustmentDate: null },
  }).success).toBe(true);
});

it("rejects an advance payment date that is not a saved YYYY-MM-DD date", () => {
  expect(hireGroupRequestSchema.safeParse({
    ...hireGroup,
    adjustments: { ...hireGroup.adjustments, advanceAdjustmentDate: "24/10/2026" },
  }).success).toBe(false);
});
