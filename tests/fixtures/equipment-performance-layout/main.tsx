import { createRoot } from "react-dom/client";
import { useState } from "react";
import App from "../../../client/src/App";
import { Button } from "../../../client/src/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "../../../client/src/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../client/src/components/ui/select";
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

const dailyRows = Array.from({ length: 18 }, (_, index) => ({
  ...dailyRow,
  key: `plant_usage:${9001 + index}`,
  date: `2026-01-${String(index + 2).padStart(2, "0")}`,
  openingMeter: 120 + index * 6,
  closingMeter: 126 + index * 6,
  projectSite: index % 2 ? "Fixture Highway / Site B" : "Fixture Road / Site A",
}));

const sourceEvents = dailyRows.map((row, index) => ({
  key: `plant_usage:${9001 + index}`,
  date: row.date,
  projectId: 9001,
  project: index % 2 ? "Fixture Highway" : "Fixture Road",
  scope: "plant" as const,
  site: index % 2 ? "Site B" : "Site A",
  plant: "Fixture HMP",
  equipmentId: 9001,
  machine: "Fixture Excavator",
  equipmentType: "Excavator",
  ownership: "owned",
  task: `Fixture source record ${index + 1}`,
  openingReading: row.openingMeter,
  closingReading: row.closingMeter,
  startTime: row.startTime,
  endTime: row.endTime,
  trips: null,
  usageBasis: "hour_meter" as const,
  usageValue: 6,
  runtimeHours: 6,
  totalKm: null,
  dieselIssued: 42,
  openingTank: 80,
  closingTank: 38,
  clockDuration: 6,
  dieselActual: 42,
  dieselBasis: "tank_measured" as const,
  dieselExpected: 30,
  dieselVariance: 12,
  actualConsumptionRate: 7,
  dieselEfficiencyUnit: "L/hr" as const,
  efficiencyPercent: 71.4,
  operator: "Fixture Operator",
  source: "plant_usage" as const,
  link: "linked" as const,
  reference: { dprId: null, equipmentLogId: null, plantUsageId: 9001 + index },
  notes: null,
  breakdownNotes: [],
  confidence: "linked" as const,
  suggestions: [],
}));

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
  reviewRows: [{
    logId: 9701,
    date: "2025-12-03",
    machine: "",
    project: "Accessible Historic Project",
    site: "Historic Site",
    usageValue: 7.5,
    source: "dpr_log" as const,
    dprId: 8801,
    suggestions: [],
    reason: "missing_name" as const,
    evidence: {
      vehicleNo: "RAW-CHILD-9701",
      openingReading: 42,
      closingReading: 49.5,
      startTime: "08:00",
      endTime: "15:30",
      numberOfTrips: null,
      tripDistance: null,
      diesel: 38,
      openingDiesel: 84,
      dieselBalanceInTank: 46,
      dieselBalanceConfirmed: true,
      dieselSource: "Opening/closing tank readings",
      task: "Loading reclaimed material",
      operator: "Review Agent",
      notes: ["Hydraulic hose inspection recorded"],
      activityAllocationCount: 2,
      activitySegmentCount: 1,
      breakdownCount: 1,
    },
  }],
  events: sourceEvents,
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
    dailyRows,
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

function AcceptanceHarness() {
  const [enabled] = useState(() => new URLSearchParams(window.location.search).has("acceptanceHarness"));
  const [outerOpen, setOuterOpen] = useState(false);
  const [innerOpen, setInnerOpen] = useState(false);
  if (!enabled) return null;
  return (
    <div className="fixed bottom-3 right-3 z-30">
      <Dialog open={outerOpen} onOpenChange={setOuterOpen}>
        <DialogTrigger asChild><Button data-testid="harness-open-outer">Open overlay harness</Button></DialogTrigger>
        <DialogContent data-testid="harness-outer-dialog">
          <DialogTitle>Shared overlay acceptance harness</DialogTitle>
          <a href="#outside" data-testid="harness-first-focus">First focus target</a>
          <Select>
            <SelectTrigger data-testid="harness-select"><SelectValue placeholder="Choose equipment" /></SelectTrigger>
            <SelectContent data-testid="harness-select-content">
              <SelectItem value="excavator">Excavator</SelectItem>
              <SelectItem value="tanker">Tanker</SelectItem>
            </SelectContent>
          </Select>
          <Dialog open={innerOpen} onOpenChange={setInnerOpen}>
            <DialogTrigger asChild><Button data-testid="harness-open-inner">Open nested dialog</Button></DialogTrigger>
            <DialogContent data-testid="harness-inner-dialog">
              <DialogTitle>Nested equipment check</DialogTitle>
              <input data-testid="harness-inner-input" aria-label="Nested equipment note" />
              <Button data-testid="harness-inner-action">Confirm nested check</Button>
            </DialogContent>
          </Dialog>
        </DialogContent>
      </Dialog>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<><App /><AcceptanceHarness /></>);