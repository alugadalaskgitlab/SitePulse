/**
 * Batch 06C — Guided DPR parity corrections.
 *
 * Covers the pure seams introduced/changed in this batch:
 *  - per-activity photo cap (MAX_ACTIVITY_PHOTOS, capacity math, counting
 *    already-attached photos by entryKey) — the same helpers back the client
 *    staging guard AND the server-side reject;
 *  - labour row parity: a Guided save payload must preserve gender / task /
 *    boqItemId / structureId rather than hard-coding them away;
 *  - equipment payload: master-selected equipmentId + work-item link ride the
 *    passthrough bag and survive buildGuidedEquipmentPayload.
 */
import { describe, it, expect } from "vitest";
import {
  MAX_ACTIVITY_PHOTOS,
  activityPhotoCapacity,
  countEntryAttachments,
  groupDprPhotos,
} from "../shared/dprPhotos";
import { buildGuidedEquipmentPayload, splitGuidedEquipmentRow, newGuidedEquipmentRow } from "../shared/guidedEquipment";

describe("Batch 06C — per-activity photo cap", () => {
  it("cap is exactly 3", () => {
    expect(MAX_ACTIVITY_PHOTOS).toBe(3);
  });

  it("capacity = 3 − attached − staged, never negative", () => {
    expect(activityPhotoCapacity(0, 0)).toBe(3);
    expect(activityPhotoCapacity(2, 0)).toBe(1); // 2 attached → only 1 more
    expect(activityPhotoCapacity(2, 1)).toBe(0); // full
    expect(activityPhotoCapacity(3, 0)).toBe(0); // fourth photo rejected
    expect(activityPhotoCapacity(5, 2)).toBe(0); // over-full stays 0, not negative
  });

  it("counts attached photos by entryKey only (general photos don't count)", () => {
    const atts = [
      { progressEntryKey: "k1" },
      { progressEntryKey: "k1" },
      { progressEntryKey: "k2" },
      { progressEntryKey: null },
      { progressEntryKey: "" },
    ];
    expect(countEntryAttachments(atts, "k1")).toBe(2);
    expect(countEntryAttachments(atts, "k2")).toBe(1);
    expect(countEntryAttachments(atts, "k3")).toBe(0);
    expect(countEntryAttachments(atts, "")).toBe(0);
  });

  it("two different activities may each hold up to 3", () => {
    const atts = [
      { progressEntryKey: "a" }, { progressEntryKey: "a" }, { progressEntryKey: "a" },
      { progressEntryKey: "b" }, { progressEntryKey: "b" }, { progressEntryKey: "b" },
    ];
    // each key is individually full but neither blocks the other
    expect(activityPhotoCapacity(countEntryAttachments(atts, "a"), 0)).toBe(0);
    expect(activityPhotoCapacity(countEntryAttachments(atts, "b"), 0)).toBe(0);
    const grouped = groupDprPhotos(atts);
    expect(grouped.byEntryKey.get("a")).toHaveLength(3);
    expect(grouped.byEntryKey.get("b")).toHaveLength(3);
    expect(grouped.general).toHaveLength(0);
  });
});

describe("Batch 06C — labour parity payload", () => {
  // Mirrors GuidedDpr buildPayload's labour mapping: real values, no wiping.
  const buildLabourPayload = (rows: Array<{ category: string; gender: string; count: number | null; contractor: string; task: string; boqItemId: number | null; structureId: string | null }>) =>
    rows.filter((l) => l.category).map((l) => ({
      category: l.category, gender: l.gender, count: l.count ?? 0, task: l.task,
      contractor: l.contractor, boqItemId: l.boqItemId, structureId: l.structureId,
    }));

  it("preserves gender / task / work-item / structure links", () => {
    const out = buildLabourPayload([
      { category: "Unskilled", gender: "Male", count: 8, contractor: "GANG A", task: "WMM SPREADING", boqItemId: 42, structureId: "st-9" },
    ]);
    expect(out[0]).toEqual({
      category: "Unskilled", gender: "Male", count: 8, task: "WMM SPREADING",
      contractor: "GANG A", boqItemId: 42, structureId: "st-9",
    });
  });

  it("No Site Work crew: blank work item is valid (null, not fabricated)", () => {
    const out = buildLabourPayload([
      { category: "Unskilled", gender: "Female", count: 6, contractor: "", task: "RE-CLEARING VEGETATION", boqItemId: null, structureId: null },
    ]);
    expect(out[0].boqItemId).toBeNull();
    expect(out[0].gender).toBe("Female");
    expect(out[0].task).toBe("RE-CLEARING VEGETATION");
  });
});

describe("Batch 06C — equipment master identity + work-item link", () => {
  it("equipmentId and boqItemId travel in passthrough and reach the payload", () => {
    const row = newGuidedEquipmentRow();
    row.machine = "ROLLER 10T";
    row.vehicleNo = "KA-01-1234";
    row.task = "WMM COMPACTION";
    row.passthrough = { equipmentId: 7, boqItemId: 42, structureId: null };
    const payload = buildGuidedEquipmentPayload(row) as Record<string, unknown>;
    expect(payload.equipmentId).toBe(7);
    expect(payload.boqItemId).toBe(42);
    expect(payload.machine).toBe("ROLLER 10T");
    expect(payload.vehicleNo).toBe("KA-01-1234");
  });

  it("round-trip: a Detailed-created row keeps its readings and links through Guided", () => {
    const db = {
      id: 5, dprId: 9, machine: "JCB", vehicleNo: "KA-02-9",
      operator: "R", task: "EXCAVATION", equipmentId: 3, boqItemId: 11,
      structureId: "st-1", openingReading: 120, closingReading: 128, plantUsageId: 77,
    };
    const row = splitGuidedEquipmentRow(db);
    const payload = buildGuidedEquipmentPayload(row) as Record<string, unknown>;
    expect(payload.equipmentId).toBe(3);
    expect(payload.boqItemId).toBe(11);
    expect(payload.structureId).toBe("st-1");
    expect(payload.openingReading).toBe(120);
    expect(payload.plantUsageId).toBe(77);
    expect(payload).not.toHaveProperty("id");
    expect(payload).not.toHaveProperty("dprId");
  });
});
