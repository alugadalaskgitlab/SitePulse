import { useMemo, useState } from "react";
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
import { ChevronLeft, Download, FileDown, Loader2, ExternalLink, CheckCircle2, XCircle, ChevronDown, X } from "lucide-react";
import { format, parseISO, subDays } from "date-fns";
import { useToast } from "@/hooks/use-toast";

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
};

export default function PlantDailyReports() {
  const { appendOrigin } = useOrigin();
  const { toast } = useToast();
  const today = format(new Date(), "yyyy-MM-dd");
  const defaultFrom = format(subDays(new Date(), 90), "yyyy-MM-dd");

  const searchString = useSearch();
  const [, setLocation] = useLocation();
  const params = useMemo(() => new URLSearchParams(searchString || ""), [searchString]);

  const from = params.get("from") || defaultFrom;
  const to = params.get("to") || today;
  const plant = params.get("plant") || "";
  const selectedParties = params.getAll("party"); // party ids as strings
  const selectedMixTypes = params.getAll("mixType"); // mix type names

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
      // Parse per-date status from response headers (base64-encoded JSON).
      const total = Number(res.headers.get("X-Bulk-Total") || "0");
      const succeeded = Number(res.headers.get("X-Bulk-Succeeded") || "0");
      const failed = Number(res.headers.get("X-Bulk-Failed") || "0");
      const statusB64 = res.headers.get("X-Bulk-Status") || "";
      let statusEntries: BulkStatus[] = [];
      if (statusB64) {
        try { statusEntries = JSON.parse(atob(statusB64)); } catch { /* ignore */ }
      }

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

  const dashSep = appendOrigin("/plant/dashboard").includes("?") ? "&" : "?";
  const backHref = `${appendOrigin("/plant/dashboard")}${dashSep}tab=stock`;

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

      {!isLoading && grouped.map(([month, monthRows]) => (
        <Card key={month}>
          <CardHeader>
            <CardTitle className="text-base">
              {format(parseISO(`${month}-01`), "MMMM yyyy")}
              <Badge variant="outline" className="ml-2">{monthRows.length} day{monthRows.length === 1 ? "" : "s"}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Plant</TableHead>
                  <TableHead>Sections With Data</TableHead>
                  <TableHead className="text-right">Loads</TableHead>
                  <TableHead className="text-right">MT</TableHead>
                  <TableHead className="text-right">Sessions</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {monthRows.map((r) => {
                  const rowKey = `${r.date}-${r.plantName}`;
                  const openHref = appendOrigin(`/plant/daily-report/${r.date}?plant=${encodeURIComponent(r.plantName)}&tab=stock`);
                  const pdfHref = `/api/plant-module/daily-reports/${r.date}/pdf?plant=${encodeURIComponent(r.plantName)}`;
                  return (
                    <TableRow key={rowKey} data-testid={`row-report-${rowKey}`}>
                      <TableCell className="font-medium">
                        {format(parseISO(r.date), "EEE, dd MMM yyyy")}
                      </TableCell>
                      <TableCell>{r.plantName}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {r.hasShiftLog && (
                            <Badge variant={r.shiftLogFinalized ? "default" : "secondary"} className={r.shiftLogFinalized ? "bg-green-600" : ""}>
                              Shift Log{r.shiftLogFinalized ? " ✓" : ""}
                            </Badge>
                          )}
                          {r.hasDispatches && <Badge variant="outline">Dispatches</Badge>}
                          {r.hasEquipment && <Badge variant="outline">Equipment</Badge>}
                          {r.hasBitumenDips && <Badge variant="outline">Bitumen Dips</Badge>}
                          {r.hasLdoMeter && <Badge variant="outline">LDO Meter</Badge>}
                          {r.hasHeatingSessions && <Badge variant="outline" className="border-orange-400 text-orange-700 dark:text-orange-300">Heating</Badge>}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">{r.totalLoads || "—"}</TableCell>
                      <TableCell className="text-right">{r.totalProductionMt ? r.totalProductionMt.toFixed(2) : "—"}</TableCell>
                      <TableCell className="text-right">{r.sessionsCount || "—"}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex gap-1 justify-end">
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
      ))}
    </div>
  );
}
