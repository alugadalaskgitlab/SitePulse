// Batch 06E-F — standalone Material Received form work-context helpers.
import { describe, it, expect } from "vitest";
import { arrangementLabel, barLabel, EMPTY_WORK_CONTEXT } from "../client/src/components/ReceiptWorkContext";

describe("06E-F readable labels (no raw IDs as primary UI)", () => {
  it("arrangement label reads agency — material · chainage · rate, never the integer id", () => {
    const label = arrangementLabel({
      id: 17, status: "approved", arrangementType: "vendor_material_delivered",
      boqProjectId: 10, boqItemId: 100,
      agencyName: "ABC Earthworks", materialLabel: "Borrow Earth supply/carting",
      chainageFrom: 2.0, chainageTo: 4.0, agreedRate: 180, uom: "Cum",
    });
    expect(label).toContain("ABC Earthworks — Borrow Earth supply/carting");
    expect(label).toContain("Ch. 2+000–4+000");
    expect(label).toContain("₹180/Cum");
    expect(label).not.toContain("17");
  });

  it("arrangement label degrades gracefully with sparse data", () => {
    expect(arrangementLabel({ id: 3, status: "approved", boqProjectId: 1, boqItemId: 2 } as any)).toBe("Arrangement #3");
    expect(arrangementLabel({ id: 3, status: "approved", boqProjectId: 1, boqItemId: 2, agencyName: "XYZ" } as any)).toBe("XYZ");
  });

  it("bar label shows side + chainage + window", () => {
    const label = barLabel({ id: 9, reachLabel: null, chainageFrom: 2.0, chainageTo: 2.15, side: "rhs", startDate: "2026-08-10", endDate: "2026-08-14" });
    expect(label).toContain("Ch. 2+000–2+150");
    expect(label).toContain("2026-08-10");
    expect(label.toLowerCase()).toContain("rhs");
  });

  it("EMPTY_WORK_CONTEXT is all-null — linkage is opt-in, never defaulted", () => {
    expect(EMPTY_WORK_CONTEXT).toEqual({ boqProjectId: null, boqItemId: null, programmeBarId: null, earthworkArrangementId: null });
  });
});
