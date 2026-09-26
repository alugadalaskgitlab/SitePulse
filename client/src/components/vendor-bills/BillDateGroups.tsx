import { Fragment, type ReactNode } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export const LARGE_BILL_ITEM_THRESHOLD = 20;
export const MISSING_BILL_ITEM_DATE = "__missing_date__";

export type IndexedBillItem<T> = { item: T; idx: number };

export type BillDateGroup<T> = {
  key: string;
  date: string | null;
  items: Array<IndexedBillItem<T>>;
  subtotal: number;
};

export function groupBillItemsByDate<T extends { date?: string | null; amount?: number | string | null }>(
  items: Array<IndexedBillItem<T>>,
): Array<BillDateGroup<T>> {
  const groups = new Map<string, BillDateGroup<T>>();
  for (const indexedItem of items) {
    const rawDate = String(indexedItem.item.date ?? "").trim();
    const key = rawDate || MISSING_BILL_ITEM_DATE;
    const existing = groups.get(key);
    if (existing) {
      existing.items.push(indexedItem);
      existing.subtotal += Number(indexedItem.item.amount) || 0;
    } else {
      groups.set(key, {
        key,
        date: rawDate || null,
        items: [indexedItem],
        subtotal: Number(indexedItem.item.amount) || 0,
      });
    }
  }
  return [...groups.values()].sort((a, b) => {
    if (a.key === MISSING_BILL_ITEM_DATE) return 1;
    if (b.key === MISSING_BILL_ITEM_DATE) return -1;
    return a.key.localeCompare(b.key);
  });
}

type BillDateGroupRowsProps<T extends { date?: string | null; amount?: number | string | null }> = {
  items: Array<IndexedBillItem<T>>;
  scope: string;
  totalColumns: number;
  totalBillItems: number;
  expansionMode: "auto" | "expanded" | "collapsed";
  expansionOverrides: Record<string, boolean>;
  onToggle: (key: string, expanded: boolean) => void;
  onRemoveGroup?: (items: Array<IndexedBillItem<T>>, label: string) => void;
  renderRow: (item: T, idx: number) => ReactNode;
  formatDate: (date: string | null | undefined) => string;
  formatAmount: (amount: number) => string;
};

export function BillDateGroupRows<T extends { date?: string | null; amount?: number | string | null }>({
  items,
  scope,
  totalColumns,
  totalBillItems,
  expansionMode,
  expansionOverrides,
  onToggle,
  onRemoveGroup,
  renderRow,
  formatDate,
  formatAmount,
}: BillDateGroupRowsProps<T>) {
  return (
    <>
      {groupBillItemsByDate(items).map(group => {
        const expansionKey = `${scope}:${group.key}`;
        const defaultExpanded = totalBillItems <= LARGE_BILL_ITEM_THRESHOLD;
        const expanded = expansionOverrides[expansionKey]
          ?? (expansionMode === "expanded" ? true : expansionMode === "collapsed" ? false : defaultExpanded);
        return (
          <Fragment key={group.key}>
            <tr className="border-b bg-muted/10" data-testid={`row-date-group-${scope}-${group.key}`}>
              <td colSpan={totalColumns} className="px-2 py-1.5">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-auto w-full justify-start px-1 py-1 text-left"
                  aria-expanded={expanded}
                  onClick={() => onToggle(expansionKey, !expanded)}
                  data-testid={`button-date-group-${scope}-${group.key}`}
                >
                  {expanded ? <ChevronDown className="mr-2 h-4 w-4 shrink-0" /> : <ChevronRight className="mr-2 h-4 w-4 shrink-0" />}
                  <span className="font-semibold uppercase">
                    {group.date ? formatDate(group.date) : "Missing date"}
                  </span>
                  <span className="ml-2 text-muted-foreground normal-case">
                    {group.items.length} item{group.items.length === 1 ? "" : "s"}
                  </span>
                  <span className="ml-auto pl-3 font-semibold">
                    Rs. {formatAmount(group.subtotal)}
                  </span>
                </Button>
                {onRemoveGroup && (
                  <Button type="button" variant="ghost" size="sm" className="text-destructive"
                    data-testid={`button-remove-date-group-${scope}-${group.key}`}
                    onClick={() => onRemoveGroup(group.items, group.date ? formatDate(group.date) : "Missing date")}>
                    Remove Group
                  </Button>
                )}
              </td>
            </tr>
            {expanded && group.items.map(({ item, idx }) => renderRow(item, idx))}
          </Fragment>
        );
      })}
    </>
  );
}

export function BillDateGroupControls({
  expansionMode,
  onExpansionModeChange,
}: {
  expansionMode: "auto" | "expanded" | "collapsed";
  onExpansionModeChange: (mode: "expanded" | "collapsed") => void;
}) {
  return (
    <div className="flex items-center gap-1" data-testid="date-group-controls">
      <Button
        type="button"
        variant={expansionMode === "expanded" ? "secondary" : "ghost"}
        size="sm"
        onClick={() => onExpansionModeChange("expanded")}
        data-testid="button-expand-all-dates"
      >
        Expand All
      </Button>
      <Button
        type="button"
        variant={expansionMode === "collapsed" ? "secondary" : "ghost"}
        size="sm"
        onClick={() => onExpansionModeChange("collapsed")}
        data-testid="button-collapse-all-dates"
      >
        Collapse All
      </Button>
    </div>
  );
}