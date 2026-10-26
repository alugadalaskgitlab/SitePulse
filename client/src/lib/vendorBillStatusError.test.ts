import { describe, expect, it } from "vitest";
import {
  vendorBillHsdRecoveryMonths,
  vendorBillStatusError,
} from "./vendorBillStatusError";

describe("vendor bill HSD verification guidance", () => {
  const error = new Error(
    '409: {"error":"Complete the hire review before verification: 2026-08-20–2026-09-15: HSD recovery disposition; 2026-10-01–2026-10-31: HSD recovery disposition; 2026-10-01–2026-10-31: operator_unavailable on 2026-10-12"}',
  );

  it("identifies every blocked calendar month without duplicating them", () => {
    expect(vendorBillHsdRecoveryMonths(error)).toEqual([
      { key: "2026-08", label: "August 2026" },
      { key: "2026-09", label: "September 2026" },
      { key: "2026-10", label: "October 2026" },
    ]);
  });

  it("names the HLC diesel reconciliation, the months, and the choices without hiding other review gaps", () => {
    const result = vendorBillStatusError(error);
    expect(result.title).toBe("HLC diesel reconciliation needs a decision");
    expect(result.description).toContain("August 2026, September 2026, October 2026");
    expect(result.description).toContain("Accept Suggested, Edit, or No Recovery");
    expect(result.description).toContain("operator_unavailable on 2026-10-12");
  });
});
