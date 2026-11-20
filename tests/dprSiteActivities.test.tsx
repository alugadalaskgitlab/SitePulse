// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { DprSiteActivitiesEditor } from "../client/src/components/DprSiteActivitiesEditor";
import { DprSiteActivitiesReadOnly } from "../client/src/components/DprSiteActivitiesReadOnly";
import { calculateSiteActivityResult, formatDprChainage, parseDprChainageKm } from "../shared/dprSiteActivities";
import { DPR_SECTIONS, dprSectionStates, pickDprSectionPayload } from "../shared/dprSections";

afterEach(cleanup);

it("places the optional site activities section after work done and before equipment", () => {
  expect(DPR_SECTIONS).toEqual(["activity", "siteActivities", "equipment", "labour", "materials"]);
  const state = dprSectionStates({ progress: [], siteActivities: [], equipment: [], labour: [], materials: [], sitePurchases: [] });
  expect(state.siteActivities.state).toBe("empty");
  expect(pickDprSectionPayload("siteActivities", { siteActivities: [{ activityType: "other" }], equipment: [] }))
    .toEqual({ siteActivities: [{ activityType: "other" }] });
});

it("shows the required type-specific fields and active personnel picker", () => {
  const onChange = vi.fn();
  render(<DprSiteActivitiesEditor
    activities={[{ activityType: "levels", personnelIds: [] }]}
    personnel={[{ id: 4, name: "Fixture Surveyor", isActive: true }]}
    layers={["WMM"]}
    onChange={onChange}
    onRemove={vi.fn()}
    onFileSelected={vi.fn()}
    onRemoveAttachment={vi.fn()}
  />);
  fireEvent.click(screen.getByRole("button", { name: "Edit" }));
  expect(screen.getByText("Levels taken as")).toBeTruthy();
  expect(screen.getByText("From chainage (km)")).toBeTruthy();
  expect(screen.getByText("To chainage (km)")).toBeTruthy();
  expect(screen.getByText("Who did it")).toBeTruthy();
  expect(screen.getByText("Fixture Surveyor")).toBeTruthy();
  expect(screen.getByText("Photo / sheet")).toBeTruthy();
});

it("computes numeric results and prints a compact black-and-white activity row", () => {
  expect(calculateSiteActivityResult("97.8", "97")).toBe(true);
  expect(calculateSiteActivityResult("95.9", "97")).toBe(false);
  expect(calculateSiteActivityResult("not a number", "97")).toBeNull();
  expect(formatDprChainage(2.6)).toBe("2+600");
  expect(formatDprChainage(null)).toBe("");
  expect(parseDprChainageKm("2+600")).toBe(2.6);
  const empty = render(<DprSiteActivitiesReadOnly activities={[]} />);
  expect(empty.container.firstChild).toBeNull();
  empty.unmount();
  const { container } = render(<DprSiteActivitiesReadOnly activities={[{
    id: 10, activityType: "test", testName: "Field density (FDD / compaction)",
    testPlace: "Site lab", layer: "WMM", chainageFrom: 2.6, side: "LHS",
    resultValue: "95.9", requiredValue: "97", resultPass: false,
    personnelIds: [4], staffNames: ["Fixture Surveyor"],
  }]} />);
  expect(screen.getByText("Fail")).toBeTruthy();
  expect(screen.getByText("Fixture Surveyor")).toBeTruthy();
  expect(container.querySelector('[data-testid="site-activity-result-0"]')?.className).not.toContain("bg-");
});
