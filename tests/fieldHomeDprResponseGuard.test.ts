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

  it("ensures equipment log columns before registering routes", () => {
    const source = fs.readFileSync("server/index.ts", "utf8");
    const ensureIndex = source.indexOf("await (storage as any).ensureEquipmentUsageAuditColumns()");
    const routesIndex = source.indexOf("await registerRoutes(httpServer, app)");
    const listenIndex = source.indexOf("httpServer.listen");

    expect(ensureIndex).toBeGreaterThan(-1);
    expect(ensureIndex).toBeLessThan(routesIndex);
    expect(routesIndex).toBeLessThan(listenIndex);
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