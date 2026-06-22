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
} from "lucide-react";
import type { BitumenHeatingSession, PlantShiftLog } from "@shared/schema";
import { heatingSessionTypeLabel } from "@shared/schema";
import { HEATING_TRENDS_MISMATCH_THRESHOLD_L } from "@shared/heating-trends-constants";

// Mismatch tolerance is sourced from the same shared constant used by
// `getHeatingTrends` on the server, so the verdict on this page lines up
// with the badge the user clicked from the trends report.
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

export default function PlantHeatingMismatch() {
  const { appendPlantContext, getPlantBackLink } = useOrigin();
  const [, params] = useRoute("/plant/heating-mismatch/:date");
  const date = params?.date || "";

  // Plant override via ?plant=, defaults to Main Plant (the trends page is
  // currently locked to Main Plant too).
  const search = typeof window !== "undefined" ? window.location.search : "";
  const sp = new URLSearchParams(search);
  const plant = sp.get("plant") || "Main Plant";

  // Trends → mismatch is a "reports" tab navigation; preserve that on the
  // back-link so closing the page returns to the same tab.
  const trendsBackLink = appendPlantContext("/plant/heating-trends", {
    defaultTab: "reports",
  });
  const dashboardBackLink = getPlantBackLink({ defaultTab: "reports" });

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

  const shiftLogs = useMemo(
    () => (shiftLogsQuery.data || []).filter(sh => sh.plantName === plant),
    [shiftLogsQuery.data, plant],
  );
  const sessions = sessionsQuery.data || [];

  const sessionsTotalL = sessions.reduce(
    (s, x) => s + (x.ldoTank1Consumed || 0),
    0,
  );
  const shiftTotalL = shiftLogs.reduce((s, sh) => {
    const c = shiftConsumed(sh);
    return s + (c == null ? 0 : c);
  }, 0);
  const anyShiftHasMeter = shiftLogs.some(sh => shiftConsumed(sh) != null);
  const deltaL = anyShiftHasMeter || sessions.length > 0
    ? Math.round((sessionsTotalL - shiftTotalL) * 10) / 10
    : null;
  const isFlagged = deltaL != null && Math.abs(deltaL) > MISMATCH_THRESHOLD_L;

  const verdict = (() => {
    if (deltaL == null) {
      return "No heating sessions and no shift-meter readings logged for this date.";
    }
    if (!isFlagged) {
      return `Sessions and shift-meter agree within ±${MISMATCH_THRESHOLD_L} L tolerance.`;
    }
    if (sessions.length === 0) {
      return `No heating sessions are logged but the shift meter shows ${fmt(shiftTotalL)} L was consumed — operators likely forgot to capture the heating sessions.`;
    }
    if (!anyShiftHasMeter) {
      return `Sessions total ${fmt(sessionsTotalL)} L but no shift-log opening/closing meter readings were entered for this date — the shift log likely needs the LDO Tank-1 meter filled in.`;
    }
    if (deltaL > 0) {
      return `Sessions claim ${fmt(deltaL)} L more LDO than the shift meter recorded. Either a session's closing meter is too high, or the shift log opening/closing was under-recorded.`;
    }
    return `Sessions claim ${fmt(Math.abs(deltaL))} L less LDO than the shift meter recorded. Either a heating session was missed, or the shift log opening/closing meters need correcting.`;
  })();

  const editSessionLink = (sessionId: number) =>
    appendPlantContext(
      `/plant/heating-sessions/${date}?openSession=${sessionId}`,
      { defaultTab: "reports" },
    );
  const editShiftLogLink = appendPlantContext(`/plant/shift-log/${date}`, {
    defaultTab: "reports",
  });
  const heatingSessionsListLink = appendPlantContext(
    `/plant/heating-sessions/${date}`,
    { defaultTab: "reports" },
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 flex-wrap">
        <Link href={trendsBackLink}>
          <Button variant="ghost" size="icon" data-testid="button-back">
            <ChevronLeft className="w-5 h-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <GitCompare className="w-6 h-6 text-amber-600" />
            Boiler vs Shift-meter Reconciliation
          </h1>
          <p className="text-sm text-muted-foreground">
            {date || "—"} · {plant}
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
      ) : sessionsQuery.isLoading || shiftLogsQuery.isLoading ? (
        <div className="flex justify-center p-8">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      ) : sessionsQuery.isError || shiftLogsQuery.isError ? (
        <Card className="border-destructive" data-testid="card-load-error">
          <CardContent className="p-6 text-sm text-destructive space-y-2">
            <div className="flex items-center gap-2 font-semibold">
              <AlertTriangle className="w-4 h-4" />
              Couldn't load reconciliation data for this date.
            </div>
            {sessionsQuery.isError && (
              <div data-testid="text-error-sessions">
                Heating sessions: {(sessionsQuery.error as Error)?.message || "Unknown error"}
              </div>
            )}
            {shiftLogsQuery.isError && (
              <div data-testid="text-error-shift-logs">
                Shift logs: {(shiftLogsQuery.error as Error)?.message || "Unknown error"}
              </div>
            )}
            <div className="text-muted-foreground">
              Try again, or open the underlying lists directly:
              <Link href={heatingSessionsListLink} className="underline ml-1">
                Heating sessions for {date}
              </Link>{" "}·{" "}
              <Link href={editShiftLogLink} className="underline">
                Shift log for {date}
              </Link>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Card>
              <CardContent className="p-4">
                <div className="text-sm text-muted-foreground flex items-center gap-1">
                  <Flame className="w-3 h-3" /> Heating sessions total
                </div>
                <div
                  className="text-2xl font-bold"
                  data-testid="kpi-sessions-total"
                >
                  {fmt(sessionsTotalL)} L
                </div>
                <div className="text-sm text-muted-foreground">
                  {sessions.length} session{sessions.length === 1 ? "" : "s"}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="text-sm text-muted-foreground flex items-center gap-1">
                  <GaugeCircle className="w-3 h-3" /> Shift-meter total
                </div>
                <div
                  className="text-2xl font-bold"
                  data-testid="kpi-shift-total"
                >
                  {anyShiftHasMeter ? `${fmt(shiftTotalL)} L` : "—"}
                </div>
                <div className="text-sm text-muted-foreground">
                  {shiftLogs.length} shift log{shiftLogs.length === 1 ? "" : "s"}
                  {shiftLogs.length > 0 && !anyShiftHasMeter && " · no meter readings"}
                </div>
              </CardContent>
            </Card>
            <Card
              className={isFlagged ? "border-destructive" : ""}
              data-testid="card-delta"
            >
              <CardContent className="p-4">
                <div className="text-sm text-muted-foreground flex items-center gap-1">
                  <GitCompare className="w-3 h-3" /> Δ (sessions − shift)
                </div>
                <div
                  className={`text-2xl font-bold ${isFlagged ? "text-destructive" : ""}`}
                  data-testid="text-delta-l"
                >
                  {deltaL == null
                    ? "—"
                    : `${deltaL > 0 ? "+" : ""}${fmt(deltaL)} L`}
                </div>
                <div className="text-sm text-muted-foreground">
                  Tolerance: ±{MISMATCH_THRESHOLD_L} L
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardContent className="p-4 text-sm" data-testid="text-verdict">
              {isFlagged && (
                <AlertTriangle className="w-4 h-4 text-destructive inline-block mr-2 -mt-0.5" />
              )}
              {verdict}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between flex-wrap gap-2">
                <CardTitle className="flex items-center gap-2">
                  <Flame className="w-5 h-5 text-orange-600" />
                  Heating sessions on {date}
                </CardTitle>
                <Link href={heatingSessionsListLink}>
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
                      <th className="py-2 pr-3 text-right">Duration (h)</th>
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
                              s.sessionType === "NIGHT_PREHEAT"
                                ? "secondary"
                                : "outline"
                            }
                          >
                            {heatingSessionTypeLabel(s.sessionType)}
                          </Badge>
                        </td>
                        <td className="py-2 pr-3">{s.startTime || "—"}</td>
                        <td className="py-2 pr-3">{s.endTime || "—"}</td>
                        <td className="py-2 pr-3 text-right">
                          {fmt(s.durationHours, 2)}
                        </td>
                        <td
                          className="py-2 pr-3 text-right"
                          data-testid={`cell-session-open-${s.id}`}
                        >
                          {fmt(s.ldoTank1OpeningMeter, 2)}
                        </td>
                        <td
                          className="py-2 pr-3 text-right"
                          data-testid={`cell-session-close-${s.id}`}
                        >
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
                      <td className="py-2 pr-3" colSpan={6}>
                        Sessions total
                      </td>
                      <td
                        className="py-2 pr-3 text-right"
                        data-testid="text-sessions-total-row"
                      >
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
                <Link href={editShiftLogLink}>
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
                      <th className="py-2 pr-3">Notes</th>
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
                          <td className="py-2 pr-3 text-sm text-muted-foreground">
                            {sh.boilerRunsDuringProduction
                              ? "Boiler ran during production"
                              : ""}
                          </td>
                          <td className="py-2 pr-3 text-right">
                            <Link href={editShiftLogLink}>
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
