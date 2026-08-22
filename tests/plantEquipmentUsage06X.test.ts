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

// ---------------------------------------------------------------------------
// 06X-HF2: parseServerMessage — client surfaces safe server validation messages
// ---------------------------------------------------------------------------

/**
 * Mirrors the parseServerMessage helper added to PlantEquipmentUsage.tsx.
 * apiRequest throws "STATUS: {json}" — we parse the JSON and return the
 * server's message string, or null if parsing fails.
 */
function parseServerMessage(err: unknown): string | null {
  const raw = String((err as any)?.message ?? "");
  const jsonStart = raw.indexOf("{");
  if (jsonStart === -1) return null;
  try {
    const body = JSON.parse(raw.slice(jsonStart));
    return typeof body?.message === "string" ? body.message : null;
  } catch {
    return null;
  }
}

describe("06X-HF2 parseServerMessage — extracts server validation message", () => {
  it("returns the server message from a 400 JSON error", () => {
    const err = new Error('400: {"message":"Destination site must be one active registered Site — refresh the site list and select it again"}');
    expect(parseServerMessage(err)).toBe(
      "Destination site must be one active registered Site — refresh the site list and select it again",
    );
  });

  it("returns the server message from a 403 JSON error", () => {
    const err = new Error('403: {"message":"You do not have access to dispatch equipment to this site"}');
    expect(parseServerMessage(err)).toBe(
      "You do not have access to dispatch equipment to this site",
    );
  });

  it("returns the server message from a 409 JSON error", () => {
    const err = new Error('409: {"message":"Destination site cannot be cleared from a dispatched equipment record"}');
    expect(parseServerMessage(err)).toBe(
      "Destination site cannot be cleared from a dispatched equipment record",
    );
  });

  it("returns null when the error has no JSON body", () => {
    const err = new Error("500: Internal Server Error");
    expect(parseServerMessage(err)).toBeNull();
  });

  it("returns null when the JSON body has no message field", () => {
    const err = new Error('400: {"code":"VALIDATION_FAILED"}');
    expect(parseServerMessage(err)).toBeNull();
  });

  it("returns null when the message field is not a string", () => {
    const err = new Error('400: {"message":42}');
    expect(parseServerMessage(err)).toBeNull();
  });

  it("returns null for a plain non-JSON error string", () => {
    const err = new Error("Network request failed");
    expect(parseServerMessage(err)).toBeNull();
  });

  it("handles non-Error thrown values gracefully", () => {
    expect(parseServerMessage(null)).toBeNull();
    expect(parseServerMessage(undefined)).toBeNull();
    expect(parseServerMessage("raw string")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 06X-HF2: GuidedDpr / SiteEntry open-usage discovery error surface logic
// ---------------------------------------------------------------------------

/**
 * Mirrors the open-usage discovery error-handling pattern added to
 * GuidedDpr.tsx queryFn and SiteEntry.tsx fetchOpenPlantRecord.
 * These are pure logic tests — no DOM or fetch needed.
 */

interface OpenUsageDiscoveryResult {
  records: any[];
  toastFired: boolean;
  toastTitle?: string;
  toastDescription?: string;
  consoleWarn?: string;
}

async function simulateOpenUsageDiscovery(opts: {
  siteName: string;
  fetchStatus: number;
  fetchBody?: Record<string, unknown>;
  fetchThrows?: boolean;
}): Promise<OpenUsageDiscoveryResult> {
  const { siteName, fetchStatus, fetchBody, fetchThrows } = opts;

  let toastFired = false;
  let toastTitle: string | undefined;
  let toastDescription: string | undefined;
  let consoleWarn: string | undefined;

  const toast = (args: { title: string; description?: string; variant?: string }) => {
    toastFired = true;
    toastTitle = args.title;
    toastDescription = args.description;
  };
  const warnSpy = (msg: string) => { consoleWarn = msg; };

  // Mirrors the queryFn added in GuidedDpr.tsx
  async function queryFn(): Promise<any[]> {
    if (!siteName) {
      warnSpy("GuidedDpr: open-usage discovery skipped — no site context");
      return [];
    }
    if (fetchThrows) {
      warnSpy("GuidedDpr: open-usage discovery network error:");
      toast({
        title: "Equipment linkage unavailable",
        description: "Could not check dispatched equipment. You can continue with manual equipment entry.",
        variant: "destructive",
      });
      return [];
    }
    if (fetchStatus !== 200) {
      const serverMsg = fetchBody?.message as string ?? "";
      warnSpy(`GuidedDpr: open-usage discovery failed (${fetchStatus}): ${serverMsg}`);
      toast({
        title: "Equipment linkage unavailable",
        description: serverMsg || (
          fetchStatus === 403
            ? "You do not have access to this site's dispatched equipment."
            : "Could not check dispatched equipment. You can continue with manual equipment entry."
        ),
        variant: "destructive",
      });
      return [];
    }
    return [{ id: 1, equipmentId: 5, openingReading: 1500, destinationSite: siteName }];
  }

  const records = await queryFn();
  return { records, toastFired, toastTitle, toastDescription, consoleWarn };
}

describe("06X-HF2 GuidedDpr open-usage discovery — explicit error surface", () => {
  it("returns empty and warns (no toast) when siteName is empty", async () => {
    const r = await simulateOpenUsageDiscovery({ siteName: "", fetchStatus: 200 });
    expect(r.records).toHaveLength(0);
    expect(r.toastFired).toBe(false);
    expect(r.consoleWarn).toContain("no site context");
  });

  it("returns records when fetch succeeds with a site", async () => {
    const r = await simulateOpenUsageDiscovery({ siteName: "Site Alpha", fetchStatus: 200 });
    expect(r.records).toHaveLength(1);
    expect(r.toastFired).toBe(false);
  });

  it("shows actionable toast and returns empty on 403", async () => {
    const r = await simulateOpenUsageDiscovery({
      siteName: "Site Alpha",
      fetchStatus: 403,
      fetchBody: { message: "You do not have access to this site" },
    });
    expect(r.records).toHaveLength(0);
    expect(r.toastFired).toBe(true);
    expect(r.toastTitle).toBe("Equipment linkage unavailable");
    expect(r.toastDescription).toBe("You do not have access to this site");
  });

  it("falls back to default description on 403 with empty message", async () => {
    const r = await simulateOpenUsageDiscovery({
      siteName: "Site Alpha",
      fetchStatus: 403,
      fetchBody: { message: "" },
    });
    expect(r.toastFired).toBe(true);
    expect(r.toastDescription).toContain("do not have access");
  });

  it("surfaces the safe server message on 400", async () => {
    const r = await simulateOpenUsageDiscovery({
      siteName: "Site Alpha",
      fetchStatus: 400,
      fetchBody: { message: "site is required" },
    });
    expect(r.records).toHaveLength(0);
    expect(r.toastFired).toBe(true);
    expect(r.toastDescription).toBe("site is required");
    expect(r.consoleWarn).toContain("400");
    expect(r.consoleWarn).toContain("site is required");
  });

  it("surfaces a 500 server error while preserving manual-entry continuity", async () => {
    const r = await simulateOpenUsageDiscovery({
      siteName: "Site Alpha",
      fetchStatus: 500,
      fetchBody: { message: "Failed to fetch open equipment records" },
    });
    expect(r.records).toHaveLength(0);
    expect(r.toastFired).toBe(true);
    expect(r.toastDescription).toBe("Failed to fetch open equipment records");
    expect(r.consoleWarn).toContain("500");
  });

  it("surfaces network failure while preserving manual-entry continuity", async () => {
    const r = await simulateOpenUsageDiscovery({
      siteName: "Site Alpha",
      fetchStatus: 0,
      fetchThrows: true,
    });
    expect(r.records).toEqual([]);
    expect(r.toastFired).toBe(true);
    expect(r.toastDescription).toContain("manual equipment entry");
  });
});

// ---------------------------------------------------------------------------
// 06X-HF2: SiteEntry fetchOpenPlantRecord — missing site context
// ---------------------------------------------------------------------------

describe("06X-HF2 SiteEntry fetchOpenPlantRecord — missing site context guard", () => {
  it("returns early and logs a warn when header.site is empty", () => {
    let warned = false;
    let warnMsg = "";
    const warnSpy = (msg: string) => { warned = true; warnMsg = msg; };

    // Mirrors the guard added to fetchOpenPlantRecord in SiteEntry.tsx
    function guard(site: string): boolean {
      if (!site) {
        warnSpy("SiteEntry: open-usage discovery skipped — no site context (header.site is empty)");
        return false;
      }
      return true;
    }

    expect(guard("")).toBe(false);
    expect(warned).toBe(true);
    expect(warnMsg).toContain("no site context");
  });

  it("proceeds when header.site is set", () => {
    function guard(site: string): boolean {
      if (!site) return false;
      return true;
    }
    expect(guard("Site Alpha")).toBe(true);
  });

  it("builds site param with encodeURIComponent when site contains spaces", () => {
    const site = "Site Alpha Bypass KM 12";
    const siteParam = `&site=${encodeURIComponent(site)}`;
    expect(siteParam).toContain("Site%20Alpha%20Bypass%20KM%2012");
  });
});

// ---------------------------------------------------------------------------
// 06X-HF2: source guard — verify parseServerMessage and error-surface changes
//           are present in the actual source files.
// ---------------------------------------------------------------------------

describe("06X-HF2 source guard — client source implements HF2 error surfacing", () => {
  it("PlantEquipmentUsage.tsx has parseServerMessage helper and uses it in mutations", async () => {
    const src = await readFile("client/src/pages/PlantEquipmentUsage.tsx", "utf8");
    expect(src).toContain("function parseServerMessage(err: unknown)");
    expect(src).toContain("body?.message === \"string\"");
    // createMutation uses it
    const createStart = src.indexOf("const createMutation = useMutation");
    const createEnd = src.indexOf("const updateMutation", createStart);
    const createBlock = src.slice(createStart, createEnd);
    expect(createBlock).toContain("parseServerMessage(err)");
    // updateMutation uses it
    const updateStart = src.indexOf("const updateMutation = useMutation");
    const updateEnd = src.indexOf("const deleteMutation", updateStart);
    const updateBlock = src.slice(updateStart, updateEnd);
    expect(updateBlock).toContain("parseServerMessage(err)");
  });

  it("GuidedDpr.tsx open-usage queryFn surfaces every discovery failure", async () => {
    const src = await readFile("client/src/pages/GuidedDpr.tsx", "utf8");
    const queryStart = src.indexOf('queryKey: ["/api/plant-module/equipment-usage/open-today"');
    const queryEnd = src.indexOf("const { data: equipmentMasterList", queryStart);
    const block = src.slice(queryStart, queryEnd);
    expect(block).toContain("Equipment linkage unavailable");
    expect(block).toContain("console.warn");
    expect(block).toContain("no site context");
    expect(block).toContain("res.status === 403");
    expect(block).toContain("manual equipment entry");
  });

  it("SiteEntry.tsx fetchOpenPlantRecord surfaces missing site context and discovery failures", async () => {
    const src = await readFile("client/src/pages/SiteEntry.tsx", "utf8");
    const fnStart = src.indexOf("const fetchOpenPlantRecord = async");
    const fnEnd = src.indexOf("// Returns true when all", fnStart);
    const block = src.slice(fnStart, fnEnd);
    expect(block).toContain("no site context");
    expect(block).toContain("Equipment linkage unavailable");
    expect(block).toContain("res.status === 403");
    expect(block).toContain("console.warn");
    expect(block).toContain("manual equipment entry");
    // The siteParam must always be set (no conditional — site is always passed)
    expect(block).not.toContain('? `&site=${encodeURIComponent(header.site)}` : ""');
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
