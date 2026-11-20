import { describe, expect, it } from "vitest";
import { guidedSiteActivitiesPayload } from "../client/src/lib/guidedSiteActivities";
import { deriveDprChecklist } from "../shared/dprFieldChecklist";
import { WORK_HUB_SECTIONS } from "../client/src/lib/dprWorkHub";

describe("guided Site activities (DPR-ACTIVITY-02)", () => {
  it("omits siteActivities until the guided screen has loaded them", () => {
    expect(guidedSiteActivitiesPayload(false, [])).toEqual({});
  });

  it("round-trips each activity type, saved identity, staff, and attachment metadata", () => {
    const activities = [
      { id: 101, activityType: "levels", levelsKind: "Own check", personnelIds: [7] },
      { activityType: "test", testName: "CBR", personnelIds: [8], attachment: { fileName: "cbr.pdf", objectPath: "/objects/cbr.pdf", mimeType: "application/pdf", fileSize: 42 } },
      { activityType: "office", officeWork: "Reports", note: "Daily report", personnelIds: [] },
      { activityType: "visit", visitorName: "Department engineer", personnelIds: [9] },
      { activityType: "other", note: "Checked the site", personnelIds: [] },
    ] as any;

    const payload = guidedSiteActivitiesPayload(true, activities).siteActivities!;
    expect(payload.map(row => row.activityType)).toEqual(["levels", "test", "office", "visit", "other"]);
    expect(payload[0]).toMatchObject({ persistedId: 101, sortOrder: 0, personnelIds: [7] });
    expect(payload[1]).toMatchObject({
      sortOrder: 1,
      personnelIds: [8],
      attachment: { fileName: "cbr.pdf", objectPath: "/objects/cbr.pdf" },
    });
    expect(payload[2].sortOrder).toBe(2);
    expect(payload[3].personnelIds).toEqual([9]);
    expect(payload[4].sortOrder).toBe(4);
    expect(payload[0]).not.toHaveProperty("id");
  });

  it("places a non-blocking Site activities count after Activities on Field Home", () => {
    const checklist = deriveDprChecklist({
      progress: [{ activity: "WMM", chainageFrom: "1+000", chainageTo: "", quantity: null }],
      siteActivities: [{ activityType: "test" }, { activityType: "visit" }],
    }, false);
    const activityIndex = checklist.items.findIndex(item => item.id === "c4");
    const siteActivityIndex = checklist.items.findIndex(item => item.id === "cSiteActivities");
    expect(siteActivityIndex).toBe(activityIndex + 1);
    expect(checklist.items[siteActivityIndex]).toMatchObject({
      label: "Site activities",
      state: "info",
      sub: "2 recorded",
      details: [],
    });
    expect(checklist.siteActivities).toBe(2);
    expect(checklist.openActivities).toBe(1);
  });

  it("keeps the work hub section sequence", () => {
    expect(WORK_HUB_SECTIONS).toEqual(["activities", "siteActivities", "equipment", "labour", "materials", "review"]);
  });
});
