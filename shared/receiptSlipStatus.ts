export const RECEIPT_SEND_WINDOW_HOURS = 36;

// User-selected rollout cutoff: midnight Asia/Calcutta on 2026-10-30.
export const RECEIPT_SEND_TRACKING_START_AT = new Date("2026-10-30T00:00:00+05:30");

function validDate(value?: string | Date | null): Date | null {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function receiptSlipSendWindow(
  createdAt?: string | Date | null,
  latestEditAt?: string | Date | null,
  now = new Date(),
): { slipSendTrackingEnabled: boolean; slipSendWindowOpen: boolean } {
  const created = validDate(createdAt);
  const edited = validDate(latestEditAt);
  const latestActivity = edited && (!created || edited > created) ? edited : created;
  const slipSendTrackingEnabled = !!(
    (created && created >= RECEIPT_SEND_TRACKING_START_AT) ||
    (edited && edited >= RECEIPT_SEND_TRACKING_START_AT)
  );
  const ageMs = latestActivity ? now.getTime() - latestActivity.getTime() : -1;
  const windowMs = RECEIPT_SEND_WINDOW_HOURS * 60 * 60 * 1000;
  return {
    slipSendTrackingEnabled,
    slipSendWindowOpen: slipSendTrackingEnabled && ageMs >= 0 && ageMs <= windowMs,
  };
}
