import { vi, expect } from "vitest";

// The original tests run unchanged. Every invocation compares its mandatory
// output against the frozen pre-batch implementation, including key order.
vi.mock("../shared/dprSubmitReadiness", async importOriginal => {
  const actual = await importOriginal<typeof import("../shared/dprSubmitReadiness")>();
  const before = await import("./fixtures/boq-link-01/readiness-before");
  return {
    ...actual,
    evaluateDprSubmitReadiness(input: Parameters<typeof actual.evaluateDprSubmitReadiness>[0]) {
      const result = actual.evaluateDprSubmitReadiness(input);
      expect(JSON.stringify(result.mandatory)).toBe(JSON.stringify(before.evaluateDprSubmitReadiness(input).mandatory));
      return result;
    },
  };
});