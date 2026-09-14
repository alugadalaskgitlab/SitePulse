// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { readFileSync } from "node:fs";
import { useDprBoqItems } from "@/hooks/use-dpr-boq-items";
import { EquipmentActivityAllocationEditor } from "@/components/EquipmentActivityAllocationEditor";
import { getBaseSiteName } from "@shared/siteName";

const site = "TAKKADPALLY-SIRUR";
const items = [
  { id: 3, displayName: "roadway excavation" },
  { id: 4, displayName: "embankment - excavated earth" },
];
const segment = (ids: number[], startTime = "09:00", endTime = "16:42") => ({
  startTime, endTime, boqItems: ids.map(boqItemId => ({ boqItemId, programmeBarId: null })),
});
function Harness({ siteName, segments }: { siteName: string; segments: ReturnType<typeof segment>[] }) {
  const { items: boqItems } = useDprBoqItems({ siteName, sites: [{ id: 18, name: site }], preferredProjectId: 1 });
  return <EquipmentActivityAllocationEditor editable={false} value={segments} boqItems={boqItems} />;
}
function mount(siteName: string, segments = [segment([3, 4])]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const fetchMock = vi.fn(async (url: string) => {
    if (url === "/api/boq/projects?siteId=18") return { ok: true, json: async () => [{ id: 1, name: site }] };
    if (url === "/api/boq/projects/1/items") return { ok: true, json: async () => items };
    throw new Error(`Unexpected request ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  render(<QueryClientProvider client={client}><Harness siteName={siteName} segments={segments} /></QueryClientProvider>);
  return fetchMock;
}
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("DPR-01 decorated report site BOQ lookup", () => {
  it("reproduces the old lookup failure despite valid numeric BOQ references", () => {
    const fetchMock = mount(`${site} – Edited by Admin – 2026-09-14 20:50:27`);
    expect(screen.getAllByText("BOQ activity unavailable")).toHaveLength(2);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    `${site} – Edited by Admin – 2026-09-14 20:50:27`,
    `${site} - Copy by Admin - 2026-09-14`,
    site,
  ])("A: resolves main and additional items for %s without mutating assignments", async (savedSite) => {
    const segments = [segment([3, 4])];
    const before = JSON.stringify(segments);
    const fetchMock = mount(getBaseSiteName(savedSite), segments);
    expect(await screen.findByText("roadway excavation")).toBeTruthy();
    expect(screen.getByText("embankment - excavated earth")).toBeTruthy();
    expect(screen.queryByText("BOQ activity unavailable")).toBeNull();
    expect(fetchMock.mock.calls.map(call => call[0])).toEqual([
      "/api/boq/projects?siteId=18", "/api/boq/projects/1/items",
    ]);
    expect(JSON.stringify(segments)).toBe(before);
  });

  it("B: resolves one assigned item", async () => {
    mount(getBaseSiteName(`${site} – Edited by Admin – timestamp`), [segment([3])]);
    expect(await screen.findByText("roadway excavation")).toBeTruthy();
    expect(screen.queryByText("embankment - excavated earth")).toBeNull();
    expect(screen.queryByText("BOQ activity unavailable")).toBeNull();
  });

  it("C: resolves a second physical segment independently", async () => {
    mount(getBaseSiteName(`${site} – Edited by Admin – timestamp`),
      [segment([3], "09:00", "12:00"), segment([4], "13:00", "16:42")]);
    await waitFor(() => expect(screen.queryByText("BOQ activity unavailable")).toBeNull());
    expect(screen.getByText("roadway excavation")).toBeTruthy();
    expect(screen.getByText("embankment - excavated earth")).toBeTruthy();
  });

  it("wires the normalization at the actual report caller, not the assignment/storage seam", () => {
    const source = readFileSync("client/src/pages/SiteReport.tsx", "utf8");
    expect(source).toContain('import { getBaseSiteName } from "@shared/siteName"');
    expect(source).toContain('siteName: getBaseSiteName(dpr?.site ?? "")');
    expect(source).toContain("boqItems={reportBoqItems}");
  });
});