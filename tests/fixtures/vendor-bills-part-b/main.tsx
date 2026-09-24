import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "../../../client/src/lib/auth-context";
import VendorBills from "../../../client/src/pages/VendorBills";
import "../../../client/src/index.css";

const state = {
  linked: false,
  cards: [
    { vendorName: "SYNTHETIC LINE SUPPLIER", category: "material", itemKey: "MAT_SOIL_TRIP", unit: "TRIP", rate: 800 },
    { vendorName: "SYNTHETIC LINE SUPPLIER", category: "material", itemKey: "MAT_SOIL_CFT", unit: "CFT", rate: 12 },
    { vendorName: "SYNTHETIC SUPPLIER", category: "material", itemKey: "MAT_SOIL_CFT", unit: "CFT", rate: 12 },
    { vendorName: "SYNTHETIC SUPPLIER", category: "material", itemKey: "MAT_SOIL_TRIP", unit: "TRIP", rate: 800 },
  ] as Record<string, unknown>[],
  holdNextRate: false,
  releaseRate: null as null | (() => void),
  writes: [] as string[],
};
(window as any).__vendorB = state;
const source = {
  date: "2026-09-15", category: "material", description: "SOIL (SITE TRIP MATERIAL)",
  qty: 600, unit: "CFT", rate: 0, source: "auto",
  vendorName: "SYNTHETIC LINE SUPPLIER",
  sourceType: "site_material_trip_material", sourceId: 42, siteName: "SITE: SYNTHETIC NORTH",
};
const savedBill = {
  id: 41, billNo: "SYN-B-41", billDate: "2026-09-30", billType: "material",
  vendorName: "SYNTHETIC SUPPLIER", periodFrom: "2026-09-01", periodTo: "2026-09-30",
  status: "draft", totalAmount: 7200, hireStatements: [],
  items: [{ id: 410, date: "2026-09-15", category: "material", description: "SOIL",
    qty: 600, unit: "CFT", rate: 12, amount: 7200, source: "manual", equipmentId: null, leadDistance: null }],
};
const originalFetch = window.fetch.bind(window);
window.fetch = async (input, init = {}) => {
  const url = new URL(typeof input === "string" ? input : input.url, location.origin);
  if (url.pathname === "/api/auth/me") return Response.json({
    user: { id: 99, email: "fixture@example.invalid", fullName: "Synthetic Administrator", isAdmin: true, isOwner: false, isActive: true, sessionPolicy: "sticky" },
    permissions: {},
  });
  if (url.pathname === "/api/vendor-rate-cards") {
    if (state.holdNextRate) {
      state.holdNextRate = false;
      return new Promise<Response>(resolve => {
        state.releaseRate = () => {
          state.releaseRate = null;
          resolve(Response.json(state.cards.filter(card => card.vendorName === url.searchParams.get("vendorName"))));
        };
      });
    }
    return Response.json(state.cards.filter(card => card.vendorName === url.searchParams.get("vendorName")));
  }
  if (url.pathname === "/api/vendor-bills/summary") return Response.json({ total: 0, totalAmount: 0, draft: 0, verified: 0, approved: 0, paid: 0, gstByCategory: {}, totalGst: 0 });
  if (url.pathname === "/api/vendor-bills/vendor-names") return Response.json(["SYNTHETIC SUPPLIER"]);
  if (url.pathname === "/api/vendor-bills/discover-vendors") return Response.json([{ vendorName: "SYNTHETIC SUPPLIER", recordCount: 1, categories: ["material"] }]);
  if (url.pathname === "/api/vendor-bills/auto-items") return Response.json([source]);
  if (url.pathname === "/api/vendor-bills/check-duplicates") return Response.json([]);
  if (url.pathname === "/api/vendor-bills/41") return Response.json(savedBill);
  if (url.pathname === "/api/vendor-bills") return Response.json([savedBill]);
  if (url.pathname === "/api/vendor-aliases" || url.pathname === "/api/vendor-bills/hire-activities" || url.pathname === "/api/vendor-bills/equipment-hire-discovery") return Response.json([]);
  if (url.pathname.startsWith("/api/")) {
    if (init.method && init.method !== "GET") state.writes.push(`${init.method} ${url.pathname}`);
    return Response.json({ message: `Unexpected synthetic API ${url.pathname}` }, { status: 404 });
  }
  return originalFetch(input, init);
};
const client = new QueryClient({ defaultOptions: { queries: { retry: false, queryFn: async ({ queryKey }) => {
  const endpoint = queryKey[0] === "/api/vendor-bills" && typeof queryKey[1] === "number"
    ? `/api/vendor-bills/${queryKey[1]}` : String(queryKey[0]);
  const response = await fetch(endpoint);
  if (!response.ok) throw new Error(`Fixture GET failed: ${response.status}`);
  return response.json();
} } } });
createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={client}><AuthProvider>
    <div className="border-b-2 border-fuchsia-600 bg-fuchsia-50 px-5 py-3 font-bold text-fuchsia-900" data-testid="fixture-label">
      PART B · SYNTHETIC ACTUAL VENDOR BILLS COMPONENT · MOCK API ONLY · NO LIVE WRITES
    </div>
    <VendorBills />
  </AuthProvider></QueryClientProvider>,
);