import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useRoute } from "wouter";
import { useOrigin } from "@/hooks/use-origin";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  AlertTriangle,
  ChevronLeft,
  Flame,
  GitCompare,
  Loader2,
  Pencil,
  ArrowRight,
  GaugeCircle,
  BookOpen,
} from "lucide-react";
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

export default function PlantLdoMismatch() {
  const { appendPlantContext, getPlantBackLink } = useOrigin();
  const [, params] = useRoute("/plant/ldo-mismatch/:date");
  const date = params?.date || "";

  const search = typeof window !== "undefined" ? window.location.search : "";
  const sp = new URLSearchParams(search);
  const plant = sp.get("plant") || "Main Plant";

  const heatSessionsBackLink = appendPlantContext(`/plant/heating-sessions/${date}`, {
    defaultTab: "operations",
  });
  const dashboardBackLink = getPlantBackLink({ defaultTab: "operations" });
  const shiftLogLink = appendPlantContext(`/plant/shift-log/${date}`, {
    defaultTab: "operations",
  });
  const ldoFlowMeterLink = appendPlantContext(
    `/plant/ldo-flow-meter?plant=${encodeURIComponent(plant)}`,
    { defaultTab: "stock" },
  );

  const sessionsQuery = useQuery<BitumenHeatingSession[]>({
    queryKey: ["/api/plant-module/heating-sessions", date, plant],
    enabled: !!date,
    queryFn: async () => {
      const qs = new URLSearchParams();
      qs.set("date", date);
      qs.set("plant", plant);
      const res = await fetch(
        `/api/plant-module/heating-sessions?${qs.toString()}`,
        { credentials: "include" },
      );
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  });

  const shiftLogsQuery = useQuery<PlantShiftLog[]>({
    queryKey: ["/api/plant-module/shift-logs", date],
    enabled: !!date,
    queryFn: async () => {
      const qs = new URLSearchParams();
      qs.set("dateFrom", date);
      qs.set("dateTo", date);
      const res = await fetch(
        `/api/plant-module/shift-logs?${qs.toString()}`,
        { credentials: "include" },
      );
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  });

  const ldoReadingsQuery = useQuery<LdoFlowReading[]>({
    queryKey: ["/api/plant-module/ldo-flow-readings", { dateFrom: date, dateTo: date, plantName: plant, tankNumber: 1 }],
    enabled: !!date,
    queryFn: async () => {
      const qs = new URLSearchParams();
      qs.set("dateFrom", date);
      qs.set("dateTo", date);
      qs.set("plantName", plant);
      qs.set("tankNumber", "1");
      const res = await fetch(
        `/api/plant-module/ldo-flow-readings?${qs.toString()}`,
        { credentials: "include" },
      );
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  });

  const sessions = useMemo(
    () => (sessionsQuery.data || []).filter(s => s.plantName === plant),
    [sessionsQuery.data, plant],
  );
  const shiftLogs = useMemo(
    () => (shiftLogsQuery.data || []).filter(sh => sh.plantName === plant),
    [shiftLogsQuery.data, plant],
  );
  const ldoLedgerRows = useMemo(() => {
    const all = ldoReadingsQuery.data || [];
    return all.filter(r => r.sourceHeatingSessionId != null || r.sourceShiftLogId != null);
  }, [ldoReadingsQuery.data]);

  const sessionsTotalL = sessions.reduce((s, x) => s + (x.ldoTank1Consumed || 0), 0);
  const shiftTotalL = shiftLogs.reduce((s, sh) => {
    const c = shiftConsumed(sh);
    return s + (c == null ? 0 : c);
  }, 0);
  const anyShiftHasMeter = shiftLogs.some(sh => shiftConsumed(sh) != null);
  const ledgerTotalL = ldoLedgerRows.reduce((s, r) => {
    const c = ldoLedgerConsumed(r);
    return s + (c == null ? 0 : c);
  }, 0);

  const deltaSessionsVsShift =
    sessions.length > 0 || anyShiftHasMeter
      ? Math.round((sessionsTotalL - shiftTotalL) * 10) / 10
      : null;
  const deltaSessionsVsLedger =
    sessions.length > 0 || ldoLedgerRows.length > 0
      ? Math.round((sessionsTotalL - ledgerTotalL) * 10) / 10
      : null;
  const deltaShiftVsLedger =
    anyShiftHasMeter || ldoLedgerRows.length > 0
      ? Math.round((shiftTotalL - ledgerTotalL) * 10) / 10
      : null;

  const isLoading =
    sessionsQuery.isLoading || shiftLogsQuery.isLoading || ldoReadingsQuery.isLoading;
  const isError =
    sessionsQuery.isError || shiftLogsQuery.isError || ldoReadingsQuery.isError;

  const editSessionLink = (sessionId: number) =>
    appendPlantContext(
      `/plant/heating-sessions/${date}?openSession=${sessionId}`,
      { defaultTab: "operations" },
    );

  const deltaClass = (d: number | null) =>
    d == null ? "" : Math.abs(d) > MISMATCH_THRESHOLD_L ? "text-destructive" : "text-green-600";

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 flex-wrap">
        <Link href={heatSessionsBackLink}>
          <Button variant="ghost" size="icon" data-testid="button-back">
            <ChevronLeft className="w-5 h-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <GitCompare className="w-6 h-6 text-amber-600" />
            LDO Flow Ledger Reconciliation
          </h1>
          <p className="text-sm text-muted-foreground">
            {date || "—"} · {plant} · Tank 1 (Boiler)
          </p>
        </div>
      </div>

      {!date ? (
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
              Couldn't load reconciliation data for this date.
            </div>
            {sessionsQuery.isError && (
              <div data-testid="text-error-sessions">
                Heating sessions:{" "}
                {(sessionsQuery.error as Error)?.message || "Unknown error"}
              </div>
            )}
            {shiftLogsQuery.isError && (
              <div data-testid="text-error-shift-logs">
                Shift logs:{" "}
                {(shiftLogsQuery.error as Error)?.message || "Unknown error"}
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
                  {fmt(sessionsTotalL)} L
                </div>
                <div className="text-xs text-muted-foreground">
                  {sessions.length} session{sessions.length === 1 ? "" : "s"}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="text-xs text-muted-foreground flex items-center gap-1">
                  <GaugeCircle className="w-3 h-3" /> Shift-meter total
                </div>
                <div className="text-2xl font-bold" data-testid="kpi-shift-total">
                  {anyShiftHasMeter ? `${fmt(shiftTotalL)} L` : "—"}
                </div>
                <div className="text-xs text-muted-foreground">
                  {shiftLogs.length} shift log{shiftLogs.length === 1 ? "" : "s"}
                  {shiftLogs.length > 0 && !anyShiftHasMeter && " · no meter readings"}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="text-xs text-muted-foreground flex items-center gap-1">
                  <BookOpen className="w-3 h-3" /> LDO Flow ledger total
                </div>
                <div className="text-2xl font-bold" data-testid="kpi-ledger-total">
                  {ldoLedgerRows.length > 0 ? `${fmt(ledgerTotalL)} L` : "—"}
                </div>
                <div className="text-xs text-muted-foreground">
                  {ldoLedgerRows.length} ledger row{ldoLedgerRows.length === 1 ? "" : "s"}
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[
              {
                label: "Sessions vs Shift",
                delta: deltaSessionsVsShift,
                description: "Δ (sessions − shift meter)",
                testId: "kpi-delta-sessions-shift",
              },
              {
                label: "Sessions vs Ledger",
                delta: deltaSessionsVsLedger,
                description: "Δ (sessions − LDO ledger rows)",
                testId: "kpi-delta-sessions-ledger",
              },
              {
                label: "Shift vs Ledger",
                delta: deltaShiftVsLedger,
                description: "Δ (shift meter − LDO ledger rows)",
                testId: "kpi-delta-shift-ledger",
              },
            ].map(({ label, delta, description, testId }) => (
              <Card
                key={label}
                className={
                  delta != null && Math.abs(delta) > MISMATCH_THRESHOLD_L ? "border-destructive" : ""
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
                    {delta == null
                      ? "—"
                      : `${delta > 0 ? "+" : ""}${fmt(delta)} L`}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {label} · Tolerance: ±{MISMATCH_THRESHOLD_L} L
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between flex-wrap gap-2">
                <CardTitle className="flex items-center gap-2">
                  <Flame className="w-5 h-5 text-orange-600" />
                  Heating sessions on {date}
                </CardTitle>
                <Link href={heatSessionsBackLink}>
                  <Button
                    variant="outline"
                    size="sm"
                    data-testid="button-open-sessions-list"
                  >
                    Open sessions list
                    <ArrowRight className="w-4 h-4 ml-1" />
                  </Button>
                </Link>
              </div>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              {sessions.length === 0 ? (
                <p className="text-sm text-muted-foreground" data-testid="text-no-sessions">
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
                          <Badge
                            variant={
                              s.sessionType === "NIGHT_PREHEAT" ? "secondary" : "outline"
                            }
                          >
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
                      <td className="py-2 pr-3 text-right" data-testid="text-sessions-total-row">
                        {fmt(sessionsTotalL, 1)}
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
                <CardTitle className="flex items-center gap-2">
                  <GaugeCircle className="w-5 h-5 text-sky-600" />
                  Shift log meter on {date}
                </CardTitle>
                <Link href={shiftLogLink}>
                  <Button
                    variant="outline"
                    size="sm"
                    data-testid="button-open-shift-log"
                  >
                    Open shift log
                    <ArrowRight className="w-4 h-4 ml-1" />
                  </Button>
                </Link>
              </div>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              {shiftLogs.length === 0 ? (
                <p className="text-sm text-muted-foreground" data-testid="text-no-shift-logs">
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
                        data-testid="text-shift-total-row"
                      >
                        {anyShiftHasMeter ? fmt(shiftTotalL, 1) : "—"}
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
                <CardTitle className="flex items-center gap-2">
                  <BookOpen className="w-5 h-5 text-violet-600" />
                  LDO Flow Ledger rows on {date} (Tank 1 · auto-tagged)
                </CardTitle>
                <Link href={ldoFlowMeterLink}>
                  <Button
                    variant="outline"
                    size="sm"
                    data-testid="button-open-ldo-flow-meter"
                  >
                    Open LDO Flow Meter
                    <ArrowRight className="w-4 h-4 ml-1" />
                  </Button>
                </Link>
              </div>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              {ldoLedgerRows.length === 0 ? (
                <p className="text-sm text-muted-foreground" data-testid="text-no-ledger-rows">
                  No auto-tagged ledger rows for this date. If heating sessions or shift logs
                  exist, they may not have generated flow-meter entries yet — check the LDO
                  Flow Meter page.
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
                    {ldoLedgerRows.map(r => (
                      <tr
                        key={r.id}
                        className="border-b hover:bg-muted/30"
                        data-testid={`row-ledger-${r.id}`}
                      >
                        <td className="py-2 pr-3">
                          <Badge
                            variant={
                              r.sourceHeatingSessionId != null ? "secondary" : "outline"
                            }
                          >
                            {sourceLabel(r)}
                          </Badge>
                        </td>
                        <td className="py-2 pr-3 text-xs text-muted-foreground">
                          {r.readingType}
                        </td>
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
                        data-testid="text-ledger-total-row"
                      >
                        {fmt(ledgerTotalL, 1)}
                      </td>
                      <td colSpan={2} />
                    </tr>
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
