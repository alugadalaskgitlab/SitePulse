import { describe, expect, it } from "vitest";
import { createDprRequestSchema } from "../shared/schema";
import {
  normalizeSiteEditEquipmentPayload,
  normalizeSiteEditProgressPayload,
} from "../client/src/lib/siteEditPayload";

describe("SiteEdit restored-draft payload normalization", () => {
  it("reproduces the legacy null parse failure and omits only optional null fields", () => {
    const restoredProgress = {
      entryKey: "legacy-progress",
      persistedId: null,
      activity: "GSB LAYING",
      side: null,
      chainageFrom: null,
      chainageTo: null,
      length: null,
      width: null,
      thickness: null,
      quantity: 10,
      uom: "SQM",
      noSiteWork: false,
      noSiteWorkDescription: null,
      personnelIds: null,
      boqItemId: null,
      programmeBarId: null,
      earthworkArrangementId: null,
      quantitySource: null,
      quantitySourceNote: null,
      chainageOverrideReason: null,
      lengthOverrideReason: null,
      uomOverrideReason: null,
      executedBy: null,
      layerNo: null,
      isIncidental: false,
      incidentalDescription: null,
      materialOutcome: null,
      reusableQty: null,
    };
    const restoredEquipment = {
      persistedId: null,
      machine: "ROLLER",
      operator: null,
      vehicleNo: null,
      entryType: "daily",
      startTime: null,
      endTime: null,
      openingReading: null,
      closingReading: null,
      hoursWorked: null,
      numberOfTrips: null,
      tripDistance: null,
      totalKm: null,
      diesel: null,
      dieselNorm: null,
      expectedDiesel: null,
      openingDiesel: null,
      dieselBalanceInTank: null,
      dieselBalanceConfirmed: null,
      task: null,
      equipmentId: null,
      dieselSource: null,
      fuelStation: null,
      billNumber: null,
      amountPaid: null,
      waterQuantity: null,
      boqItemId: null,
      structureId: null,
      plantUsageId: null,
      activitySegments: null,
      activityAllocations: null,
      breakdowns: null,
    };
    const base = {
      date: "2026-09-16",
      site: "LEGACY SITE",
      engineer: "FIELD ENGINEER",
      workType: "road",
      progress: [restoredProgress],
      equipment: [restoredEquipment],
      labour: [],
      materials: [],
      sitePurchases: [],
      structureItems: [],
    };

    const rawResult = createDprRequestSchema.safeParse(base);
    expect(rawResult.success).toBe(false);
    if (rawResult.success) return;
    expect(rawResult.error.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        path: ["progress", 0, "uomOverrideReason"],
        message: "Expected string, received null",
      }),
      expect.objectContaining({
        path: ["equipment", 0, "persistedId"],
        message: "Expected number, received null",
      }),
      expect.objectContaining({
        path: ["equipment", 0, "activitySegments"],
        message: "Expected array, received null",
      }),
    ]));

    const normalized = {
      ...base,
      progress: [normalizeSiteEditProgressPayload(restoredProgress)],
      equipment: [normalizeSiteEditEquipmentPayload(restoredEquipment)],
    };
    const parsed = createDprRequestSchema.safeParse(normalized);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;

    // Empty child arrays remain explicit values; only null means "not supplied"
    // so version storage can retain existing child facts.
    expect(parsed.data.equipment?.[0]).not.toHaveProperty("activitySegments");
    expect(parsed.data.equipment?.[0]).not.toHaveProperty("activityAllocations");
    expect(parsed.data.progress?.[0]).not.toHaveProperty("uomOverrideReason");
    expect(parsed.data.progress?.[0]).not.toHaveProperty("persistedId");
  });

  it("retains explicit empty child arrays and valid override evidence", () => {
    const progress = normalizeSiteEditProgressPayload({
      activity: "GSB",
      persistedId: 101,
      personnelIds: [],
      uomOverrideReason: "approved density conversion",
    });
    const equipment = normalizeSiteEditEquipmentPayload({
      machine: "ROLLER",
      persistedId: 102,
      activitySegments: [],
      activityAllocations: [],
      breakdowns: [],
    });

    expect(progress).toMatchObject({
      persistedId: 101,
      personnelIds: [],
      uomOverrideReason: "approved density conversion",
    });
    expect(equipment).toMatchObject({
      persistedId: 102,
      activitySegments: [],
      activityAllocations: [],
      breakdowns: [],
    });
  });

  it("omits nullable display-only child values without changing required identity fields", () => {
    const equipment = normalizeSiteEditEquipmentPayload({
      machine: "ROLLER",
      activitySegments: [{
        startTime: "08:00",
        endTime: "12:00",
        hoursWorked: null,
        boqItems: [{ boqItemId: 501, programmeBarId: null }],
      }],
      activityAllocations: [{
        boqItemId: 501,
        programmeBarId: null,
        startTime: "08:00",
        endTime: "12:00",
        hoursWorked: null,
      }],
      breakdowns: [{
        clientKey: "legacy-breakdown",
        maintenanceLogId: null,
        fromTime: null,
        toTime: null,
        description: null,
        responsibility: null,
        repairScope: null,
        debitableToVendor: null,
        remarks: null,
        attachment: { fileName: "evidence.jpg", objectPath: "/evidence.jpg", mimeType: null, fileSize: null },
      }],
    });

    const parsed = createDprRequestSchema.safeParse({
      date: "2026-09-16",
      site: "LEGACY SITE",
      engineer: "FIELD ENGINEER",
      workType: "road",
      progress: [],
      equipment: [equipment],
      labour: [],
      materials: [],
      sitePurchases: [],
      structureItems: [],
    });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.equipment?.[0].activitySegments?.[0]).not.toHaveProperty("hoursWorked");
    expect(parsed.data.equipment?.[0].activityAllocations?.[0]).not.toHaveProperty("hoursWorked");
    expect(parsed.data.equipment?.[0].breakdowns?.[0]).not.toHaveProperty("debitableToVendor");
    expect(parsed.data.equipment?.[0].breakdowns?.[0].attachment).toEqual({
      fileName: "evidence.jpg",
      objectPath: "/evidence.jpg",
    });
  });
});