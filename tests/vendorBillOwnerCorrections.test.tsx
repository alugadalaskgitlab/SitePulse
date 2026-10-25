// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { VendorBillOwnerCorrections, VendorBillSiteCorrection } from "@/components/VendorBillOwnerCorrections";

vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));

beforeEach(() => {
  queryClient.clear();
  Object.defineProperty(Element.prototype, "scrollIntoView", { configurable: true, value: () => {} });
  if (!HTMLElement.prototype.hasPointerCapture) {
    Object.defineProperty(HTMLElement.prototype, "hasPointerCapture", { configurable: true, value: () => false });
    Object.defineProperty(HTMLElement.prototype, "setPointerCapture", { configurable: true, value: () => {} });
    Object.defineProperty(HTMLElement.prototype, "releasePointerCapture", { configurable: true, value: () => {} });
  }
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const mount = (isOwner: boolean) => render(
  <QueryClientProvider client={queryClient}>
    <VendorBillOwnerCorrections
      isOwner={isOwner}
      bill={{
        id: 20,
        status: "paid",
        amountPaid: 40,
        netPayableAmount: 90,
      }}
    />
    <VendorBillSiteCorrection
      isOwner={isOwner}
      bill={{ id: 20, siteId: 1, siteScopeConfirmed: true }}
      sites={[{ id: 1, name: "Site A" }, { id: 2, name: "Site B" }]}
    />
  </QueryClientProvider>,
);

it("hides both correction controls from non-Owners", () => {
  mount(false);
  expect(screen.queryByTestId("section-vb-owner-corrections")).toBeNull();
  expect(screen.queryByTestId("button-open-vb-amount-correction")).toBeNull();
  expect(screen.queryByTestId("button-open-vb-site-correction")).toBeNull();
});

it("submits a reason-required paid amount correction", async () => {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: 20 }), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  mount(true);

  expect(screen.getByText("Paid amount: ₹40.00")).toBeTruthy();
  fireEvent.click(screen.getByTestId("button-open-vb-amount-correction"));
  const saveButton = screen.getByTestId("button-save-vb-amount-correction") as HTMLButtonElement;
  expect(saveButton.disabled).toBe(true);
  fireEvent.change(screen.getByTestId("input-vb-correction-paid-amount"), { target: { value: "55" } });
  fireEvent.change(screen.getByTestId("textarea-vb-correction-paid-reason"), {
    target: { value: "Matched the signed bank advice." },
  });
  expect(saveButton.disabled).toBe(false);
  fireEvent.click(saveButton);

  await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
    "/api/vendor-bills/20/owner-correction/paid-amount",
    expect.objectContaining({
      method: "PATCH",
      body: JSON.stringify({ amountPaid: 55, reason: "Matched the signed bank advice." }),
    }),
  ));
});

it("submits an explicitly selected site answer and reason", async () => {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: 20 }), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  mount(true);

  fireEvent.click(screen.getByTestId("button-open-vb-site-correction"));
  fireEvent.pointerDown(screen.getByTestId("select-vb-correction-site"), { button: 0, pointerType: "mouse" });
  fireEvent.click(await screen.findByRole("option", { name: "Site B" }));
  fireEvent.change(screen.getByTestId("textarea-vb-correction-site-reason"), {
    target: { value: "The invoice belongs to Site B." },
  });
  fireEvent.click(screen.getByTestId("button-save-vb-site-correction"));

  await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
    "/api/vendor-bills/20/owner-correction/site",
    expect.objectContaining({
      method: "PATCH",
      body: JSON.stringify({ siteId: 2, reason: "The invoice belongs to Site B." }),
    }),
  ));
});
