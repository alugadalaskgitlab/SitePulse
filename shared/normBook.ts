export const NORM_BOOK_SETTING_KEY = "norm_book_in_use";
export const MORTH_SDB_SOURCE_CODE = "MORTH_SDB_2019";
export const MORTH_SDB_DISPLAY_NAME = "MoRTH Standard Data Book (2003)";
export const DEFAULT_NORM_BOOK_CODE = MORTH_SDB_SOURCE_CODE;

export type SnlSearchBookItem = {
  sourceCode: string;
  sourceName: string;
  itemCode: string;
};

export function getSnlSearchItemTitle(
  item: SnlSearchBookItem & { shortLabel?: string | null; description?: string | null },
) {
  if (item.sourceCode === MORTH_SDB_SOURCE_CODE) {
    const labelMayBeTruncated = item.shortLabel?.length === 80;
    return labelMayBeTruncated
      ? item.description || item.shortLabel || ""
      : item.shortLabel || item.description || "";
  }
  return item.description || item.shortLabel || "";
}

export function getSnlSourceDisplayName(sourceCode: string | null | undefined, sourceName: string | null | undefined) {
  return sourceCode === MORTH_SDB_SOURCE_CODE
    ? MORTH_SDB_DISPLAY_NAME
    : sourceName || sourceCode || "Norm book";
}

export function canApplySnlSource(input: {
  itemSourceCode: string | null | undefined;
  selectedBookCode: string;
  sourceIsActive: boolean;
  allowOtherBooks: boolean;
}) {
  return input.sourceIsActive &&
    (input.allowOtherBooks || input.itemSourceCode === input.selectedBookCode);
}

export function groupSnlSearchResults<T extends SnlSearchBookItem>(items: T[]) {
  const morth = items
    .filter(item => item.sourceCode === MORTH_SDB_SOURCE_CODE)
    .sort((a, b) => a.itemCode.localeCompare(b.itemCode, undefined, { numeric: true }));
  const otherBooks = items
    .filter(item => item.sourceCode !== MORTH_SDB_SOURCE_CODE)
    .sort((a, b) =>
      a.sourceName.localeCompare(b.sourceName) ||
      a.itemCode.localeCompare(b.itemCode, undefined, { numeric: true }),
    );
  return { morth, otherBooks };
}

export function buildSnlSearchUrl(
  query: string,
  options: { includeOtherBooks?: boolean; category?: string; boqDesc?: string } = {},
) {
  const params = new URLSearchParams({ q: query });
  if (options.includeOtherBooks) params.set("includeOtherBooks", "true");
  if (options.category) params.set("category", options.category);
  if (options.boqDesc) params.set("boqDesc", options.boqDesc);
  return `/api/snl/search?${params.toString()}`;
}
