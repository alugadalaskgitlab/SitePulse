import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useOrigin } from "@/hooks/use-origin";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChevronLeft, Download, FileDown, Loader2, ExternalLink, CheckCircle2, XCircle, ChevronDown, X, Circle, AlertCircle, Wrench } from "lucide-react";
import { format, parseISO, subDays } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { unzipSync, strFromU8 } from "fflate";
import { getVolumeAtDepth, BITUMEN_DENSITY_KG_PER_LITER } from "@shared/bitumen-dip-chart";
import DryerSourceFixDialog from "@/components/DryerSourceFixDialog";
import type { DryerSourceFixTarget } from "@/components/DryerSourceFixDialog";

type PartyOpt = { id: number; name: string };
type MixTypeOpt = { id: number; name: string };

function MultiSelect<T extends { value: string; label: string }>({
  label, options, selected, onChange, testId,
}: {
  label: string;
  options: T[];
  selected: string[];
  onChange: (next: string[]) => void;
  testId: string;
}) {
  const summary = selected.length === 0
    ? `All ${label.toLowerCase()}`
    : selected.length === 1
      ? (options.find((o) => o.value === selected[0])?.label || selected[0])
      : `${selected.length} selected`;
  const toggle = (v: string) => {
    if (selected.includes(v)) onChange(selected.filter((x) => x !== v));
    else onChange([...selected, v]);
  };
  return (
    <div>
      <label className="text-xs text-muted-foreground block mb-1">{label}</label>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" className="h-10 min-w-[12rem] justify-between font-normal" data-testid={`${testId}-trigger`}>
            <span className="truncate">{summary}</span>
            <ChevronDown className="w-4 h-4 ml-2 opacity-60" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-64 p-2" align="start">
          <div className="flex items-center justify-between px-1 pb-1">
            <span className="text-xs text-muted-foreground">{selected.length} selected</span>
            {selected.length > 0 && (
              <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => onChange([])} data-testid={`${testId}-clear`}>
                <X className="w-3 h-3 mr-1" /> Clear
              </Button>
            )}
          </div>
          <div className="max-h-64 overflow-auto">
            {options.length === 0 && (
              <div className="text-xs text-muted-foreground px-2 py-3">No options</div>
            )}
            {options.map((o) => {
              const checked = selected.includes(o.value);
              return (
                <label
                  key={o.value}
                  className="flex items-center gap-2 px-2 py-1.5 rounded hover-elevate cursor-pointer"
                  data-testid={`${testId}-option-${o.value}`}
                >
                  <Checkbox checked={checked} onCheckedChange={() => toggle(o.value)} />
                  <span className="text-sm truncate">{o.label}</span>
                </label>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

type IndexRow = {
  date: string;
  plantName: string;
  hasDispatches: boolean;
  hasEquipment: boolean;
  hasShiftLog: boolean;
  hasBitumenDips: boolean;
  hasLdoMeter: boolean;
  hasHeatingSessions: boolean;
  totalLoads: number;
  totalProductionMt: number;
  sessionsCount: number;
  shiftLogFinalized: boolean;
  dryerFedFrom: "TANK_1" | "TANK_2" | null;
  breakdown: Array<{ partyName: string; mixType: string; loads: number; mt: number }>;
  ldoBoilerLitres: number | null;
  ldoDryerLitres: number | null;
  ldoHeatingSessionLitres: number | null;
  dgDieselLitres: number | null;
  bitumenTank1OpeningDip: number | null;
  bitumenTank1ClosingDip: number | null;
  bitumenTank2OpeningDip: number | null;
  bitumenTank2ClosingDip: number | null;
  bitumenTemplateMt: number | null;
};

export default function PlantDailyReports() {
  const { appendOrigin, getPlantBackLink, appendPlantContext } = useOrigin();
  const { toast } = useToast();
  const today = format(new Date(), "yyyy-MM-dd");
  const defaultFrom = format(subDays(new Date(), 90), "yyyy-MM-dd");

  const searchString = useSearch();
  const [, setLocation] = useLocation();
  const params = useMemo(() => new URLSearchParams(searchString || ""), [searchString]);

  const FILTERS_STORAGE_KEY = "plant-daily-reports:last-filters:v1";

  // On first mount: if URL has no filter params and localStorage has a saved
  // filter set, restore it by updating the URL. URL params always win, so
  // shareable links keep working unchanged.
  const restoreCheckedRef = useRef(false);
  useEffect(() => {
    if (restoreCheckedRef.current) return;
    restoreCheckedRef.current = true;
    if (typeof window === "undefined") return;
    const current = new URLSearchParams(searchString || "");
    const FILTER_KEYS = ["from", "to", "plant", "party", "mixType"] as const;
    const hasAnyFilterParam = FILTER_KEYS.some((k) => current.has(k));
    if (hasAnyFilterParam) return;
    try {
      const raw = window.localStorage.getItem(FILTERS_STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as {
        from?: string;
        to?: string;
        plant?: string;
        parties?: string[];
        mixTypes?: string[];
      };
      const p = new URLSearchParams();
      if (saved.from && saved.from !== defaultFrom) p.set("from", saved.from);
      if (saved.to && saved.to !== today) p.set("to", saved.to);
      if (saved.plant) p.set("plant", saved.plant);
      for (const x of saved.parties || []) p.append("party", x);
      for (const x of saved.mixTypes || []) p.append("mixType", x);
      const qs = p.toString();
      if (qs) setLocation(`/plant/daily-reports?${qs}`, { replace: true });
    } catch {
      /* ignore corrupt storage */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const from = params.get("from") || defaultFrom;
  const to = params.get("to") || today;
  const plant = params.get("plant") || "";
  const selectedParties = params.getAll("party"); // party ids as strings
  const selectedMixTypes = params.getAll("mixType"); // mix type names

  // Persist whatever filter set is currently reflected in the URL so that the
  // next visit (without URL params) can restore it.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!restoreCheckedRef.current) return; // don't overwrite before restore check
    try {
      window.localStorage.setItem(
        FILTERS_STORAGE_KEY,
        JSON.stringify({
          from,
          to,
          plant,
          parties: selectedParties,
          mixTypes: selectedMixTypes,
        }),
      );
    } catch {
      /* storage might be full / disabled — ignore */
    }
  }, [from, to, plant, selectedParties.join(","), selectedMixTypes.join(",")]);

  const updateFilters = (
    next: Partial<{
      from: string;
      to: string;
      plant: string;
      parties: string[];
      mixTypes: string[];
    }>,
  ) => {
    const p = new URLSearchParams();
    const fromV = next.from ?? from;
    const toV = next.to ?? to;
    const plantV = next.plant ?? plant;
    const partiesV = next.parties ?? selectedParties;
    const mixTypesV = next.mixTypes ?? selectedMixTypes;
    if (fromV && fromV !== defaultFrom) p.set("from", fromV);
    if (toV && toV !== today) p.set("to", toV);
    if (plantV) p.set("plant", plantV);
    for (const x of partiesV) p.append("party", x);
    for (const x of mixTypesV) p.append("mixType", x);
    const qs = p.toString();
    setLocation(qs ? `/plant/daily-reports?${qs}` : "/plant/daily-reports");
  };

  const setFrom = (v: string) => updateFilters({ from: v });
  const setTo = (v: string) => updateFilters({ to: v });
  const setPlant = (v: string) => updateFilters({ plant: v });
  const setSelectedParties = (v: string[]) => updateFilters({ parties: v });
  const setSelectedMixTypes = (v: string[]) => updateFilters({ mixTypes: v });
  const hasActiveFilters =
    from !== defaultFrom ||
    to !== today ||
    plant !== "" ||
    selectedParties.length > 0 ||
    selectedMixTypes.length > 0;
  // Fix dialog state
  const [fixDialog, setFixDialog] = useState<{ open: boolean; target: DryerSourceFixTarget | null }>({ open: false, target: null });

  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<string>("");
  type BulkStatus = { date: string; plant: string; ok: boolean; error?: string; bytes?: number };
  const [bulkResult, setBulkResult] = useState<{ total: number; succeeded: number; failed: number; entries: BulkStatus[] } | null>(null);

  const { data: plantsList } = useQuery<string[]>({
    queryKey: ["/api/plant-module/shift-logs/plants"],
    queryFn: async () => {
      const res = await fetch("/api/plant-module/shift-logs/plants", { credentials: "include" });
      if (!res.ok) return ["Main Plant"];
      return res.json();
    },
  });

  const { data: partiesList } = useQuery<PartyOpt[]>({
    queryKey: ["/api/plant-module/parties"],
  });
  const { data: mixTypesList } = useQuery<MixTypeOpt[]>({
    queryKey: ["/api/plant-module/mix-types"],
  });

  const partiesSorted = useMemo(
    () => [...(partiesList || [])].sort((a, b) => a.name.localeCompare(b.name)),
    [partiesList],
  );
  const mixTypesSorted = useMemo(
    () => [...(mixTypesList || [])].sort((a, b) => a.name.localeCompare(b.name)),
    [mixTypesList],
  );

  type DryerMismatchRow = {
    date: string;
    plantName: string;
    shiftLogId: number | null;
    shiftLogValue: "TANK_1" | "TANK_2" | null;
    conflictingSessions: Array<{ id: number; dryerFedFrom: "TANK_1" | "TANK_2"; sessionType: string; startTime: string | null }>;
    intraSessionConflicts: Array<{ id: number; dryerFedFrom: "TANK_1" | "TANK_2"; sessionType: string; startTime: string | null }>;
    hasIntraSessionConflict: boolean;
    hasMismatch: boolean;
  };

  const { data: dryerMismatchRows } = useQuery<DryerMismatchRow[]>({
    queryKey: ["/api/plant-module/heating-sessions/dryer-source-mismatches", from, to],
    enabled: !!from && !!to,
    queryFn: async () => {
      const qs = new URLSearchParams({ dateFrom: from, dateTo: to });
      const res = await fetch(`/api/plant-module/heating-sessions/dryer-source-mismatches?${qs.toString()}`, { credentials: "include" });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  });

  const dryerMismatchByKey = useMemo(() => {
    const map = new Map<string, DryerMismatchRow>();
    for (const r of dryerMismatchRows || []) {
      if (r.hasMismatch) map.set(`${r.date}||${r.plantName}`, r);
    }
    return map;
  }, [dryerMismatchRows]);

  const { data: rows, isLoading } = useQuery<IndexRow[]>({
    queryKey: ["/api/plant-module/daily-reports-index", from, to, plant, selectedParties, selectedMixTypes],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      if (plant) params.set("plant", plant);
      for (const p of selectedParties) params.append("party", p);
      for (const m of selectedMixTypes) params.append("mixType", m);
      const res = await fetch(`/api/plant-module/daily-reports-index?${params.toString()}`, { credentials: "include" });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  });

  const grouped = useMemo(() => {
    const m = new Map<string, IndexRow[]>();
    for (const r of rows || []) {
      const monthKey = r.date.slice(0, 7); // YYYY-MM
      if (!m.has(monthKey)) m.set(monthKey, []);
      m.get(monthKey)!.push(r);
    }
    return Array.from(m.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [rows]);

  const setQuickRange = (days: number) => {
    updateFilters({ from: format(subDays(new Date(), days), "yyyy-MM-dd"), to: today });
  };

  const handleSpreadsheetExport = async (format: "csv" | "xlsx") => {
    if (!rows?.length) {
      toast({ title: "Nothing to export", description: "Adjust the filters to include some dates." });
      return;
    }
    try {
      const params = new URLSearchParams();
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      if (plant) params.set("plant", plant);
      for (const p of selectedParties) params.append("party", p);
      for (const m of selectedMixTypes) params.append("mixType", m);
      params.set("format", format);
      const res = await fetch(`/api/plant-module/daily-reports-export?${params.toString()}`, { credentials: "include" });
      if (!res.ok) {
        const msg = await res.text().catch(() => "");
        throw new Error(msg || `Export failed (${res.status})`);
      }
      const blob = await res.blob();
      const sortedDates = [...new Set(rows.map((r) => r.date))].sort();
      const fromD = from || sortedDates[0];
      const toD = to || sortedDates[sortedDates.length - 1];
      const range = fromD === toD ? fromD : `${fromD}_to_${toD}`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `daily-plant-reports-${range}.${format}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast({ title: `Exported ${format.toUpperCase()}`, description: `${rows.length} row${rows.length === 1 ? "" : "s"} included with summary cover.` });
    } catch (err: any) {
      toast({ title: "Export failed", description: err?.message || "Unknown error", variant: "destructive" });
    }
  };

  const handleBulkExport = async () => {
    if (!rows?.length) {
      toast({ title: "No reports to export", description: "Adjust the filters to include some dates." });
      return;
    }
    setBulkBusy(true);
    setBulkResult(null);
    setBulkProgress(`Building ONE ZIP for ${rows.length} report${rows.length === 1 ? "" : "s"}…`);
    try {
      // Send ALL visible rows in a single request — server returns one ZIP across all plants.
      const entries = rows.map((r) => ({ date: r.date, plant: r.plantName }));
      const res = await fetch("/api/plant-module/daily-reports/bulk-zip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ entries }),
      });
      if (!res.ok) {
        const msg = await res.text().catch(() => "");
        throw new Error(`Bulk ZIP failed: ${msg}`);
      }
      // Server now streams the ZIP, so per-entry status arrives inside
      // `manifest.json` rather than headers. Total is still sent as a header
      // so we can show "N PDFs queued" before parsing the archive.
      const totalHeader = Number(res.headers.get("X-Bulk-Total") || "0");

      const blob = await res.blob();
      const sortedDates = [...new Set(rows.map((r) => r.date))].sort();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `daily-plant-reports-${sortedDates[0]}_to_${sortedDates[sortedDates.length - 1]}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      // Extract the embedded manifest so we can keep showing the per-entry
      // status panel. Falling back to header counts if the manifest can't be
      // read keeps the toast working even when parsing fails.
      let total = totalHeader;
      let succeeded = totalHeader;
      let failed = 0;
      let statusEntries: BulkStatus[] = [];
      try {
        const buf = new Uint8Array(await blob.arrayBuffer());
        const files = unzipSync(buf, { filter: (f) => f.name === "manifest.json" });
        const manifestRaw = files["manifest.json"];
        if (manifestRaw) {
          const manifest = JSON.parse(strFromU8(manifestRaw));
          total = Number(manifest.total ?? totalHeader);
          succeeded = Number(manifest.succeeded ?? totalHeader);
          failed = Number(manifest.failed ?? 0);
          if (Array.isArray(manifest.entries)) statusEntries = manifest.entries;
        }
      } catch {
        /* ignore — fall back to header total */
      }

      setBulkResult({ total, succeeded, failed, entries: statusEntries });
      setBulkProgress("");
      toast({
        title: failed > 0 ? `Export finished with ${failed} failure${failed === 1 ? "" : "s"}` : "Bulk export complete",
        description: `${succeeded} of ${total} PDF${total === 1 ? "" : "s"} included in the ZIP.`,
        variant: failed > 0 ? "destructive" : "default",
      });
    } catch (err: any) {
      setBulkProgress("");
      toast({ title: "Bulk export failed", description: err?.message || "Unknown error", variant: "destructive" });
    } finally {
      setBulkBusy(false);
    }
  };

  const backHref = getPlantBackLink({ defaultTab: "reports" });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Link href={backHref}>
            <Button variant="ghost" size="icon" data-testid="button-back">
              <ChevronLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold">Historical Daily Plant Reports</h1>
            <p className="text-sm text-muted-foreground">
              Every past date with any plant data — open the report or download its PDF.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            onClick={() => handleSpreadsheetExport("csv")}
            disabled={!rows?.length}
            data-testid="button-export-csv"
          >
            <Download className="w-4 h-4 mr-2" />
            Export CSV
          </Button>
          <Button
            variant="outline"
            onClick={() => handleSpreadsheetExport("xlsx")}
            disabled={!rows?.length}
            data-testid="button-export-excel"
          >
            <Download className="w-4 h-4 mr-2" />
            Export Excel
          </Button>
          <Button
            variant="default"
            onClick={handleBulkExport}
            disabled={bulkBusy || !rows?.length}
            data-testid="button-bulk-zip"
          >
            {bulkBusy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FileDown className="w-4 h-4 mr-2" />}
            Bulk Export PDFs (ZIP)
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Filters</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div>
            <label className="text-xs text-muted-foreground block mb-1">From</label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" data-testid="input-from" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">To</label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" data-testid="input-to" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Plant</label>
            <select
              value={plant}
              onChange={(e) => setPlant(e.target.value)}
              className="border rounded px-2 py-1.5 text-sm h-10"
              data-testid="select-plant"
            >
              <option value="">All plants</option>
              {(plantsList || ["Main Plant"]).map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>
          <MultiSelect
            label="Party"
            testId="multiselect-party"
            selected={selectedParties}
            onChange={setSelectedParties}
            options={partiesSorted.map((p) => ({ value: String(p.id), label: p.name }))}
          />
          <MultiSelect
            label="Mix Type"
            testId="multiselect-mix-type"
            selected={selectedMixTypes}
            onChange={setSelectedMixTypes}
            options={mixTypesSorted.map((m) => ({ value: m.name, label: m.name }))}
          />
          <div className="flex gap-1">
            <Button variant="outline" size="sm" onClick={() => setQuickRange(7)} data-testid="button-range-7">7d</Button>
            <Button variant="outline" size="sm" onClick={() => setQuickRange(30)} data-testid="button-range-30">30d</Button>
            <Button variant="outline" size="sm" onClick={() => setQuickRange(90)} data-testid="button-range-90">90d</Button>
            <Button variant="outline" size="sm" onClick={() => setQuickRange(365)} data-testid="button-range-365">1y</Button>
          </div>
          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                try { window.localStorage.removeItem(FILTERS_STORAGE_KEY); } catch { /* ignore */ }
                setLocation("/plant/daily-reports");
              }}
              data-testid="button-reset-filters"
              aria-label="Reset filters to default 90-day view"
            >
              <X className="w-3.5 h-3.5 mr-1" /> Reset filters
            </Button>
          )}
          {bulkProgress && (
            <span className="text-xs text-muted-foreground" data-testid="text-bulk-progress">{bulkProgress}</span>
          )}
        </CardContent>
      </Card>

      {bulkResult && (
        <Card data-testid="card-bulk-result" className={bulkResult.failed > 0 ? "border-destructive/50" : "border-green-600/40"}>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              {bulkResult.failed > 0
                ? <XCircle className="w-4 h-4 text-destructive" />
                : <CheckCircle2 className="w-4 h-4 text-green-600" />}
              Last bulk export — {bulkResult.succeeded} of {bulkResult.total} succeeded
              {bulkResult.failed > 0 && (
                <Badge variant="destructive" className="ml-1">{bulkResult.failed} failed</Badge>
              )}
              <Button variant="ghost" size="sm" className="ml-auto" onClick={() => setBulkResult(null)} data-testid="button-dismiss-bulk-result">Dismiss</Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="max-h-64 overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-32">Status</TableHead>
                    <TableHead className="w-40">Date</TableHead>
                    <TableHead>Plant</TableHead>
                    <TableHead>Detail</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bulkResult.entries.map((s, i) => (
                    <TableRow key={`${s.date}-${s.plant}-${i}`} data-testid={`row-bulk-status-${s.date}-${s.plant}`}>
                      <TableCell>
                        {s.ok
                          ? <Badge className="bg-green-600 hover:bg-green-600">OK</Badge>
                          : <Badge variant="destructive">Failed</Badge>}
                      </TableCell>
                      <TableCell className="font-medium">{format(parseISO(s.date), "dd MMM yyyy")}</TableCell>
                      <TableCell>{s.plant}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {s.ok ? `${s.bytes ? Math.round(s.bytes / 1024) : "?"} KB` : (s.error || "Unknown error")}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              The ZIP also includes <code>manifest.json</code> with this same status list.
            </p>
          </CardContent>
        </Card>
      )}

      {isLoading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>
      )}

      {!isLoading && (rows?.length ?? 0) === 0 && (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No daily plant reports found in this date range.
          </CardContent>
        </Card>
      )}

      {!isLoading && grouped.map(([month, monthRows]) => {
        const monthTotalLoads = monthRows.reduce((s, r) => s + (r.totalLoads || 0), 0);
        const monthTotalMt = monthRows.reduce((s, r) => s + (r.totalProductionMt || 0), 0);
        return (
        <Card key={month}>
          <CardHeader>
            <div className="flex items-center justify-between flex-wrap gap-2">
              <CardTitle className="text-base">
                {format(parseISO(`${month}-01`), "MMMM yyyy")}
                <Badge variant="outline" className="ml-2">{monthRows.length} day{monthRows.length === 1 ? "" : "s"}</Badge>
              </CardTitle>
              {monthTotalLoads > 0 && (
                <span className="text-sm text-muted-foreground">
                  {monthTotalLoads} loads · {monthTotalMt.toFixed(1)} MT total
                </span>
              )}
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="text-xs">
                  <TableHead className="pl-4 w-36">Date</TableHead>
                  <TableHead className="w-28 text-right">Production</TableHead>
                  <TableHead>Party / Mix</TableHead>
                  <TableHead>LDO · Diesel · Bitumen</TableHead>
                  <TableHead className="w-8 text-center">Status</TableHead>
                  <TableHead className="text-right pr-4 w-32">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {monthRows.map((r) => {
                  const rowKey = `${r.date}-${r.plantName}`;
                  const openHref = appendPlantContext(`/plant/daily-report/${r.date}?plant=${encodeURIComponent(r.plantName)}`, { defaultTab: "reports" });
                  const pdfHref = `/api/plant-module/daily-reports/${r.date}/pdf?plant=${encodeURIComponent(r.plantName)}`;

                  // Compute bitumen actual MT from shift log dip readings
                  const dipToMt = (dip: number | null): number => {
                    if (dip == null || dip <= 0) return 0;
                    return getVolumeAtDepth(dip) * BITUMEN_DENSITY_KG_PER_LITER / 1000;
                  };
                  let bitumenActualMt: number | null = null;
                  const t1HasBoth = r.bitumenTank1OpeningDip != null && r.bitumenTank1ClosingDip != null;
                  const t2HasBoth = r.bitumenTank2OpeningDip != null && r.bitumenTank2ClosingDip != null;
                  if (t1HasBoth || t2HasBoth) {
                    bitumenActualMt = 0;
                    if (t1HasBoth) {
                      bitumenActualMt += Math.max(0, dipToMt(r.bitumenTank1OpeningDip) - dipToMt(r.bitumenTank1ClosingDip));
                    }
                    if (t2HasBoth) {
                      bitumenActualMt += Math.max(0, dipToMt(r.bitumenTank2OpeningDip) - dipToMt(r.bitumenTank2ClosingDip));
                    }
                  }

                  // Bitumen variance colour
                  const bitVarPct = (bitumenActualMt != null && r.bitumenTemplateMt && r.bitumenTemplateMt > 0)
                    ? Math.abs(bitumenActualMt - r.bitumenTemplateMt) / r.bitumenTemplateMt * 100
                    : null;
                  const bitVarClass = bitVarPct == null ? "" : bitVarPct <= 5 ? "text-green-600 dark:text-green-400" : bitVarPct <= 15 ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400";

                  // Data completeness indicator
                  const isComplete = r.hasShiftLog && r.shiftLogFinalized && r.hasDispatches && (r.hasLdoMeter || r.ldoBoilerLitres != null || r.ldoDryerLitres != null);
                  const isPartial = r.hasShiftLog || r.hasDispatches;
                  const statusIcon = isComplete
                    ? <CheckCircle2 className="w-4 h-4 text-green-600 dark:text-green-400" />
                    : isPartial
                    ? <AlertCircle className="w-4 h-4 text-amber-500 dark:text-amber-400" />
                    : <Circle className="w-4 h-4 text-muted-foreground/40" />;

                  const fmt = (n: number | null, decimals = 0) =>
                    n == null ? "—" : n.toFixed(decimals);

                  const mismatchKey = `${r.date}||${r.plantName}`;
                  const mismatch = dryerMismatchByKey.get(mismatchKey) ?? null;
                  const openFixDialog = () => {
                    if (!mismatch) return;
                    let target: DryerSourceFixTarget;
                    if (mismatch.shiftLogId != null && mismatch.shiftLogValue != null && mismatch.conflictingSessions.length > 0) {
                      target = {
                        mode: "shift-log",
                        recordId: mismatch.shiftLogId,
                        date: mismatch.date,
                        currentValue: mismatch.shiftLogValue,
                        suggestedValue: mismatch.conflictingSessions[0].dryerFedFrom,
                      };
                    } else if (mismatch.conflictingSessions.length > 0) {
                      target = {
                        mode: "heating-session",
                        recordId: mismatch.conflictingSessions[0].id,
                        date: mismatch.date,
                        currentValue: mismatch.conflictingSessions[0].dryerFedFrom,
                        suggestedValue: mismatch.shiftLogValue ?? (mismatch.conflictingSessions[0].dryerFedFrom === "TANK_1" ? "TANK_2" : "TANK_1"),
                      };
                    } else {
                      return;
                    }
                    setFixDialog({ open: true, target });
                  };

                  return (
                    <TableRow key={rowKey} data-testid={`row-report-${rowKey}`} className="align-top">
                      <TableCell className="pl-4 py-3">
                        <div className="font-medium text-sm">{format(parseISO(r.date), "EEE, dd MMM")}</div>
                        <div className="text-xs text-muted-foreground">{r.plantName}</div>
                      </TableCell>

                      <TableCell className="text-right py-3">
                        {r.hasDispatches ? (
                          <>
                            <div className="font-semibold text-sm">{r.totalLoads} loads</div>
                            <div className="text-xs text-muted-foreground">{r.totalProductionMt.toFixed(1)} MT</div>
                          </>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>

                      <TableCell className="py-3 max-w-xs">
                        {r.breakdown && r.breakdown.length > 0 ? (
                          <ul className="space-y-0.5 text-xs" data-testid={`breakdown-${rowKey}`}>
                            {r.breakdown.map((b, i) => (
                              <li key={`${b.partyName}-${b.mixType}-${i}`} className="leading-snug" data-testid={`breakdown-item-${rowKey}-${i}`}>
                                <span className="font-medium">{b.partyName}</span>
                                <span className="text-muted-foreground"> · {b.loads}×{b.mt.toFixed(1)} MT ({b.mixType})</span>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <span className="text-xs text-muted-foreground">No dispatches</span>
                        )}
                      </TableCell>

                      <TableCell className="py-3">
                        <div className="space-y-1 text-xs min-w-[18rem]">
                          {mismatch && (
                            <div className="flex items-center gap-1.5" data-testid={`dryer-mismatch-warning-${rowKey}`}>
                              <AlertCircle className="w-3 h-3 text-amber-500 shrink-0" />
                              <span className="text-amber-600 dark:text-amber-400">Dryer-source mismatch</span>
                            </div>
                          )}
                          {/* LDO line — always show all three sub-labels with — when missing */}
                          <div className="flex flex-wrap gap-x-3 gap-y-0.5" data-testid={`ldo-row-${rowKey}`}>
                            <span data-testid={`ldo-heating-${rowKey}`}>
                              <span className="text-muted-foreground">Heating: </span>
                              {r.ldoHeatingSessionLitres != null
                                ? <span className="font-medium">{fmt(r.ldoHeatingSessionLitres)} L{r.sessionsCount > 0 ? <span className="text-muted-foreground"> ({r.sessionsCount}×)</span> : null}</span>
                                : <span className="text-muted-foreground">—</span>}
                            </span>
                            <span data-testid={`ldo-boiler-${rowKey}`}>
                              <span className="text-muted-foreground">Boiler: </span>
                              {r.ldoBoilerLitres != null
                                ? <span className="font-medium">{fmt(r.ldoBoilerLitres)} L</span>
                                : <span className="text-muted-foreground">—</span>}
                            </span>
                            <span data-testid={`ldo-dryer-${rowKey}`}>
                              <span className="text-muted-foreground">Dryer: </span>
                              {r.ldoDryerLitres != null
                                ? <span className="font-medium">{fmt(r.ldoDryerLitres)} L</span>
                                : <span className="text-muted-foreground">—</span>}
                            </span>
                          </div>
                          {/* DG diesel — include session count when available */}
                          <div data-testid={`dg-diesel-${rowKey}`}>
                            <span className="text-muted-foreground">DG Diesel: </span>
                            {r.dgDieselLitres != null
                              ? <span className="font-medium">
                                  {fmt(r.dgDieselLitres)} L
                                  {r.sessionsCount > 0 && <span className="text-muted-foreground ml-1">({r.sessionsCount} sess.)</span>}
                                </span>
                              : <span className="text-muted-foreground">—</span>}
                          </div>
                          {/* Bitumen — always show both template and actual, — when unavailable */}
                          <div data-testid={`bitumen-${rowKey}`}>
                            <span className="text-muted-foreground">Bitumen: </span>
                            <span className="font-medium">Tmpl {r.bitumenTemplateMt != null ? `${r.bitumenTemplateMt.toFixed(2)} MT` : "—"}</span>
                            <span className={`ml-1 ${bitVarClass}`}>
                              {" → Act "}
                              {bitumenActualMt != null
                                ? <>
                                    <span className="font-medium">{bitumenActualMt.toFixed(2)} MT</span>
                                    {bitVarPct != null && (
                                      <span className="ml-1 opacity-80">
                                        ({bitumenActualMt > (r.bitumenTemplateMt ?? 0) ? "▲" : "▼"}{bitVarPct.toFixed(1)}%)
                                      </span>
                                    )}
                                  </>
                                : <span className="text-muted-foreground">—</span>}
                            </span>
                          </div>
                        </div>
                      </TableCell>

                      <TableCell className="text-center py-3" title={
                        isComplete ? "Complete — shift log finalized, dispatches & fuel recorded"
                        : isPartial ? "Partial — some data recorded but not all sections complete"
                        : "No data recorded yet"
                      }>
                        {statusIcon}
                      </TableCell>

                      <TableCell className="text-right pr-4 py-3">
                        <div className="flex gap-1 justify-end flex-wrap">
                          {mismatch && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={openFixDialog}
                              data-testid={`button-fix-dryer-${rowKey}`}
                              className="text-amber-600 border-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950"
                            >
                              <Wrench className="w-3.5 h-3.5 mr-1" /> Fix
                            </Button>
                          )}
                          <Link href={openHref}>
                            <Button variant="outline" size="sm" data-testid={`button-open-${rowKey}`}>
                              <ExternalLink className="w-3.5 h-3.5 mr-1" /> Open
                            </Button>
                          </Link>
                          <a href={pdfHref} target="_blank" rel="noreferrer">
                            <Button variant="outline" size="sm" data-testid={`button-pdf-${rowKey}`}>
                              <Download className="w-3.5 h-3.5 mr-1" /> PDF
                            </Button>
                          </a>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        );
      })}

      <DryerSourceFixDialog
        open={fixDialog.open}
        onOpenChange={(v) => setFixDialog((prev) => ({ ...prev, open: v }))}
        target={fixDialog.target}
      />
    </div>
  );
}
