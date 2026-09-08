export interface ArrangementStatusChangeEvent {
  eventType: "status_change";
  previousStatus: string;
  status: string;
  effectiveFrom: string;
  recordedAt: string;
  changedBy: number | null;
  reason: string | null;
}

export interface ArrangementStatusAsOfInput {
  status: string;
  revisionHistory?: unknown;
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
  return latestRecordedArrangementStatusChange(history, status) != null;
}

export function latestRecordedArrangementStatusChange(
  history: unknown,
  status: string,
): ArrangementStatusChangeEvent | null {
  if (!Array.isArray(history)) return null;
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const event = history[index] as any;
    if (
      event?.eventType === "status_change"
      && event?.status === status
      && isValidArrangementEffectiveDate(event?.effectiveFrom)
    ) {
      return event as ArrangementStatusChangeEvent;
    }
  }
  return null;
}

/**
 * Resolve the arrangement's lifecycle status on a calendar date. Events are
 * ordered by their business-effective date (not by when they were recorded).
 * Before the first recorded transition, that transition's previousStatus is
 * the best persisted evidence; after it, the latest effective event wins.
 */
export function arrangementStatusAsOf(
  arrangement: ArrangementStatusAsOfInput,
  asOf: string | null | undefined,
): string {
  if (!isValidArrangementEffectiveDate(asOf)) return arrangement.status;
  if (!Array.isArray(arrangement.revisionHistory)) return arrangement.status;

  const events = arrangement.revisionHistory
    .map((value, index) => ({ value: value as any, index }))
    .filter(({ value }) =>
      value?.eventType === "status_change"
      && typeof value?.status === "string"
      && typeof value?.previousStatus === "string"
      && isValidArrangementEffectiveDate(value?.effectiveFrom))
    .sort((a, b) =>
      a.value.effectiveFrom.localeCompare(b.value.effectiveFrom)
      || String(a.value.recordedAt ?? "").localeCompare(String(b.value.recordedAt ?? ""))
      || a.index - b.index);

  if (events.length === 0) return arrangement.status;
  const effective = events.filter(({ value }) => value.effectiveFrom <= asOf);
  if (effective.length > 0) return effective[effective.length - 1].value.status;
  return events[0].value.previousStatus;
}

export function isArrangementOperationalAsOf(
  arrangement: ArrangementStatusAsOfInput,
  asOf: string | null | undefined,
  operationalStatuses: readonly string[],
): boolean {
  return operationalStatuses.includes(arrangementStatusAsOf(arrangement, asOf));
}

export function cancelledEffectiveFromAsOf(
  arrangement: ArrangementStatusAsOfInput,
  asOf: string | null | undefined,
): string | null {
  if (!isValidArrangementEffectiveDate(asOf) || !Array.isArray(arrangement.revisionHistory)) return null;
  const dates = arrangement.revisionHistory
    .filter((event: any) =>
      event?.eventType === "status_change"
      && event?.status === "cancelled"
      && isValidArrangementEffectiveDate(event?.effectiveFrom)
      && event.effectiveFrom <= asOf)
    .map((event: any) => event.effectiveFrom as string)
    .sort();
  return arrangementStatusAsOf(arrangement, asOf) === "cancelled"
    ? dates[dates.length - 1] ?? null
    : null;
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
