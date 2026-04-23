import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useOrigin } from "@/hooks/use-origin";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChevronLeft, Download, FileDown, Loader2, ExternalLink } from "lucide-react";
import { format, parseISO, subDays } from "date-fns";
import { useToast } from "@/hooks/use-toast";

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
  const [from, setFrom] = useState(format(subDays(new Date(), 90), "yyyy-MM-dd"));
  const [to, setTo] = useState(today);
  const [plant, setPlant] = useState<string>("");
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<string>("");

  const { data: plantsList } = useQuery<string[]>({
    queryKey: ["/api/plant-module/shift-logs/plants"],
    queryFn: async () => {
      const res = await fetch("/api/plant-module/shift-logs/plants", { credentials: "include" });
      if (!res.ok) return ["Main Plant"];
      return res.json();
    },
  });

  const { data: rows, isLoading } = useQuery<IndexRow[]>({
    queryKey: ["/api/plant-module/daily-reports-index", from, to, plant],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      if (plant) params.set("plant", plant);
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
    setTo(today);
    setFrom(format(subDays(new Date(), days), "yyyy-MM-dd"));
  };

  const handleBulkExport = async () => {
    if (!rows?.length) {
      toast({ title: "No reports to export", description: "Adjust the filters to include some dates." });
      return;
    }
    setBulkBusy(true);
    setBulkProgress(`Building ZIP for ${rows.length} report${rows.length === 1 ? "" : "s"}…`);
    try {
      // Group dates by plant — server endpoint accepts a single plant per call.
      const byPlant = new Map<string, string[]>();
      for (const r of rows) {
        if (!byPlant.has(r.plantName)) byPlant.set(r.plantName, []);
        byPlant.get(r.plantName)!.push(r.date);
      }
      let okCount = 0;
      for (const [plantName, dates] of byPlant.entries()) {
        setBulkProgress(`Building PDFs for ${plantName} (${dates.length} dates)…`);
        const res = await fetch("/api/plant-module/daily-reports/bulk-zip", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ plant: plantName, dates }),
        });
        if (!res.ok) {
          const msg = await res.text().catch(() => "");
          throw new Error(`Bulk ZIP failed for ${plantName}: ${msg}`);
        }
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `daily-plant-reports-${plantName.replace(/\s+/g, "_")}-${dates[dates.length - 1]}_to_${dates[0]}.zip`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        okCount += dates.length;
      }
      setBulkProgress("");
      toast({ title: "Bulk export complete", description: `Downloaded ${okCount} PDF${okCount === 1 ? "" : "s"} as ZIP.` });
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
