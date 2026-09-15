import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("VB-15 duplicate-safe grouped pull wiring", () => {
  const client = readFileSync("client/src/pages/VendorBills.tsx", "utf8");
  const shared = readFileSync("shared/hireBilling.ts", "utf8");

  it("preflights the exact available source payload while retaining VB-11 grouping", () => {
    expect(client).toContain("availableOtherItems.map(duplicateBillItemPayload)");
    expect(client).toContain('"/api/vendor-bills/check-duplicates"');
    expect(client).toContain("groupRateItems(candidates)");
    expect(client).toContain("alreadyBilledCount");
    expect(client).toContain("toPullCount");
  });

  it("pulls billed rows for review and exposes a repeatable exclusion action", () => {
    expect(client).not.toContain('data-testid="checkbox-include-already-billed"');
    expect(client).not.toContain("setIncludeAlreadyBilled");
    expect(client).toContain('data-testid="button-exclude-already-billed"');
    expect(client).toContain("setLineItems(prev => prev.filter(item => !item.billedIn))");
    expect(client).toContain("if (pulledCount > 0)");
    expect(client).toContain("prev.filter(item => !item.initialBlank)");
  });

  it("aborts on duplicate-check failures and deduplicates multi-match responses", () => {
    expect(client).toContain("Could not check duplicate billed items");
    expect(client).toContain("Duplicate check returned an invalid response");
    expect(client).toContain("uniqueDuplicateBillMatches");
    expect(shared).toContain("const seen = new Set<number>()");
  });
});