import React from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import PurchaseIndents from "../../../client/src/pages/PurchaseIndents";
import "../../../client/src/index.css";

type AnyRow = Record<string, any>;
type RequestRecord = { method: string; path: string; body?: any };

const catalog = [
  { id: 501, name: "WMM", defaultUom: "MT", category: "Aggregate", isActive: 1 }, // deliberately untagged
  { id: 502, name: "CRANE HIRE", defaultUom: "HOUR", category: "Service", procurementRoute: "service", isActive: 1 },
  { id: 503, name: "COTTON WASTE", defaultUom: "KG", category: "Consumable", isActive: 1 }, // store fallback
];
const oldItem = {
  id: 9001, description: "WMM — PRE-FIX STORED ROW", qty: 100, approvedQty: 100, orderedQty: 100,
  uom: "MT", purpose: "PLANT", priority: "normal", materialId: 501, procurementRoute: "stores",
  purchaseStatus: "ordered", totalAcceptedQty: 0, deliveredQty: 0, receivingLocation: "hmp_plant",
  vendor: "SYNTHETIC VENDOR", paymentMode: "credit", deliveryEvidence: [], deliveryWarnings: [],
};
let indents: AnyRow[] = [{
  id: 90, indentNo: "SYNTHETIC/PI02/BEFORE/0090", date: "2026-03-01", siteId: 11,
  raisedFrom: "SYNTHETIC SITE", proposedBy: "SYNTHETIC REQUESTER", raisedBy: "SYNTHETIC ENGINEER",
  remarks: "PRE-FIX SYNTHETIC STORED ROUTE MUST REMAIN UNCHANGED", status: "ordered",
  storesStatus: "bypassed", piType: "material", createdAt: "2026-03-01T08:00:00.000Z", items: [oldItem],
}];

const fixtureState = {
  requests: [] as RequestRecord[], creates: [] as AnyRow[], toasts: [] as AnyRow[],
  existingBefore: { indentId: 90, itemId: 9001, procurementRoute: "stores" },
};
declare global { interface Window { __PI02Fixture?: typeof fixtureState; } }
window.__PI02Fixture = fixtureState;

const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), {
  status, headers: { "Content-Type": "application/json" },
});

window.fetch = async (input, init) => {
  const raw = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const inputMethod = typeof input === "object" && "method" in input ? input.method || "GET" : "GET";
  const url = new URL(raw, window.location.origin);
  const method = String(init?.method || inputMethod).toUpperCase();
  let body: any;
  try { body = init?.body ? JSON.parse(String(init.body)) : undefined; } catch { body = init?.body; }
  fixtureState.requests.push({ method, path: `${url.pathname}${url.search}`, body });

  if (url.pathname === "/api/purchase-indents" && method === "POST") {
    fixtureState.creates.push(body);
    const id = 91 + fixtureState.creates.length;
    const saved = {
      ...body, id, indentNo: `SYNTHETIC/PI02/AFTER/${String(id).padStart(4, "0")}`,
      raisedFrom: "SYNTHETIC SITE", status: "ordered", storesStatus: "bypassed",
      createdAt: "2026-03-02T08:00:00.000Z",
      items: body.items.map((row: AnyRow, index: number) => ({
        ...row, id: id * 100 + index, approvedQty: row.qty, orderedQty: row.qty,
        purchaseStatus: "ordered", totalAcceptedQty: 0, deliveredQty: 0,
        receivingLocation: "hmp_plant", paymentMode: "credit",
        deliveryEvidence: [], deliveryWarnings: [],
      })),
    };
    indents = [...indents, saved];
    document.querySelector("[data-testid=pi02-route-evidence]")!.textContent =
      `SYNTHETIC INTERCEPTED API — BEFORE stored route: stores (unchanged) — AFTER saved WMM route: ${body.items[0]?.procurementRoute}`;
    return json(saved, 201);
  }
  if (url.pathname === "/api/purchase-indents" && method === "GET") return json(indents);
  if (/^\/api\/purchase-indents\/\d+$/.test(url.pathname) && method === "GET") {
    return json(indents.find(row => row.id === Number(url.pathname.split("/").pop())) || {});
  }
  if (/^\/api\/purchase-indents\/\d+\/transactions$/.test(url.pathname)) return json([]);
  if (url.pathname === "/api/plant-module/materials") return json(catalog);
  if (url.pathname === "/api/sites") return json([{ id: 11, name: "SYNTHETIC SITE" }]);
  if (url.pathname === "/api/personnel") return json([
    { id: 1, name: "SYNTHETIC REQUESTER", isActive: 1 },
    { id: 2, name: "SYNTHETIC ENGINEER", isActive: 1 },
  ]);
  if (url.pathname === "/api/purchase-indents/summary") return json({ total: indents.length, pending: 0, storesCheck: 0, approved: 0, completed: 0 });
  if (url.pathname === "/api/pending-plant-receipts" || url.pathname === "/api/service-completions" ||
      url.pathname === "/api/site-material-trips" || url.pathname === "/api/stores/grns") return json([]);
  if (url.pathname.startsWith("/api/")) return json([]);
  throw new Error(`PI-02 fixture blocked non-API request: ${url.pathname}`);
};

queryClient.clear();
createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={queryClient}>
    <div className="sticky top-0 z-[200] border-b border-fuchsia-300 bg-fuchsia-50 px-4 py-2 text-center text-xs font-bold text-fuchsia-950" data-testid="pi02-fixture-disclosure">
      PI-02 REAL PURCHASE INDENTS COMPONENT — SYNTHETIC INTERCEPTED API ONLY — NO LIVE API, CATALOG, RECORD, OR DATABASE WRITES
      <div data-testid="pi02-route-evidence">SYNTHETIC FIXTURE BEFORE stored route: stores — awaiting new selection/save</div>
    </div>
    <PurchaseIndents />
  </QueryClientProvider>,
);