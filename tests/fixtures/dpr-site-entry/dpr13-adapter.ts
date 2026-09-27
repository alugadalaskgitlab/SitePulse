import { dprSectionStates, DPR_SECTIONS, type DprSectionSnapshot } from "../../../shared/dprSections";

/** Isolated synthetic service, never imported by the application. */
export function installDpr13Adapter() {
  if (!window.location.pathname.includes("dpr13") && !new URLSearchParams(window.location.search).has("dpr13Legacy")) return;
  const previousFetch = window.fetch.bind(window);
  const key = "dpr13-synthetic-canonical";
  let snapshot: DprSectionSnapshot | undefined = JSON.parse(localStorage.getItem(key) ?? "null") ?? undefined;
  const requests: any[] = [];
  const fixture = {
    requests,
    conflictNext: false,
    chooseNext: false,
    failPhotoNext: false,
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
    if (/^\/api\/equipment\/\d+\/latest-closing$/.test(url.pathname) && fixture.priorClosing != null) {
      requests.push({ method: "GET", path: url.pathname, search: url.search });
      return response({ closingReading: fixture.priorClosing, sourceDate: "2026-08-04", source: "dpr" });
    }
    if (url.pathname === "/api/uploads/request-url" && fixture.failPhotoNext) {
      fixture.failPhotoNext = false;
      return response({ message: "Synthetic photo upload failure — retry is expected" }, 500);
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
    return response(snapshot);
  };
}