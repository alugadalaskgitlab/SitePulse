import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Concrete estimates page permission compatibility", () => {
  const app = readFileSync("client/src/App.tsx", "utf8");
  const route = app.split("\n").find(line => line.includes('path="/admin/concrete-estimates"'))!;
  const keys = [...route.matchAll(/"([^"]+)"/g)].map(match => match[1]).slice(1);
  it.each(["admin_settings", "concrete_estimates_manage", "concrete_calculator", "reports"])(
    "keeps %s as an independent entry grant", key => {
      expect(route).toContain("gatedEither(ConcreteEstimates,");
      expect(keys.some(section => section === key)).toBe(true);
    },
  );
  it("does not introduce an unrelated section grant", () => {
    expect(keys).toEqual(["concrete_calculator", "concrete_estimates_manage", "reports", "admin_settings"]);
  });
});