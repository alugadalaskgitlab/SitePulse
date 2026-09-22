import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, subDays } from "date-fns";
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  ClipboardX,
  RotateCcw,
  Search,
  Truck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type EquipmentDayStatus =
  | "working"
  | "idle_no_work"
  | "idle_no_operator"
  | "breakdown"
  | "not_logged";

type EquipmentStatusDay = {
  date: string;
  status: EquipmentDayStatus;
  reason?: string | null;
  legacyLogged?: boolean;
  conflict?: boolean;
  records?: unknown[];
};

type EquipmentStatusItem = {
  equipmentId: number | string;
  name: string;
  ownership: string;
  vendorName?: string | null;
  meterType?: string | null;
  summary: {
    working: number;
    idleNoWork: number;
    idleNoOperator: number;
    breakdown: number;
    notLogged: number;
  };
  days: EquipmentStatusDay[];
};

type EquipmentStatusReport = {
  dateFrom: string;
  dateTo: string;
  equipment: EquipmentStatusItem[];
};

const STATUS_META: Record<EquipmentDayStatus, { label: string; classes: string }> = {
  working: { label: "Working", classes: "border-emerald-200 bg-emerald-50 text-emerald-800" },
  idle_no_work: { label: "Idle — No Work", classes: "border-amber-200 bg-amber-50 text-amber-800" },
  idle_no_operator: { label: "Idle — No Operator", classes: "border-orange-200 bg-orange-50 text-orange-800" },
  breakdown: { label: "Breakdown", classes: "border-red-200 bg-red-50 text-red-800" },
  not_logged: { label: "Not Logged", classes: "border-slate-300 bg-slate-100 text-slate-700" },
};

const initialDateTo = format(new Date(), "yyyy-MM-dd");
const initialDateFrom = format(subDays(new Date(), 29), "yyyy-MM-dd");

function readableDate(value: string) {
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? value : format(parsed, "dd MMM yyyy");
}

export default function EquipmentStatus() {
  const [dateFrom, setDateFrom] = useState(initialDateFrom);
  const [dateTo, setDateTo] = useState(initialDateTo);
  const [search, setSearch] = useState("");
  const [ownership, setOwnership] = useState("all");
  const [status, setStatus] = useState<EquipmentDayStatus | "all">("all");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const invalidRange = Boolean(dateFrom && dateTo && dateFrom > dateTo);

  const report = useQuery<EquipmentStatusReport>({
    queryKey: ["/api/reports/equipment-status", dateFrom, dateTo],
    queryFn: async () => {
      const params = new URLSearchParams({ dateFrom, dateTo });
      const response = await fetch(`/api/reports/equipment-status?${params}`, { credentials: "include" });
      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || "Equipment status could not be loaded");
      }
      return response.json();
    },
    enabled: Boolean(dateFrom && dateTo && !invalidRange),
  });

  const equipment = report.data?.equipment ?? [];
  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return equipment.filter(item => {
      if (ownership !== "all" && item.ownership.toLowerCase() !== ownership) return false;
      if (status !== "all" && !item.days.some(day => day.status === status)) return false;
      if (needle && !`${item.name} ${item.vendorName ?? ""}`.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [equipment, ownership, search, status]);

  const totals = useMemo(() => equipment.reduce(
    (sum, item) => ({
      working: sum.working + item.summary.working,
      idle: sum.idle + item.summary.idleNoWork + item.summary.idleNoOperator,
      breakdown: sum.breakdown + item.summary.breakdown,
      notLogged: sum.notLogged + item.summary.notLogged,
    }),
    { working: 0, idle: 0, breakdown: 0, notLogged: 0 },
  ), [equipment]);

  const toggle = (id: string) => setExpanded(current => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });

  const reset = () => {
    setDateFrom(initialDateFrom);
    setDateTo(initialDateTo);
    setSearch("");
    setOwnership("all");
    setStatus("all");
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6" data-testid="page-equipment-status">
      <header className="border-b-2 border-[#173f49] pb-5">
        <p className="text-sm font-medium text-slate-500">Equipment &amp; Fleet</p>
        <h1 className="text-3xl font-bold tracking-tight text-[#173f49] md:text-4xl">FLEET / EQUIPMENT STATUS</h1>
        <p className="mt-1 text-sm text-slate-600">
          Daily working, idle, breakdown and unlogged status for owned and hired machines.
        </p>
      </header>

      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm" aria-label="Report filters">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Filter label="From date">
            <Input aria-label="From date" type="date" value={dateFrom} onChange={event => setDateFrom(event.target.value)} />
          </Filter>
          <Filter label="To date">
            <Input aria-label="To date" type="date" value={dateTo} onChange={event => setDateTo(event.target.value)} />
          </Filter>
          <Filter label="Machine or vendor">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
              <Input aria-label="Machine or vendor" value={search} onChange={event => setSearch(event.target.value)} className="pl-8" placeholder="Search fleet" />
            </div>
          </Filter>
          <Filter label="Ownership">
            <select aria-label="Ownership" value={ownership} onChange={event => setOwnership(event.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
              <option value="all">Owned &amp; hired</option>
              <option value="owned">Owned</option>
              <option value="hired">Hired</option>
            </select>
          </Filter>
          <Filter label="Status">
            <select aria-label="Status" value={status} onChange={event => setStatus(event.target.value as EquipmentDayStatus | "all")} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
              <option value="all">All statuses</option>
              {Object.entries(STATUS_META).map(([value, meta]) => <option key={value} value={value}>{meta.label}</option>)}
            </select>
          </Filter>
        </div>
        <div className="mt-3 flex items-center justify-between gap-3">
          {invalidRange ? <p className="text-sm font-medium text-red-700" role="alert">From date must be on or before To date.</p> : <span />}
          <Button variant="outline" size="sm" onClick={reset}><RotateCcw className="mr-1.5 h-3.5 w-3.5" />Reset</Button>
        </div>
      </section>

      {!invalidRange && !report.isLoading && !report.isError && (
        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Fleet status totals">
          <TotalCard label="Working" value={totals.working} classes="border-emerald-200 text-emerald-800" />
          <TotalCard label="Idle" value={totals.idle} classes="border-amber-200 text-amber-800" />
          <TotalCard label="Breakdown" value={totals.breakdown} classes="border-red-200 text-red-800" />
          <TotalCard label="Not Logged" value={totals.notLogged} classes="border-slate-300 text-slate-700" />
        </section>
      )}

      {report.isLoading ? <LoadingState /> : report.isError ? <ErrorState error={report.error} retry={() => report.refetch()} /> : !invalidRange && (
        <section className="space-y-3" aria-live="polite">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-slate-800">Machines</h2>
            <span className="text-sm text-slate-500">{rows.length} of {equipment.length}</span>
          </div>
          {rows.length === 0 ? <EmptyState /> : rows.map(item => {
            const key = String(item.equipmentId);
            const open = expanded.has(key);
            return (
              <article key={key} className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm" data-testid={`equipment-status-${key}`}>
                <button type="button" aria-expanded={open} onClick={() => toggle(key)} className="flex w-full items-start gap-3 p-4 text-left hover:bg-slate-50">
                  <div className="mt-1 rounded-md bg-slate-100 p-2"><Truck className="h-5 w-5 text-[#286475]" /></div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <h3 className="font-semibold text-slate-900">{item.name}</h3>
                      <span className="rounded-full border border-slate-200 px-2 py-0.5 text-[11px] font-medium capitalize text-slate-600">{item.ownership}</span>
                      {item.meterType && <span className="text-xs text-slate-400">{item.meterType}</span>}
                    </div>
                    {item.vendorName && <p className="mt-0.5 text-xs text-slate-500">{item.vendorName}</p>}
                    <Summary summary={item.summary} />
                  </div>
                  {open ? <ChevronDown className="mt-1 h-5 w-5 text-slate-400" /> : <ChevronRight className="mt-1 h-5 w-5 text-slate-400" />}
                </button>
                {open && <DayDetails days={item.days} />}
              </article>
            );
          })}
        </section>
      )}
    </div>
  );
}

function Filter({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="min-w-0"><span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</span>{children}</label>;
}

function TotalCard({ label, value, classes }: { label: string; value: number; classes: string }) {
  return <div className={`rounded-lg border bg-white p-4 shadow-sm ${classes}`}><p className="text-xs font-semibold uppercase tracking-wide">{label}</p><p className="mt-1 text-3xl font-bold">{value}</p><p className="text-xs text-slate-500">machine-days</p></div>;
}

function Summary({ summary }: { summary: EquipmentStatusItem["summary"] }) {
  const values = [
    ["Working", summary.working, "text-emerald-700"],
    ["Idle · No Work", summary.idleNoWork, "text-amber-700"],
    ["Idle · No Operator", summary.idleNoOperator, "text-orange-700"],
    ["Breakdown", summary.breakdown, "text-red-700"],
    ["Not Logged", summary.notLogged, "text-slate-600"],
  ] as const;
  return <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3 lg:grid-cols-5">{values.map(([label, value, color]) => <div key={label} className="text-xs"><strong className={`mr-1 text-base ${color}`}>{value}</strong><span className="text-slate-500">{label}</span></div>)}</div>;
}

function DayDetails({ days }: { days: EquipmentStatusDay[] }) {
  return (
    <div className="border-t border-slate-200 bg-slate-50 p-3 sm:p-4">
      <div className="grid gap-2">
        {days.map((day, index) => {
          const meta = STATUS_META[day.status] ?? STATUS_META.not_logged;
          return (
            <div key={`${day.date}-${index}`} className="rounded-md border border-slate-200 bg-white p-3" data-testid={`equipment-day-${day.date}`}>
              <div className="flex flex-wrap items-center gap-2">
                <time className="min-w-24 text-sm font-semibold text-slate-800" dateTime={day.date}>{readableDate(day.date)}</time>
                <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${meta.classes}`}>{meta.label}</span>
                {day.legacyLogged && <span className="rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-xs font-medium text-violet-800">Legacy log · status unspecified</span>}
                {day.conflict && <span className="rounded-full border border-red-300 bg-red-100 px-2 py-0.5 text-xs font-bold text-red-800">Conflicting records</span>}
              </div>
              {day.reason && <p className="mt-2 text-sm text-slate-700"><span className="font-medium">Reason:</span> {day.reason}</p>}
              {day.conflict && day.records && day.records.length > 0 && (
                <div className="mt-2 rounded border border-red-200 bg-red-50 p-2 text-xs text-red-900">
                  <p className="mb-1 font-semibold">Source records ({day.records.length})</p>
                  {day.records.map((record, recordIndex) => <p key={recordIndex} className="break-words">{describeRecord(record)}</p>)}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function describeRecord(record: unknown) {
  if (record == null) return "Empty record";
  if (typeof record !== "object") return String(record);
  const values = Object.entries(record as Record<string, unknown>)
    .filter(([, value]) => value != null && typeof value !== "object")
    .map(([key, value]) => `${key}: ${String(value)}`);
  return values.length ? values.join(" · ") : JSON.stringify(record);
}

function LoadingState() {
  return <div className="space-y-3" aria-label="Loading equipment status">{[0, 1, 2].map(value => <div key={value} className="h-28 animate-pulse rounded-lg bg-slate-200" />)}</div>;
}

function ErrorState({ error, retry }: { error: Error | null; retry: () => void }) {
  return <div className="rounded-lg border border-red-200 bg-red-50 p-10 text-center" role="alert"><AlertTriangle className="mx-auto h-8 w-8 text-red-600" /><h2 className="mt-3 font-semibold text-red-900">Equipment status could not be loaded</h2><p className="mt-1 text-sm text-red-700">{error?.message || "Check your connection and try again."}</p><Button className="mt-4" onClick={retry}>Try again</Button></div>;
}

function EmptyState() {
  return <div className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center"><ClipboardX className="mx-auto h-8 w-8 text-slate-400" /><h2 className="mt-3 font-semibold text-slate-700">No equipment matches these filters</h2><p className="mt-1 text-sm text-slate-500">Adjust the date range or clear a fleet filter.</p></div>;
}