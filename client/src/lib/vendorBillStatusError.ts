import { parseApiError } from "./apiError";

export type HsdRecoveryVerificationMonth = { key: string; label: string };

export function vendorBillHsdRecoveryMonths(error: unknown): HsdRecoveryVerificationMonth[] {
  const { message } = parseApiError(error);
  const ranges = Array.from(message.matchAll(
    /(\d{4}-\d{2}-\d{2})\s*[–-]\s*(\d{4}-\d{2}-\d{2}):\s*HSD recovery disposition/gi,
  ));
  const months = new Map<string, HsdRecoveryVerificationMonth>();
  for (const match of ranges) {
    const from = match[1];
    const to = match[2];
    if (!from || !to || from > to) continue;
    const cursor = new Date(`${from.slice(0, 7)}-01T00:00:00Z`);
    const lastMonth = to.slice(0, 7);
    while (Number.isFinite(cursor.getTime()) && cursor.toISOString().slice(0, 7) <= lastMonth) {
      const key = cursor.toISOString().slice(0, 7);
      months.set(key, {
        key,
        label: cursor.toLocaleDateString("en-IN", {
          month: "long",
          year: "numeric",
          timeZone: "UTC",
        }),
      });
      cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    }
  }
  return Array.from(months.values()).sort((a, b) => a.key.localeCompare(b.key));
}

export function vendorBillStatusError(error: unknown): { title: string; description: string } {
  const { message } = parseApiError(error);
  if ([
    "Record the remaining equipment hire balance before marking this bill paid.",
    "Record the cumulative equipment hire payment before marking this bill paid.",
  ].includes(message)) {
    return {
      title: "Payment balance still outstanding",
      description: "Open Payment Details and save the total amount actually paid in “Paid This Bill (cumulative ₹)”. You can mark this bill as Paid once the recorded payment covers the full net payable.",
    };
  }
  if (/HSD recovery disposition/i.test(message)) {
    const months = vendorBillHsdRecoveryMonths(error);
    const monthText = months.length ? months.map(month => month.label).join(", ") : "the affected month";
    const otherGaps = message
      .replace(/^Complete the hire review before verification:\s*/i, "")
      .split(";")
      .map(gap => gap.trim())
      .filter(gap => gap && !/HSD recovery disposition/i.test(gap));
    return {
      title: "HLC diesel reconciliation needs a decision",
      description: `Complete the HLC diesel reconciliation for ${monthText}. In each month, choose Accept Suggested, Edit, or No Recovery.${otherGaps.length ? ` Other hire-review items also need attention: ${otherGaps.join("; ")}.` : ""}`,
    };
  }
  return { title: "Could not update bill status", description: message };
}