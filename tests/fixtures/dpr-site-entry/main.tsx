import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import SiteEntry from "../../../client/src/pages/SiteEntry";
import DprSections, { DprEditEntry, DprWorkEntry } from "../../../client/src/pages/DprSections";
import { installDpr13Adapter } from "./dpr13-adapter";
import { installBoqLink01Adapter } from "./boq-link01-adapter";
import { DPR_SECTIONS, dprSectionStates, normalizeDprSectionContext, pickDprSectionPayload } from "../../../shared/dprSections";
import { evaluateSavedDraftReadiness } from "../../../shared/dprDraftReadiness";
import { buildEquipmentPerformanceReport } from "../../../shared/equipmentPerformance";
import SiteEdit from "../../../client/src/pages/SiteEdit";
import SiteSuccess from "../../../client/src/pages/SiteSuccess";
import SiteMaterialTrips from "../../../client/src/pages/SiteMaterialTrips";
import SiteMaterialsReceived from "../../../client/src/pages/SiteMaterialsReceived";
import PlantEquipmentUsage from "../../../client/src/pages/PlantEquipmentUsage";
import GuidedDpr from "../../../client/src/pages/GuidedDpr";
import { DprEquipmentCompact } from "../../../client/src/components/DprEquipmentCompact";
import DprDetails from "../../../client/src/pages/DprDetails";
import SiteReport from "../../../client/src/pages/SiteReport";
import SiteDashboard from "../../../client/src/pages/SiteDashboard";
import { DprActivityReadOnly } from "../../../client/src/components/DprActivityReadOnly";
import { ActivityReceiptStrip } from "../../../client/src/components/ActivityReceiptStrip";
import { queryClient } from "../../../client/src/lib/queryClient";
import { ATTACHMENT_VIEWER_HISTORY_KEY } from "../../../client/src/hooks/use-before-unload";
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

// The recording's site is kept separate from the older DPR fixture site so
// existing browser evidence remains stable while the null-project regression
// follows the reported navigation literally.
const nullRecoverySite = {
  id: 6061,
  name: "ALLADURG PWD ROAD TO PAMPAD",
  location: "Alladurg District",
  isActive: 1,
};

/*
 * Vehicle/supplier browser regression data is deliberately kept in this
 * fixture rather than in the application API.  The known association uses a
 * display spelling that exercises the normalized-key contract
 * (TS15-U1234 -> TS15U1234); the second vehicle is intentionally unlinked so
 * selecting it must not invent or clear a supplier.
 */
const vehicleSupplierSuggestions = {
  vehicles: ["TS15-U1234", "TS99-V000", "UNKNOWN-99"],
  suppliers: ["ACME", "OTHER SUPPLIER", "MANUAL SUPPLIER"],
  vehicleSuppliers: {
    TS15U1234: { status: "linked", supplier: "ACME", version: "v1" },
  },
  canCorrectVehicleSupplier: true,
};

const inlineReceiptArrangement = {
  id: 5701,
  boqProjectId: 5501,
  boqItemId: 8801,
  status: "approved",
  arrangementType: "vendor_material_delivered",
  agencyName: "ACME",
  materialLabel: "GSB",
  workDescription: "GSB material delivery",
  allocatedQty: 100,
  plannedDailyOutput: 25,
  uom: "MT",
  boqItemAllocations: [],
  programmeAllocations: [],
};

const receivedVehicleSupplierTrip = {
  id: 9701,
  date: "2026-08-05",
  time: "10:15",
  site: site.name,
  material: "GSB",
  quantity: 12.5,
  uom: "MT",
  vehicleNumber: "TS15-U1234",
  supplier: "ACME",
  receiptNumber: "FIXTURE-REC-9701",
  notes: "Synthetic Materials Received edit row; no production record.",
  workType: "road",
  source: "trip",
  boqProjectId: 5501,
  boqItemId: 8801,
  programmeBarId: null,
  earthworkArrangementId: 5701,
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
  {
    id: 8804,
    itemCode: "8.7",
    itemName: "NO-BAR SHOULDER WORK",
    description: "Shoulder preparation item deliberately has no programme bar",
    displayName: "NO-BAR SHOULDER WORK",
    unit: "SQM",
    canonicalUnit: "SQM",
    dprConversionFactor: null,
    categoryName: "Shoulder Works",
    categorySourceBillNo: "BILL 9",
    categorySortOrder: 4,
    sortOrder: 4,
    planningWorkType: "road",
    dprMeasurementMethod: "SQM_LW",
    includeInDpr: true,
  },
  {
    id: 8805,
    itemCode: "1.1",
    itemName: "CLEARING SQM CONTRACT",
    description: "Clearing and grubbing — contractual square metre item",
    displayName: "CLEARING SQM CONTRACT",
    unit: "SQM",
    canonicalUnit: "SQM",
    // Synthetic legacy configuration copied from the reported failure. The
    // actual SiteEntry/SiteEdit screens must ignore it because physical and
    // contractual units are the same.
    dprConversionFactor: 0.0001,
    categoryName: "Road Work",
    sortOrder: 5,
    planningWorkType: "road",
    dprMeasurementMethod: "SQM_LW",
    includeInDpr: true,
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
  {
    id: 9903,
    boqItemId: 8801,
    reachLabel: "Km 3.000–3.500",
    chainageFrom: 3,
    chainageTo: 3.5,
    startDate: "2026-01-01",
    endDate: "2026-12-31",
    plannedQty: 5000,
    planningMode: "road",
    structureId: null,
    structureLocType: null,
    boqSubItem: null,
    side: "LHS",
    plannedWidthM: 7,
    plannedThicknessMm: 200,
  },
];

/*
 * Multi-project sites are opt-in so the long-running DPR picker evidence
 * remains deterministic.  The second project is only returned when the
 * browser verifier asks for `dprNullMulti=1`; selecting it still loads real
 * fixture BOQ items through the normal project/items endpoint.
 */
const alternateBoqProject = {
  id: 5502,
  name: "NARASIMHULU ROAD SECOND BOQ",
  siteId: site.id,
  itemCount: 1,
};
const alternateBoqItems = [{
  ...boqItems[0],
  id: 8811,
  itemCode: "ALT-2.1",
  itemName: "ALTERNATE GSB LAYING",
  displayName: "ALTERNATE GSB LAYING",
}];
const nullRecoveryBoqProject = {
  id: 5510,
  name: "ALLADURG PWD ROAD TO PAMPAD BOQ",
  siteId: nullRecoverySite.id,
  itemCount: boqItems.length,
};
const alternateNullRecoveryBoqProject = {
  id: 5511,
  name: "ALLADURG PWD ROAD TO PAMPAD SECOND BOQ",
  siteId: nullRecoverySite.id,
  itemCount: alternateBoqItems.length,
};

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

// DPR19 B1: isolated, labelled GET response for the real dashboard. Derive
// ordinary states from the same saved-draft evaluator as the backend, never
// from handwritten "ready" flags. The unavailable case models failed server
// evaluation (not an empty mandatory list masquerading as ready).
const dpr19B1Records = (() => {
  const base = { ...storedDpr, dprStatus: "draft", progress: [{ ...storedDpr.progress[0] }],
    equipment: [{ ...storedDpr.equipment[0] }], labour: [{ ...storedDpr.labour[0] }],
    materials: [{ ...storedDpr.materials[0] }] };
  const rows: any[] = [
    { ...base, id: 6311, remarks: "Synthetic B1 roadway excavation material outcome", progress: [{
      ...storedDpr.progress[0], activity: "Synthetic roadway excavation", quantity: 75,
      boqItemId: 8899, uom: "CUM", materialOutcome: null,
    }] },
    { ...base, id: 6312, remarks: "Synthetic B1 pending closing meter", equipment: [{
      ...storedDpr.equipment[0], machine: "Synthetic meter roller", openingReading: 100,
      closingReading: null,
    }] },
    { ...base, id: 6313, remarks: "Synthetic B1 ready" },
    { ...base, id: 6314, remarks: "Synthetic B1 advisory only", equipment: [{
      machine: "Synthetic idle unrecorded machine", equipmentId: 7702,
      openingReading: null, closingReading: null, startTime: "", endTime: "",
    }] },
    { ...base, id: 6315, boqProjectId: 9999, remarks: "Synthetic B1 unresolved project evaluation unavailable" },
    { ...base, id: 6316, isCancelled: true, remarks: "Synthetic B1 cancelled" },
    { ...base, id: 6317, isDeleted: true, remarks: "Synthetic B1 deleted" },
    { ...base, id: 6318, dprStatus: "submitted", remarks: "Synthetic B1 submitted" },
  ];
  const itemsById = new Map([
    [8801, { id: 8801, boqProjectId: 5501, description: boqItems[0].description, unit: boqItems[0].unit }],
    [8899, { id: 8899, boqProjectId: 5501, description: "Roadway excavation in ordinary soil", unit: "CUM" }],
  ]);
  const projectsById = new Map([[5501, { id: 5501, siteName: site.name }]]);
  return rows.map(row => row.dprStatus === "draft" && !row.isCancelled && !row.isDeleted
    ? { ...row, draftReadiness: evaluateSavedDraftReadiness(row, itemsById, projectsById) }
    : row);
})();

// Task 1479 browser record: actual SiteEdit renders both authoritative cases
// from synthetic, read-only fixture data (no database writes).
const progressUnitsDpr = {
  ...storedDpr,
  id: 6217,
  dprStatus: "draft",
  remarks: "Task 1479 progress-unit fixture — synthetic records only.",
  progress: [
    {
      ...storedDpr.progress[0],
      id: 7317,
      entryKey: "units-sqm-same-unit",
      activity: "CLEARING SQM CONTRACT",
      boqItemId: 8805,
      programmeBarId: null,
      chainageFrom: "0+000",
      chainageTo: "1+600",
      length: 1600,
      width: 1.5,
      thickness: null,
      quantity: 2400,
      uom: "SQM",
      quantitySource: "calculated",
    },
    {
      ...storedDpr.progress[0],
      id: 7318,
      entryKey: "units-true-ha",
      activity: "CLEARING AND GRUBBING ROAD",
      boqItemId: 8803,
      programmeBarId: 9902,
      chainageFrom: "0+000",
      chainageTo: "1+600",
      length: 1600,
      width: 1.5,
      thickness: null,
      quantity: 2400,
      uom: "SQM",
      quantitySource: "calculated",
    },
  ],
  equipment: [],
  labour: [],
  materials: [],
  sitePurchases: [],
};

/*
 * The null-project recovery browser scenario intentionally has two separate
 * server-side draft rows. Both rows contain an explicit `boqProjectId:null`
 * (rather than omitting the field), and neither has a BOQ item reference.
 * That is the legacy shape which used to make the real screens report
 * "No BOQ project" forever even though the site has an eligible project.
 */
const nullProjectProgress = {
  id: 7320,
  entryKey: "null-project-recovery-progress",
  activity: "LEGACY SAVED NULL PROJECT",
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
  boqItemId: null,
  programmeBarId: null,
  earthworkArrangementId: null,
  quantitySource: "measured",
  quantitySourceNote: "",
  chainageOverrideReason: "",
  executedBy: "hlc",
  layerNo: null,
  isIncidental: false,
  incidentalDescription: "",
};

const guidedNullProjectDpr = {
  ...storedDpr,
  id: 6220,
  site: nullRecoverySite.name,
  boqProjectId: null,
  dprStatus: "draft",
  progress: [{ ...nullProjectProgress, id: 7320, entryKey: "guided-null-project-progress" }],
  equipment: [],
  labour: [],
  materials: [],
  sitePurchases: [],
  remarks: "Saved-null Guided DPR recovery fixture — synthetic and read-only.",
};

const siteEditNullProjectDpr = {
  ...guidedNullProjectDpr,
  id: 6221,
  progress: [{ ...nullProjectProgress, id: 7321, entryKey: "site-edit-null-project-progress" }],
  remarks: "Saved-null SiteEdit recovery fixture — synthetic and read-only.",
};

/*
 * DPR-09 automatic-recovery fixtures. These include the literal empty Guided
 * first-save route below, plus persisted-null/live-row shapes used to exercise
 * the narrow recovery condition directly in Guided and Detailed/Edit.
 */
const dpr09LiveBoqProgress = {
  ...nullProjectProgress,
  activity: "GSB LAYING",
  entryKey: "dpr09-live-boq-progress",
  boqItemId: 8801,
  programmeBarId: null,
  earthworkArrangementId: null,
  chainageFrom: "12+000",
  chainageTo: "12+100",
  width: 7,
  thickness: 20,
  quantity: 700,
  noSiteWork: false,
  noSiteWorkDescription: "",
  isIncidental: false,
  incidentalDescription: "",
};

const dpr09GuidedSavedNullLive = {
  ...guidedNullProjectDpr,
  id: 6230,
  progress: [{ ...dpr09LiveBoqProgress, id: 7330, entryKey: "dpr09-guided-live-boq-progress" }],
  remarks: "DPR-09 Guided saved-null/live-BOQ fixture — synthetic and read-only.",
};

const dpr09SiteEditSavedNullLive = {
  ...siteEditNullProjectDpr,
  id: 6231,
  progress: [{ ...dpr09LiveBoqProgress, id: 7331, entryKey: "dpr09-site-edit-live-boq-progress" }],
  remarks: "DPR-09 SiteEdit saved-null/live-BOQ fixture — synthetic and read-only.",
};

const dpr09GuidedNoSiteWork = {
  ...guidedNullProjectDpr,
  id: 6232,
  progress: [{
    ...nullProjectProgress,
    id: 7332,
    entryKey: "dpr09-guided-no-site-work",
    activity: "RAIN STOPPAGE",
    boqItemId: null,
    programmeBarId: null,
    noSiteWork: true,
    noSiteWorkDescription: "RAIN STOPPAGE — NO BILLABLE SITE WORK",
    isIncidental: false,
    incidentalDescription: "",
  }],
  remarks: "DPR-09 no-site-work null-protection fixture — synthetic and read-only.",
};

const dpr09SiteEditIncidental = {
  ...siteEditNullProjectDpr,
  id: 6233,
  progress: [{
    ...nullProjectProgress,
    id: 7333,
    entryKey: "dpr09-site-edit-incidental",
    activity: "TEMPORARY ACCESS WORK",
    boqItemId: null,
    programmeBarId: null,
    noSiteWork: false,
    noSiteWorkDescription: "",
    isIncidental: true,
    incidentalDescription: "TEMPORARY ACCESS WORK — NO BOQ CREDIT",
  }],
  remarks: "DPR-09 incidental null-protection fixture — synthetic and read-only.",
};

const dpr09PositiveProjectPin = {
  ...storedDpr,
  id: 6234,
  site: site.name,
  boqProjectId: 5501,
  progress: [{
    ...storedDpr.progress[0],
    id: 7334,
    entryKey: "dpr09-positive-project-pin",
    activity: "GSB LAYING",
    boqItemId: 8801,
    programmeBarId: 9901,
  }],
  remarks: "DPR-09 positive project pin fixture — synthetic and read-only.",
};

/*
 * DPR-10 edit-screen fixtures. These are deliberately separate records so the
 * bottom draft-save, submitted-admin version, and delayed-prior overlap checks
 * can each start from an untouched server shape in one browser run.
 */
const dpr10BottomDraft = {
  ...storedDpr,
  id: 6250,
  date: "2026-08-05",
  site: site.name,
  engineer: personnel[0].name,
  role: "engineer",
  boqProjectId: 5501,
  dprStatus: "draft",
  progress: [{
    ...storedDpr.progress[0],
    id: 7350,
    entryKey: "dpr10-bottom-save-progress",
    chainageFrom: "12+000",
    chainageTo: "12+100",
    programmeBarId: 9901,
    quantity: 700,
  }],
  equipment: [],
  labour: [],
  materials: [],
  sitePurchases: [],
  remarks: "DPR-10 bottom draft-save fixture — synthetic only.",
};

const dpr10OverlapDraft = {
  ...storedDpr,
  id: 6253,
  date: "2026-08-05",
  site: site.name,
  engineer: personnel[0].name,
  role: "engineer",
  boqProjectId: 5501,
  dprStatus: "draft",
  progress: [{
    ...storedDpr.progress[0],
    id: 7353,
    entryKey: "dpr10-delayed-overlap-programme-row",
    activity: "GSB LAYING",
    side: "LHS",
    chainageFrom: "3+100",
    chainageTo: "3+250",
    length: 150,
    width: 7,
    thickness: 0.2,
    quantity: 210,
    uom: "SQM",
    programmeBarId: 9903,
    quantitySource: "measured",
    quantitySourceNote: "",
    chainageOverrideReason: "",
  }],
  equipment: [],
  labour: [],
  materials: [],
  sitePurchases: [],
  remarks: "DPR-10 delayed-prior overlap fixture — synthetic only.",
};

const dpr10SubmittedAdmin = {
  ...storedDpr,
  id: 6251,
  date: "2026-08-05",
  site: site.name,
  engineer: personnel[0].name,
  role: "engineer",
  boqProjectId: 5501,
  dprStatus: "submitted",
  progress: [{
    ...storedDpr.progress[0],
    id: 7351,
    entryKey: "dpr10-submitted-admin-version",
    programmeBarId: 9901,
    quantity: 700,
  }],
  equipment: [],
  labour: [],
  materials: [],
  sitePurchases: [],
  remarks: "DPR-10 submitted-admin version fixture — synthetic only.",
};

const dpr10OverlapPriors = [{
  entryId: 7354,
  dprId: 6249,
  dprDate: "2026-08-04",
  boqItemId: 8801,
  side: "LHS",
  fromKm: 3.15,
  toKm: 3.25,
  quantity: 140,
  uom: "SQM",
}];

const dpr10DayTrips = [
  {
    id: 10401,
    date: "2026-08-05",
    site: site.name,
    material: "SOIL",
    quantity: 600,
    uom: "CFT",
    vehicleNumber: "DPR10-TRUCK-01",
    supplier: "FIXTURE EARTHWORKS",
    location: "Km 3.200",
    receiptNumber: "DPR10-REC-01",
    boqItemId: null,
    earthworkArrangementId: null,
    isCancelled: false,
    isDeleted: false,
  },
  {
    id: 10402,
    date: "2026-08-05",
    site: site.name,
    material: "SOIL",
    quantity: 600,
    uom: "CFT",
    vehicleNumber: "DPR10-TRUCK-02",
    supplier: "FIXTURE EARTHWORKS",
    location: "Km 3.200",
    receiptNumber: "DPR10-REC-02",
    boqItemId: 8801,
    earthworkArrangementId: null,
    isCancelled: false,
    isDeleted: false,
  },
];

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

/*
 * DPR-07 linked-source matrix.  These records intentionally use one
 * synthetic Plant usage id so SiteEdit renders the same linked lifecycle
 * state for each diesel source.  The browser verifier changes only the
 * authenticated fixture role (`?role=manager` vs the default admin); no
 * route parameter is consulted by production code for editability.
 */
const dpr07LinkedContractor = {
  ...siteEditContractorDpr,
  id: 6210,
  dprStatus: "submitted",
  remarks: "DPR-07 A — linked Contractor scope; synthetic fixture only.",
  equipment: [{
    ...siteEditContractorDpr.equipment[0],
    id: 7231,
    plantUsageId: 8101,
    dieselSource: "contractor",
    diesel: 14,
    openingReading: 100,
    closingReading: 108,
    startTime: "08:00",
    endTime: "17:00",
    openingDiesel: null,
    dieselBalanceInTank: null,
    dieselBalanceConfirmed: false,
  }],
};

const dpr07LinkedDirectPurchase = {
  ...dpr07LinkedContractor,
  id: 6211,
  remarks: "DPR-07 B — linked Direct-Purchase scope; synthetic fixture only.",
  equipment: [{
    ...dpr07LinkedContractor.equipment[0],
    id: 7232,
    dieselSource: "direct_purchase",
    diesel: 9,
    fuelStation: "HP CENTRAL",
    billNumber: "FIX-DPR07-09",
    amountPaid: 1200,
  }],
};

const dpr07LinkedPlantManager = {
  ...dpr07LinkedContractor,
  id: 6212,
  remarks: "DPR-07 C — linked Plant-Stock scope; synthetic fixture only.",
  equipment: [{
    ...dpr07LinkedContractor.equipment[0],
    id: 7233,
    dieselSource: "plant_stock",
    diesel: 14,
    openingDiesel: 30,
    dieselBalanceInTank: 22,
    dieselBalanceConfirmed: true,
  }],
};

const dpr07LinkedPlantAdmin = {
  ...dpr07LinkedPlantManager,
  id: 6213,
  remarks: "DPR-07 D — authenticated admin linked Plant-Stock scope; synthetic fixture only.",
};

const dpr07LegacyInvalid = {
  ...storedDpr,
  id: 6214,
  dprStatus: "submitted",
  remarks: "DPR-07 F/G — legacy invalid untouched activity; synthetic fixture only.",
  progress: [{
    ...storedDpr.progress[0],
    id: 7314,
    entryKey: "dpr07-legacy-invalid-activity",
    activity: "LEGACY INVALID ACTIVITY",
    quantity: 10,
    length: 100,
    width: 1,
    thickness: null,
    uom: "SQM",
    // Deliberately invalid under today's rules.  The fixture version handler
    // compares this original row before deciding whether to re-check it.
    quantitySource: "legacy_invalid_source",
    quantitySourceNote: null,
    programmeBarId: null,
    // Quantity-source is the deliberately untouched legacy failure for F/G.
    // Keep materialOutcome null here so SiteEdit's local cut/fill guard does
    // not mask the version-endpoint changed-row behavior we are evidencing.
    materialOutcome: null,
    reusableQty: null,
  }],
  labour: [{
    id: 7315,
    category: "Skilled",
    gender: "Male",
    count: 2,
    task: "LEGACY LABOUR",
    contractor: "DPR07 GANG",
    boqItemId: null,
    structureId: null,
  }],
  equipment: [],
  materials: [],
  sitePurchases: [],
};

const dpr07FreshInvalid = {
  ...dpr07LegacyInvalid,
  id: 6215,
  dprStatus: "draft",
  remarks: "DPR-07 H — fresh-create invalid validation fixture.",
};

// BOQ picker browser regression fixture. This item is deliberately eligible
// for DPR selection but has no programme bar. Edit loads it already selected,
// while Guided and Detailed choose it from a fresh activity row.
const dprBoqNoBarEdit = {
  ...storedDpr,
  id: 6216,
  dprStatus: "draft",
  remarks: "DPR BOQ picker browser regression — no-bar item; synthetic fixture only.",
  progress: [{
    ...storedDpr.progress[0],
    id: 7316,
    entryKey: "dpr-boq-picker-no-bar-edit",
    activity: "NO-BAR SHOULDER WORK",
    boqItemId: 8804,
    programmeBarId: null,
    chainageFrom: "2+000",
    chainageTo: "2+100",
    width: 3,
    quantity: 300,
    uom: "SQM",
    quantitySource: "measured",
  }],
  equipment: [],
  labour: [],
  materials: [],
  sitePurchases: [],
};

// DPR16 B2: in-memory classic create/edit verification; never an operational DPR.
const dpr16B2ClassicEdit = {
  ...storedDpr,
  id: 6258,
  dprStatus: "draft",
  remarks: "SYNTHETIC DPR16 B2 classic edit only.",
  progress: [{
    ...storedDpr.progress[0],
    id: 7358,
    entryKey: "b2-classic-excavation",
    activity: "ROADWAY EXCAVATION",
    boqItemId: 8816,
    programmeBarId: null,
    chainageFrom: "0+000",
    chainageTo: "0+100",
    length: 100,
    width: 1,
    thickness: 1,
    quantity: 100,
    uom: "CUM",
    materialOutcome: null,
    reusableQty: null,
    personnelIds: [],
  }],
  equipment: [{
    ...storedDpr.equipment[0],
    id: 7258,
    plantUsageId: null,
    equipmentId: null,
    machine: "SYNTHETIC B2 EXCAVATOR",
    openingReading: 100,
    closingReading: 106,
    startTime: "08:00",
    endTime: "16:00",
    diesel: 20,
    dieselBalanceInTank: 25,
    dieselBalanceConfirmed: false,
  }],
  labour: [],
  materials: [],
  sitePurchases: [],
};

// DPR18 B2 browser-only records: all writes remain intercepted in sessionStorage.
// Keep the status absent on the legacy row and explicitly null on a linked row
// to catch accidental migration-by-render or migration-by-save.
const dpr18B2Base = {
  ...dpr16B2ClassicEdit,
  progress: [{
    id: 7381, entryKey: "synthetic-dpr18-no-site-work", activity: "NO SITE WORK",
    noSiteWork: true, noSiteWorkDescription: "SYNTHETIC OTHER WORK", quantity: null, uom: "SQM",
  }],
  equipment: [{
    ...dpr16B2ClassicEdit.equipment[0],
    machine: "SYNTHETIC DPR18 EXCAVATOR",
    dieselBalanceConfirmed: true,
    dieselBalanceInTank: 25,
    breakdowns: [],
  }],
};
const dpr18B2Edit = {
  ...dpr18B2Base, id: 6278,
  equipment: [],
};
const dpr18B2Guided = {
  ...dpr18B2Base, id: 6281,
  equipment: [],
};
const dpr18B2Legacy = {
  ...dpr18B2Base, id: 6279,
  equipment: [{ ...dpr18B2Base.equipment[0], id: 7279, usageStatus: null, usageStatusReason: null }],
};
const dpr18B2Linked = {
  ...dpr18B2Base, id: 6280,
  equipment: [{ ...dpr18B2Base.equipment[0], id: 7280, plantUsageId: 8101, usageStatus: null, usageStatusReason: null }],
};

// DPR19 Fix2 browser-only edit record: two independently identifiable,
// populated equipment rows. The intercepted fixture never contacts a DB.
const dpr19Fix2Edit = {
  ...dpr18B2Base, id: 6340,
  equipment: [
    { ...dpr18B2Base.equipment[0], id: 7440, machine: "SYNTHETIC DELETE EXCAVATOR",
      vehicleNo: "FIX2-DEL", operator: "SYNTHETIC DELETE OPERATOR", diesel: 11 },
    { ...dpr18B2Base.equipment[0], id: 7441, machine: "SYNTHETIC KEEP EXCAVATOR",
      vehicleNo: "FIX2-KEEP", operator: "SYNTHETIC KEEP OPERATOR", diesel: 23 },
  ],
};

// LABOUR-01: isolated synthetic draft. The first crew has persisted names;
// the historical count-only row exercises the pre-feature read contract.
const labour01Draft = {
  ...dpr18B2Base, id: 6351, dprStatus: "draft",
  remarks: "LABOUR-01 synthetic fixture only; no customer record.",
  labour: [
    { ...storedDpr.labour[0], id: 7351, count: 2,
      contractor: "SYNTHETIC CONTRACTOR CREW", workerNames: ["Raju Fixture", "Sita Fixture"] },
    { ...storedDpr.labour[0], id: 7352, count: 1,
      contractor: "SYNTHETIC LOCAL LABOUR", workerNames: [] },
  ],
};

// DPR18 B3: isolated GET-only DPR detail responses. These are not added to
// the editable/saved fixture record store or any customer-backed endpoint.
const dpr18B3Reports: Record<number, any> = Object.fromEntries(
  (["draft", "submitted"] as const).map((status, index) => {
    const id = 6291 + index;
    const baseRow = {
      ...storedDpr.equipment[0], id: 7291 + index, plantUsageId: null,
      machine: "SYNTHETIC DPR18 B3 EXCAVATOR", vehicleNo: "FIX-B3-01",
      entryType: "hourly", task: "Incidental diversion, not BOQ",
      usageStatus: "working", activitySegments: [{
        startTime: "08:00", endTime: "12:00",
        boqItems: [{ boqItemId: 8801, programmeBarId: 9901 }],
      }],
    };
    return [id, {
      ...storedDpr, id, dprStatus: status,
      equipment: [
        { ...baseRow, breakdowns: [] },
        {
          ...baseRow, id: 7391 + index, equipmentId: 7702, machine: "SYNTHETIC B3 TANKER",
          vehicleNo: "FIX-B3-02", entryType: "daily", usageStatus: "breakdown",
          dieselSource: "contractor", task: "", breakdowns: [{
            clientKey: "synthetic-stoppage", fromTime: "10:00", toTime: "11:30",
            description: "Synthetic hydraulic hose", responsibility: "vendor",
            repairScope: "vendor", debitableToVendor: true, remarks: "Synthetic repair",
          }],
        },
        {
          id: 7491 + index, machine: "SYNTHETIC B3 STATUS ONLY", vehicleNo: "",
          entryType: "time_meter", usageStatus: "breakdown", breakdowns: [],
        },
      ],
    }];
  }),
);

// DPR20 B1: isolated read-only parity data. Deliberately not registered in
// editable fixture stores. Every API request under dpr20b1 is intercepted.
const dpr20B1Attachment = {
  id: 20991, fileName: "synthetic-dpr20-hose.svg", mimeType: "image/svg+xml",
  objectPath: "/objects/dpr20b1-hose.svg", fileSize: 180,
  moduleType: "maintenance", linkedRecordId: 20881,
};
const dpr20B1Maintenance = [{
  id: 20882, sourceRecordId: 20722, sourceType: "dpr_log", status: "completed",
  fromTime: "14:00", toTime: "14:45", downtimeMinutes: 45,
  description: "Synthetic linked-maintenance fallback", responsibility: "hlc",
  repairScope: "hlc", debitableToVendor: false, remarks: "Synthetic fallback remarks",
}];
const dpr20B1Report = {
  ...storedDpr, id: 20601, remarks: "DPR20 B1 — synthetic isolated parity evidence",
  equipment: [
    {
      ...storedDpr.equipment[0], id: 20720, plantUsageId: 20801, equipmentId: 7703,
      machine: "SYNTHETIC DPR20 HIRE ROLLER", vehicleNo: "SYN-D20-01",
      entryType: "hourly", usageStatus: "working", usageStatusReason: "Synthetic shift note",
      startTime: "08:00", endTime: "12:00", openingReading: 100, closingReading: 108,
      hoursWorked: 8, diesel: 20, openingDiesel: 30, dieselBalanceInTank: 20,
      dieselBalanceConfirmed: true, expectedDiesel: 40,
      task: "Synthetic incidental diversion", isIncidental: true,
      activitySegments: [{
        startTime: "08:00", endTime: "10:00",
        boqItems: [{ boqItemId: 8801, programmeBarId: 9901 }],
      }],
      breakdowns: [{
        id: 20881, clientKey: "dpr20-draft-stop", fromTime: "10:00", toTime: "11:30",
        description: "Synthetic authoritative hydraulic hose", responsibility: "vendor",
        repairScope: "vendor", debitableToVendor: true,
        remarks: "Synthetic repair paid by vendor. "
          + "Synthetic long audit note preserves responsibility, work assignment, fuel evidence and repair history across printed page boundaries. ".repeat(6)
          + "SYNTHETIC_DPR20_LONG_REFERENCE_ABCDEFGHIJKLMNOPQRSTUVWXYZ_0123456789_ABCDEFGHIJKLMNOPQRSTUVWXYZ "
          + "DPR20_LONG_NOTE_END",
        attachment: dpr20B1Attachment,
      }],
    },
    {
      ...storedDpr.equipment[0], id: 20721, plantUsageId: 20802, equipmentId: 7702,
      machine: "SYNTHETIC DPR20 MISSING VENDOR", vehicleNo: "SYN-D20-02",
      entryType: "daily", usageStatus: "idle_no_operator",
      usageStatusReason: "Synthetic operator unavailable",
      openingReading: 200, closingReading: 240, startTime: "13:00", endTime: "17:00",
      diesel: 0, openingDiesel: 20, dieselBalanceInTank: 15, dieselBalanceConfirmed: false,
      expectedDiesel: 12, totalKm: 40, hoursWorked: null, task: "",
      breakdowns: [],
    },
    // Omitted breakdowns exercises the existing linked-maintenance fallback.
    {
      id: 20722, plantUsageId: 20803, equipmentId: 7701,
      machine: "SYNTHETIC DPR20 LINKED FALLBACK", vehicleNo: "SYN-D20-03",
      entryType: "time_meter", usageStatus: "breakdown",
      startTime: "14:00", endTime: "17:00", openingReading: 310, closingReading: 312,
      diesel: 4, dieselNorm: 5, dieselSource: "direct_purchase",
      fuelStation: "Synthetic station", billNumber: "SYN-D20-BILL", amountPaid: 400,
    },
    {
      id: 20723, plantUsageId: null,
      machine: "SYNTHETIC DPR20 FREE TEXT", entryType: "trip_based", usageStatus: "working",
      task: "Synthetic independent hauling", numberOfTrips: 3, tripDistance: 5, totalKm: 15,
      startTime: "09:00", endTime: "11:00", diesel: 6, dieselSource: "contractor",
      breakdowns: [],
    },
  ],
};

// DPR20 B2 uses the real pure report builder, not hand-authored rate DTOs.
// Saved DPR snapshot fuel deliberately differs from its canonical usage fuel.
const dpr20B2Masters = [
  { id: 21701, name: "SYNTHETIC B2 HOURS", meterType: "hour_meter", consumptionNorm: 5, ownership: "owned", isActive: 1 },
  { id: 21702, name: "SYNTHETIC B2 ODOMETER", meterType: "odometer", consumptionNorm: 0.3, ownership: "owned", isActive: 1 },
  { id: 21703, name: "SYNTHETIC B2 ZERO", meterType: "hour_meter", consumptionNorm: 5, ownership: "owned", isActive: 1 },
  { id: 21704, name: "SYNTHETIC B2 PENDING", meterType: "hour_meter", consumptionNorm: 5, ownership: "owned", isActive: 1 },
  { id: 21705, name: "SYNTHETIC B2 NO RUNTIME", meterType: "hour_meter", consumptionNorm: 5, ownership: "owned", isActive: 1 },
  { id: 21706, name: "SYNTHETIC B2 EXCLUDED", meterType: "hour_meter", consumptionNorm: 5, ownership: "owned", isActive: 1 },
  { id: 21707, name: "SYNTHETIC B2 SINGLE CANONICAL", meterType: "hour_meter", consumptionNorm: 5, ownership: "owned", isActive: 1 },
  { id: 21708, name: "SYNTHETIC B2 LEGACY EXACT LOG", meterType: "hour_meter", consumptionNorm: 5, ownership: "owned", isActive: 1 },
  { id: 21709, name: "SYNTHETIC B2 ESTIMATED ODOMETER", meterType: "odometer", consumptionNorm: 0.3, ownership: "owned", isActive: 1 },
  { id: 21710, name: "SYNTHETIC B2 REAL CLOCK HOURS", meterType: "hour_meter", consumptionNorm: 5, ownership: "owned", isActive: 1 },
];
const dpr20B2Rows: any[] = [
  { ...dpr20B1Report.equipment[0], id: 22701, plantUsageId: 22801, equipmentId: 21701,
    machine: dpr20B2Masters[0].name, vehicleNo: "SYN-B2-HOURS", dieselNorm: 5,
    // Snapshot rate is 1.25 L/hr; canonical below is 3.75 L/hr.
    openingDiesel: 10, dieselBalanceInTank: 20 },
  { ...dpr20B1Report.equipment[1], id: 22702, plantUsageId: 22802, equipmentId: 21702,
    machine: dpr20B2Masters[1].name, dieselNorm: 0.3, dieselBalanceConfirmed: true },
  { ...dpr20B1Report.equipment[2], id: 22703, plantUsageId: 22803, equipmentId: 21703,
    machine: dpr20B2Masters[2].name, startTime: "08:00", endTime: "10:00",
    openingReading: 100, closingReading: 102, hoursWorked: 2,
    dieselSource: "plant_stock", diesel: 0, openingDiesel: 10, dieselBalanceInTank: 10,
    dieselBalanceConfirmed: true, expectedDiesel: 10, breakdowns: [] },
  { ...dpr20B1Report.equipment[2], id: 22704, plantUsageId: 22804, equipmentId: 21704,
    machine: dpr20B2Masters[3].name, hoursWorked: 2, dieselSource: "plant_stock",
    openingDiesel: 20, dieselBalanceInTank: 15, dieselBalanceConfirmed: false, breakdowns: [] },
  { id: 22705, plantUsageId: 22805, equipmentId: 21705, machine: dpr20B2Masters[4].name,
    entryType: "time_meter", usageStatus: "working", dieselNorm: 5, dieselSource: "plant_stock",
    diesel: 10, openingDiesel: 20, dieselBalanceInTank: 15, dieselBalanceConfirmed: true,
    breakdowns: [] },
  { ...dpr20B1Report.equipment[2], id: 22706, plantUsageId: 22806, equipmentId: 21706,
    machine: dpr20B2Masters[5].name, dieselSource: "plant_stock", dieselNorm: 5,
    openingDiesel: 20, dieselBalanceInTank: 15, dieselBalanceConfirmed: true, breakdowns: [] },
  { ...dpr20B1Report.equipment[0], id: 22707, plantUsageId: 22807, equipmentId: 21701,
    machine: "SYNTHETIC B2 HOURS SECOND SHIFT", startTime: "13:00", endTime: "15:00",
    openingReading: 108, closingReading: 110, hoursWorked: 2, diesel: 5, dieselNorm: 5,
    openingDiesel: 20, dieselBalanceInTank: 22, expectedDiesel: 10, task: "", activitySegments: [],
    breakdowns: [] },
  { id: 22708, plantUsageId: null, equipmentId: 21708, machine: "SYNTHETIC B2 LEGACY EXACT LOG",
    entryType: "time_meter", startTime: "12:00", endTime: "13:00", openingReading: 102,
    closingReading: 103, hoursWorked: 1, diesel: 4, dieselNorm: 5, dieselSource: "plant_stock",
    openingDiesel: 10, dieselBalanceInTank: 5, dieselBalanceConfirmed: true, breakdowns: [] },
  { ...dpr20B1Report.equipment[0], id: 22709, plantUsageId: 22809, equipmentId: 21707,
    machine: dpr20B2Masters[6].name, vehicleNo: "SYN-B2-SINGLE", dieselNorm: 5,
    // Saved snapshot would produce 1.25 L/hr; canonical usage produces 3.75.
    openingDiesel: 10, dieselBalanceInTank: 20, task: "", activitySegments: [], breakdowns: [] },
  { id: 22710, plantUsageId: 22810, equipmentId: 21709, machine: dpr20B2Masters[8].name,
    entryType: "time_meter", usageStatus: "working", startTime: "08:00", endTime: "12:00",
    openingReading: null, closingReading: null, dieselNorm: 0.3, dieselSource: "plant_stock",
    diesel: 5, openingDiesel: 20, dieselBalanceInTank: 15, dieselBalanceConfirmed: true, breakdowns: [] },
  { id: 22711, plantUsageId: 22811, equipmentId: 21710, machine: dpr20B2Masters[9].name,
    entryType: "time_meter", usageStatus: "working", startTime: "08:00", endTime: "12:00",
    openingReading: null, closingReading: null, hoursWorked: 4, dieselNorm: 5, dieselSource: "plant_stock",
    diesel: 5, openingDiesel: 20, dieselBalanceInTank: 15, dieselBalanceConfirmed: true, breakdowns: [] },
];
const dpr20B2Report = {
  ...dpr20B1Report, id: 22601, boqProjectId: 21801,
  remarks: "DPR20 B2 — synthetic canonical rates and explicit unavailable cases", equipment: dpr20B2Rows,
};
const dpr20B2Performance = buildEquipmentPerformanceReport({
  projects: [{ id: 21801, name: "Synthetic B2 active project", status: "active" }],
  dprs: [
    { id: 22601, date: dpr20B2Report.date, site: site.name, boqProjectId: 21801, dprStatus: "submitted" },
    { id: 22602, date: dpr20B2Report.date, site: "Synthetic other site", boqProjectId: 21801, dprStatus: "submitted" },
  ],
  masters: dpr20B2Masters,
  logs: [
    // Excluded record deliberately has no canonical report event.
    ...dpr20B2Rows.filter(row => row.id !== 22706).map(row => ({ ...row, dprId: 22601 })),
    { id: 22999, dprId: 22602, machine: dpr20B2Masters[5].name, equipmentId: 21706,
      plantUsageId: 22999, openingReading: 1, closingReading: 5, startTime: "05:00", endTime: "07:00", diesel: 100 },
  ],
  usages: [
    ...dpr20B2Rows.filter(row => row.plantUsageId != null && row.id !== 22706).map(row => ({
      id: row.plantUsageId!, dprId: 22601, date: dpr20B2Report.date, equipmentId: row.equipmentId,
      entryType: row.entryType, openingReading: row.openingReading, closingReading: row.closingReading,
      startTime: row.startTime, endTime: row.endTime, dieselIssued: row.diesel,
      openingDiesel: row.id === 22701 || row.id === 22709 ? 30 : row.id === 22702 ? 23 : row.openingDiesel,
      dieselBalanceInTank: row.dieselBalanceInTank, dieselBalanceConfirmed: row.dieselBalanceConfirmed,
      status: "closed", siteName: site.name,
    })),
    { id: 22999, dprId: 22602, date: dpr20B2Report.date, equipmentId: 21706,
      entryType: "time_meter", openingReading: 1, closingReading: 5, startTime: "05:00", endTime: "07:00",
      dieselIssued: 100, openingDiesel: 20, dieselBalanceInTank: 20, dieselBalanceConfirmed: true, status: "closed" },
  ],
  filters: { dateFrom: dpr20B2Report.date, dateTo: dpr20B2Report.date },
  asOfDate: dpr20B2Report.date,
});

// DPR20 B4: materials wording scenarios use only this isolated GET service.
// The hub state is the real shared computation, not a hand-authored readiness.
function dpr20B4Scenario() {
  const scenario = new URLSearchParams(window.location.search).get("scenario") ?? "trips-only";
  const populated = scenario === "populated";
  const report = {
    ...storedDpr, id: 24601, date: "2026-08-05", site: site.name,
    engineer: "B4 SYNTHETIC ENGINEER", dprStatus: "draft", workType: "road",
    boqProjectId: 5501, equipment: [], labour: [], progress: [], photos: [],
    structureItems: [], cutFillConsumptions: [], remarks: "",
    materials: populated ? [{
      id: 24701, type: "Issued", material: "B4 CEMENT ISSUED", quantity: 3.5,
      uom: "MT", supplier: "B4 SITE STORE", vehicleNumber: "B4-ISSUE-VEHICLE",
      location: "B4 concrete work", receiptNumber: "B4-ISSUE-RECEIPT",
    }] : [],
    sitePurchases: populated ? [{
      id: 24702, itemDescription: "B4 STORE PURCHASE", vendor: "B4 LOCAL VENDOR",
      billNo: "B4-BILL-01", amount: 525, quantity: 5, uom: "Nos",
    }] : [],
  };
  const receipts = scenario === "empty" ? [] : [
    { ...receivedVehicleSupplierTrip, id: 24901, material: "B4 RECEIVED GSB",
      quantity: 12.5, supplier: "B4 HAULER", vehicleNumber: "B4-TRIP-01",
      materialSourceSupplier: "B4 QUARRY", receiptNumber: "B4-TRIP-REC-01",
      unloadedAt: "stretch", notes: "Synthetic bulk trip; no production data." },
    { ...receivedVehicleSupplierTrip, id: 24902, material: "B4 RECEIVED GSB",
      quantity: 7.5, supplier: "B4 HAULER", vehicleNumber: "B4-TRIP-02",
      materialSourceSupplier: "B4 QUARRY", receiptNumber: "B4-TRIP-REC-02",
      unloadedAt: "yard", yardLabel: "B4 STORAGE YARD" },
  ];
  return { report, receipts, snapshot: {
    dpr: report, context: normalizeDprSectionContext(report),
    sectionTokens: { activity: "b4-a", equipment: "b4-e", labour: "b4-l", materials: "b4-m" },
    headerToken: "b4-header", sections: dprSectionStates(report),
  } };
}

const fixtureState = {
  requests: [] as RequestRecord[],
  dpr20B2Performance,
  dpr20B4Scenario,
  seedDpr18: null as null | ((id: number, equipmentPatch?: Record<string, unknown>) => void),
  dprCreatePayloads: [] as any[],
  dprCreateRecords: [] as any[],
  dpr09LiteralCreatePayloads: [] as any[],
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
  dpr07VersionChecks: [] as any[],
  dpr07FreshCreateChecks: [] as any[],
  dpr10DraftVersionAttempts: [] as any[],
  dpr10OverlapContextRequests: [] as any[],
  boqItemRequests: [] as any[],
  boqItemsRetryEnabled: false,
  vehicleSupplierPatchPayloads: [] as any[],
  vehicleSupplierPatchFailures: [] as any[],
  siteMaterialTripCreatePayloads: [] as any[],
  siteMaterialTripUpdatePayloads: [] as any[],
  // The verifier reads these after a rendered Save/Save Progress request.
  // Records themselves are persisted below so a full browser reopen can
  // exercise the same GET endpoint instead of a React-only state snapshot.
  dprRecoveryPayloads: [] as any[],
};

declare global {
  interface Window {
    __DprSiteFixture?: typeof fixtureState;
  }
}

window.__DprSiteFixture = fixtureState;

let nextDprId = 6103;
let nextPersonnelId = 6110;
const persistedDprStorageKey = "__dprSiteFixturePersistedDprs";
const persistedDprState = (() => {
  try {
    const raw = sessionStorage.getItem(persistedDprStorageKey);
    if (!raw) return { records: {} as Record<string, any>, current: null };
    const parsed = JSON.parse(raw);
    return {
      records: parsed?.records && typeof parsed.records === "object" ? parsed.records : {},
      current: parsed?.current && typeof parsed.current === "object" ? parsed.current : null,
    };
  } catch {
    return { records: {} as Record<string, any>, current: null };
  }
})();
let currentDpr: any = persistedDprState.current ?? { ...storedDpr };
const guidedDprRecords: Record<number, any> = {
  [labour01Draft.id]: labour01Draft,
  [dpr16B2ClassicEdit.id]: dpr16B2ClassicEdit,
  [dpr19Fix2Edit.id]: dpr19Fix2Edit,
  [dpr18B2Edit.id]: dpr18B2Edit,
  [dpr18B2Guided.id]: dpr18B2Guided,
  [dpr18B2Legacy.id]: dpr18B2Legacy,
  [dpr18B2Linked.id]: dpr18B2Linked,
  [guidedContractorDpr.id]: guidedContractorDpr,
  [guidedPlantStockDpr.id]: guidedPlantStockDpr,
  [siteEditContractorDpr.id]: siteEditContractorDpr,
  [dpr07LinkedContractor.id]: dpr07LinkedContractor,
  [dpr07LinkedDirectPurchase.id]: dpr07LinkedDirectPurchase,
  [dpr07LinkedPlantManager.id]: dpr07LinkedPlantManager,
  [dpr07LinkedPlantAdmin.id]: dpr07LinkedPlantAdmin,
  [dpr07LegacyInvalid.id]: dpr07LegacyInvalid,
  [dpr07FreshInvalid.id]: dpr07FreshInvalid,
  [dprBoqNoBarEdit.id]: dprBoqNoBarEdit,
  [guidedNullProjectDpr.id]: guidedNullProjectDpr,
  [siteEditNullProjectDpr.id]: siteEditNullProjectDpr,
  [dpr09GuidedSavedNullLive.id]: dpr09GuidedSavedNullLive,
  [dpr09SiteEditSavedNullLive.id]: dpr09SiteEditSavedNullLive,
  [dpr09GuidedNoSiteWork.id]: dpr09GuidedNoSiteWork,
  [dpr09SiteEditIncidental.id]: dpr09SiteEditIncidental,
  [dpr09PositiveProjectPin.id]: dpr09PositiveProjectPin,
  [dpr10BottomDraft.id]: dpr10BottomDraft,
  [dpr10OverlapDraft.id]: dpr10OverlapDraft,
  [dpr10SubmittedAdmin.id]: dpr10SubmittedAdmin,
  [progressUnitsDpr.id]: progressUnitsDpr,
};
for (const [id, record] of Object.entries(persistedDprState.records)) {
  if (record && typeof record === "object") guidedDprRecords[Number(id)] = record;
}
// Explicit browser-only reset between independent LABOUR-01 scenarios.
// Ordinary reloads intentionally do not reset, so they exercise persistence.
if (new URLSearchParams(location.search).has("labour01seed")) {
  delete persistedDprState.records[String(labour01Draft.id)];
  sessionStorage.setItem(persistedDprStorageKey, JSON.stringify(persistedDprState));
  guidedDprRecords[labour01Draft.id] = labour01Draft;
}
let nextPlantUsageId = 8102;
let plantUsageRecords: any[] = [{ ...initialPlantUsage }];
fixtureState.plantUsageRecords = plantUsageRecords;

function persistDprFixtureRecords() {
  try {
    sessionStorage.setItem(
      persistedDprStorageKey,
      JSON.stringify({ records: guidedDprRecords, current: currentDpr }),
    );
  } catch {
    // The request result remains available in this document. Session storage
    // is only the fixture's cross-navigation persistence layer.
  }
}

// An isolated browser scenario may restore its own synthetic baseline between
// assertions; this never calls a backend and never changes another fixture.
fixtureState.seedDpr18 = (id: number, equipmentPatch: Record<string, unknown> = {}) => {
  const baseline = id === 6278 ? dpr18B2Edit : id === 6279 ? dpr18B2Legacy : id === 6280 ? dpr18B2Linked : id === 6281 ? dpr18B2Guided : null;
  if (!baseline) throw new Error(`Unknown synthetic DPR18 fixture id: ${id}`);
  guidedDprRecords[id] = {
    ...baseline,
    equipment: baseline.equipment.length ? [{ ...baseline.equipment[0], ...equipmentPatch }] : [],
  };
  persistDprFixtureRecords();
};

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

function hasPositiveBoqItemReference(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(hasPositiveBoqItemReference);
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  const itemId = record.boqItemId;
  if (
    (typeof itemId === "number" && Number.isInteger(itemId) && itemId > 0)
    || (typeof itemId === "string" && /^\d+$/.test(itemId) && Number(itemId) > 0)
  ) return true;
  return Object.values(record).some(hasPositiveBoqItemReference);
}

const isDpr07Route = () =>
  new URLSearchParams(window.location.search).get("dpr07") === "1";

const isDprBoqRoute = () =>
  new URLSearchParams(window.location.search).get("dprBoq") === "1";

const isDprNullRoute = () =>
  new URLSearchParams(window.location.search).get("dprNull") === "1";

const isDpr09Route = () =>
  new URLSearchParams(window.location.search).get("dpr09") === "1";

const isDpr09LiteralRoute = () =>
  isDpr09Route() && new URLSearchParams(window.location.search).get("dpr09Literal") === "1";

const isDpr09MultiRoute = () =>
  isDpr09Route() && new URLSearchParams(window.location.search).get("dpr09Multi") === "1";

const isDpr10Route = () =>
  new URLSearchParams(window.location.search).get("dpr10") === "1";

const isDpr10DelayedPriorRoute = () =>
  isDpr10Route() && new URLSearchParams(window.location.search).get("dpr10DelayedPriors") === "1";

const isDpr08Route = () =>
  new URLSearchParams(window.location.search).get("dpr08") === "1";

const isDpr08MultiRoute = () =>
  isDpr08Route() && new URLSearchParams(window.location.search).get("dpr08Multi") === "1";

const dpr07ComparableProgress = (row: any) => ({
  id: row?.id ?? row?.persistedId ?? null,
  entryKey: row?.entryKey ?? null,
  activity: row?.activity ?? null,
  boqItemId: row?.boqItemId ?? null,
  programmeBarId: row?.programmeBarId ?? null,
  side: row?.side ?? null,
  chainageFrom: row?.chainageFrom ?? null,
  chainageTo: row?.chainageTo ?? null,
  quantity: row?.quantity ?? null,
  uom: row?.uom ?? null,
  quantitySource: row?.quantitySource ?? null,
  quantitySourceNote: row?.quantitySourceNote ?? null,
  materialOutcome: row?.materialOutcome ?? null,
  reusableQty: row?.reusableQty ?? null,
});

const dpr07ComparableLabour = (row: any) => ({
  category: row?.category ?? null,
  gender: row?.gender ?? null,
  count: row?.count ?? null,
  task: row?.task ?? null,
  contractor: row?.contractor ?? null,
  boqItemId: row?.boqItemId ?? null,
  structureId: row?.structureId ?? null,
});

const dpr07VersionValidation = (id: number, payload: any) => {
  const original = id === dpr07LegacyInvalid.id ? dpr07LegacyInvalid : null;
  const submitted = Array.isArray(payload?.data?.progress) ? payload.data.progress : [];
  const source = original?.progress?.[0] ?? null;
  const row = submitted[0] ?? null;
  const changed = JSON.stringify(dpr07ComparableProgress(row))
    !== JSON.stringify(dpr07ComparableProgress(source));
  const labourChanged = JSON.stringify((payload?.data?.labour ?? []).map(dpr07ComparableLabour))
    !== JSON.stringify((original?.labour ?? []).map(dpr07ComparableLabour));
  fixtureState.dpr07VersionChecks.push({
    sourceId: id,
    originalRows: original?.progress?.length ?? 0,
    submittedRows: submitted.length,
    changedRows: changed ? 1 : 0,
    labourChanged,
    original: dpr07ComparableProgress(source),
    submitted: dpr07ComparableProgress(row),
    scope: changed ? "changed-or-new-only" : "unchanged-legacy-bypassed",
    result: changed ? "rejected" : "accepted",
  });
  if (changed) {
    return json({
      code: "DPR_PROGRESS_VALIDATION",
      message: "Progress entry \"LEGACY INVALID ACTIVITY\": changed quantity-source, material-outcome, or programme-link data is invalid.",
    }, 422);
  }
  return null;
};

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
  fixtureState.dprRecoveryPayloads.push({ id, status, payload: updated });
  persistDprFixtureRecords();
  return updated;
}

const labour01SequenceKey = "__dprSiteFixtureLabour01NextParentId";
let nextLabour01ParentId = Number(sessionStorage.getItem(labour01SequenceKey)) || 8351;
// Mirror storage.updateDprDraft's delete/reinsert of labour_logs on full
// PATCH. A second save with the old parent id must conflict, not silently
// attach names to a different row. This branch is synthetic-fixture only.
function labour01ReplacePayload(payload: any, saved: any): any {
  if (!new URLSearchParams(location.search).has("labour01") || !Array.isArray(payload.labour)) return payload;
  const previous = saved?.labour ?? [];
  for (const row of payload.labour) {
    const reference = row.persistedId ?? row.id;
    if (reference != null && previous.length && !previous.some((old: any) => old.id === reference)) {
      return null;
    }
  }
  return {
    ...payload,
    labour: payload.labour.map((row: any) => {
      const old = previous.find((candidate: any) => candidate.id === (row.persistedId ?? row.id));
      const id = nextLabour01ParentId++;
      sessionStorage.setItem(labour01SequenceKey, String(nextLabour01ParentId));
      return { ...row, id, persistedId: id, workerNames: row.workerNames ?? old?.workerNames ?? [] };
    }),
  };
}

// Mirror server/dprSections.sectionSnapshot for B2's isolated HTTP storage.
// Real SiteEdit refuses to save a draft without these server-issued tokens.
// This adapter also checks them on PATCH; it does not relax client validation.
const canonicalB2 = (value: any): any => {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonicalB2);
  if (value && typeof value === "object") return Object.fromEntries(
    Object.keys(value).sort().filter(key => value[key] !== undefined).map(key => [key, canonicalB2(value[key])]),
  );
  return value;
};
async function b2ContentToken(value: any): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(canonicalB2(value)));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}
async function b2SnapshotTokens(dpr: any) {
  const context = normalizeDprSectionContext(dpr);
  return {
    headerToken: await b2ContentToken({
      context, engineer: dpr.engineer, status: dpr.dprStatus,
      deleted: dpr.isDeleted, cancelled: dpr.isCancelled, superseded: dpr.isSuperseded,
    }),
    sectionTokens: Object.fromEntries(await Promise.all(DPR_SECTIONS.map(async section =>
      [section, await b2ContentToken(pickDprSectionPayload(section, dpr))],
    ))),
  };
}
function isB2FixtureRequest() {
  return new URLSearchParams(window.location.search).has("dpr16b2");
}

const originalFetch = window.fetch.bind(window);
window.fetch = async (input, init) => {
  const { url, method: inputMethod } = requestDetails(input);
  const method = (init?.method || inputMethod).toUpperCase();
  const body = parseBody(init);
  const pathname = url.pathname;
  fixtureState.requests.push({ method, path: `${pathname}${url.search}`, body });

  if (new URLSearchParams(window.location.search).has("dpr20b4")) {
    if (method !== "GET") return json({ message: "DPR20 B4 fixture blocks every write" }, 405);
    const fixture = dpr20B4Scenario();
    if (pathname === "/api/dprs/24601") return json(fixture.report);
    if (pathname === "/api/dpr-sections/24601") return json(fixture.snapshot);
    if (pathname === "/api/materials-received") return json(fixture.receipts);
    // All remaining synthetic lookups are intercepted below, never native.
    if (!["/api/sites", "/api/personnel", "/api/plant-module/equipment", "/api/config"].includes(pathname)
      && !pathname.startsWith("/api/boq/")) return json([]);
  }

  if (new URLSearchParams(window.location.search).has("dpr20b2")) {
    if (method !== "GET") return json({ message: "DPR20 B2 fixture blocks every write" }, 405);
    if (pathname === "/api/dprs/22601") return json(dpr20B2Report);
    if (pathname === "/api/reports/equipment-performance") {
      const scenario = new URLSearchParams(window.location.search).get("scenario");
      if (scenario === "failure") return json({ message: "Synthetic performance service failure" }, 500);
      if (scenario === "forbidden") return json({ error: "forbidden" }, 403);
      return json(dpr20B2Performance);
    }
    if (pathname === "/api/equipment-usage/lifecycle") return json([
      { id: 22801, status: "closed", successorId: null, closedByUserName: "Synthetic operator" },
      { id: 22802, status: "open", successorId: null, destinationType: "site", destinationSite: site.name },
      { id: 22803, status: "closed", successorId: 22900, destinationType: "hmp" },
    ]);
    if (pathname === "/api/plant-module/equipment") return json(dpr20B2Masters);
    if (pathname === "/api/sites") return json([site]);
    if (pathname === "/api/maintenance/logs") return json([]);
    // BOQ/personnel/config responses are independent synthetic GETs below.
    if (![ "/api/personnel", "/api/config" ].includes(pathname)
      && !pathname.startsWith("/api/boq/")) return json([]);
  }

  if (new URLSearchParams(window.location.search).has("dpr20b1")) {
    if (pathname === "/api/dprs/20601" && method === "GET") return json(dpr20B1Report);
    if (pathname === "/api/equipment-usage/lifecycle" && method === "GET") return json([
      { id: 20801, status: "closed", successorId: null, closedByUserName: "Synthetic operator" },
      { id: 20802, status: "open", successorId: null, destinationType: "site", destinationSite: site.name },
      { id: 20803, status: "closed", successorId: 20804, destinationType: "hmp" },
    ]);
    if (pathname === "/api/equipment-usage/20801/move" && method === "POST") {
      return json({ id: 20805, ...body }, 201);
    }
    if (pathname === "/api/maintenance/logs" && method === "GET") return json([
      ...dpr20B1Maintenance,
      // A stale linked row must not replace authoritative detail children.
      { ...dpr20B1Maintenance[0], id: 20883, sourceRecordId: 20720,
        description: "Synthetic stale linked detail" },
    ]);
    if (pathname.startsWith("/api/") && method !== "GET") {
      return json({ message: "DPR20 B1 fixture blocks all other writes" }, 405);
    }
    // Unhandled APIs never reach a customer-backed endpoint.
    if (pathname.startsWith("/api/") && ![
      "/api/sites", "/api/personnel", "/api/plant-module/equipment", "/api/config",
    ].includes(pathname) && !pathname.startsWith("/api/boq/")) return json([]);
  }

  if (pathname === "/api/sites" && method === "GET") {
    return json(
      isDpr09LiteralRoute()
        ? [nullRecoverySite]
        : isDprNullRoute() || isDpr09Route()
          ? [site, nullRecoverySite]
          : [site],
    );
  }
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
  if (pathname === "/api/site-material-trips/suggestions" && method === "GET") {
    if (new URLSearchParams(window.location.search).get("suggestionFailure") === "1") {
      return json({ message: "Synthetic suggestion lookup failure" }, 503);
    }
    return json(vehicleSupplierSuggestions);
  }
  if (pathname === "/api/materials/suppliers" && method === "GET") {
    return json(vehicleSupplierSuggestions.suppliers);
  }
  if (pathname === "/api/materials-received" && method === "GET") {
    return json([receivedVehicleSupplierTrip]);
  }
  if (pathname === "/api/site-material-trips" && method === "GET") {
    return json(isDpr10Route() ? dpr10DayTrips : []);
  }
  if (pathname === "/api/site-material-trips" && method === "POST") {
    // The browser regression never needs a production write. Return a
    // synthetic row so an accidental click still settles the real mutation,
    // but deliberately do not append it to any fixture collection.
    fixtureState.siteMaterialTripCreatePayloads.push(body || {});
    return json({
      ...receivedVehicleSupplierTrip,
      id: 9800 + fixtureState.siteMaterialTripCreatePayloads.length,
      ...(body || {}),
    }, 201);
  }
  if (pathname === "/api/site-material-trips/vehicle-supplier" && method === "PATCH") {
    fixtureState.vehicleSupplierPatchPayloads.push(body || {});
    const valid =
      body?.site === site.name
      && String(body?.vehicleNumber || "").trim().toUpperCase().replace(/[\s-]+/g, "") === "TS15U1234"
      && String(body?.supplier || "").trim().length > 0
      && body?.expectedVersion === "v1"
      && body?.expectedSupplier === "ACME";
    if (!valid) {
      fixtureState.vehicleSupplierPatchFailures.push(body || {});
      return json({
        code: "FIXTURE_VEHICLE_SUPPLIER_VERSION",
        message: "Fixture correction requires site, known vehicle, supplier, expectedVersion v1, and expectedSupplier ACME.",
      }, 409);
    }
    return json({
      status: "linked",
      supplier: String(body.supplier).trim().toUpperCase(),
      version: "v1",
    });
  }
  const siteMaterialTripUpdateMatch = pathname.match(/^\/api\/site-material-trips\/(\d+)$/);
  if (siteMaterialTripUpdateMatch && method === "PATCH") {
    const id = Number(siteMaterialTripUpdateMatch[1]);
    fixtureState.siteMaterialTripUpdatePayloads.push({ id, payload: body || {} });
    return json({ ...receivedVehicleSupplierTrip, id, ...(body || {}) });
  }
  if (pathname === "/api/dprs/with-details" && method === "GET") {
    return json(url.searchParams.has("dpr19b1") || new URLSearchParams(window.location.search).get("dpr19b1") === "1"
      ? dpr19B1Records : []);
  }
  if (pathname === "/api/dprs/chainage-overlap-context" && method === "GET") {
    if (isDpr10Route()) {
      fixtureState.dpr10OverlapContextRequests.push({
        boqItemIds: url.searchParams.get("boqItemIds") || "",
        excludeDprId: url.searchParams.get("excludeDprId") || null,
        delayed: isDpr10DelayedPriorRoute(),
      });
      if (isDpr10DelayedPriorRoute()) {
        await new Promise((resolve) => setTimeout(resolve, 850));
      }
      return json({ entries: dpr10OverlapPriors });
    }
    return json({ entries: [] });
  }
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
    const isNullRecovery = isDprNullRoute();
    const projects = isDpr08Route()
      ? [
          {
            id: 5501,
            name: "NARASIMHULU ROAD BOQ",
            siteId: site.id,
            itemCount: boqItems.length,
            status: "active",
            // The DPR-08 multi-project case must prove the resolver's
            // active-with-programme priority rather than API order alone.
            barCount: 2,
          },
          ...(isDpr08MultiRoute()
            ? [{
                id: 5502,
                name: "NARASIMHULU ROAD SECOND BOQ",
                siteId: site.id,
                itemCount: alternateBoqItems.length,
                status: "active",
                barCount: 0,
              }]
            : []),
        ]
      : isDpr09Route()
      ? Number(url.searchParams.get("siteId")) === nullRecoverySite.id
        ? [
            { ...nullRecoveryBoqProject, status: "active", barCount: 1 },
            ...(isDpr09MultiRoute() ? [{ ...alternateNullRecoveryBoqProject, status: "active", barCount: 0 }] : []),
          ]
        : [
            { id: 5501, name: "NARASIMHULU ROAD BOQ", siteId: site.id, itemCount: boqItems.length, status: "active", barCount: 2 },
            ...(isDpr09MultiRoute() ? [{ ...alternateBoqProject, status: "active", barCount: 0 }] : []),
          ]
      : isNullRecovery
      ? [
          nullRecoveryBoqProject,
          ...(new URLSearchParams(window.location.search).get("dprNullMulti") === "1"
            ? [alternateNullRecoveryBoqProject]
            : []),
        ]
      : [
          { id: 5501, name: "NARASIMHULU ROAD BOQ", siteId: site.id, itemCount: boqItems.length },
          ...(new URLSearchParams(window.location.search).get("dprNullMulti") === "1"
            ? [alternateBoqProject]
            : []),
        ];
    return json(projects);
  }

  const projectItemsMatch = pathname.match(/^\/api\/boq\/projects\/(\d+)\/items$/);
  if (projectItemsMatch && method === "GET") {
    const shouldFail = isDprBoqRoute()
      && new URLSearchParams(window.location.search).get("boqFailure") === "items"
      && !fixtureState.boqItemsRetryEnabled;
    fixtureState.boqItemRequests.push({
      projectId: Number(projectItemsMatch[1]),
      failed: shouldFail,
      attempt: fixtureState.boqItemRequests.length + 1,
    });
    if (shouldFail) {
      return json({ code: "BOQ_ITEMS_FIXTURE_FAILURE", message: "Fixture BOQ item request failed; retry is expected." }, 503);
    }
    return json(
      Number(projectItemsMatch[1]) === alternateBoqProject.id
        || Number(projectItemsMatch[1]) === alternateNullRecoveryBoqProject.id
        ? alternateBoqItems
        : new URLSearchParams(window.location.search).has("dpr16b2")
          ? [...boqItems, {
              id: 8816, itemCode: "B2.1", itemName: "ROADWAY EXCAVATION",
              description: "Roadway excavation in cutting", displayName: "ROADWAY EXCAVATION",
              unit: "CUM", categoryName: "Road Work", planningWorkType: "road",
              dprMeasurementMethod: "geometry", includeInDpr: true,
            }]
          : boqItems,
    );
  }
  const projectArrangementItemMatch = pathname.match(/^\/api\/boq\/projects\/(\d+)\/earthwork-arrangements\/item\/(\d+)$/);
  if (projectArrangementItemMatch && method === "GET") {
    const projectId = Number(projectArrangementItemMatch[1]);
    const itemId = Number(projectArrangementItemMatch[2]);
    return projectId === inlineReceiptArrangement.boqProjectId && itemId === inlineReceiptArrangement.boqItemId
      ? json([inlineReceiptArrangement])
      : json([]);
  }
  const projectArrangementAllocationsMatch = pathname.match(/^\/api\/boq\/projects\/(\d+)\/arrangement-programme-allocations$/);
  if (projectArrangementAllocationsMatch && method === "GET") return json([]);
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
    const dpr19B1Record = dpr19B1Records.find(record => record.id === requestedId);
    if (dpr19B1Record) return json(dpr19B1Record);
    if (new URLSearchParams(window.location.search).has("dpr18b3") && dpr18B3Reports[requestedId]) {
      return json(dpr18B3Reports[requestedId]);
    }
    if (isB2FixtureRequest()) {
      const saved = guidedDprRecords[requestedId] ?? (requestedId === currentDpr.id ? currentDpr : null);
      if (!saved) return json({ message: "Synthetic DPR not found" }, 404);
      return json(saved.dprStatus === "draft" ? { ...saved, ...await b2SnapshotTokens(saved) } : saved);
    }
    if (requestedId === 6101) return json({ ...storedDpr, id: 6101 });
    if (guidedDprRecords[requestedId]) return json(guidedDprRecords[requestedId]);
    return requestedId === currentDpr.id ? json(currentDpr) : json({}, 404);
  }
  if (pathname === "/api/dprs" && method === "GET") return json([currentDpr]);
  if (pathname === "/api/dprs" && method === "POST") {
    // H exercises the same fresh-create route after the real SiteEntry
    // controls have been rendered.  This branch is deliberately explicit:
    // the response is fixture API evidence, not an actual server invocation.
    if (isDpr07Route() && url.searchParams.get("validation") === "invalid") {
      fixtureState.dpr07FreshCreateChecks.push({
        route: "POST /api/dprs",
        result: "rejected",
        scope: "all-rows-fresh-create",
        checkedRows: Array.isArray(body?.progress) ? body.progress.length : 0,
      });
      return json({
        code: "DPR_PROGRESS_VALIDATION",
        message: "Fresh DPR progress row fails quantity-source, material-outcome, or programme-link validation.",
      }, 422);
    }
    const status = String(body?.dprStatus || "").toLowerCase() === "draft" ? "draft" : "submitted";
    const literalEmptyDraft = isDpr09LiteralRoute()
      && status === "draft"
      && !hasPositiveBoqItemReference(body);
    const id = literalEmptyDraft ? 6240 : nextDprId++;
    const persistedBody = literalEmptyDraft
      ? { ...(body || {}), boqProjectId: null }
      : body || {};
    if (literalEmptyDraft) {
      fixtureState.dpr09LiteralCreatePayloads.push({
        id,
        requestedPayload: body || {},
        persistedPayload: persistedBody,
        enforcedNull: persistedBody.boqProjectId === null,
      });
    }
    if (status === "draft") {
      fixtureState.dprDraftPayloads.push({ id, payload: persistedBody });
      fixtureState.draftPayloads.push({ id, payload: persistedBody });
    } else {
      // Keep the request payload as the browser saw it.  The production
      // contract historically expresses final-vs-draft through dprStatus
      // (omitting dprStatus:"draft" means final); isDraft is fixture evidence
      // metadata, not an injected request field.
      const submittedPayload = persistedBody;
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
    const created = copyDprWithPayload(id, persistedBody, status);
    return json(isB2FixtureRequest() && status === "draft"
      ? { ...created, ...await b2SnapshotTokens(created) }
      : created, 201);
  }

  const draftMatch = pathname.match(/^\/api\/dprs\/(\d+)\/draft$/);
  if (draftMatch && method === "PATCH") {
    const id = Number(draftMatch[1]);
    if (isB2FixtureRequest()) {
      const saved = guidedDprRecords[id] ?? (id === currentDpr.id ? currentDpr : null);
      if (!saved || saved.dprStatus !== "draft") return json({ message: "Synthetic draft not found" }, 404);
      const expected = await b2SnapshotTokens(saved);
      if (body?.headerToken !== expected.headerToken ||
        DPR_SECTIONS.some(section => body?.sectionTokens?.[section] !== expected.sectionTokens[section])) {
        return json({ code: "DPR_SECTION_CONFLICT", message: "Synthetic draft version changed. Reload its saved sections before saving again." }, 409);
      }
    }
    fixtureState.dprDraftPayloads.push({ id, payload: body || {} });
    fixtureState.draftPayloads.push({ id, payload: body || {} });
    const { headerToken: _headerToken, sectionTokens: _sectionTokens, ...draftData } = body || {};
    const prepared = labour01ReplacePayload(isB2FixtureRequest() ? draftData : body || {}, guidedDprRecords[id]);
    if (!prepared) return json({ code: "DPR_SECTION_CONFLICT", message: "A saved labour row no longer belongs to this DPR." }, 409);
    const updated = copyDprWithPayload(id, prepared, "draft");
    return json(isB2FixtureRequest() ? { ...updated, ...await b2SnapshotTokens(updated) } : updated);
  }
  const versionMatch = pathname.match(/^\/api\/dprs\/(\d+)\/version$/);
  if (versionMatch && method === "POST") {
    const sourceId = Number(versionMatch[1]);
    const sourceRecord = guidedDprRecords[sourceId];
    if (
      isDpr10Route()
      && sourceRecord?.dprStatus === "draft"
    ) {
      fixtureState.dpr10DraftVersionAttempts.push({ id: sourceId, payload: body || {} });
      return json({
        code: "DPR_DRAFT_VERSION_CONFLICT",
        message: "A draft DPR cannot be versioned. Edit, save, or submit the draft instead.",
      }, 409);
    }
    if (isDpr07Route()) {
      const validationResponse = dpr07VersionValidation(Number(versionMatch[1]), body);
      if (validationResponse) return validationResponse;
    }
    const id = nextDprId++;
    fixtureState.dprVersionPayloads.push({ id: Number(versionMatch[1]), payload: body || {} });
    fixtureState.versionPayloads.push({ id: Number(versionMatch[1]), payload: body || {} });
    const version = copyDprWithPayload(id, body?.data || {}, "submitted");
    if (isDpr10Route()) {
      try {
        sessionStorage.setItem(
          "__dprSiteFixtureLastSubmitted",
          JSON.stringify({ id, payload: version, isDraft: false }),
        );
      } catch {
        // Session storage is only a fixture report convenience.
      }
    }
    return json(version, 201);
  }
  const submitMatch = pathname.match(/^\/api\/dprs\/(\d+)\/submit$/);
  if (submitMatch && method === "POST") {
    const sourceId = Number(submitMatch[1]);
    if (isDpr10Route() && sourceId === dpr10OverlapDraft.id) {
      const hasReasonedOverlap = (body?.progress ?? []).some((row: any) =>
        Number(row?.boqItemId) === 8801
        && String(row?.side || "").toUpperCase() === "LHS"
        && Number(row?.chainageFromKm) < 3.25
        && Number(row?.chainageToKm) > 3.15
        && String(row?.chainageOverrideReason || "").trim() !== "",
      );
      const hasOverlap = (body?.progress ?? []).some((row: any) =>
        Number(row?.boqItemId) === 8801
        && String(row?.side || "").toUpperCase() === "LHS"
        && Number(row?.chainageFromKm) < 3.25
        && Number(row?.chainageToKm) > 3.15,
      );
      if (hasOverlap && !hasReasonedOverlap) {
        return json({
          code: "DPR_NOT_READY",
          issues: [{
            section: "activities",
            activity: "GSB LAYING",
            description: "Possible chainage overlap requires a reason before submission.",
          }],
        }, 422);
      }
    }
    fixtureState.dprSubmitPayloads.push({ id: sourceId, payload: body || {} });
    fixtureState.submittedPayloads.push({ id: sourceId, payload: body || {} });
    const submitted = copyDprWithPayload(sourceId, body || {}, "submitted");
    if (isDpr10Route()) {
      try {
        sessionStorage.setItem(
          "__dprSiteFixtureLastSubmitted",
          JSON.stringify({ id: sourceId, payload: submitted, isDraft: false }),
        );
      } catch {
        // Session storage is only a fixture report convenience.
      }
    }
    return json(submitted);
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
  if ((new URLSearchParams(window.location.search).has("dpr20b1")
    || new URLSearchParams(window.location.search).has("dpr20b4")) && pathname.startsWith("/api/")) {
    return json({ message: `Unhandled isolated DPR20 fixture API: ${method} ${pathname}` }, 404);
  }
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

function VehicleSupplierInlineFixture() {
  return (
    <main className="mx-auto w-full max-w-5xl space-y-4 p-6 pb-12">
      <header
        className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-950"
        data-testid="vehicle-supplier-fixture-banner"
      >
        <h1 className="text-xl font-bold">Vehicle/supplier inline receipt fixture</h1>
        <p className="mt-1 text-sm">
          Real ActivityReceiptStrip controls with synthetic API responses. No
          customer or production rows are written.
        </p>
      </header>
      <ActivityReceiptStrip
        siteName={site.name}
        date="2026-08-05"
        boqProjectId={inlineReceiptArrangement.boqProjectId}
        boqItemId={inlineReceiptArrangement.boqItemId}
        programmeBarId={null}
        executedQty={0}
        executedUom="MT"
        locationLabel="KM 12"
        testIdPrefix="inline"
      />
    </main>
  );
}

installBoqLink01Adapter();

function Dpr07EvidenceBanner() {
  if (!isDpr07Route()) return null;
  const params = new URLSearchParams(window.location.search);
  const role = params.get("role") === "manager"
    ? "NON-ADMIN MANAGER"
    : "AUTHENTICATED ADMIN";
  const scenario = params.get("scenario") || "shared DPR screen";
  return (
    <header
      className="mx-auto mb-5 max-w-5xl rounded-lg border border-amber-300 bg-amber-50 px-5 py-4 text-amber-950 shadow-sm"
      data-testid="dpr07-evidence-banner"
    >
      <div className="text-xs font-bold uppercase tracking-[0.18em] text-amber-800">
        DPR-07 isolated browser evidence · {role}
      </div>
      <h1 className="mt-1 text-lg font-semibold">Fixture-only API adapter · {scenario}</h1>
      <p className="mt-1 text-sm">
        Real DPR components and rendered controls. Synthetic data only; no customer or production writes.
      </p>
    </header>
  );
}

function DprNullEvidenceBanner() {
  if (!isDprNullRoute()) return null;
  const params = new URLSearchParams(window.location.search);
  const scenario = params.get("scenario") || "saved-null project recovery";
  return (
    <header
      className="mx-auto mb-5 max-w-5xl rounded-lg border border-amber-300 bg-amber-50 px-5 py-4 text-amber-950 shadow-sm"
      data-testid="dpr-null-evidence-banner"
    >
      <div className="text-xs font-bold uppercase tracking-[0.18em] text-amber-800">
        Saved-null DPR recovery · isolated browser evidence
      </div>
      <h1 className="mt-1 text-lg font-semibold">Fixture-only API adapter · {scenario}</h1>
      <p className="mt-1 text-sm">
        Real Guided, Detailed, and Edit controls. Synthetic data only; no customer or production writes.
      </p>
    </header>
  );
}

function Dpr08EvidenceBanner() {
  if (!isDpr08Route()) return null;
  const params = new URLSearchParams(window.location.search);
  const scenario = params.get("scenario") || "silent BOQ project resolution";
  return (
    <header
      className="mx-auto mb-5 max-w-5xl rounded-lg border border-amber-300 bg-amber-50 px-5 py-4 text-amber-950 shadow-sm"
      data-testid="dpr08-evidence-banner"
    >
      <div className="text-xs font-bold uppercase tracking-[0.18em] text-amber-800">
        DPR-08 isolated browser evidence
      </div>
      <h1 className="mt-1 text-lg font-semibold">Fixture-only API adapter · {scenario}</h1>
      <p className="mt-1 text-sm">
        Real Guided and Detailed DPR controls. Synthetic data only; no customer or production writes.
      </p>
    </header>
  );
}

function Dpr09EvidenceBanner() {
  if (!isDpr09Route()) return null;
  const params = new URLSearchParams(window.location.search);
  const scenario = params.get("scenario") || "automatic saved-null recovery";
  return (
    <header
      className="mx-auto mb-5 max-w-5xl rounded-lg border border-amber-300 bg-amber-50 px-5 py-4 text-amber-950 shadow-sm"
      data-testid="dpr09-evidence-banner"
    >
      <div className="text-xs font-bold uppercase tracking-[0.18em] text-amber-800">
        DPR-09 isolated browser evidence
      </div>
      <h1 className="mt-1 text-lg font-semibold">Fixture-only API adapter · {scenario}</h1>
      <p className="mt-1 text-sm">
        Real Guided, Detailed, and Edit controls. Synthetic data only; no customer or production writes.
      </p>
    </header>
  );
}

function Dpr10EvidenceBanner() {
  if (!isDpr10Route()) return null;
  const params = new URLSearchParams(window.location.search);
  const scenario = params.get("scenario") || "SiteEdit bottom gating and overlap warning";
  return (
    <header
      className="mx-auto mb-5 max-w-5xl rounded-lg border border-amber-300 bg-amber-50 px-5 py-4 text-amber-950 shadow-sm"
      data-testid="dpr10-evidence-banner"
    >
      <div className="text-xs font-bold uppercase tracking-[0.18em] text-amber-800">
        DPR-10 isolated browser evidence
      </div>
      <h1 className="mt-1 text-lg font-semibold">Fixture-only API adapter · {scenario}</h1>
      <p className="mt-1 text-sm">
        Real SiteEdit controls over delayed synthetic overlap data. No customer or production writes.
      </p>
    </header>
  );
}

function Dpr16B2EvidenceBanner() {
  if (!new URLSearchParams(window.location.search).has("dpr16b2")) return null;
  return <header className="mx-auto mb-5 max-w-5xl rounded-lg border border-amber-300 bg-amber-50 px-5 py-4 text-amber-950 shadow-sm" data-testid="dpr16-b2-fixture-banner">
    <h1 className="font-semibold">DPR16 B2 · synthetic classic route fixture</h1>
    <p className="text-sm">Real SiteEntry / SiteEdit React controls with intercepted auth, BOQ and in-memory API. No operational database or customer DPR.</p>
  </header>;
}

// wouter's setLocation uses history.pushState. The isolated fixture routes the
// real SiteEntry success navigation to SiteSuccess without changing production
// navigation code.
const originalPushState = window.history.pushState.bind(window.history);
window.history.pushState = ((state: any, title: string, url?: string | URL | null) => {
  // LABOUR-01 save-pair probe: the production draft UI intentionally parks to
  // Field Home after saving. Hold this synthetic fixture on the mounted form
  // so a second immediate Save can reveal stale replacement-row identities.
  if (new URLSearchParams(window.location.search).has("labour01stay")
    && String(url ?? "").startsWith("/site/dashboard")) return;
  originalPushState(state, title, url);
  // Viewer history entries do not route/remount the production application.
  // Keep that behavior in this narrow fixture too, instead of unmounting the
  // report synchronously while its attachment-opening effect is executing.
  if ((new URLSearchParams(window.location.search).has("dpr20b1")
    || new URLSearchParams(window.location.search).has("dpr20b2"))
    && typeof state?.[ATTACHMENT_VIEWER_HISTORY_KEY] === "string") return;
  window.dispatchEvent(new PopStateEvent("popstate"));
}) as typeof window.history.pushState;

const mount = () => {
  if (!new URLSearchParams(window.location.search).has("dpr20b4")) installDpr13Adapter();
  queryClient.clear();
  const isEdit = window.location.pathname.startsWith("/site/edit/");
  const isDpr19B1Dashboard = window.location.pathname === "/site/dashboard"
    && new URLSearchParams(window.location.search).get("dpr19b1") === "1";
  const isSiteSuccess = window.location.pathname.startsWith("/site/success/");
  const isSiteReport = window.location.pathname.startsWith("/site/report/");
  const isDpr18B3Report = new URLSearchParams(window.location.search).has("dpr18b3");
  const isDpr20B1Report = new URLSearchParams(window.location.search).has("dpr20b1");
  const isDpr20B2Report = new URLSearchParams(window.location.search).has("dpr20b2");
  const isDpr20B4Report = new URLSearchParams(window.location.search).has("dpr20b4");
  const isLabour01 = new URLSearchParams(window.location.search).has("labour01");
  const isDpr18B3Details = (isDpr18B3Report || isLabour01 || isDpr20B4Report) && window.location.pathname.startsWith("/dpr/");
  const isSiteMaterialTrips = window.location.pathname.startsWith("/site/material-trips");
  const isSiteMaterialsReceived = window.location.pathname.startsWith("/site/materials-received");
  const isVehicleSupplierInline = window.location.pathname.startsWith("/fixture/vehicle-supplier-inline");
  const isPlantEquipmentUsage = window.location.pathname.startsWith("/plant/equipment-usage");
  const isGuidedReport = window.location.pathname.startsWith("/guided/report");
  const isGuided = window.location.pathname.startsWith("/guided") || window.location.pathname === "/site/guided/combined";
  appRoot?.unmount();
  appRoot = createRoot(document.getElementById("root")!);
  appRoot.render(
    <QueryClientProvider client={queryClient}>
      {isDpr18B3Report && <header className="border border-amber-500 bg-amber-50 p-4 text-sm font-semibold">DPR18 B3 · isolated synthetic read-only response · no customer database</header>}
      {isDpr20B1Report && <header data-testid="dpr20-b1-fixture-banner" className="border border-amber-500 bg-amber-50 p-4 text-sm font-semibold">DPR20 B1 · synthetic isolated API · actual SiteReport · no customer database or writes</header>}
      {isDpr20B2Report && <header data-testid="dpr20-b2-fixture-banner" className="border border-amber-500 bg-amber-50 p-4 text-sm font-semibold">DPR20 B2 · synthetic real-builder canonical events · actual SiteReport · intercepted GETs only</header>}
      {isDpr20B4Report && <header data-testid="dpr20-b4-fixture-banner" className="border border-amber-500 bg-amber-50 p-4 text-sm font-semibold">DPR20 B4 · isolated materials wording evidence · real read-only pages and section hub · intercepted GETs only</header>}
      {isLabour01 && <header className="border border-amber-500 bg-amber-50 p-4 text-sm font-semibold">LABOUR-01 · isolated synthetic DPR · intercepted API · no customer database</header>}
      {new URLSearchParams(window.location.search).has("boqlink01") && <header data-testid="boq-link01-fixture-banner" className="sticky top-0 z-50 mb-4 border border-amber-500 bg-amber-50 p-4 text-sm font-semibold">
        BOQ-LINK-01 · fixture evidence · real DPR screens · synthetic API/session storage only · no database persistence claim
      </header>}
      {new URLSearchParams(window.location.search).has("dpr13Legacy") && <header className="border border-amber-500 bg-amber-50 p-4">DPR-13 synthetic legacy-token fixture — real Guided/SiteEdit components, intercepted API only.</header>}
      <Dpr16B2EvidenceBanner />
      {isDpr19B1Dashboard && <header data-testid="dpr19-b1-fixture-banner" className="border border-amber-500 bg-amber-50 p-4 text-sm font-semibold">DPR19 B1 · isolated synthetic GET responses · actual SiteDashboard · no customer database</header>}
      <Dpr07EvidenceBanner />
        <Dpr10EvidenceBanner />
        <Dpr08EvidenceBanner />
        <Dpr09EvidenceBanner />
        <DprNullEvidenceBanner />
      {isDpr19B1Dashboard ? <SiteDashboard /> : isDpr18B3Details ? <DprDetails /> : isDpr20B4Report && window.location.pathname === "/fixture/dpr20-b4-hub" ? <DprSections initialId={24601} /> : window.location.pathname === "/fixture/dpr16-b3-activity" ? (
        <main className="mx-auto max-w-4xl space-y-4 p-6">
          <h1 className="text-xl font-semibold">DPR16 B3 · isolated synthetic activity summary</h1>
          <p>Fixture only; this uses the same read-only activity component as both report routes.</p>
          <DprActivityReadOnly index={0} item={{
            entryKey: "fixture-activity-1", activity: "Excavation", chainageFrom: "1.000", chainageTo: "1.200",
            side: "LHS", length: 200, width: 6, thickness: 0.5, layerNo: 2,
            quantity: 600, uom: "Cum", materialOutcome: "partly_reusable", reusableQty: 320,
            earthworkArrangementId: 13, boqItemId: 44, personnelIds: [7],
          }} boqItem={{ id: 44, itemCode: "BOQ-44", description: "Excavation", displayName: "Excavation", unit: "Cum" }} personnelNames="Ravi Kumar" />
        </main>
      ) : window.location.pathname.includes("dpr13") || window.location.pathname === "/site/new" || window.location.pathname === "/site/guided" ? <>
        <header className="border border-amber-500 bg-amber-50 p-4 mb-5">DPR-13 synthetic intercepted-backend fixture — actual production menu and section cards. No production data or writes.</header>
        <DprSections />
      </> : window.location.pathname.startsWith("/site/work/") ? <DprWorkEntry /> : isGuidedReport
        ? <FixtureSavedReport />
        : isSiteSuccess
          ? <SiteSuccess />
          : isSiteReport
            ? isDpr18B3Report || isDpr20B1Report || isDpr20B2Report || isDpr20B4Report || isLabour01 ? <SiteReport /> : <FixtureSubmittedReport />
            : isVehicleSupplierInline
              ? <VehicleSupplierInlineFixture />
              : isSiteMaterialTrips
                ? <SiteMaterialTrips />
                : isSiteMaterialsReceived
                  ? <SiteMaterialsReceived />
            : isGuided
              ? <GuidedDpr />
              : isPlantEquipmentUsage
                ? <PlantEquipmentUsage />
                : isEdit
                  ? new URLSearchParams(window.location.search).has("dpr16b2")
                    ? <SiteEdit />
                    : sessionStorage.getItem("dpr13-fixture-active") && !new URLSearchParams(window.location.search).has("dpr13Legacy") ? <DprEditEntry /> : <SiteEdit />
                  : <SiteEntry />}
    </QueryClientProvider>,
  );
};

window.addEventListener("popstate", mount);
mount();