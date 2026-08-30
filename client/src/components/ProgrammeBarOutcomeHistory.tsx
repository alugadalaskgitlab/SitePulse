import { useQuery } from "@tanstack/react-query";

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
};

const label = (value: string) => value.replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());

/** Read-only programme context for submitted DPR reports. Never exposes recording controls. */
export function ProgrammeBarOutcomeHistory({
  projectId, boqItemId, programmeBarId, testidPrefix,
}: {
  projectId: number | null | undefined;
  boqItemId: number | null | undefined;
  programmeBarId: number;
  testidPrefix: string;
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