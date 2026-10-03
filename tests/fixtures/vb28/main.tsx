import React from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { TooltipProvider } from "@/components/ui/tooltip";
import VendorBills from "@/pages/VendorBills";
import "@/index.css";

const item = (id: number, category: string, description: string, date = "2027-03-01") => ({
  id, date, category, description, qty: 2, unit: "DAY", rate: 3500, amount: 7000,
  source: "manual", sourceType: "manual", siteName: "SYNTHETIC NORTH SITE",
});
const bill = (id: number, billType: string, items: ReturnType<typeof item>[]) => ({
  id, billNo: `VB28-SYNTHETIC-${id}`, vendorName: `VB28 SAMPLE VENDOR ${id}`, billType,
  siteId: 281, status: "draft", billDate: "2027-03-05", periodFrom: "2027-03-01", periodTo: "2027-03-05",
  totalAmount: items.reduce((sum, row) => sum + row.amount, 0), amountPaid: 0,
  createdAt: "2027-03-05T08:00:00Z", items, hireStatements: [], additionalAdjustments: [],
});
const bills = [
  bill(2801, "material", [item(1, "material", "SYNTHETIC STONE AGGREGATE"), item(2, "material", "SYNTHETIC SAND"), item(3, "material", "SYNTHETIC SECOND DATE", "2027-03-02")]),
  bill(2802, "all", [item(4, "material", "SYNTHETIC MATERIAL"), item(5, "labour", "SYNTHETIC MANUAL HELPER"), item(6, "labour", "SYNTHETIC MANUAL MASON"), { ...item(7, "labour", "SYNTHETIC SITE LABOUR"), siteName: "SITE: SYNTHETIC NORTH SITE" }]),
];
const state = { requests: [] as { method: string; path: string }[], confirms: [] as string[], accept: false };
(window as any).__VB28Fixture = state;
(window as any).__VB22Fixture = { toastMessages: [] };
window.confirm = message => { state.confirms.push(String(message)); return state.accept; };
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });
window.fetch = async (input, init) => {
  const raw = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const url = new URL(raw, location.origin);
  const method = String(init?.method || (typeof input === "object" && "method" in input ? input.method : "GET") || "GET").toUpperCase();
  state.requests.push({ method, path: url.pathname });
  if (!url.pathname.startsWith("/api/")) throw new Error("Non-API fetch blocked in isolated VB28 fixture");
  if (method !== "GET" && url.pathname !== "/api/vendor-bills/check-duplicates") throw new Error("VB28 blocked unexpected write");
  if (url.pathname === "/api/sites") return json([{ id: 281, name: "SYNTHETIC NORTH SITE", isActive: true }]);
  if (url.pathname === "/api/vendor-bills") return json(bills);
  if (url.pathname === "/api/vendor-bills/summary") return json({ total: 2, draft: 2, totalAmount: 42000, draftAmount: 42000, gstByCategory: {}, totalGst: 0 });
  if (url.pathname === "/api/vendor-bills/vendor-names") return json(bills.map(b => b.vendorName));
  const match = url.pathname.match(/^\/api\/vendor-bills\/(\d+)$/);
  if (match) return json(bills.find(b => b.id === Number(match[1])));
  return json([]);
};
queryClient.clear();
createRoot(document.getElementById("root")!).render(<QueryClientProvider client={queryClient}>
  <TooltipProvider>
    <div data-testid="vb28-disclosure" className="sticky top-0 z-[200] bg-violet-50 p-2 text-center text-xs font-bold text-violet-950">
      VB-28 · ACTUAL VENDOR BILL UI · SYNTHETIC DATA · NO LIVE API OR DATABASE WRITES
    </div>
    <VendorBills />
  </TooltipProvider>
</QueryClientProvider>);