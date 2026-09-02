/**
 * Display-only BOQ hierarchy used by review and programme screens.
 *
 * Imported files are kept Bill-first, then source/section within that Bill.
 * Older projects which do not carry source Bill metadata retain the historical
 * operational-category grouping.
 */
export type BoqDisplayItem = {
  id: number;
  itemCode?: string | null;
  categorySourceBillNo?: string | null;
  categoryName?: string | null;
  categorySortOrder?: number | null;
  excelRow?: number | null;
  sortOrder?: number | null;
  workCategory?: string | null;
};

export type BoqDisplaySource<T> = {
  key: string;
  label: string;
  items: T[];
};

export type BoqDisplayBill<T> = {
  key: string;
  label: string | null;
  imported: boolean;
  sources: BoqDisplaySource<T>[];
};

export function compareBoqItemCode(a?: string | null, b?: string | null): number {
  const tokenize = (value?: string | null) =>
    String(value ?? "").match(/\d+|[^\d]+/g)?.map(part =>
      /^\d+$/.test(part) ? { number: Number(part), text: part } : { number: null, text: part.toLocaleLowerCase() },
    ) ?? [];
  const aa = tokenize(a);
  const bb = tokenize(b);
  for (let i = 0; i < Math.max(aa.length, bb.length); i++) {
    if (!aa[i]) return -1;
    if (!bb[i]) return 1;
    if (aa[i].number != null && bb[i].number != null) {
      if (aa[i].number !== bb[i].number) return aa[i].number! - bb[i].number!;
    } else {
      const compared = aa[i].text.localeCompare(bb[i].text);
      if (compared) return compared;
    }
  }
  return String(a ?? "").localeCompare(String(b ?? ""));
}

function numeric(value: number | null | undefined): number {
  return value == null || !Number.isFinite(value) ? Number.MAX_SAFE_INTEGER : value;
}

function compareDisplayItems<T extends BoqDisplayItem>(a: T, b: T): number {
  return numeric(a.categorySortOrder) - numeric(b.categorySortOrder)
    || numeric(a.excelRow) - numeric(b.excelRow)
    || numeric(a.sortOrder) - numeric(b.sortOrder)
    || compareBoqItemCode(a.itemCode, b.itemCode)
    || a.id - b.id;
}

/** The key used by collapse/deep-link state without changing persisted data. */
export function boqDisplaySourceKey(item: BoqDisplayItem): string {
  const bill = item.categorySourceBillNo?.trim();
  if (bill) return `bill:${bill}|source:${item.categoryName?.trim() || "Items"}`;
  if (item.workCategory?.trim()) return `wc:${item.workCategory.trim()}`;
  if (item.categoryName?.trim()) return `cat:${item.categoryName.trim()}`;
  return "__uncategorised__";
}

export function buildBoqDisplayHierarchy<T extends BoqDisplayItem>(
  input: readonly T[],
  workCategoryLabel: (value?: string | null) => string,
): BoqDisplayBill<T>[] {
  type MutableBill = BoqDisplayBill<T> & { first: T; sourceMap: Map<string, BoqDisplaySource<T> & { first: T }> };
  const bills = new Map<string, MutableBill>();

  for (const item of input) {
    const sourceBillNo = item.categorySourceBillNo?.trim();
    const imported = !!sourceBillNo;
    const billKey = imported ? `bill:${sourceBillNo}` : "legacy";
    let bill = bills.get(billKey);
    if (!bill) {
      bill = {
        key: billKey,
        label: imported ? sourceBillNo! : null,
        imported,
        sources: [],
        first: item,
        sourceMap: new Map(),
      };
      bills.set(billKey, bill);
    } else if (compareDisplayItems(item, bill.first) < 0) {
      bill.first = item;
    }

    const sourceKey = boqDisplaySourceKey(item);
    const sourceLabel = imported
      ? item.categoryName?.trim() || "Items"
      : item.workCategory?.trim()
        ? workCategoryLabel(item.workCategory)
        : item.categoryName?.trim() || "Uncategorised";
    let source = bill.sourceMap.get(sourceKey);
    if (!source) {
      source = { key: sourceKey, label: sourceLabel, items: [], first: item };
      bill.sourceMap.set(sourceKey, source);
      bill.sources.push(source);
    } else if (compareDisplayItems(item, source.first) < 0) {
      source.first = item;
    }
    source.items.push(item);
  }

  const result: MutableBill[] = Array.from(bills.values());
  result.sort((a: MutableBill, b: MutableBill) =>
    compareDisplayItems(a.first, b.first)
    || compareBoqItemCode(a.label, b.label),
  );
  for (const bill of result) {
    const mutableSources = bill.sources as Array<BoqDisplaySource<T> & { first: T }>;
    mutableSources.sort((a, b) =>
      compareDisplayItems(a.first, b.first)
      || a.label.localeCompare(b.label),
    );
    for (const source of bill.sources) source.items.sort(compareDisplayItems);
  }
  return result;
}