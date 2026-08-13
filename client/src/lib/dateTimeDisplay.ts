// 06G — single shared display formatter for stored timestamps.
// Always local display ("12 Aug 2026 · 8:48 AM"), never raw ISO.
// Missing/invalid values return null so callers omit the line gracefully
// (legacy records must never get a fabricated timestamp).
import { format } from "date-fns";

export function fmtDateTime(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return null;
  return `${format(d, "d MMM yyyy")} · ${format(d, "h:mm a")}`;
}

/** Time-only variant for compact inline use ("9:20 AM"). */
export function fmtTimeOnly(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return null;
  return format(d, "h:mm a");
}
