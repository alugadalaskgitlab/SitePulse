/**
 * Batch 06M-C — Daily Diesel Purchase receipt-pending control.
 *
 * Single source of truth for deriving Purchased / Received / Pending /
 * Variance and the receipt status of a purchased Daily Diesel Requirement
 * from its LINKED Material Receipts.
 *
 * Rules (spec §3, §12–14):
 * - Received counts ONLY valid linked receipts (not cancelled, not deleted).
 * - Status is DERIVED, never stored.
 * - Over-receipt is shown as an explicit positive variance, never clamped.
 * - Cancelled linked receipts are flagged so the UI can disclose that
 *   cancelling a Material Receipt does NOT reverse Plant Stock (pre-existing
 *   behavior) — the derived Pending figure and actual stock may diverge.
 *
 * All diesel_requirements quantities are treated as Liters (the canonical
 * Diesel plant material UoM); diesel_requirements has no UoM column of its own.
 */

export type DieselReceiptStatus = "receipt_pending" | "partly_received" | "fully_received";

export interface LinkedReceiptLike {
  quantity: number | string | null;
  isCancelled?: boolean | null;
  isDeleted?: boolean | null;
}

export interface DieselReceiptState {
  purchasedQty: number;
  receivedQty: number;
  /** max(purchased - received, 0) */
  pendingQty: number;
  /** received - purchased when positive (over-receipt), else 0 */
  overReceiptQty: number;
  status: DieselReceiptStatus;
  validReceiptCount: number;
  /** cancelled linked receipts — triggers the stock-divergence disclosure */
  cancelledReceiptCount: number;
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;

export function isValidLinkedReceipt(r: LinkedReceiptLike): boolean {
  return !r.isCancelled && !r.isDeleted;
}

export function computeDieselReceiptState(
  purchasedQty: number | string | null | undefined,
  linkedReceipts: LinkedReceiptLike[],
): DieselReceiptState {
  const purchased = Number(purchasedQty) || 0;
  let received = 0;
  let validCount = 0;
  let cancelledCount = 0;
  for (const r of linkedReceipts) {
    if (r.isDeleted) continue; // hard-deleted rows shouldn't exist, but never count them
    if (r.isCancelled) { cancelledCount++; continue; }
    const q = Number(r.quantity);
    if (!Number.isFinite(q) || q <= 0) continue;
    received += q;
    validCount++;
  }
  received = round3(received);
  const pending = round3(Math.max(purchased - received, 0));
  const over = round3(Math.max(received - purchased, 0));
  const status: DieselReceiptStatus =
    validCount === 0 || received <= 0
      ? "receipt_pending"
      : received < purchased
        ? "partly_received"
        : "fully_received";
  return {
    purchasedQty: purchased,
    receivedQty: received,
    pendingQty: pending,
    overReceiptQty: over,
    status,
    validReceiptCount: validCount,
    cancelledReceiptCount: cancelledCount,
  };
}

export const DIESEL_RECEIPT_STATUS_LABELS: Record<DieselReceiptStatus, string> = {
  receipt_pending: "Receipt Pending",
  partly_received: "Partly Received",
  fully_received: "Fully Received",
};

/** Section 14 disclosure shown when a linked receipt was cancelled. */
export const CANCELLED_RECEIPT_STOCK_NOTE =
  "A previously linked receipt was cancelled. Plant Stock may not have been automatically reversed — verify stock before recording a new receipt.";
