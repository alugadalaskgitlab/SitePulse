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
    .filter(version => new Date(version.effectiveAt).getTime() <= dispatchAt)
    .sort((left, right) =>
      new Date(right.effectiveAt).getTime() - new Date(left.effectiveAt).getTime() ||
      right.id - left.id
    )[0] ?? null;
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
