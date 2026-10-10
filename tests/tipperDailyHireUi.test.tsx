// @vitest-environment jsdom
import React, { useState } from "react";
import { afterEach, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { TripDailyHireReview } from "../client/src/components/TripDailyHireReview";
import { calculateHireGroup } from "../shared/hireBilling";
afterEach(cleanup);
it("shows vehicle/date trip evidence and updates half-day pricing without multiplying by trips", () => {
  function Harness() {
    const [group, setGroup] = useState<any>({ equipmentId: 1, rate: 2000, dailyDecisions: [] });
    const activities = [1, 2, 3].map(sourceId => ({ source: "site_material_trip" as const, sourceId,
      equipmentId: 1, businessDate: "2026-10-01", entryType: "daily_hire", confirmedForDailyHire: true, numberOfTrips: 1, status: "closed" }));
    const result = calculateHireGroup({ terms: { billingBasis: "daily", rate: 2000 }, periodFrom: "2026-10-01",
      periodTo: "2026-10-01", activities, maintenance: [], dailyDecisions: group.dailyDecisions });
    return <TripDailyHireReview group={group} equipment={{ registrationNumber: "TS01AB1234", vendorName: "Agency" }}
      result={result} activities={activities} onChange={patch => setGroup({ ...group, ...patch })} onRemove={() => {}} />;
  }
  render(<Harness />);
  expect(screen.getByText(/1 hire days/)).toBeTruthy();
  expect(screen.getAllByRole("link")).toHaveLength(3);
  expect(screen.getByRole("link", { name: "Trip #1" }).getAttribute("href")).toContain("hireDate=2026-10-01");
  fireEvent.change(screen.getByLabelText("Hire decision 2026-10-01"), { target: { value: "half_day" } });
  fireEvent.change(screen.getByLabelText("Hire reason 2026-10-01"), { target: { value: "Half day verified" } });
  expect(screen.getByText(/0.5 hire days/).textContent).toContain("1,000");
  fireEvent.change(screen.getByLabelText("Hire decision 2026-10-01"), { target: { value: "exclude" } });
  expect(screen.getByText(/0 hire days/)).toBeTruthy();
});
