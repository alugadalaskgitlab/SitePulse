import fs from "node:fs";
import { describe, expect, it } from "vitest";

describe("FieldHome DPR response reliability", () => {
  it("validates the DPR response before array operations", () => {
    const source = fs.readFileSync("client/src/pages/FieldHome.tsx", "utf8");

    expect(source).toContain("if (!response.ok)");
    expect(source).toContain("if (!Array.isArray(payload))");
    expect(source).toContain(
      "const allDprsWithDetails: any[] = Array.isArray(allDprsResponse) ? allDprsResponse : [];",
    );
  });

  it("checks read-only startup readiness before registering routes or listening", () => {
    const source = fs.readFileSync("server/index.ts", "utf8");
    const readinessIndex = source.indexOf("await verifyStartupReadiness(pool)");
    const routesIndex = source.indexOf("await registerRoutes(httpServer, app)");
    const listenIndex = source.indexOf("httpServer.listen");

    expect(readinessIndex).toBeGreaterThan(-1);
    expect(readinessIndex).toBeLessThan(routesIndex);
    expect(routesIndex).toBeLessThan(listenIndex);
    expect(source).not.toContain("ensureEquipmentUsageAuditColumns(");
  });

  it("shows the real trip UOM and keeps mixed units separate", () => {
    const source = fs.readFileSync("client/src/pages/FieldHome.tsx", "utf8");
    expect(source).toContain("tripTotalsByUom");
    expect(source).toContain("trip.uom");
    expect(source).toContain("tripQuantityLabel");
    expect(source).toContain('.join(" + ")');
    expect(source).not.toContain("tripQty.toLocaleString");
    expect(source).not.toContain("} MT`");
  });
});