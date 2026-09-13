import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import VendorBills from "../../../client/src/pages/VendorBills";
import { queryClient } from "../../../client/src/lib/queryClient";
import "../../../client/src/index.css";

type FixtureBill = Record<string, any>;

const dailyRow = {
  key: "plant_usage:vb09",
  date: "2026-08-05",
  projectSite: "NARASIMHULU ROAD",
  openingMeter: 410,
  closingMeter: 418,
  workingHours: 8,
  workingHoursIncomplete: false,
  startTime: "08:00",
  endTime: "16:00",
  multipleTimeSegments: false,
  clockDuration: 8,
  clockDurationIncomplete: false,
  dieselIssued: null,
  openingTank: null,
  closingTank: null,
  dieselConsumed: null,
  expectedDiesel: null,
  difference: null,
  consumptionRate: null,
  consumptionRateUnit: "L/hr",
  consumptionIncomplete: true,
  events: [],
};

// This mirrors the persisted hire-statement snapshot shape used by storage:
// the export builder reads performanceDailyRows (and accepts dailyRows for
// legacy records), while sourceEvidence is retained for frozen maintenance
// context. Each representative bill below adds its own frozen financials.
const frozenDailyRows = [dailyRow];

/*
 * These are deliberately labelled representative fixture records.  They
 * exercise the persisted monthly-hire response shape only; the verifier must
 * not report them as production/dev-database evidence.  A dev-server run can
 * replace window.__VB09_HISTORICAL_BILLS__ with the server worker's two real
 * records before mounting this component.
 */
const representativeHistoricalBills: FixtureBill[] = [
  {
    id: 901,
    billDate: "2026-08-31",
    billNo: "VB09-HIST-DRAFT",
    billType: "equipment",
    vendorName: "NARASIMHULU",
    periodFrom: "2026-08-01",
    periodTo: "2026-08-31",
    status: "draft",
    notes: "REPRESENTATIVE FIXTURE RECORD — NOT PRODUCTION EVIDENCE",
    totalAmount: 90000,
    adjustmentAmount: 0,
    gstRateEquipment: 18,
    tdsRate: 2,
    netPayableAmount: 104076,
    amountPaid: 0,
    createdAt: "2026-08-31T12:00:00.000Z",
    items: [],
    hireStatements: [{
      id: 9901,
      equipmentId: 7701,
      equipmentName: "JCB · FIX-JCB-01",
      vendorName: "NARASIMHULU",
      billingBasis: "monthly",
      rate: 90000,
      periodFrom: "2026-08-01",
      periodTo: "2026-08-31",
      quantity: 1,
      grossAmount: 90000,
      deductionAmount: 0,
      netAmount: 90000,
      status: "draft",
      calculationSnapshot: {
        equipmentId: 7701,
        equipmentName: "JCB · FIX-JCB-01",
        terms: { billingBasis: "monthly", rate: 90000, dieselResponsibility: "vendor" },
        diesel: { consumptionNorm: null, actualDiesel: null, expectedDiesel: null, finalRecoveryAmount: 0 },
        performanceDailyRows: frozenDailyRows,
        dailyRows: frozenDailyRows,
        sourceEvidence: { activities: [], maintenance: [] },
        adjustments: { breakdownDeduction: 0, hsdRecovery: 0 },
        financials: { grossHire: 90000, breakdownDeduction: 0, hsdRecovery: 0, taxableAmount: 90000, gstRate: 18, gstAmount: 16200, invoiceTotal: 106200, tdsRate: 2, tdsAmount: 2124, netPayable: 104076 },
      },
      exceptions: [],
    }],
  },
  {
    id: 902,
    billDate: "2026-09-13",
    billNo: "VB09-HIST-PAID",
    billType: "equipment",
    vendorName: "NARASIMHULU",
    periodFrom: "2026-08-01",
    periodTo: "2026-09-13",
    status: "paid",
    notes: "REPRESENTATIVE FIXTURE RECORD — NOT PRODUCTION EVIDENCE",
    totalAmount: 126000,
    adjustmentAmount: 0,
    gstRateEquipment: 18,
    tdsRate: 2,
    netPayableAmount: 146034,
    amountPaid: 146034,
    createdAt: "2026-09-13T12:00:00.000Z",
    paidAt: "2026-09-20T12:00:00.000Z",
    paymentRecordedBy: "VB-09 Fixture",
    items: [],
    hireStatements: [{
      id: 9902,
      equipmentId: 7701,
      equipmentName: "JCB · FIX-JCB-01",
      vendorName: "NARASIMHULU",
      billingBasis: "monthly",
      rate: 126000,
      periodFrom: "2026-08-01",
      periodTo: "2026-09-13",
      quantity: 1,
      grossAmount: 126000,
      deductionAmount: 0,
      netAmount: 126000,
      status: "billed",
      calculationSnapshot: {
        equipmentId: 7701,
        equipmentName: "JCB · FIX-JCB-01",
        terms: { billingBasis: "monthly", rate: 126000, dieselResponsibility: "vendor" },
        diesel: { consumptionNorm: null, actualDiesel: null, expectedDiesel: null, finalRecoveryAmount: 0 },
        performanceDailyRows: frozenDailyRows,
        dailyRows: frozenDailyRows,
        sourceEvidence: { activities: [], maintenance: [] },
        adjustments: { breakdownDeduction: 0, hsdRecovery: 0 },
        financials: { grossHire: 126000, breakdownDeduction: 0, hsdRecovery: 0, taxableAmount: 126000, gstRate: 18, gstAmount: 22680, invoiceTotal: 148680, tdsRate: 2, tdsAmount: 2973.6, netPayable: 145706.4 },
      },
      exceptions: [],
    }],
  },
];

const nonEquipmentBills: FixtureBill[] = [
  {
    id: 903,
    billDate: "2026-08-10",
    billNo: "VB09-MATERIAL",
    billType: "material",
    vendorName: "MATERIAL VENDOR",
    periodFrom: "2026-08-01",
    periodTo: "2026-08-31",
    status: "verified",
    totalAmount: 12000,
    gstRateMaterial: 18,
    tdsRate: 2,
    createdAt: "2026-08-10T12:00:00.000Z",
    items: [{ id: 9031, billId: 903, date: "2026-08-05", category: "material", description: "20MM AGGREGATE", qty: 10, unit: "MT", rate: 1200, amount: 12000, source: "auto:material-9031" }],
  },
];

const initialBills = (() => {
  const injected = (window as Window & {
    __VB09_HISTORICAL_BILLS__?: FixtureBill[];
    __VB09_DEV_BILLS__?: FixtureBill[];
  }).__VB09_HISTORICAL_BILLS__;
  const devBills = (window as Window & { __VB09_DEV_BILLS__?: FixtureBill[] }).__VB09_DEV_BILLS__;
  if (Array.isArray(injected) && injected.length >= 2) return injected;
  return [
    ...(Array.isArray(devBills) ? devBills : []),
    ...representativeHistoricalBills,
    ...nonEquipmentBills,
  ];
})();

const itemByType: Record<string, FixtureBill[]> = {
  equipment: [{
    date: "2026-08-05",
    category: "equipment",
    description: "JCB · 8 HOURS (PLANT) — REAL HIRE ACTIVITY",
    qty: 8,
    unit: "HRS",
    rate: 3500,
    amount: 28000,
    source: "auto:jcb-activity-5001",
    sourceId: 5001,
    equipmentId: 7701,
    siteName: "NARASIMHULU ROAD",
  }],
  material: [{
    date: "2026-08-05",
    category: "material",
    description: "20MM AGGREGATE (SITE)",
    qty: 10,
    unit: "MT",
    rate: 1200,
    amount: 12000,
    source: "auto:material-5002",
    sourceId: 5002,
    siteName: "NARASIMHULU ROAD",
  }],
  transport: [{
    date: "2026-08-06",
    category: "transport",
    description: "TRUCK DISPATCH VIA NARASIMHULU ROAD (SITE)",
    qty: 3,
    unit: "TRIP",
    rate: 2400,
    amount: 7200,
    source: "auto:transport-5003",
    sourceId: 5003,
    leadDistance: 12,
    siteName: "NARASIMHULU ROAD",
  }],
  labour: [{
    date: "2026-08-07",
    category: "labour",
    description: "LABOUR OPERATOR MALE - PLANT",
    qty: 2,
    unit: "HEAD-DAY",
    rate: 900,
    amount: 1800,
    source: "auto:labour-5004",
    sourceId: 5004,
    siteName: "PLANT",
  }],
};

const fixtureState = {
  requests: [] as Array<{ method: string; path: string }>,
  createdPayloads: [] as any[],
  updatedPayloads: [] as any[],
  downloadClicks: [] as string[],
  downloadFiles: [] as Array<{ name: string; bytes: number; type: string; signature: string }>,
  printDocuments: [] as string[],
  selectedHistorical: [] as number[],
};

declare global {
  interface Window {
    __VB09Fixture?: typeof fixtureState;
    __VB09_HISTORICAL_BILLS__?: FixtureBill[];
    __VB09_DEV_BILLS__?: FixtureBill[];
  }
}

window.__VB09Fixture = fixtureState;

let bills = [...initialBills];
let nextBillId = 950;
const srcdocDescriptor = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, "srcdoc");
if (srcdocDescriptor?.set && srcdocDescriptor.get) {
  Object.defineProperty(HTMLIFrameElement.prototype, "srcdoc", {
    configurable: srcdocDescriptor.configurable,
    enumerable: srcdocDescriptor.enumerable,
    get: srcdocDescriptor.get,
    set(value: string) {
      fixtureState.printDocuments.push(value);
      srcdocDescriptor.set?.call(this, value);
    },
  });
}
const fixtureObjectUrls = new Map<string, Blob>();
const nativeCreateObjectURL = URL.createObjectURL.bind(URL);
const nativeRevokeObjectURL = URL.revokeObjectURL.bind(URL);
URL.createObjectURL = (blob: Blob | MediaSource) => {
  const url = nativeCreateObjectURL(blob);
  if (blob instanceof Blob) fixtureObjectUrls.set(url, blob);
  return url;
};
URL.revokeObjectURL = (url: string) => {
  fixtureObjectUrls.delete(url);
  return nativeRevokeObjectURL(url);
};

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

const originalFetch = window.fetch.bind(window);
window.fetch = async (input, init) => {
  const { url: requestUrl, method: inputMethod } = requestDetails(input);
  const method = (init?.method || inputMethod).toUpperCase();
  const pathname = requestUrl.pathname;
  fixtureState.requests.push({ method, path: `${pathname}${requestUrl.search}` });

  if (pathname === "/api/vendor-bills" && method === "GET") return json(bills);
  if (pathname === "/api/vendor-bills/summary" && method === "GET") {
    const totalAmount = bills.reduce((sum, bill) => sum + Number(bill.totalAmount || 0), 0);
    const count = (status: string) => bills.filter(bill => bill.status === status).length;
    const amount = (status: string) => bills.filter(bill => bill.status === status).reduce((sum, bill) => sum + Number(bill.totalAmount || 0), 0);
    return json({
      total: bills.length,
      totalAmount,
      draft: count("draft"),
      draftAmount: amount("draft"),
      verified: count("verified"),
      verifiedAmount: amount("verified"),
      approved: count("approved"),
      approvedAmount: amount("approved"),
      paid: count("paid"),
      paidAmount: amount("paid"),
      gstByCategory: { equipment: 0, material: 0, transport: 0, labour: 0, other: 0 },
      totalGst: 0,
    });
  }
  if (pathname === "/api/vendor-bills/vendor-names" && method === "GET") {
    return json(["NARASIMHULU", "MATERIAL VENDOR", "TRANSPORT VENDOR", "LABOUR VENDOR"]);
  }
  if (pathname === "/api/vendor-aliases" && method === "GET") return json([]);
  if (pathname === "/api/vendor-rate-cards" && method === "GET") return json([]);
  if (pathname === "/api/vendor-bills/check-duplicates") return json([]);

  const detailMatch = pathname.match(/^\/api\/vendor-bills\/(\d+)$/);
  if (detailMatch && method === "GET") {
    const bill = bills.find(candidate => candidate.id === Number(detailMatch[1]));
    return bill ? json(bill) : json({ message: "Not found" }, 404);
  }

  if (pathname === "/api/vendor-bills/discover-vendors" || pathname === "/api/vendor-bills/equipment-hire-discovery") {
    return json([{
      vendorName: "NARASIMHULU",
      recordCount: 1,
      categories: ["equipment"],
      equipmentCount: 1,
      // Intentionally no hireBillingBasis/rate/start-date fields.  VB-09
      // must discover JCB from activity, not Equipment Master hire terms.
      equipment: [{ id: 7701, name: "JCB", registrationNumber: "FIX-JCB-01" }],
    }]);
  }

  if (pathname === "/api/vendor-bills/auto-items") {
    const billType = requestUrl.searchParams.get("billType") || "equipment";
    return json(itemByType[billType] || []);
  }
  if (pathname === "/api/vendor-bills/hire-activities") return json([]);
  if (pathname === "/api/reports/equipment-performance") return json({ fleet: [] });
  if (pathname === "/api/vendor-bills/company-accounts") return json([]);

  if (pathname === "/api/vendor-bills" && method === "POST") {
    const payload = init?.body ? JSON.parse(String(init.body)) : {};
    fixtureState.createdPayloads.push(payload);
    const id = nextBillId++;
    const items = Array.isArray(payload.items) ? payload.items.map((item: any, index: number) => ({ ...item, id: id * 10 + index, billId: id })) : [];
    const created = {
      id,
      billDate: payload.billDate || "2026-09-13",
      billNo: payload.billNo || `VB09-FIXTURE-${id}`,
      billType: payload.billType || "equipment",
      vendorName: payload.vendorName || "NARASIMHULU",
      periodFrom: payload.periodFrom || "2026-08-01",
      periodTo: payload.periodTo || "2026-09-13",
      status: "draft",
      totalAmount: Number(payload.totalAmount || items.reduce((sum: number, item: any) => sum + Number(item.amount || 0), 0)),
      items,
      ...payload,
    };
    bills = [created, ...bills];
    return json(created, 201);
  }

  const updateMatch = pathname.match(/^\/api\/vendor-bills\/(\d+)$/);
  if (updateMatch && method === "PUT") {
    const payload = init?.body ? JSON.parse(String(init.body)) : {};
    fixtureState.updatedPayloads.push({ id: Number(updateMatch[1]), payload });
    return json({ ...(bills.find(candidate => candidate.id === Number(updateMatch[1])) || {}), ...payload });
  }

  // All mutations remain in-memory and are recorded for assertions.
  if (pathname.startsWith("/api/")) return json({});
  return originalFetch(input, init);
};

const originalAnchorClick = HTMLAnchorElement.prototype.click;
function captureDownload(this: HTMLAnchorElement) {
  if (this.download || this.href.includes("/api/vendor-bills/")) {
    fixtureState.downloadClicks.push(this.download || this.href);
    const blob = fixtureObjectUrls.get(this.href);
    if (blob) {
      void blob.arrayBuffer().then(buffer => {
        const bytes = new Uint8Array(buffer);
        const signature = Array.from(bytes.slice(0, 4)).map(value => value.toString(16).padStart(2, "0")).join("");
        fixtureState.downloadFiles.push({
          name: this.download || "unnamed-download",
          bytes: bytes.byteLength,
          type: blob.type,
          signature,
        });
      });
    }
  }
}
HTMLAnchorElement.prototype.click = function click() {
  captureDownload.call(this);
  return originalAnchorClick.call(this);
};
// jsPDF/FileSaver dispatches a MouseEvent instead of calling anchor.click().
const originalAnchorDispatch = HTMLAnchorElement.prototype.dispatchEvent;
HTMLAnchorElement.prototype.dispatchEvent = function dispatchEvent(event: Event) {
  if (event.type === "click") captureDownload.call(this);
  return originalAnchorDispatch.call(this, event);
};

const mount = async () => {
  // verify.mjs may create this temporary module from git HEAD so the
  // non-equipment creation geometry can be compared in the same browser
  // session.  It is never committed and is not a production import.
  const Component = new URLSearchParams(window.location.search).get("mode") === "baseline"
    ? (await import(/* @vite-ignore */ "./baseline-head.tsx")).default
    : VendorBills;
  queryClient.clear();
  createRoot(document.getElementById("root")!).render(
    <QueryClientProvider client={queryClient}>
      <Component />
    </QueryClientProvider>,
  );
};

void mount();