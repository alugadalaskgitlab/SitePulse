import { useEffect, type Dispatch, type SetStateAction } from "react";
import { suggestResourceItem, todaysResourceActivities, type ResourceActivity, type SuggestionRow } from "@/lib/resourceSuggestions";

export function useResourceSuggestions<T extends SuggestionRow>(
  progress: ResourceActivity[], rows: T[], setRows: Dispatch<SetStateAction<T[]>>,
  issuedOnly = false,
) {
  const activityKey = JSON.stringify(todaysResourceActivities(progress));
  useEffect(() => {
    const ids: number[] = JSON.parse(activityKey);
    setRows(rows => {
      const next = rows.map(row => suggestResourceItem(row, ids, !issuedOnly || (row as T & { type?: string }).type === "Issued"));
      return next.some((row, index) => row !== rows[index]) ? next : rows;
    });
  }, [activityKey, rows, setRows, issuedOnly]);
}