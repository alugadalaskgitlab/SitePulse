export type EffectiveMixVersion = {
  id: number;
  effectiveAt: string | Date;
};

/**
 * Dispatch date/time inputs are site-local Indian time. Converting with an
 * explicit IST offset keeps version selection independent of the server TZ.
 */
export function supplyDispatchInstant(date: string, time?: string | null): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Choose a valid dispatch date.");
  const localTime = time || "00:00";
  if (!/^\d{2}:\d{2}$/.test(localTime)) throw new Error("Choose a valid dispatch time.");
  const instant = new Date(`${date}T${localTime}:00+05:30`);
  if (!Number.isFinite(instant.getTime())) throw new Error("Choose a valid dispatch date and time.");
  return instant;
}

export function mixVersionAt<T extends EffectiveMixVersion>(
  versions: readonly T[],
  date: string,
  time?: string | null,
): T | null {
  const dispatchAt = supplyDispatchInstant(date, time).getTime();
  return versions
    .filter(version => new Date(version.effectiveAt).getTime() < dispatchAt)
    .sort((left, right) =>
      new Date(right.effectiveAt).getTime() - new Date(left.effectiveAt).getTime() ||
      right.id - left.id
    )[0] ?? null;
}

/**
 * Existing dispatches stay pinned to the saved version when edited later.
 * Only legacy/unpinned dispatches resolve from their original date and time.
 */
export function mixVersionForDispatch<T extends EffectiveMixVersion>(
  versions: readonly T[],
  date: string,
  time: string | null | undefined,
  savedVersionId?: number | null,
): T | null {
  if (savedVersionId != null) return versions.find(version => version.id === savedVersionId) ?? null;
  return mixVersionAt(versions, date, time);
}

export function supplyOrderBitumenQuantity(loadWeightMt: number, bitumenPercent: number): number {
  return loadWeightMt * bitumenPercent / 100;
}

export function formatSupplyOrderVersionTime(value: string | Date): string {
  const parts = new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).formatToParts(new Date(value));
  const part = (type: string) => parts.find(item => item.type === type)?.value ?? "";
  return `${part("day")} ${part("month")} ${part("year")}, ${part("hour")}:${part("minute")} ${part("dayPeriod").toUpperCase()} IST`;
}

export function supplyMixVersionTimeError(
  effectiveAt: Date,
  latestDispatchAt: Date | null,
  previousVersionAt: Date | null,
): string | null {
  if (latestDispatchAt && effectiveAt.getTime() < latestDispatchAt.getTime()) {
    return "Effective time cannot be earlier than the latest truck already linked to this mix line.";
  }
  if (previousVersionAt && effectiveAt.getTime() <= previousVersionAt.getTime()) {
    return "Effective time must be after the previous mix version.";
  }
  return null;
}

export function supplyOrderLineQuantityError(orderedMt: number, dispatchedMt: number): string | null {
  if (orderedMt + 0.000001 < dispatchedMt) {
    return `Ordered quantity cannot be below ${dispatchedMt.toFixed(3)} MT already dispatched.`;
  }
  return null;
}

export function supplyOrderLineCanBeRemoved(dispatchedMt: number): boolean {
  return !Number.isFinite(dispatchedMt) || dispatchedMt <= 0;
}

export function supplyDispatchOutsideOrderPeriod(
  dispatchDate: string,
  periodFrom: string,
  periodTo: string,
): boolean {
  return dispatchDate < periodFrom || dispatchDate > periodTo;
}

export function withoutBlankSupplyOrderLines<T extends {
  mixTemplateId?: unknown;
  enteredQuantity?: unknown;
  orderedMt?: unknown;
  plannedMtPerDay?: unknown;
}>(lines: readonly T[]): T[] {
  const isBlank = (value: unknown) =>
    value == null || (typeof value === "string" && value.trim() === "");
  return lines.filter(line => !(line && typeof line === "object" &&
    isBlank(line.mixTemplateId) && isBlank(line.enteredQuantity) &&
    isBlank(line.orderedMt) && isBlank(line.plannedMtPerDay)));
}
