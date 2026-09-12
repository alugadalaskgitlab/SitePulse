import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { AlertTriangle, ArrowUpRight, ChevronRight, RotateCcw, Search, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/lib/auth-context";
import { Link } from "wouter";
import {
  EQUIPMENT_IDENTIFICATION_QUERY_KEY,
  EQUIPMENT_IDENTIFICATION_RETURN_TO,
  fetchEquipmentIdentification,
} from "@/lib/equipmentIdentification";
import { usePersistedFilters } from "@/hooks/use-persisted-filters";
import {
  EMPTY_EQUIPMENT_PERFORMANCE_FILTERS,
  equipmentPerformanceUrl,
  equipmentSourceHref,
  hasEquipmentPerformanceFilters,
  parseEquipmentPerformanceFilters,
  type EquipmentPerformanceFilters,
} from "@/lib/equipmentPerformanceNav";
import {
  type EquipmentPerformanceDailyRow,
  type EquipmentPerformanceEvent,
  type EquipmentPerformanceFleetRow,
  type EquipmentPerformanceReport,
} from "@shared/equipmentPerformance";
import { formatEquipmentDuration, formatEquipmentTime } from "@shared/equipmentUsage";
import { formatEquipmentOptionLabel } from "@shared/equipmentLabel";

type AnyRow = Record<string, any>;
type Filters = EquipmentPerformanceFilters;
type FleetRow = EquipmentPerformanceFleetRow;
type Report = EquipmentPerformanceReport;

const number = (value: unknown) => Number(value ?? 0);
const date = (value: unknown) => value ? format(new Date(String(value)), "dd MMM yyyy") : "—";
const litres = (value: number | null | undefined) => value == null ? "—" : `${number(value).toLocaleString("en-IN", { maximumFractionDigits: 1 })} L`;
const reading = (value: number | null | undefined, unit: "h" | "km") =>
  value == null ? "—" : `${number(value).toLocaleString("en-IN", { maximumFractionDigits: 1 })} ${unit}`;
const signedLitres = (value: number | null | undefined) =>
  value == null ? "—" : `${number(value) > 0 ? "+" : ""}${litres(value)}`;

function selectOptions(data: AnyRow | undefined, name: string) {
  const candidates = data?.filterOptions?.[name] ?? data?.[`${name}s`] ?? [];
  return Array.isArray(candidates) ? candidates : [];
}

export default function EquipmentPerformanceReport() {
  const { isAdmin, isOwner } = useAuth();
  const canReview = isAdmin || isOwner;
  const defaultFilters = useMemo<Filters>(
    () => ({ ...EMPTY_EQUIPMENT_PERFORMANCE_FILTERS, dateTo: format(new Date(), "yyyy-MM-dd") }),
    [],
  );
  const initialFilters = useMemo<Filters>(() => {
    const search = typeof window === "undefined" ? "" : window.location.search;
    return parseEquipmentPerformanceFilters(search, defaultFilters);
  }, [defaultFilters]);
  const urlHasFilters = useMemo(
    () => typeof window !== "undefined" && hasEquipmentPerformanceFilters(window.location.search),
    [],
  );
  const [filters, setFilters, resetPersistedFilters] = usePersistedFilters(
    "equipment-performance:filters:v1",
    initialFilters,
    { shouldHydrate: !urlHasFilters },
  );
  const initialMachineKey = useMemo(() => {
    if (typeof window === "undefined") return "";
    return new URLSearchParams(window.location.search).get("machine") ?? "";
  }, []);
  const [openMachine, setOpenMachine] = useState<FleetRow | null>(null);
  const [selectedMachineKey, setSelectedMachineKey] = useState(initialMachineKey);
  const params = useMemo(() => {
    const value = new URLSearchParams();
    Object.entries(filters).forEach(([key, item]) => { if (item && item !== "all") value.set(key, item); });
    return value.toString();
  }, [filters]);
  const report = useQuery<Report>({
    queryKey: ["/api/reports/equipment-performance", params],
    queryFn: async () => {
      const response = await fetch(`/api/reports/equipment-performance?${params}`, { credentials: "include" });
      if (!response.ok) throw new Error(await response.text());
      return response.json();
    },
  });
  const identification = useQuery<Report>({
    queryKey: EQUIPMENT_IDENTIFICATION_QUERY_KEY,
    queryFn: fetchEquipmentIdentification,
    enabled: canReview,
  });
  const rows = report.data?.fleet ?? [];
  const events = report.data?.events ?? [];
  const equipmentOptions = selectOptions(report.data, "equipment");
  const pendingIdentificationCount = identification.data?.reviewRows.length ?? 0;
  const machineEvents = useMemo(
    () => openMachine?.equipmentId == null ? [] : events.filter(event => event.equipmentId === openMachine.equipmentId),
    [events, openMachine],
  );
  const set = (key: keyof Filters, value: string) => setFilters(current => ({ ...current, [key]: value }));
  const reset = () => {
    resetPersistedFilters();
    setFilters(defaultFilters);
    setOpenMachine(null);
    setSelectedMachineKey("");
  };
  const reportUrl = equipmentPerformanceUrl(filters, selectedMachineKey);
  const rememberScroll = () => {
    try {
      sessionStorage.setItem("equipment-performance:return-state", JSON.stringify({ scrollY: window.scrollY }));
    } catch {
      // Session storage is optional.
    }
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    const next = equipmentPerformanceUrl(filters, selectedMachineKey);
    if (`${window.location.pathname}${window.location.search}` !== next) {
      window.history.replaceState(window.history.state, "", next);
    }
  }, [filters, selectedMachineKey]);

  useEffect(() => {
    if (!initialMachineKey || openMachine || !rows.length) return;
    const selected = rows.find(row => row.key === initialMachineKey);
    if (selected) setOpenMachine(selected);
  }, [initialMachineKey, openMachine, rows]);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("equipment-performance:return-state");
      if (!raw) return;
      const saved = JSON.parse(raw) as { scrollY?: unknown };
      if (typeof saved.scrollY === "number" && Number.isFinite(saved.scrollY)) {
        setTimeout(() => window.scrollTo(0, saved.scrollY as number), 0);
      }
      sessionStorage.removeItem("equipment-performance:return-state");
    } catch {
      // A malformed saved position must not block the report.
    }
  }, []);

  return (
    <div className="equip-shell -mt-6 min-h-[100dvh] min-w-0 max-w-full overflow-x-hidden px-4 py-7 md:px-8" data-testid="page-equipment-performance">
      <div className="mx-auto min-w-0 max-w-[1700px] space-y-5">
        <header className="border-b-2 border-[#173f49] pb-5">
          <h1 className="text-3xl font-bold tracking-[-.045em] text-[#173f49] md:text-4xl">EQUIPMENT PERFORMANCE</h1>
          <p className="mt-1 text-sm text-slate-600">Usage, working hours and diesel consumption by equipment</p>
        </header>

        <section className="equip-panel rounded-md border border-[#cfc8b8] bg-[#faf7ed] p-3">
          <div className="grid gap-2 md:grid-cols-4 xl:grid-cols-7">
            <Filter label="From Date"><Input type="date" value={filters.dateFrom} onChange={event => set("dateFrom", event.target.value)} className="h-9 bg-[#fffdf6]" /></Filter>
            <Filter label="To Date"><Input type="date" value={filters.dateTo} onChange={event => set("dateTo", event.target.value)} className="h-9 bg-[#fffdf6]" /></Filter>
            <Filter label="Project / Site"><NativeSelect value={filters.projectId} onChange={value => set("projectId", value)} placeholder="All projects" items={selectOptions(report.data, "projects")} /></Filter>
            <Filter label="Scope"><NativeSelect value={filters.scope} onChange={value => set("scope", value)} placeholder="All" items={selectOptions(report.data, "scopes")} fallback={["site", "plant"]} /></Filter>
            <Filter label="Ownership"><NativeSelect value={filters.ownership} onChange={value => set("ownership", value)} placeholder="All" items={selectOptions(report.data, "ownership")} fallback={["owned", "hired"]} /></Filter>
            <Filter label="Equipment Type"><NativeSelect value={filters.equipmentType} onChange={value => set("equipmentType", value)} placeholder="All types" items={selectOptions(report.data, "equipmentTypes")} /></Filter>
            <Filter label="Equipment"><NativeSelect value={filters.equipmentId} onChange={value => set("equipmentId", value)} placeholder="All equipment" items={equipmentOptions.map(item => ({ ...item, label: formatEquipmentOptionLabel(item) }))} /></Filter>
          </div>
          <div className="mt-3"><Button variant="outline" className="h-9 border-[#9fb4b8] bg-transparent" onClick={reset}><RotateCcw className="mr-1.5 h-3.5 w-3.5" />Reset</Button></div>
        </section>

        {report.isLoading ? <Skeleton /> : report.isError ? <ErrorState retry={() => report.refetch()} /> : <>
          {canReview && pendingIdentificationCount > 0 && (
            <div className="flex items-center justify-between gap-3 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900" data-testid="notice-equipment-identification">
              <span>{pendingIdentificationCount} equipment log{pendingIdentificationCount === 1 ? "" : "s"} need{pendingIdentificationCount === 1 ? "s" : ""} identification</span>
              <Link href={EQUIPMENT_IDENTIFICATION_RETURN_TO}><Button size="sm" variant="outline">Review</Button></Link>
            </div>
          )}
           <section className="equip-panel min-w-0 max-w-full overflow-hidden rounded-md border border-[#cfc8b8] bg-[#fffdf6]">
            <div className="flex items-center justify-between border-b border-[#d9d2c2] px-4 py-3">
              <div><h2 className="font-bold text-[#173f49]">Equipment</h2><p className="text-xs text-slate-600">Select a machine to see daily details.</p></div>
              <span className="text-xs text-slate-500">{rows.length} machine{rows.length === 1 ? "" : "s"}</span>
            </div>
             <div className="min-w-0 max-w-full overflow-x-auto" data-testid="equipment-performance-table-scroll">
              <table className="w-full min-w-[1550px] text-left text-xs">
                <thead className="bg-[#e8e2d3] text-[10px] uppercase tracking-wider text-[#43575a]"><tr>
                  <th className="px-4 py-2.5">Equipment</th><th>Owned / Hired</th><th>Owner / Vendor</th>
                  <th className="text-right">Opening Meter</th><th className="text-right">Closing Meter</th><th className="text-right">Working Hours</th><th className="text-right">Clock Duration</th>
                  <th className="text-right">Diesel Issued</th><th className="text-right">Opening Tank</th><th className="text-right">Closing Tank</th>
                  <th className="text-right">Diesel Consumed</th><th className="text-right">Expected Diesel</th><th className="text-right">Difference</th><th className="px-4 text-right">Consumption Rate</th>
                </tr></thead>
                <tbody>{rows.length ? rows.map(row => <tr key={row.key} className="equip-row cursor-pointer border-t border-[#e4dece]" tabIndex={0} role="button" onClick={() => { setOpenMachine(row); setSelectedMachineKey(row.key); }} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setOpenMachine(row); setSelectedMachineKey(row.key); } }}>
                  <td className="px-4 py-3 font-semibold text-[#193f48]">{row.machine}{row.registrationNumber ? <div className="mt-0.5 text-[10px] font-normal text-slate-500">{row.registrationNumber}</div> : null}</td>
                  <td className="capitalize">{row.ownership}</td><td>{row.ownerVendor}</td>
                  <Numeric>{reading(row.openingMeter, row.meterUnit)}</Numeric><Numeric>{reading(row.closingMeter, row.meterUnit)}</Numeric>
                  <Numeric>{partialDuration(row.workingHours, row.workingHoursIncomplete)}</Numeric><Numeric>{partialDuration(row.clockDuration, row.clockDurationIncomplete)}</Numeric>
                  <Numeric>{litres(row.dieselIssued)}</Numeric><Numeric>{litres(row.openingTank)}</Numeric><Numeric>{litres(row.closingTank)}</Numeric>
                  <Numeric>{consumptionValue(row.dieselConsumed, row.consumptionIncomplete)}</Numeric><Numeric>{litres(row.expectedDiesel)}</Numeric>
                  <Numeric className={row.difference != null && row.difference > 0 ? "text-[#ad4b32]" : ""}>{row.consumptionIncomplete ? "Incomplete" : signedLitres(row.difference)}</Numeric>
                  <Numeric className="px-4">{row.consumptionIncomplete ? "Incomplete" : row.consumptionRate == null ? "—" : `${row.consumptionRate.toLocaleString("en-IN", { maximumFractionDigits: 2 })} ${row.consumptionRateUnit}`}<ChevronRight className="ml-2 inline h-3.5 w-3.5 text-[#25657a]" /></Numeric>
                </tr>) : <tr><td colSpan={14}><Empty title="No equipment activity matches these filters." detail="Adjust the date range or clear a filter." /></td></tr>}</tbody>
              </table>
            </div>
          </section>
        </>}
      </div>
      <MachineDialog machine={openMachine} events={machineEvents} returnTo={reportUrl} onSourceNavigate={rememberScroll} close={() => { setOpenMachine(null); setSelectedMachineKey(""); }} />
    </div>
  );
}

function MachineDialog({ machine, events, returnTo, onSourceNavigate, close }: { machine: FleetRow | null; events: EquipmentPerformanceEvent[]; returnTo: string; onSourceNavigate: () => void; close: () => void }) {
  const [showSources, setShowSources] = useState(false);
  // Daily calculations come from the server summary: it retains only visible
  // sources while carrying the full-stream gap check used by the period row.
  const daily = machine?.dailyRows ?? [];
  useEffect(() => setShowSources(false), [machine?.key]);
  return <Dialog open={!!machine} onOpenChange={value => !value && close()}><DialogContent className="max-h-[90vh] max-w-[96vw] overflow-y-auto bg-[#fffdf6]">
    <DialogHeader><div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-[#1f7180]"><Search className="h-3.5 w-3.5" />Daily details</div><DialogTitle className="text-2xl text-[#173f49]">{machine?.machine}</DialogTitle></DialogHeader>
    <div className="overflow-x-auto"><table className="w-full min-w-[1500px] text-xs"><thead className="bg-[#e8e2d3] text-[10px] uppercase tracking-wider"><tr>
      <th className="px-2 py-2 text-left">Date</th><th className="text-left">Project / Site</th><th className="text-right">Opening Meter</th><th className="text-right">Closing Meter</th><th className="text-right">Working Hours</th>
      <th className="text-left">Start Time</th><th className="text-left">End Time</th><th className="text-right">Clock Duration</th><th className="text-right">Diesel Issued</th><th className="text-right">Opening Tank</th><th className="text-right">Closing Tank</th><th className="text-right">Diesel Consumed</th><th className="text-right">Expected Diesel</th><th className="text-right">Difference</th><th className="px-2 text-right">Consumption Rate</th>
    </tr></thead><tbody>{daily.length ? daily.map(row => <DailyTableRow key={row.key} row={row} meterUnit={machine?.meterUnit ?? "h"} />) : <tr><td colSpan={15}><Empty title="No daily records are available." detail="This machine has no records in the selected dates." /></td></tr>}</tbody></table></div>
    <div className="border-t pt-3"><Button size="sm" variant="outline" onClick={() => setShowSources(current => !current)}>{showSources ? "Hide Source Records" : "View Source Records"}</Button>
      {showSources && <div className="mt-3 space-y-2">{events.map(event => {
        const href = equipmentSourceHref(event, returnTo);
        return <div key={event.key} className="flex items-center justify-between gap-3 rounded border p-2 text-xs"><span>{date(event.date)} · {event.project}{event.site || event.plant ? ` / ${event.site ?? event.plant}` : ""}</span>{href ? <a href={href} onClick={onSourceNavigate} className="inline-flex items-center gap-1 text-[#20677a]">View Source <ArrowUpRight className="h-3.5 w-3.5" /></a> : <span>—</span>}</div>;
      })}</div>}
    </div>
  </DialogContent></Dialog>;
}

function DailyTableRow({ row, meterUnit }: { row: EquipmentPerformanceDailyRow; meterUnit: "h" | "km" }) {
  const multiple = row.multipleTimeSegments ? " (multiple)" : "";
  return <tr className="border-t border-[#eee8db]"><td className="px-2 py-2">{date(row.date)}</td><td className="px-2 py-2">{row.projectSite || "—"}</td>
    <Numeric>{reading(row.openingMeter, meterUnit)}</Numeric><Numeric>{reading(row.closingMeter, meterUnit)}</Numeric><Numeric>{partialDuration(row.workingHours, row.workingHoursIncomplete)}</Numeric>
    <td>{formatEquipmentTime(row.startTime)}{row.startTime ? multiple : ""}</td><td>{formatEquipmentTime(row.endTime)}{row.endTime ? multiple : ""}</td><Numeric>{partialDuration(row.clockDuration, row.clockDurationIncomplete)}</Numeric>
    <Numeric>{litres(row.dieselIssued)}</Numeric><Numeric>{litres(row.openingTank)}</Numeric><Numeric>{litres(row.closingTank)}</Numeric><Numeric>{consumptionValue(row.dieselConsumed, row.consumptionIncomplete)}</Numeric><Numeric>{litres(row.expectedDiesel)}</Numeric>
    <Numeric>{row.consumptionIncomplete ? "Incomplete" : signedLitres(row.difference)}</Numeric><Numeric className="px-2">{row.consumptionIncomplete ? "Incomplete" : row.consumptionRate == null ? "—" : `${row.consumptionRate.toLocaleString("en-IN", { maximumFractionDigits: 2 })} ${row.consumptionRateUnit}`}</Numeric>
  </tr>;
}

function Filter({ label, children }: { label: string; children: ReactNode }) { return <label className="block"><span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-[#536568]">{label}</span>{children}</label>; }
function NativeSelect({ value, onChange, placeholder, items, fallback = [] }: { value: string; onChange: (value: string) => void; placeholder: string; items: any[]; fallback?: string[] }) { const options = items.length ? items : fallback; return <select value={value} onChange={event => onChange(event.target.value)} className="h-9 w-full rounded-md border border-[#c8c3b6] bg-[#fffdf6] px-2 text-xs outline-none focus:border-[#1d7183]"><option value="">{placeholder}</option>{options.map((item: any) => <option key={String(item.id ?? item.value ?? item)} value={String(item.id ?? item.value ?? item)}>{item.label ?? item.name ?? item}</option>)}</select>; }
function Numeric({ children, className = "" }: { children: ReactNode; className?: string }) { return <td className={`px-2 py-2 text-right font-mono ${className}`}>{children}</td>; }
function partialDuration(value: number | null | undefined, incomplete: boolean) { if (value == null) return "—"; return `${incomplete ? "Partial · " : ""}${formatEquipmentDuration(value)}`; }
function consumptionValue(value: number | null | undefined, incomplete: boolean) { return incomplete || value == null ? "Incomplete" : litres(value); }
function Skeleton() { return <div className="space-y-4">{[0, 1, 2].map(item => <div key={item} className="h-28 animate-pulse rounded-md bg-[#e8e2d3]" />)}</div>; }
function ErrorState({ retry }: { retry: () => void }) { return <div className="equip-panel rounded-md border border-[#d8a999] bg-[#fff7ee] p-10 text-center"><AlertTriangle className="mx-auto h-7 w-7 text-[#aa4933]" /><h2 className="mt-3 font-bold text-[#703725]">Equipment performance could not be loaded</h2><Button className="mt-4" onClick={retry}>Try again</Button></div>; }
function Empty({ title, detail }: { title: string; detail: string }) { return <div className="p-10 text-center"><Truck className="mx-auto h-7 w-7 text-[#9aa7a2]" /><p className="mt-3 font-semibold text-[#304c52]">{title}</p><p className="mt-1 text-xs text-slate-600">{detail}</p></div>; }