// @vitest-environment jsdom
import { afterEach, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { TransportPricingNote, UnconfirmedTripOffers } from "./TripCandidateWarnings";

afterEach(cleanup);

it("summarizes unresolved trips and links to the filtered vendor, date range, and role view", () => {
  render(<UnconfirmedTripOffers
    vendorName="G SANGANNA"
    returnTo="/plant/vendor-bills"
    items={[
      { tripId: 101, date: "2026-09-16", description: "SOIL (SITE TRIP)", roleWarning: "Roles not confirmed" },
      { tripId: 102, date: "2026-09-19", description: "WMM (SITE TRIP)", roleWarning: "Roles not confirmed" },
    ]}
  />);

  expect(screen.getByTestId("text-unconfirmed-trip-summary").textContent)
    .toContain("2 trips need “Who brought it?” confirmed (16–19 Sep · SOIL, WMM)");
  const link = screen.getByRole("link", { name: "Confirm on Material Trips" });
  const href = new URL(link.getAttribute("href")!, "https://example.test");
  expect(href.pathname).toBe("/site/material-trips");
  expect(href.searchParams.get("dateFrom")).toBe("2026-09-16");
  expect(href.searchParams.get("dateTo")).toBe("2026-09-19");
  expect(href.searchParams.get("hireSupplier")).toBe("G SANGANNA");
  expect(href.searchParams.get("hireRole")).toBe("unresolved");
  expect(decodeURIComponent(href.searchParams.get("returnTo")!)).toBe("/plant/vendor-bills");
  expect(screen.queryByTestId("list-unconfirmed-trips")).toBeNull();

  fireEvent.click(screen.getByTestId("button-toggle-unconfirmed-trips"));
  expect(screen.getByTestId("list-unconfirmed-trips").children).toHaveLength(2);
});

it("links unpriced transport notes to Rate Cards with the bill vendor prefilled", () => {
  render(<TransportPricingNote note="No transport rate card for G SANGANNA – SOIL." vendorName="G SANGANNA" />);
  expect(screen.getByText("Add one in Rate Cards").getAttribute("href"))
    .toBe("/plant/rate-cards?vendorName=G%20SANGANNA");
});
