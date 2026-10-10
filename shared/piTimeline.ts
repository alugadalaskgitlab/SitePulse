/** PI timestamp columns use UTC: Drizzle decodes timestamp-without-time-zone as
 * UTC, and legacy PI text writers ran in UTC. Offset-bearing values are instants,
 * not wall clocks to shift a second time. Business dates never imply midnight. */
export function parsePiTimestamp(value: unknown): Date | null {
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value : null;
  if (typeof value !== "string") return null;
  let text = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/.test(text)) return null;
  const [year, month, day] = text.slice(0, 10).split("-").map(Number);
  const calendar = new Date(Date.UTC(year, month - 1, day));
  if (calendar.getUTCFullYear() !== year || calendar.getUTCMonth() !== month - 1 || calendar.getUTCDate() !== day) return null;
  text = text.replace(" ", "T").replace(/\s+IST$/i, "+05:30").replace(/\s+(Z|[+-]\d{2}:?\d{2})$/, "$1");
  text = text.replace(/([+-]\d{2})$/, "$1:00");
  if (!/(Z|[+-]\d{2}:?\d{2})$/i.test(text)) text += "Z";
  const date = new Date(text);
  return Number.isFinite(date.getTime()) ? date : null;
}

export function formatPiTimestamp(value: unknown): string {
  const date = parsePiTimestamp(value);
  if (!date) return "Time not recorded";
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: true,
  }).formatToParts(date);
  const p = (key: string) => parts.find(part => part.type === key)?.value ?? "";
  return `${p("day")}-${p("month")}-${p("year")}, ${p("hour")}:${p("minute")} ${p("dayPeriod").toUpperCase()} IST`;
}

export type PiEvent = {
  id: string; label: string; actor: string | null; at: string | null;
  itemId: number | null; itemDescription: string | null; note: string | null;
};
const labels: Record<string, string> = {
  approved: "Approved", rejected: "Rejected", ordered: "Ordered",
  purchased: "Purchased", partial: "Purchased (partial)", cancelled: "Cancelled",
  reopened: "Reopened", completed: "Completed", received: "Received",
  handover: "Handed Over / Received", delivered: "Received",
  stores_verified: "Stores Verified", bypassed: "Stores Check Bypassed",
  not_purchased: "Not Purchased", not_available: "Not Available",
  recommend_cancellation: "Cancellation Recommended",
  service_completed: "Service Completed", service_partly_completed: "Service Partly Completed",
  approve: "Approved", reject: "Rejected", cancel: "Cancelled", reopen: "Reopened",
  complete: "Completed", verify: "Stores Verified", create: "Indent Raised",
  delivery_purchased: "Received", delivery_partial: "Received (partial)",
};

/** Pure, read-only projection. No updatedAt/current-time fallbacks. */
export function buildPiTimeline(indent: any, transactions: any[] = [], audits: any[] = [], receipts: any[] = []): PiEvent[] {
  const events: PiEvent[] = [];
  const items: any[] = indent.items ?? [];
  const add = (id: string, label: string, at: unknown, actor: any, itemId: number | null = null, note: any = null) => {
    events.push({ id, label, at: parsePiTimestamp(at)?.toISOString() ?? null,
      actor: actor || null, itemId, itemDescription: items.find(i => i.id === itemId)?.description ?? null, note: note || null });
  };
  add("raised", "Indent Raised", indent.createdAt, indent.raisedBy);
  if (indent.lockStatus !== "locked" && (indent.unlockedAt || indent.unlockedByName))
    add("unlocked", "Unlocked", indent.unlockedAt, indent.unlockedByName, null, indent.unlockReason);
  if (indent.storesStatus === "verified") add("verified", "Stores Verified", indent.storesVerifiedAt, indent.storesVerifiedBy);
  if (indent.storesStatus === "bypass_requested") add("bypass-requested", "Stores Bypass Requested", indent.storesVerifiedAt, indent.storesVerifiedBy);
  if (indent.storesStatus === "bypassed" || /\[BYPASS:/i.test(indent.approvalRemarks ?? "")) {
    // Approved bypass is recorded as part of approval, not the earlier request.
    add("bypassed", "Stores Check Bypassed", indent.approvedAt, indent.approvedBy);
  }
  if (indent.approvedAt || indent.approvedBy || ["approved", "rejected"].includes(indent.status)) {
    add("approval", indent.status === "rejected" ? "Rejected" : "Approved", indent.approvedAt, indent.approvedBy,
      null, indent.rejectionReason || indent.approvalRemarks);
  }
  for (const item of items) {
    for (const h of item.history ?? []) {
      const label = labels[String(h.action).toLowerCase()];
      if (label) add(`history-${h.id}`, label, h.actionAt, h.actionBy, item.id, h.notes);
    }
  }
  for (const t of transactions) {
    let label: string | undefined;
    if (t.transactionType === "purchaser_action") {
      label = labels[t.reasonCode] ?? (Number(t.qty) > 0 ? "Purchased" : undefined);
    } else if (t.transactionType === "handover") label = "Handed Over / Received";
    else if (["bulk_receipt", "delivery_receipt"].includes(t.transactionType)) label = "Received";
    else if (t.transactionType === "service_completion") label = "Service Completed";
    if (label) add(`transaction-${t.id}`, label, t.createdAt, t.receivedBy || t.createdBy, t.indentItemId,
      [t.remarks, t.handoverDate ? `Receipt date: ${t.handoverDate}` : null,
        t.transactionType === "purchaser_action" && t.expectedDeliveryDate
          ? `${t.reasonCode === "ordered" ? "Expected delivery" : "Purchase date"}: ${t.expectedDeliveryDate}` : null,
      ].filter(Boolean).join(" · "));
  }
  for (const r of receipts) add(r.id, r.label ?? "Received", r.at, r.actor, r.itemId, r.note);
  for (const a of audits) {
    const action = String(a.action ?? "").toLowerCase();
    const status = String(a.newValues?.status ?? "").toLowerCase();
    // Do not mistake a generic edit of an already-completed record for completion.
    const changedStatus = status && a.oldValues?.status !== undefined && a.oldValues.status !== status;
    const label = labels[action] ?? (changedStatus ? labels[status] : undefined);
    if (label) add(`audit-${a.id}`, label, a.createdAt, a.userName, null, a.reason);
  }
  for (const item of items) {
    const has = (word: string) => events.some(e => e.itemId === item.id && e.label.startsWith(word));
    if (!has("Ordered") && (item.orderPlacedAt || item.orderedQty || item.purchaseStatus === "ORDERED"))
      add(`order-${item.id}`, "Ordered", item.orderPlacedAt, item.orderedByName, item.id);
    if (!has("Purchased") && (Number(item.totalPurchasedQty ?? item.qtyPurchased) > 0 || item.purchaseStatus === "PURCHASED"))
      add(`purchase-${item.id}`, "Purchased", null, item.purchasedBy, item.id);
    if (!has("Received") && !has("Handed") && Number(item.totalAcceptedQty ?? item.deliveredQty) > 0)
      add(`received-${item.id}`, "Received", null, null, item.id);
    if (!has("Cancelled") && (item.cancelledAt || item.purchaseStatus === "CANCELLED"))
      add(`cancelled-${item.id}`, "Cancelled", item.cancelledAt, item.cancelledBy, item.id);
  }
  if (indent.orderedAt && !events.some(e => e.label === "Ordered" && e.itemId == null))
    add("ordered", "Ordered", indent.orderedAt, null);
  for (const status of ["completed", "cancelled", "reopened"]) {
    if (indent.status === status && !events.some(e => e.label === labels[status] && e.itemId == null))
      add(status, labels[status], null, null);
  }
  // Preserve repeated actions; only remove exact duplicate projections.
  const seen = new Set<string>();
  return events.filter(e => {
    // A missing header timestamp is not another occurrence when history
    // recovers that event. Retain real, repeated dated actions.
    if (!e.at && events.some(other => other.at && other.label === e.label && other.itemId === e.itemId
      && (!e.actor || !other.actor || e.actor === other.actor))) return false;
    const key = JSON.stringify([e.label, e.at, e.actor, e.itemId, e.note]);
    if (seen.has(key)) return false;
    seen.add(key); return true;
  }).sort((a, b) => a.at && b.at ? a.at.localeCompare(b.at) : a.at ? -1 : b.at ? 1 : 0);
}
