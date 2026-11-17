import React from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { ItemEditDialog } from "../../../client/src/pages/BoqProjectDetail";
import { buildScopeBasedBomSchedule } from "@shared/scopeBomDemand";
import { calculateBomDemand } from "@shared/planningEngine";
import { allocateBoqQuantityToWorkingReaches, type BoqTypicalSection } from "@shared/workingReachValue";
import "../../../client/src/index.css";

const projectId = 71;
const item = {
  id: 71,
  boqProjectId: projectId,
  categoryId: null,
  itemCode: "SYN-01",
  description: "Embankment earthwork synthetic fixture",
  unit: "CUM",
  canonicalUnit: "CUM",
  boqQty: 10_000,
  currentQty: 10_000,
  clientRate: 100,
  sortOrder: 1,
  workCategory: "earthwork",
  itemName: "Synthetic earthwork",
  mappingStatus: "unmapped",
  fixedQuantity: false,
  fixedQuantityReachId: null,
  planningWorkType: "road",
  layerConfig: { layerType: "earthwork" },
  sections: [],
  categoryName: "Synthetic fixture",
} as any;
const segments = [{
  id: 711,
  segmentType: "working_reach",
  chainageFrom: 0,
  chainageTo: 1.25,
  status: "confirmed",
  applicability: "all_linear",
}];
const syntheticSection: BoqTypicalSection = {
  chainageFrom: 0,
  chainageTo: 1.25,
  topWidthM: 10.5,
  thicknessMm: 500,
  sideSlope: 2,
  note: "SYNTHETIC FIXTURE ONLY",
};
let savedSections: any[] = [];
const fixtureState = {
  sections: savedSections,
  writes: [] as Array<{ method: string; path: string; body?: any }>,
};
(window as any).__SECTION_QTY_FIXTURE = fixtureState;

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "Content-Type": "application/json" },
});

window.fetch = async (input, init) => {
  const raw = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const inputMethod = typeof input === "object" && "method" in input ? input.method || "GET" : "GET";
  const url = new URL(raw, window.location.origin);
  const method = String(init?.method || inputMethod).toUpperCase();
  let body: any;
  try { body = init?.body ? JSON.parse(String(init.body)) : undefined; } catch { body = init?.body; }
  if (method !== "GET") fixtureState.writes.push({ method, path: url.pathname, body });
  if (url.pathname === `/api/boq/items/${item.id}/sections` && method === "GET") return json(savedSections);
  if (url.pathname === `/api/boq/items/${item.id}/sections` && method === "PUT") {
    savedSections = (body?.sections ?? []).map((row: any, index: number) => ({
      id: row.id ?? 8700 + index,
      boqItemId: item.id,
      projectId,
      ...row,
      createdBy: 7001,
    }));
    fixtureState.sections = savedSections;
    return json(savedSections);
  }
  if (url.pathname === `/api/boq/projects/${projectId}/scope-segments`) return json(segments);
  if (url.pathname === `/api/boq/items/${item.id}` && method === "PATCH") return json(item);
  throw new Error(`SECTION-QTY fixture blocked unexpected request: ${method} ${url.pathname}`);
};

function FixtureDisclosure() {
  return (
    <div className="border-b border-slate-300 bg-slate-100 px-5 py-2 text-center text-xs font-semibold text-slate-800">
      SECTION-QTY-01 · synthetic development fixture · API requests are intercepted · no project rows are changed
    </div>
  );
}

function FixtureResults() {
  const beforeItem = {
    id: item.id,
    itemName: item.itemName,
    description: item.description,
    unit: item.unit,
    currentQty: item.currentQty,
    clientRate: item.clientRate,
    fixedQuantity: false,
    materials: [],
    equipment: [],
    labour: [],
    layerConfig: { layerType: "earthwork" },
    sections: [],
  };
  const afterItem = { ...beforeItem, sections: [syntheticSection] };
  const bar = { id: 711, boqItemId: item.id, chainageFrom: 0, chainageTo: 1.25, startMonth: 1, endMonth: 2, plannedQty: 10_000 };
  const before = buildScopeBasedBomSchedule({ items: [beforeItem], bars: [bar as any], segments, totalMonths: 2 });
  const after = buildScopeBasedBomSchedule({ items: [afterItem], bars: [bar as any], segments, totalMonths: 2 });
  const beforeBom = calculateBomDemand(before.items as any[], before.bars as any[], 2);
  const afterBom = calculateBomDemand(after.items as any[], after.bars as any[], 2);
  const beforeSoil = beforeBom.materials.find(row => row.materialName === "Earth / Borrow Soil")?.totalQty ?? 0;
  const afterSoil = afterBom.materials.find(row => row.materialName === "Earth / Borrow Soil")?.totalQty ?? 0;
  const beforeQty = allocateBoqQuantityToWorkingReaches({
    boqItemId: item.id, isLinear: true, currentQty: item.currentQty, unit: item.unit,
  }, segments).workingQuantity;
  const afterQty = allocateBoqQuantityToWorkingReaches({
    boqItemId: item.id, isLinear: true, currentQty: item.currentQty, unit: item.unit,
  }, segments, [syntheticSection]).workingQuantity;

  const rows = [
    { label: "Work quantity", before: beforeQty, after: afterQty, unit: "cum" },
    { label: "Work value at ₹100/cum", before: beforeQty * item.clientRate, after: afterQty * item.clientRate, unit: "₹" },
    { label: "Synthetic soil in BOM", before: beforeSoil, after: afterSoil, unit: "cum" },
  ];

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-8" data-testid="section-qty-fixture-results">
      <div className="rounded border border-slate-300 bg-white p-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Synthetic fixture · no database writes</p>
        <h1 className="mt-1 text-2xl font-semibold text-slate-900">Work value and BOM before and after</h1>
        <p className="mt-2 text-sm text-slate-600">BOQ quantity stays at 10,000 cum. The section uses 10.5 m top width, 500 mm thickness, side slope 2, from 0.000 to 1.250 km.</p>
      </div>
      <div className="overflow-hidden rounded border border-slate-300 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-100 text-slate-800">
            <tr><th className="p-4">Measure</th><th className="p-4 text-right">Before section</th><th className="p-4 text-right">After section</th></tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <tr key={row.label} className="border-t border-slate-200">
                <th className="p-4 font-medium">{row.label}</th>
                <td className="p-4 text-right tabular-nums">{format(row.before)} {row.unit}</td>
                <td className="p-4 text-right tabular-nums font-semibold">{format(row.after)} {row.unit}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-500">Values are calculated by the same shared working-reach allocator used by Work value, scoped BOM, Fund planner and bar review.</p>
    </main>
  );
}

function format(value: number): string {
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(value);
}

const isResults = new URLSearchParams(location.search).get("view") === "results";
createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={queryClient}>
    <FixtureDisclosure />
    {isResults
      ? <FixtureResults />
      : <ItemEditDialog item={item} projectId={projectId} onClose={() => undefined} />}
  </QueryClientProvider>,
);
