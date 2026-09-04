import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Activity, AlertTriangle, ArrowUpRight, Check, ChevronRight, Crosshair, Fuel, RotateCcw, Search, ShieldCheck, Truck, X } from "lucide-react";
import { Area, AreaChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-context";
import {
  normalizeEquipmentLabel,
  type EquipmentPerformanceEvent,
  type EquipmentPerformanceFleetRow,
  type EquipmentPerformanceReport,
} from "@shared/equipmentPerformance";

type AnyRow = Record<string, any>;
type Filters = { dateFrom: string; dateTo: string; projectId: string; scope: string; ownership: string; equipmentType: string; equipmentId: string };
type FleetRow = EquipmentPerformanceFleetRow;
type Report = EquipmentPerformanceReport;
type EquipmentOption = Report["filterOptions"]["equipment"][number];
const n = (value: unknown) => Number(value ?? 0);
const hours = (value: unknown) => `${n(value).toLocaleString("en-IN", { maximumFractionDigits: 1 })} h`;
const date = (value: unknown) => value ? format(new Date(String(value)), "dd MMM") : "—";
const nameOf = (r: AnyRow) => r.equipmentName ?? r.name ?? r.equipment?.name ?? "Unclassified machine";

function selectOptions(data: AnyRow | undefined, name: string) {
  const candidates = data?.filterOptions?.[name] ?? data?.[`${name}s`] ?? [];
  return Array.isArray(candidates) ? candidates : [];
}

export default function EquipmentPerformanceReport() {
  const { toast } = useToast();
  const { isAdmin, isOwner } = useAuth();
  const canReview = isAdmin || isOwner;
  const qc = useQueryClient();
  const [filters, setFilters] = useState<Filters>(() => ({ dateFrom: "", dateTo: format(new Date(), "yyyy-MM-dd"), projectId: "", scope: "", ownership: "", equipmentType: "", equipmentId: "" }));
  const [openMachine, setOpenMachine] = useState<FleetRow | null>(null);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const params = useMemo(() => {
    const p = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => { if (v && v !== "all") p.set(k, v); });
    return p.toString();
  }, [filters]);
  const key = ["/api/reports/equipment-performance", params] as const;
  const report = useQuery<Report>({
    queryKey: key,
    queryFn: async () => {
      const res = await fetch(`/api/reports/equipment-performance?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  });
  const confirm = useMutation({
    mutationFn: async ({ logId, equipmentId }: { logId: string | number; equipmentId: string | number }) => {
      const res = await apiRequest("POST", `/api/reports/equipment-performance/logs/${logId}/confirm`, { equipmentId });
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/reports/equipment-performance"] });
      toast({ title: "Attribution confirmed", description: "The log now belongs to the selected machine." });
    },
    onError: () => toast({ title: "Could not confirm attribution", variant: "destructive" }),
  });
  const events = (report.data?.events ?? []) as EquipmentPerformanceEvent[];
  const rows = report.data?.fleet ?? [];
  const reviews = (report.data?.reviewRows ?? []).filter((r) => !dismissed.has(String(r.logId)));
  const totals = report.data?.totals;
  const machineEvents = useMemo(() => {
    if (!openMachine) return [];
    if (openMachine.equipmentId != null) {
      return events.filter((event) => event.equipmentId === openMachine.equipmentId);
    }
    const normalized = normalizeEquipmentLabel(openMachine.machine);
    return events.filter((event) =>
      event.confidence === "unclassified" && normalizeEquipmentLabel(event.machine) === normalized,
    );
  }, [events, openMachine]);
  const set = (key: keyof Filters, value: string) => setFilters(old => ({ ...old, [key]: value }));
  const reset = () => setFilters({ dateFrom: "", dateTo: format(new Date(), "yyyy-MM-dd"), projectId: "", scope: "", ownership: "", equipmentType: "", equipmentId: "" });

  return <div className="equip-shell -mx-4 -mt-6 min-h-[100dvh] px-4 py-7 md:-mx-8 md:px-8" data-testid="page-equipment-performance">
    <div className="mx-auto max-w-[1500px] space-y-5">
      <header className="equip-enter flex flex-col justify-between gap-5 border-b-2 border-[#173f49] pb-5 lg:flex-row lg:items-end">
        <div>
          <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[.18em] text-[#25657a]"><Crosshair className="h-3.5 w-3.5" /> SitePulse / Equipment intelligence</div>
          <h1 className="text-3xl font-bold tracking-[-.045em] text-[#173f49] md:text-4xl">Fleet performance ledger</h1>
          <p className="mt-1 text-sm text-slate-600">One attributable record per usage event. No double-counting across plant and site logs.</p>
        </div>
        <div className="equip-mono rounded-sm bg-[#173f49] px-4 py-3 text-xs text-[#f3e6ba]"><span className="text-[#9fc3ca]">CONTROL WINDOW</span><br />{filters.dateFrom ? date(filters.dateFrom) : "FIRST RECORDED EVENT"} — {date(filters.dateTo)} / LIVE</div>
      </header>

      <section className="equip-panel equip-enter rounded-md border border-[#cfc8b8] bg-[#faf7ed] p-3" style={{ animationDelay: "70ms" }}>
        <div className="grid gap-2 md:grid-cols-4 xl:grid-cols-7">
          <Filter label="From"><Input type="date" value={filters.dateFrom} onChange={e => set("dateFrom", e.target.value)} className="h-9 bg-[#fffdf6]" /></Filter>
          <Filter label="To"><Input type="date" value={filters.dateTo} onChange={e => set("dateTo", e.target.value)} className="h-9 bg-[#fffdf6]" /></Filter>
          <Filter label="Project"><NativeSelect value={filters.projectId} onChange={v => set("projectId", v)} placeholder="All projects" items={selectOptions(report.data, "projects")} /></Filter>
          <Filter label="Scope"><NativeSelect value={filters.scope} onChange={v => set("scope", v)} placeholder="All scopes" items={selectOptions(report.data, "scopes")} fallback={["site", "plant"]} /></Filter>
          <Filter label="Ownership"><NativeSelect value={filters.ownership} onChange={v => set("ownership", v)} placeholder="Owned + hired" items={selectOptions(report.data, "ownership")} fallback={["owned", "hired"]} /></Filter>
          <Filter label="Machine type"><NativeSelect value={filters.equipmentType} onChange={v => set("equipmentType", v)} placeholder="All types" items={selectOptions(report.data, "equipmentTypes")} /><div className="mt-2"><NativeSelect value={filters.equipmentId} onChange={v => set("equipmentId", v)} placeholder="Specific machine" items={selectOptions(report.data, "equipment")} /></div></Filter>
          <div className="flex items-end gap-2"><Button variant="outline" className="h-9 border-[#9fb4b8] bg-transparent" onClick={reset}><RotateCcw className="mr-1.5 h-3.5 w-3.5" />Reset</Button></div>
        </div>
      </section>

      {report.isLoading ? <Skeleton /> : report.isError ? <ErrorState retry={() => report.refetch()} /> : <>
        <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Metric label="Fleet usage" value={basisTotal(totals)} accent="teal" note={`${n(totals?.activeDays)} active fleet-days`} />
          <Metric label="Diesel variance" value={`${n(totals?.dieselVariance) > 0 ? "+" : ""}${litres(totals?.dieselVariance)}`} accent={n(totals?.dieselVariance) > 0 ? "amber" : "teal"} note={`${litres(totals?.dieselActual)} actual / ${litres(totals?.dieselExpected)} expected`} />
          <Metric label="Diesel efficiency" value={totals?.efficiencyPercent != null ? `${n(totals.efficiencyPercent).toFixed(1)}%` : "—"} accent="yellow" note="expected ÷ actual diesel" />
          <Metric label="Needs attribution" value={String(reviews.length)} accent={reviews.length ? "red" : "teal"} note={reviews.length ? "owner decisions waiting" : "ledger fully classified"} />
        </section>

        <section className="grid gap-5 xl:grid-cols-[1fr_330px]">
          <div className="equip-panel overflow-hidden rounded-md border border-[#cfc8b8] bg-[#fffdf6]">
            <div className="flex items-center justify-between border-b border-[#d9d2c2] px-4 py-3">
              <div><h2 className="font-bold text-[#173f49]">Machine register</h2><p className="text-xs text-slate-600">Click a machine for its source-level ledger</p></div>
              <span className="equip-mono text-[10px] tracking-wider text-[#5b6c6f]">{rows.length} MACHINES</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[920px] text-left text-xs">
                <thead className="equip-mono bg-[#e8e2d3] text-[10px] uppercase tracking-wider text-[#43575a]"><tr><th className="px-4 py-2.5">Machine / confidence</th><th>Active</th><th className="text-right">Usage</th><th className="text-right">Diesel actual</th><th className="text-right">Expected</th><th className="text-right">Variance</th><th className="text-right">Efficiency</th><th>Last use / location</th><th></th></tr></thead>
                <tbody>{rows.length ? rows.map((r) => <tr key={r.key} className="equip-row cursor-pointer border-t border-[#e4dece]" onClick={() => setOpenMachine(r)}>
                  <td className="px-4 py-3"><div className="font-semibold text-[#193f48]">{r.machine}</div><div className="mt-0.5 text-[10px] uppercase tracking-wider text-slate-500">{r.ownership} / {r.equipmentType ?? "untyped"}</div><div className="mt-1"><ConfidenceState value={r.confidence} /></div></td>
                  <td className="text-slate-600">{r.activeDays} days</td><td className="equip-mono text-right font-medium">{rowBasis(r)}</td><td className="equip-mono text-right">{litres(r.dieselActual)}</td><td className="equip-mono text-right">{litres(r.dieselExpected)}</td>
                  <td className={`equip-mono text-right font-semibold ${n(r.dieselVariance) > 0 ? "text-[#ad4b32]" : "text-[#187065]"}`}>{r.dieselVariance == null ? "—" : `${n(r.dieselVariance) > 0 ? "+" : ""}${litres(r.dieselVariance)}`}</td>
                  <td className="equip-mono text-right">{r.efficiencyPercent == null ? "—" : `${r.efficiencyPercent.toFixed(1)}%`}</td><td><div>{date(r.lastUsedDate)} · {r.currentStatus ?? "status not logged"}</div><div className="text-[11px] capitalize text-slate-500">{r.currentLocation ?? "location not logged"}</div><div className="text-[10px] text-[#537076]">{r.ownership === "hired" ? r.hired?.utilizationPercent == null ? "Hire window incomplete" : `${r.hired.utilizationPercent.toFixed(0)}% window used · ${r.hired.gapDays} gap days` : r.ownership === "owned" ? `${r.owned?.daysSinceLastUse ?? 0} days since last use` : "Unclassified source event"}</div>{r.dataQualityWarnings.length > 0 && <div className="mt-1 text-[10px] text-[#a25132]">{r.dataQualityWarnings.length} data-quality warning{r.dataQualityWarnings.length === 1 ? "" : "s"}</div>}</td><td className="pr-4"><ChevronRight className="h-4 w-4 text-[#25657a]" /></td>
                 </tr>) : <tr><td colSpan={9}><Empty title="No fleet activity matches this control window." detail="Adjust the date range or clear a filter to see attributed usage." /></td></tr>}</tbody>
              </table>
            </div>
          </div>
          {canReview
            ? <ReviewPanel
                rows={reviews}
                equipmentOptions={report.data?.filterOptions.equipment ?? []}
                onDismiss={id => setDismissed(old => new Set(old).add(String(id)))}
                onConfirm={(r, equipmentId) => confirm.mutate({ logId: r.logId, equipmentId })}
                busy={confirm.isPending}
              />
            : <ReviewReadOnly count={reviews.length} />}
        </section>

        <section className="grid gap-5 xl:grid-cols-[1.4fr_.9fr]">
          <EventLedger events={events} />
          <Trend events={events} />
        </section>
        {canReview && <LegacyCorrectionPanel
            events={events.filter((event) =>
              event.source === "dpr_log" &&
              event.confidence === "confirmed_legacy_match" &&
              event.reference.equipmentLogId != null,
            )}
            equipmentOptions={report.data?.filterOptions.equipment ?? []}
            onCorrect={(event, equipmentId) => confirm.mutate({ logId: event.reference.equipmentLogId!, equipmentId })}
            busy={confirm.isPending}
          />}
      </>}
    </div>
    <MachineDialog machine={openMachine} events={machineEvents} close={() => setOpenMachine(null)} />
  </div>;
}

function Filter({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block"><span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-[#536568]">{label}</span>{children}</label>; }
function NativeSelect({ value, onChange, placeholder, items, fallback = [] }: { value: string; onChange: (v: string) => void; placeholder: string; items: any[]; fallback?: string[] }) { const options = items.length ? items : fallback; return <select value={value} onChange={e => onChange(e.target.value)} className="h-9 w-full rounded-md border border-[#c8c3b6] bg-[#fffdf6] px-2 text-xs outline-none focus:border-[#1d7183]"><option value="">{placeholder}</option>{options.map((x: any) => <option key={String(x.id ?? x.value ?? x)} value={String(x.id ?? x.value ?? x)}>{x.name ?? x.label ?? x}</option>)}</select>; }
function Metric({ label, value, note, accent }: { label: string; value: string; note: string; accent: "teal" | "amber" | "yellow" | "red" }) { const colors = { teal: "border-t-[#1c746b]", amber: "border-t-[#d28324]", yellow: "border-t-[#e6b332]", red: "border-t-[#b44d35]" }; return <div className={`equip-panel equip-enter border border-[#cbc5b7] border-t-4 bg-[#fffdf6] p-4 ${colors[accent]}`}><div className="text-[10px] font-bold uppercase tracking-[.12em] text-[#607173]">{label}</div><div className="equip-mono mt-2 text-xl font-semibold tracking-tight text-[#173f49]">{value}</div><div className="mt-1 text-[11px] text-slate-600">{note}</div></div>; }
function ConfidenceState({ value }: { value: EquipmentPerformanceEvent["confidence"] }) {
  const config = value === "linked"
    ? { label: "Linked", text: "text-[#176b63]", dot: "bg-[#238276]" }
    : value === "confirmed_legacy_match"
      ? { label: "Legacy confirmed", text: "text-[#8a6619]", dot: "bg-[#c48c24]" }
      : { label: "Unclassified", text: "text-[#aa4933]", dot: "bg-[#b95339]" };
  return <span className={`inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide ${config.text}`}><i className={`h-1.5 w-1.5 rounded-full ${config.dot}`} />{config.label}</span>;
}
function Skeleton() { return <div className="space-y-4">{[0, 1, 2].map(x => <div key={x} className="h-28 animate-pulse rounded-md bg-[#e8e2d3]" />)}</div>; }
function ErrorState({ retry }: { retry: () => void }) { return <div className="equip-panel rounded-md border border-[#d8a999] bg-[#fff7ee] p-10 text-center"><AlertTriangle className="mx-auto h-7 w-7 text-[#aa4933]" /><h2 className="mt-3 font-bold text-[#703725]">The fleet ledger could not be loaded</h2><Button className="mt-4" onClick={retry}>Try again</Button></div>; }
function Empty({ title, detail }: { title: string; detail: string }) { return <div className="p-10 text-center"><Truck className="mx-auto h-7 w-7 text-[#9aa7a2]" /><p className="mt-3 font-semibold text-[#304c52]">{title}</p><p className="mt-1 text-xs text-slate-600">{detail}</p></div>; }
function ReviewPanel({ rows, equipmentOptions, onDismiss, onConfirm, busy }: {
  rows: Report["reviewRows"];
  equipmentOptions: EquipmentOption[];
  onDismiss: (id: number) => void;
  onConfirm: (row: Report["reviewRows"][number], equipmentId: number) => void;
  busy: boolean;
}) {
  return <aside className="equip-panel rounded-md border border-[#d7c99d] bg-[#f5edcf]">
    <div className="border-b border-[#d7c99d] px-4 py-3"><div className="flex items-center gap-2 font-bold text-[#5c4a18]"><ShieldCheck className="h-4 w-4" />Owner review queue</div><p className="mt-1 text-[11px] text-[#715f2c]">Suggestions do not alter usage until confirmed.</p></div>
    <div className="max-h-[420px] overflow-auto">{rows.length
      ? rows.map((row) => <ReviewItem key={row.logId} row={row} equipmentOptions={equipmentOptions} onDismiss={onDismiss} onConfirm={onConfirm} busy={busy} />)
      : <div className="p-7 text-center"><Check className="mx-auto h-5 w-5 text-[#28776d]" /><p className="mt-2 text-xs font-semibold text-[#30594e]">No decisions waiting</p><p className="mt-1 text-[11px] text-[#6f745f]">The current ledger is attributable.</p></div>}
    </div>
  </aside>;
}

function ReviewReadOnly({ count }: { count: number }) {
  return <aside className="equip-panel rounded-md border border-[#d7c99d] bg-[#f5edcf] p-5">
    <div className="flex items-center gap-2 font-bold text-[#5c4a18]"><ShieldCheck className="h-4 w-4" />Owner review queue</div>
    <p className="mt-2 text-sm text-[#665a38]">{count ? `${count} historical log${count === 1 ? "" : "s"} need Equipment Master attribution.` : "No attribution decisions are waiting."}</p>
    <p className="mt-1 text-[11px] text-[#715f2c]">Only an owner or administrator can confirm or correct historical identities.</p>
  </aside>;
}

function ReviewItem({ row, equipmentOptions, onDismiss, onConfirm, busy }: {
  row: Report["reviewRows"][number];
  equipmentOptions: EquipmentOption[];
  onDismiss: (id: number) => void;
  onConfirm: (row: Report["reviewRows"][number], equipmentId: number) => void;
  busy: boolean;
}) {
  const suggestedId = row.suggestions[0]?.equipmentId;
  const [selectedId, setSelectedId] = useState(suggestedId ? String(suggestedId) : "");
  const suggested = new Map(row.suggestions.map((suggestion) => [suggestion.equipmentId, suggestion]));
  return <div className="border-b border-[#dfd2a9] p-3">
    <div className="flex gap-2">
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#ad7820]" />
      <div className="min-w-0">
        <div className="text-xs font-semibold text-[#493d1f]">{row.machine}</div>
        <div className="mt-0.5 text-[11px] text-[#665a38]">{date(row.date)} · {formatUsageValue(row.usageValue)} · {row.project}</div>
        <div className="equip-mono mt-0.5 text-[9px] text-[#82734a]">DPR LOG #{row.logId}</div>
      </div>
    </div>
    <label className="mt-2 block">
      <span className="text-[10px] uppercase tracking-wider text-[#746333]">{suggestedId ? "Suggested Equipment Master match" : "Choose Equipment Master manually"}</span>
      <select value={selectedId} onChange={(event) => setSelectedId(event.target.value)} className="mt-1 h-8 w-full rounded border border-[#d5c491] bg-[#fff9e8] px-2 text-xs text-[#294c52]">
        <option value="">Select machine…</option>
        {equipmentOptions.map((option) => {
          const match = suggested.get(option.id)?.match;
          return <option key={option.id} value={option.id}>{option.name}{option.registrationNumber ? ` (${option.registrationNumber})` : ""} · Master #{option.id}{match ? ` · ${match}` : ""}</option>;
        })}
      </select>
    </label>
    <div className="mt-2 flex gap-2">
      <Button size="sm" disabled={!selectedId || busy} onClick={() => onConfirm(row, Number(selectedId))} className="h-7 bg-[#1d6e69] px-2 text-[11px] hover:bg-[#145652]"><Check className="mr-1 h-3 w-3" />Confirm</Button>
      <Button size="sm" variant="ghost" onClick={() => onDismiss(row.logId)} className="h-7 px-2 text-[11px] text-[#705d35]"><X className="mr-1 h-3 w-3" />Dismiss</Button>
    </div>
  </div>;
}

function LegacyCorrectionPanel({ events, equipmentOptions, onCorrect, busy }: {
  events: EquipmentPerformanceEvent[];
  equipmentOptions: EquipmentOption[];
  onCorrect: (event: EquipmentPerformanceEvent, equipmentId: number) => void;
  busy: boolean;
}) {
  if (!events.length) return null;
  return <section className="equip-panel rounded-md border border-[#cfc8b8] bg-[#fffdf6]">
    <div className="border-b border-[#d9d2c2] px-4 py-3">
      <h2 className="font-bold text-[#173f49]">Legacy identity corrections</h2>
      <p className="text-xs text-slate-600">Use this only when a historical DPR log is attached to the wrong Equipment Master row. Canonical Plant Usage links are not editable here.</p>
    </div>
    <div className="grid gap-2 p-3 lg:grid-cols-2">
      {events.map((event) => <LegacyCorrectionItem key={event.key} event={event} equipmentOptions={equipmentOptions} onCorrect={onCorrect} busy={busy} />)}
    </div>
  </section>;
}

function LegacyCorrectionItem({ event, equipmentOptions, onCorrect, busy }: {
  event: EquipmentPerformanceEvent;
  equipmentOptions: EquipmentOption[];
  onCorrect: (event: EquipmentPerformanceEvent, equipmentId: number) => void;
  busy: boolean;
}) {
  const [selectedId, setSelectedId] = useState(String(event.equipmentId ?? ""));
  const unchanged = Number(selectedId) === event.equipmentId;
  return <div className="rounded border border-[#ddd5c5] bg-[#faf7ed] p-3">
    <div className="flex items-start justify-between gap-3">
      <div><div className="text-xs font-semibold text-[#284c53]">{event.machine}</div><div className="mt-0.5 text-[10px] text-slate-500">{date(event.date)} · {event.project} · {event.site ?? "site not logged"}</div></div>
      <div className="equip-mono shrink-0 text-[9px] text-slate-500">DPR LOG #{event.reference.equipmentLogId}</div>
    </div>
    <div className="mt-2 flex gap-2">
      <select value={selectedId} onChange={(change) => setSelectedId(change.target.value)} className="h-8 min-w-0 flex-1 rounded border border-[#c8c3b6] bg-[#fffdf6] px-2 text-xs">
        {equipmentOptions.map((option) => <option key={option.id} value={option.id}>{option.name}{option.registrationNumber ? ` (${option.registrationNumber})` : ""} · Master #{option.id}</option>)}
      </select>
      <Button size="sm" disabled={!selectedId || unchanged || busy} onClick={() => onCorrect(event, Number(selectedId))} className="h-8 bg-[#1d6e69] px-3 text-[11px] hover:bg-[#145652]">Save correction</Button>
    </div>
  </div>;
}

function EventLedger({ events }: { events: EquipmentPerformanceEvent[] }) { return <section className="equip-panel overflow-hidden rounded-md border border-[#cfc8b8] bg-[#fffdf6]"><div className="flex items-center justify-between border-b border-[#d9d2c2] px-4 py-3"><div><h2 className="font-bold text-[#173f49]">Chronological event ledger</h2><p className="text-xs text-slate-600">Primary audit surface — ordered source records.</p></div><Activity className="h-4 w-4 text-[#1e7181]" /></div><div className="max-h-[390px] overflow-auto"><table className="w-full min-w-[700px] text-xs"><thead className="sticky top-0 bg-[#e8e2d3] text-[10px] uppercase tracking-wider text-[#43575a]"><tr><th className="px-4 py-2 text-left">When</th><th className="text-left">Machine / source</th><th className="text-right">Reading</th><th className="text-right">Usage</th><th className="text-left">Status</th><th /></tr></thead><tbody>{events.length ? events.map((e) => <tr className="equip-row border-t border-[#e8e1d3]" key={e.key}><td className="whitespace-nowrap px-4 py-2.5 font-medium">{date(e.date)}<div className="text-[10px] text-slate-500">{e.scope}</div></td><td><div className="font-semibold text-[#284c53]">{e.machine}</div><div className="text-[10px] uppercase tracking-wide text-slate-500">{e.source}</div></td><td className="equip-mono text-right">{e.openingReading != null || e.closingReading != null ? `${e.openingReading ?? "—"} → ${e.closingReading ?? "—"}` : "—"}</td><td className="equip-mono text-right font-medium">{rowEventBasis(e)}</td><td><ConfidenceState value={e.confidence} /></td><td className="pr-3">{e.reference.dprId && <a href={`/site/edit/${e.reference.dprId}`} className="inline-flex text-[#20677a]" title="Open DPR"><ArrowUpRight className="h-3.5 w-3.5" /></a>}</td></tr>) : <tr><td colSpan={6}><Empty title="No usage events in this window." detail="The audit ledger will populate as source records arrive." /></td></tr>}</tbody></table></div></section>; }
function Trend({ events }: { events: EquipmentPerformanceEvent[] }) { const data = events.map((e, i) => ({ label: date(e.date) || String(i + 1), usage: n(e.runtimeHours ?? e.totalKm ?? e.trips ?? e.usageValue), diesel: n(e.dieselActual) })); return <section className="equip-panel rounded-md border border-[#cfc8b8] bg-[#fffdf6] p-4"><div className="flex items-start justify-between"><div><h2 className="font-bold text-[#173f49]">Run-hours / diesel trace</h2><p className="mt-0.5 text-xs text-slate-600">Secondary diagnostic view, in ledger order.</p></div><Fuel className="h-4 w-4 text-[#d08322]" /></div>{data.length ? <div className="mt-5 h-[250px]"><ResponsiveContainer width="100%" height="100%"><AreaChart data={data}><defs><linearGradient id="hours-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#1c7781" stopOpacity=".35" /><stop offset="100%" stopColor="#1c7781" stopOpacity="0" /></linearGradient></defs><CartesianGrid vertical={false} stroke="#ded7c8" /><XAxis dataKey="label" fontSize={10} tickLine={false} axisLine={false} /><YAxis fontSize={10} tickLine={false} axisLine={false} /><Tooltip contentStyle={{ background: "#fffdf6", border: "1px solid #cfc8b8", fontSize: 12 }} /><Area type="monotone" dataKey="usage" name="Basis value" stroke="#1c7781" fill="url(#hours-fill)" strokeWidth={2} /><Line type="monotone" dataKey="diesel" name="Diesel L" stroke="#d08322" strokeWidth={2} dot={false} /></AreaChart></ResponsiveContainer></div> : <Empty title="No trend can be drawn yet." detail="Records with hours and diesel readings will appear here." />}</section>; }
function MachineDialog({ machine, events, close }: { machine: FleetRow | null; events: EquipmentPerformanceEvent[]; close: () => void }) { return <Dialog open={!!machine} onOpenChange={v => !v && close()}><DialogContent className="max-h-[90vh] max-w-6xl overflow-y-auto bg-[#fffdf6]"><DialogHeader><div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-[#1f7180]"><Search className="h-3.5 w-3.5" />Machine drill-down / usage history</div><DialogTitle className="text-2xl text-[#173f49]">{machine?.machine}</DialogTitle></DialogHeader>{machine && <><div className="grid grid-cols-2 gap-3 border-y border-[#ddd5c5] py-4 md:grid-cols-4"><Small label="Basis total" value={rowBasis(machine)} /><Small label="Diesel variance" value={litres(machine.dieselVariance)} /><Small label="Last use" value={date(machine.lastUsedDate)} /><Small label="Confidence" value={machine.confidence.replace(/_/g, " ")} /></div>{machine.dataQualityWarnings.length > 0 && <div className="rounded border border-[#e0b69e] bg-[#fff3e7] p-3 text-xs text-[#844b2e]"><strong>Data quality:</strong> {machine.dataQualityWarnings.join(" · ")}</div>}</>}<div className="overflow-auto"><p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Chronological source history</p>{events.length ? <table className="w-full min-w-[1100px] text-xs"><thead className="bg-[#e8e2d3] text-[10px] uppercase tracking-wider"><tr><th className="px-2 py-2 text-left">Date</th><th className="text-left">Project / site / plant</th><th className="text-left">Task</th><th className="text-left">Meter</th><th className="text-right">Basis</th><th className="text-right">Diesel A/E/Δ</th><th className="text-left">Operator</th><th className="text-left">References / notes</th><th>Confidence</th></tr></thead><tbody>{events.map((e) => <tr className="border-t border-[#eee8db]" key={e.key}><td className="px-2 py-2">{date(e.date)}</td><td className="px-2 py-2">{e.project}<div className="text-[10px] text-slate-500">{e.site ?? "—"} / {e.plant ?? "—"}</div></td><td className="px-2 py-2">{e.task ?? "—"}</td><td className="px-2 py-2">{e.openingReading != null || e.closingReading != null ? `${e.openingReading ?? "—"} → ${e.closingReading ?? "—"}` : "—"}</td><td className="equip-mono px-2 py-2 text-right">{rowEventBasis(e)}</td><td className="equip-mono px-2 py-2 text-right">{e.dieselActual == null ? "—" : `${e.dieselActual}/${e.dieselExpected ?? "—"}/${e.dieselVariance ?? "—"}`}</td><td className="px-2 py-2">{e.operator ?? "—"}</td><td className="px-2 py-2"><div className="equip-mono text-[10px]">{e.reference.dprId ? `DPR #${e.reference.dprId}` : ""}{e.reference.dprId && e.reference.plantUsageId ? " · " : ""}{e.reference.plantUsageId ? `USAGE #${e.reference.plantUsageId}` : ""}</div><div className="mt-0.5 text-[10px] text-slate-500">{e.notes ?? "—"}</div>{e.breakdownNotes.map((note, index) => <div key={index} className="mt-1 rounded bg-[#fff0df] px-1.5 py-1 text-[10px] text-[#8a4e2b]">Breakdown: {note}</div>)}</td><td className="px-2 py-2"><ConfidenceState value={e.confidence} /></td></tr>)}</tbody></table> : <p className="py-6 text-center text-xs text-slate-500">Source-level events are not available for this machine in the selected window.</p>}</div><div className="mt-3"><Trend events={events} /></div></DialogContent></Dialog>; }
function Small({ label, value }: { label: string; value: string }) { return <div><div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</div><div className="equip-mono mt-1 font-semibold text-[#183f49]">{value}</div></div>; }
function litres(value: unknown) { return value == null ? "—" : `${n(value).toLocaleString("en-IN", { maximumFractionDigits: 1 })} L`; }
function formatUsageValue(value: unknown) { return n(value).toLocaleString("en-IN", { maximumFractionDigits: 1 }); }
function rowBasis(row: FleetRow) {
  if (row.usageBasis === "hour_meter" || row.usageBasis === "time_fallback") return hours(row.runtimeHours);
  if (row.usageBasis === "odometer") return `${n(row.totalKm).toLocaleString("en-IN", { maximumFractionDigits: 1 })} km`;
  if (row.usageBasis === "trip_based") return `${n(row.trips)} trips · ${n(row.totalKm).toLocaleString("en-IN", { maximumFractionDigits: 1 })} km`;
  if (row.usageBasis === "mixed") return compactBasis(row.runtimeHours, row.totalKm, row.trips);
  return "Usage unavailable";
}
function rowEventBasis(row: EquipmentPerformanceEvent) {
  if (row.usageBasis === "hour_meter" || row.usageBasis === "time_fallback") return hours(row.runtimeHours ?? row.usageValue);
  if (row.usageBasis === "odometer") return `${n(row.totalKm ?? row.usageValue).toLocaleString("en-IN", { maximumFractionDigits: 1 })} km`;
  if (row.usageBasis === "trip_based") return `${n(row.trips)} trips · ${n(row.totalKm ?? row.usageValue).toLocaleString("en-IN", { maximumFractionDigits: 1 })} km`;
  return "Unavailable";
}
function compactBasis(runtimeHours: unknown, totalKm: unknown, trips: unknown) {
  const values = [
    n(runtimeHours) > 0 ? hours(runtimeHours) : "",
    n(totalKm) > 0 ? `${n(totalKm).toLocaleString("en-IN", { maximumFractionDigits: 1 })} km` : "",
    n(trips) > 0 ? `${n(trips)} trips` : "",
  ].filter(Boolean);
  return values.join(" · ") || "Usage unavailable";
}
function basisTotal(totals: Report["totals"] | undefined) { return totals ? compactBasis(totals.runtimeHours, totals.totalKm, totals.trips) : "—"; }