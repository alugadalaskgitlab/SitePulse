import { groupBillItemsByDate } from "./BillDateGroups";
import type { BillExportRow, BillExportSection } from "./wholeBillSnapshot";

export type BillScreenScope = {
  category: string;
  /** Screen's category subtotal, including zero-valued populated categories. */
  subtotal: number;
  /** Pass scopes in the same order as rendered, e.g. site/plant/other labour. */
  rowGroups: { label?: string; rows: BillExportRow[] }[];
};

/**
 * Uses the exact existing date-group projection, not a second sort or amount
 * calculation. The page supplies category/labour/filter order and subtotals.
 * Collapsed dates still export their contents, as a whole-bill export must.
 */
export function projectWholeBillScreenSections(
  scopes: BillScreenScope[],
  formatDate: (date: string | null | undefined) => string,
): BillExportSection[] {
  return scopes.map(scope => ({
    category: scope.category,
    subtotal: scope.subtotal,
    groups: scope.rowGroups.flatMap(source =>
      groupBillItemsByDate(source.rows.map((item, idx) => ({ item, idx }))).map(group => ({
        label: [source.label, group.date ? formatDate(group.date) : "Missing date"].filter(Boolean).join(" · "),
        rows: group.items.map(({ item }) => item),
        subtotal: group.subtotal,
      }))),
  }));
}