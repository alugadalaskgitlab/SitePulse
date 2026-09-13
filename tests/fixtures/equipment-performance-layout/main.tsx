import { createRoot } from "react-dom/client";
import App from "../../../client/src/App";
import "../../../client/src/index.css";

const authPayload = {
  user: {
    id: 9001,
    email: "equip09-fixture@example.invalid",
    fullName: "EQUIP-09 Layout Fixture",
    isAdmin: true,
    isOwner: true,
    isActive: true,
    isFieldEngineer: false,
    sessionPolicy: "sticky" as const,
    canManagePermissions: true,
    permissionManagerScope: "full" as const,
  },
  permissions: {},
};

const dailyRow = {
  key: "plant_usage:9001",
  date: "2026-01-02",
  projectSite: "Fixture Road / Site A",
  openingMeter: 120,
  closingMeter: 126,
  workingHours: 6,
  workingHoursIncomplete: false,
  startTime: "08:00",
  endTime: "14:00",
  multipleTimeSegments: false,
  clockDuration: 6,
  clockDurationIncomplete: false,
  dieselIssued: 42,
  openingTank: 80,
  closingTank: 38,
  dieselConsumed: 42,
  expectedDiesel: 30,
  difference: 12,
  consumptionRate: 7,
  consumptionRateUnit: "L/hr" as const,
  consumptionIncomplete: false,
  events: [],
};

const report = {
  filterOptions: {
    projects: [{ id: 9001, name: "Fixture Road" }],
    ownership: ["hired", "owned"],
    owners: ["HLC / OWNED", "Narasimulu"],
    equipmentTypes: ["Excavator", "Tanker"],
    equipment: [{
      id: 9001,
      name: "Fixture Excavator",
      registrationNumber: "FIX-09",
      ownership: "owned",
      vendorName: null,
      meterType: "hour_meter",
    }],
    scopes: [
      { value: "site" as const, label: "Site / road operations" },
      { value: "plant" as const, label: "Plant / HMP / RMC operations" },
    ],
  },
  totals: {
    eventCount: 1,
    linkedCount: 1,
    confirmedLegacyCount: 0,
    unclassifiedCount: 0,
    runtimeHours: 6,
    totalKm: 0,
    trips: 0,
    dieselActual: 42,
    dieselExpected: 30,
    dieselVariance: 12,
    activeDays: 1,
    efficiencyPercent: 71.4,
    dieselBasis: "tank_measured" as const,
    dieselComparedActual: 42,
    dieselComparisonIncomplete: false,
  },
  reviewRows: [],
  events: [],
  fleet: [{
    key: "equipment:9001",
    equipmentId: 9001,
    machine: "Fixture Excavator",
    registrationNumber: "FIX-09",
    equipmentType: "Excavator",
    ownership: "owned",
    confidence: "linked" as const,
    usageBasis: "hour_meter" as const,
    currentLocation: "Site A",
    currentStatus: "active",
    firstIncludedDate: "2026-01-02",
    lastUsedDate: "2026-01-02",
    eventCount: 1,
    activeDays: 1,
    runtimeHours: 6,
    totalKm: 0,
    trips: 0,
    dieselActual: 42,
    dieselBasis: "tank_measured" as const,
    dieselComparedActual: 42,
    dieselComparisonIncomplete: false,
    dieselExpected: 30,
    dieselVariance: 12,
    efficiencyPercent: 71.4,
    dataQualityWarnings: [],
    owned: { daysSinceLastUse: 0 },
    ownerVendor: "HLC / OWNED",
    meterUnit: "h" as const,
    openingMeter: 120,
    closingMeter: 126,
    workingHours: 6,
    workingHoursIncomplete: false,
    clockDuration: 6,
    clockDurationIncomplete: false,
    dieselIssued: 42,
    openingTank: 80,
    closingTank: 38,
    dieselConsumed: 42,
    expectedDiesel: 30,
    difference: 12,
    consumptionRate: 7,
    consumptionRateUnit: "L/hr" as const,
    consumptionIncomplete: false,
    dailyRows: [dailyRow],
  }],
  projects: [{
    projectId: 9001,
    project: "Fixture Road",
    historyFrom: "2026-01-02",
    eventCount: 1,
    linkedCount: 1,
    confirmedLegacyCount: 0,
    unclassifiedCount: 0,
    runtimeHours: 6,
    totalKm: 0,
    trips: 0,
    dieselActual: 42,
    dieselComparedActual: 42,
    dieselComparisonIncomplete: false,
    dieselExpected: 30,
  }],
};

function json(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

const originalFetch = window.fetch.bind(window);
window.fetch = async (input, init) => {
  const url = typeof input === "string" ? input : input.url;
  const pathname = new URL(url, window.location.origin).pathname;
  if (pathname === "/api/auth/me") return json(authPayload);
  if (pathname === "/api/config") {
    return json({
      rmcEnabled: false,
      companyName: "Fixture Company",
      companyShortName: "FIX",
      appTagline: "Layout fixture",
      logoFile: "sitepulse-logo.png",
      licensedModules: [],
    });
  }
  if (pathname === "/api/reports/equipment-performance") return json(report);
  if (pathname === "/api/admin/site-backfill/unassigned") return json({ dieselRequirements: [], purchaseIndents: [] });
  if (pathname === "/api/edit-requests/pending") return json([]);
  if (pathname === "/api/irn") return json([]);
  if (pathname === "/api/notifications") return json([]);
  if (pathname === "/api/notifications/unread-count") return json({ count: 0 });
  void init;
  // Keep this fixture isolated from every production API/database.
  if (pathname.startsWith("/api/")) return json([]);
  return originalFetch(input, init);
};

sessionStorage.setItem("sp_splash_shown", "1");
createRoot(document.getElementById("root")!).render(<App />);