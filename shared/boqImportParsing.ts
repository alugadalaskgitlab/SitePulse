/**
 * Pure, conservative Bill/section boundary recognition for spreadsheet imports.
 * A boundary is returned only for an explicit Bill or Schedule marker; callers
 * must not infer one from item numbering or a descriptive heading.
 */
export interface BoqBillBoundary {
  billNo: string;
  title?: string;
}

function cleanTitle(value: string, marker: RegExp): string {
  return value
    .replace(marker, "")
    .replace(/^[\s:–—-]+|[\s:–—-]+$/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** Detect an explicit Bill marker in either the item or description cell. */
export function detectBoqBillBoundary(itemCell: unknown, descriptionCell: unknown): BoqBillBoundary | null {
  const cells = [String(itemCell ?? "").trim(), String(descriptionCell ?? "").trim()];
  // Deliberately require a number/roman numeral after Bill (or its hyphenated
  // form): "Bill of Quantities" is not a boundary.
  const billPattern = /\bbill\s*(?:no\.?|number)?\s*[-–—:#]?\s*(\d+(?:\.\d+)?|[ivxlcdm]+)\b/i;
  const schedulePattern = /\bschedule\s*[-–—:#]?\s*([a-z0-9]+)\b/i;

  for (let index = 0; index < cells.length; index++) {
    const cell = cells[index];
    const bill = cell.match(billPattern);
    if (bill) {
      const rawIdentifier = bill[1];
      const billNo = `BILL-${/^\d/.test(rawIdentifier) ? rawIdentifier : rawIdentifier.toUpperCase()}`;
      const title = cleanTitle(cell, billPattern) || cells[1 - index];
      return { billNo, title: title || undefined };
    }
    const schedule = cell.match(schedulePattern);
    if (schedule) {
      const billNo = `SCHEDULE ${schedule[1].toUpperCase()}`;
      const title = cleanTitle(cell, schedulePattern) || cells[1 - index];
      return { billNo, title: title || undefined };
    }
  }
  return null;
}