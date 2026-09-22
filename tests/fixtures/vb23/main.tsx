import React from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { TooltipProvider } from "@/components/ui/tooltip";
import VendorBills from "@/pages/VendorBills";
import "@/index.css";

// Intentionally synthetic isolated API, never connected to live records.
const params = new URLSearchParams(location.search);
let bill: any = {
  id: 2301, billNo: "VB23-FIXTURE", vendorName: "VB23 SYNTHETIC VENDOR",
  billType: params.get("type") || "all", status: params.get("status") || "approved",
  billDate: "2026-09-22", periodFrom: "2026-09-01", periodTo: "2026-09-22",
  totalAmount: 1000, netPayableAmount: 1000, amountPaid: 0,
  paymentMode: null, paidBy: null, paymentAccountKey: null,
  createdAt: "2026-09-22T09:00:00Z", verifiedAt: "2026-09-22T10:00:00Z",
  verifiedBy: "FIXTURE VERIFIER", approvedAt: "2026-09-22T11:00:00Z",
  approvedBy: "FIXTURE APPROVER", items: [], hireStatements: [],
};
if (bill.status === "paid") Object.assign(bill, {
  amountPaid: null, paidAt: "2026-09-22T15:04:00Z", paymentRecordedBy: "FIXTURE PAYMENT USER",
});
const state = { requests: [] as any[] };
(window as any).__VB23Fixture = state;
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
window.fetch = async (input, init) => {
  const url = new URL(String(input), location.origin);
  const method = init?.method || "GET";
  const body = init?.body ? JSON.parse(String(init.body)) : null;
  const request: any = { path: url.pathname, method, body, status: 200 };
  state.requests.push(request);
  if (url.pathname === "/api/vendor-bills/company-accounts") return json([{ id: "hdfc-current", name: "HDFC CURRENT A/C", type: "bank" }]);
  if (url.pathname === "/api/vendor-bills/2301/payment-details") {
    bill = { ...bill, ...body }; return json(bill);
  }
  if (url.pathname === "/api/vendor-bills/2301/status") {
    if (body.status === "paid" && ["equipment", "all"].includes(bill.billType) && Number(bill.amountPaid) < 1000) {
      request.status = 409;
      return json({ message: "Record the remaining equipment hire balance before marking this bill paid." }, 409);
    }
    bill = { ...bill, status: body.status, paidAt: "2026-09-22T15:04:00Z", paymentRecordedBy: "FIXTURE PAYMENT USER" };
    return json(bill);
  }
  if (url.pathname === "/api/vendor-bills") return json([bill]);
  if (url.pathname === "/api/vendor-bills/2301") return json(bill);
  if (url.pathname === "/api/vendor-bills/summary") return json({ total: 1, totalAmount: 1000, gstByCategory: {} });
  if (method !== "GET") throw new Error(`Unexpected fixture write ${method} ${url.pathname}`);
  return json([]);
};
createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={queryClient}><TooltipProvider>
    <aside style={{ position: "sticky", top: 0, zIndex: 100, background: "#fff3c4", padding: 12, borderBottom: "2px solid #b45309" }}>
      <strong>VB23 TEST FIXTURE — production VendorBills component; synthetic in-memory API.</strong>
      <div>Not live backend evidence. 409 is simulated here; actual storage guard is tested separately.</div>
      <div id="fixture-toast" role="status" style={{ color: "#b91c1c", fontWeight: 700 }} />
    </aside>
    <VendorBills />
  </TooltipProvider></QueryClientProvider>,
);