import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link, useSearch } from "wouter";
import { format, addDays, parseISO } from "date-fns";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { ChevronLeft, Loader2, Save, AlertTriangle, FileSpreadsheet, Lock } from "lucide-react";
import { useOrigin } from "@/hooks/use-origin";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { LdoDipReading } from "@shared/schema";
import { getLdoVolumeAtDepth, getLdoMaxDepth } from "@shared/ldo-dip-chart";
import { LDO_DENSITY_KG_PER_LITER } from "@shared/bitumen-dip-chart";

const TANK_LABELS: Record<number, string> = { 1: "Boiler Tank", 2: "Dryer Tank" };
const PLANT_OPTIONS = ["Main Plant"];
const DEFAULT_FROM = "2026-02-25";

type RowSource = "manual" | "backfill" | "empty";

interface CellValue {
  value: string;
  source: RowSource;
  notes: string | null;
}

interface TankCells {
  opening: CellValue;
  closing: CellValue;
}

type TankKey = "tank1" | "tank2";
type TankNumber = 1 | 2;
type ReadingKind = "opening" | "closing";

interface GridRow {
  date: string;
  tank1: TankCells;
  tank2: TankCells;
  remarks: string;
}

interface BackfillPayloadRow {
  date: string;
  plant: string;
  tank: TankNumber;
  openingDepth: number | null;
  closingDepth: number | null;
  remarks: string;
}

interface BackfillConflict {
  date: string;
  plant: string;
  tank: TankNumber;
  reason: string;
}

interface BackfillSaveResult {
  message: string;
  actor: string;
  plant: string;
  inserted: number;
  deleted: number;
  skipped: number;
  conflicts: BackfillConflict[];
}

function classifySource(r: LdoDipReading): RowSource {
  if (r.notes && r.notes.toUpperCase().startsWith("[BACKFILL")) return "backfill";
  return "manual";
}

function emptyCell(): CellValue {
  return { value: "", source: "empty", notes: null };
}

function buildDateRange(from: string, to: string): string[] {
  if (!from || !to) return [];
  const fromD = parseISO(from);
  const toD = parseISO(to);
  if (isNaN(fromD.getTime()) || isNaN(toD.getTime())) return [];
  if (fromD > toD) return [];
  const out: string[] = [];
  let d = fromD;
  while (d <= toD) {
    out.push(format(d, "yyyy-MM-dd"));
    d = addDays(d, 1);
  }
  return out;
}

function buildGridFromReadings(dates: string[], readings: LdoDipReading[]): GridRow[] {
  const byDate = new Map<string, LdoDipReading[]>();
  for (const r of readings) {
    const arr = byDate.get(r.date) || [];
    arr.push(r);
    byDate.set(r.date, arr);
  }
  return dates.map(date => {
    const dayRows = byDate.get(date) || [];
    const pickLatest = (tank: number, type: "opening" | "closing"): CellValue => {
      const matches = dayRows
        .filter(r => r.tankNumber === tank && r.readingType === type)
        .sort((a, b) => (b.time || "").localeCompare(a.time || ""));
      const r = matches[0];
      if (!r) return emptyCell();
      return {
        value: String(r.depthCm ?? ""),
        source: classifySource(r),
        notes: r.notes,
      };
    };
    return {
      date,
      tank1: { opening: pickLatest(1, "opening"), closing: pickLatest(1, "closing") },
      tank2: { opening: pickLatest(2, "opening"), closing: pickLatest(2, "closing") },
      remarks: "",
    };
  });
}

const SOURCE_BADGE: Record<RowSource, { label: string; className: string }> = {
  "manual": { label: "manual", className: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200" },
  "backfill": { label: "backfill", className: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200" },
  "empty": { label: "", className: "" },
};

function formatVolume(tank: number, depth: number | null): string {
  if (depth === null || Number.isNaN(depth) || depth <= 0) return "—";
  const max = getLdoMaxDepth(tank);
  if (depth > max) return "out of range";
  const vol = getLdoVolumeAtDepth(tank, depth);
  const wt = (vol * LDO_DENSITY_KG_PER_LITER) / 1000;
  return `${vol.toFixed(0)} L / ${wt.toFixed(3)} MT`;
}

export default function PlantLdoDipBackfill() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { getPlantBackLink } = useOrigin();
  const searchString = useSearch();
  const urlRole = new URLSearchParams(searchString || (typeof window !== "undefined" ? window.location.search : "")).get("role");
  const pageRole: "manager" | "admin" | null = urlRole === "manager" || urlRole === "admin" ? urlRole : null;
  const backLink = getPlantBackLink({ defaultTab: "stock", role: pageRole });

  const isAdmin = !!user?.isAdmin;

  const today = format(new Date(), "yyyy-MM-dd");
  const [from, setFrom] = useState(DEFAULT_FROM);
  const [to, setTo] = useState(today);
  const [plant, setPlant] = useState(PLANT_OPTIONS[0]);
  const [csvText, setCsvText] = useState("");
  const [csvOpen, setCsvOpen] = useState(false);

  const [grid, setGrid] = useState<GridRow[]>([]);

  const dateRange = useMemo(() => buildDateRange(from, to), [from, to]);

  const { data: readings, isLoading, isError, error } = useQuery<LdoDipReading[]>({
    queryKey: ["/api/plant-module/ldo-dip-backfill", from, to, plant],
    queryFn: async () => {
      if (!from || !to) return [];
      const qs = new URLSearchParams({ from, to, plant }).toString();
      const res = await fetch(`/api/plant-module/ldo-dip-backfill?${qs}`, { credentials: "include" });
      if (!res.ok) throw new Error((await res.text()) || "Failed to load");
      return res.json();
    },
    enabled: isAdmin && !!from && !!to,
  });

  useEffect(() => {
    if (!isAdmin) return;
    if (!dateRange.length) { setGrid([]); return; }
    setGrid(buildGridFromReadings(dateRange, readings || []));
  }, [dateRange, readings, isAdmin]);

  const updateCell = (rowIdx: number, tank: 1 | 2, kind: "opening" | "closing", value: string) => {
    setGrid(prev => {
      const next = prev.slice();
      const row = { ...next[rowIdx] };
      const tankKey = tank === 1 ? "tank1" : "tank2";
      const tankObj = { ...row[tankKey] };
      const cell = { ...tankObj[kind], value };
      // Once edited, treat as backfill source unless protected (manual)
      if (cell.source !== "manual") {
        cell.source = "backfill";
      }
      tankObj[kind] = cell;
      row[tankKey] = tankObj;
      next[rowIdx] = row;
      return next;
    });
  };

  const updateRemarks = (rowIdx: number, remarks: string) => {
    setGrid(prev => {
      const next = prev.slice();
      next[rowIdx] = { ...next[rowIdx], remarks };
      return next;
    });
  };

  // ---------- Validation ----------
  const validation = useMemo(() => {
    const issues: { date: string; tank: number; severity: "error" | "warn"; msg: string }[] = [];
    for (const row of grid) {
      for (const tank of [1, 2] as const) {
        const t = tank === 1 ? row.tank1 : row.tank2;
        const max = getLdoMaxDepth(tank);
        const open = t.opening.value === "" ? null : Number(t.opening.value);
        const close = t.closing.value === "" ? null : Number(t.closing.value);
        if (open != null && Number.isNaN(open)) {
          issues.push({ date: row.date, tank, severity: "error", msg: "opening is not a number" });
        }
        if (close != null && Number.isNaN(close)) {
          issues.push({ date: row.date, tank, severity: "error", msg: "closing is not a number" });
        }
        if (open != null && !Number.isNaN(open) && (open < 0 || open > max)) {
          issues.push({ date: row.date, tank, severity: "error", msg: `opening out of range (0..${max} cm)` });
        }
        if (close != null && !Number.isNaN(close) && (close < 0 || close > max)) {
          issues.push({ date: row.date, tank, severity: "error", msg: `closing out of range (0..${max} cm)` });
        }
        if (open != null && close != null && !Number.isNaN(open) && !Number.isNaN(close) && close > open) {
          issues.push({
            date: row.date,
            tank,
            severity: "warn",
            msg: "closing depth higher than opening (refill?)",
          });
        }
      }
    }
    return issues;
  }, [grid]);

  const errorCount = validation.filter(v => v.severity === "error").length;
  const warnCount = validation.filter(v => v.severity === "warn").length;

  const isProtected = (_c: CellValue): boolean => false;

  const errorMessage = (err: unknown): string => {
    if (err instanceof Error) return err.message;
    if (typeof err === "string") return err;
    return "Unknown error";
  };

  // ---------- CSV import ----------
  const applyCsv = () => {
    const lines = csvText.split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith("#"));
    if (lines.length === 0) {
      toast({ title: "CSV empty", description: "Paste rows like: date,plant,tank,opening,closing,remarks", variant: "destructive" });
      return;
    }
    let headerSkipped = false;
    let applied = 0, skipped = 0, plantMismatched = 0;
    const map = new Map<string, GridRow>();
    for (const r of grid) map.set(r.date, r);

    for (const line of lines) {
      const cells = line.split(",").map(c => c.trim());
      if (!headerSkipped && /date/i.test(cells[0]) && /tank/i.test(cells[2] || "")) {
        headerSkipped = true;
        continue;
      }
      const [date, csvPlant, tankStr, openStr, closeStr, ...rest] = cells;
      const remarks = rest.join(",").trim();
      const tank = Number(tankStr);
      if (!date || (tank !== 1 && tank !== 2)) { skipped++; continue; }
      if (csvPlant && csvPlant.toLowerCase() !== plant.toLowerCase()) {
        plantMismatched++;
        skipped++;
        continue;
      }
      const row = map.get(date);
      if (!row) { skipped++; continue; }
      const tankKey: TankKey = tank === 1 ? "tank1" : "tank2";
      const t: TankCells = { ...row[tankKey] };
      const openCell: CellValue = { ...t.opening };
      const closeCell: CellValue = { ...t.closing };
      if (openStr !== undefined && openStr !== "" && !isProtected(openCell)) {
        openCell.value = openStr;
        openCell.source = "backfill";
      }
      if (closeStr !== undefined && closeStr !== "" && !isProtected(closeCell)) {
        closeCell.value = closeStr;
        closeCell.source = "backfill";
      }
      t.opening = openCell;
      t.closing = closeCell;
      const newRow: GridRow = { ...row, [tankKey]: t, remarks: remarks || row.remarks };
      map.set(date, newRow);
      applied++;
    }
    setGrid(Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date)));
    const tail = plantMismatched ? ` (${plantMismatched} skipped: plant column did not match "${plant}")` : "";
    toast({ title: "CSV applied", description: `${applied} row(s) imported, ${skipped} skipped${tail}` });
    setCsvOpen(false);
    setCsvText("");
  };

  // ---------- Save ----------
  const saveMutation = useMutation<BackfillSaveResult, Error, { plant: string; rows: BackfillPayloadRow[] }>({
    mutationFn: async (payload) => {
      const res = await apiRequest("POST", "/api/plant-module/ldo-dip-backfill", payload);
      return res.json() as Promise<BackfillSaveResult>;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/ldo-dip-backfill"] });
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/ldo-dip-readings"] });
      const desc = `Inserted ${result.inserted}, deleted ${result.deleted}, skipped ${result.skipped}` +
        (result.conflicts.length ? `, ${result.conflicts.length} conflict(s)` : "");
      toast({ title: "Backfill saved", description: desc });
      if (result.conflicts.length) {
        const sample = result.conflicts.slice(0, 5).map((c) => `${c.date} T${c.tank}: ${c.reason}`).join("; ");
        toast({ title: "Conflicts skipped", description: sample, variant: "destructive" });
      }
    },
    onError: (err) => {
      toast({ title: "Save failed", description: errorMessage(err), variant: "destructive" });
    },
  });

  const handleSave = () => {
    if (errorCount > 0) {
      toast({ title: "Fix errors first", description: `${errorCount} row(s) have errors`, variant: "destructive" });
      return;
    }
    const payload: BackfillPayloadRow[] = [];
    for (const row of grid) {
      for (const tank of [1, 2] as const) {
        const t: TankCells = tank === 1 ? row.tank1 : row.tank2;
        const opening = t.opening.value === "" ? null : Number(t.opening.value);
        const closing = t.closing.value === "" ? null : Number(t.closing.value);
        const openProtected = isProtected(t.opening);
        const closeProtected = isProtected(t.closing);
        // Push if there is any editable cell value to write OR a previously
        // backfilled cell that may need clearing (delete-only payload row).
        const editableHadValue =
          (!openProtected && (opening !== null || t.opening.source === "backfill"))
          || (!closeProtected && (closing !== null || t.closing.source === "backfill"));
        if (!editableHadValue) continue;
        payload.push({
          date: row.date,
          plant,
          tank,
          openingDepth: openProtected ? null : opening,
          closingDepth: closeProtected ? null : closing,
          remarks: row.remarks || "",
        });
      }
    }
    if (payload.length === 0) {
      toast({ title: "Nothing to save", description: "No editable cells were modified" });
      return;
    }
    saveMutation.mutate({ plant, rows: payload });
  };

  if (!isAdmin) {
    return (
      <div className="space-y-4 max-w-2xl mx-auto py-12">
        <Link href={backLink}>
          <Button variant="ghost" size="sm" data-testid="link-back">
            <ChevronLeft className="w-4 h-4 mr-1" /> Back
          </Button>
        </Link>
        <Card>
          <CardContent className="p-8 flex flex-col items-center text-center gap-3">
            <Lock className="w-10 h-10 text-muted-foreground" />
            <h2 className="text-lg font-semibold">Admin only</h2>
            <p className="text-sm text-muted-foreground">
              The LDO dip-stick backfill tool is restricted to admin users. Please log in as an admin and try again.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <Link href={backLink}>
          <Button variant="ghost" size="sm" data-testid="link-back">
            <ChevronLeft className="w-4 h-4 mr-1" /> Back to Plant
          </Button>
        </Link>
        <div className="text-xs text-muted-foreground flex items-center gap-2">
          <Badge variant="outline">Admin only</Badge>
          <span>Logged in as <span className="font-medium">{user?.fullName}</span></span>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">LDO Dip-Stick Backfill</CardTitle>
          <p className="text-sm text-muted-foreground">
            Enter or correct historical Tank-1 / Tank-2 dip-stick depth (cm) for past dates so
            book-vs-physical LDO stock reconciliation is complete for the same range as the meter backfill.
            Volume and weight are auto-computed from the dip chart. All rows are editable by admins.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <Label className="text-xs">From</Label>
              <Input type="date" value={from} onChange={e => setFrom(e.target.value)} data-testid="input-backfill-from" />
            </div>
            <div>
              <Label className="text-xs">To</Label>
              <Input type="date" value={to} onChange={e => setTo(e.target.value)} data-testid="input-backfill-to" />
            </div>
            <div>
              <Label className="text-xs">Plant</Label>
              <Select value={plant} onValueChange={setPlant}>
                <SelectTrigger data-testid="select-backfill-plant">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PLANT_OPTIONS.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => setCsvOpen(o => !o)} data-testid="button-toggle-csv">
              <FileSpreadsheet className="w-4 h-4 mr-1" />
              {csvOpen ? "Hide CSV import" : "CSV import"}
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={saveMutation.isPending || errorCount > 0 || grid.length === 0}
              data-testid="button-save-backfill"
            >
              {saveMutation.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
              Save backfill
            </Button>
            {errorCount > 0 && (
              <span className="text-sm text-red-600 flex items-center gap-1">
                <AlertTriangle className="w-4 h-4" /> {errorCount} error(s)
              </span>
            )}
            {warnCount > 0 && (
              <span className="text-sm text-amber-600 flex items-center gap-1">
                <AlertTriangle className="w-4 h-4" /> {warnCount} warning(s)
              </span>
            )}
          </div>

          {csvOpen && (
            <div className="border rounded-lg p-3 space-y-2 bg-muted/40">
              <p className="text-xs text-muted-foreground">
                Paste CSV with columns: <code>date,plant,tank,opening_cm,closing_cm,remarks</code> (one row per tank per day). A
                header line is optional. Dates outside the current range are ignored.
              </p>
              <Textarea
                rows={6}
                value={csvText}
                onChange={e => setCsvText(e.target.value)}
                placeholder={"2026-02-25,Main Plant,1,82.5,71.0,morning + evening dip\n2026-02-25,Main Plant,2,124,118,"}
                data-testid="textarea-csv"
              />
              <div className="flex gap-2 justify-end">
                <Button size="sm" onClick={applyCsv} data-testid="button-apply-csv">Apply CSV</Button>
                <Button size="sm" variant="ghost" onClick={() => { setCsvText(""); setCsvOpen(false); }}>Cancel</Button>
              </div>
            </div>
          )}

          {isLoading && (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading existing readings…
            </div>
          )}

          {isError && (
            <div className="text-sm text-red-600">Failed to load readings: {errorMessage(error)}</div>
          )}

          {!isLoading && grid.length === 0 && (
            <div className="text-sm text-muted-foreground py-6 text-center">
              Choose a date range to start (default is Feb 25 → today).
            </div>
          )}

          {grid.length > 0 && (
            <div className="overflow-x-auto border rounded-lg">
              <table className="min-w-full text-sm">
                <thead className="bg-muted/60 text-xs uppercase tracking-wide">
                  <tr>
                    <th className="text-left p-2 sticky left-0 bg-muted/60">Date</th>
                    <th className="text-left p-2">T1 Open (cm)<br /><span className="text-[10px] normal-case text-muted-foreground">{TANK_LABELS[1]}</span></th>
                    <th className="text-left p-2">T1 Close (cm)</th>
                    <th className="text-left p-2">T2 Open (cm)<br /><span className="text-[10px] normal-case text-muted-foreground">{TANK_LABELS[2]}</span></th>
                    <th className="text-left p-2">T2 Close (cm)</th>
                    <th className="text-left p-2 min-w-[180px]">Remarks</th>
                    <th className="text-left p-2">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {grid.map((row, idx) => {
                    const rowIssues = validation.filter(v => v.date === row.date);
                    const cellEntries: Array<{ tankKey: TankKey; tankNum: TankNumber; kind: ReadingKind; cell: CellValue }> = [
                      { tankKey: "tank1", tankNum: 1, kind: "opening", cell: row.tank1.opening },
                      { tankKey: "tank1", tankNum: 1, kind: "closing", cell: row.tank1.closing },
                      { tankKey: "tank2", tankNum: 2, kind: "opening", cell: row.tank2.opening },
                      { tankKey: "tank2", tankNum: 2, kind: "closing", cell: row.tank2.closing },
                    ];
                    return (
                      <tr key={row.date} className="border-t">
                        <td className="p-2 font-mono text-xs sticky left-0 bg-background">{row.date}</td>
                        {cellEntries.map(({ tankKey, tankNum, kind, cell }) => {
                          const protectedCell = isProtected(cell);
                          const issue = rowIssues.find(i => i.tank === tankNum);
                          const numeric = cell.value === "" ? null : Number(cell.value);
                          return (
                            <td key={`${tankKey}-${kind}`} className="p-2 align-top">
                              <Input
                                type="number"
                                step="any"
                                value={cell.value}
                                onChange={e => updateCell(idx, tankNum, kind, e.target.value)}
                                disabled={protectedCell}
                                className={`h-8 ${issue ? "border-red-500" : ""}`}
                                data-testid={`input-${tankKey}-${kind}-${row.date}`}
                              />
                              <div className="text-[10px] text-muted-foreground mt-1" data-testid={`text-${tankKey}-${kind}-volume-${row.date}`}>
                                {formatVolume(tankNum, numeric)}
                              </div>
                              {cell.source !== "empty" && (
                                <Badge variant="secondary" className={`mt-1 text-[10px] py-0 ${SOURCE_BADGE[cell.source].className}`}>
                                  {SOURCE_BADGE[cell.source].label}
                                </Badge>
                              )}
                            </td>
                          );
                        })}
                        <td className="p-2">
                          <Input
                            value={row.remarks}
                            onChange={e => updateRemarks(idx, e.target.value)}
                            placeholder="optional"
                            className="h-8"
                            data-testid={`input-remarks-${row.date}`}
                          />
                        </td>
                        <td className="p-2 text-xs space-y-0.5">
                          {rowIssues.map((iss, k) => (
                            <div
                              key={k}
                              className={iss.severity === "error" ? "text-red-600" : "text-amber-600"}
                              data-testid={`note-${iss.severity}-${row.date}-${iss.tank}`}
                            >
                              T{iss.tank}: {iss.msg}
                            </div>
                          ))}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
