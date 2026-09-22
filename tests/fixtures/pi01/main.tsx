import React from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import PurchaseIndents from "../../../client/src/pages/PurchaseIndents";
import "../../../client/src/index.css";

type AnyRow = Record<string, any>;
type RequestRecord = { method: string; path: string; body?: any };

const sites = [
  { id: 11, name: "ALLADURG", isActive: true },
  { id: 22, name: "ZAHEERABAD", isActive: true },
];

const item = (values: AnyRow) => ({
  spec: null, partNo: null, purpose: "SITE", priority: "normal",
  approvedQty: values.qty, qtyPurchased: values.qty, purchaseStatus: "ordered",
  requiredBy: "2020-01-15", procurementRoute: "material", cancelledBy: null,
  estRate: null, estAmount: null, expectedDelivery: "2020-01-15",
  paymentMode: "credit", ...values,
});

const alladurgItems = [
  item({
    id: 101, description: "WMM — PARTIAL PLANT + SITE", qty: 1500, uom: "MT", deliveredQty: 600,
    receivingLocation: "hmp_plant", receivingSiteId: null,
    deliveryEvidence: [
      { kind: "receipt", id: 7101, date: "2020-01-16", quantity: 400, uom: "MT", reference: "PMR-7101", status: "active", countedQty: 400 },
      { kind: "trip", id: 8101, date: "2020-01-18", quantity: 200, uom: "MT", reference: "TRIP-8101", status: "active", countedQty: 200 },
    ], deliveryWarnings: [],
  }),
  item({
    id: 102, description: "GSB — FULLY DELIVERED AFTER DUE DATE", qty: 1500, uom: "MT", deliveredQty: 1500,
    receivingLocation: "site", receivingSiteId: 11,
    deliveryEvidence: [
      { kind: "receipt", id: 7102, date: "2020-01-16", quantity: 1000, uom: "MT", reference: "PMR-7102", status: "active", countedQty: 1000 },
      { kind: "trip", id: 8102, date: "2020-01-20", quantity: 500, uom: "MT", reference: "TRIP-8102", status: "active", countedQty: 500 },
    ], deliveryWarnings: [],
  }),
  item({
    id: 103, description: "STONE DUST — DESTINATION REQUIRED", qty: 300, uom: "MT", deliveredQty: 0,
    receivingLocation: null, receivingSiteId: null, deliveryEvidence: [], deliveryWarnings: [],
  }),
];

const baseIndent = {
  date: "2027-02-10", proposedBy: "SYNTHETIC REQUESTER", raisedBy: "SYNTHETIC ENGINEER",
  remarks: "PI-01 SYNTHETIC BROWSER EVIDENCE", status: "ordered", storesStatus: "bypassed",
  approvedBy: "SYNTHETIC APPROVER", approvalRemarks: null, rejectionReason: null,
  lockStatus: "locked", requiredBy: "2020-01-15", createdAt: "2027-02-10T08:00:00.000Z",
  approvedAt: "2027-02-10T09:00:00.000Z", orderedAt: "2027-02-10T10:00:00.000Z",
};

let indents: AnyRow[] = [
  { ...baseIndent, id: 1, indentNo: "HLC/PI/ALLADURG/2027/0004", siteId: 11, raisedFrom: "ALLADURG", piType: "material", items: alladurgItems },
  { ...baseIndent, id: 2, indentNo: "HLC/PI/ZAHEERABAD/2027/0001", siteId: 22, raisedFrom: "ZAHEERABAD", piType: "material", items: [
    item({ id: 201, description: "WMM", qty: 500, uom: "MT", deliveredQty: 0, receivingLocation: "site", receivingSiteId: 22, deliveryEvidence: [], deliveryWarnings: [] }),
  ] },
  { ...baseIndent, id: 3, indentNo: "HLC/PI/ALLADURG/2027/0005", siteId: 11, raisedFrom: "ALLADURG", piType: "stores", items: [
    item({ id: 301, description: "BEARING", spec: "6205-2RS", partNo: "SKF-6205", qty: 4, approvedQty: 4, qtyPurchased: 0, uom: "NOS", deliveredQty: 0, purchaseStatus: null, procurementRoute: "stores", deliveryEvidence: undefined }),
  ] },
];

const fixtureState = { requests: [] as RequestRecord[], destinationUpdates: [] as AnyRow[], toasts: [] as AnyRow[] };
declare global { interface Window { __PI01Fixture?: typeof fixtureState; } }
window.__PI01Fixture = fixtureState;

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

  if (url.pathname === "/api/purchase-indents" && method === "GET") return json(indents);
  if (/^\/api\/purchase-indents\/\d+$/.test(url.pathname) && method === "GET") {
    return json(indents.find(row => row.id === Number(url.pathname.split("/").pop())) || {}, 200);
  }
  if (/^\/api\/purchase-indents\/\d+\/transactions$/.test(url.pathname)) return json([]);
  const destinationMatch = url.pathname.match(/^\/api\/purchase-indents\/(\d+)\/items\/(\d+)\/destination$/);
  if (destinationMatch && method === "PATCH") {
    const indentId = Number(destinationMatch[1]);
    const itemId = Number(destinationMatch[2]);
    fixtureState.destinationUpdates.push({ indentId, itemId, ...body });
    indents = indents.map(indent => indent.id !== indentId ? indent : ({
      ...indent, items: indent.items.map((row: AnyRow) => row.id !== itemId ? row : ({
        ...row, receivingLocation: body.receivingLocation, receivingSiteId: body.receivingSiteId,
      })),
    }));
    return json({ ok: true, receivingLocation: body.receivingLocation, receivingSiteId: body.receivingSiteId });
  }
  if (url.pathname === "/api/sites") return json(sites);
  if (url.pathname === "/api/purchase-indents/summary") return json({ total: 3, pending: 0, storesCheck: 0, approved: 0, completed: 0 });
  if (url.pathname === "/api/pending-plant-receipts") return json([]);
  if (url.pathname === "/api/service-completions") return json([]);
  if (url.pathname === "/api/site-material-trips") return json([]);
  if (url.pathname === "/api/stores/grns") return json([]);
  if (url.pathname.startsWith("/api/")) return json([]);
  throw new Error(`PI-01 fixture blocked non-API request: ${url.pathname}`);
};

queryClient.clear();
createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={queryClient}>
    <div className="sticky top-0 z-[200] border-b border-purple-300 bg-purple-50 px-4 py-2 text-center text-xs font-bold text-purple-900" data-testid="pi01-fixture-disclosure">
      PI-01 REAL PURCHASE INDENTS COMPONENT — SYNTHETIC INTERCEPTED API DATA — NO LIVE API OR DATABASE WRITES
    </div>
    <PurchaseIndents />
  </QueryClientProvider>,
);