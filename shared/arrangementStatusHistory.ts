export interface ArrangementStatusChangeEvent {
  eventType: "status_change";
  previousStatus: string;
  status: string;
  effectiveFrom: string;
  recordedAt: string;
  changedBy: number | null;
  reason: string | null;
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidArrangementEffectiveDate(value: unknown): value is string {
  if (typeof value !== "string" || !ISO_DATE_RE.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year
    && parsed.getUTCMonth() === month - 1
    && parsed.getUTCDate() === day;
}

export function hasRecordedArrangementStatusChange(
  history: unknown,
  status: string,
): boolean {
  return Array.isArray(history) && history.some((event: any) =>
    event?.eventType === "status_change"
    && event?.status === status
    && isValidArrangementEffectiveDate(event?.effectiveFrom),
  );
}

export function appendArrangementStatusChange(
  history: unknown,
  event: Omit<ArrangementStatusChangeEvent, "eventType">,
): unknown[] {
  if (!isValidArrangementEffectiveDate(event.effectiveFrom)) {
    throw new Error("INVALID_ARRANGEMENT_STATUS_EFFECTIVE_DATE");
  }
  const prior = Array.isArray(history) ? [...history] : [];
  prior.push({
    eventType: "status_change",
    previousStatus: event.previousStatus,
    status: event.status,
    effectiveFrom: event.effectiveFrom,
    recordedAt: event.recordedAt,
    changedBy: event.changedBy,
    reason: event.reason?.trim() || null,
  } satisfies ArrangementStatusChangeEvent);
  return prior;
}
