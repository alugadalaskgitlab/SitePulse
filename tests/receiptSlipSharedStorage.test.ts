import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { materialReceipts, siteMaterialTrips } from "../shared/schema";

const storageSource = readFileSync(new URL("../server/storage.ts", import.meta.url), "utf8");

describe("receipt slip sharing persistence", () => {
  it("adds exactly the four nullable tracking columns", () => {
    for (const table of [materialReceipts, siteMaterialTrips]) {
      expect(table.slipSharedAt.name).toBe("slip_shared_at");
      expect(table.slipSharedAt.notNull).toBe(false);
      expect(table.slipSharedByUserId.name).toBe("slip_shared_by_user_id");
      expect(table.slipSharedByUserId.notNull).toBe(false);
    }
  });

  it.each([
    ["markMaterialReceiptSlipShared", "materialReceipts"],
    ["markSiteMaterialTripSlipShared", "siteMaterialTrips"],
  ])("%s writes only share timestamp and session user", (methodName, tableName) => {
    const start = storageSource.indexOf(`async ${methodName}(`);
    expect(start).toBeGreaterThanOrEqual(0);
    const end = storageSource.indexOf("\n  }", start);
    const method = storageSource.slice(start, end);
    expect(method).toContain(`db.update(${tableName})`);
    expect(method).toContain(".set({ slipSharedAt: new Date(), slipSharedByUserId: userId })");
    expect(method).not.toContain("auditLogs");
    expect(method).not.toContain("quantity");
    expect(method).not.toContain("stock");
  });
});
