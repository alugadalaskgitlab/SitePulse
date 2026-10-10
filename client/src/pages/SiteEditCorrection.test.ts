// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { mapDprToFormState } from "./SiteEdit";
import { snapshotCorrectionForm } from "@/lib/dprCorrections";

describe("raw SiteEdit historical correction payload", () => {
  const saved = {
    id: 314, site: "TAKKADPALLY-SIRUR", date: "2026-08-29", engineer: "Kiran Rao", workType: "road",
    progress: [{ id: 28, entryKey: "saved-work-28", activity: "Subgrade", boqItemId: 91,
      programmeBarId: 33, chainageFrom: "2+100", chainageTo: "2+248", quantity: 148, uom: "SQM", layerNo: 2 }],
    equipment: [{ id: 741, plantUsageId: 188, equipmentId: 7, machine: "Tandem Roller",
      startTime: "07:35", endTime: "14:05", openingReading: 18147.8, closingReading: 18154.3,
      openingDiesel: 0, dieselBalanceInTank: 0, diesel: 12, dieselSource: "plant_stock",
      activitySegments: [{ id: 51, startTime: "07:35", endTime: "14:05", hoursWorked: 6.5,
        boqItems: [{ id: 61, boqItemId: 91, programmeBarId: 33 }, { id: 62, boqItemId: 92, programmeBarId: null }] }] }],
  };
  it("retains segment/assignment identities, original readings and canonical reference after clearing tank zeroes", () => {
    const state = mapDprToFormState(saved);
    state.equipment[0].openingDiesel = null;
    state.equipment[0].dieselBalanceInTank = null;
    const payload = snapshotCorrectionForm(state);
    expect(payload.equipment[0]).toMatchObject({
      persistedId: 741, plantUsageId: 188, openingReading: 18147.8, closingReading: 18154.3,
      openingDiesel: null, dieselBalanceInTank: null, diesel: 12,
      activitySegments: [{ persistedId: 51, hoursWorked: 6.5, startTime: "07:35", endTime: "14:05",
        boqItems: [{ persistedId: 61, boqItemId: 91, programmeBarId: 33 }, { persistedId: 62, boqItemId: 92, programmeBarId: null }] }],
    });
    expect(payload.progress[0]).toMatchObject({ persistedId: 28, programmeBarId: 33, layerNo: 2, quantity: 148 });
    state.equipment[0].activitySegments![0].boqItems[0].boqItemId = 93;
    expect((payload.equipment[0] as typeof state.equipment[0]).activitySegments![0].boqItems[0].boqItemId).toBe(91);
  });
  it("retains legacy activity allocations when no modern segments exist", () => {
    const payload = snapshotCorrectionForm(mapDprToFormState({ ...saved, equipment: [{
      ...saved.equipment[0], activitySegments: [], activityAllocations: [
        { id: 61, boqItemId: 91, programmeBarId: 33, startTime: "07:35", endTime: "14:05", hoursWorked: 6.5 },
      ],
    }] }));
    expect(payload.equipment[0]).toMatchObject({
      persistedId: 741, plantUsageId: 188, activitySegments: undefined,
      activityAllocations: [{ persistedId: 61, boqItemId: 91, programmeBarId: 33, startTime: "07:35", endTime: "14:05", hoursWorked: 6.5 }],
    });
  });
});
