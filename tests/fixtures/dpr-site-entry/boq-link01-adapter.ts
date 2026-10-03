// Isolated real-screen fixture only. Never imported by the application build.
export function installBoqLink01Adapter() {
  const params = new URLSearchParams(location.search);
  if (!params.has("boqlink01")) return;
  const next = window.fetch.bind(window);
  const scenario = params.get("boqcase") || "B";
  const storageKey = `boq-link01-fixture-${scenario}`;
  const requests: Array<{ method: string; path: string; body: any }> = [];
  let draft: any = null;
  const progress = (itemId = 8801, barId = 9901) => ({
    id: 99101 + itemId, entryKey: `boq-link01-${itemId}`, activity: itemId === 8801 ? "GSB LAYING" : "CLEARING AND GRUBBING ROAD",
    boqItemId: itemId, programmeBarId: barId, noSiteWork: false, isIncidental: false,
    side: "LHS", chainageFrom: "0+000", chainageTo: "0+010", length: 10,
    width: 4, thickness: null, quantity: 40, uom: "SQM", quantitySource: "calculated",
    quantitySourceNote: "", chainageOverrideReason: "", executedBy: "hlc", layerNo: null,
    personnelIds: [],
  });
  const generalMachine = { id: 97601, machine: "JCB 3DX", equipmentId: 7701, vehicleNo: "FIX-JCB-01",
    operator: "FIXTURE OPERATOR", task: "", entryType: "time_meter", startTime: "08:00", endTime: "12:00",
    openingReading: 390, closingReading: 394, hoursWorked: 4, diesel: 0,
    dieselSource: "contractor", usageStatus: "working", activitySegments: [], activityAllocations: [],
    boqItemId: null, resourceScope: null };
  (window as any).__BoqLinkFixture = { scenario, requests, get draft() { return draft; },
    reset() { sessionStorage.removeItem(storageKey); } };
  const json = (value: any) => new Response(JSON.stringify(value), { status: 200, headers: { "Content-Type": "application/json" } });
  window.fetch = async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input instanceof Request ? input.url : String(input), location.origin);
    const method = init?.method || (input instanceof Request ? input.method : "GET");
    if (url.pathname.endsWith("/plan-vs-actual") && method === "GET") {
      const rows = await (await next(input, init)).json();
      return json(rows.map((row: any) => ({ ...row, conversionWarnings: row.conversionWarnings ?? [] })));
    }
    if (url.pathname === "/api/dprs/6351" && method === "GET") {
      if (!draft) {
        const base = await (await next(input, init)).json();
        const saved = sessionStorage.getItem(storageKey);
        draft = saved ? JSON.parse(saved) : {
          ...base, id: 6351, site: "NARASIMHULU ROAD", date: "2026-08-05", engineer: "SURESH KUMAR",
          workType: "road", boqProjectId: 5501, dprStatus: "draft",
          progress: scenario === "no-work" ? [{ ...progress(), boqItemId: null, programmeBarId: null,
            noSiteWork: true, noSiteWorkDescription: "Fixture rain day", quantity: null }] :
            scenario === "C" ? [progress(), progress(8803, 9902)] : [progress()],
          equipment: scenario.startsWith("G") || scenario === "no-work" ? [generalMachine] : [],
          labour: [], materials: [], sitePurchases: [], structureItems: [], cutFillConsumptions: [],
          remarks: "BOQ-LINK-01 isolated synthetic fixture. No real database writes.",
        };
      }
      return json(draft);
    }
    if (/^\/api\/dprs\/6351(?:\/draft|\/submit|\/version)?$/.test(url.pathname) && method !== "GET") {
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      requests.push({ method, path: url.pathname, body });
      draft = { ...draft, ...body, id: 6351,
        dprStatus: url.pathname.endsWith("/submit") ? "submitted" : "draft" };
      for (const section of ["equipment", "labour", "materials"]) {
        draft[section] = (draft[section] || []).map((row: any, i: number) => ({
          ...row, id: row.persistedId ?? row.id ?? 97610 + i, resourceScope: row.resourceScope ?? null,
        }));
      }
      sessionStorage.setItem(storageKey, JSON.stringify(draft));
      return json(draft);
    }
    return next(input, init);
  };
}