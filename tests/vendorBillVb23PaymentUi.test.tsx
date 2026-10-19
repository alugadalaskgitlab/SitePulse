// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { hasCumulativeVendorPayment, VendorBillPaymentDetails, VendorBillPaidAccount } from "@/pages/VendorBills";

vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
beforeEach(() => {
  queryClient.clear();
  if (!HTMLElement.prototype.hasPointerCapture) {
    Object.defineProperty(HTMLElement.prototype, "hasPointerCapture", { configurable: true, value: () => false });
    Object.defineProperty(HTMLElement.prototype, "setPointerCapture", { configurable: true, value: () => {} });
    Object.defineProperty(HTMLElement.prototype, "releasePointerCapture", { configurable: true, value: () => {} });
  }
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify([
    { id: "bank", name: "HDFC CURRENT A/C", type: "CA", source: "own" },
    { id: "alps_infra_works", name: "ALPS Infra - Union Bank (works)", type: "CC", source: "third_party" },
  ]))));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const mount = (ui: React.ReactNode) => render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);

it.each(["all", "ALL", "equipment"])("includes amount/account in %s save payload and fetches shared accounts", async billType => {
  mount(<VendorBillPaymentDetails canEditPayment bill={{ id: 1, billType, status: "approved", netPayableAmount: 1000, paidBy: "company", paymentAccountKey: "bank" }} />);
  fireEvent.click(screen.getByTestId("button-edit-payment-details"));
  expect(screen.getByTestId("select-vb-payment-account")).toBeTruthy();
  fireEvent.change(screen.getByTestId("input-vb-amount-paid"), { target: { value: "1000" } });
  fireEvent.click(screen.getByTestId("button-save-payment-details"));
  await waitFor(() => expect(fetch).toHaveBeenCalledWith("/api/vendor-bills/1/payment-details", expect.objectContaining({
    method: "PATCH", body: JSON.stringify({ paymentMode: null, paidBy: "company", amountPaid: 1000, paymentAccountKey: "bank" }),
  })));
  expect(fetch).toHaveBeenCalledWith("/api/vendor-bills/company-accounts?includeThirdParty=true", { credentials: "include" });
});

it("renders the account selector for a material bill without showing cumulative payment", async () => {
  mount(<VendorBillPaymentDetails canEditPayment bill={{ id: 2, billType: "material", paidBy: "company" }} />);
  fireEvent.click(screen.getByTestId("button-edit-payment-details"));
  expect(screen.queryByTestId("input-vb-amount-paid")).toBeNull();
  expect(screen.getByTestId("select-vb-payment-account")).toBeTruthy();
  fireEvent.click(screen.getByTestId("button-save-payment-details"));
  await waitFor(() => expect(fetch).toHaveBeenCalledWith("/api/vendor-bills/2/payment-details", expect.anything()));
  expect(fetch).toHaveBeenCalledWith("/api/vendor-bills/2/payment-details", expect.objectContaining({
    body: JSON.stringify({ paymentMode: null, paidBy: "company", paymentAccountKey: null }),
  }));
});

it("calculates a non-frozen balance from the shared net payable, not the gross", () => {
  mount(<VendorBillPaymentDetails canEditPayment={false} bill={{
    id: 22, billType: "material", totalAmount: 193050, netPayableAmount: null,
    adjustmentAmount: -70000, amountPaid: 123050,
  }} />);
  expect(screen.getByText("BALANCE THIS BILL: ₹0.00")).toBeTruthy();
});

it("uses a frozen net payable unchanged instead of recalculating it", () => {
  mount(<VendorBillPaymentDetails canEditPayment={false} bill={{
    id: 23, billType: "material", totalAmount: 193050, netPayableAmount: 150000,
    adjustmentAmount: -70000, amountPaid: 123050,
  }} />);
  expect(screen.getByText("BALANCE THIS BILL: ₹26,950.00")).toBeTruthy();
});

it("shows recorded paid and balance amounts for a material bill", () => {
  mount(<VendorBillPaymentDetails canEditPayment={false} bill={{
    id: 24, billType: "material", totalAmount: 193050, netPayableAmount: null,
    adjustmentAmount: -70000, amountPaid: 123050,
  }} />);
  expect(screen.getByText("PAID: ₹1,23,050.00")).toBeTruthy();
  expect(screen.getByText("BALANCE THIS BILL: ₹0.00")).toBeTruthy();
});

it("keeps unknown paid and balance amounts as dashes on a material bill", () => {
  mount(<VendorBillPaymentDetails canEditPayment={false} bill={{
    id: 25, billType: "material", totalAmount: 1000, netPayableAmount: null, amountPaid: null,
  }} />);
  expect(screen.getByText("PAID: —")).toBeTruthy();
  expect(screen.getByText("BALANCE THIS BILL: —")).toBeTruthy();
});

it("uses only the third-party account for an ALPS-funded material bill", async () => {
  mount(<VendorBillPaymentDetails canEditPayment bill={{
    id: 3, billType: "material", paidBy: "alps", paymentAccountKey: "alps_infra_works",
  }} />);
  fireEvent.click(screen.getByTestId("button-edit-payment-details"));
  expect(screen.queryByTestId("input-vb-amount-paid")).toBeNull();
  expect(screen.getByTestId("select-vb-payment-account")).toBeTruthy();
  fireEvent.pointerDown(screen.getByTestId("select-vb-payment-account"), { button: 0 });
  expect(await screen.findByText("ALPS Infra - Union Bank (works) · CC")).toBeTruthy();
  expect(screen.queryByText("HDFC CURRENT A/C · CA")).toBeNull();
  fireEvent.click(screen.getByTestId("button-save-payment-details"));
  await waitFor(() => expect(fetch).toHaveBeenCalledWith("/api/vendor-bills/3/payment-details", expect.objectContaining({
    method: "PATCH",
    body: JSON.stringify({ paymentMode: null, paidBy: "alps", paymentAccountKey: "alps_infra_works" }),
  })));
});

it("shows flagged ALPS free text on the bill without labeling it PERSONAL", () => {
  mount(<VendorBillPaymentDetails canEditPayment={false} bill={{
    id: 4, billType: "material", status: "paid", paidBy: "ALPS INFRA WORKS",
  }} />);
  const paidBy = screen.getByTestId("badge-vb-paid-by").textContent || "";
  expect(paidBy).toContain("PAID BY: ALPS INFRA WORKS (recorded as text \u2014 needs confirming)");
  expect(paidBy).not.toContain("PERSONAL");
});

it.each([
  ["company", "PAID BY: Company"],
  ["alps", "PAID BY: ALPS"],
])("uses the short payer label for stored value %s", (paidBy, expectedLabel) => {
  mount(<VendorBillPaymentDetails canEditPayment={false} bill={{
    id: 5, billType: "material", status: "paid", paidBy,
  }} />);
  expect(screen.getByTestId("badge-vb-paid-by").textContent).toContain(expectedLabel);
});

it.each(["draft", "verified"])("keeps %s payment panel read-only when permission is false", status => {
  mount(<VendorBillPaymentDetails canEditPayment={false} bill={{ id: 3, billType: "all", status, totalAmount: 1000 }} />);
  expect(screen.getByTestId("section-payment-details")).toBeTruthy();
  expect(screen.queryByTestId("button-edit-payment-details")).toBeNull();
});

it("resolves the PAID bank line using shared account lookup", async () => {
  mount(<VendorBillPaidAccount paymentAccountKey="bank" />);
  expect(await screen.findByTestId("status-paid-account")).toHaveProperty("textContent", "HDFC CURRENT A/C");
});
it.each([null, undefined, "missing"])("omits unavailable PAID bank line for key %s", async paymentAccountKey => {
  mount(<VendorBillPaidAccount paymentAccountKey={paymentAccountKey} />);
  await waitFor(() => expect(screen.queryByTestId("status-paid-account")).toBeNull());
  if (!paymentAccountKey) expect(fetch).not.toHaveBeenCalled();
});
it("recognizes only equipment/all for cumulative payment gating", () => {
  expect(["equipment", "all", "ALL"].every(hasCumulativeVendorPayment)).toBe(true);
  expect(["material", "transport", "labour", "", "other"].some(hasCumulativeVendorPayment)).toBe(false);
});