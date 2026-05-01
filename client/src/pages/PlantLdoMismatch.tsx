import { Fragment, useEffect, useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link, useRoute, useLocation, useSearch } from "wouter";
import { useOrigin } from "@/hooks/use-origin";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertTriangle,
  ChevronLeft,
  ChevronDown,
  ChevronRight,
  Download,
  Flame,
  GitCompare,
  Loader2,
  Pencil,
  ArrowRight,
  GaugeCircle,
  BookOpen,
  Calendar,
  Trash2,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { BitumenHeatingSession, PlantShiftLog, LdoFlowReading } from "@shared/schema";
import { heatingSessionTypeLabel } from "@shared/schema";
import { HEATING_TRENDS_MISMATCH_THRESHOLD_L } from "@shared/heating-trends-constants";

const MISMATCH_THRESHOLD_L = HEATING_TRENDS_MISMATCH_THRESHOLD_L;

function fmt(n: number | null | undefined, digits = 1): string {
  if (n == null || isNaN(n as number)) return "—";
  return Number(n).toFixed(digits);
}

function shiftConsumed(
  sh: Pick<PlantShiftLog, "ldoTank1OpeningMeter" | "ldoTank1ClosingMeter">,
): number | null {
  const op = sh.ldoTank1OpeningMeter;
  const cl = sh.ldoTank1ClosingMeter;
  if (op == null || cl == null) return null;
  return Math.max(0, cl - op);
}

function ldoLedgerConsumed(r: LdoFlowReading): number | null {
  if (r.quantityLiters != null) return r.quantityLiters;
  return null;
}

function sourceLabel(r: LdoFlowReading): string {
  if (r.sourceHeatingSessionId != null) return `Session #${r.sourceHeatingSessionId}`;
  if (r.sourceShiftLogId != null) return `Shift Log #${r.sourceShiftLogId}`;
  return "Manual";
}

function getDatesInRange(from: string, to: string): string[] {
  if (!from || !to) return from ? [from] : [];
  const parseParts = (s: string) => s.split("-").map(Number) as [number, number, number];
  const [fy, fm, fd] = parseParts(from);
  const [ty, tm, td] = parseParts(to);
  const startMs = Date.UTC(fy, fm - 1, fd);
  const endMs = Date.UTC(ty, tm - 1, td);
  if (isNaN(startMs) || isNaN(endMs) || startMs > endMs) return from ? [from] : [];
  const result: string[] = [];
  const DAY_MS = 86_400_000;
  for (let ms = startMs; ms <= endMs; ms += DAY_MS) {
    const d = new Date(ms);
    const yyyy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(d.getUTCDate()).padStart(2, "0");
    result.push(`${yyyy}-${mm}-${dd}`);
  }
  return result;
}

function deltaClass(d: number | null): string {
  if (d == null) return "text-muted-foreground";
  return Math.abs(d) > MISMATCH_THRESHOLD_L ? "text-destructive font-semibold" : "text-green-600";
}

interface DaySummary {
  date: string;
  sessions: BitumenHeatingSession[];
  shiftLogs: PlantShiftLog[];
  ledgerRows: LdoFlowReading[];
  orphanedLedgerRows: LdoFlowReading[];
  sessionsTotalL: number;
  shiftTotalL: number;
  anyShiftHasMeter: boolean;
  ledgerTotalL: number;
  deltaSessionsVsShift: number | null;
  deltaSessionsVsLedger: number | null;
  deltaShiftVsLedger: number | null;
  hasMismatch: boolean;
}

function buildDaySummaries(
  dates: string[],
  allSessions: BitumenHeatingSession[],
  allShiftLogs: PlantShiftLog[],
  allLedgerRows: LdoFlowReading[],
  plant: string,
): DaySummary[] {
  return dates.map(date => {
    const sessions = allSessions.filter(
      s => s.plantName === plant && s.date === date,
    );
    const shiftLogs = allShiftLogs.filter(
      sh => sh.plantName === plant && sh.date === date,
    );
    const ledgerRows = allLedgerRows.filter(
      r =>
        r.date === date &&
        (r.sourceHeatingSessionId != null || r.sourceShiftLogId != null),
    );

    const sessionIds = new Set(sessions.map(s => s.id));
    const orphanedLedgerRows = ledgerRows.filter(
      r => r.sourceHeatingSessionId != null && !sessionIds.has(r.sourceHeatingSessionId),
    );

    const sessionsTotalL = sessions.reduce((s, x) => s + (x.ldoTank1Consumed || 0), 0);
    const shiftTotalL = shiftLogs.reduce((s, sh) => {
      const c = shiftConsumed(sh);
      return s + (c == null ? 0 : c);
    }, 0);
    const anyShiftHasMeter = shiftLogs.some(sh => shiftConsumed(sh) != null);
    const ledgerTotalL = ledgerRows.reduce((s, r) => {
      const c = ldoLedgerConsumed(r);
      return s + (c == null ? 0 : c);
    }, 0);

    const deltaSessionsVsShift =
      sessions.length > 0 || anyShiftHasMeter
        ? Math.round((sessionsTotalL - shiftTotalL) * 10) / 10
        : null;
    const deltaSessionsVsLedger =
      sessions.length > 0 || ledgerRows.length > 0
        ? Math.round((sessionsTotalL - ledgerTotalL) * 10) / 10
        : null;
    const deltaShiftVsLedger =
      anyShiftHasMeter || ledgerRows.length > 0
        ? Math.round((shiftTotalL - ledgerTotalL) * 10) / 10
        : null;

    const hasMismatch = [deltaSessionsVsShift, deltaSessionsVsLedger, deltaShiftVsLedger].some(
      d => d != null && Math.abs(d) > MISMATCH_THRESHOLD_L,
    );

    return {
      date,
      sessions,
      shiftLogs,
      ledgerRows,
      orphanedLedgerRows,
      sessionsTotalL,
      shiftTotalL,
      anyShiftHasMeter,
      ledgerTotalL,
      deltaSessionsVsShift,
      deltaSessionsVsLedger,
      deltaShiftVsLedger,
      hasMismatch,
    };
  });
}

function DeltaCell({ d }: { d: number | null }) {
  if (d == null) return <span className="text-muted-foreground">—</span>;
  const over = Math.abs(d) > MISMATCH_THRESHOLD_L;
  return (
    <span className={over ? "text-destructive font-semibold" : "text-green-600"}>
      {d > 0 ? "+" : ""}
      {fmt(d)} L
    </span>
  );
}

interface DayDetailProps {
  day: DaySummary;
  plant: string;
  appendPlantContext: (path: string, opts?: { defaultTab?: string }) => string;
  ldoFlowMeterLink: string;
  isAdmin: boolean;
  onCleanupOrphaned: (date: string) => void;
  cleanupPending: boolean;
}

function DayDetail({ day, plant, appendPlantContext, ldoFlowMeterLink, isAdmin, onCleanupOrphaned, cleanupPending }: DayDetailProps) {
  const { date, sessions, shiftLogs, ledgerRows, orphanedLedgerRows } = day;

  const heatSessionsLink = appendPlantContext(`/plant/heating-sessions/${date}`, {
    defaultTab: "operations",
  });
  const shiftLogLink = appendPlantContext(`/plant/shift-log/${date}`, {
    defaultTab: "operations",
  });
  const editSessionLink = (sessionId: number) =>
    appendPlantContext(`/plant/heating-sessions/${date}?openSession=${sessionId}`, {
      defaultTab: "operations",
    });

  return (
    <div className="space-y-4 mt-4">
      {orphanedLedgerRows.length > 0 && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4 flex flex-col gap-2" data-testid={`alert-orphaned-rows-${date}`}>
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-destructive">
                {orphanedLedgerRows.length} orphaned LDO ledger {orphanedLedgerRows.length === 1 ? "entry" : "entries"} found
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                These entries were auto-created by heating sessions that have since been deleted.
                They are still counted in the LDO ledger, which is why the totals don't match.
                Removing them will resolve the mismatch.
              </p>
              <ul className="mt-1 space-y-0.5">
                {[...new Set(orphanedLedgerRows.map(r => r.sourceHeatingSessionId))].map(sid => {
                  const rows = orphanedLedgerRows.filter(r => r.sourceHeatingSessionId === sid);
                  return (
                    <li key={sid} className="text-xs text-muted-foreground">
                      Session #{sid} — {rows.length} {rows.length === 1 ? "row" : "rows"} ({rows.map(r => r.readingType).join(", ")})
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
          {isAdmin && (
            <div className="flex justify-end">
              <Button
                size="sm"
                variant="destructive"
                disabled={cleanupPending}
                onClick={() => onCleanupOrphaned(date)}
                data-testid={`button-cleanup-orphaned-${date}`}
              >
                {cleanupPending ? <Loader2 className="w-3 h-3 mr-1.5 animate-spin" /> : <Trash2 className="w-3 h-3 mr-1.5" />}
                Remove {orphanedLedgerRows.length} orphaned {orphanedLedgerRows.length === 1 ? "entry" : "entries"}
              </Button>
            </div>
          )}
        </div>
      )}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Flame className="w-4 h-4 text-orange-600" />
              Heating sessions on {date}
            </CardTitle>
            <Link href={heatSessionsLink}>
              <Button variant="outline" size="sm" data-testid={`button-open-sessions-${date}`}>
                Open sessions list
                <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            </Link>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {sessions.length === 0 ? (
            <p className="text-sm text-muted-foreground" data-testid={`text-no-sessions-${date}`}>
              No heating sessions logged for this date.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b">
                  <th className="py-2 pr-3">Type</th>
                  <th className="py-2 pr-3">Start</th>
                  <th className="py-2 pr-3">End</th>
                  <th className="py-2 pr-3 text-right">Opening meter</th>
                  <th className="py-2 pr-3 text-right">Closing meter</th>
                  <th className="py-2 pr-3 text-right">Consumed (L)</th>
                  <th className="py-2 pr-3" />
                </tr>
              </thead>
              <tbody>
                {sessions.map(s => (
                  <tr
                    key={s.id}
                    className="border-b hover:bg-muted/30"
                    data-testid={`row-session-${s.id}`}
                  >
                    <td className="py-2 pr-3">
                      <Badge variant={s.sessionType === "NIGHT_PREHEAT" ? "secondary" : "outline"}>
                        {heatingSessionTypeLabel(s.sessionType)}
                      </Badge>
                    </td>
                    <td className="py-2 pr-3">{s.startTime || "—"}</td>
                    <td className="py-2 pr-3">{s.endTime || "—"}</td>
                    <td className="py-2 pr-3 text-right" data-testid={`cell-session-open-${s.id}`}>
                      {fmt(s.ldoTank1OpeningMeter, 2)}
                    </td>
                    <td className="py-2 pr-3 text-right" data-testid={`cell-session-close-${s.id}`}>
                      {fmt(s.ldoTank1ClosingMeter, 2)}
                    </td>
                    <td
                      className="py-2 pr-3 text-right font-medium"
                      data-testid={`cell-session-consumed-${s.id}`}
                    >
                      {fmt(s.ldoTank1Consumed, 1)}
                    </td>
                    <td className="py-2 pr-3 text-right">
                      <Link href={editSessionLink(s.id)}>
                        <Button
                          variant="ghost"
                          size="sm"
                          data-testid={`link-edit-session-${s.id}`}
                        >
                          <Pencil className="w-4 h-4 mr-1" /> Edit
                        </Button>
                      </Link>
                    </td>
                  </tr>
                ))}
                <tr className="font-semibold">
                  <td className="py-2 pr-3" colSpan={5}>
                    Sessions total
                  </td>
                  <td className="py-2 pr-3 text-right" data-testid={`text-sessions-total-row-${date}`}>
                    {fmt(day.sessionsTotalL, 1)}
                  </td>
                  <td />
                </tr>
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <GaugeCircle className="w-4 h-4 text-sky-600" />
              Shift log meter on {date}
            </CardTitle>
            <Link href={shiftLogLink}>
              <Button variant="outline" size="sm" data-testid={`button-open-shift-log-${date}`}>
                Open shift log
                <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            </Link>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {shiftLogs.length === 0 ? (
            <p className="text-sm text-muted-foreground" data-testid={`text-no-shift-logs-${date}`}>
              No shift log entered for this date.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b">
                  <th className="py-2 pr-3">Shift</th>
                  <th className="py-2 pr-3 text-right">Opening meter</th>
                  <th className="py-2 pr-3 text-right">Closing meter</th>
                  <th className="py-2 pr-3 text-right">Consumed (L)</th>
                  <th className="py-2 pr-3" />
                </tr>
              </thead>
              <tbody>
                {shiftLogs.map(sh => {
                  const consumed = shiftConsumed(sh);
                  return (
                    <tr
                      key={sh.id}
                      className="border-b hover:bg-muted/30"
                      data-testid={`row-shift-${sh.id}`}
                    >
                      <td className="py-2 pr-3">
                        <Badge variant="outline">{sh.shiftCode}</Badge>
                      </td>
                      <td
                        className="py-2 pr-3 text-right"
                        data-testid={`cell-shift-open-${sh.id}`}
                      >
                        {fmt(sh.ldoTank1OpeningMeter, 2)}
                      </td>
                      <td
                        className="py-2 pr-3 text-right"
                        data-testid={`cell-shift-close-${sh.id}`}
                      >
                        {fmt(sh.ldoTank1ClosingMeter, 2)}
                      </td>
                      <td
                        className="py-2 pr-3 text-right font-medium"
                        data-testid={`cell-shift-consumed-${sh.id}`}
                      >
                        {consumed == null ? "—" : fmt(consumed, 1)}
                      </td>
                      <td className="py-2 pr-3 text-right">
                        <Link href={shiftLogLink}>
                          <Button
                            variant="ghost"
                            size="sm"
                            data-testid={`link-edit-shift-${sh.id}`}
                          >
                            <Pencil className="w-4 h-4 mr-1" /> Edit
                          </Button>
                        </Link>
                      </td>
                    </tr>
                  );
                })}
                <tr className="font-semibold">
                  <td className="py-2 pr-3" colSpan={3}>
                    Shift-meter total
                  </td>
                  <td
                    className="py-2 pr-3 text-right"
                    data-testid={`text-shift-total-row-${date}`}
                  >
                    {day.anyShiftHasMeter ? fmt(day.shiftTotalL, 1) : "—"}
                  </td>
                  <td />
                </tr>
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <BookOpen className="w-4 h-4 text-violet-600" />
              LDO Flow Ledger rows on {date} (Tank 1 · auto-tagged)
            </CardTitle>
            <Link href={ldoFlowMeterLink}>
              <Button
                variant="outline"
                size="sm"
                data-testid={`button-open-ldo-flow-meter-${date}`}
              >
                Open LDO Flow Meter
                <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            </Link>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {ledgerRows.length === 0 ? (
            <p className="text-sm text-muted-foreground" data-testid={`text-no-ledger-rows-${date}`}>
              No auto-tagged ledger rows for this date. If heating sessions or shift logs exist,
              they may not have generated flow-meter entries yet — check the LDO Flow Meter page.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b">
                  <th className="py-2 pr-3">Source</th>
                  <th className="py-2 pr-3">Type</th>
                  <th className="py-2 pr-3">Time</th>
                  <th className="py-2 pr-3 text-right">Meter reading</th>
                  <th className="py-2 pr-3 text-right">Quantity (L)</th>
                  <th className="py-2 pr-3">Notes</th>
                  <th className="py-2 pr-3" />
                </tr>
              </thead>
              <tbody>
                {ledgerRows.map(r => (
                  <tr
                    key={r.id}
                    className="border-b hover:bg-muted/30"
                    data-testid={`row-ledger-${r.id}`}
                  >
                    <td className="py-2 pr-3">
                      <Badge
                        variant={r.sourceHeatingSessionId != null ? "secondary" : "outline"}
                      >
                        {sourceLabel(r)}
                      </Badge>
                    </td>
                    <td className="py-2 pr-3 text-xs text-muted-foreground">{r.readingType}</td>
                    <td className="py-2 pr-3">{r.time || "—"}</td>
                    <td
                      className="py-2 pr-3 text-right"
                      data-testid={`cell-ledger-meter-${r.id}`}
                    >
                      {fmt(r.meterReading, 2)}
                    </td>
                    <td
                      className="py-2 pr-3 text-right font-medium"
                      data-testid={`cell-ledger-qty-${r.id}`}
                    >
                      {r.quantityLiters != null ? fmt(r.quantityLiters, 1) : "—"}
                    </td>
                    <td className="py-2 pr-3 text-xs text-muted-foreground max-w-[180px] truncate">
                      {r.notes || "—"}
                    </td>
                    <td className="py-2 pr-3 text-right">
                      {r.sourceHeatingSessionId != null ? (
                        <Link href={editSessionLink(r.sourceHeatingSessionId)}>
                          <Button
                            variant="ghost"
                            size="sm"
                            data-testid={`link-edit-ledger-session-${r.id}`}
                          >
                            <Pencil className="w-4 h-4 mr-1" /> Edit session
                          </Button>
                        </Link>
                      ) : r.sourceShiftLogId != null ? (
                        <Link href={shiftLogLink}>
                          <Button
                            variant="ghost"
                            size="sm"
                            data-testid={`link-edit-ledger-shift-${r.id}`}
                          >
                            <Pencil className="w-4 h-4 mr-1" /> Edit shift log
                          </Button>
                        </Link>
                      ) : (
                        <Link href={ldoFlowMeterLink}>
                          <Button
                            variant="ghost"
                            size="sm"
                            data-testid={`link-edit-ledger-${r.id}`}
                          >
                            <Pencil className="w-4 h-4 mr-1" /> Edit
                          </Button>
                        </Link>
                      )}
                    </td>
                  </tr>
                ))}
                <tr className="font-semibold">
                  <td className="py-2 pr-3" colSpan={4}>
                    Ledger total
                  </td>
                  <td
                    className="py-2 pr-3 text-right"
                    data-testid={`text-ledger-total-row-${date}`}
                  >
                    {fmt(day.ledgerTotalL, 1)}
                  </td>
                  <td colSpan={2} />
                </tr>
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function PlantLdoMismatch() {
  const { appendPlantContext, getPlantBackLink } = useOrigin();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const { toast } = useToast();
  const [, params] = useRoute("/plant/ldo-mismatch/:date");
  const routeDate = params?.date || "";
  const [, setLocation] = useLocation();

  const searchString = useSearch();
  const sp = new URLSearchParams(searchString);
  const plant = sp.get("plant") || "Main Plant";

  const initialFrom = sp.get("dateFrom") || routeDate;
  const initialTo = sp.get("dateTo") || routeDate;

  const [dateFrom, setDateFrom] = useState(initialFrom);
  const [dateTo, setDateTo] = useState(initialTo);

  useEffect(() => {
    const urlFrom = sp.get("dateFrom") || routeDate;
    const urlTo = sp.get("dateTo") || routeDate;
    setDateFrom(urlFrom);
    setDateTo(urlTo);
  }, [searchString, routeDate]);

  const [expandedDates, setExpandedDates] = useState<Set<string>>(
    () => new Set(routeDate ? [routeDate] : []),
  );

  function toggleDate(d: string) {
    setExpandedDates(prev => {
      const next = new Set(prev);
      if (next.has(d)) next.delete(d);
      else next.add(d);
      return next;
    });
  }

  function applyRange() {
    const newSp = new URLSearchParams(searchString);
    newSp.set("dateFrom", dateFrom);
    newSp.set("dateTo", dateTo);
    const path = `/plant/ldo-mismatch/${dateFrom}?${newSp.toString()}`;
    setLocation(path);
    setExpandedDates(new Set());
  }

  const effectiveDateFrom = sp.get("dateFrom") || routeDate;
  const effectiveDateTo = sp.get("dateTo") || routeDate;

  const dashboardBackLink = getPlantBackLink({ defaultTab: "operations" });
  const ldoFlowMeterLink = appendPlantContext(
    `/plant/ldo-flow-meter?plant=${encodeURIComponent(plant)}`,
    { defaultTab: "stock" },
  );

  const rangeEnabled = !!(effectiveDateFrom && effectiveDateTo);

  const sessionsQuery = useQuery<BitumenHeatingSession[]>({
    queryKey: [
      "/api/plant-module/heating-sessions",
      { dateFrom: effectiveDateFrom, dateTo: effectiveDateTo, plant },
    ],
    enabled: rangeEnabled,
    queryFn: async () => {
      const qs = new URLSearchParams();
      qs.set("dateFrom", effectiveDateFrom);
      qs.set("dateTo", effectiveDateTo);
      qs.set("plant", plant);
      const res = await fetch(`/api/plant-module/heating-sessions?${qs.toString()}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  });

  const shiftLogsQuery = useQuery<PlantShiftLog[]>({
    queryKey: [
      "/api/plant-module/shift-logs",
      { dateFrom: effectiveDateFrom, dateTo: effectiveDateTo },
    ],
    enabled: rangeEnabled,
    queryFn: async () => {
      const qs = new URLSearchParams();
      qs.set("dateFrom", effectiveDateFrom);
      qs.set("dateTo", effectiveDateTo);
      const res = await fetch(`/api/plant-module/shift-logs?${qs.toString()}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  });

  const ldoReadingsQuery = useQuery<LdoFlowReading[]>({
    queryKey: [
      "/api/plant-module/ldo-flow-readings",
      { dateFrom: effectiveDateFrom, dateTo: effectiveDateTo, plantName: plant, tankNumber: 1 },
    ],
    enabled: rangeEnabled,
    queryFn: async () => {
      const qs = new URLSearchParams();
      qs.set("dateFrom", effectiveDateFrom);
      qs.set("dateTo", effectiveDateTo);
      qs.set("plantName", plant);
      qs.set("tankNumber", "1");
      const res = await fetch(`/api/plant-module/ldo-flow-readings?${qs.toString()}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  });

  const dates = useMemo(
    () => getDatesInRange(effectiveDateFrom, effectiveDateTo),
    [effectiveDateFrom, effectiveDateTo],
  );

  const daySummaries = useMemo(
    () =>
      buildDaySummaries(
        dates,
        sessionsQuery.data || [],
        shiftLogsQuery.data || [],
        ldoReadingsQuery.data || [],
        plant,
      ),
    [dates, sessionsQuery.data, shiftLogsQuery.data, ldoReadingsQuery.data, plant],
  );

  const rangeTotals = useMemo(() => {
    const sessionsTotalL = daySummaries.reduce((s, d) => s + d.sessionsTotalL, 0);
    const shiftTotalL = daySummaries.reduce((s, d) => s + d.shiftTotalL, 0);
    const ledgerTotalL = daySummaries.reduce((s, d) => s + d.ledgerTotalL, 0);
    const anyShiftHasMeter = daySummaries.some(d => d.anyShiftHasMeter);
    const anySession = daySummaries.some(d => d.sessions.length > 0);
    const anyLedger = daySummaries.some(d => d.ledgerRows.length > 0);
    const deltaSessionsVsShift =
      anySession || anyShiftHasMeter
        ? Math.round((sessionsTotalL - shiftTotalL) * 10) / 10
        : null;
    const deltaSessionsVsLedger =
      anySession || anyLedger
        ? Math.round((sessionsTotalL - ledgerTotalL) * 10) / 10
        : null;
    const deltaShiftVsLedger =
      anyShiftHasMeter || anyLedger
        ? Math.round((shiftTotalL - ledgerTotalL) * 10) / 10
        : null;
    return {
      sessionsTotalL,
      shiftTotalL,
      ledgerTotalL,
      anyShiftHasMeter,
      deltaSessionsVsShift,
      deltaSessionsVsLedger,
      deltaShiftVsLedger,
    };
  }, [daySummaries]);

  const mismatchCount = useMemo(
    () => daySummaries.filter(d => d.hasMismatch).length,
    [daySummaries],
  );

  const mismatchBreakdown = useMemo(() => {
    const sessVsShift = daySummaries.filter(
      d => d.deltaSessionsVsShift != null && Math.abs(d.deltaSessionsVsShift) > MISMATCH_THRESHOLD_L,
    ).length;
    const sessVsLedger = daySummaries.filter(
      d => d.deltaSessionsVsLedger != null && Math.abs(d.deltaSessionsVsLedger) > MISMATCH_THRESHOLD_L,
    ).length;
    const shiftVsLedger = daySummaries.filter(
      d => d.deltaShiftVsLedger != null && Math.abs(d.deltaShiftVsLedger) > MISMATCH_THRESHOLD_L,
    ).length;
    const parts: string[] = [];
    if (sessVsShift > 0)
      parts.push(`${sessVsShift} day${sessVsShift !== 1 ? "s" : ""}: Sessions≠Shift`);
    if (sessVsLedger > 0)
      parts.push(`${sessVsLedger} day${sessVsLedger !== 1 ? "s" : ""}: Sessions≠Ledger`);
    if (shiftVsLedger > 0)
      parts.push(`${shiftVsLedger} day${shiftVsLedger !== 1 ? "s" : ""}: Shift≠Ledger`);
    return parts;
  }, [daySummaries]);

  const isLoading =
    sessionsQuery.isLoading || shiftLogsQuery.isLoading || ldoReadingsQuery.isLoading;
  const isError =
    sessionsQuery.isError || shiftLogsQuery.isError || ldoReadingsQuery.isError;

  const isMultiDay = dates.length > 1;

  const [cleanupPendingDate, setCleanupPendingDate] = useState<string | null>(null);

  const cleanupMutation = useMutation({
    mutationFn: ({ date }: { date: string }) => {
      const qs = new URLSearchParams({ dateFrom: date, dateTo: date, plant });
      return apiRequest("DELETE", `/api/plant-module/ldo-orphaned-rows?${qs.toString()}`);
    },
    onSuccess: (_data, variables) => {
      setCleanupPendingDate(null);
      toast({ title: "Orphaned entries removed", description: `LDO ledger cleaned up for ${variables.date}` });
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/ldo-flow-readings"] });
    },
    onError: () => {
      setCleanupPendingDate(null);
      toast({ title: "Cleanup failed", description: "Could not remove orphaned entries. Try again.", variant: "destructive" });
    },
  });

  function handleCleanupOrphaned(date: string) {
    setCleanupPendingDate(date);
    cleanupMutation.mutate({ date });
  }

  function handleExport() {
    const fmtVal = (n: number | null | undefined, digits = 1) =>
      n == null || isNaN(n as number) ? "" : Number(n).toFixed(digits);

    const summaryRows = daySummaries.map(day => ({
      Date: day.date,
      "Sessions (L)": day.sessions.length > 0 ? fmtVal(day.sessionsTotalL) : "",
      "Shift Meter (L)": day.anyShiftHasMeter ? fmtVal(day.shiftTotalL) : "",
      "LDO Ledger (L)": day.ledgerRows.length > 0 ? fmtVal(day.ledgerTotalL) : "",
      "Sessions vs Shift Meter (L)":
        day.deltaSessionsVsShift != null
          ? (day.deltaSessionsVsShift > 0 ? "+" : "") + fmtVal(day.deltaSessionsVsShift)
          : "",
      "Sessions vs LDO Ledger (L)":
        day.deltaSessionsVsLedger != null
          ? (day.deltaSessionsVsLedger > 0 ? "+" : "") + fmtVal(day.deltaSessionsVsLedger)
          : "",
      "Shift Meter vs LDO Ledger (L)":
        day.deltaShiftVsLedger != null
          ? (day.deltaShiftVsLedger > 0 ? "+" : "") + fmtVal(day.deltaShiftVsLedger)
          : "",
      Mismatch: day.hasMismatch ? "YES" : "—",
    }));

    if (isMultiDay) {
      summaryRows.push({
        Date: `Total (${dates.length} days)`,
        "Sessions (L)": fmtVal(rangeTotals.sessionsTotalL),
        "Shift Meter (L)": rangeTotals.anyShiftHasMeter ? fmtVal(rangeTotals.shiftTotalL) : "",
        "LDO Ledger (L)": daySummaries.some(d => d.ledgerRows.length > 0)
          ? fmtVal(rangeTotals.ledgerTotalL)
          : "",
        "Sessions vs Shift Meter (L)":
          rangeTotals.deltaSessionsVsShift != null
            ? (rangeTotals.deltaSessionsVsShift > 0 ? "+" : "") +
              fmtVal(rangeTotals.deltaSessionsVsShift)
            : "",
        "Sessions vs LDO Ledger (L)":
          rangeTotals.deltaSessionsVsLedger != null
            ? (rangeTotals.deltaSessionsVsLedger > 0 ? "+" : "") +
              fmtVal(rangeTotals.deltaSessionsVsLedger)
            : "",
        "Shift Meter vs LDO Ledger (L)":
          rangeTotals.deltaShiftVsLedger != null
            ? (rangeTotals.deltaShiftVsLedger > 0 ? "+" : "") +
              fmtVal(rangeTotals.deltaShiftVsLedger)
            : "",
        Mismatch: "",
      });
    }

    const detailRows: Record<string, string>[] = [];
    for (const day of daySummaries) {
      for (const s of day.sessions) {
        detailRows.push({
          Date: day.date,
          Section: "Heating Session",
          Source: `Session #${s.id}`,
          Type: heatingSessionTypeLabel(s.sessionType),
          "Opening Meter": fmtVal(s.ldoTank1OpeningMeter, 2),
          "Closing Meter": fmtVal(s.ldoTank1ClosingMeter, 2),
          "Consumed (L)": fmtVal(s.ldoTank1Consumed, 1),
          Notes: "",
        });
      }
      for (const sh of day.shiftLogs) {
        const consumed = shiftConsumed(sh);
        detailRows.push({
          Date: day.date,
          Section: "Shift Log",
          Source: `Shift ${sh.shiftCode}`,
          Type: "",
          "Opening Meter": fmtVal(sh.ldoTank1OpeningMeter, 2),
          "Closing Meter": fmtVal(sh.ldoTank1ClosingMeter, 2),
          "Consumed (L)": consumed != null ? fmtVal(consumed, 1) : "",
          Notes: "",
        });
      }
      for (const r of day.ledgerRows) {
        detailRows.push({
          Date: day.date,
          Section: "LDO Ledger",
          Source: sourceLabel(r),
          Type: r.readingType || "",
          "Opening Meter": "",
          "Closing Meter": fmtVal(r.meterReading, 2),
          "Consumed (L)": r.quantityLiters != null ? fmtVal(r.quantityLiters, 1) : "",
          Notes: r.notes || "",
        });
      }
    }

    const wb = XLSX.utils.book_new();
    const wsSummary = XLSX.utils.json_to_sheet(summaryRows);
    XLSX.utils.book_append_sheet(wb, wsSummary, "Summary");
    if (daySummaries.length > 0) {
      const wsDetail = XLSX.utils.json_to_sheet(detailRows.length > 0 ? detailRows : [{}]);
      XLSX.utils.book_append_sheet(wb, wsDetail, "Mismatch Detail");
    }

    const safePlant = plant.replace(/[^a-zA-Z0-9_-]/g, "_");
    const dateLabel =
      isMultiDay
        ? `${effectiveDateFrom}_to_${effectiveDateTo}`
        : effectiveDateFrom;
    const filename = `LDO_Reconciliation_${safePlant}_${dateLabel}.xlsx`;

    const arrBuf = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    const blob = new Blob([arrBuf], { type: "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function handleExportPdf() {
    const fmtVal = (n: number | null | undefined, digits = 1) =>
      n == null || isNaN(n as number) ? "—" : Number(n).toFixed(digits);
    const fmtDelta = (d: number | null) => {
      if (d == null) return "—";
      return (d > 0 ? "+" : "") + fmtVal(d);
    };

    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const dateLabel = isMultiDay
      ? `${effectiveDateFrom} → ${effectiveDateTo}`
      : effectiveDateFrom;

    doc.setFontSize(14);
    doc.text("LDO Flow Ledger Reconciliation", 14, 14);
    doc.setFontSize(9);
    doc.text(`${plant}  ·  Tank 1 (Boiler)  ·  ${dateLabel}`, 14, 21);
    doc.text(`Mismatch threshold: ±${MISMATCH_THRESHOLD_L} L`, 14, 27);

    const summaryHead = [
      ["Date", "Sessions (L)", "Shift Meter (L)", "LDO Ledger (L)", "Sess vs Shift", "Sess vs Ledger", "Shift vs Ledger", "Mismatch"],
    ];
    const summaryBody = daySummaries.map(day => [
      day.date,
      day.sessions.length > 0 ? fmtVal(day.sessionsTotalL) : "—",
      day.anyShiftHasMeter ? fmtVal(day.shiftTotalL) : "—",
      day.ledgerRows.length > 0 ? fmtVal(day.ledgerTotalL) : "—",
      fmtDelta(day.deltaSessionsVsShift),
      fmtDelta(day.deltaSessionsVsLedger),
      fmtDelta(day.deltaShiftVsLedger),
      day.hasMismatch ? "YES" : "—",
    ]);
    if (isMultiDay) {
      summaryBody.push([
        `Total (${dates.length} days)`,
        fmtVal(rangeTotals.sessionsTotalL),
        rangeTotals.anyShiftHasMeter ? fmtVal(rangeTotals.shiftTotalL) : "—",
        daySummaries.some(d => d.ledgerRows.length > 0)
          ? fmtVal(rangeTotals.ledgerTotalL)
          : "—",
        fmtDelta(rangeTotals.deltaSessionsVsShift),
        fmtDelta(rangeTotals.deltaSessionsVsLedger),
        fmtDelta(rangeTotals.deltaShiftVsLedger),
        "",
      ]);
    }

    autoTable(doc, {
      startY: 32,
      head: summaryHead,
      body: summaryBody,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [245, 158, 11] },
      didParseCell: (data) => {
        if (data.section === "body") {
          const val = String(data.cell.raw ?? "");
          if (val === "YES") {
            data.cell.styles.textColor = [220, 38, 38];
            data.cell.styles.fontStyle = "bold";
          }
        }
      },
      margin: { left: 14, right: 14 },
    });

    const mismatchDays = daySummaries.filter(d => d.hasMismatch);
    if (mismatchDays.length > 0) {
      const lastY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable?.finalY ?? 140;
      const needNewPage = lastY > 155;
      if (needNewPage) {
        doc.addPage();
      }
      const headingY = needNewPage ? 10 : lastY + 10;
      const detailStartY = needNewPage ? 16 : lastY + 16;

      doc.setFontSize(12);
      doc.text("Mismatch Detail", 14, headingY);

      const detailHead = [["Date", "Section", "Source", "Type", "Opening Meter", "Closing Meter", "Consumed (L)", "Notes"]];
      const detailBody: string[][] = [];
      for (const day of mismatchDays) {
        for (const s of day.sessions) {
          detailBody.push([day.date, "Heating Session", `Session #${s.id}`, heatingSessionTypeLabel(s.sessionType), fmtVal(s.ldoTank1OpeningMeter, 2), fmtVal(s.ldoTank1ClosingMeter, 2), fmtVal(s.ldoTank1Consumed, 1), ""]);
        }
        for (const sh of day.shiftLogs) {
          const consumed = shiftConsumed(sh);
          detailBody.push([day.date, "Shift Log", `Shift ${sh.shiftCode}`, "", fmtVal(sh.ldoTank1OpeningMeter, 2), fmtVal(sh.ldoTank1ClosingMeter, 2), consumed != null ? fmtVal(consumed, 1) : "—", ""]);
        }
        for (const r of day.ledgerRows) {
          detailBody.push([day.date, "LDO Ledger", sourceLabel(r), r.readingType || "", "", fmtVal(r.meterReading, 2), r.quantityLiters != null ? fmtVal(r.quantityLiters, 1) : "—", r.notes || ""]);
        }
      }

      autoTable(doc, {
        startY: detailStartY,
        head: detailHead,
        body: detailBody,
        styles: { fontSize: 7 },
        headStyles: { fillColor: [220, 38, 38] },
        margin: { left: 14, right: 14 },
      });
    }

    const safePlant = plant.replace(/[^a-zA-Z0-9_-]/g, "_");
    const fileDateLabel = isMultiDay
      ? `${effectiveDateFrom}_to_${effectiveDateTo}`
      : effectiveDateFrom;
    const filename = `LDO_Reconciliation_${safePlant}_${fileDateLabel}.pdf`;
    const blob = doc.output("blob");
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  const backLink = appendPlantContext(`/plant/heating-sessions/${routeDate}`, {
    defaultTab: "operations",
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 flex-wrap">
        <Link href={backLink}>
          <Button variant="ghost" size="icon" data-testid="button-back">
            <ChevronLeft className="w-5 h-5" />
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <GitCompare className="w-6 h-6 text-amber-600" />
            LDO Flow Ledger Reconciliation
          </h1>
          <p className="text-sm text-muted-foreground">
            {isMultiDay
              ? `${effectiveDateFrom} → ${effectiveDateTo}`
              : effectiveDateFrom || "—"}{" "}
            · {plant} · Tank 1 (Boiler)
          </p>
        </div>
        {!isLoading && !isError && daySummaries.length > 0 && (
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={handleExport}
              data-testid="button-export-excel"
            >
              <Download className="w-4 h-4 mr-1.5" />
              Export Excel
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportPdf}
              data-testid="button-export-pdf"
            >
              <Download className="w-4 h-4 mr-1.5" />
              Export PDF
            </Button>
          </>
        )}
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="flex items-end gap-4 flex-wrap">
            <Calendar className="w-5 h-5 text-muted-foreground mb-1 hidden sm:block" />
            <div className="flex flex-col gap-1">
              <Label htmlFor="input-date-from" className="text-xs">
                From
              </Label>
              <Input
                id="input-date-from"
                type="date"
                value={dateFrom}
                onChange={e => setDateFrom(e.target.value)}
                className="w-40"
                data-testid="input-date-from"
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="input-date-to" className="text-xs">
                To
              </Label>
              <Input
                id="input-date-to"
                type="date"
                value={dateTo}
                onChange={e => setDateTo(e.target.value)}
                className="w-40"
                data-testid="input-date-to"
              />
            </div>
            <Button
              onClick={applyRange}
              disabled={!dateFrom || !dateTo || dateFrom > dateTo}
              data-testid="button-apply-range"
            >
              Apply
            </Button>
            {!isLoading && !isError && daySummaries.length > 0 && (
              <TooltipProvider delayDuration={100}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span
                      tabIndex={0}
                      className="self-end mb-1 outline-none rounded-full focus-visible:ring-2 focus-visible:ring-ring"
                      data-testid="badge-mismatch-trigger"
                    >
                      <Badge
                        className={
                          mismatchCount > 0
                            ? "bg-destructive text-destructive-foreground cursor-default"
                            : "bg-green-600 text-white cursor-default"
                        }
                        data-testid="badge-mismatch-count"
                      >
                        {mismatchCount > 0
                          ? `${mismatchCount} of ${daySummaries.length} day${daySummaries.length !== 1 ? "s" : ""} exceed the ±${MISMATCH_THRESHOLD_L} L tolerance`
                          : `All ${daySummaries.length} day${daySummaries.length !== 1 ? "s" : ""} within ±${MISMATCH_THRESHOLD_L} L tolerance`}
                      </Badge>
                    </span>
                  </TooltipTrigger>
                  {mismatchCount > 0 && mismatchBreakdown.length > 0 && (
                    <TooltipContent
                      side="bottom"
                      className="text-xs max-w-xs"
                      data-testid="tooltip-mismatch-breakdown"
                    >
                      {mismatchBreakdown.join(" · ")}
                    </TooltipContent>
                  )}
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
        </CardContent>
      </Card>

      {!effectiveDateFrom ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            No date in the URL.{" "}
            <Link href={dashboardBackLink} className="underline">
              Go back to the plant dashboard
            </Link>
            .
          </CardContent>
        </Card>
      ) : isLoading ? (
        <div className="flex justify-center p-8">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      ) : isError ? (
        <Card className="border-destructive" data-testid="card-load-error">
          <CardContent className="p-6 text-sm text-destructive space-y-2">
            <div className="flex items-center gap-2 font-semibold">
              <AlertTriangle className="w-4 h-4" />
              Couldn't load reconciliation data for this date range.
            </div>
            {sessionsQuery.isError && (
              <div data-testid="text-error-sessions">
                Heating sessions:{" "}
                {(sessionsQuery.error as Error)?.message || "Unknown error"}
              </div>
            )}
            {shiftLogsQuery.isError && (
              <div data-testid="text-error-shift-logs">
                Shift logs: {(shiftLogsQuery.error as Error)?.message || "Unknown error"}
              </div>
            )}
            {ldoReadingsQuery.isError && (
              <div data-testid="text-error-ldo-readings">
                LDO flow readings:{" "}
                {(ldoReadingsQuery.error as Error)?.message || "Unknown error"}
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Card>
              <CardContent className="p-4">
                <div className="text-xs text-muted-foreground flex items-center gap-1">
                  <Flame className="w-3 h-3" /> Heating sessions total
                </div>
                <div className="text-2xl font-bold" data-testid="kpi-sessions-total">
                  {fmt(rangeTotals.sessionsTotalL)} L
                </div>
                <div className="text-xs text-muted-foreground">
                  {daySummaries.reduce((s, d) => s + d.sessions.length, 0)} session
                  {daySummaries.reduce((s, d) => s + d.sessions.length, 0) === 1 ? "" : "s"}
                  {isMultiDay && ` across ${dates.length} days`}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="text-xs text-muted-foreground flex items-center gap-1">
                  <GaugeCircle className="w-3 h-3" /> Shift-meter total
                </div>
                <div className="text-2xl font-bold" data-testid="kpi-shift-total">
                  {rangeTotals.anyShiftHasMeter ? `${fmt(rangeTotals.shiftTotalL)} L` : "—"}
                </div>
                <div className="text-xs text-muted-foreground">
                  {daySummaries.reduce((s, d) => s + d.shiftLogs.length, 0)} shift log
                  {daySummaries.reduce((s, d) => s + d.shiftLogs.length, 0) === 1 ? "" : "s"}
                  {!rangeTotals.anyShiftHasMeter &&
                    daySummaries.some(d => d.shiftLogs.length > 0) &&
                    " · no meter readings"}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="text-xs text-muted-foreground flex items-center gap-1">
                  <BookOpen className="w-3 h-3" /> LDO Flow ledger total
                </div>
                <div className="text-2xl font-bold" data-testid="kpi-ledger-total">
                  {daySummaries.some(d => d.ledgerRows.length > 0)
                    ? `${fmt(rangeTotals.ledgerTotalL)} L`
                    : "—"}
                </div>
                <div className="text-xs text-muted-foreground">
                  {daySummaries.reduce((s, d) => s + d.ledgerRows.length, 0)} ledger row
                  {daySummaries.reduce((s, d) => s + d.ledgerRows.length, 0) === 1 ? "" : "s"}
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[
              {
                label: "Sessions vs Shift Meter",
                delta: rangeTotals.deltaSessionsVsShift,
                description: "Heating session meters vs shift log meter",
                hint: "Gap between what the session meters recorded and what the shift log recorded",
                testId: "kpi-delta-sessions-shift",
              },
              {
                label: "Sessions vs LDO Ledger",
                delta: rangeTotals.deltaSessionsVsLedger,
                description: "Heating session meters vs LDO flow ledger",
                hint: "Gap between session meter totals and what was logged in the LDO ledger",
                testId: "kpi-delta-sessions-ledger",
              },
              {
                label: "Shift Meter vs LDO Ledger",
                delta: rangeTotals.deltaShiftVsLedger,
                description: "Shift log meter vs LDO flow ledger",
                hint: "Gap between the shift log meter reading and the LDO ledger entries",
                testId: "kpi-delta-shift-ledger",
              },
            ].map(({ label, delta, description, hint, testId }) => (
              <Card
                key={label}
                className={
                  delta != null && Math.abs(delta) > MISMATCH_THRESHOLD_L
                    ? "border-destructive"
                    : ""
                }
              >
                <CardContent className="p-4">
                  <div className="text-xs text-muted-foreground flex items-center gap-1">
                    <GitCompare className="w-3 h-3" /> {description}
                  </div>
                  <div
                    className={`text-2xl font-bold ${deltaClass(delta)}`}
                    data-testid={testId}
                  >
                    {delta == null ? "—" : `${delta > 0 ? "+" : ""}${fmt(delta)} L`}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {label}
                  </div>
                  <div className="text-xs text-muted-foreground italic mt-0.5">
                    {hint} · Tolerance: ±{MISMATCH_THRESHOLD_L} L
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <GitCompare className="w-5 h-5 text-amber-600" />
                {isMultiDay
                  ? `Day-by-day summary (${effectiveDateFrom} → ${effectiveDateTo})`
                  : `Reconciliation detail for ${effectiveDateFrom}`}
              </CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto p-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left border-b bg-muted/40">
                    <th className="py-2 px-4">Date</th>
                    <th className="py-2 px-3 text-right">Sessions (L)</th>
                    <th className="py-2 px-3 text-right">Shift (L)</th>
                    <th className="py-2 px-3 text-right">Ledger (L)</th>
                    <th className="py-2 px-3 text-right">Session total vs shift meter</th>
                    <th className="py-2 px-3 text-right">Session total vs LDO ledger</th>
                    <th className="py-2 px-3 text-right">Shift meter vs LDO ledger</th>
                    <th className="py-2 px-3 text-right" />
                  </tr>
                </thead>
                <tbody>
                  {daySummaries.map(day => {
                    const isExpanded = expandedDates.has(day.date);
                    return (
                      <Fragment key={day.date}>
                        <tr
                          className={`border-b cursor-pointer hover:bg-muted/30 transition-colors ${
                            day.hasMismatch ? "bg-destructive/5" : ""
                          }`}
                          onClick={() => toggleDate(day.date)}
                          data-testid={`row-day-summary-${day.date}`}
                        >
                          <td className="py-2 px-4 font-medium flex items-center gap-1">
                            {isExpanded ? (
                              <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                            ) : (
                              <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                            )}
                            {day.date}
                            {day.hasMismatch && (
                              <AlertTriangle className="w-3.5 h-3.5 text-destructive ml-1" />
                            )}
                          </td>
                          <td className="py-2 px-3 text-right">
                            {day.sessions.length > 0 ? fmt(day.sessionsTotalL) : "—"}
                          </td>
                          <td className="py-2 px-3 text-right">
                            {day.anyShiftHasMeter ? fmt(day.shiftTotalL) : "—"}
                          </td>
                          <td className="py-2 px-3 text-right">
                            {day.ledgerRows.length > 0 ? fmt(day.ledgerTotalL) : "—"}
                          </td>
                          <td className="py-2 px-3 text-right">
                            <DeltaCell d={day.deltaSessionsVsShift} />
                          </td>
                          <td className="py-2 px-3 text-right">
                            <DeltaCell d={day.deltaSessionsVsLedger} />
                          </td>
                          <td className="py-2 px-3 text-right">
                            <DeltaCell d={day.deltaShiftVsLedger} />
                          </td>
                          <td className="py-2 px-3 text-right text-xs text-muted-foreground whitespace-nowrap">
                            {isExpanded ? "Collapse" : "Expand"}
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr
                            key={`${day.date}-detail`}
                            data-testid={`row-day-detail-${day.date}`}
                          >
                            <td colSpan={8} className="px-4 pb-4 bg-muted/20">
                              <DayDetail
                                day={day}
                                plant={plant}
                                appendPlantContext={appendPlantContext}
                                ldoFlowMeterLink={ldoFlowMeterLink}
                                isAdmin={isAdmin}
                                onCleanupOrphaned={handleCleanupOrphaned}
                                cleanupPending={cleanupPendingDate === day.date && cleanupMutation.isPending}
                              />
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
                {isMultiDay && (
                  <tfoot>
                    <tr className="border-t bg-muted/40 font-semibold">
                      <td className="py-2 px-4">Total ({dates.length} days)</td>
                      <td className="py-2 px-3 text-right" data-testid="text-range-sessions-total">
                        {fmt(rangeTotals.sessionsTotalL)}
                      </td>
                      <td className="py-2 px-3 text-right" data-testid="text-range-shift-total">
                        {rangeTotals.anyShiftHasMeter ? fmt(rangeTotals.shiftTotalL) : "—"}
                      </td>
                      <td className="py-2 px-3 text-right" data-testid="text-range-ledger-total">
                        {daySummaries.some(d => d.ledgerRows.length > 0)
                          ? fmt(rangeTotals.ledgerTotalL)
                          : "—"}
                      </td>
                      <td className="py-2 px-3 text-right">
                        <DeltaCell d={rangeTotals.deltaSessionsVsShift} />
                      </td>
                      <td className="py-2 px-3 text-right">
                        <DeltaCell d={rangeTotals.deltaSessionsVsLedger} />
                      </td>
                      <td className="py-2 px-3 text-right">
                        <DeltaCell d={rangeTotals.deltaShiftVsLedger} />
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                )}
              </table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
