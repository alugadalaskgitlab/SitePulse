import { dprSectionStates, DPR_SECTIONS, normalizeDprSectionContext, type DprSectionSnapshot } from "../../../shared/dprSections";

/** Isolated synthetic service, never imported by the application. */
export function installDpr13Adapter() {
  if (new URLSearchParams(window.location.search).has("dpr16")) sessionStorage.setItem("dpr16-fixture-active", "1");
  const dpr16 = sessionStorage.getItem("dpr16-fixture-active") === "1";
  if (window.location.pathname.includes("dpr13") || new URLSearchParams(window.location.search).has("dpr13Legacy") || dpr16) sessionStorage.setItem("dpr13-fixture-active", "1");
  if (!sessionStorage.getItem("dpr13-fixture-active")) return;
  const previousFetch = window.fetch.bind(window);
  const key = "dpr13-synthetic-canonical";
  let snapshot: DprSectionSnapshot | undefined = JSON.parse(localStorage.getItem(key) ?? "null") ?? undefined;
  // Preserve evidence through in-document success/back navigation; a full
  // Page.navigate still starts a fresh request trace for its loaded baseline.
  const requests: any[] = (window as any).__Dpr13Fixture?.requests ?? [];
  const receipts = new Map<string, { fingerprint: string; snapshot: DprSectionSnapshot }>();
  const fixture = {
    requests,
    conflictNext: false,
    chooseNext: false,
    failPhotoNext: false,
    loseNextReceipt: false,
    priorClosing: null as number | null,
    remoteChange() { if (snapshot) { snapshot.sectionTokens.equipment += "remote"; persist(); } },
    get snapshot() { return snapshot; },
    seed(value: DprSectionSnapshot) { snapshot = value; snapshot.sections = dprSectionStates(snapshot.dpr); persist(); },
    reset() { snapshot = undefined; localStorage.removeItem(key); requests.length = 0; },
  };
  (window as any).__Dpr13Fixture = fixture;
  const persist = () => { if (snapshot) localStorage.setItem(key, JSON.stringify(snapshot)); };
  const response = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
  window.fetch = async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, window.location.origin);
    // B1's isolated browser scenario needs a road-excavation BOQ item. Keep
    // the older fixture catalogue unchanged outside the explicit dpr16 route.
    if (dpr16 && /^\/api\/boq\/projects\/5501\/items$/.test(url.pathname) && (!init?.method || init.method === "GET")) {
      const original = await previousFetch(input, init);
      if (!original.ok) return original;
      const items = await original.json();
      return response([...items, {
        id: 8816, itemCode: "B1.1", itemName: "ROADWAY EXCAVATION",
        description: "Roadway excavation in cutting",
        displayName: "ROADWAY EXCAVATION", unit: "CUM",
        categoryName: "Road Work", planningWorkType: "road",
        dprMeasurementMethod: "geometry", includeInDpr: true,
      }]);
    }
    if (/^\/api\/equipment\/\d+\/latest-closing$/.test(url.pathname) && fixture.priorClosing != null) {
      requests.push({ method: "GET", path: url.pathname, search: url.search });
      return response({ closingReading: fixture.priorClosing, sourceDate: "2026-08-04", source: "dpr" });
    }
    if (url.pathname === "/api/uploads/request-url" && fixture.failPhotoNext) {
      fixture.failPhotoNext = false;
      return response({ message: "Synthetic photo upload failure — retry is expected" }, 500);
    }
    if (url.pathname === "/api/dprs" && init?.method === "POST") {
      const body = JSON.parse(String(init.body));
      requests.push({ method: "POST", path: url.pathname, body });
      snapshot = {
        dpr: { ...body, id: 1301 },
        context: normalizeDprSectionContext(body),
        headerToken: "created-h0",
        sectionTokens: { activity: "created-a0", equipment: "created-e0", labour: "created-l0", materials: "created-m0" },
        sections: dprSectionStates(body),
      };
      persist();
      return response({ ...snapshot.dpr, headerToken: snapshot.headerToken, sectionTokens: snapshot.sectionTokens }, 201);
    }
    if (/^\/api\/dprs\/1301(?:\/draft|\/submit)?$/.test(url.pathname)) {
      const method = init?.method ?? "GET";
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      requests.push({ method, path: url.pathname, body });
      if (!snapshot) return response({ message: "Synthetic legacy DPR missing" }, 404);
      if (method === "GET") return response({ ...snapshot.dpr, headerToken: snapshot.headerToken, sectionTokens: snapshot.sectionTokens });
      if (fixture.conflictNext || body.headerToken !== snapshot.headerToken || JSON.stringify(body.sectionTokens) !== JSON.stringify(snapshot.sectionTokens)) {
        fixture.conflictNext = false;
        return response({ message: "Synthetic stale legacy version; reload and review." }, 409);
      }
      if (url.pathname.endsWith("/submit")) {
        snapshot.dpr.dprStatus = "submitted"; persist();
        return response(snapshot.dpr);
      }
      const { headerToken, sectionTokens, ...data } = body;
      Object.assign(snapshot.dpr, data);
      for (const section of DPR_SECTIONS) snapshot.sectionTokens[section] += "legacy";
      snapshot.sections = dprSectionStates(snapshot.dpr);
      persist();
      return response({ ...snapshot.dpr, headerToken: snapshot.headerToken, sectionTokens: snapshot.sectionTokens });
    }
    if (!url.pathname.startsWith("/api/dpr-sections")) return previousFetch(input, init);
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    requests.push({ method, path: url.pathname, body });
    if (url.pathname.endsWith("/resolve")) {
      if (fixture.chooseNext) {
        fixture.chooseNext = false;
        return response({ kind: "choose", candidates: [1301, 1302].map(id => ({ ...body.context, id, engineer: "SYNTHETIC ENGINEER", lastEditedAt: "2026-08-05T09:00:00Z" })) });
      }
      return response(snapshot ? { kind: "existing", snapshot } : { kind: "new" });
    }
    if (method === "GET") return snapshot ? response(snapshot) : response({ message: "Synthetic DPR not found" }, 404);
    if (fixture.conflictNext) {
      fixture.conflictNext = false;
      return response({ message: "Synthetic concurrent change; explicitly reload and review." }, 409);
    }
    if (url.pathname.endsWith("/submit")) {
      if (!snapshot || JSON.stringify(body.sectionTokens) !== JSON.stringify(snapshot.sectionTokens)) return response({ message: "Stale review" }, 409);
      snapshot.dpr.dprStatus = "submitted";
      snapshot.headerToken += "s";
      persist();
      return response(snapshot);
    }
    const section = url.pathname.split("/").pop() as typeof DPR_SECTIONS[number];
    if (!DPR_SECTIONS.includes(section)) return response({ message: "Unknown synthetic section" }, 400);
    const fingerprint = JSON.stringify([section, body]);
    const receipt = receipts.get(body.clientKey);
    if (receipt) return receipt.fingerprint === fingerprint
      ? response(snapshot ?? receipt.snapshot) : response({ message: "Changed request cannot reuse a client key" }, 409);
    if (!snapshot) snapshot = {
      dpr: { id: 1301, ...body.context, engineer: body.data.engineer, dprStatus: "draft", progress: [], equipment: [], labour: [], materials: [], structureItems: [], cutFillConsumptions: [] },
      context: body.context,
      sectionTokens: { activity: "a0", equipment: "e0", labour: "l0", materials: "m0" },
      headerToken: "h0",
      sections: {} as DprSectionSnapshot["sections"],
    };
    Object.assign(snapshot.dpr, body.data);
    if (body.context?.boqProjectId != null && snapshot.context.boqProjectId == null) {
      snapshot.context = body.context;
      snapshot.dpr.boqProjectId = body.context.boqProjectId;
      snapshot.headerToken += "recovered";
    }
    for (const field of ["progress", "structureItems", "equipment", "labour", "materials", "sitePurchases"]) {
      if (!Array.isArray(body.data[field])) continue;
      snapshot.dpr[field] = body.data[field].map((row: any, index: number) => ({
        ...row, id: row.id ?? row.persistedId ?? 13000 + index, dprId: snapshot!.dpr.id,
        ...(row.activitySegments ? { activitySegments: row.activitySegments.map((segment: any, segmentIndex: number) => ({
          ...segment, id: segment.id ?? segment.persistedId ?? 14000 + segmentIndex,
          boqItems: segment.boqItems.map((item: any, itemIndex: number) => ({ ...item, id: item.id ?? item.persistedId ?? 15000 + itemIndex })),
        })) } : {}),
        ...(row.activityAllocations ? { activityAllocations: row.activityAllocations.map((allocation: any, allocationIndex: number) => ({
          ...allocation, id: allocation.id ?? allocation.persistedId ?? 16000 + allocationIndex,
        })) } : {}),
      }));
    }
    snapshot.sectionTokens[section] += "1";
    snapshot.sections = dprSectionStates(snapshot.dpr);
    persist();
    if (body.clientKey) receipts.set(body.clientKey, { fingerprint, snapshot: structuredClone(snapshot) });
    if (fixture.loseNextReceipt) {
      fixture.loseNextReceipt = false;
      throw new TypeError("Synthetic response lost after commit");
    }
    return response(snapshot);
  };
}