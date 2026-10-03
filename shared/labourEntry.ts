/** Default category/gender and suggested work items are not entered evidence. */
export function isFilledLabourRow(row: {
  count?: unknown; hours?: unknown; task?: unknown; contractor?: unknown; workerNames?: unknown;
}): boolean {
  const text = (value: unknown) => typeof value === "string" && value.trim().length > 0;
  return row.count != null || row.hours != null || text(row.task) || text(row.contractor) ||
    (Array.isArray(row.workerNames) && row.workerNames.some(text));
}