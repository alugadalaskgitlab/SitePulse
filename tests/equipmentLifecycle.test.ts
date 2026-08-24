import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { lifecycleByUsageId, lifecycleLabel, linkedUsageId, plantDestinationType } from "../client/src/lib/equipmentLifecycle";

describe("equipment lifecycle client contracts", () => {
  it("scopes incoming queues to an explicit HMP or RMC plant context", () => {
    expect(plantDestinationType("HMP Plant 1")).toBe("hmp");
    expect(plantDestinationType("RMC PLANT")).toBe("rmc");
    expect(plantDestinationType("Main Yard")).toBeNull();
  });

  it("does not treat a DPR equipment row id as a usage link", () => {
    expect(linkedUsageId({ id: 12 })).toBeNull();
    expect(linkedUsageId({ plantUsageId: 44 })).toBe(44);
  });

  it("normalizes lifecycle results and displays pending/closed state read-only", () => {
    const statuses = lifecycleByUsageId({ rows: [{ id: 44, status: "closed", closedByUserName: "Plant Operator" }] });
    expect(lifecycleLabel(statuses.get(44))).toBe("Closed by Plant Operator");
    expect(lifecycleLabel({ id: 45, status: "open", destinationType: "rmc" })).toBe("Pending at RMC");
    expect(lifecycleLabel({
      id: 46,
      status: "closed",
      destinationType: "hmp",
      destinationSite: "HMP PLANT",
      successorId: 99,
    })).toBe("Completed at HMP: HMP PLANT");
  });

  it("keeps receiving completion and onward movement on their canonical endpoints", () => {
    const plantPage = readFileSync("client/src/pages/PlantEquipmentUsage.tsx", "utf8");
    const dprPage = readFileSync("client/src/pages/SiteReport.tsx", "utf8");
    expect(plantPage).toContain("/complete-incoming");
    expect(plantPage).toContain("Adopt & complete");
    expect(dprPage).toContain("/api/equipment-usage/lifecycle?ids=");
    expect(dprPage).toContain("/api/equipment-usage/${usageId}/move");
    expect(dprPage).toContain("successorDate");
  });

  it("row-locks Plant completion and finalizes Site lifecycle inside DPR transactions", () => {
    const storage = readFileSync("server/storage.ts", "utf8");
    const routes = readFileSync("server/routes.ts", "utf8");
    const completion = storage.slice(
      storage.indexOf("async completeIncomingEquipmentUsage"),
      storage.indexOf("async createEquipmentUsageSuccessor"),
    );
    expect(completion).toContain("FOR UPDATE");
    expect(completion).toContain("_updateEquipmentUsageTxn");
    expect(routes).toContain("storage.completeIncomingEquipmentUsage");
    expect(storage).toContain("finalizeDprEquipmentUsageTx(tx, newDpr, insertedEquipLogs, audit)");
    expect(storage).toContain("finalizeDprEquipmentUsageTx(tx, updated, insertedEquipLogs, audit)");
    expect(routes).not.toContain("await storage.materializeFinalizedDprEquipmentUsage(newVersion.id)");
  });
});