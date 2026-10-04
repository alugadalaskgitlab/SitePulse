import { useQuery } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { managementNumber } from "@/lib/dprManagementPresentation";

type Outcome = {
  id: number;
  eventDate: string;
  outcome: string;
  reason: string;
  reasonOther?: string | null;
  rescheduledDate?: string | null;
  actualQuantity?: number | null;
  actualUom?: string | null;
  remarks?: string | null;
};

type Bar = {
  id: number;
  reachLabel: string | null;
  startDate: string | null;
  endDate: string | null;
  plannedQty: number;
  unit: string | null;
  latestOutcome: Outcome | null;
  outcomeHistory: Outcome[];
  reportedQty?: number | null;
  reportedQtyUnresolved?: boolean;
  chainageFrom?: number | null;
  chainageTo?: number | null;
};

const label = (value: string) => value.replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());

/** Read-only programme context for submitted DPR reports. Never exposes recording controls. */
export function ProgrammeBarOutcomeHistory({
  projectId, boqItemId, programmeBarId, testidPrefix, management = false,
}: {
  projectId: number | null | undefined;
  boqItemId: number | null | undefined;
  programmeBarId: number;
  testidPrefix: string;
  management?: boolean;
}) {
  const { data: bars = [] } = useQuery<Bar[]>({
    queryKey: ["/api/dpr/programme-bars", projectId, boqItemId],
    queryFn: async () => {
      const response = await fetch(`/api/dpr/programme-bars?projectId=${projectId}&boqItemId=${boqItemId}`, { credentials: "include" });
      return response.ok ? response.json() : [];
    },
    enabled: !!projectId && !!boqItemId && !!programmeBarId,
  });
  const bar = bars.find((candidate) => candidate.id === programmeBarId);
  if (!bar) return null;
  if (management) {
    const done = bar.reportedQtyUnresolved || bar.reportedQty == null ? null : Number(bar.reportedQty);
    const planned = Number(bar.plannedQty);
    const percent = done != null && Number.isFinite(done) && planned > 0 ? done / planned * 100 : null;
    const chainage = (value: number) => {
      const metres = Math.round(value * 1000);
      return `${Math.floor(metres / 1000)}+${String(metres % 1000).padStart(3, "0")}`;
    };
    const date = (value: string | null) => value ? format(parseISO(value.slice(0, 10)), "dd MMM") : "";
    const overdue = !!bar.endDate && bar.endDate.slice(0, 10) < format(new Date(), "yyyy-MM-dd") && done != null && done < planned;
    return <div className="dpr-management-subtle" data-testid={`${testidPrefix}-programme-outcome`}>
      <div>{[bar.reachLabel || "Programme reach", bar.chainageFrom != null && bar.chainageTo != null ? `Ch ${chainage(bar.chainageFrom)} – ${chainage(bar.chainageTo)}` : null,
        [date(bar.startDate), date(bar.endDate)].filter(Boolean).join(" – ")].filter(Boolean).join(" · ")}</div>
      <div>{done == null ? "Progress unavailable" : `Done ${managementNumber(done)} / ${managementNumber(planned)} ${bar.unit ?? ""}${percent != null ? ` (${Math.round(percent)}%)` : ""}`}
        {overdue && <span className="text-red-700 font-medium"> past planned end</span>}
      </div>
      {percent != null && <div className="dpr-programme-track" role="progressbar" aria-label="Programme progress" aria-valuenow={Math.round(percent)} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${Math.min(100, Math.max(0, percent))}%` }} /></div>}
    </div>;
  }
  return (
    <div className="mt-1 text-xs text-muted-foreground" data-testid={`${testidPrefix}-programme-outcome`}>
      <span className="font-medium text-foreground">Planned:</span>{" "}
      {bar.reachLabel || "Programme reach"} · {bar.plannedQty}{bar.unit ? ` ${bar.unit}` : ""} · {bar.startDate || "unscheduled"}{bar.endDate ? ` → ${bar.endDate}` : ""}
      <br />
      <span className="font-medium text-foreground">Actual outcome:</span>{" "}
      {bar.latestOutcome ? `${label(bar.latestOutcome.outcome)} (${bar.latestOutcome.eventDate})` : "Not recorded"}
      {bar.outcomeHistory.length > 0 && (
        <details className="mt-0.5" data-testid={`${testidPrefix}-programme-outcome-history`}>
          <summary className="cursor-pointer">Outcome history ({bar.outcomeHistory.length})</summary>
          {bar.outcomeHistory.map((event) => (
            <div key={event.id}>
              {event.eventDate}: {label(event.outcome)} — {label(event.reason)}
              {event.reasonOther ? ` (${event.reasonOther})` : ""}
              {event.actualQuantity != null ? ` · actual ${event.actualQuantity} ${event.actualUom ?? ""}` : ""}
              {event.rescheduledDate ? ` · rescheduled ${event.rescheduledDate}` : ""}
            </div>
          ))}
        </details>
      )}
    </div>
  );
}