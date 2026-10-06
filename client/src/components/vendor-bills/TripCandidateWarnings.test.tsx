// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { TransportPricingNote, UnconfirmedTripOffers } from "./TripCandidateWarnings";
import { UNCONFIRMED_TRIP_WARNING } from "./tripCandidateSafety";

afterEach(cleanup);

describe("trip warnings (mock candidate component tests only)", () => {
  const items = [{
    sourceType: "site_material_trip_unresolved", sourceId: 718, tripId: 718,
    rolesUnconfirmed: true, roleWarning: UNCONFIRMED_TRIP_WARNING,
    date: "2026-10-09", description: "20 MM AGGREGATE", vehicleNumber: "KA 05 7812",
  }];
  it("offers an amber, disabled unchecked row with the exact warning and trip-fix link", () => {
    render(<UnconfirmedTripOffers items={items} refreshing={false} onRefresh={vi.fn()} />);
    const checkbox = screen.getByRole("checkbox") as HTMLInputElement;
    expect(checkbox.checked).toBe(false);
    expect(checkbox.disabled).toBe(true);
    fireEvent.click(checkbox);
    expect(checkbox.checked).toBe(false);
    expect(screen.getByText(UNCONFIRMED_TRIP_WARNING)).toBeTruthy();
    expect(screen.getByTestId("unconfirmed-trip-offers").className).toContain("bg-amber-50");
    expect(screen.getByRole("link", { name: "Who brought it?" }).getAttribute("href")).toBe("/site/material-trips");
    expect(screen.getByText(/Cannot add to this bill/)).toBeTruthy();
    expect(screen.getByText(/Trip 718/)).toBeTruthy();
  });
  it("refresh invokes the supplied query refetch and is disabled while fetching", () => {
    const refresh = vi.fn();
    const view = render(<UnconfirmedTripOffers items={items} refreshing={false} onRefresh={refresh} />);
    fireEvent.click(screen.getByRole("button", { name: "REFRESH RECORDS" }));
    expect(refresh).toHaveBeenCalledTimes(1);
    view.rerender(<UnconfirmedTripOffers items={items} refreshing onRefresh={refresh} />);
    expect((screen.getByRole("button") as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button"));
    expect(refresh).toHaveBeenCalledTimes(1);
  });
  it("removes the offer only when refreshed candidates no longer include unresolved trips", () => {
    const view = render(<UnconfirmedTripOffers items={items} refreshing={false} onRefresh={vi.fn()} />);
    view.rerender(<UnconfirmedTripOffers items={[]} refreshing={false} onRefresh={vi.fn()} />);
    expect(screen.queryByRole("checkbox")).toBeNull();
  });
  it("renders an unpriced transport note verbatim and no note for unchanged normal rows", () => {
    const note = "No unique exact transport card for this material; row is unpriced.";
    const view = render(<TransportPricingNote note={note} />);
    expect(screen.getByTestId("transport-pricing-note").textContent).toBe(note);
    view.rerender(<TransportPricingNote />);
    expect(screen.queryByTestId("transport-pricing-note")).toBeNull();
  });
});
