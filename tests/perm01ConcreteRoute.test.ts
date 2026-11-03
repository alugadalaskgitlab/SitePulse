import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Concrete estimates feature permissions", () => {
  const app = readFileSync("client/src/App.tsx", "utf8");
  const page = readFileSync("client/src/pages/ConcreteEstimates.tsx", "utf8");
  const route = app.split("\n").find(line => line.includes('path="/admin/concrete-estimates"'))!;
  it("uses the Estimating feature for route access and action controls", () => {
    expect(route).toContain('featureGated(ConcreteEstimates, "estimating")');
    expect(page).toContain('featureCan("estimating", "add")');
    expect(page).toContain('featureCan("estimating", "cancel")');
    expect(page).not.toContain("readEstimatorRole()");
  });
});