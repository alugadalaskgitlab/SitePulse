import { describe, it, expect } from "vitest";
import { equipmentStatusInputError, equipmentStatusRequiresReason } from "../shared/equipmentStatus";
import { evaluateDprSubmitReadiness } from "../shared/dprSubmitReadiness";
import { createDprRequestSchema } from "../shared/schema";

describe("UX-FIX-01 second deliberate mandatory rule", () => {
  it("requires the exact Breakdown message only in the DPR entry/write context", () => {
    const row = { machine: "Excavator", usageStatus: "breakdown" as const };
    expect(equipmentStatusInputError(row, true)).toBe("Enter the breakdown reason");
    expect(equipmentStatusInputError(row)).toBeNull(); // non-DPR contract unchanged
    expect(evaluateDprSubmitReadiness({equipment:[row]}).mandatory).toContainEqual({
      section:"equipment", label:"Excavator", message:"Enter the breakdown reason", rowIndex:0,
    });
    const request = {site:"Test site",date:"2026-10-03",engineer:"Test",equipment:[row]};
    const invalid = createDprRequestSchema.safeParse(request);
    expect(invalid.success).toBe(false);
    if (!invalid.success) expect(invalid.error.issues).toContainEqual(expect.objectContaining({
      message:"Enter the breakdown reason",path:["equipment",0,"usageStatusReason"],
    }));
    expect(createDprRequestSchema.safeParse({...request,equipment:[{...row,usageStatusReason:"Hydraulic leak"}]}).success).toBe(true);
  });
  it("leaves all other statuses unchanged", () => {
    expect(equipmentStatusRequiresReason("idle_no_work", true)).toBe(true);
    expect(equipmentStatusInputError({usageStatus:"idle_no_work"}, true)).toBe("A reason is required for Idle — No Work status");
    for(const status of ["working","idle_no_operator",null]) {
      expect(equipmentStatusRequiresReason(status,true)).toBe(false);
      expect(equipmentStatusInputError({usageStatus:status},true)).toBeNull();
    }
  });
});