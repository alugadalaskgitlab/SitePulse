import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, startOfMonth } from "date-fns";
import * as XLSX from "xlsx";
import { ArrowLeft, AlertTriangle, ChevronDown, ChevronRight, ClipboardX, Download, FileSpreadsheet, Printer, Truck } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type EquipmentDayStatus =
  | "working"
  | "idle_no_work"
  | "idle_no_operator"
  | "breakdown"
  | "logged_unspecified"
  | "not_logged";

type EquipmentStatusDay = {
  date: string;
  status: EquipmentDayStatus;
  reason?: string | null;
  source?: "recorded_status" | "maintenance_log" | "both" | "none";
  maintenanceLogs?: Array<{ id: number; description: string | null }>;
  legacyLogged?: boolean;
  conflict?: boolean;
  records?: unknown[];
};

type EquipmentStatusItem = {
  equipmentId: number | string;
  name: string;
  ownership: string | null;
  vendorName?: string | null;
  meterType?: string | null;
  summary: {
    working: number;
    idleNoWork: number;
    idleNoOperator: number;
    breakdown: number;
    loggedUnspecified: number;
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
  idle_no_work: { label: "Idle · No Work Available", classes: "border-amber-200 bg-amber-50 text-amber-800" },
  idle_no_operator: { label: "Idle · Operator Unavailable", classes: "border-orange-200 bg-orange-50 text-orange-800" },
  breakdown: { label: "Breakdown", classes: "border-red-200 bg-red-50 text-red-800" },
  logged_unspecified: { label: "Logged (status not specified)", classes: "border-violet-200 bg-violet-50 text-violet-800" },
  not_logged: { label: "Not Logged", classes: "border-slate-300 bg-slate-100 text-slate-700" },
};

const sourceLabel = (source: EquipmentStatusDay["source"]) => ({
  recorded_status: "Recorded status",
  maintenance_log: "Maintenance log",
  both: "Recorded status and maintenance log",
  none: "No record",
}[source || "none"]);

const today = new Date();
const initialDateTo = format(today, "yyyy-MM-dd");
const initialDateFrom = format(startOfMonth(today), "yyyy-MM-dd");

function readableDate(value: string) {
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? value : format(parsed, "dd MMM yyyy");
}

function returnPath() {
  const requested = new URLSearchParams(window.location.search).get("returnTo") || "/reports/hub";
  return requested.startsWith("/") && !requested.startsWith("//") ? requested : "/reports/hub";
}

export default function EquipmentStatus() {
  const [dateFrom, setDateFrom] = useState(initialDateFrom);
  const [dateTo, setDateTo] = useState(initialDateTo);
  const [equipmentId, setEquipmentId] = useState("all");
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
  const rows = useMemo(() => equipmentId === "all"
    ? equipment
    : equipment.filter(item => String(item.equipmentId) === equipmentId),
  [equipment, equipmentId]);
  const totals = useMemo(() => rows.reduce(
    (sum, item) => ({
      working: sum.working + item.summary.working,
      idleNoWork: sum.idleNoWork + item.summary.idleNoWork,
      idleNoOperator: sum.idleNoOperator + item.summary.idleNoOperator,
      breakdown: sum.breakdown + item.summary.breakdown,
      loggedUnspecified: sum.loggedUnspecified + item.summary.loggedUnspecified,
      notLogged: sum.notLogged + item.summary.notLogged,
    }),
    { working: 0, idleNoWork: 0, idleNoOperator: 0, breakdown: 0, loggedUnspecified: 0, notLogged: 0 },
  ), [rows]);

  const toggle = (id: string) => setExpanded(current => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });

  const reset = () => {
    setDateFrom(initialDateFrom);
    setDateTo(initialDateTo);
    setEquipmentId("all");
  };

  const exportExcel = () => {
    const summary = rows.map(item => ({
      Machine: item.name,
      Ownership: item.ownership || "",
      Vendor: item.vendorName || "",
      "Working": item.summary.working,
      "Idle · No Work Available": item.summary.idleNoWork,
      "Idle · Operator Unavailable": item.summary.idleNoOperator,
      "Breakdown": item.summary.breakdown,
      "Logged (status not specified)": item.summary.loggedUnspecified,
      "Not Logged": item.summary.notLogged,
    }));
    const daily = rows.flatMap(item => item.days.map(day => ({
      Machine: item.name,
      Date: day.date,
      Status: STATUS_META[day.status]?.label ?? day.status,
      Source: sourceLabel(day.source),
      Reason: day.reason || "",
      "Maintenance log details": (day.maintenanceLogs || []).map(log => log.description || `Log ${log.id}`).join(" · "),
      Conflict: day.conflict ? "Yes" : "No",
    })));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(summary), "Summary");
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(daily), "Daily Status");
    XLSX.writeFile(workbook, `equipment-status-${dateFrom}-to-${dateTo}.xlsx`);
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6" data-testid="page-equipment-status">
      <style>{`
        .equipment-status-print { display: none; }
        @media print {
          .equipment-status-no-print { display: none !important; }
          .equipment-status-print { display: block !important; }
          body { background: white !important; }
          .equipment-status-print table { border-collapse: collapse; width: 100%; font-size: 9pt; }
          .equipment-status-print th, .equipment-status-print td { border: 1px solid #64748b; padding: 4px; text-align: left; }
          .equipment-status-print th { background: #e2e8f0 !important; }
          .equipment-status-print article { break-inside: avoid; margin-bottom: 16px; }
        }
      `}</style>
      <div className="equipment-status-no-print">
        <header className="flex flex-wrap items-start justify-between gap-3 border-b-2 border-[#173f49] pb-5">
          <div>
            <Link href={returnPath()} className="mb-3 inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900">
              <ArrowLeft className="h-4 w-4" /> Back to reports
            </Link>
            <p className="text-sm font-medium text-slate-500">Equipment &amp; Fleet</p>
            <h1 className="text-3xl font-bold tracking-tight text-[#173f49] md:text-4xl">EQUIPMENT STATUS</h1>
            <p className="mt-1 text-sm text-slate-600">Recorded machine status and maintenance breakdown evidence. This report is read-only.</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => window.print()} disabled={report.isLoading || report.isError}>
              <Printer className="mr-1.5 h-4 w-4" /> Print
            </Button>
            <Button variant="outline" size="sm" onClick={exportExcel} disabled={report.isLoading || report.isError || rows.length === 0}>
              <FileSpreadsheet className="mr-1.5 h-4 w-4" /> Export Excel
            </Button>
          </div>
        </header>

        <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm" aria-label="Report filters">
          <div className="grid gap-3 sm:grid-cols-3">
            <Filter label="From date">
              <Input aria-label="From date" type="date" value={dateFrom} onChange={event => setDateFrom(event.target.value)} />
            </Filter>
            <Filter label="To date">
              <Input aria-label="To date" type="date" value={dateTo} onChange={event => setDateTo(event.target.value)} />
            </Filter>
            <Filter label="Machine">
              <select aria-label="Machine" value={equipmentId} onChange={event => setEquipmentId(event.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                <option value="all">All permitted machines</option>
                {equipment.map(item => <option key={item.equipmentId} value={String(item.equipmentId)}>{item.name}{item.vendorName ? ` · ${item.vendorName}` : ""}</option>)}
              </select>
            </Filter>
          </div>
          <div className="mt-3 flex items-center justify-between gap-3">
            {invalidRange ? <p className="text-sm font-medium text-red-700" role="alert">From date must be on or before To date.</p> : <span />}
            <Button variant="outline" size="sm" onClick={reset}><Download className="mr-1.5 h-3.5 w-3.5 rotate-180" />Reset</Button>
          </div>
        </section>

        {report.isLoading ? <LoadingState /> : report.isError ? <ErrorState error={report.error} retry={() => report.refetch()} /> : !invalidRange && (
          <>
            <section className="grid grid-cols-2 gap-3 lg:grid-cols-6" aria-label="Status totals">
              <TotalCard label="Working" value={totals.working} classes="border-emerald-200 text-emerald-800" />
              <TotalCard label="Idle · No Work Available" value={totals.idleNoWork} classes="border-amber-200 text-amber-800" />
              <TotalCard label="Idle · Operator Unavailable" value={totals.idleNoOperator} classes="border-orange-200 text-orange-800" />
              <TotalCard label="Breakdown" value={totals.breakdown} classes="border-red-200 text-red-800" />
              <TotalCard label="Logged (status not specified)" value={totals.loggedUnspecified} classes="border-violet-200 text-violet-800" />
              <TotalCard label="Not Logged" value={totals.notLogged} classes="border-slate-300 text-slate-700" />
            </section>

            <section className="space-y-3" aria-live="polite">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-slate-800">Machine status by day</h2>
                <span className="text-sm text-slate-500">{rows.length} machine{rows.length === 1 ? "" : "s"}</span>
              </div>
              {rows.length === 0 ? <EmptyState /> : (
                <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
                  <table className="w-full min-w-[1080px] text-sm">
                    <thead className="bg-slate-100 text-xs text-slate-600">
                      <tr>
                        <th className="p-3 text-left">Machine</th>
                        <th className="p-3 text-right">Working</th>
                        <th className="p-3 text-right">Idle · No Work Available</th>
                        <th className="p-3 text-right">Idle · Operator Unavailable</th>
                        <th className="p-3 text-right">Breakdown</th>
                        <th className="p-3 text-right">Logged (status not specified)</th>
                        <th className="p-3 text-right">Not Logged</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map(item => {
                        const key = String(item.equipmentId);
                        const open = expanded.has(key);
                        return (
                          <FragmentRows
                            key={key}
                            item={item}
                            open={open}
                            onToggle={() => toggle(key)}
                          />
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}
      </div>

      {!report.isLoading && !report.isError && !invalidRange && (
        <section className="equipment-status-print" aria-label="Printable equipment status report">
          <h1>Equipment Status</h1>
          <p>{dateFrom} to {dateTo}</p>
          {rows.map(item => (
            <article key={item.equipmentId}>
              <h2>{item.name}{item.vendorName ? ` · ${item.vendorName}` : ""}</h2>
              <table>
                <thead><tr><th>Working</th><th>Idle · No Work Available</th><th>Idle · Operator Unavailable</th><th>Breakdown</th><th>Logged (status not specified)</th><th>Not Logged</th></tr></thead>
                <tbody><tr><td>{item.summary.working}</td><td>{item.summary.idleNoWork}</td><td>{item.summary.idleNoOperator}</td><td>{item.summary.breakdown}</td><td>{item.summary.loggedUnspecified}</td><td>{item.summary.notLogged}</td></tr></tbody>
              </table>
              <table>
                <thead><tr><th>Date</th><th>Status</th><th>Source</th><th>Reason / maintenance detail</th><th>Conflict</th></tr></thead>
                <tbody>{item.days.map(day => (
                  <tr key={day.date}>
                    <td>{day.date}</td>
                    <td>{STATUS_META[day.status]?.label ?? day.status}</td>
                    <td>{sourceLabel(day.source)}</td>
                    <td>{[day.reason, ...(day.maintenanceLogs || []).map(log => log.description).filter(Boolean)].filter(Boolean).join(" · ")}</td>
                    <td>{day.conflict ? "Yes" : "No"}</td>
                  </tr>
                ))}</tbody>
              </table>
            </article>
          ))}
        </section>
      )}
    </div>
  );
}

function FragmentRows({ item, open, onToggle }: {
  item: EquipmentStatusItem;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      <tr className="border-t hover:bg-slate-50">
        <th scope="row" className="p-3 text-left">
          <button type="button" aria-expanded={open} onClick={onToggle} className="flex items-center gap-2 text-left">
            {open ? <ChevronDown className="h-4 w-4 text-slate-500" /> : <ChevronRight className="h-4 w-4 text-slate-500" />}
            <Truck className="h-4 w-4 text-[#286475]" />
            <span>
              <strong>{item.name}</strong>
              <span className="block text-xs font-normal text-slate-500">{item.ownership || "—"}{item.vendorName ? ` · ${item.vendorName}` : ""}</span>
            </span>
          </button>
        </th>
        <td className="p-3 text-right tabular-nums">{item.summary.working}</td>
        <td className="p-3 text-right tabular-nums">{item.summary.idleNoWork}</td>
        <td className="p-3 text-right tabular-nums">{item.summary.idleNoOperator}</td>
        <td className="p-3 text-right tabular-nums">{item.summary.breakdown}</td>
        <td className="p-3 text-right tabular-nums">{item.summary.loggedUnspecified}</td>
        <td className="p-3 text-right tabular-nums">{item.summary.notLogged}</td>
      </tr>
      {open && <tr className="border-t bg-slate-50"><td colSpan={7} className="p-3"><DayDetails days={item.days} /></td></tr>}
    </>
  );
}

function Filter({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="min-w-0"><span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</span>{children}</label>;
}

function TotalCard({ label, value, classes }: { label: string; value: number; classes: string }) {
  return <div className={`rounded-lg border bg-white p-4 shadow-sm ${classes}`}><p className="text-xs font-semibold uppercase tracking-wide">{label}</p><p className="mt-1 text-3xl font-bold">{value}</p><p className="text-xs text-slate-500">machine-days</p></div>;
}

function DayDetails({ days }: { days: EquipmentStatusDay[] }) {
  return (
    <div className="grid gap-2">
      {days.map(day => {
        const meta = STATUS_META[day.status] ?? STATUS_META.not_logged;
        return (
          <div key={day.date} className="rounded-md border border-slate-200 bg-white p-3" data-testid={`equipment-day-${day.date}`}>
            <div className="flex flex-wrap items-center gap-2">
              <time className="min-w-24 text-sm font-semibold text-slate-800" dateTime={day.date}>{readableDate(day.date)}</time>
              <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${meta.classes}`}>{meta.label}</span>
              <span className="rounded border border-slate-200 px-2 py-0.5 text-xs text-slate-600">{sourceLabel(day.source)}</span>
              {day.legacyLogged && <span className="rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-xs font-medium text-violet-800">Legacy log · status unspecified</span>}
              {day.conflict && <span className="rounded-full border border-red-300 bg-red-100 px-2 py-0.5 text-xs font-bold text-red-800">Conflicting records</span>}
            </div>
            {day.reason && <p className="mt-2 text-sm text-slate-700"><span className="font-medium">Reason:</span> {day.reason}</p>}
            {(day.maintenanceLogs || []).map(log => log.description && (
              <p key={log.id} className="mt-2 text-sm text-slate-700"><span className="font-medium">Maintenance log:</span> {log.description}</p>
            ))}
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
  return <div className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center"><ClipboardX className="mx-auto h-8 w-8 text-slate-400" /><h2 className="mt-3 font-semibold text-slate-700">No machines match this filter</h2><p className="mt-1 text-sm text-slate-500">Choose another machine or date range.</p></div>;
}
