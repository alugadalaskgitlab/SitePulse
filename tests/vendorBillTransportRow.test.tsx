// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { TransportPricingRow } from "../client/src/components/vendor-bills/TransportPricingRow";
afterEach(cleanup);
const item = { rate: 950, leadDistance: 14, transportPricing: {
  basis: "trip" as const, cardId: 3, cardLeadDistanceKm: 12, payloadMt: 30, actualMt: 28.4, tripCount: 1,
} };
it("shows both bases, actual MT, and the amber row/card lead difference", () => {
  const onBasisChange = vi.fn();
  render(<TransportPricingRow item={item} onBasisChange={onBasisChange} />);
  expect(screen.getByText(/₹26,600\/trip/).textContent).toContain("carried 28.4 MT");
  expect(screen.getByText("lead 14 km (card 12 km)").className).toContain("amber");
  fireEvent.click(screen.getByRole("button", { name: "Per MT" }));
  expect(onBasisChange).toHaveBeenCalledWith("mt");
});
it("cannot switch to per MT without a measured weight; does not show controls for a historical NULL row", () => {
  const { rerender } = render(<TransportPricingRow item={{ ...item, transportPricing: { ...item.transportPricing, actualMt: null } }} onBasisChange={vi.fn()} />);
  expect((screen.getByRole("button", { name: "Per MT" }) as HTMLButtonElement).disabled).toBe(true);
  rerender(<TransportPricingRow item={{ rate: 95, leadDistance: 12 }} />);
  expect(screen.queryByTestId("transport-pricing-row")).toBeNull();
});
