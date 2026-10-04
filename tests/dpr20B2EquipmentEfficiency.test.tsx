// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  buildEquipmentPerformanceReport, type EquipmentPerformanceLog,
  type EquipmentPerformanceMaster, type EquipmentPerformanceReport, type EquipmentPerformanceUsage,
} from "../shared/equipmentPerformance";
import {
  dprEquipmentPerformanceUrl, fetchDprEquipmentPerformance, isLiveDprPerformanceContext,
  hasCompleteDprPerformanceContext, resolveDprActualEfficiency, type DprEfficiencyRow,
} from "../client/src/lib/dprEquipmentEfficiency";
import { DprEquipmentEfficiency } from "../client/src/components/DprEquipmentEfficiency";
import { useDprEquipmentPerformance } from "../client/src/hooks/use-dpr-equipment-performance";
import { buildDprEquipmentTableDetails, DprEquipmentTableDetails } from "../client/src/components/DprEquipmentTableDetails";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const date = "2026-01-08";
const dpr = { id: 10, date, site: "Site A", boqProjectId: 1, dprStatus: "submitted" };
const projects = [{ id: 1, name: "Road", status: "active" }];
const master: EquipmentPerformanceMaster = {
  id: 2, name: "Roller", ownership: "owned", meterType: "hour_meter", consumptionNorm: 5,
};
const usage: EquipmentPerformanceUsage = {
  id: 30, date, dprId: dpr.id, equipmentId: master.id, entryType: "time_meter",
  openingReading: 100, closingReading: 102, startTime: "08:00", endTime: "10:00",
  openingDiesel: 20, dieselIssued: 10, dieselBalanceInTank: 22, dieselBalanceConfirmed: true,
};
const log: EquipmentPerformanceLog = {
  id: 40, dprId: dpr.id, machine: master.name, equipmentId: master.id, plantUsageId: usage.id,
};
const row = { id: log.id, equipmentId: master.id, plantUsageId: usage.id };
const measuredHours = { state: "available", rate: 4, unit: "L/hr",
  provenance: "Confirmed tank consumption; runtime from recorded hour-meter readings." };
function report(overrides: {
  usages?: EquipmentPerformanceUsage[]; logs?: EquipmentPerformanceLog[]; masters?: EquipmentPerformanceMaster[];
  filters?: Parameters<typeof buildEquipmentPerformanceReport>[0]["filters"];
} = {}) {
  return buildEquipmentPerformanceReport({
    projects, dprs: [dpr], masters: [master], usages: [usage], logs: [log], ...overrides,
    filters: { dateFrom: date, dateTo: date, ...overrides.filters },
  });
}
function resolve(data = report(), item: DprEfficiencyRow = row) {
  return resolveDprActualEfficiency({ dpr, row: item, report: data, canView: true, hasCompleteContext: true });
}
function display(data = report(), item: DprEfficiencyRow = row) {
  return render(<DprEquipmentEfficiency norm={5} normUnit="L/hr" actual={resolve(data, item)} index={0} />);
}

describe("DPR20 B2 canonical management consumption rate", () => {
  it("renders both the saved norm and confirmed actual, not issued-fuel or event fallback", () => {
    const data = report();
    // The adapter must not use event.actualConsumptionRate or fleet's aggregate.
    data.events[0].actualConsumptionRate = 999;
    data.fleet[0].consumptionRate = 888;
    display(data);
    expect(screen.getByTestId("equipment-table-efficiency-0").textContent).toContain("Norm: 5.000 L/hr");
    expect(screen.getByTestId("equipment-table-efficiency-0").textContent).toContain("Actual: 4.000 L/hr");
    expect(screen.getByText(/runtime from recorded hour-meter readings/)).toBeTruthy();
    expect(screen.getByTestId("equipment-table-efficiency-0").textContent).not.toMatch(/888|999/);
  });

  it("does not repeat a daily aggregate on multiple records or bypass the shared omitted-context guard", () => {
    const laterUsage = { ...usage, id: 31, startTime: "11:00", endTime: "13:00", openingReading: 102, closingReading: 104,
      openingDiesel: 22, dieselIssued: 0, dieselBalanceInTank: 10 };
    const laterLog = { ...log, id: 41, plantUsageId: 31 };
    const data = report({ usages: [usage, laterUsage], logs: [log, laterLog] });
    expect(data.fleet[0].dailyRows[0].consumptionRate).toBe(5);
    expect(resolve(data)).toEqual({ state: "unavailable", reason: "multiple same-day records; source rate cannot be isolated safely" });
    expect(resolve(data, { ...row, id: 41, plantUsageId: 31 })).toEqual({
      state: "unavailable", reason: "multiple same-day records; source rate cannot be isolated safely",
    });
    expect(resolve(data, { ...row, id: 41, plantUsageId: 30 })).toMatchObject({ state: "unavailable", reason: "no matching canonical performance record" });
  });

  it("accepts supported saved link aliases without guessing a machine/date match", () => {
    expect(resolve(report(), { id: 40, equipmentId: 2, equipmentUsageId: 30 })).toEqual(measuredHours);
    expect(resolve(report(), { id: 40, equipmentId: 2, passthrough: { plantUsageId: 30 } })).toEqual(measuredHours);
    expect(resolve(report(), { equipmentId: 2 })).toMatchObject({ state: "unavailable", reason: "no saved source record" });
    expect(resolve(report(), { ...row, plantUsageId: 999 })).toMatchObject({ state: "unavailable", reason: "no matching canonical performance record" });
  });

  it("matches by exact log+DPR when no usage link exists on the displayed row", () => {
    expect(resolve(report(), { id: 40, equipmentId: 2 })).toEqual(measuredHours);
    expect(resolve(report(), { id: 999, equipmentId: 2 })).toMatchObject({ state: "unavailable" });
    const data = report();
    data.events[0].reference.dprId = 999;
    expect(resolve(data)).toMatchObject({ state: "unavailable" });
  });

  it("does not fall back to a different log when an explicit usage link cannot be found", () => {
    expect(resolve(report(), { ...row, plantUsageId: 31 })).toMatchObject({ state: "unavailable" });
  });

  it("rejects duplicate log attribution, conflicting equipment and ambiguous source records", () => {
    expect(resolve(report(), { ...row, id: 41 })).toMatchObject({ state: "unavailable" });
    expect(resolve(report(), { ...row, equipmentId: 3 })).toMatchObject({ state: "unavailable" });
    const data = report();
    data.events.push({ ...data.events[0], key: "conflicting-source" });
    expect(resolve(data)).toMatchObject({ state: "unavailable", reason: "source record is ambiguous" });
  });

  it("retains genuine zero consumption/rate as zero, not a missing value", () => {
    display(report({ usages: [{ ...usage, dieselIssued: 0, openingDiesel: 20, dieselBalanceInTank: 20 }] }));
    expect(screen.getByTestId("equipment-table-efficiency-0").textContent).toContain("Actual: 0.000 L/hr");
  });

  it("uses the existing odometer L/km unit without reciprocal conversion", () => {
    const data = report({ masters: [{ ...master, meterType: "odometer" }],
      usages: [{ ...usage, openingReading: 100, closingReading: 120 }] });
    render(<DprEquipmentEfficiency norm={5} normUnit="L/km" actual={resolve(data)} index={0} />);
    expect(screen.getByTestId("equipment-table-efficiency-0").textContent).toContain("Actual: 0.400 L/km");
    expect(screen.getByTestId("equipment-table-efficiency-0").textContent).not.toContain("km/L");
    expect(screen.getByTestId("equipment-table-efficiency-0").textContent).toContain("recorded odometer readings");
  });

  it("never calls assumed-speed distance a measured actual rate even with confirmed tank fuel", () => {
    const data = report({ masters: [{ ...master, meterType: "odometer" }],
      usages: [{ ...usage, openingReading: null, closingReading: null }] });
    expect(data.events[0].usageBasis).toBe("time_fallback");
    expect(data.events[0].dieselEfficiencyUnit).toBe("L/km");
    expect(data.events[0].dieselBasis).toBe("tank_measured");
    expect(data.events[0].totalKm).toBe(50);
    display(data);
    const text = screen.getByTestId("equipment-table-efficiency-0").textContent!;
    expect(text).toContain("Actual: unavailable (distance is estimated");
    expect(text).not.toMatch(/Actual:\s*[0-9.]+\s*L\/km/);
  });

  it("defensively rejects the explicit estimated_distance basis on a canonical event", () => {
    const data = report();
    Object.assign(data.events[0], { usageBasis: "estimated_distance", dieselEfficiencyUnit: "L/km" });
    expect(resolve(data)).toMatchObject({ state: "unavailable", reason: "distance is estimated, not measured or recorded from trips" });
  });

  it("permits real clock-hour runtime only with accurate non-meter provenance", () => {
    const data = report({ usages: [{ ...usage, openingReading: null, closingReading: null }] });
    expect(data.events[0].usageBasis).toBe("time_fallback");
    display(data);
    const text = screen.getByTestId("equipment-table-efficiency-0").textContent!;
    expect(text).toContain("Actual: 4.000 L/hr");
    expect(text).toContain("runtime from recorded start/end clock time, not hour-meter readings");
    expect(text).not.toContain("runtime from recorded hour-meter readings.");
  });

  it("labels trip-derived actual distance as recorded trips, not physical meter readings", () => {
    const data = report({ masters: [{ ...master, meterType: "odometer" }],
      usages: [{ ...usage, entryType: "trip_based", openingReading: null, closingReading: null,
        numberOfTrips: 2, tripDistance: 10 }] });
    display(data);
    expect(screen.getByTestId("equipment-table-efficiency-0").textContent).toContain("Actual: 0.200 L/km");
    expect(screen.getByTestId("equipment-table-efficiency-0").textContent).toContain("recorded trips and one-way distance (round trips)");
  });

  it.each([null, "invalid"])("does not accept an unknown master meter type %s as measured hour runtime", meterType => {
    display(report({ masters: [{ ...master, meterType }] }));
    expect(screen.getByTestId("equipment-table-efficiency-0").textContent).toContain("Actual: unavailable (equipment master / meter type is unavailable)");
  });

  it("does not infer meter provenance when the report master metadata is missing", () => {
    const data = report();
    data.filterOptions.equipment = [];
    expect(resolve(data)).toMatchObject({ state: "unavailable", reason: "equipment master / meter type is unavailable" });
  });

  it("rejects inconsistent runtime unit metadata instead of displaying a plausible rate", () => {
    const data = report();
    data.events[0].dieselEfficiencyUnit = "L/km";
    expect(resolve(data)).toMatchObject({ state: "unavailable", reason: "runtime/distance basis or consumption-rate unit is unavailable or inconsistent" });
  });

  it("does not claim a real clock runtime if its source times are absent or invalid", () => {
    const data = report({ usages: [{ ...usage, openingReading: null, closingReading: null }] });
    data.events[0].startTime = "99:00";
    expect(resolve(data)).toMatchObject({ state: "unavailable", reason: "recorded clock runtime is unavailable" });
  });

  it.each([
    { dieselBalanceConfirmed: false },
    { openingDiesel: null },
    { dieselBalanceInTank: null },
    { dieselIssued: null },
    { openingDiesel: 0, dieselBalanceInTank: 100 },
  ])("shows pending for unconfirmed, missing or invalid fuel evidence %#", fields => {
    display(report({ usages: [{ ...usage, ...fields }] }));
    const text = screen.getByTestId("equipment-table-efficiency-0").textContent!;
    expect(text).toContain("Norm: 5.000 L/hr");
    expect(text).toContain("Actual: pending confirmed tank / usage data");
    expect(text).not.toContain("Actual: 5.000");
  });

  it("keeps null consumptionRate distinct from consumptionIncomplete when usage is zero", () => {
    const data = report({ usages: [{ ...usage, closingReading: 100 }] });
    expect(data.fleet[0].dailyRows[0].consumptionIncomplete).toBe(false);
    display(data);
    expect(screen.getByTestId("equipment-table-efficiency-0").textContent).toContain("Actual: unavailable (runtime or distance is missing)");
  });

  it("does not treat legacy issued diesel and raw log tank fields as confirmed canonical consumption", () => {
    const data = report({ usages: [], logs: [{ ...log, plantUsageId: null, openingReading: 100, closingReading: 102,
      diesel: 10, openingDiesel: 20, dieselBalanceInTank: 22, dieselBalanceConfirmed: true }] });
    display(data, { id: 40, equipmentId: 2 });
    expect(screen.getByTestId("equipment-table-efficiency-0").textContent).toContain("Actual: pending");
    expect(screen.getByTestId("equipment-table-efficiency-0").textContent).not.toContain("Actual: 5.000");
  });

  it("carries the server incomplete-day guard even when visible row tank values look valid", () => {
    const data = report();
    data.fleet[0].dailyRows[0].consumptionIncomplete = true;
    expect(resolve(data)).toMatchObject({ state: "pending" });
  });

  it("never recreates a confirmed rate from filtered-day/intervening-event or ambiguous-order context", () => {
    const second = { ...usage, id: 31, startTime: null, endTime: null };
    const data = report({ usages: [usage, second], logs: [log, { ...log, id: 41, plantUsageId: 31 }] });
    expect(data.fleet[0].dailyRows[0].consumptionIncomplete).toBe(true);
    expect(resolve(data)).toMatchObject({ state: "unavailable", reason: "multiple same-day records; source rate cannot be isolated safely" });
  });

  it("requires matching server day safeguards instead of assuming missing metadata means complete", () => {
    const data = report();
    data.fleet[0].dailyRows = [];
    expect(resolve(data)).toMatchObject({ state: "unavailable", reason: "verified performance context is unavailable" });
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY])("does not render nonfinite rates %s", invalid => {
    const data = report();
    data.events[0].usageValue = invalid;
    display(data);
    expect(screen.getByTestId("equipment-table-efficiency-0").textContent).not.toMatch(/Actual: (NaN|Infinity)/);
    expect(resolve(data).state).not.toBe("available");
  });
});

describe("DPR20 B2 honest request/access fallbacks", () => {
  function LiveDisplay({ canView = true, hasCompleteContext = true, context = { ...dpr, equipment: [row] } }: {
    canView?: boolean; hasCompleteContext?: boolean; context?: typeof dpr & { equipment: DprEfficiencyRow[] };
  }) {
    const query = useDprEquipmentPerformance(context, canView, 7, hasCompleteContext);
    return <DprEquipmentEfficiency norm={5} normUnit="L/hr" index={0}
      actual={resolveDprActualEfficiency({ dpr: context, row, canView,
        hasCompleteContext,
        report: query.data, isLoading: query.isLoading || query.isFetching, error: query.error })} />;
  }
  function live(canView = true, context?: typeof dpr & { equipment: DprEfficiencyRow[] }) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    const rendered = render(<QueryClientProvider client={client}><LiveDisplay canView={canView} context={context} /></QueryClientProvider>);
    return { ...rendered, client };
  }

  it("never requests the performance API for users lacking either required view permission", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    live(false);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByTestId("equipment-table-efficiency-0").textContent).toContain("unavailable (performance access not granted)");
  });

  it("does not request unknown/restricted equipment-day context", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 5 * 60_000 } } });
    render(<QueryClientProvider client={client}><LiveDisplay hasCompleteContext={false} /></QueryClientProvider>);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByTestId("equipment-table-efficiency-0").textContent).toContain("complete equipment-day access is not verified");
  });

  it("never promotes a fresh restricted-scope cache to a confirmed number before a delayed full-context response", async () => {
    let finish!: (value: unknown) => void;
    const fetchMock = vi.fn().mockReturnValue(new Promise(resolve => { finish = resolve; }));
    vi.stubGlobal("fetch", fetchMock);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 5 * 60_000 } } });
    // Simulate a pre-existing restricted response within the app's five-minute
    // cache lifetime. It cannot establish complete context after promotion.
    client.setQueryData(["/api/reports/equipment-performance", "dpr-actual", date, 7, true, false], report());
    const view = render(<QueryClientProvider client={client}><LiveDisplay hasCompleteContext={false} /></QueryClientProvider>);
    expect(fetchMock).not.toHaveBeenCalled();
    view.rerender(<QueryClientProvider client={client}><LiveDisplay hasCompleteContext /></QueryClientProvider>);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const checking = screen.getByTestId("equipment-table-efficiency-0").textContent!;
    expect(checking).toContain("Actual: checking confirmed performance data");
    expect(checking).not.toMatch(/Actual:\s*[0-9.]+/);
    const fresh = report({ usages: [{ ...usage, dieselIssued: 0, dieselBalanceInTank: 20 }] });
    await act(async () => { finish({ ok: true, json: async () => fresh }); });
    await waitFor(() => expect(screen.getByTestId("equipment-table-efficiency-0").textContent).toContain("Actual: 0.000 L/hr"));
    expect(screen.getByTestId("equipment-table-efficiency-0").textContent).not.toContain("Actual: 4.000");
  });

  it("revalidates a view-permission regrant without showing the old complete-access cache while the new fetch is pending", async () => {
    let finish!: (value: unknown) => void;
    const fetchMock = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => report() })
      .mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    vi.stubGlobal("fetch", fetchMock);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 5 * 60_000 } } });
    const view = render(<QueryClientProvider client={client}><LiveDisplay /></QueryClientProvider>);
    await waitFor(() => expect(screen.getByTestId("equipment-table-efficiency-0").textContent).toContain("Actual: 4.000 L/hr"));
    view.rerender(<QueryClientProvider client={client}><LiveDisplay canView={false} /></QueryClientProvider>);
    expect(screen.getByTestId("equipment-table-efficiency-0").textContent).toContain("performance access not granted");
    view.rerender(<QueryClientProvider client={client}><LiveDisplay /></QueryClientProvider>);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(screen.getByTestId("equipment-table-efficiency-0").textContent).toContain("Actual: checking confirmed performance data");
    expect(screen.getByTestId("equipment-table-efficiency-0").textContent).not.toMatch(/Actual:\s*[0-9.]+/);
    const fresh = report({ usages: [{ ...usage, dieselIssued: 0, dieselBalanceInTank: 20 }] });
    await act(async () => { finish({ ok: true, json: async () => fresh }); });
    await waitFor(() => expect(screen.getByTestId("equipment-table-efficiency-0").textContent).toContain("Actual: 0.000 L/hr"));
  });

  it("revalidates after complete-context access is revoked and regranted, hiding its earlier full-context cache", async () => {
    let finish!: (value: unknown) => void;
    const fetchMock = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => report() })
      .mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    vi.stubGlobal("fetch", fetchMock);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 5 * 60_000 } } });
    const view = render(<QueryClientProvider client={client}><LiveDisplay /></QueryClientProvider>);
    await waitFor(() => expect(screen.getByTestId("equipment-table-efficiency-0").textContent).toContain("Actual: 4.000 L/hr"));
    view.rerender(<QueryClientProvider client={client}><LiveDisplay hasCompleteContext={false} /></QueryClientProvider>);
    expect(screen.getByTestId("equipment-table-efficiency-0").textContent).toContain("complete equipment-day access is not verified");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    view.rerender(<QueryClientProvider client={client}><LiveDisplay /></QueryClientProvider>);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(screen.getByTestId("equipment-table-efficiency-0").textContent).not.toMatch(/Actual:\s*[0-9.]+/);
    const fresh = report({ usages: [{ ...usage, dieselIssued: 0, dieselBalanceInTank: 20 }] });
    await act(async () => { finish({ ok: true, json: async () => fresh }); });
    await waitFor(() => expect(screen.getByTestId("equipment-table-efficiency-0").textContent).toContain("Actual: 0.000 L/hr"));
  });

  it.each([{ dprStatus: "draft" }, { isCancelled: true }, { isDeleted: true }, { isSuperseded: true }])(
    "never requests excluded DPR performance data %#", excluded => {
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);
      live(true, { ...dpr, ...excluded, equipment: [row] });
      expect(fetchMock).not.toHaveBeenCalled();
      expect(screen.getByTestId("equipment-table-efficiency-0").textContent).toContain("DPR is not included in live performance data");
    },
  );

  it("does not request an empty equipment section", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    live(true, { ...dpr, equipment: [] });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("loads the real query into the rendered Norm/Actual display and hides cached actual after permission loss", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => report() });
    vi.stubGlobal("fetch", fetchMock);
    const mounted = live();
    await waitFor(() => expect(screen.getByTestId("equipment-table-efficiency-0").textContent).toContain("Actual: 4.000 L/hr"));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    mounted.rerender(<QueryClientProvider client={mounted.client}><LiveDisplay canView={false} /></QueryClientProvider>);
    expect(screen.getByTestId("equipment-table-efficiency-0").textContent).toContain("unavailable (performance access not granted)");
    expect(screen.getByTestId("equipment-table-efficiency-0").textContent).not.toContain("Actual: 4.000");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([403, 500])("renders a failed HTTP %s query honestly without retry or render crash", async status => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status });
    vi.stubGlobal("fetch", fetchMock);
    live();
    await waitFor(() => expect(screen.getByTestId("equipment-table-efficiency-0").textContent).toContain(
      status === 403 ? "unavailable (performance access denied)" : "unavailable (performance request failed (HTTP 500))",
    ));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("equipment-table-efficiency-0").textContent).toContain("Norm: 5.000 L/hr");
  });

  it("retains explicit no-permission, loading, missing and request-error states", () => {
    expect(resolveDprActualEfficiency({ dpr, row, report: report(), canView: false })).toMatchObject({
      state: "unavailable", reason: "performance access not granted",
    });
    expect(resolveDprActualEfficiency({ dpr, row, canView: true, hasCompleteContext: true, isLoading: true })).toMatchObject({ state: "loading" });
    expect(resolveDprActualEfficiency({ dpr, row, canView: true, hasCompleteContext: true })).toMatchObject({ state: "unavailable" });
    expect(resolveDprActualEfficiency({ dpr, row, report: report(), canView: true,
      hasCompleteContext: true,
      error: new Error("performance request failed (HTTP 500)") })).toMatchObject({ state: "unavailable" });
  });

  it("does not infer complete equipment-day context from a scoped API's apparently complete flags", () => {
    expect(hasCompleteDprPerformanceContext({ isAdmin: true })).toBe(true);
    expect(hasCompleteDprPerformanceContext({ isOwner: true })).toBe(true);
    expect(hasCompleteDprPerformanceContext({ allSitesAccess: true })).toBe(true);
    expect(hasCompleteDprPerformanceContext({ allSitesAccess: true, setupComplete: false })).toBe(false);
    expect(hasCompleteDprPerformanceContext({ allSitesAccess: false })).toBe(false);
    expect(hasCompleteDprPerformanceContext({})).toBe(false);
    expect(hasCompleteDprPerformanceContext(null)).toBe(false);
    const data = report();
    expect(data.fleet[0].dailyRows[0].consumptionIncomplete).toBe(false);
    expect(resolveDprActualEfficiency({ dpr, row, canView: true, report: data, hasCompleteContext: false }))
      .toEqual({ state: "unavailable", reason: "complete equipment-day access is not verified" });
  });

  it.each([{ dprStatus: "draft" }, { isCancelled: true }, { isDeleted: true }, { isSuperseded: true }])(
    "does not apply live canonical values to excluded DPRs %#", excluded => {
      const context = { ...dpr, ...excluded };
      expect(isLiveDprPerformanceContext(context)).toBe(false);
      expect(resolveDprActualEfficiency({ dpr: context, row, report: report(), canView: true })).toMatchObject({
        state: "unavailable", reason: "DPR is not included in live performance data",
      });
    },
  );

  it("requests only the exact day with credentials and abort support, without a site/project filter", async () => {
    const data = report();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => data });
    vi.stubGlobal("fetch", fetchMock);
    const signal = new AbortController().signal;
    expect(await fetchDprEquipmentPerformance(date, signal)).toEqual(data);
    expect(fetchMock).toHaveBeenCalledWith("/api/reports/equipment-performance?dateFrom=2026-01-08&dateTo=2026-01-08",
      { credentials: "include", signal });
    expect(dprEquipmentPerformanceUrl(date)).not.toMatch(/projectId|site|scope/);
  });

  it.each([401, 403, 500])("surfaces HTTP %s as unavailable instead of falling back to a rate", async status => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status }));
    await expect(fetchDprEquipmentPerformance(date)).rejects.toThrow(
      status === 500 ? "performance request failed (HTTP 500)" : "performance access denied",
    );
  });

  it("renders missing norm and unavailable actual honestly", () => {
    render(<DprEquipmentEfficiency norm={null} normUnit="" actual={{
      state: "unavailable", reason: "performance access not granted",
    }} index={0} />);
    expect(screen.getByTestId("equipment-table-efficiency-0").textContent).toContain("Norm: —");
    expect(screen.getByTestId("equipment-table-efficiency-0").textContent).toContain("Actual: unavailable (performance access not granted)");
  });
});

describe("DPR20 B2 snapshot fuel facts do not compete with canonical Actual", () => {
  const snapshot = { machine: "Roller", dieselSource: "plant_stock", diesel: 10, expectedDiesel: 10,
    openingDiesel: 20, dieselBalanceInTank: 22, dieselBalanceConfirmed: true, hoursWorked: 2 };
  it("retains snapshot consumption and variance but removes the old rate/norm-as-actual line for this table", () => {
    render(<DprEquipmentTableDetails section="performance" row={snapshot}
      details={buildDprEquipmentTableDetails(snapshot, master)} index={0} showLegacyRate={false} />);
    const text = screen.getByTestId("equipment-table-performance-0").textContent!;
    expect(text).toContain("DPR snapshot consumed: 8.00 L");
    expect(text).toContain("DPR snapshot consumed − expected variance: -2.00 L");
    expect(text).toContain("saved DPR snapshot, not the canonical performance record");
    expect(text).not.toMatch(/Actual Consumption Rate|Expected Consumption Rate|4\.00 L\/hr/);
  });

  it("retains the master reference norm without presenting it as Actual when snapshot is unconfirmed", () => {
    const unconfirmed = { ...snapshot, dieselBalanceConfirmed: false };
    render(<DprEquipmentTableDetails section="performance" row={unconfirmed}
      details={buildDprEquipmentTableDetails(unconfirmed, master)} index={0} showLegacyRate={false} />);
    expect(screen.getByTestId("equipment-table-performance-0").textContent).toContain("Current master norm (reference): 5.00 L/hr");
    expect(screen.getByTestId("equipment-table-performance-0").textContent).not.toContain("Expected Consumption Rate");
  });

  it("preserves the permission-aware consumption path and opts SiteReport into compact print, retaining default audit CSS", () => {
    const source = readFileSync("client/src/pages/SiteReport.tsx", "utf8");
    expect(source).toContain('sectionCan("equipment_performance_report", "view") || sectionCan("plant_equipment", "view")');
    expect(source).toContain("useDprEquipmentPerformance(dpr, canViewPerformance, user?.id, completePerformanceContext)");
    const renderer = readFileSync("client/src/components/DprEquipmentReadOnlyRow.tsx", "utf8");
    expect(source).toContain("canonical={resolveDprActualEfficiency");
    expect(renderer).toContain('label="Issued − saved expected"');
    expect(renderer).toContain('label="DPR snapshot consumed − expected variance"');
    expect(source).not.toContain("Actual variance:");
    expect(renderer).toContain("resolveDprRowConsumption");
    expect(renderer).not.toContain("<DprEquipmentEfficiency");
    expect(source).toContain('<DprEquipmentReadOnlyRow management');
    expect(source).toContain('import "@/components/dprManagement.css"');
    const auditCss = readFileSync("client/src/components/dprEquipmentReadOnly.css", "utf8");
    expect(auditCss).toContain(".dpr-equipment-readonly thead { display: table-header-group !important; }");
    expect(auditCss).toContain(".equipment-audit-panel { display: block !important;");
  });
});