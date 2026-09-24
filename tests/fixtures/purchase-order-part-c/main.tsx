import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "../../../client/src/lib/auth-context";
import PurchaseIndents from "../../../client/src/pages/PurchaseIndents";
import { queryClient } from "../../../client/src/lib/queryClient";
import "../../../client/src/index.css";

const row = (id: number, piType: string, description: string, vendorId: number | null, status = "ordered") => ({
  id, indentNo: `SYN/PI/${id}`, date: "2026-09-24", proposedBy: "SYNTHETIC BUYER", raisedBy: "SYNTHETIC BUYER",
  raisedFrom: "SYNTHETIC SITE A", status, piType, siteId: 1, storesStatus: "verified",
  items: [{
    id, indentId: id, description, spec: "", partNo: "", qty: piType === "material" ? 20 : 4,
    approvedQty: piType === "material" ? 20 : 4, orderedQty: status === "ordered" ? (piType === "material" ? 20 : 4) : null,
    uom: piType === "material" ? "MT" : "NOS", purpose: "SYNTHETIC REPAIR",
    priority: "normal", purchaseStatus: status === "ordered" ? "ORDERED" : null,
    procurementRoute: piType === "material" ? "material" : "stores",
    vendor: "SYNTHETIC Supplier", vendorId, orderNo: status === "ordered" ? `SYN-PO-${id}` : null,
    rate: status === "ordered" ? 735 : null, paymentMode: status === "ordered" ? "credit" : null,
    expectedDelivery: status === "ordered" ? "2026-09-29" : null, receivingLocation: "site", receivingSiteId: 1,
    deliveredQty: 0, totalAcceptedQty: 0, history: [],
  }],
});
const state = {
  indents: [
    row(11, "material", "SYNTHETIC GSB aggregate · linked bulk", 3),
    row(12, "stores", "SYNTHETIC bearing · unlinked store", null),
    row(13, "material", "SYNTHETIC WMM · unlinked bulk", null),
    row(14, "stores", "SYNTHETIC seal · linked store", 4),
    row(15, "stores", "SYNTHETIC clamp · order without PDF", null, "approved"),
  ],
  writes: [] as { method: string; path: string; body: any }[],
  previews: [] as string[],
  previewUrls: { created: [] as string[], revoked: [] as string[] },
  unexpected: [] as string[],
};
(window as any).__poFixture = state;
const createObjectURL = URL.createObjectURL.bind(URL);
const revokeObjectURL = URL.revokeObjectURL.bind(URL);
URL.createObjectURL = (blob) => {
  const url = createObjectURL(blob);
  state.previewUrls.created.push(url);
  return url;
};
URL.revokeObjectURL = (url) => {
  state.previewUrls.revoked.push(url);
  revokeObjectURL(url);
};
const originalFetch = window.fetch.bind(window);
window.fetch = async (input, init = {}) => {
  const url = new URL(typeof input === "string" ? input : input.url, location.origin);
  const method = (init.method || "GET").toUpperCase();
  if (url.pathname === "/api/auth/me") return Response.json({
    user: { id: 99, email: "fixture@example.invalid", fullName: "Synthetic Administrator", isAdmin: true, isOwner: false, isActive: true, sessionPolicy: "sticky" },
    permissions: {},
  });
  if (url.pathname === "/api/purchase-indents" && method === "GET") return Response.json(state.indents);
  if (url.pathname === "/api/purchase-indents/summary") return Response.json({ total: state.indents.length, approved: 1, pending: 0, storesCheck: 0, completed: 0, rejected: 0 });
  if (url.pathname === "/api/sites" || url.pathname === "/api/site-list") return Response.json([{ id: 1, name: "SYNTHETIC SITE A" }]);
  if (/^\/api\/purchase-indents\/\d+$/.test(url.pathname)) return Response.json(state.indents.find(indent => indent.id === Number(url.pathname.split("/").pop())));
  if (/^\/api\/purchase-indents\/\d+\/transactions$/.test(url.pathname)) return Response.json([]);
  if (/^\/api\/purchase-indents\/\d+\/purchaser-action$/.test(url.pathname) && method === "POST") {
    const body = JSON.parse(String(init.body));
    state.writes.push({ method, path: url.pathname, body });
    const id = Number(url.pathname.split("/")[3]);
    state.indents = state.indents.map(indent => indent.id !== id ? indent : {
      ...indent, status: "ordered",
      items: indent.items.map(item => {
        const entry = body.items.find((i: any) => i.itemId === item.id);
        return entry ? { ...item, purchaseStatus: "ORDERED", orderedQty: entry.qty,
          vendor: entry.vendor, rate: entry.rate, expectedDelivery: entry.expectedDeliveryDate,
          paymentMode: entry.paymentMode } : item;
      }),
    });
    const indent = state.indents.find(i => i.id === id)!;
    return Response.json({ indent, txnIdsByItemId: {}, grnIdsByItemId: {} });
  }
  if (url.pathname.endsWith("/purchase-order.pdf")) {
    state.previews.push(url.pathname + url.search);
    return originalFetch(input, init);
  }
  if (url.pathname.startsWith("/api/")) {
    const benignReads = new Set([
      "/api/plant-module/materials", "/api/purchase-indent-items/recent-items",
      "/api/stores/stock-balance", "/api/stores/indent-grn-counts",
      "/api/stores/indent-fulfilment-status", "/api/pending-plant-receipts",
      "/api/service-completions", "/api/site-material-trips", "/api/stores/grns",
    ]);
    if (method === "GET" && url.pathname === "/api/config") return Response.json({});
    if (method === "GET" && benignReads.has(url.pathname)) return Response.json([]);
    state.unexpected.push(`${method} ${url.pathname}`);
    return Response.json({ message: `Unexpected synthetic API: ${method} ${url.pathname}` }, { status: 404 });
  }
  return originalFetch(input, init);
};
queryClient.setDefaultOptions({ queries: { ...queryClient.getDefaultOptions().queries, retry: false, queryFn: async ({ queryKey }) => {
  const endpoint = queryKey[0] === "/api/purchase-indents" && typeof queryKey[1] === "number"
    ? `/api/purchase-indents/${queryKey[1]}` : String(queryKey[0]);
  const response = await fetch(endpoint);
  if (!response.ok) throw new Error(`Synthetic fixture GET failed: ${endpoint} (${response.status})`);
  return response.json();
} } });
createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={queryClient}><AuthProvider>
    <div data-testid="fixture-label" className="sticky top-0 z-50 border-b-2 border-fuchsia-700 bg-fuchsia-50 px-5 py-3 font-bold text-fuchsia-900">
      PART C · SYNTHETIC PURCHASE INDENTS · REAL COMPONENT · MOCK API ONLY · NO LIVE BUSINESS WRITES
    </div>
    <PurchaseIndents />
  </AuthProvider></QueryClientProvider>,
);