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
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify([{ id: "bank", name: "HDFC CURRENT A/C", type: "bank" }]))));
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
  expect(fetch).toHaveBeenCalledWith("/api/vendor-bills/company-accounts", { credentials: "include" });
});

it("does not widen material fields, account query, or payload", async () => {
  mount(<VendorBillPaymentDetails canEditPayment bill={{ id: 2, billType: "material", paidBy: "company" }} />);
  fireEvent.click(screen.getByTestId("button-edit-payment-details"));
  expect(screen.queryByTestId("input-vb-amount-paid")).toBeNull();
  expect(screen.queryByTestId("select-vb-payment-account")).toBeNull();
  fireEvent.click(screen.getByTestId("button-save-payment-details"));
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
  expect(fetch).toHaveBeenCalledWith("/api/vendor-bills/2/payment-details", expect.objectContaining({
    body: JSON.stringify({ paymentMode: null, paidBy: "company" }),
  }));
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