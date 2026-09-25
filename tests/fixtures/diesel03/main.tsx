import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import DieselRequirements from "../../../client/src/pages/DieselRequirements";
import { queryClient } from "../../../client/src/lib/queryClient";
import "../../../client/src/index.css";

type FixtureRequirement = Record<string, any>;

const item = (id: number, name: string, qty: number) => ({
  id,
  requirementId: Math.floor(id / 10),
  equipmentId: id + 700,
  equipmentName: name,
  purpose: "DAILY DIESEL FIXTURE",
  estHours: 8,
  norm: 2.5,
  normType: "hourly",
  plannedQty: qty,
  approvedQty: qty,
});

/*
 * A and B are fresh purchased-but-unpaid requirements used for the Company
 * and Personal payment flows.  C is A after its in-memory PATCH.  D is the
 * historical paid record with no paymentAccountKey.  E remains unpaid for
 * the negative/footprint assertion.
 */
const initialRequirements: FixtureRequirement[] = [
  {
    id: 101,
    date: "2026-09-15",
    raisedBy: "DIESEL03 A",
    totalPlanned: 100,
    totalApproved: 100,
    status: "purchased",
    remarks: "DIESEL-03 A COMPANY PAYMENT",
    approvedBy: "DIESEL03 APPROVER",
    approvedAt: "2026-09-15T08:00:00.000Z",
    qtyPurchased: 100,
    supplier: "FIXTURE DIESEL SUPPLIER",
    billNo: "D03-A-001",
    rate: 95,
    amount: 9500,
    purchasedAt: "2026-09-15T10:00:00.000Z",
    purchaseRemarks: "FIXTURE COMPANY PAYMENT",
    paymentMode: null,
    paidBy: null,
    paymentStatus: "pending",
    paidAt: null,
    paymentRecordedBy: null,
    paymentAccountKey: null,
    siteId: 903,
    raisedFrom: null,
    items: [item(1011, "EXCAVATOR · D03-A", 100)],
  },
  {
    id: 102,
    date: "2026-09-14",
    raisedBy: "DIESEL03 B",
    totalPlanned: 80,
    totalApproved: 80,
    status: "purchased",
    remarks: "DIESEL-03 B PERSONAL PAYMENT",
    approvedBy: "DIESEL03 APPROVER",
    approvedAt: "2026-09-14T08:00:00.000Z",
    qtyPurchased: 80,
    supplier: "FIXTURE DIESEL SUPPLIER",
    billNo: "D03-B-002",
    rate: 95,
    amount: 7600,
    purchasedAt: "2026-09-14T10:00:00.000Z",
    purchaseRemarks: "FIXTURE PERSONAL PAYMENT",
    paymentMode: null,
    paidBy: null,
    paymentStatus: "pending",
    paidAt: null,
    paymentRecordedBy: null,
    paymentAccountKey: null,
    siteId: 903,
    raisedFrom: null,
    items: [item(1021, "LOADER · D03-B", 80)],
  },
  {
    id: 103,
    date: "2026-09-12",
    raisedBy: "DIESEL03 D",
    totalPlanned: 65,
    totalApproved: 65,
    status: "purchased",
    remarks: "DIESEL-03 D HISTORICAL PAID",
    approvedBy: "DIESEL03 APPROVER",
    approvedAt: "2026-09-12T08:00:00.000Z",
    qtyPurchased: 65,
    supplier: "FIXTURE DIESEL SUPPLIER",
    billNo: "D03-D-003",
    rate: 95,
    amount: 6175,
    purchasedAt: "2026-09-12T10:00:00.000Z",
    purchaseRemarks: "HISTORICAL PAYMENT WITHOUT ACCOUNT",
    paymentMode: "cash",
    paidBy: "company",
    paymentStatus: "paid",
    paidAt: "2026-09-12T15:45:00.000Z",
    paymentRecordedBy: "DIESEL03 HISTORICAL",
    // Deliberately absent in the persisted historical shape.
    paymentAccountKey: null,
    siteId: 903,
    raisedFrom: null,
    items: [item(1031, "ROLLER · D03-D", 65)],
  },
  {
    id: 104,
    date: "2026-09-11",
    raisedBy: "DIESEL03 E",
    totalPlanned: 55,
    totalApproved: 55,
    status: "purchased",
    remarks: "DIESEL-03 E UNPAID",
    approvedBy: "DIESEL03 APPROVER",
    approvedAt: "2026-09-11T08:00:00.000Z",
    qtyPurchased: 55,
    supplier: "FIXTURE DIESEL SUPPLIER",
    billNo: "D03-E-004",
    rate: 95,
    amount: 5225,
    purchasedAt: "2026-09-11T10:00:00.000Z",
    purchaseRemarks: "UNPAID FOOTPRINT CONTROL",
    paymentMode: null,
    paidBy: null,
    paymentStatus: "pending",
    paidAt: null,
    paymentRecordedBy: null,
    paymentAccountKey: null,
    siteId: 903,
    raisedFrom: null,
    items: [item(1041, "GRADER · D03-E", 55)],
  },
];

const accounts = [
  { id: "hdfc-current-0012", name: "HDFC CURRENT · 0012", type: "bank" },
  { id: "icici-current-0099", name: "ICICI CURRENT · 0099", type: "bank" },
];

const fixtureState = {
  scenario: new URLSearchParams(window.location.search).get("scenario") || "diesel03",
  requests: [] as Array<{ method: string; path: string; body?: any }>,
  accountsRequests: 0,
  paymentPayloads: [] as Array<{ id: number; payload: any }>,
  persistedPaymentAccountKeys: [] as Array<{ id: number; value: string | null }>,
  toastMessages: [] as Array<{ title: string; description?: string }>,
  normSaveFails: new URLSearchParams(window.location.search).has("fail"),
  normSaveDelayMs: 0,
  normSaves: [] as Array<{ id: number; consumptionNorm: number }>,
  equipment: [
    { id: 1701, name: "DIESEL04 NO NORM", ownership: "owned", consumptionNorm: null as number | null, meterType: "hour_meter", isActive: 1 },
    { id: 1702, name: "DIESEL04 PRESET NORM", ownership: "owned", consumptionNorm: 3, meterType: "hour_meter", isActive: 1 },
    { id: 1703, name: "DIESEL04 ODOMETER", ownership: "owned", consumptionNorm: null as number | null, meterType: "odometer", isActive: 1 },
    { id: 1704, name: "DIESEL04 ZERO NORM", ownership: "owned", consumptionNorm: 0 as number | null, meterType: "hour_meter", isActive: 1 },
  ],
};

declare global {
  interface Window {
    __DIESEL03Fixture?: typeof fixtureState;
  }
}

window.__DIESEL03Fixture = fixtureState;
let requirements = initialRequirements.map((requirement) => ({ ...requirement, items: [...requirement.items] }));

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function requestDetails(input: RequestInfo | URL): { method: string; url: URL } {
  const method = typeof input === "object" && "method" in input ? input.method || "GET" : "GET";
  const rawUrl = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  return { method: method.toUpperCase(), url: new URL(rawUrl, window.location.origin) };
}

const copy = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const originalFetch = window.fetch.bind(window);

window.fetch = async (input, init) => {
  const { url: requestUrl, method: inputMethod } = requestDetails(input);
  const method = (init?.method || inputMethod).toUpperCase();
  const pathname = requestUrl.pathname;
  const body = init?.body ? JSON.parse(String(init.body)) : undefined;
  fixtureState.requests.push({ method, path: `${pathname}${requestUrl.search}`, ...(body ? { body } : {}) });

  if ((pathname === "/api/diesel-requirements" || pathname === "/api/diesel-requirements/") && method === "GET") {
    return json(copy(requirements));
  }
  if (pathname === "/api/diesel-requirements/summary" && method === "GET") {
    return json({
      total: requirements.length,
      pending: requirements.filter((requirement) => requirement.status === "pending").length,
      approved: requirements.filter((requirement) => requirement.status === "approved").length,
      rejected: requirements.filter((requirement) => requirement.status === "rejected").length,
    });
  }

  const detailMatch = pathname.match(/^\/api\/diesel-requirements\/(\d+)$/);
  if (detailMatch && method === "GET") {
    const requirement = requirements.find((candidate) => candidate.id === Number(detailMatch[1]));
    return requirement ? json(copy(requirement)) : json({ message: "Not found" }, 404);
  }

  if (pathname === "/api/diesel-requirements/receipt-status" && method === "GET") {
    const ids = (requestUrl.searchParams.get("ids") || "")
      .split(",")
      .filter(Boolean)
      .map(Number);
    const map: Record<number, any> = {};
    for (const id of ids) {
      const requirement = requirements.find((candidate) => candidate.id === id);
      if (requirement) {
        map[id] = {
          purchasedQty: requirement.qtyPurchased,
          receivedQty: requirement.qtyPurchased,
          pendingQty: 0,
          overReceiptQty: 0,
          status: "fully_received",
          validReceiptCount: 1,
          cancelledReceiptCount: 0,
          receipts: [{
            id: id * 10,
            date: requirement.purchasedAt?.slice(0, 10) || requirement.date,
            time: "11:00",
            invoiceDate: requirement.purchasedAt?.slice(0, 10) || requirement.date,
            quantity: requirement.qtyPurchased,
            uom: "L",
            supplier: requirement.supplier,
            challanNumber: `D03-RECEIPT-${id}`,
            receiptNo: null,
            isCancelled: false,
            finalSubmittedBy: "DIESEL03 FIXTURE",
          }],
        };
      }
    }
    return json(map);
  }

  if (pathname === "/api/vendor-bills/company-accounts" && method === "GET") {
    fixtureState.accountsRequests += 1;
    return json(copy(accounts));
  }
  if (pathname === "/api/plant-module/equipment" && method === "GET") {
    if (fixtureState.scenario === "diesel04") return json(copy(fixtureState.equipment));
    return json([{
      id: 1701,
      name: "DIESEL03 EXCAVATOR",
      registrationNumber: "D03-EX-01",
      ownership: "owned",
      consumptionNorm: 2.5,
      meterType: "hour_meter",
    }]);
  }
  const normMatch = pathname.match(/^\/api\/diesel-requirements\/equipment\/(\d+)\/consumption-norm$/);
  if (fixtureState.scenario === "diesel04" && normMatch && method === "PATCH") {
    if (fixtureState.normSaveDelayMs) await new Promise(resolve => setTimeout(resolve, fixtureState.normSaveDelayMs));
    if (fixtureState.normSaveFails) return json({ message: "Fixture write rejected" }, 500);
    const master = fixtureState.equipment.find(e => e.id === Number(normMatch[1]));
    if (!master) return json({ message: "Equipment not found" }, 404);
    master.consumptionNorm = body.consumptionNorm;
    fixtureState.normSaves.push({ id: master.id, consumptionNorm: master.consumptionNorm! });
    return json({ id: master.id, consumptionNorm: master.consumptionNorm });
  }
  if (pathname === "/api/diesel-requirements/recent-items" && method === "GET") return json([]);
  if (pathname === "/api/sites" && method === "GET") return json([{ id: 903, name: "DIESEL03 ROAD" }]);
  if (pathname === "/api/plant-module/materials" && method === "GET") {
    return json([{ id: 1703, name: "DIESEL", defaultUom: "Liters" }]);
  }
  if (pathname.startsWith("/api/attachments") && method === "GET") return json([]);
  // Purchased detail cards render EditPermissionButton.  Keep that
  // production hook on its normal authenticated success shape while ensuring
  // the fixture never creates an edit request.
  if (pathname === "/api/edit-requests/mine" && method === "GET") return json([]);
  if (pathname === "/api/edit-requests/check" && method === "GET") {
    return json({ hasPermission: true, request: null });
  }

  const paymentMatch = pathname.match(/^\/api\/diesel-requirements\/(\d+)\/payment-status$/);
  if (paymentMatch && method === "PATCH") {
    const id = Number(paymentMatch[1]);
    const requirement = requirements.find((candidate) => candidate.id === id);
    if (!requirement) return json({ message: "Not found" }, 404);
    fixtureState.paymentPayloads.push({ id, payload: copy(body || {}) });
    const accountKey = body?.paymentAccountKey ?? body?.accountKey ?? null;
    requirement.paymentStatus = "paid";
    requirement.paymentMode = body?.paymentMode ?? requirement.paymentMode;
    requirement.paidBy = body?.paidBy ?? requirement.paidBy;
    requirement.paymentAccountKey = accountKey;
    requirement.paidAt = "2026-09-15T14:30:00.000Z";
    requirement.paymentRecordedBy = "DIESEL03 FIXTURE USER";
    fixtureState.persistedPaymentAccountKeys.push({ id, value: accountKey });
    return json(copy(requirement));
  }

  // No fixture action should reach a real API or database.  Returning an empty
  // successful response keeps unrelated non-mutating page hooks harmless.
  if (pathname.startsWith("/api/")) return json({});
  return originalFetch(input, init);
};

queryClient.clear();
createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={queryClient}>
    <DieselRequirements />
  </QueryClientProvider>,
);