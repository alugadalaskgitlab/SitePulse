import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import SiteEntry from "../../../client/src/pages/SiteEntry";
import SiteEdit from "../../../client/src/pages/SiteEdit";
import SiteSuccess from "../../../client/src/pages/SiteSuccess";
import PlantEquipmentUsage from "../../../client/src/pages/PlantEquipmentUsage";
import GuidedDpr from "../../../client/src/pages/GuidedDpr";
import { DprEquipmentCompact } from "../../../client/src/components/DprEquipmentCompact";
import { queryClient } from "../../../client/src/lib/queryClient";
import "../../../client/src/index.css";

type RequestRecord = {
  method: string;
  path: string;
  body?: unknown;
};

const site = {
  id: 6060,
  name: "NARASIMHULU ROAD",
  location: "Kurnool District",
  isActive: 1,
};

const personnel = [
  { id: 6101, name: "SURESH KUMAR", role: "Engineer", phone: "9000000001", isActive: 1 },
  { id: 6102, name: "PRIYA MENON", role: "Manager", phone: "9000000002", isActive: 1 },
];

const equipment = [
  {
    id: 7701,
    name: "JCB 3DX",
    registrationNumber: "FIX-JCB-01",
    equipmentType: "Excavator",
    ownership: "owned",
    meterType: "hour_meter",
    consumptionNorm: 5,
    isActive: 1,
    fuelType: "Diesel",
    plantName: "Main Plant",
  },
  {
    id: 7702,
    name: "Water Tanker",
    registrationNumber: "FIX-WATER-01",
    equipmentType: "Water Tanker",
    ownership: "hired",
    meterType: "odometer",
    consumptionNorm: 3,
    isActive: 1,
    fuelType: "Diesel",
    plantName: "Main Plant",
  },
  {
    id: 7703,
    name: "DAILY HIRE ROLLER",
    registrationNumber: "FIX-HIRE-01",
    equipmentType: "Road Roller",
    ownership: "hired",
    vendorName: "FASI UDDIN",
    meterType: "hour_meter",
    consumptionNorm: 3,
    isActive: 1,
    fuelType: "Diesel",
    plantName: "Hired Fleet",
  },
  {
    id: 7704,
    name: "DAILY HIRE LOADER",
    registrationNumber: "FIX-HIRE-02",
    equipmentType: "Loader",
    ownership: "hired",
    vendorName: "FASI UDDIN",
    meterType: "hour_meter",
    consumptionNorm: 3,
    isActive: 1,
    fuelType: "Diesel",
    plantName: "Hired Fleet",
  },
];

const initialPlantUsage = {
  id: 8101,
  date: "2026-08-05",
  equipmentId: 7701,
  entryType: "time_meter",
  openingReading: 390,
  closingReading: 394,
  hoursOrKmRun: 4,
  startTime: "08:00",
  endTime: "12:00",
  openingDiesel: 30,
  dieselIssued: 12,
  expectedDiesel: 20,
  dieselSource: "plant_stock",
  dieselIncluded: false,
  dieselBalanceInTank: 22,
  dieselBalanceConfirmed: true,
  siteName: "HMP PLANT",
  remarks: "FIXTURE EDIT RECORD",
  status: "closed",
  createdAt: "2026-08-05T12:00:00.000Z",
};

const boqItems = [
  {
    id: 8801,
    itemCode: "2.1",
    itemName: "GSB LAYING",
    description: "Providing and laying granular sub-base",
    displayName: "GSB LAYING",
    unit: "SQM",
    dprConversionFactor: null,
    categoryName: "Road Work",
    sortOrder: 1,
    planningWorkType: "road",
    dprMeasurementMethod: "geometry",
  },
  {
    id: 8802,
    itemCode: "3.1",
    itemName: "DRAIN EXCAVATION",
    description: "Earthwork in excavation for drain",
    displayName: "DRAIN EXCAVATION",
    unit: "CUM",
    dprConversionFactor: null,
    categoryName: "Structure Work",
    sortOrder: 2,
    planningWorkType: "structure",
    dprMeasurementMethod: "geometry",
  },
  {
    id: 8803,
    itemCode: "4.2",
    itemName: "CLEARING AND GRUBBING ROAD",
    description: "Clearing and grubbing road",
    displayName: "CLEARING AND GRUBBING ROAD",
    // The DPR measurement profile is physical SQM, while the contract BOQ unit
    // is Ha. Keeping both fields in the mock is important: browser evidence
    // must prove that the displayed converted quantity uses canonical metadata.
    unit: "Ha",
    canonicalUnit: "Ha",
    dprConversionFactor: 0.0001,
    categoryName: "Road Work",
    sortOrder: 3,
    planningWorkType: "road",
    dprMeasurementMethod: "SQM_LW",
  },
];

const programmeBars = [
  {
    id: 9901,
    boqItemId: 8801,
    reachLabel: "Km 12.000–13.000",
    chainageFrom: 12,
    chainageTo: 13,
    startDate: "2026-01-01",
    endDate: "2026-12-31",
    plannedQty: 10000,
    planningMode: "road",
    structureId: null,
    structureLocType: null,
    boqSubItem: null,
    side: "LHS",
    plannedWidthM: 7,
    plannedThicknessMm: 200,
  },
  {
    id: 9902,
    boqItemId: 8803,
    reachLabel: "Clearing 0+000–1+600",
    chainageFrom: 0,
    chainageTo: 1.6,
    startDate: "2026-01-01",
    endDate: "2026-12-31",
    plannedQty: 10000,
    planningMode: "road",
    structureId: null,
    structureLocType: null,
    boqSubItem: null,
    side: "LHS",
    plannedWidthM: 1.5,
    plannedThicknessMm: null,
  },
];

const storedDpr = {
  id: 6101,
  date: "2026-08-05",
  site: site.name,
  engineer: personnel[0].name,
  role: "engineer",
  workType: "road",
  boqProjectId: 5501,
  dprStatus: "submitted",
  isSuperseded: false,
  lockStatus: "unlocked",
  progress: [{
    id: 7101,
    entryKey: "fixture-progress-1",
    activity: "GSB LAYING",
    side: "LHS",
    chainageFrom: "12+000",
    chainageTo: "12+100",
    length: 100,
    width: 7,
    thickness: 20,
    quantity: 700,
    uom: "SQM",
    noSiteWork: false,
    noSiteWorkDescription: "",
    personnelIds: [personnel[0].id],
    boqItemId: 8801,
    programmeBarId: 9901,
    earthworkArrangementId: null,
    quantitySource: "measured",
    quantitySourceNote: "",
    chainageOverrideReason: "",
    executedBy: "hlc",
    layerNo: null,
    isIncidental: false,
    incidentalDescription: "",
  }],
  equipment: [{
    id: 7201,
    machine: "JCB 3DX",
    vehicleNo: "FIX-JCB-01",
    operator: "RAJU",
    task: "DRESSING",
    entryType: "time_meter",
    startTime: "08:00",
    endTime: "12:00",
    openingReading: 100,
    closingReading: 108,
    hoursWorked: null,
    diesel: 20,
    dieselNorm: 5,
    expectedDiesel: null,
    equipmentId: 7701,
    // Keep the real dispatch link so SiteEdit exercises authenticated admin
    // corrections against a canonical lifecycle row.
    plantUsageId: 8101,
    dieselSource: "plant_stock",
    openingDiesel: 30,
    dieselBalanceInTank: 20,
    dieselBalanceConfirmed: true,
    fuelStation: "",
    billNumber: "",
    amountPaid: null,
    numberOfTrips: null,
    tripDistance: null,
    totalKm: null,
    waterQuantity: null,
    boqItemId: null,
    structureId: null,
    breakdowns: [],
  }],
  labour: [{
    id: 7301,
    category: "Skilled",
    gender: "Male",
    count: 2,
    task: "GSB LAYING",
    contractor: "FIXTURE GANG",
    boqItemId: 8801,
    structureId: null,
  }],
  materials: [{
    id: 7401,
    type: "Issued",
    material: "GSB",
    quantity: 10,
    uom: "MT",
    vehicleNumber: "FIX-TRUCK-01",
    supplier: "FIXTURE SUPPLIER",
    location: "KM 12",
    receiptNumber: "FIX-REC-01",
  }],
  sitePurchases: [{
    id: 7501,
    itemDescription: "DIESEL FOR CLEANING",
    vendor: "FIXTURE FUEL",
    billNo: "FIX-BILL-01",
    amount: 1500,
    quantity: 15,
    uom: "LITRES",
  }],
  remarks: "Fixture DPR — representative data only.",
  createdAt: "2026-08-05T16:00:00.000Z",
};

/*
 * Guided DPR records are deliberately fixture records.  They have complete
 * activity/header data so the browser verifier can exercise the real Guided
 * wizard's Save Draft and Submit buttons without inventing a production
 * customer report.  The equipment rows retain the exact fields that Guided
 * hydrates into DprEquipmentCompact's passthrough bag.
 */
const guidedContractorDpr = {
  id: 6201,
  date: "2026-08-05",
  site: site.name,
  engineer: "SURESH KUMAR - ENGINEER",
  role: "engineer",
  workType: "road",
  boqProjectId: 5501,
  dprStatus: "draft",
  isSuperseded: false,
  lockStatus: "unlocked",
  progress: [{
    id: 7201,
    entryKey: "guided-fixture-contractor-progress",
    activity: "CLEARING AND GRUBBING ROAD",
    side: "LHS",
    chainageFrom: "0+000",
    chainageTo: "1+600",
    length: 1600,
    width: 1.5,
    thickness: null,
    quantity: 2400,
    uom: "SQM",
    noSiteWork: false,
    noSiteWorkDescription: "",
    personnelIds: [personnel[0].id],
    boqItemId: 8803,
    programmeBarId: 9902,
    earthworkArrangementId: null,
    quantitySource: "calculated",
    quantitySourceNote: "",
    chainageOverrideReason: "",
    executedBy: "hlc",
    layerNo: null,
    isIncidental: false,
    incidentalDescription: "",
  }],
  equipment: [
    {
      id: 7211,
      machine: "DAILY HIRE ROLLER",
      vehicleNo: "FIX-HIRE-01",
      operator: "IMRAN",
      task: "COMPACTION",
      entryType: "daily",
      startTime: "08:00",
      endTime: "17:00",
      openingReading: null,
      closingReading: null,
      hoursWorked: null,
      diesel: 0,
      dieselNorm: 3,
      expectedDiesel: null,
      equipmentId: 7703,
      plantUsageId: null,
      dieselSource: "contractor",
      openingDiesel: null,
      dieselBalanceInTank: null,
      dieselBalanceConfirmed: false,
      fuelStation: "",
      billNumber: "",
      amountPaid: null,
      numberOfTrips: null,
      tripDistance: null,
      totalKm: null,
      waterQuantity: null,
      activitySegments: [],
      activityAllocations: [],
      breakdowns: [],
    },
    {
      id: 7212,
      machine: "DAILY HIRE LOADER",
      vehicleNo: "FIX-HIRE-02",
      operator: "KARIM",
      task: "LOADING",
      entryType: "daily",
      startTime: "08:00",
      endTime: "17:00",
      openingReading: null,
      closingReading: null,
      hoursWorked: null,
      diesel: 12,
      dieselNorm: 3,
      expectedDiesel: null,
      equipmentId: 7704,
      plantUsageId: null,
      dieselSource: "contractor",
      openingDiesel: null,
      dieselBalanceInTank: null,
      dieselBalanceConfirmed: false,
      fuelStation: "",
      billNumber: "",
      amountPaid: null,
      numberOfTrips: null,
      tripDistance: null,
      totalKm: null,
      waterQuantity: null,
      activitySegments: [],
      activityAllocations: [],
      breakdowns: [],
    },
  ],
  labour: [],
  materials: [],
  sitePurchases: [],
  remarks: "DIESEL-02 GUIDED CONTRACTOR FIXTURE — NOT A CUSTOMER DPR.",
};

const guidedPlantStockDpr = {
  ...guidedContractorDpr,
  id: 6202,
  remarks: "DIESEL-02 GUIDED PLANT-STOCK FIXTURE — NOT A CUSTOMER DPR.",
  equipment: [
    {
      ...guidedContractorDpr.equipment[0],
      id: 7221,
      machine: "DAILY HIRE ROLLER",
      vehicleNo: "FIX-HIRE-01",
      equipmentId: 7703,
      diesel: 12,
      dieselSource: "plant_stock",
    },
    {
      ...guidedContractorDpr.equipment[1],
      id: 7222,
      machine: "DAILY HIRE LOADER",
      vehicleNo: "FIX-HIRE-02",
      equipmentId: 7704,
      diesel: 0,
      dieselSource: "plant_stock",
    },
  ],
};

const siteEditContractorDpr = {
  ...guidedContractorDpr,
  id: 6203,
  dprStatus: "draft",
  remarks: "DIESEL-02 SITE EDIT CONTRACTOR FIXTURE — NOT A CUSTOMER DPR.",
};

const fixtureState = {
  requests: [] as RequestRecord[],
  dprCreatePayloads: [] as any[],
  dprCreateRecords: [] as any[],
  dprDraftPayloads: [] as any[],
  dprVersionPayloads: [] as any[],
  dprSubmitPayloads: [] as any[],
  // Short aliases make the fixture convenient to inspect from a browser
  // harness while retaining explicit names for each DPR lifecycle operation.
  createdPayloads: [] as any[],
  draftPayloads: [] as any[],
  versionPayloads: [] as any[],
  submittedPayloads: [] as any[],
  personnelPayloads: [] as any[],
  attachmentPayloads: [] as any[],
  uploadRequests: [] as any[],
  plantCreatePayloads: [] as any[],
  plantUpdatePayloads: [] as any[],
  plantCompletePayloads: [] as any[],
  plantDeleteIds: [] as number[],
  createdPlantPayloads: [] as any[],
  updatedPlantPayloads: [] as any[],
  plantUsageRecords: [] as any[],
  guidedSavedReportPayloads: [] as any[],
  toasts: [] as unknown[],
};

declare global {
  interface Window {
    __DprSiteFixture?: typeof fixtureState;
  }
}

window.__DprSiteFixture = fixtureState;

let nextDprId = 6103;
let nextPersonnelId = 6110;
let currentDpr: any = { ...storedDpr };
const guidedDprRecords: Record<number, any> = {
  [guidedContractorDpr.id]: guidedContractorDpr,
  [guidedPlantStockDpr.id]: guidedPlantStockDpr,
  [siteEditContractorDpr.id]: siteEditContractorDpr,
};
let nextPlantUsageId = 8102;
let plantUsageRecords: any[] = [{ ...initialPlantUsage }];
fixtureState.plantUsageRecords = plantUsageRecords;

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function requestDetails(input: RequestInfo | URL): { method: string; url: URL; body?: BodyInit | null } {
  const request = typeof input === "object" && "method" in input ? input as Request : null;
  const method = request?.method || "GET";
  const rawUrl = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  return { method: method.toUpperCase(), url: new URL(rawUrl, window.location.origin) };
}

function parseBody(init?: RequestInit): any {
  if (!init?.body || typeof init.body !== "string") return undefined;
  try {
    return JSON.parse(init.body);
  } catch {
    return undefined;
  }
}

function copyDprWithPayload(id: number, payload: any, status: string) {
  const source = guidedDprRecords[id] ?? (id === 6101 ? storedDpr : currentDpr);
  const updated = {
    ...source,
    ...payload,
    id,
    dprStatus: status,
    progress: payload.progress ?? source.progress,
    equipment: payload.equipment ?? source.equipment,
    labour: payload.labour ?? source.labour,
    materials: payload.materials ?? source.materials,
    sitePurchases: payload.sitePurchases ?? source.sitePurchases,
  };
  if (guidedDprRecords[id]) guidedDprRecords[id] = updated;
  else currentDpr = updated;
  fixtureState.guidedSavedReportPayloads.push({ id, status, payload: updated });
  return updated;
}

const originalFetch = window.fetch.bind(window);
window.fetch = async (input, init) => {
  const { url, method: inputMethod } = requestDetails(input);
  const method = (init?.method || inputMethod).toUpperCase();
  const body = parseBody(init);
  const pathname = url.pathname;
  fixtureState.requests.push({ method, path: `${pathname}${url.search}`, body });

  if (pathname === "/api/sites" && method === "GET") return json([site]);
  if (pathname === "/api/personnel" && method === "GET") return json(personnel);
  if (pathname === "/api/personnel" && method === "POST") {
    const created = { id: nextPersonnelId++, ...(body || {}), isActive: 1 };
    fixtureState.personnelPayloads.push(body || {});
    personnel.push(created);
    return json(created, 201);
  }
  if (pathname === "/api/plant-module/equipment" && method === "GET") return json(equipment);
  if (pathname === "/api/config" && method === "GET") {
    return json({
      rmcEnabled: true,
      companyName: "DPR Browser Fixture",
      companyShortName: "DPR",
      appTagline: "Isolated browser evidence",
      logoFile: "",
      licensedModules: [],
    });
  }
  if (pathname === "/api/plant-module/equipment-usage" && method === "GET") return json(plantUsageRecords);
  if (pathname === "/api/plant-module/equipment-usage/incoming" && method === "GET") return json([]);
  if (pathname === "/api/plant-module/equipment-usage" && method === "POST") {
    const created = {
      id: nextPlantUsageId++,
      ...(body || {}),
      status: body?.status || "closed",
      hoursOrKmRun: body?.openingReading != null && body?.closingReading != null
        ? Number(body.closingReading) - Number(body.openingReading)
        : null,
      expectedDiesel: body?.openingReading != null && body?.closingReading != null
        ? (Number(body.closingReading) - Number(body.openingReading)) * 5
        : null,
      createdAt: "2026-08-05T12:00:00.000Z",
    };
    fixtureState.plantCreatePayloads.push(body || {});
    fixtureState.createdPlantPayloads.push(body || {});
    plantUsageRecords = [created, ...plantUsageRecords];
    fixtureState.plantUsageRecords = plantUsageRecords;
    return json(created, 201);
  }
  const plantUpdateMatch = pathname.match(/^\/api\/plant-module\/equipment-usage\/(\d+)$/);
  if (plantUpdateMatch && method === "PUT") {
    const id = Number(plantUpdateMatch[1]);
    fixtureState.plantUpdatePayloads.push({ id, payload: body || {} });
    fixtureState.updatedPlantPayloads.push({ id, payload: body || {} });
    const updated = { ...(plantUsageRecords.find((entry) => entry.id === id) || { id }), ...(body || {}), id };
    plantUsageRecords = plantUsageRecords.map((entry) => entry.id === id ? updated : entry);
    fixtureState.plantUsageRecords = plantUsageRecords;
    return json(updated);
  }
  const plantDeleteMatch = pathname.match(/^\/api\/plant-module\/equipment-usage\/(\d+)$/);
  if (plantDeleteMatch && method === "DELETE") {
    const id = Number(plantDeleteMatch[1]);
    fixtureState.plantDeleteIds.push(id);
    plantUsageRecords = plantUsageRecords.filter((entry) => entry.id !== id);
    fixtureState.plantUsageRecords = plantUsageRecords;
    return json({ ok: true });
  }
  const plantCompleteMatch = pathname.match(/^\/api\/plant-module\/equipment-usage\/(\d+)\/complete-incoming$/);
  if (plantCompleteMatch && method === "POST") {
    const id = Number(plantCompleteMatch[1]);
    fixtureState.plantCompletePayloads.push({ id, payload: body || {} });
    const updated = { ...(plantUsageRecords.find((entry) => entry.id === id) || { id }), ...(body || {}), id, status: "closed" };
    plantUsageRecords = plantUsageRecords.map((entry) => entry.id === id ? updated : entry);
    fixtureState.plantUsageRecords = plantUsageRecords;
    return json(updated);
  }
  const previousBalanceMatch = pathname.match(/^\/api\/plant-module\/equipment-usage\/previous-balance\/(\d+)$/);
  if (previousBalanceMatch && method === "GET") return json({ previousBalance: 0 });
  if (pathname.startsWith("/api/maintenance/logs") && method === "GET") return json([]);
  if (pathname === "/api/maintenance/logs" && method === "POST") {
    return json({ id: 8400, ...(body || {}) }, 201);
  }
  if (pathname.startsWith("/api/maintenance/logs/") && method === "PATCH") return json({ id: 8400, ...(body || {}) });
  if (pathname.startsWith("/api/maintenance/logs/") && method === "POST") return json({ ok: true });
  if (pathname === "/api/site-material-trips" && method === "GET") return json([]);
  if (pathname === "/api/dprs/with-details" && method === "GET") return json([]);
  if (pathname === "/api/dprs/chainage-overlap-context" && method === "GET") return json({ entries: [] });
  if (pathname === "/api/attachments" && method === "GET") return json([]);
  if (pathname === "/api/attachments" && method === "POST") {
    fixtureState.attachmentPayloads.push(body || {});
    return json({ id: 8200 + fixtureState.attachmentPayloads.length, ...(body || {}) }, 201);
  }
  if (/^\/api\/equipment\/\d+\/latest-closing$/.test(pathname) && method === "GET") {
    return json({ closingReading: null, sourceDate: null, source: null });
  }
  if (/^\/api\/equipment\/\d+\/latest-confirmed-diesel-tank$/.test(pathname) && method === "GET") {
    return json({ dieselBalanceInTank: null, sourceDate: null, source: null });
  }
  if (pathname === "/api/plant-module/equipment-usage/open-today" && method === "GET") return json([]);
  if (pathname === "/api/boq/projects" && method === "GET") {
    return json([{ id: 5501, name: "NARASIMHULU ROAD BOQ", siteId: site.id, itemCount: boqItems.length }]);
  }

  const projectItemsMatch = pathname.match(/^\/api\/boq\/projects\/(\d+)\/items$/);
  if (projectItemsMatch && method === "GET") return json(boqItems);
  const projectEarthworkMatch = pathname.match(/^\/api\/boq\/projects\/(\d+)\/earthwork-arrangements$/);
  if (projectEarthworkMatch && method === "GET") return json([]);
  const projectProgrammeMatch = pathname.match(/^\/api\/boq\/projects\/(\d+)\/programme$/);
  if (projectProgrammeMatch && method === "GET") return json(programmeBars);
  if (pathname === "/api/dpr/programme-bars" && method === "GET") {
    const projectId = Number(url.searchParams.get("projectId"));
    const boqItemId = Number(url.searchParams.get("boqItemId"));
    return json(programmeBars
      .filter((bar) => Number(bar.boqItemId) === boqItemId)
      .map((bar) => ({
        ...bar,
        reportedQty: 0,
        remainingQty: bar.plannedQty,
        unit: boqItems.find((item) => item.id === bar.boqItemId)?.canonicalUnit
          ?? boqItems.find((item) => item.id === bar.boqItemId)?.unit
          ?? null,
        sequenceOrder: null,
        sideCoverage: null,
        arrangement: null,
        latestOutcome: null,
        outcomeHistory: [],
        projectId,
      })));
  }
  const projectBomMatch = pathname.match(/^\/api\/boq\/projects\/(\d+)\/bom$/);
  if (projectBomMatch && method === "GET") {
    return json({
      items: boqItems.map((item) => ({ ...item, materials: [], equipment: [], labour: [] })),
      bars: programmeBars,
    });
  }
  const projectPlanMatch = pathname.match(/^\/api\/boq\/projects\/(\d+)\/plan-vs-actual$/);
  if (projectPlanMatch && method === "GET") {
    return json(boqItems.map((item) => ({
      boqItemId: item.id,
      itemCode: item.itemCode,
      description: item.description,
      unit: item.unit,
      currentQty: item.id === 8801 ? 10000 : 500,
      totalPlanned: item.id === 8801 ? 10000 : 500,
      totalActual: 0,
      percentComplete: 0,
    })));
  }

  const dprGetMatch = pathname.match(/^\/api\/dprs\/(\d+)$/);
  if (dprGetMatch && method === "GET") {
    const requestedId = Number(dprGetMatch[1]);
    if (requestedId === 6101) return json({ ...storedDpr, id: 6101 });
    if (guidedDprRecords[requestedId]) return json(guidedDprRecords[requestedId]);
    return requestedId === currentDpr.id ? json(currentDpr) : json({}, 404);
  }
  if (pathname === "/api/dprs" && method === "GET") return json([currentDpr]);
  if (pathname === "/api/dprs" && method === "POST") {
    const id = nextDprId++;
    const status = String(body?.dprStatus || "").toLowerCase() === "draft" ? "draft" : "submitted";
    if (status === "draft") {
      fixtureState.dprDraftPayloads.push({ id, payload: body || {} });
      fixtureState.draftPayloads.push({ id, payload: body || {} });
    } else {
      // Keep the request payload as the browser saw it.  The production
      // contract historically expresses final-vs-draft through dprStatus
      // (omitting dprStatus:"draft" means final); isDraft is fixture evidence
      // metadata, not an injected request field.
      const submittedPayload = body || {};
      const submittedRecord = {
        id,
        payload: submittedPayload,
        isDraft: body?.isDraft === true ? true : false,
      };
      fixtureState.dprCreatePayloads.push(submittedPayload);
      fixtureState.createdPayloads.push(submittedPayload);
      fixtureState.dprCreateRecords.push(submittedRecord);
      try {
        sessionStorage.setItem(
          "__dprSiteFixtureLastSubmitted",
          JSON.stringify(submittedRecord),
        );
      } catch {
        // Session storage is only a cross-navigation convenience for the
        // fixture's read-only evidence route; the request itself is complete.
      }
    }
    return json(copyDprWithPayload(id, body || {}, status), 201);
  }

  const draftMatch = pathname.match(/^\/api\/dprs\/(\d+)\/draft$/);
  if (draftMatch && method === "PATCH") {
    fixtureState.dprDraftPayloads.push({ id: Number(draftMatch[1]), payload: body || {} });
    fixtureState.draftPayloads.push({ id: Number(draftMatch[1]), payload: body || {} });
    return json(copyDprWithPayload(Number(draftMatch[1]), body || {}, "draft"));
  }
  const versionMatch = pathname.match(/^\/api\/dprs\/(\d+)\/version$/);
  if (versionMatch && method === "POST") {
    const id = nextDprId++;
    fixtureState.dprVersionPayloads.push({ id: Number(versionMatch[1]), payload: body || {} });
    fixtureState.versionPayloads.push({ id: Number(versionMatch[1]), payload: body || {} });
    return json(copyDprWithPayload(id, body?.data || {}, "submitted"), 201);
  }
  const submitMatch = pathname.match(/^\/api\/dprs\/(\d+)\/submit$/);
  if (submitMatch && method === "POST") {
    fixtureState.dprSubmitPayloads.push({ id: Number(submitMatch[1]), payload: body || {} });
    fixtureState.submittedPayloads.push({ id: Number(submitMatch[1]), payload: body || {} });
    return json(copyDprWithPayload(Number(submitMatch[1]), body || {}, "submitted"));
  }

  if (pathname === "/api/uploads/request-url" && method === "POST") {
    fixtureState.uploadRequests.push(body || {});
    const uploadPath = `/api/fixture-upload/${fixtureState.uploadRequests.length}`;
    return json({
      uploadURL: `${window.location.origin}${uploadPath}`,
      objectPath: `/fixture-uploads/${fixtureState.uploadRequests.length}`,
      metadata: {
        name: body?.name || "fixture.bin",
        size: Number(body?.size || 0),
        contentType: body?.contentType || "application/octet-stream",
      },
    });
  }
  if (pathname.startsWith("/api/fixture-upload/") && method === "PUT") return json({});

  // Unused API routes are intentionally successful, so the isolated fixture
  // does not depend on an application server or a production database.
  if (pathname.startsWith("/api/")) return json([]);
  return originalFetch(input, init);
};

let appRoot: ReturnType<typeof createRoot> | null = null;

function FixtureSavedReport() {
  const source = new URLSearchParams(window.location.search).get("source") || "contractor";
  const snapshot = [...fixtureState.guidedSavedReportPayloads]
    .reverse()
    .find((entry) => source === "plant"
      ? (entry.payload?.equipment ?? []).some((row: any) => row.dieselSource === "plant_stock")
      : (entry.payload?.equipment ?? []).some((row: any) => row.dieselSource === "contractor"));
  const fallback = source === "plant" ? guidedPlantStockDpr : guidedContractorDpr;
  const report = snapshot?.payload ?? fallback;
  const rows = Array.isArray(report.equipment) ? report.equipment : [];
  return (
    <main className="mx-auto w-full max-w-4xl space-y-4 p-6 pb-12">
      <header className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-950">
        <h1 className="text-xl font-bold" data-testid="text-fixture-report-title">Fixture saved report — read-only</h1>
        <p className="mt-1 text-sm">
          Browser evidence only. This is not a customer DPR and does not write to a production database.
        </p>
        <p className="mt-1 text-xs font-semibold uppercase tracking-wide">
          Source: {source === "plant" ? "Plant Stock" : "Contractor"} · DPR fixture #{report.id}
        </p>
      </header>
      <section className="space-y-3" data-testid="fixture-readonly-equipment">
        {rows.map((row: any, index: number) => (
          <DprEquipmentCompact
            key={`${row.equipmentId ?? row.machine}-${index}`}
            row={row}
            equipment={equipment.find((master) => Number(master.id) === Number(row.equipmentId))}
            index={index}
            editable={false}
          />
        ))}
      </section>
    </main>
  );
}

function FixtureSubmittedReport() {
  let record: any = null;
  try {
    record = JSON.parse(sessionStorage.getItem("__dprSiteFixtureLastSubmitted") || "null");
  } catch {
    record = null;
  }
  const payload = record?.payload ?? {};
  const labour = Array.isArray(payload.labour) ? payload.labour : [];
  const progress = Array.isArray(payload.progress) ? payload.progress : [];
  const equipmentRows = Array.isArray(payload.equipment) ? payload.equipment : [];
  return (
    <main className="mx-auto w-full max-w-4xl space-y-4 p-6 pb-12">
      <header className="rounded-lg border border-emerald-300 bg-emerald-50 p-4 text-emerald-950">
        <h1 className="text-xl font-bold" data-testid="text-fixture-submitted-report-title">
          Fixture submitted report — read-only
        </h1>
        <p className="mt-1 text-sm">
          Browser evidence only. This is not a customer DPR and does not write to a production database.
        </p>
        <p className="mt-1 text-xs font-semibold uppercase tracking-wide">
          Final status: {record?.isDraft === false ? "submitted (isDraft:false)" : "submitted"}
          {" · "}DPR fixture #{record?.id ?? "unknown"}
        </p>
      </header>
      <section className="rounded-lg border p-4" data-testid="fixture-submitted-summary">
        <h2 className="font-semibold">Submitted sections</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Activities: {progress.length} · Equipment: {equipmentRows.length} · Labour rows: {labour.length}
        </p>
      </section>
      <section className="rounded-lg border p-4" data-testid="fixture-submitted-labour">
        <h2 className="font-semibold">Labour Log</h2>
        {labour.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground" data-testid="fixture-submitted-labour-empty">
            No labour recorded — empty Labour Log accepted for final submission.
          </p>
        ) : (
          <ul className="mt-2 space-y-1 text-sm">
            {labour.map((row: any, index: number) => (
              <li key={index} data-testid={`fixture-submitted-labour-row-${index}`}>
                {row.category || "Labour"} · count {row.count ?? "blank"}
                {row.task ? ` · ${row.task}` : ""}
                {row.contractor ? ` · ${row.contractor}` : ""}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

// wouter's setLocation uses history.pushState. The isolated fixture routes the
// real SiteEntry success navigation to SiteSuccess without changing production
// navigation code.
const originalPushState = window.history.pushState.bind(window.history);
window.history.pushState = ((state: any, title: string, url?: string | URL | null) => {
  originalPushState(state, title, url);
  window.dispatchEvent(new PopStateEvent("popstate"));
}) as typeof window.history.pushState;

const mount = () => {
  queryClient.clear();
  const isEdit = window.location.pathname.startsWith("/site/edit/");
  const isSiteSuccess = window.location.pathname.startsWith("/site/success/");
  const isSiteReport = window.location.pathname.startsWith("/site/report/");
  const isPlantEquipmentUsage = window.location.pathname.startsWith("/plant/equipment-usage");
  const isGuidedReport = window.location.pathname.startsWith("/guided/report");
  const isGuided = window.location.pathname.startsWith("/guided");
  appRoot?.unmount();
  appRoot = createRoot(document.getElementById("root")!);
  appRoot.render(
    <QueryClientProvider client={queryClient}>
      {isGuidedReport
        ? <FixtureSavedReport />
        : isSiteSuccess
          ? <SiteSuccess />
          : isSiteReport
            ? <FixtureSubmittedReport />
            : isGuided
              ? <GuidedDpr />
              : isPlantEquipmentUsage
                ? <PlantEquipmentUsage />
                : isEdit
                  ? <SiteEdit />
                  : <SiteEntry />}
    </QueryClientProvider>,
  );
};

window.addEventListener("popstate", mount);
mount();