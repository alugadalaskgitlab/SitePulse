import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  EQUIPMENT_IDENTIFICATION_QUERY_KEY,
  EQUIPMENT_IDENTIFICATION_RETURN_TO,
  equipmentIdentificationSourceHref,
  linkCreatedEquipment,
} from "../client/src/lib/equipmentIdentification";
import { resolveReturnTo } from "../client/src/lib/progressReportNav";

describe("EQUIP-05 identification review orchestration", () => {
  it("uses one unfiltered pending-identification query key in both review surfaces", () => {
    const fleet = readFileSync("client/src/pages/EquipmentPerformanceReport.tsx", "utf8");
    const master = readFileSync("client/src/pages/Plant.tsx", "utf8");
    expect(fleet).toContain("queryKey: EQUIPMENT_IDENTIFICATION_QUERY_KEY");
    expect(master).toContain("queryKey: EQUIPMENT_IDENTIFICATION_QUERY_KEY");
    expect(EQUIPMENT_IDENTIFICATION_QUERY_KEY).toEqual([
      "/api/reports/equipment-performance",
      "pending-identification",
    ]);
  });

  it("opens the exact DPR edit record and safely restores Equipment Master context", () => {
    const href = equipmentIdentificationSourceHref({ source: "dpr_log", dprId: 244 })!;
    expect(href.startsWith("/site/edit/244?returnTo=")).toBe(true);
    expect(resolveReturnTo(`?${href.split("?")[1]}`, "/site")).toBe(EQUIPMENT_IDENTIFICATION_RETURN_TO);
    expect(EQUIPMENT_IDENTIFICATION_RETURN_TO).toContain("#equipment-needing-identification");
    expect(equipmentIdentificationSourceHref({ source: "plant_usage", dprId: null })).toBeNull();
  });

  it("links with the id returned by creation, in order", async () => {
    const calls: string[] = [];
    const create = async () => {
      calls.push("create");
      return { id: 73 };
    };
    const link = vi.fn(async (logId: number, equipmentId: number) => {
      calls.push("link");
      expect(logId).toBe(19);
      expect(equipmentId).toBe(73);
    });
    const created = await create();
    await linkCreatedEquipment(19, created.id, link);
    expect(calls).toEqual(["create", "link"]);
    expect(link).toHaveBeenCalledTimes(1);
  });

  it("surfaces link failure after creation so retry reuses the same record", async () => {
    const link = vi.fn()
      .mockRejectedValueOnce(new Error("link failed"))
      .mockResolvedValueOnce(undefined);
    await expect(linkCreatedEquipment(19, 73, link)).rejects.toThrow("link failed");
    await expect(linkCreatedEquipment(19, 73, link)).resolves.toEqual({ logId: 19, equipmentId: 73 });
    expect(link).toHaveBeenNthCalledWith(1, 19, 73);
    expect(link).toHaveBeenNthCalledWith(2, 19, 73);
  });

  it("removes both Fleet review workflows and keeps only the compact notice", () => {
    const fleet = readFileSync("client/src/pages/EquipmentPerformanceReport.tsx", "utf8");
    expect(fleet).not.toContain("Owner review queue");
    expect(fleet).not.toContain("Legacy identity corrections");
    expect(fleet).toContain("notice-equipment-identification");
    expect(fleet).toContain("Review in Equipment Master");
  });

  it("keeps confirmation on the unchanged endpoint and invalidates report caches", () => {
    const master = readFileSync("client/src/pages/Plant.tsx", "utf8");
    expect(master).toContain("/api/reports/equipment-performance/logs/${logId}/confirm");
    expect(master).toContain('invalidateQueries({ queryKey: ["/api/reports/equipment-performance"] })');
    expect(master).toContain("Retry linking without creating another record");
  });

  it("gates the review to the same Admin-or-Owner semantics as assertAdmin", () => {
    const master = readFileSync("client/src/pages/Plant.tsx", "utf8");
    const auth = readFileSync("server/auth-routes.ts", "utf8");
    expect(master).toContain("const canReview = isAdmin || isOwner");
    expect(auth).toMatch(/function assertAdmin[\s\S]*?!req\.authUser\.isAdmin && !req\.authUser\.isOwner/);
  });
});