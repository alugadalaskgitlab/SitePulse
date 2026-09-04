/**
 * Pure, conservative Bill/section boundary recognition for spreadsheet imports.
 * A boundary is returned only for an explicit Bill or Schedule marker; callers
 * must not infer one from item numbering or a descriptive heading.
 */
export interface BoqBillBoundary {
  billNo: string;
  title?: string;
}

export interface BoqImportPhysicalRow {
  itemCode?: unknown;
  description?: unknown;
  unit?: unknown;
  boqQty?: unknown;
  snlCode?: unknown;
  clientRate?: unknown;
  sourceRow: number;
}

export interface LogicalBoqImportItem {
  description: string;
  unit: string;
  boqQty: number;
  itemCode?: string;
  snlCode?: string;
  clientRate?: number;
  categoryName?: string;
  sourceBillNo?: string;
  sourceRow: number;
  sortOrder: number;
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

function importCell(value: unknown): string {
  return value == null ? "" : String(value).trim().replace(/\s+/g, " ");
}

function importCode(value: unknown): string {
  if (value == null || value === "") return "";
  if (typeof value === "number") {
    return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.00$/, "");
  }
  return importCell(value);
}

function importNumber(value: unknown): number | null {
  if (value == null || importCell(value) === "") return null;
  const parsed = typeof value === "number"
    ? value
    : Number.parseFloat(importCell(value).replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function isImportTotalOrHeader(description: string): boolean {
  return /total\s+carried|carried to summary|^sub\s*total$|^total$|grand total/i.test(description)
    || /^(description|item\s*description|particulars?)$/i.test(description);
}

/**
 * Reconstruct logical BOQ items before classification/import.
 *
 * Only an explicit code or Bill/Schedule marker starts a new logical row.
 * Blank-code rows continue the current item, including rows where UOM and
 * quantity are populated only after one or more description continuations.
 */
export function reconstructLogicalBoqItems(rows: BoqImportPhysicalRow[]): LogicalBoqImportItem[] {
  const items: LogicalBoqImportItem[] = [];
  let currentBill = "";
  let currentBillNo = "";
  let current: Omit<LogicalBoqImportItem, "sortOrder"> | null = null;

  const flush = () => {
    if (current?.description.trim()) {
      items.push({ ...current, sortOrder: items.length });
    }
    current = null;
  };

  for (const row of rows) {
    const itemCode = importCode(row.itemCode);
    const description = importCell(row.description);
    const unit = importCell(row.unit);
    const boqQty = importNumber(row.boqQty);
    const snlCode = importCode(row.snlCode);
    const clientRate = importNumber(row.clientRate);
    const boundary = detectBoqBillBoundary(itemCode, description);

    if (boundary) {
      flush();
      currentBillNo = boundary.billNo;
      currentBill = boundary.title ?? "";
      continue;
    }

    const hasAnyValue = Boolean(itemCode || description || unit || snlCode)
      || boqQty != null
      || clientRate != null;
    if (!hasAnyValue) continue;
    if (description && isImportTotalOrHeader(description)) {
      flush();
      continue;
    }

    if (itemCode || current == null) {
      flush();
      current = {
        description,
        unit,
        boqQty: boqQty ?? 0,
        ...(itemCode ? { itemCode } : {}),
        ...(snlCode ? { snlCode } : {}),
        ...(clientRate != null ? { clientRate } : {}),
        ...(currentBill ? { categoryName: currentBill } : {}),
        ...(currentBillNo ? { sourceBillNo: currentBillNo } : {}),
        sourceRow: row.sourceRow,
      };
      continue;
    }

    if (description) {
      current.description = [current.description, description].filter(Boolean).join(" ");
    }
    if (unit) current.unit = unit;
    if (boqQty != null) current.boqQty = boqQty;
    if (snlCode && !current.snlCode) current.snlCode = snlCode;
    if (clientRate != null) current.clientRate = clientRate;
  }

  flush();
  return items;
}