// @vitest-environment jsdom
import { afterEach, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { TransportPricingRow, transportPricingGroups } from "../client/src/components/vendor-bills/TransportPricingRow";
afterEach(cleanup);
const weightedItem = { category: "transport", description: "WMM - TRANSPORT", rate: 90, leadDistance: 30, transportPricing: {
  basis: "mt" as const, cardId: 3, cardLeadDistanceKm: 30, payloadMt: 30, actualMt: 24.65, tripCount: 1,
} };
it("shows one transport working line for a material group and no per-row basis switch", () => {
  const noWeightItem = { ...weightedItem, transportPricing: { ...weightedItem.transportPricing, basis: "trip" as const, actualMt: null } };
  const groups = transportPricingGroups([weightedItem, noWeightItem]);
  const groupItems = groups.get(0);
  expect(groupItems).toHaveLength(2);
  render(<TransportPricingRow item={weightedItem} groupItems={groupItems} />);
  expect(screen.getByTestId("transport-pricing-row").textContent).toContain("WMM transport");
  expect(screen.getByTestId("transport-pricing-row").textContent).toContain("₹90/km");
  expect(screen.getByTestId("transport-pricing-row").textContent).toContain("lead 30 km (60 km two-way)");
  expect(screen.getByTestId("transport-pricing-row").textContent).toContain("payload 30 MT");
  expect(screen.getByTestId("transport-pricing-row").textContent).toContain("₹180/MT");
  expect(screen.getByTestId("transport-pricing-row").textContent).toContain("₹5,400/trip");
  expect(screen.queryByRole("button", { name: "Per trip" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Per MT" })).toBeNull();
});
it("does not render a summary for unpriced rows", () => {
  render(<TransportPricingRow item={{ category: "transport", rate: 95, leadDistance: 12 }} />);
  expect(screen.queryByTestId("transport-pricing-row")).toBeNull();
});
