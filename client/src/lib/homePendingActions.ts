// Pending actions use creation time where available, and the record date for
// older imports. A missing/invalid date is unknown, never a fabricated age.
export type DatedPendingItem = { createdAt?: string | Date | null; date?: string | null };

export function pendingTime(item: DatedPendingItem): number {
  const source = item.createdAt ?? item.date;
  const value = source ? new Date(source).getTime() : NaN;
  return Number.isFinite(value) ? value : Number.POSITIVE_INFINITY;
}

export function oldestPendingFirst<T extends DatedPendingItem>(items: T[]): T[] {
  return [...items].sort((a, b) => pendingTime(a) - pendingTime(b));
}

export function pendingAge(item: DatedPendingItem, now: Date): string {
  const timestamp = pendingTime(item);
  if (!Number.isFinite(timestamp)) return "Age unavailable";
  const elapsed = Math.max(0, now.getTime() - timestamp);
  const days = Math.floor(elapsed / 86_400_000);
  if (days > 0) return `Pending ${days} ${days === 1 ? "day" : "days"}`;
  const hours = Math.floor(elapsed / 3_600_000);
  return hours > 0 ? `Pending ${hours} ${hours === 1 ? "hour" : "hours"}` : "Pending less than an hour";
}

export const pendingDieselHref = (id: number) => `/plant/diesel-requirements?returnTo=/&dieselReqId=${id}`;
export const pendingIndentHref = (id: number) => `/plant/purchase-indents?returnTo=/&indentId=${id}`;
export const pendingIrnHref = (id: number) => `/irn/${id}?returnTo=/`;