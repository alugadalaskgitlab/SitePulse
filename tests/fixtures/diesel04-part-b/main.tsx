import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "../../../client/src/lib/auth-context";
import { queryClient } from "../../../client/src/lib/queryClient";
import PlantMaterialReceipts from "../../../client/src/pages/PlantMaterialReceipts";
import "../../../client/src/index.css";

// In-memory API only. No request from this fixture reaches the business server.
const state = { balance: 90, failLedger: false, receipts: [
  { id: 1, date: "2026-09-15", invoiceDate: "2026-09-15", materialId: 1, quantity: 100, uom: "Liters", partyId: null, receiptNo: "SYN-1", documentStatus: "pending" },
], writes: [] as string[], stockReads: 0 };
(window as any).__dieselB = { ...state, refetchLedger: () => queryClient.invalidateQueries({ queryKey: ["/api/plant-module/stock-ledger"] }), get stockReads() { return state.stockReads; }, get writes() { return state.writes; }, get receipts() { return state.receipts; }, get failLedger() { return state.failLedger; }, set failLedger(value: boolean) { state.failLedger = value; } };
localStorage.setItem("plant-material-receipts:filters:v1", JSON.stringify({
  filterPartyId: "all", filterMaterialId: "1", filterUnapprovedIndent: false,
}));
const originalFetch = window.fetch.bind(window);
window.fetch = async (input, init = {}) => {
  const url = new URL(typeof input === "string" ? input : input.url, location.origin);
  if (url.pathname === "/api/auth/me") return Response.json({
    user: { id: 99, email: "fixture@example.invalid", fullName: "Synthetic Admin", isAdmin: true, isOwner: false, isActive: true, sessionPolicy: "sticky" },
    permissions: {},
  });
  if (url.pathname === "/api/plant-module/materials") return Response.json([{ id: 1, name: "DIESEL", category: "Utility", defaultUom: "Liters" }]);
  if (url.pathname === "/api/plant-module/parties") return Response.json([{ id: 7, name: "SYNTHETIC JOB" }]);
  if (url.pathname === "/api/plant-module/stock-balances") {
    state.stockReads++;
    return Response.json([{ id: 1, materialId: 1, partyId: null, balance: state.balance, uom: "Liters" }]);
  }
  if (url.pathname === "/api/plant-module/stock-ledger") {
    if (state.failLedger) return Response.json({ message: "Synthetic ledger outage" }, { status: 503 });
    if (url.searchParams.get("dateFrom") === "2026-09-20") return Response.json([]);
    return Response.json([
    { id: 1, materialId: 1, transactionType: "equipment_usage", quantityOut: 10, uom: "Liters" },
    { id: 2, materialId: 1, transactionType: "direct_purchase", quantityIn: 2, uom: "Liters" },
    { id: 3, materialId: 1, transactionType: "receipt", quantityIn: 100, uom: "Liters" },
    ]);
  }
  if (url.pathname === "/api/plant-module/material-receipts") {
    if (init.method === "POST") {
      state.writes.push("POST receipt (mock)");
      const payload = JSON.parse(String(init.body));
      state.balance += Number(payload.quantity);
      const receipt = { ...payload, id: 2, receiptNo: "SYN-2", documentStatus: "pending" };
      state.receipts.push(receipt);
      return Response.json(receipt);
    }
    return Response.json(state.receipts);
  }
  if (url.pathname === "/api/plant-module/next-receipt-number") return Response.json({ number: "SYN-2" });
  if (url.pathname.startsWith("/api/")) return Response.json(url.pathname.includes("receipt-status") ? {} : []);
  return originalFetch(input, init);
};
createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={queryClient}><AuthProvider>
    <div className="p-3 bg-amber-100 font-bold">DIESEL-04 B · MOCK API · ACTUAL RECEIPT COMPONENT · NO LIVE WRITES</div>
    <PlantMaterialReceipts />
  </AuthProvider></QueryClientProvider>,
);