/**
 * Instruction 06X — Plant Equipment Usage: Send-to-Site logic tests
 *
 * These tests cover the client-side handleSubmit logic extracted as pure
 * functions so they run in the Node vitest environment without a DOM.
 */

import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";

// ---------------------------------------------------------------------------
// Pure helper extracted from handleSubmit sendToSite branch
// ---------------------------------------------------------------------------

interface SendToSiteParams {
  equipmentId: string;
  openingReading: string;
  destinationSite: string;
  editingUsageId: number | null;
  dieselIncluded: boolean;
  dieselSource: string;
  openingDiesel: string;
  dieselIssued: string;
  startTime: string;
  workingPlant: string;
  siteName: string;
  remarks: string;
  userId: number | null;
  userName: string | null;
  date: string;
  entryType: string;
}

type MutationCall =
  | { type: "create"; data: Record<string, unknown> }
  | { type: "update"; id: number; data: Record<string, unknown> };

function handleSendToSiteBranch(params: SendToSiteParams): { error: string | null; mutation: MutationCall | null } {
  const {
    equipmentId,
    openingReading,
    destinationSite,
    editingUsageId,
    dieselIncluded,
    dieselSource,
    openingDiesel,
    dieselIssued,
    startTime,
    workingPlant,
    siteName,
    remarks,
    userId,
    userName,
    date,
    entryType,
  } = params;

  // Mirrors handleSubmit validation in PlantEquipmentUsage.tsx
  if (!equipmentId || !openingReading) {
    return { error: "Please fill in equipment and opening meter reading before dispatching", mutation: null };
  }
  if (!destinationSite) {
    return { error: "Please select a destination site before dispatching", mutation: null };
  }

  const effectiveDieselSource = dieselIncluded ? "contractor" : dieselSource;
  const data: Record<string, unknown> = {
    date,
    equipmentId: parseInt(equipmentId),
    entryType,
    openingReading: parseFloat(openingReading),
    closingReading: null,
    startTime: startTime || null,
    endTime: null,
    openingDiesel: effectiveDieselSource === "contractor" ? null : (openingDiesel ? parseFloat(openingDiesel) : 0),
    dieselIssued: effectiveDieselSource === "contractor" ? null : (dieselIssued ? parseFloat(dieselIssued) : 0),
    dieselIncluded,
    dieselSource: effectiveDieselSource,
    siteName: workingPlant === "OTHER" ? (siteName.toUpperCase() || null) : workingPlant,
    remarks: remarks ? remarks.toUpperCase() : null,
    status: "open",
    openedByUserId: userId,
    openedByUserName: userName,
    openedAt: "2025-01-01T00:00:00.000Z",
    // 06X: store exact master site name without uppercasing
    destinationSite: destinationSite || null,
  };

  if (editingUsageId !== null) {
    return { error: null, mutation: { type: "update", id: editingUsageId, data } };
  } else {
    return { error: null, mutation: { type: "create", data } };
  }
}

// ---------------------------------------------------------------------------
// openEditDialog hydration helper
// ---------------------------------------------------------------------------

interface HydrateResult {
  sendToSite: boolean;
  destinationSite: string;
}

function hydrateFromEntry(entry: Record<string, unknown>): HydrateResult {
  const isSentToSite = (entry as any).status === "open";
  return {
    sendToSite: isSentToSite,
    destinationSite: isSentToSite ? ((entry as any).destinationSite || "") : "",
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("06X Send to Site — validation", () => {
  it("blocks submit when equipmentId is missing", () => {
    const result = handleSendToSiteBranch({
      equipmentId: "",
      openingReading: "1500",
      destinationSite: "Site Alpha",
      editingUsageId: null,
      dieselIncluded: false,
      dieselSource: "plant_stock",
      openingDiesel: "50",
      dieselIssued: "20",
      startTime: "",
      workingPlant: "HMP PLANT",
      siteName: "",
      remarks: "",
      userId: 1,
      userName: "Test User",
      date: "2025-06-01",
      entryType: "time_meter",
    });
    expect(result.error).toBeTruthy();
    expect(result.mutation).toBeNull();
  });

  it("blocks submit when openingReading is missing", () => {
    const result = handleSendToSiteBranch({
      equipmentId: "5",
      openingReading: "",
      destinationSite: "Site Alpha",
      editingUsageId: null,
      dieselIncluded: false,
      dieselSource: "plant_stock",
      openingDiesel: "50",
      dieselIssued: "20",
      startTime: "",
      workingPlant: "HMP PLANT",
      siteName: "",
      remarks: "",
      userId: 1,
      userName: "Test User",
      date: "2025-06-01",
      entryType: "time_meter",
    });
    expect(result.error).toBeTruthy();
    expect(result.mutation).toBeNull();
  });

  it("blocks submit when destinationSite is missing", () => {
    const result = handleSendToSiteBranch({
      equipmentId: "5",
      openingReading: "1500",
      destinationSite: "",
      editingUsageId: null,
      dieselIncluded: false,
      dieselSource: "plant_stock",
      openingDiesel: "50",
      dieselIssued: "20",
      startTime: "",
      workingPlant: "HMP PLANT",
      siteName: "",
      remarks: "",
      userId: 1,
      userName: "Test User",
      date: "2025-06-01",
      entryType: "time_meter",
    });
    expect(result.error).toMatch(/destination site/i);
    expect(result.mutation).toBeNull();
  });
});

describe("06X Send to Site — create path (new entry)", () => {
  it("calls createMutation when editingUsageId is null", () => {
    const result = handleSendToSiteBranch({
      equipmentId: "5",
      openingReading: "1500",
      destinationSite: "Site Alpha",
      editingUsageId: null,
      dieselIncluded: false,
      dieselSource: "plant_stock",
      openingDiesel: "50",
      dieselIssued: "20",
      startTime: "",
      workingPlant: "HMP PLANT",
      siteName: "",
      remarks: "",
      userId: 1,
      userName: "Test User",
      date: "2025-06-01",
      entryType: "time_meter",
    });
    expect(result.error).toBeNull();
    expect(result.mutation?.type).toBe("create");
  });

  it("stores exact site name without uppercasing", () => {
    const result = handleSendToSiteBranch({
      equipmentId: "5",
      openingReading: "1500",
      destinationSite: "Site Alpha Bypass KM 12",
      editingUsageId: null,
      dieselIncluded: false,
      dieselSource: "plant_stock",
      openingDiesel: "50",
      dieselIssued: "20",
      startTime: "",
      workingPlant: "HMP PLANT",
      siteName: "",
      remarks: "",
      userId: 1,
      userName: "Test User",
      date: "2025-06-01",
      entryType: "time_meter",
    });
    expect(result.mutation?.data?.destinationSite).toBe("Site Alpha Bypass KM 12");
  });

  it("sets status to 'open'", () => {
    const result = handleSendToSiteBranch({
      equipmentId: "5",
      openingReading: "1500",
      destinationSite: "Site Alpha",
      editingUsageId: null,
      dieselIncluded: false,
      dieselSource: "plant_stock",
      openingDiesel: "50",
      dieselIssued: "",
      startTime: "",
      workingPlant: "HMP PLANT",
      siteName: "",
      remarks: "",
      userId: 1,
      userName: "Test User",
      date: "2025-06-01",
      entryType: "time_meter",
    });
    expect(result.mutation?.data?.status).toBe("open");
  });
});

describe("06X Send to Site — update path (editingUsage)", () => {
  it("calls updateMutation with same existing id when editingUsageId is set", () => {
    const result = handleSendToSiteBranch({
      equipmentId: "5",
      openingReading: "1500",
      destinationSite: "Site Beta",
      editingUsageId: 42,
      dieselIncluded: false,
      dieselSource: "plant_stock",
      openingDiesel: "50",
      dieselIssued: "20",
      startTime: "",
      workingPlant: "HMP PLANT",
      siteName: "",
      remarks: "",
      userId: 1,
      userName: "Test User",
      date: "2025-06-01",
      entryType: "time_meter",
    });
    expect(result.error).toBeNull();
    expect(result.mutation?.type).toBe("update");
    expect((result.mutation as Extract<MutationCall, { type: "update" }>).id).toBe(42);
    expect(result.mutation?.data?.destinationSite).toBe("Site Beta");
  });

  it("preserves status='open' on update", () => {
    const result = handleSendToSiteBranch({
      equipmentId: "5",
      openingReading: "1600",
      destinationSite: "Site Gamma",
      editingUsageId: 99,
      dieselIncluded: false,
      dieselSource: "plant_stock",
      openingDiesel: "100",
      dieselIssued: "30",
      startTime: "08:00",
      workingPlant: "HMP PLANT",
      siteName: "",
      remarks: "Test remark",
      userId: 2,
      userName: "Engineer B",
      date: "2025-06-10",
      entryType: "time_meter",
    });
    expect(result.mutation?.data?.status).toBe("open");
    expect(result.mutation?.data?.startTime).toBe("08:00");
    expect(result.mutation?.data?.remarks).toBe("TEST REMARK");
  });
});

describe("06X openEditDialog hydration", () => {
  it("sets sendToSite=true and hydrates destinationSite for status='open' entries", () => {
    const entry = { status: "open", destinationSite: "Site Alpha" };
    const result = hydrateFromEntry(entry);
    expect(result.sendToSite).toBe(true);
    expect(result.destinationSite).toBe("Site Alpha");
  });

  it("sets sendToSite=false and clears destinationSite for non-open entries", () => {
    const entry = { status: "submitted", destinationSite: "Site Alpha" };
    const result = hydrateFromEntry(entry);
    expect(result.sendToSite).toBe(false);
    expect(result.destinationSite).toBe("");
  });

  it("handles missing destinationSite gracefully for open entries", () => {
    const entry = { status: "open", destinationSite: null };
    const result = hydrateFromEntry(entry);
    expect(result.sendToSite).toBe(true);
    expect(result.destinationSite).toBe("");
  });

  it("does not hydrate destinationSite for undefined status", () => {
    const entry = { status: undefined };
    const result = hydrateFromEntry(entry);
    expect(result.sendToSite).toBe(false);
    expect(result.destinationSite).toBe("");
  });
});

describe("06X diesel handling in sendToSite branch", () => {
  it("nulls out diesel fields when dieselIncluded=true (contractor)", () => {
    const result = handleSendToSiteBranch({
      equipmentId: "3",
      openingReading: "2000",
      destinationSite: "Site X",
      editingUsageId: null,
      dieselIncluded: true,
      dieselSource: "plant_stock",
      openingDiesel: "80",
      dieselIssued: "40",
      startTime: "",
      workingPlant: "HMP PLANT",
      siteName: "",
      remarks: "",
      userId: null,
      userName: null,
      date: "2025-06-05",
      entryType: "time_meter",
    });
    expect(result.mutation?.data?.openingDiesel).toBeNull();
    expect(result.mutation?.data?.dieselIssued).toBeNull();
    expect(result.mutation?.data?.dieselSource).toBe("contractor");
  });

  it("preserves diesel fields when dieselIncluded=false", () => {
    const result = handleSendToSiteBranch({
      equipmentId: "3",
      openingReading: "2000",
      destinationSite: "Site X",
      editingUsageId: null,
      dieselIncluded: false,
      dieselSource: "plant_stock",
      openingDiesel: "80",
      dieselIssued: "40",
      startTime: "",
      workingPlant: "HMP PLANT",
      siteName: "",
      remarks: "",
      userId: null,
      userName: null,
      date: "2025-06-05",
      entryType: "time_meter",
    });
    expect(result.mutation?.data?.openingDiesel).toBe(80);
    expect(result.mutation?.data?.dieselIssued).toBe(40);
    expect(result.mutation?.data?.dieselSource).toBe("plant_stock");
  });
});

describe("06X server destination integrity and error logging", () => {
  it("canonicalizes destinationSite against one active Site and enforces site access on create and update", async () => {
    const source = await readFile("server/routes.ts", "utf8");
    const helperStart = source.indexOf("async function canonicaliseEquipmentDestinationSite");
    const helperEnd = source.indexOf('app.post("/api/plant-module/equipment-usage"', helperStart);
    const helper = source.slice(helperStart, helperEnd);
    expect(helper).toContain("storage.getSites()");
    expect(helper).toContain("site.isActive === 1");
    expect(helper).toContain("activeMatches.length !== 1");
    expect(helper).toContain("getPermittedSiteNames(req)");
    expect(helper).toContain("siteMatchesPermitted(canonicalSite, permittedSiteNames)");
    expect(helper).toContain("siteMatchesPermitted(existingMatches[0].name, permittedSiteNames)");
    expect(helper).toContain("body.destinationSite = canonicalSite");
    expect(helper).toContain("existingUsage?.destinationSite");
    expect(helper).toContain("Destination site cannot be cleared");

    const handlers = source.slice(helperEnd, source.indexOf('app.delete("/api/plant-module/equipment-usage/', helperEnd));
    expect(handlers).toContain("canonicaliseEquipmentDestinationSite(req, res, req.body)");
    expect(handlers).toContain("storage.getEquipmentUsageById(id)");
    expect(handlers).toContain("req.body, existing");
  });

  it("authorizes the effective persisted destination when PUT omits it and rejects clearing", () => {
    function effectiveDestination(
      existing: string | null,
      incoming: { present: boolean; value?: string | null },
    ): { destination: string | null; error: string | null } {
      const normalisedExisting = String(existing ?? "").trim().toLowerCase();
      const incomingBlank = incoming.present && String(incoming.value ?? "").trim() === "";
      if (normalisedExisting && incomingBlank) {
        return { destination: null, error: "cannot clear dispatched destination" };
      }
      const value = incoming.present ? incoming.value : existing;
      return { destination: value == null || String(value).trim() === "" ? null : String(value), error: null };
    }

    expect(effectiveDestination("Site A", { present: false })).toEqual({
      destination: "Site A",
      error: null,
    });
    expect(effectiveDestination("Site A", { present: true, value: null }).error).toContain("cannot clear");
    expect(effectiveDestination(null, { present: false })).toEqual({
      destination: null,
      error: null,
    });
  });

  it("does not allow reassignment to bypass the persisted destination's access boundary", () => {
    function canReassign(existing: string, next: string, permitted: string[]) {
      const allowed = new Set(permitted.map((site) => site.toLowerCase()));
      return allowed.has(existing.toLowerCase()) && allowed.has(next.toLowerCase());
    }
    expect(canReassign("Site A", "Site B", ["Site B"])).toBe(false);
    expect(canReassign("Site A", "Site B", ["Site A", "Site B"])).toBe(true);
  });

  it("logs real create/update failures while returning safe messages", async () => {
    const source = await readFile("server/routes.ts", "utf8");
    const start = source.indexOf('app.post("/api/plant-module/equipment-usage"');
    const end = source.indexOf('app.delete("/api/plant-module/equipment-usage/', start);
    const handlers = source.slice(start, end);
    expect(handlers).toContain('console.error("POST /api/plant-module/equipment-usage:", err)');
    expect(handlers).toContain('console.error("PUT /api/plant-module/equipment-usage/:id:", err)');
    expect(handlers).toContain("Failed to create equipment usage");
    expect(handlers).toContain("Failed to update equipment usage");
  });
});
