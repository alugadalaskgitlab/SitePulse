import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import PlantMaterialReceipts from "../../../client/src/pages/PlantMaterialReceipts";
import { queryClient } from "../../../client/src/lib/queryClient";
import "../../../client/src/index.css";

type ReceiptRequest = { method: string; path: string; body?: any };
type FixtureState = {
  scenario: string;
  requests: ReceiptRequest[];
  toastMessages: Array<{ title: string; description?: string }>;
  createRequests: number;
  resolveCreate: () => void;
};

const scenario = new URLSearchParams(window.location.search).get("scenario") || "success";
const state: FixtureState = {
  scenario,
  requests: [],
  toastMessages: [],
  createRequests: 0,
  resolveCreate: () => undefined,
};
window.__RECEIPT_FIXTURE = state;

const materials = [
  { id: 1, name: "Cement", category: "Construction", defaultUom: "Ton", isActive: true },
  { id: 2, name: "DIESEL", category: "Utility", defaultUom: "Liters", isActive: true },
];
const parties = [{ id: 1, name: "FIX1 JOB / PLANT" }];
const receipts: any[] = [];

const copy = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), {
  status,
  headers: { "Content-Type": "application/json" },
});
const requestDetails = (input: RequestInfo | URL) => {
  const rawUrl = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const method = typeof input === "object" && "method" in input ? input.method || "GET" : "GET";
  return { method: method.toUpperCase(), url: new URL(rawUrl, window.location.origin) };
};

const originalFetch = window.fetch.bind(window);
window.fetch = async (input, init) => {
  const { method: inputMethod, url } = requestDetails(input);
  const method = (init?.method || inputMethod).toUpperCase();
  const body = init?.body ? JSON.parse(String(init.body)) : undefined;
  state.requests.push({ method, path: `${url.pathname}${url.search}`, ...(body ? { body } : {}) });

  if (method === "GET" && url.pathname === "/api/plant-module/materials") return json(copy(materials));
  if (method === "GET" && url.pathname === "/api/plant-module/parties") return json(copy(parties));
  if (method === "GET" && url.pathname === "/api/plant-module/material-receipts") return json(copy(receipts));
  if (method === "GET" && url.pathname === "/api/purchase-indents") return json([]);
  if (method === "GET" && url.pathname.startsWith("/api/purchase-indents/for-material")) return json([]);
  if (method === "GET" && url.pathname.startsWith("/api/purchase-indents/pending-for-material")) return json([]);
  if (method === "GET" && url.pathname === "/api/plant-module/stock-balances") return json([]);
  if (method === "GET" && url.pathname === "/api/plant-module/next-receipt-number") return json({ number: "GRN-FIX1-PREVIEW" });
  if (method === "GET" && url.pathname === "/api/diesel-requirements") return json([]);
  if (method === "GET" && url.pathname === "/api/diesel-requirements/summary") return json({});
  if (method === "GET" && url.pathname === "/api/diesel-requirements/receipt-status") return json({});

  if (method === "POST" && url.pathname === "/api/plant-module/material-receipts") {
    state.createRequests += 1;
    if (scenario === "error") {
      return json({ message: "DIESEL_RECEIPT_EXCEEDS_REMAINING: fixture rejected this receipt" }, 409);
    }
    const saved = {
      ...body,
      id: 9401,
      receiptNo: "GRN-FIX1-001",
      quantity: Number(body.quantity),
      date: body.date,
      uom: body.uom,
    };
    return new Promise<Response>((resolve) => {
      state.resolveCreate = () => {
        receipts.push(saved);
        resolve(json(saved, 201));
      };
    });
  }

  // The fixture must never talk to a real API. Keep this fallback explicit in
  // the browser evidence state if the mounted component introduces a request.
  if (originalFetch) return json({ message: `Unhandled fixture request: ${method} ${url.pathname}` }, 404);
  return json({ message: "Unhandled fixture request" }, 404);
};

declare global {
  interface Window {
    __RECEIPT_FIXTURE: FixtureState;
  }
}

createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={queryClient}>
    <PlantMaterialReceipts />
  </QueryClientProvider>,
);