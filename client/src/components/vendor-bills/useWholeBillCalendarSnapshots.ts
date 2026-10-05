import { useCallback, useRef } from "react";
import type { BillExportCalendar } from "./wholeBillSnapshot";

/**
 * Collect calendars supplied by existing rendered components, without a state
 * update, cache invalidation or network request. Only keys still included in
 * the bill are read, so deleted/excluded groups cannot leak into an export.
 */
export function useWholeBillCalendarSnapshots() {
  const calendars = useRef(new Map<string, BillExportCalendar>());
  const rememberCalendar = useCallback((key: string, calendar: BillExportCalendar) => {
    calendars.current.set(key, calendar);
  }, []);
  const readCalendars = useCallback((includedKeys: readonly string[]) =>
    includedKeys.flatMap(key => {
      const calendar = calendars.current.get(key);
      return calendar ? [calendar] : [];
    }), []);
  return { rememberCalendar, readCalendars };
}