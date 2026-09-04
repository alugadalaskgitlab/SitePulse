/**
 * The entry date/time records when a receipt was keyed into the app.
 * The invoice date is the effective purchase date used for stock chronology.
 * Legacy rows may not have an invoice date, so their original date remains the
 * transaction date without rewriting historical data.
 */
export function materialReceiptTransactionDate(
  invoiceDate: string | null | undefined,
  entryDate: string,
): string {
  const value = invoiceDate?.trim();
  return value || entryDate;
}