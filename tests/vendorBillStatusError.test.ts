import { describe, expect, it } from "vitest";
import { vendorBillStatusError } from "../client/src/lib/vendorBillStatusError";

describe("vendor bill status error wording", () => {
  for (const message of [
    "Record the remaining equipment hire balance before marking this bill paid.",
    "Record the cumulative equipment hire payment before marking this bill paid.",
  ]) {
    it(`explains the next step for ${message}`, () => {
      const result = vendorBillStatusError(new Error(`409: ${JSON.stringify({ message })}`));
      expect(result.title).toBe("Payment balance still outstanding");
      expect(result.description).toContain("Payment Details");
      expect(result.description).toContain("actually paid");
      expect(result.description).toContain("full net payable");
      expect(result.description).not.toContain("409:");
      expect(result.description).not.toContain('{"');
    });
  }
  it("preserves other server explanations without JSON or HTTP wrappers", () => {
    expect(vendorBillStatusError(new Error('403: {"error":"You cannot approve your own bill."}')).description)
      .toBe("You cannot approve your own bill.");
  });
  it("preserves plain errors", () => {
    expect(vendorBillStatusError(new Error("Network unavailable")).description).toBe("Network unavailable");
  });
});