import type { ReactNode } from "react";
import {
  arrangementWorking,
  type ArrangementPricing,
} from "@shared/vendorBillArrangement";
import {
  groupRateItems,
  type CandidateGroupItem,
  type RateGroup,
} from "@shared/vendorBillCandidates";
import type { BillDateGroup } from "./BillDateGroups";

export type ArrangementBillItem = CandidateGroupItem & {
  date?: string | null;
  amount?: number | string | null;
  rate?: number | string | null;
  arrangementPricing?: ArrangementPricing | null;
};

export function ArrangementBillGroupRow<T extends ArrangementBillItem>({
  item,
  idx,
  dateGroup,
  allArrangementGroups,
  colSpan,
  formatAmount,
  onRemoveAll,
}: {
  item: T;
  idx: number;
  dateGroup: BillDateGroup<T>;
  allArrangementGroups: RateGroup<T>[];
  colSpan: number;
  formatAmount: (amount: number) => string;
  onRemoveAll: (items: T[]) => void;
}) {
  const dateGroups = groupRateItems(
    dateGroup.items
      .map(({ item: dateItem }) => dateItem)
      .filter(dateItem => dateItem.arrangementPricing),
  );
  const dateArrangementGroup = dateGroups.find(group => group.items.includes(item));
  if (!dateArrangementGroup || dateArrangementGroup.items[0] !== item) return null;

  const allDaysGroup = allArrangementGroups.find(group => group.key === dateArrangementGroup.key)
    ?? dateArrangementGroup;
  const dateAmount = dateArrangementGroup.items.reduce(
    (sum, dateItem) => sum + (Number(dateItem.amount) || 0),
    0,
  );

  return (
    <tr
      key={idx}
      data-testid={`arrangement-bill-group-${idx}-${dateGroup.key}`}
      className="border-b"
    >
      <td colSpan={colSpan} className="p-3">
        <strong>{item.description}</strong>
        <p>
          {dateArrangementGroup.count} trips · Rate ₹{item.rate} · ₹{formatAmount(dateAmount)} that day
        </p>
        <p className={item.arrangementPricing?.reason ? "text-amber-700" : ""}>
          {arrangementWorking(item.arrangementPricing, dateArrangementGroup.count)}
        </p>
        <button
          type="button"
          className="text-xs underline"
          onClick={() => onRemoveAll(allDaysGroup.items)}
        >
          Remove group from this bill
        </button>
      </td>
    </tr>
  );
}

export function ArrangementBillOverallTotals<T extends ArrangementBillItem>({
  groups,
  colSpan,
  formatAmount,
}: {
  groups: RateGroup<T>[];
  colSpan: number;
  formatAmount: (amount: number) => string;
}): ReactNode {
  if (!groups.length) return null;

  return (
    <tr data-testid="arrangement-bill-overall-total" className="border-b bg-muted/20">
      <td colSpan={colSpan} className="px-3 py-2 text-sm">
        <strong>Arrangement total (all dates)</strong>
        <div className="mt-1 space-y-1">
          {groups.map(group => {
            const amount = group.items.reduce(
              (sum, item) => sum + (Number(item.amount) || 0),
              0,
            );
            return (
              <div key={group.key} data-testid="arrangement-bill-overall-group">
                {group.groupName}: {group.count} trips · ₹{formatAmount(amount)}
              </div>
            );
          })}
        </div>
      </td>
    </tr>
  );
}
