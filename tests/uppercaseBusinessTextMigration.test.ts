import { describe, expect, it } from "vitest";
import fs from "node:fs";

describe("uppercase business-text migration", () => {
  it("updates only allowlisted BOQ project labels and remains idempotent", () => {
    const sql = fs.readFileSync("migrations/0027_uppercase_business_text.sql", "utf8");
    expect(sql).toMatch(/UPDATE boq_projects/i);
    expect(sql).toMatch(/name = UPPER/i);
    expect(sql).toMatch(/client = CASE/i);
    expect(sql).toMatch(/contractor = CASE/i);
    expect(sql).toMatch(/WHERE name IS DISTINCT FROM/i);
    expect(sql).not.toMatch(/contract_no\s*=/i);
    expect(sql).not.toMatch(/boq_items/i);
    expect(sql).not.toMatch(/description\s*=/i);
    expect(sql).not.toMatch(/\bDROP\b/i);
    expect(sql).not.toMatch(/\bDELETE\b/i);
  });

  it("runs the required BOQ backfill before routes begin serving traffic", () => {
    const startup = fs.readFileSync("server/index.ts", "utf8");
    const backfill = startup.indexOf("await storage.backfillUppercaseBusinessText()");
    const routes = startup.indexOf("await registerRoutes(httpServer, app)");
    expect(backfill).toBeGreaterThanOrEqual(0);
    expect(routes).toBeGreaterThan(backfill);
    expect(startup.match(/await storage\.backfillUppercaseBusinessText\(\)/g)).toHaveLength(1);
  });
});