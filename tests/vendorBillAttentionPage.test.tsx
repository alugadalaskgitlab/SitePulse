// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { BillAttentionCard } from "@/pages/VendorBillsAttention";

vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));

const makeRow = () => ({
  billId: 7,
  billNo: "VB-007",
  billDate: "2026-10-01",
  vendorName: "ACME",
  net: 100,
  status: "paid",
  amountPaid: 40,
  paidBy: "ALPS INFRA WORKS",
  siteId: 1,
  siteName: "Site A",
  siteScopeConfirmed: true,
  periodFrom: "2026-09-01",
  periodTo: "2026-09-30",
  kinds: ["payer_text_needs_confirming"] as any[],
  siteSuggestion: null,
});

beforeEach(() => {
  queryClient.clear();
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

const mount = () => render(
  <QueryClientProvider client={queryClient}>
    <BillAttentionCard row={makeRow()} sites={[]} />
  </QueryClientProvider>,
);

it("requires a configured third-party account and submits a one-bill confirmation", async () => {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === "/api/vendor-bills/company-accounts?includeThirdParty=true") {
      return new Response(JSON.stringify([
        { id: "hlc_bank", name: "HLC Bank", type: "CA", source: "own" },
        { id: "alps_infra_works", name: "ALPS Infra Works", type: "CC", source: "third_party" },
      ]), { status: 200 });
    }
    return new Response(JSON.stringify({ id: 7 }), { status: 200 });
  });
  vi.stubGlobal("fetch", fetchMock);

  const { container } = mount();
  const confirmButton = screen.getByTestId("button-confirm-alps-payer-7");
  expect((confirmButton as HTMLButtonElement).disabled).toBe(true);
  expect(container.textContent).toContain("ALPS INFRA WORKS");
  expect(container.textContent).not.toContain("PERSONAL");

  await waitFor(() => expect(queryClient.getQueryData([
    "/api/vendor-bills/company-accounts",
    "attention-third-party",
  ])).toEqual([
    { id: "alps_infra_works", name: "ALPS Infra Works", type: "CC", source: "third_party" },
  ]));
  const accountSelect = await screen.findByTestId("select-attention-payer-account-7");
  fireEvent.pointerDown(accountSelect, { button: 0, pointerType: "mouse" });
  const accountOption = await screen.findByText("ALPS Infra Works \u00b7 CC");
  expect(screen.queryByText("HLC Bank \u00b7 CA")).toBeNull();
  fireEvent.click(accountOption);
  await waitFor(() => expect((confirmButton as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(confirmButton);

  await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
    "/api/vendor-bills/7/attention/payer-confirmation",
    expect.objectContaining({
      method: "PATCH",
      body: JSON.stringify({ paymentAccountKey: "alps_infra_works" }),
    }),
  ));
});

it("keeps confirmation unavailable when no third-party account is configured", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify([
    { id: "hlc_bank", name: "HLC Bank", type: "CA", source: "own" },
  ]), { status: 200 })));

  mount();
  expect(await screen.findByText("No configured third-party ALPS account is available. No change has been made.")).toBeTruthy();
  expect((screen.getByTestId("button-confirm-alps-payer-7") as HTMLButtonElement).disabled).toBe(true);
});
